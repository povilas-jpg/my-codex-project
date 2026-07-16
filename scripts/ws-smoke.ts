/**
 * Server smoke test without a browser: boots the server with bash standing in
 * for claude, then drives the WS protocol end-to-end.
 */
import { spawn } from "node:child_process";
import WebSocket from "ws";

const PORT = 7455;
const DIR = process.env.SMOKE_DIR ?? "/tmp";

const server = spawn(
  "npx",
  ["tsx", "server/src/index.ts", "--port", String(PORT), "--dir", DIR, "--claude-bin", "bash", "--no-hooks"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => process.stdout.write(`[server!] ${d}`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: Record<string, boolean> = {};

(async () => {
  await sleep(2500);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const received: any[] = [];
  let ptyText = "";
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    received.push(msg);
    if (msg.type === "pty_output" || msg.type === "replay") {
      ptyText += Buffer.from(msg.data, "base64").toString("utf8");
    }
  });
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });

  await sleep(800);
  results["hello received"] = received.some((m) => m.type === "hello");
  results["replay received"] = received.some((m) => m.type === "replay");

  ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
  ws.send(JSON.stringify({ type: "pty_input", data: "echo SMOKE_$((40+2))\r" }));
  await sleep(1200);
  results["pty roundtrip (echo)"] = ptyText.includes("SMOKE_42");

  ws.send(JSON.stringify({ type: "type_text", text: "echo TYPED_OK", submit: true }));
  await sleep(1000);
  results["type_text works"] = ptyText.includes("TYPED_OK");

  ws.send(JSON.stringify({ type: "list_chats" }));
  await sleep(600);
  const chatsMsg = received.find((m) => m.type === "chats");
  results["list_chats responds"] = Array.isArray(chatsMsg?.chats);

  // Reconnect: fresh socket must get a replay containing earlier output.
  const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  let replay2 = "";
  ws2.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "replay") replay2 += Buffer.from(msg.data, "base64").toString("utf8");
  });
  await sleep(1200);
  results["reconnect replay has history"] = replay2.includes("SMOKE_42") && replay2.includes("TYPED_OK");

  // new_session restarts the PTY: prior output must be gone from replay.
  ws.send(JSON.stringify({ type: "new_session" }));
  await sleep(1500);
  const ws3 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  let replay3: string | null = null;
  ws3.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "replay" && replay3 === null) replay3 = Buffer.from(msg.data, "base64").toString("utf8");
  });
  await sleep(1200);
  results["new_session clears replay"] = replay3 !== null && !(replay3 ?? "").includes("SMOKE_42");

  console.log("\n===== RESULTS =====");
  let ok = true;
  for (const [k, v] of Object.entries(results)) {
    console.log(`${v ? "PASS" : "FAIL"}  ${k}`);
    ok &&= v;
  }
  server.kill();
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  server.kill();
  process.exit(1);
});

/**
 * End-to-end smoke test for the glasses (text-mode) API.
 *
 * Boots the real server against a stub claude that writes a real transcript,
 * then drives one full turn the way the G2 bridge does: POST a prompt, watch
 * the SSE stream, and check the reply comes back as clean HUD pages.
 *
 *   npx tsx scripts/text-api-smoke.ts
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeProjectDir } from "../server/src/session-store.js";

/** Ask the OS for a port nobody else holds, so a stale run can't be mistaken
 * for this one (a busy port makes the new server die and every request hit
 * the old process instead). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "claude-pad-smoke-"));
const projectDir = join(tmp, "project");
const claudeHome = join(tmp, "claude-home");
const stubPath = join(tmp, "claude-stub.py");
const port = await freePort();
const sessionId = "11111111-2222-3333-4444-555555555555";
const base = `http://127.0.0.1:${port}`;

mkdirSync(projectDir, { recursive: true });
const sessionsDir = join(claudeHome, "projects", encodeProjectDir(projectDir));
mkdirSync(sessionsDir, { recursive: true });
const transcript = join(sessionsDir, `${sessionId}.jsonl`);
writeFileSync(transcript, "");

/**
 * Stands in for claude: echoes keystrokes, and when a line is submitted it
 * appends an assistant message to the transcript exactly as claude would.
 */
const STUB = `#!/usr/bin/env python3
import json, os, sys, tty, uuid

if "--version" in sys.argv:
    print("9.9.9-stub (Claude Code)")
    sys.exit(0)

TRANSCRIPT = ${JSON.stringify(transcript)}
REPLY = (
    "## Done\\n\\n"
    "I changed **three** files and the tests pass. See \`server/src/text-api.ts\`.\\n\\n"
    "\`\`\`bash\\n" + "\\n".join("line %d" % i for i in range(20)) + "\\n\`\`\`\\n"
)

tty.setraw(0)
buf = ""
while True:
    b = os.read(0, 1024)
    if not b:
        break
    text = b.decode("utf8", "replace")
    os.write(1, text.encode())
    buf += text
    if "\\r" in buf:
        buf = ""
        with open(TRANSCRIPT, "a") as f:
            f.write(json.dumps({
                "type": "assistant",
                "uuid": str(uuid.uuid4()),
                "sessionId": ${JSON.stringify(sessionId)},
                "message": {"role": "assistant", "content": [{"type": "text", "text": REPLY}]},
            }) + "\\n")
`;
writeFileSync(stubPath, STUB);
chmodSync(stubPath, 0o755);

const server = spawn(
  join(pkgRoot, "node_modules", ".bin", "tsx"),
  [
    join(pkgRoot, "server", "src", "index.ts"),
    "--dir",
    projectDir,
    "--port",
    String(port),
    "--claude-bin",
    stubPath,
    "--no-hooks", // the stub can't fire them; we POST them by hand below
  ],
  { cwd: pkgRoot, env: { ...process.env, CLAUDE_CONFIG_DIR: claudeHome }, stdio: "inherit" },
);

let serverExited: number | null = null;
server.on("exit", (code) => {
  serverExited = code ?? -1;
});

const failures: string[] = [];
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra && !ok ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(label);
};

const post = (path: string, body: unknown) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    if (serverExited !== null) throw new Error(`server exited early (code ${serverExited})`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server never became healthy");
}

async function main(): Promise<void> {
  await waitForServer();
  console.log("\nglasses text API smoke\n");

  // Tell the pad which conversation is live, as the SessionStart hook would.
  await post(`/api/hook/SessionStart`, { session_id: sessionId });

  const events: Record<string, unknown>[] = [];
  const sse = await fetch(`${base}/api/events?columns=40&lines=5`);
  check("SSE stream opens", sse.ok && !!sse.body);
  const reader = sse.body!.getReader();

  // Drain the stream continuously in the background. Racing each individual
  // read() against a timeout would orphan the pending read and silently drop
  // whatever chunk it later resolved with.
  void (async () => {
    const decoder = new TextDecoder();
    let buffered = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const parts = buffered.split("\n\n");
        buffered = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch {
      // stream cancelled at the end of the run
    }
  })();

  const pump = async (until: number, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs;
    while (events.length < until && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  await pump(1);
  check("initial state event", events[0]?.type === "state", JSON.stringify(events[0]));

  const promptRes = await post("/api/prompt", { text: "what did you change?" });
  const promptBody = (await promptRes.json()) as { turnId?: string };
  check("prompt accepted", promptRes.ok && typeof promptBody.turnId === "string");

  // The stub writes the transcript; the tailer polls it.
  await pump(2);
  check("stub wrote the transcript", statSync(transcript).size > 0);
  const reply = events.find((e) => e.type === "reply") as
    | { plain: string; pages: string[]; summary: string }
    | undefined;
  check("reply arrives on the stream", !!reply);
  if (reply) {
    check("markdown is stripped", !reply.plain.includes("**") && !reply.plain.includes("##"));
    check("long code block collapsed", reply.plain.includes("[code: 20 lines]"));
    check("summary is a single short line", reply.summary === "Done");
    check(
      "pages fit a 5x40 display",
      reply.pages.every(
        (p) => p.split("\n").length <= 5 && p.split("\n").every((l) => l.length <= 40),
      ),
    );
    console.log("\n  first page as the wearer sees it:");
    console.log(
      (reply.pages[0] ?? "")
        .split("\n")
        .map((l) => `    │${l.padEnd(40)}│`)
        .join("\n"),
    );
    console.log(`    (${reply.pages.length} page${reply.pages.length === 1 ? "" : "s"} total)\n`);
  }

  // Stop hook closes the turn.
  await post(`/api/hook/Stop`, { session_id: sessionId });
  await pump(events.length + 1);
  check(
    "turn_end after the Stop hook",
    events.some((e) => e.type === "turn_end"),
  );

  const state = (await (await fetch(`${base}/api/state?columns=40&lines=5`)).json()) as {
    turn?: { status: string };
    reply?: { pages: string[] };
  };
  check("state reports the finished turn", state.turn?.status === "done");
  check("state carries the reply pages", (state.reply?.pages.length ?? 0) > 0);

  await reader.cancel().catch(() => {});
}

main()
  .then(() => {
    console.log(failures.length ? `\n${failures.length} check(s) failed\n` : "\nall checks passed\n");
    server.kill();
    rmSync(tmp, { recursive: true, force: true });
    process.exit(failures.length ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    server.kill();
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  });

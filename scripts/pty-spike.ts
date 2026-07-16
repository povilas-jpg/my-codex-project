/**
 * Stage-1 spike: prove that the escape sequences claude-pad will send are
 * interpreted correctly by the real `claude` TUI running under node-pty.
 * Sends NO prompts to the model (nothing is submitted with Enter after text).
 *
 * Usage: tsx scripts/pty-spike.ts [cwd-for-claude]
 */
import { spawn } from "node-pty";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYS = {
  enter: "\r",
  escape: "\x1b",
  tab: "\t",
  shiftTab: "\x1b[Z",
  up: "\x1b[A",
  down: "\x1b[B",
  ctrlC: "\x03",
} as const;

const stripAnsi = (s: string) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "") // CSI
    .replace(/\x1b[@-_]/g, ""); // other ESC

const cwd = process.argv[2] ?? mkdtempSync(join(tmpdir(), "claude-pad-spike-"));
const env = { ...process.env } as Record<string, string>;
delete env.CLAUDECODE;
delete env.CLAUDE_CODE_ENTRYPOINT;
delete env.CLAUDE_CODE_SSE_PORT;

console.log(`[spike] spawning claude in ${cwd}`);
const pty = spawn("claude", [], {
  name: "xterm-256color",
  cols: 110,
  rows: 32,
  cwd,
  env,
});

let buf = "";
let all = "";
pty.onData((d) => {
  buf += d;
  all += d;
});
pty.onExit(({ exitCode }) => console.log(`[spike] claude exited code=${exitCode}`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const snapshot = (label: string) => {
  const text = stripAnsi(buf);
  buf = "";
  console.log(`\n===== ${label} =====`);
  console.log(text.split("\n").filter((l) => l.trim()).slice(-24).join("\n"));
  return text;
};

const results: Record<string, boolean> = {};

(async () => {
  await sleep(5000);
  const boot = snapshot("boot screen");
  results["tui rendered"] = /claude|welcome|trust|login|sign in/i.test(boot);

  // If a trust/onboarding dialog is showing, Enter accepts the highlighted default.
  if (/trust|yes, proceed|enter to confirm/i.test(boot)) {
    console.log("[spike] dialog detected -> sending Enter");
    pty.write(KEYS.enter);
    await sleep(2500);
    snapshot("after Enter on dialog");
  }

  pty.write("hello pad");
  await sleep(1200);
  const typed = snapshot("after typing 'hello pad'");
  results["typed text echoes in input box"] = typed.includes("hello pad");

  pty.write(KEYS.escape); // clear input (esc)
  await sleep(800);

  pty.write(KEYS.shiftTab);
  await sleep(1200);
  const mode1 = snapshot("after Shift+Tab (1)");
  pty.write(KEYS.shiftTab);
  await sleep(1200);
  const mode2 = snapshot("after Shift+Tab (2)");
  results["Shift+Tab cycles modes"] = /accept edits|auto-accept|plan mode/i.test(mode1 + mode2);

  pty.write(KEYS.shiftTab); // back to default
  await sleep(800);
  buf = "";

  pty.write(KEYS.tab);
  await sleep(1200);
  const think = snapshot("after Tab (thinking toggle)");
  results["Tab toggles thinking"] = /thinking|think/i.test(think);

  pty.write("/model");
  await sleep(1500);
  const modelMenu = snapshot("after typing /model");
  results["slash command autocomplete shows"] = /model/i.test(modelMenu);
  pty.write(KEYS.escape);
  await sleep(500);
  pty.write(KEYS.escape);
  await sleep(500);

  console.log("\n===== RESULTS =====");
  for (const [k, v] of Object.entries(results)) console.log(`${v ? "PASS" : "FAIL"}  ${k}`);

  writeFileSync("/tmp/claude-0/-home-user-my-codex-project/a1e3d40b-7bd6-5753-8aed-c1b7041d0af7/scratchpad/spike-raw.log", all);
  pty.kill();
  await sleep(300);
  process.exit(0);
})();

/**
 * Stage-1 spike (part 2): verify arrow/Enter/Esc key handling against the
 * claude onboarding menus (same ink input layer as the main TUI).
 */
import { spawn } from "node-pty";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stripAnsi = (s: string) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "");
const squash = (s: string) => s.replace(/\s+/g, " ");

const cwd = mkdtempSync(join(tmpdir(), "claude-pad-spike2-"));
const env = { ...process.env } as Record<string, string>;
delete env.CLAUDECODE;
delete env.CLAUDE_CODE_ENTRYPOINT;
delete env.CLAUDE_CODE_SSE_PORT;

const pty = spawn("claude", [], { name: "xterm-256color", cols: 110, rows: 32, cwd, env });
let buf = "";
pty.onData((d) => (buf += d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const snap = (label: string) => {
  const t = stripAnsi(buf);
  buf = "";
  console.log(`\n===== ${label} =====`);
  console.log(t.split("\n").filter((l) => l.trim()).slice(-20).join("\n"));
  return squash(t);
};

(async () => {
  await sleep(5000);
  const boot = snap("boot");
  const onTheme = /Choose the text style|text style/i.test(boot);
  console.log(`[spike2] theme screen: ${onTheme}`);

  pty.write("\x1b[B"); // Down arrow
  await sleep(1000);
  const afterDown = snap("after Down arrow");
  // selection marker ❯ should have moved to option 3 (Light mode)
  console.log(`[spike2] arrow moved selection: ${/❯\s*3/.test(afterDown)}`);

  pty.write("\x1b[A"); // Up arrow back to 2 (Dark mode)
  await sleep(1000);
  const afterUp = snap("after Up arrow");
  console.log(`[spike2] arrow moved selection back: ${/❯\s*2/.test(afterUp)}`);

  pty.write("\r"); // Enter selects theme -> next onboarding screen
  await sleep(3000);
  const afterEnter = snap("after Enter (theme chosen)");
  console.log(`[spike2] advanced past theme: ${!/Choose the text style/i.test(afterEnter) && afterEnter.length > 0}`);

  // whatever screen we're on now (login / trust), try Esc then capture
  pty.write("\x1b");
  await sleep(1500);
  snap("after Esc");

  pty.kill();
  await sleep(300);
  process.exit(0);
})();

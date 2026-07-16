/**
 * Boots claude-pad for Playwright against a stub claude + fixture chats.
 * The stub echoes every key it receives in visible form (<ESC>[Z, <CR>, …)
 * so tests can assert exactly which sequences reached the PTY.
 */
import { chmodSync, existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeProjectDir } from "../server/src/session-store.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(pkgRoot, "e2e", ".tmp");
const projectDir = join(tmp, "project");
const claudeHome = join(tmp, "claude-home");
const stubPath = join(tmp, "claude-stub.py");

if (!existsSync(join(pkgRoot, "web", "dist", "index.html"))) {
  console.error("web/dist missing — run `npm run build:web` before e2e");
  process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(projectDir, { recursive: true });

const STUB = `#!/usr/bin/env python3
import os, sys, tty

if "--version" in sys.argv:
    print("9.9.9-stub (Claude Code)")
    sys.exit(0)

print("STUB_CLAUDE argv=%s" % sys.argv[1:], flush=True)
print("STUB_CWD=%s" % os.getcwd(), flush=True)
tty.setraw(0)
while True:
    b = os.read(0, 1024)
    if not b:
        break
    text = b.decode("utf8", "replace")
    vis = (
        text.replace("\\x1b", "<ESC>")
        .replace("\\r", "<CR>\\r\\n")
        .replace("\\t", "<TAB>")
    )
    os.write(1, vis.encode())
`;
writeFileSync(stubPath, STUB);
chmodSync(stubPath, 0o755);

// Fixture chat transcripts for the chat browser.
const sessionsDir = join(claudeHome, "projects", encodeProjectDir(projectDir));
mkdirSync(sessionsDir, { recursive: true });
const user = (content: string) =>
  `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`;
const assistant = (text: string) =>
  `${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } })}\n`;

const chatA = join(sessionsDir, "aaaa1111-2222-3333-4444-555566667777.jsonl");
const chatB = join(sessionsDir, "bbbb1111-2222-3333-4444-555566667777.jsonl");
writeFileSync(chatA, user("Fix the login bug") + assistant("Looking at auth.ts now."));
writeFileSync(chatB, user("Add dark mode toggle") + assistant("Sure — starting with the theme store."));
const now = Date.now() / 1000;
utimesSync(chatA, now - 3600, now - 3600); // older
utimesSync(chatB, now - 60, now - 60); // newer

process.env.CLAUDE_CONFIG_DIR = claudeHome;
process.argv = [
  process.argv[0]!,
  "claude-pad",
  "--dir",
  projectDir,
  "--port",
  "7466",
  "--claude-bin",
  stubPath,
];

await import("../server/src/index.js");

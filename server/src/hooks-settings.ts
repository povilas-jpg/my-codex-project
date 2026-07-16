import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Generates a settings file passed to `claude --settings <file>` that wires
 * lifecycle hooks to the pad server. Each hook pipes its stdin JSON payload
 * to the local hook receiver; --max-time keeps a dead pad from ever stalling
 * claude, and the trailing `|| true` keeps hooks non-blocking on failure.
 *
 * Using --settings means the user's own settings files are left untouched.
 */

const TOOL_EVENTS = ["PreToolUse", "PostToolUse"] as const;
const PLAIN_EVENTS = ["SessionStart", "UserPromptSubmit", "Notification", "Stop", "SessionEnd"] as const;

export function buildHookSettings(port: number): Record<string, unknown> {
  const cmd = (event: string) =>
    `curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- ` +
    `http://127.0.0.1:${port}/api/hook/${event} >/dev/null 2>&1 || true`;

  const hooks: Record<string, unknown> = {};
  for (const event of PLAIN_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command: cmd(event) }] }];
  }
  for (const event of TOOL_EVENTS) {
    hooks[event] = [{ matcher: "*", hooks: [{ type: "command", command: cmd(event) }] }];
  }
  return { hooks };
}

/** Writes the settings JSON to a temp file and returns its path. */
export function writeHookSettingsFile(port: number): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-pad-"));
  const path = join(dir, "hook-settings.json");
  writeFileSync(path, JSON.stringify(buildHookSettings(port), null, 2));
  return path;
}

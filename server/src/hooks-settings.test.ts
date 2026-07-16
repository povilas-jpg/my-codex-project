import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHookSettings, writeHookSettingsFile } from "./hooks-settings.js";

interface HookGroup {
  matcher?: string;
  hooks: { type: string; command: string }[];
}

describe("hooks settings", () => {
  it("wires every lifecycle event to the local receiver", () => {
    const settings = buildHookSettings(7433) as { hooks: Record<string, HookGroup[]> };
    for (const event of ["SessionStart", "UserPromptSubmit", "Notification", "Stop", "SessionEnd", "PreToolUse", "PostToolUse"]) {
      const groups = settings.hooks[event];
      expect(groups, event).toBeDefined();
      const hook = groups![0]!.hooks[0]!;
      expect(hook.type).toBe("command");
      expect(hook.command).toContain(`http://127.0.0.1:7433/api/hook/${event}`);
      expect(hook.command).toContain("--max-time 2"); // never stall claude
      expect(hook.command).toContain("|| true"); // never fail the hook
    }
  });

  it("adds a wildcard matcher only for tool events", () => {
    const settings = buildHookSettings(1234) as { hooks: Record<string, HookGroup[]> };
    expect(settings.hooks.PreToolUse![0]!.matcher).toBe("*");
    expect(settings.hooks.PostToolUse![0]!.matcher).toBe("*");
    expect(settings.hooks.Stop![0]!.matcher).toBeUndefined();
  });

  it("writes a parseable settings file", () => {
    const path = writeHookSettingsFile(9999);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toContain(":9999/api/hook/SessionStart");
  });
});

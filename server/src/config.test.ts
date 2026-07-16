import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("returns defaults with no file", () => {
    expect(loadConfig()).toEqual({ autoSubmitVoice: true });
  });

  it("loads overrides", () => {
    const p = join(mkdtempSync(join(tmpdir(), "pad-cfg-")), "claudepad.config.json");
    writeFileSync(p, JSON.stringify({ autoSubmitVoice: false }));
    expect(loadConfig(p)).toEqual({ autoSubmitVoice: false });
  });

  it("throws a useful error on malformed config", () => {
    const p = join(mkdtempSync(join(tmpdir(), "pad-cfg-")), "claudepad.config.json");
    writeFileSync(p, "{nope");
    expect(() => loadConfig(p)).toThrow(/Failed to load config/);
  });
});

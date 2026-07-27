import { describe, expect, it } from "vitest";
import { isPublicHost, loadBridgeConfig } from "./config.js";

describe("loadBridgeConfig", () => {
  it("defaults to loopback with no token required", () => {
    const config = loadBridgeConfig({});
    expect(config.padUrl).toBe("http://127.0.0.1:7433");
    expect(config.padToken).toBeUndefined();
  });

  it("refuses a non-loopback pad url without a token", () => {
    expect(() => loadBridgeConfig({ CLAUDE_PAD_URL: "http://pi.tail1234.ts.net:7433" })).toThrow(
      /CLAUDE_PAD_TOKEN is required/,
    );
  });

  it("accepts a non-loopback pad url with a token", () => {
    const config = loadBridgeConfig({
      CLAUDE_PAD_URL: "http://pi.tail1234.ts.net:7433",
      CLAUDE_PAD_TOKEN: "abc",
    });
    expect(config.padToken).toBe("abc");
  });

  it("defaults to the G2 display geometry", () => {
    const config = loadBridgeConfig({});
    expect(config).toMatchObject({ columns: 40, lines: 5 });
  });

  it("allows the geometry to be overridden", () => {
    expect(loadBridgeConfig({ GLASSES_COLUMNS: "32", GLASSES_LINES: "4" })).toMatchObject({
      columns: 32,
      lines: 4,
    });
  });

  it("ignores nonsense geometry rather than rendering nothing", () => {
    expect(loadBridgeConfig({ GLASSES_COLUMNS: "0", GLASSES_LINES: "abc" })).toMatchObject({
      columns: 40,
      lines: 5,
    });
  });

  it("keeps push-to-talk on unless explicitly disabled", () => {
    expect(loadBridgeConfig({}).pushToTalk).toBe(true);
    expect(loadBridgeConfig({ GLASSES_PUSH_TO_TALK: "true" }).pushToTalk).toBe(true);
    expect(loadBridgeConfig({ GLASSES_PUSH_TO_TALK: "yes" }).pushToTalk).toBe(true);
    expect(loadBridgeConfig({ GLASSES_PUSH_TO_TALK: "false" }).pushToTalk).toBe(false);
  });
});

describe("isPublicHost", () => {
  it("treats loopback as private", () => {
    expect(isPublicHost("http://localhost:7433")).toBe(false);
    expect(isPublicHost("http://127.0.0.1:7433")).toBe(false);
  });

  it("treats everything else, including tailnet names, as needing a token", () => {
    expect(isPublicHost("http://pi.tail1234.ts.net:7433")).toBe(true);
    expect(isPublicHost("http://192.168.1.10:7433")).toBe(true);
  });

  it("treats an unparseable url as risky", () => {
    expect(isPublicHost("not a url")).toBe(true);
  });
});

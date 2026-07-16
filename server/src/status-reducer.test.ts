import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusReducer } from "./status-reducer.js";

describe("StatusReducer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts in starting and follows the hook lifecycle", () => {
    const r = new StatusReducer();
    expect(r.snapshot.status).toBe("starting");

    r.onHook("SessionStart");
    expect(r.snapshot.status).toBe("idle");

    r.onHook("UserPromptSubmit");
    expect(r.snapshot.status).toBe("working");

    r.onHook("PreToolUse", { tool_name: "Bash" });
    expect(r.snapshot).toEqual({ status: "tool", detail: "Bash" });

    r.onHook("PostToolUse");
    expect(r.snapshot.status).toBe("working");

    r.onHook("Notification", { message: "Claude needs your permission to use Bash" });
    expect(r.snapshot.status).toBe("waiting");
    expect(r.snapshot.detail).toContain("permission");

    r.onHook("Stop");
    expect(r.snapshot.status).toBe("done");
  });

  it("settles done back to idle after the blink window", () => {
    const r = new StatusReducer();
    r.onHook("SessionStart");
    r.onHook("Stop");
    expect(r.snapshot.status).toBe("done");
    vi.advanceTimersByTime(4100);
    expect(r.snapshot.status).toBe("idle");
  });

  it("does not reset to idle if a new turn started during the blink", () => {
    const r = new StatusReducer();
    r.onHook("Stop");
    r.onHook("UserPromptSubmit");
    vi.advanceTimersByTime(5000);
    expect(r.snapshot.status).toBe("working");
  });

  it("pty heuristic only lifts idle to working", () => {
    const r = new StatusReducer();
    r.onHook("SessionStart");
    r.onPtyData("✻ Cogitating… (esc to interrupt)");
    expect(r.snapshot.status).toBe("working");

    // ...but never masks waiting.
    r.onHook("Notification", { message: "permission?" });
    r.onPtyData("✻ still going (esc to interrupt)");
    expect(r.snapshot.status).toBe("waiting");
  });

  it("tracks pty lifecycle", () => {
    const r = new StatusReducer();
    r.onPtySpawned();
    expect(r.snapshot.status).toBe("starting");
    r.onPtyExit(0);
    expect(r.snapshot.status).toBe("exited");
  });

  it("emits change events only on actual changes", () => {
    const r = new StatusReducer();
    const seen: string[] = [];
    r.on("change", (s) => seen.push(s.status));
    r.onHook("SessionStart");
    r.onHook("SessionStart");
    r.onHook("UserPromptSubmit");
    expect(seen).toEqual(["idle", "working"]);
  });
});

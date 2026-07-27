import { describe, expect, it, vi } from "vitest";
import { attachMiniapp, type MiniappRuntime } from "./attach.js";

/** A miniapp runtime that records what reached the lens. */
function fakeRuntime() {
  const shown: string[] = [];
  const dashboard: [string, string][] = [];
  const handlers: {
    transcription?: (d: { text: string; isFinal: boolean }) => void;
    tap?: () => void;
    longPress?: () => void;
    swipe?: (d: "forward" | "backward") => void;
  } = {};

  const runtime: MiniappRuntime = {
    transcription: {
      subscribe(handler) {
        handlers.transcription = handler;
        return undefined;
      },
    },
    display: {
      showTextWall(text) {
        shown.push(text);
        return undefined;
      },
      showDashboardCard(left, right) {
        dashboard.push([left, right]);
        return undefined;
      },
    },
    input: {
      onTap(handler) {
        handlers.tap = handler;
        return undefined;
      },
      onLongPress(handler) {
        handlers.longPress = handler;
        return undefined;
      },
      onSwipe(handler) {
        handlers.swipe = handler;
        return undefined;
      },
    },
    log: () => {},
  };

  return { runtime, shown, dashboard, handlers };
}

describe("attachMiniapp", () => {
  it("shows a ready screen as soon as it attaches", () => {
    const { runtime, shown } = fakeRuntime();
    const app = attachMiniapp(runtime, { padUrl: "http://localhost:7433" });
    expect(shown.at(-1)).toContain("ready");
    app.stop();
  });

  it("gates speech behind a tap by default", async () => {
    const { runtime, handlers } = fakeRuntime();
    const app = attachMiniapp(runtime, { padUrl: "http://localhost:7433" });
    const prompt = vi.spyOn(app.client, "prompt").mockResolvedValue({
      turnId: "t",
      prompt: "x",
      submitted: true,
    });

    handlers.transcription?.({ text: "ambient chatter", isFinal: true });
    await Promise.resolve();
    expect(prompt).not.toHaveBeenCalled();

    handlers.tap?.(); // arm the mic
    handlers.transcription?.({ text: "run the tests", isFinal: true });
    await Promise.resolve();
    expect(prompt).toHaveBeenCalledWith("run the tests");
    app.stop();
  });

  it("forwards speech without a tap when push-to-talk is off", async () => {
    const { runtime, handlers } = fakeRuntime();
    const app = attachMiniapp(runtime, {
      padUrl: "http://localhost:7433",
      pushToTalk: false,
    });
    const prompt = vi.spyOn(app.client, "prompt").mockResolvedValue({
      turnId: "t",
      prompt: "x",
      submitted: true,
    });
    handlers.transcription?.({ text: "go", isFinal: true });
    await Promise.resolve();
    expect(prompt).toHaveBeenCalledWith("go");
    app.stop();
  });

  it("pages a long reply with swipes", () => {
    const { runtime, shown, handlers } = fakeRuntime();
    const app = attachMiniapp(runtime, { padUrl: "http://localhost:7433" });
    app.session.handleEvent({
      type: "reply",
      turnId: "t",
      text: "",
      plain: "",
      summary: "",
      pages: ["page one", "page two"],
      at: 0,
    });
    expect(shown.at(-1)).toBe("page one");
    handlers.swipe?.("forward");
    expect(shown.at(-1)).toBe("page two");
    handlers.swipe?.("backward");
    expect(shown.at(-1)).toBe("page one");
    app.stop();
  });

  it("approves a permission prompt on tap and rejects on long press", async () => {
    const { runtime, handlers } = fakeRuntime();
    const app = attachMiniapp(runtime, { padUrl: "http://localhost:7433" });
    const key = vi.spyOn(app.client, "key").mockResolvedValue({ ok: true });

    app.session.handleEvent({ type: "needs_input", detail: "Allow Bash?" });
    handlers.tap?.();
    await Promise.resolve();
    expect(key).toHaveBeenCalledWith("enter");

    app.session.handleEvent({ type: "needs_input", detail: "Allow Bash?" });
    handlers.longPress?.();
    await Promise.resolve();
    expect(key).toHaveBeenCalledWith("escape");
    app.stop();
  });

  it("works on a runtime that exposes no input hooks at all", () => {
    const { runtime } = fakeRuntime();
    const bare: MiniappRuntime = {
      transcription: runtime.transcription,
      display: { showTextWall: runtime.display.showTextWall },
    };
    expect(() =>
      attachMiniapp(bare, { padUrl: "http://localhost:7433" }).stop(),
    ).not.toThrow();
  });

  it("passes the pad url and token through to the client", async () => {
    const { runtime } = fakeRuntime();
    const calls: [string, RequestInit | undefined][] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push([String(url), init]);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    try {
      const app = attachMiniapp(runtime, {
        padUrl: "http://pi.tail1234.ts.net:7433",
        padToken: "tok",
      });
      await app.client.prompt("p");
      const promptCall = calls.find(([url]) => url.endsWith("/api/prompt"));
      expect(promptCall).toBeDefined();
      expect((promptCall![1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      app.stop();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import type { KeyName } from "../../shared/text-protocol.js";
import { GlassesSession, type Display, type PadCommands } from "./glasses-session.js";

class FakeDisplay implements Display {
  shown: string[] = [];
  statuses: [string, string][] = [];
  text(body: string): void {
    this.shown.push(body);
  }
  status(left: string, right: string): void {
    this.statuses.push([left, right]);
  }
  get last(): string {
    return this.shown.at(-1) ?? "";
  }
}

class FakePad implements PadCommands {
  prompts: string[] = [];
  keys: KeyName[] = [];
  newSessions = 0;
  failWith: Error | null = null;
  async prompt(text: string): Promise<unknown> {
    if (this.failWith) throw this.failWith;
    this.prompts.push(text);
    return { turnId: "t1" };
  }
  async key(key: KeyName): Promise<unknown> {
    if (this.failWith) throw this.failWith;
    this.keys.push(key);
    return { ok: true };
  }
  async newSession(): Promise<unknown> {
    this.newSessions++;
    return { ok: true };
  }
}

describe("GlassesSession", () => {
  let display: FakeDisplay;
  let pad: FakePad;
  let session: GlassesSession;

  beforeEach(() => {
    display = new FakeDisplay();
    pad = new FakePad();
    session = new GlassesSession({ client: pad, display });
  });

  describe("push-to-talk gating", () => {
    it("ignores speech when the mic was never armed", async () => {
      await session.onTranscript("delete everything", true);
      expect(pad.prompts).toEqual([]);
    });

    it("sends speech once the mic is armed", async () => {
      session.armMic();
      await session.onTranscript("what changed?", true);
      expect(pad.prompts).toEqual(["what changed?"]);
    });

    it("disarms after a final transcript so one tap sends one prompt", async () => {
      session.armMic();
      await session.onTranscript("first", true);
      await session.onTranscript("overheard chatter", true);
      expect(pad.prompts).toEqual(["first"]);
    });

    it("echoes interim results without sending them", async () => {
      session.armMic();
      await session.onTranscript("what cha", false);
      expect(pad.prompts).toEqual([]);
      expect(display.last).toBe("what cha");
    });

    it("ignores blank speech", async () => {
      session.armMic();
      await session.onTranscript("   ", true);
      expect(pad.prompts).toEqual([]);
    });

    it("forwards speech unarmed when push-to-talk is disabled", async () => {
      const open = new GlassesSession({ client: pad, display, pushToTalk: false });
      await open.onTranscript("hello", true);
      expect(pad.prompts).toEqual(["hello"]);
    });

    it("will not start a prompt while a permission answer is owed", async () => {
      session.handleEvent({ type: "needs_input", detail: "Allow Bash?" });
      session.armMic();
      expect(session.listening).toBe(false);
      await session.onTranscript("yes go ahead", true);
      expect(pad.prompts).toEqual([]);
    });

    it("shows an error and recovers when the pad is unreachable", async () => {
      pad.failWith = new Error("connection refused");
      session.armMic();
      await session.onTranscript("hi", true);
      expect(display.last).toContain("connection refused");
      expect(session.currentPhase).toBe("idle");
    });
  });

  describe("replies and paging", () => {
    const reply = (pages: string[]) =>
      session.handleEvent({
        type: "reply",
        turnId: "t1",
        text: "raw",
        plain: "plain",
        summary: "sum",
        pages,
        at: 0,
      });

    it("shows the first page immediately", () => {
      reply(["page one", "page two", "page three"]);
      expect(session.currentPage).toBe("page one");
      expect(display.last).toBe("page one");
    });

    it("pages forward and back on tap", async () => {
      reply(["one", "two"]);
      await session.tap();
      expect(session.currentPage).toBe("two");
      session.prevPage();
      expect(session.currentPage).toBe("one");
    });

    it("does not page past the ends", async () => {
      reply(["only"]);
      await session.tap();
      expect(session.currentPage).toBe("only");
      session.prevPage();
      expect(session.currentPage).toBe("only");
    });

    it("shows a page counter only when there is more than one page", () => {
      reply(["a", "b"]);
      expect(display.statuses.at(-1)?.[1]).toContain("1/2");
      display.statuses.length = 0;
      reply(["single"]);
      expect(display.statuses.at(-1)?.[1]).not.toContain("/");
    });

    it("falls back to the summary when there are no pages", () => {
      session.handleEvent({
        type: "reply",
        turnId: null,
        text: "",
        plain: "",
        summary: "short answer",
        pages: [],
        at: 0,
      });
      expect(session.currentPage).toBe("short answer");
    });

    it("keeps the reply on screen when the turn ends", () => {
      reply(["the answer"]);
      session.handleEvent({ type: "turn_end", turnId: "t1", status: "done" });
      expect(display.last).toBe("the answer");
      expect(session.currentPhase).toBe("reading");
    });
  });

  describe("permission prompts", () => {
    it("approves with enter on tap", async () => {
      session.handleEvent({ type: "needs_input", detail: "Allow Bash: rm -rf?" });
      expect(display.last).toContain("rm -rf");
      await session.tap();
      expect(pad.keys).toEqual(["enter"]);
    });

    it("rejects with escape on hold", async () => {
      session.handleEvent({ type: "needs_input", detail: "Allow Bash?" });
      await session.hold();
      expect(pad.keys).toEqual(["escape"]);
    });

    it("shows the approve/reject hint", () => {
      session.handleEvent({ type: "needs_input" });
      expect(display.statuses.at(-1)?.[1]).toContain("tap = approve");
    });
  });

  describe("progress", () => {
    it("narrates the running tool while working", () => {
      session.handleEvent({ type: "state", status: "working", session: {} as never });
      session.handleEvent({ type: "tool", name: "Bash", target: "npm test", at: 0 });
      expect(display.statuses.at(-1)?.[1]).toBe("Bash: npm test");
    });

    it("does not overwrite a reply with tool chatter", () => {
      session.handleEvent({
        type: "reply",
        turnId: "t",
        text: "",
        plain: "",
        summary: "",
        pages: ["the answer"],
        at: 0,
      });
      session.handleEvent({ type: "tool", name: "Read", target: "a.ts", at: 0 });
      expect(display.last).toBe("the answer");
    });

    it("interrupts a running turn on hold", async () => {
      session.handleEvent({ type: "state", status: "working", session: {} as never });
      await session.hold();
      expect(pad.keys).toEqual(["escape"]);
    });

    it("reports a session that exited", () => {
      session.handleEvent({ type: "state", status: "exited", session: {} as never });
      expect(display.last).toContain("ended");
    });
  });

  it("opens with a ready screen", () => {
    session.begin();
    expect(display.last).toContain("ready");
    expect(display.statuses.at(-1)?.[1]).toBe("tap to talk");
  });
});

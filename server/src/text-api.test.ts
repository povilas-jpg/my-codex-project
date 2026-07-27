import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionInfo } from "../../shared/protocol.js";
import type { PtyManager } from "./pty-manager.js";
import { StatusReducer } from "./status-reducer.js";
import { registerTextApi, sanitizePrompt } from "./text-api.js";
import { TranscriptTailer } from "./transcript-tailer.js";

/** Records what would have been typed into claude. */
class FakePty extends EventEmitter {
  writes: string[] = [];
  restarts = 0;
  write(data: string): void {
    this.writes.push(data);
  }
  restart(): void {
    this.restarts++;
  }
}

describe("sanitizePrompt", () => {
  it("flattens newlines so the TUI gets one prompt, not several", () => {
    expect(sanitizePrompt("first line\nsecond line")).toBe("first line second line");
  });

  it("strips control bytes that would be read as key presses", () => {
    expect(sanitizePrompt("hello\u001b[Bworld\u0007")).toBe("hello [Bworld");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(sanitizePrompt("  a   b  ")).toBe("a b");
  });

  it("returns empty for whitespace-only input", () => {
    expect(sanitizePrompt("   \n  ")).toBe("");
  });
});

describe("text API", () => {
  let app: FastifyInstance;
  let pty: FakePty;
  let status: StatusReducer;
  let tailer: TranscriptTailer;
  let dir: string;
  const session: SessionInfo = { cwd: "/tmp/project", startedAt: 0 };

  const build = (token?: string) => {
    app = Fastify({ logger: false });
    pty = new FakePty();
    status = new StatusReducer();
    dir = mkdtempSync(join(tmpdir(), "claude-pad-api-"));
    tailer = new TranscriptTailer(dir);
    registerTextApi(app, {
      pty: pty as unknown as PtyManager,
      status,
      tailer,
      token,
      sessionInfo: () => session,
    });
    return app;
  };

  beforeEach(() => build());

  afterEach(async () => {
    tailer.stop();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("types a prompt into the session and returns a turn id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/prompt",
      payload: { text: "what changed in the build?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().turnId).toEqual(expect.any(String));
    expect(pty.writes).toEqual(["what changed in the build?\r"]);
  });

  it("can type without submitting", async () => {
    await app.inject({
      method: "POST",
      url: "/api/prompt",
      payload: { text: "draft this", submit: false },
    });
    expect(pty.writes).toEqual(["draft this"]);
  });

  it("rejects an empty prompt", async () => {
    const res = await app.inject({ method: "POST", url: "/api/prompt", payload: { text: " " } });
    expect(res.statusCode).toBe(400);
    expect(pty.writes).toEqual([]);
  });

  it("rejects a prompt that is missing entirely", async () => {
    const res = await app.inject({ method: "POST", url: "/api/prompt", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("sends the escape sequence for a named key", async () => {
    const res = await app.inject({ method: "POST", url: "/api/key", payload: { key: "escape" } });
    expect(res.statusCode).toBe(200);
    expect(pty.writes).toEqual(["\u001b"]);
  });

  it("refuses an unknown key", async () => {
    const res = await app.inject({ method: "POST", url: "/api/key", payload: { key: "rm -rf" } });
    expect(res.statusCode).toBe(400);
    expect(pty.writes).toEqual([]);
  });

  it("restarts the session on /api/new", async () => {
    await app.inject({ method: "POST", url: "/api/new" });
    expect(pty.restarts).toBe(1);
  });

  it("reports status, session and the latest reply as HUD pages", async () => {
    await app.inject({ method: "POST", url: "/api/prompt", payload: { text: "hi" } });
    tailer.emit("assistant", {
      sessionId: "s",
      text: "## Done\nI changed **three** files and the tests pass.",
      at: Date.now(),
    });
    status.onHook("Stop");

    const res = await app.inject({ method: "GET", url: "/api/state?columns=20&lines=2" });
    const body = res.json();
    expect(body.status).toBe("done");
    expect(body.turn.status).toBe("done");
    expect(body.reply.summary).toBe("Done");
    expect(body.reply.pages.length).toBeGreaterThan(0);
    for (const page of body.reply.pages) {
      expect(page.split("\n").length).toBeLessThanOrEqual(2);
      for (const line of page.split("\n")) expect(line.length).toBeLessThanOrEqual(20);
    }
    // Markdown syntax must not reach the display.
    expect(body.reply.pages.join(" ")).not.toContain("**");
  });

  it("has no reply before anything has been said", async () => {
    const res = await app.inject({ method: "GET", url: "/api/state" });
    expect(res.json().reply).toBeNull();
    expect(res.json().turn).toBeNull();
  });

  it("keeps collecting replies within a turn", async () => {
    await app.inject({ method: "POST", url: "/api/prompt", payload: { text: "go" } });
    tailer.emit("assistant", { text: "First part.", at: Date.now() });
    tailer.emit("assistant", { text: "Second part.", at: Date.now() });
    const res = await app.inject({ method: "GET", url: "/api/state" });
    expect(res.json().reply.text).toBe("Second part.");
  });

  it("marks the turn as waiting when claude needs the user", async () => {
    await app.inject({ method: "POST", url: "/api/prompt", payload: { text: "go" } });
    status.onHook("Notification", { message: "Claude needs your permission to use Bash" });
    const res = await app.inject({ method: "GET", url: "/api/state" });
    expect(res.json().status).toBe("waiting");
    expect(res.json().turn.status).toBe("waiting");
  });

  describe("with a token", () => {
    beforeEach(() => build("s3cret"));

    it("rejects an unauthenticated prompt", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/prompt",
        payload: { text: "hi" },
      });
      expect(res.statusCode).toBe(401);
      expect(pty.writes).toEqual([]);
    });

    it("rejects a wrong token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/state?token=nope" });
      expect(res.statusCode).toBe(401);
    });

    it("accepts the token in the query string", async () => {
      const res = await app.inject({ method: "GET", url: "/api/state?token=s3cret" });
      expect(res.statusCode).toBe(200);
    });

    it("accepts the token as a bearer header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/prompt",
        payload: { text: "hi" },
        headers: { authorization: "Bearer s3cret" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts the token in the x-claude-pad-token header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/state",
        headers: { "x-claude-pad-token": "s3cret" },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

describe("text API event stream", () => {
  let app: FastifyInstance;
  let tailer: TranscriptTailer;
  let status: StatusReducer;
  let dir: string;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    status = new StatusReducer();
    dir = mkdtempSync(join(tmpdir(), "claude-pad-sse-"));
    tailer = new TranscriptTailer(dir);
    registerTextApi(app, {
      pty: new FakePty() as unknown as PtyManager,
      status,
      tailer,
      sessionInfo: () => ({ cwd: "/tmp/project", startedAt: 0 }),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterEach(async () => {
    tailer.stop();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("streams state, replies and turn completion", async () => {
    const port = (app.server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const events: Record<string, unknown>[] = [];

    const pump = async (until: number) => {
      while (events.length < until) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const parts = buffered.split("\n\n");
        buffered = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    };

    await pump(1); // the initial state snapshot
    expect(events[0].type).toBe("state");

    tailer.emit("assistant", { text: "**Done** — all green.", at: Date.now() });
    await pump(2);
    const replyEvent = events[1] as { type: string; plain: string; pages: string[] };
    expect(replyEvent.type).toBe("reply");
    expect(replyEvent.plain).toBe("Done — all green.");

    tailer.emit("tool", { name: "Bash", target: "npm test", at: Date.now() });
    await pump(3);
    expect(events[2]).toMatchObject({ type: "tool", name: "Bash", target: "npm test" });

    await reader.cancel();
  });
});

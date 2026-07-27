import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PadStatus, SessionInfo } from "../../shared/protocol.js";
import type { PadEvent, TurnStatus } from "../../shared/text-protocol.js";
import { sequenceFor } from "./keymap.js";
import type { PtyManager } from "./pty-manager.js";
import type { StatusReducer } from "./status-reducer.js";
import { formatForGlasses, summarize, type GlassesTextOptions } from "./text-format.js";
import type { AssistantMessage, ToolUseEvent, TranscriptTailer } from "./transcript-tailer.js";

/**
 * A text-in / text-out view of the same claude session the pad drives.
 *
 * The WebSocket protocol is built for a terminal: it ships raw PTY bytes and
 * expects an emulator on the other end. A heads-up display has neither the
 * pixels nor the parser for that. This API speaks turns instead — you post a
 * prompt, you get Claude's prose back, already wrapped into pages that fit a
 * five-line display.
 *
 * It is deliberately the *same* session: whatever you say through the glasses
 * shows up in the pad's terminal, and vice versa.
 */

export interface TextApiDeps {
  pty: PtyManager;
  status: StatusReducer;
  tailer: TranscriptTailer;
  sessionInfo: () => SessionInfo;
  /** Required for non-loopback binds, exactly as the WebSocket requires it. */
  token?: string;
  /** Display geometry defaults; per-request query params override them. */
  format?: GlassesTextOptions;
}

export interface TurnView {
  id: string;
  prompt: string;
  startedAt: number;
  endedAt?: number;
  status: TurnStatus;
  /** Every assistant text block seen since the prompt was submitted. */
  replies: string[];
}

const promptSchema = z.object({
  text: z.string().min(1).max(8000),
  /** Type it without pressing Enter — lets a wearer review before sending. */
  submit: z.boolean().default(true),
});

const keySchema = z.object({
  key: z.enum([
    "enter",
    "escape",
    "tab",
    "shift_tab",
    "up",
    "down",
    "left",
    "right",
    "ctrl_c",
  ]),
});

/** SSE heartbeat, so idle connections aren't reaped by proxies or phone radios. */
const KEEPALIVE_MS = 20_000;

export function registerTextApi(app: FastifyInstance, deps: TextApiDeps): void {
  const clients = new Set<FastifyReply>();
  let turn: TurnView | null = null;

  const baseFormat: GlassesTextOptions = deps.format ?? {};

  const authorize = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!deps.token) return true;
    const fromQuery = (req.query as Record<string, string | undefined>).token;
    const header = req.headers.authorization;
    const fromHeader = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const fromCustom = req.headers["x-claude-pad-token"];
    const supplied =
      fromQuery ?? fromHeader ?? (typeof fromCustom === "string" ? fromCustom : undefined);
    if (supplied === deps.token) return true;
    void reply.code(401).send({ error: "invalid token" });
    return false;
  };

  const broadcast = (event: PadEvent) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const reply of clients) {
      try {
        reply.raw.write(frame);
      } catch {
        clients.delete(reply);
      }
    }
  };

  const geometry = (req: FastifyRequest): GlassesTextOptions => {
    const q = req.query as Record<string, string | undefined>;
    const columns = Number(q.columns);
    const linesPerPage = Number(q.lines);
    return {
      ...baseFormat,
      ...(Number.isInteger(columns) && columns > 0 ? { columns } : {}),
      ...(Number.isInteger(linesPerPage) && linesPerPage > 0 ? { linesPerPage } : {}),
    };
  };

  deps.tailer.on("assistant", (msg: AssistantMessage) => {
    if (turn && !turn.endedAt) turn.replies.push(msg.text);
    const formatted = formatForGlasses(msg.text, baseFormat);
    broadcast({
      type: "reply",
      turnId: turn?.id ?? null,
      text: msg.text,
      plain: formatted.plain,
      summary: summarize(msg.text, baseFormat.columns),
      pages: formatted.pages,
      at: msg.at,
    });
  });

  deps.tailer.on("tool", (use: ToolUseEvent) => {
    broadcast({ type: "tool", name: use.name, target: use.target, at: use.at });
  });

  deps.status.on("change", (snap: { status: PadStatus; detail?: string }) => {
    broadcast({
      type: "state",
      status: snap.status,
      detail: snap.detail,
      session: deps.sessionInfo(),
    });
    if (snap.status === "waiting") {
      if (turn && !turn.endedAt) turn.status = "waiting";
      broadcast({ type: "needs_input", detail: snap.detail });
    }
    // "done" is the Stop hook: the turn is over and the reply is complete.
    if (snap.status === "done" && turn && !turn.endedAt) {
      turn.status = "done";
      turn.endedAt = Date.now();
      broadcast({ type: "turn_end", turnId: turn.id, status: "done" });
    }
  });

  app.post("/api/prompt", async (req, reply) => {
    if (!authorize(req, reply)) return reply;
    const parsed = promptSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    }
    const text = sanitizePrompt(parsed.data.text);
    if (!text) return reply.code(400).send({ error: "prompt is empty after sanitising" });

    turn = {
      id: randomUUID(),
      prompt: text,
      startedAt: Date.now(),
      status: "working",
      replies: [],
    };
    deps.pty.write(text + (parsed.data.submit ? "\r" : ""));
    return reply.send({ turnId: turn.id, prompt: text, submitted: parsed.data.submit });
  });

  app.post("/api/key", async (req, reply) => {
    if (!authorize(req, reply)) return reply;
    const parsed = keySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "unknown key" });
    const seq = sequenceFor(parsed.data.key);
    if (!seq) return reply.code(400).send({ error: "unknown key" });
    deps.pty.write(seq);
    return reply.send({ ok: true });
  });

  app.post("/api/new", async (req, reply) => {
    if (!authorize(req, reply)) return reply;
    turn = null;
    deps.pty.restart();
    return reply.send({ ok: true });
  });

  app.get("/api/state", async (req, reply) => {
    if (!authorize(req, reply)) return reply;
    const snap = deps.status.snapshot;
    const opts = geometry(req);
    const latest = turn?.replies.at(-1);
    return reply.send({
      status: snap.status,
      detail: snap.detail,
      session: deps.sessionInfo(),
      turn: turn
        ? {
            id: turn.id,
            prompt: turn.prompt,
            status: turn.status,
            startedAt: turn.startedAt,
            endedAt: turn.endedAt,
          }
        : null,
      reply: latest
        ? {
            text: latest,
            summary: summarize(latest, opts.columns),
            pages: formatForGlasses(latest, opts).pages,
          }
        : null,
    });
  });

  app.get("/api/events", (req, reply) => {
    if (!authorize(req, reply)) return;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    });
    reply.hijack();
    clients.add(reply);

    const snap = deps.status.snapshot;
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "state",
        status: snap.status,
        detail: snap.detail,
        session: deps.sessionInfo(),
      })}\n\n`,
    );

    const keepalive = setInterval(() => {
      try {
        reply.raw.write(": keepalive\n\n");
      } catch {
        clearInterval(keepalive);
        clients.delete(reply);
      }
    }, KEEPALIVE_MS);
    keepalive.unref?.();

    const close = () => {
      clearInterval(keepalive);
      clients.delete(reply);
    };
    req.raw.on("close", close);
    req.raw.on("error", close);
  });
}

/**
 * Flatten a prompt into something safe to type at the TUI.
 *
 * Newlines would submit the prompt line-by-line, and raw control bytes would
 * be read as key presses — an escape sequence arriving via a speech transcript
 * should be text, never a keystroke.
 */
export function sanitizePrompt(input: string): string {
  return input
    .replace(/\s*\n\s*/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

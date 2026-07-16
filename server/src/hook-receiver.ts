import type { FastifyInstance } from "fastify";
import type { StatusReducer, HookEvent } from "./status-reducer.js";

const HOOK_EVENTS = new Set<HookEvent>([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SessionEnd",
]);

export interface HookDeps {
  status: StatusReducer;
  /** Called with the session id claude reports in hook payloads. */
  onSessionId: (sessionId: string) => void;
}

/**
 * Receives lifecycle events from the claude process (see hooks-settings.ts).
 * Loopback-only: hooks always run on the same machine as the pad server.
 */
export function registerHookReceiver(app: FastifyInstance, deps: HookDeps): void {
  app.post("/api/hook/:event", { bodyLimit: 256 * 1024 }, async (req, reply) => {
    const ip = req.ip;
    if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
      return reply.code(403).send({ error: "loopback only" });
    }
    const event = (req.params as { event: string }).event as HookEvent;
    if (!HOOK_EVENTS.has(event)) {
      return reply.code(404).send({ error: "unknown hook event" });
    }
    const payload = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<
      string,
      unknown
    >;
    if (typeof payload.session_id === "string") deps.onSessionId(payload.session_id);
    deps.status.onHook(event, payload);
    return reply.send({ ok: true });
  });
}

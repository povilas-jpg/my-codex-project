import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type {
  ClientMessage,
  PadConfig,
  ServerMessage,
  SessionInfo,
} from "../../shared/protocol.js";
import { sequenceFor } from "./keymap.js";
import type { PtyManager } from "./pty-manager.js";
import type { SessionStore } from "./session-store.js";
import { isValidSessionId } from "./session-store.js";
import type { StatusReducer } from "./status-reducer.js";

export interface WsDeps {
  pty: PtyManager;
  status: StatusReducer;
  store: SessionStore;
  config: PadConfig;
  sessionInfo: () => SessionInfo;
  /** Required for non-loopback binds; WS handshakes must carry ?token=. */
  token?: string;
}

const b64 = (chunk: string) => Buffer.from(chunk, "utf8").toString("base64");

const MODEL_RE = /^[a-zA-Z0-9._/-]{1,64}$/;

export interface WsHub {
  broadcast: (msg: ServerMessage) => void;
}

export function registerWs(app: FastifyInstance, deps: WsDeps): WsHub {
  const clients = new Set<WebSocket>();

  const broadcast = (msg: ServerMessage) => {
    const text = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(text);
    }
  };

  deps.pty.on("data", (chunk: string) => {
    deps.status.onPtyData(chunk);
    broadcast({ type: "pty_output", data: b64(chunk) });
  });
  deps.pty.on("exit", (code: number) => deps.status.onPtyExit(code));
  deps.pty.on("spawned", () => {
    deps.status.onPtySpawned();
    broadcast({ type: "session_info", session: deps.sessionInfo() });
  });
  deps.status.on("change", (snap) =>
    broadcast({ type: "status", status: snap.status, detail: snap.detail }),
  );

  app.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const token = (req.query as Record<string, string | undefined>).token;
    if (deps.token && token !== deps.token) {
      socket.close(4001, "invalid token");
      return;
    }

    clients.add(socket);
    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    send({
      type: "hello",
      config: deps.config,
      session: deps.sessionInfo(),
      status: deps.status.snapshot.status,
      statusDetail: deps.status.snapshot.detail,
    });
    send({ type: "replay", data: b64(deps.pty.replaySnapshot()) });

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", message: "bad frame" });
        return;
      }
      try {
        handle(msg, send);
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      }
    });

    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  function handle(msg: ClientMessage, send: (m: ServerMessage) => void): void {
    switch (msg.type) {
      case "pty_input":
        deps.pty.write(msg.data);
        break;
      case "key_press": {
        const seq = sequenceFor(msg.key);
        if (seq) deps.pty.write(seq);
        break;
      }
      case "type_text": {
        // Newlines would submit line-by-line in the TUI; flatten them.
        const text = msg.text.replace(/\s*\n\s*/g, " ").trim();
        if (!text) break;
        deps.pty.write(text + (msg.submit ? "\r" : ""));
        break;
      }
      case "resize":
        deps.pty.resize(Math.floor(msg.cols), Math.floor(msg.rows));
        break;
      case "set_model": {
        if (!MODEL_RE.test(msg.model)) throw new Error("invalid model name");
        deps.pty.write(`/model ${msg.model}\r`);
        break;
      }
      case "new_session":
        deps.pty.restart();
        break;
      case "list_chats":
        send({ type: "chats", chats: deps.store.listChats() });
        break;
      case "search_chats":
        send({ type: "chats", chats: deps.store.listChats(msg.query), query: msg.query });
        break;
      case "resume_chat": {
        if (!isValidSessionId(msg.sessionId)) throw new Error("invalid session id");
        deps.pty.restart({ resumeSessionId: msg.sessionId });
        break;
      }
    }
  }

  return { broadcast };
}

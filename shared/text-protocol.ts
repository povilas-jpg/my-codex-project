/**
 * The text-mode HTTP/SSE protocol, shared by the pad server and any client
 * that wants prose instead of a terminal — the G2 bridge, a watch, a script.
 *
 * Kept separate from protocol.ts because that one is the terminal transport:
 * base64 PTY bytes over a WebSocket. This one never mentions bytes or keys.
 */

import type { KeyName, PadStatus, SessionInfo } from "./protocol.js";

export type { KeyName, PadStatus, SessionInfo };

/** POST /api/prompt */
export interface PromptRequest {
  text: string;
  /** false types the text without pressing Enter, so it can be reviewed. */
  submit?: boolean;
}

export interface PromptResponse {
  turnId: string;
  prompt: string;
  submitted: boolean;
}

/** POST /api/key */
export interface KeyRequest {
  key: KeyName;
}

export type TurnStatus = "working" | "waiting" | "done";

/** A reply rendered for a specific display geometry. */
export interface RenderedReply {
  /** What Claude wrote, markdown intact. */
  text: string;
  /** One short line for a status/dashboard slot. */
  summary: string;
  /** Wrapped and split to the requested columns × lines. */
  pages: string[];
}

/** GET /api/state */
export interface StateResponse {
  status: PadStatus;
  detail?: string;
  session: SessionInfo;
  turn: {
    id: string;
    prompt: string;
    status: TurnStatus;
    startedAt: number;
    endedAt?: number;
  } | null;
  reply: RenderedReply | null;
}

/** Frames on GET /api/events (SSE, one JSON object per `data:` line). */
export type PadEvent =
  | { type: "state"; status: PadStatus; detail?: string; session: SessionInfo }
  | {
      type: "reply";
      /** null when Claude speaks outside a turn we started. */
      turnId: string | null;
      text: string;
      plain: string;
      summary: string;
      pages: string[];
      at: number;
    }
  | { type: "tool"; name: string; target?: string; at: number }
  | { type: "turn_end"; turnId: string; status: "done" }
  | { type: "needs_input"; detail?: string };

/** Display geometry, sent as query params on /api/state and /api/events. */
export interface DisplayGeometry {
  columns: number;
  lines: number;
}

/**
 * Even Realities G1/G2-class HUD. The SDK measures real glyph widths at
 * render time; this is the conservative character-grid approximation used
 * for wrapping upstream of it.
 */
export const G2_GEOMETRY: DisplayGeometry = { columns: 40, lines: 5 };

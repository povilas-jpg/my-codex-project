/**
 * WebSocket protocol shared between server and web UI.
 * All frames are JSON text. PTY bytes are base64-encoded inside JSON.
 */

/** Named keys the macropad can send; sequences live in server/src/keymap.ts. */
export type KeyName =
  | "enter"
  | "escape"
  | "tab"
  | "shift_tab"
  | "up"
  | "down"
  | "left"
  | "right"
  | "ctrl_c";

/** LED states shown on the pad. */
export type PadStatus =
  | "starting" // PTY spawning / claude booting
  | "idle" // waiting for the user at the prompt
  | "working" // model is thinking/responding
  | "tool" // a tool is executing
  | "waiting" // claude needs the user (permission prompt / question)
  | "done" // turn finished
  | "error" // something failed
  | "exited"; // claude process is gone

export interface SessionInfo {
  sessionId?: string;
  cwd: string;
  model?: string;
  startedAt: number;
  resumedFrom?: string;
  claudeVersion?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  mtimeMs: number;
  messageCount: number;
}

export interface PadConfig {
  autoSubmitVoice: boolean;
}

export type ClientMessage =
  | { type: "pty_input"; data: string } // raw keystrokes from the web terminal
  | { type: "key_press"; key: KeyName } // named macropad key
  | { type: "type_text"; text: string; submit?: boolean } // macro / dictation text
  | { type: "resize"; cols: number; rows: number }
  | { type: "set_model"; model: string } // types `/model <model>` + Enter
  | { type: "new_session" } // restart PTY with a fresh conversation
  | { type: "list_chats" }
  | { type: "search_chats"; query: string }
  | { type: "resume_chat"; sessionId: string }; // restart PTY with --resume <id>

export type ServerMessage =
  | { type: "hello"; config: PadConfig; session: SessionInfo; status: PadStatus; statusDetail?: string }
  | { type: "replay"; data: string } // base64 of recent PTY output (reset terminal first)
  | { type: "pty_output"; data: string } // base64 chunk
  | { type: "status"; status: PadStatus; detail?: string }
  | { type: "session_info"; session: SessionInfo }
  | { type: "chats"; chats: ChatSummary[]; query?: string }
  | { type: "error"; message: string };

export const DEFAULT_PORT = 7433;

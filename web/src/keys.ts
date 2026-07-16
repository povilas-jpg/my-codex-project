import type { KeyName } from "../../shared/protocol";

export type PadAction =
  | { kind: "key"; key: KeyName }
  | { kind: "text"; text: string; submit: boolean }
  | { kind: "new_session" }
  | { kind: "model_cycle" }
  | { kind: "talk" }
  | { kind: "chats_toggle" }
  | { kind: "chats_search" }
  | { kind: "chats_prev" }
  | { kind: "chats_next" }
  | { kind: "chats_open" }
  | { kind: "scroll"; pages: number };

export interface PadKeyDef {
  id: string;
  emoji: string;
  label: string;
  sub?: string;
  accent: string;
  action: PadAction;
}

export const MODEL_CYCLE = ["haiku", "sonnet", "opus"] as const;

/** The 15 keys, pad order (5 x 3). */
export const PAD_KEYS: PadKeyDef[] = [
  { id: "talk", emoji: "🎤", label: "Talk", sub: "hold to dictate", accent: "#e8578a", action: { kind: "talk" } },
  { id: "approve", emoji: "✅", label: "Approve", sub: "enter", accent: "#3fcf6f", action: { kind: "key", key: "enter" } },
  { id: "deny", emoji: "⛔", label: "Stop / No", sub: "esc", accent: "#f0554e", action: { kind: "key", key: "escape" } },
  { id: "mode", emoji: "🔀", label: "Mode", sub: "shift+tab", accent: "#c58bf2", action: { kind: "key", key: "shift_tab" } },
  { id: "think", emoji: "🧠", label: "Think", sub: "tab", accent: "#8f7bf5", action: { kind: "key", key: "tab" } },

  { id: "new", emoji: "🆕", label: "New chat", sub: "fresh session", accent: "#4fb6f0", action: { kind: "new_session" } },
  { id: "compact", emoji: "🧹", label: "Compact", sub: "/compact", accent: "#4fb6f0", action: { kind: "text", text: "/compact", submit: true } },
  { id: "model", emoji: "🎛️", label: "Model", sub: "reasoning dial", accent: "#e8a34b", action: { kind: "model_cycle" } },
  { id: "chats", emoji: "💬", label: "Chats", sub: "browse sessions", accent: "#49c9b8", action: { kind: "chats_toggle" } },
  { id: "search", emoji: "🔍", label: "Search", sub: "filter chats", accent: "#49c9b8", action: { kind: "chats_search" } },

  { id: "prev", emoji: "⬆️", label: "Prev", sub: "chat above", accent: "#49c9b8", action: { kind: "chats_prev" } },
  { id: "next", emoji: "⬇️", label: "Next", sub: "chat below", accent: "#49c9b8", action: { kind: "chats_next" } },
  { id: "open", emoji: "↩️", label: "Open", sub: "resume chat", accent: "#49c9b8", action: { kind: "chats_open" } },
  { id: "scroll_up", emoji: "🔼", label: "Scroll ↑", sub: "history", accent: "#7c8aa5", action: { kind: "scroll", pages: -1 } },
  { id: "scroll_down", emoji: "🔽", label: "Scroll ↓", sub: "history", accent: "#7c8aa5", action: { kind: "scroll", pages: 1 } },
];

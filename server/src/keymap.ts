import type { KeyName } from "../../shared/protocol.js";

/**
 * Single source of truth for every escape sequence the pad sends to claude.
 * Standard xterm encodings; arrows/Enter/Esc verified against the real
 * claude TUI (ink input layer) in scripts/pty-spike2.ts.
 */
export const KEY_SEQUENCES: Record<KeyName, string> = {
  enter: "\r",
  escape: "\x1b",
  tab: "\t",
  shift_tab: "\x1b[Z",
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  ctrl_c: "\x03",
};

export function sequenceFor(key: KeyName): string | undefined {
  return KEY_SEQUENCES[key];
}

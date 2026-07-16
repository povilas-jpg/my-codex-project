import type { KeyName } from "../../../shared/protocol";

/** On-screen joystick: arrow keys + Enter, for claude's interactive menus. */
export function DPad({ onKey }: { onKey: (key: KeyName) => void }) {
  const btn = (key: KeyName, glyph: string, cls: string, label: string) => (
    <button className={`dpad-btn ${cls}`} onClick={() => onKey(key)} aria-label={label}>
      {glyph}
    </button>
  );
  return (
    <div className="dpad" aria-label="menu navigation">
      <span />
      {btn("up", "▲", "up", "arrow up")}
      <span />
      {btn("left", "◀", "left", "arrow left")}
      {btn("enter", "OK", "ok", "enter")}
      {btn("right", "▶", "right", "arrow right")}
      <span />
      {btn("down", "▼", "down", "arrow down")}
      <span />
    </div>
  );
}

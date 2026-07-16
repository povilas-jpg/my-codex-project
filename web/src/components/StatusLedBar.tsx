import type { PadStatus } from "../../../shared/protocol";

const LEDS: { id: PadStatus; label: string; color: string; also?: PadStatus[] }[] = [
  { id: "idle", label: "idle", color: "#7c8aa5", also: ["starting"] },
  { id: "working", label: "working", color: "#e8a34b" },
  { id: "tool", label: "tool", color: "#4fb6f0" },
  { id: "waiting", label: "needs you", color: "#c58bf2" },
  { id: "done", label: "done", color: "#3fcf6f" },
  { id: "error", label: "error", color: "#f0554e", also: ["exited"] },
];

export function StatusLedBar({ status, detail }: { status: PadStatus; detail?: string }) {
  return (
    <div className="led-bar" data-status={status}>
      {LEDS.map((led) => {
        const active = led.id === status || (led.also?.includes(status) ?? false);
        return (
          <div key={led.id} className={`led-cell ${active ? "active" : ""}`}>
            <span
              className={`led ${active ? `led-${status}` : ""}`}
              style={{ "--c": led.color } as React.CSSProperties}
            />
            <span className="led-label">{led.label}</span>
          </div>
        );
      })}
      {detail && <span className="led-detail" title={detail}>{detail}</span>}
    </div>
  );
}

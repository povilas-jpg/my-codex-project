import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { PadSocket } from "../hooks/useWebSocket";

export interface TerminalHandle {
  scrollPages: (n: number) => void;
  focus: () => void;
}

const b64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const TerminalPane = forwardRef<TerminalHandle, { socket: PadSocket }>(
  function TerminalPane({ socket }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);

    useImperativeHandle(ref, () => ({
      scrollPages: (n) => termRef.current?.scrollPages(n),
      focus: () => termRef.current?.focus(),
    }));

    useEffect(() => {
      const host = hostRef.current!;
      const term = new Terminal({
        fontSize: 13,
        fontFamily: "'SFMono-Regular', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
        scrollback: 5000,
        theme: {
          background: "#0d1017",
          foreground: "#d8dee9",
          cursor: "#e8a34b",
          selectionBackground: "#2b3245",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      termRef.current = term;

      const sendResize = () => {
        fit.fit();
        socket.send({ type: "resize", cols: term.cols, rows: term.rows });
      };

      const dataSub = term.onData((d) => socket.send({ type: "pty_input", data: d }));

      const unsub = socket.subscribe((msg) => {
        if (msg.type === "pty_output") {
          term.write(b64ToBytes(msg.data));
        } else if (msg.type === "replay") {
          term.reset();
          term.write(b64ToBytes(msg.data));
          // Syncing size after replay triggers SIGWINCH -> claude repaints clean.
          sendResize();
        }
      });

      const ro = new ResizeObserver(() => sendResize());
      ro.observe(host);

      return () => {
        ro.disconnect();
        unsub();
        dataSub.dispose();
        term.dispose();
        termRef.current = null;
      };
    }, [socket]);

    return <div className="terminal-pane" ref={hostRef} />;
  },
);

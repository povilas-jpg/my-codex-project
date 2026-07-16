import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "../../../shared/protocol";

export type Listener = (msg: ServerMessage) => void;

export interface PadSocket {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  /** Subscribe to every server message; returns an unsubscribe fn. */
  subscribe: (fn: Listener) => () => void;
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const token = new URLSearchParams(location.search).get("token");
  return `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export function useWebSocket(): PadSocket {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const retryRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let timer: number | undefined;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        for (const fn of listenersRef.current) fn(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          const delay = Math.min(5000, 500 * 2 ** retryRef.current++);
          timer = window.setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  return { connected, send, subscribe };
}

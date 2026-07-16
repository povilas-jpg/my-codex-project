import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSummary, PadConfig, PadStatus, SessionInfo } from "../../shared/protocol";
import { ChatBrowser } from "./components/ChatBrowser";
import { DPad } from "./components/DPad";
import { MacroPad } from "./components/MacroPad";
import { StatusLedBar } from "./components/StatusLedBar";
import { TerminalPane, type TerminalHandle } from "./components/TerminalPane";
import { useSpeech } from "./hooks/useSpeech";
import { useWebSocket } from "./hooks/useWebSocket";
import { MODEL_CYCLE, type PadAction } from "./keys";

export function App() {
  const socket = useWebSocket();
  const termRef = useRef<TerminalHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<PadStatus>("starting");
  const [detail, setDetail] = useState<string | undefined>();
  const [session, setSession] = useState<SessionInfo | undefined>();
  const [config, setConfig] = useState<PadConfig>({ autoSubmitVoice: true });
  const [chatsOpen, setChatsOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [modelIdx, setModelIdx] = useState<number | null>(null);

  useEffect(
    () =>
      socket.subscribe((msg) => {
        switch (msg.type) {
          case "hello":
            setConfig(msg.config);
            setSession(msg.session);
            setStatus(msg.status);
            setDetail(msg.statusDetail);
            break;
          case "status":
            setStatus(msg.status);
            setDetail(msg.detail);
            break;
          case "session_info":
            setSession(msg.session);
            break;
          case "chats":
            setChats(msg.chats);
            setHighlight((h) => Math.max(0, Math.min(h, msg.chats.length - 1)));
            break;
        }
      }),
    [socket],
  );

  // Debounced chat search while the drawer is open.
  useEffect(() => {
    if (!chatsOpen) return;
    const t = window.setTimeout(() => {
      socket.send(query.trim() ? { type: "search_chats", query } : { type: "list_chats" });
    }, 250);
    return () => clearTimeout(t);
  }, [query, chatsOpen, socket]);

  const openChat = useCallback(
    (id: string) => {
      socket.send({ type: "resume_chat", sessionId: id });
      setChatsOpen(false);
      termRef.current?.focus();
    },
    [socket],
  );

  const speech = useSpeech(
    useCallback(
      (text: string) => {
        if (!text) return;
        if (chatsOpen) {
          setQuery(text);
          searchInputRef.current?.focus();
        } else {
          socket.send({ type: "type_text", text, submit: config.autoSubmitVoice });
        }
      },
      [chatsOpen, config.autoSubmitVoice, socket],
    ),
  );

  const dispatch = useCallback(
    (action: PadAction) => {
      switch (action.kind) {
        case "key":
          socket.send({ type: "key_press", key: action.key });
          termRef.current?.focus();
          break;
        case "text":
          socket.send({ type: "type_text", text: action.text, submit: action.submit });
          termRef.current?.focus();
          break;
        case "new_session":
          socket.send({ type: "new_session" });
          setChatsOpen(false);
          break;
        case "model_cycle": {
          const next = ((modelIdx ?? 0) + (modelIdx === null ? 0 : 1)) % MODEL_CYCLE.length;
          setModelIdx(next);
          socket.send({ type: "set_model", model: MODEL_CYCLE[next]! });
          termRef.current?.focus();
          break;
        }
        case "chats_toggle":
          setChatsOpen((open) => {
            if (!open) {
              setQuery("");
              setHighlight(0);
              socket.send({ type: "list_chats" });
            }
            return !open;
          });
          break;
        case "chats_search":
          if (!chatsOpen) {
            setChatsOpen(true);
            setQuery("");
            socket.send({ type: "list_chats" });
          }
          window.setTimeout(() => searchInputRef.current?.focus(), 50);
          break;
        case "chats_prev":
        case "chats_next": {
          if (!chatsOpen) {
            dispatch({ kind: "chats_toggle" });
            break;
          }
          const delta = action.kind === "chats_prev" ? -1 : 1;
          setHighlight((h) => Math.max(0, Math.min(chats.length - 1, h + delta)));
          break;
        }
        case "chats_open":
          if (chatsOpen && chats[highlight]) openChat(chats[highlight].id);
          break;
        case "scroll":
          termRef.current?.scrollPages(action.pages);
          break;
        case "talk":
          break; // handled by the TalkKey hold gesture
      }
    },
    [socket, modelIdx, chatsOpen, chats, highlight, openChat],
  );

  const projectName = session?.cwd.split("/").filter(Boolean).pop() ?? "";
  const modelLabel = modelIdx === null ? "Model" : MODEL_CYCLE[modelIdx]!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🎛️</span>
          <div className="brand-text">
            <span className="brand-name">Claude Pad</span>
            <span className="brand-sub">
              {projectName}
              {session?.claudeVersion ? ` · ${session.claudeVersion}` : ""}
            </span>
          </div>
        </div>
        <StatusLedBar status={status} detail={detail} />
        <span className={`conn-dot ${socket.connected ? "on" : "off"}`} title={socket.connected ? "connected" : "reconnecting…"} />
      </header>

      <main className="main">
        <TerminalPane ref={termRef} socket={socket} />
        <ChatBrowser
          open={chatsOpen}
          chats={chats}
          query={query}
          highlight={highlight}
          currentSessionId={session?.sessionId}
          onQuery={setQuery}
          onOpen={openChat}
          onClose={() => setChatsOpen(false)}
          searchInputRef={searchInputRef}
        />
        {!socket.connected && <div className="banner reconnect">reconnecting…</div>}
        {status === "exited" && socket.connected && (
          <div className="banner exited">claude exited — press 🆕 New chat to relaunch</div>
        )}
        {speech.listening && (
          <div className="talk-overlay">
            <span className="talk-dot" />
            {speech.transcript || "Listening…"}
          </div>
        )}
      </main>

      <section className="pad-zone">
        <MacroPad
          dispatch={dispatch}
          speech={speech}
          modelLabel={modelLabel}
          activeChatKeys={chatsOpen}
        />
        <div className="pad-side">
          <DPad onKey={(key) => dispatch({ kind: "key", key })} />
          <div className="pad-side-hint">menus</div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useRef } from "react";
import type { ChatSummary } from "../../../shared/protocol";

export interface ChatBrowserProps {
  open: boolean;
  chats: ChatSummary[];
  query: string;
  highlight: number;
  currentSessionId?: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ChatBrowser({
  open,
  chats,
  query,
  highlight,
  currentSessionId,
  onQuery,
  onOpen,
  onClose,
  searchInputRef,
}: ChatBrowserProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-highlight="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, chats]);

  if (!open) return null;

  return (
    <div className="chat-drawer">
      <div className="chat-drawer-head">
        <span className="chat-drawer-title">💬 Chats</span>
        <input
          ref={searchInputRef}
          className="chat-search"
          placeholder="Search chats… (or hold 🎤)"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && chats[highlight]) onOpen(chats[highlight].id);
          }}
        />
        <button className="chat-close" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      <ul className="chat-list" ref={listRef}>
        {chats.length === 0 && (
          <li className="chat-empty">{query ? "No chats match." : "No chats yet for this project."}</li>
        )}
        {chats.map((c, i) => (
          <li key={c.id}>
            <button
              className={`chat-item ${i === highlight ? "highlight" : ""}`}
              data-highlight={i === highlight}
              onClick={() => onOpen(c.id)}
            >
              <span className="chat-title">
                {c.id === currentSessionId && <span className="chat-current">● </span>}
                {c.title}
              </span>
              <span className="chat-meta">
                {timeAgo(c.mtimeMs)} · {c.messageCount} msgs
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="chat-hint">⬆️ Prev · ⬇️ Next · ↩️ Open · resumes with claude --resume</div>
    </div>
  );
}

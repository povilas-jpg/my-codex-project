import type { PadAction, PadKeyDef } from "../keys";
import { PAD_KEYS } from "../keys";
import type { Speech } from "../hooks/useSpeech";

export interface MacroPadProps {
  dispatch: (action: PadAction) => void;
  speech: Speech;
  modelLabel: string;
  activeChatKeys: boolean;
}

function TalkKey({ speech }: { speech: Speech }) {
  const startTalk = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    speech.start();
  };
  const stopTalk = (e: React.PointerEvent) => {
    e.preventDefault();
    speech.stop();
  };
  if (!speech.supported) {
    return (
      <button
        className="pad-key disabled"
        style={{ "--accent": "#e8578a" } as React.CSSProperties}
        title="Voice needs Chrome/Edge/Safari over HTTPS or localhost"
        disabled
      >
        <span className="key-emoji">🎤</span>
        <span className="key-label">Talk</span>
        <span className="key-sub">unavailable</span>
      </button>
    );
  }
  return (
    <button
      className={`pad-key talk ${speech.listening ? "listening" : ""}`}
      style={{ "--accent": "#e8578a" } as React.CSSProperties}
      onPointerDown={startTalk}
      onPointerUp={stopTalk}
      onPointerCancel={stopTalk}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="key-emoji">🎤</span>
      <span className="key-label">{speech.listening ? "Listening…" : "Talk"}</span>
      <span className="key-sub">hold to dictate</span>
    </button>
  );
}

function PadKey({
  def,
  dispatch,
  modelLabel,
  dimmed,
}: {
  def: PadKeyDef;
  dispatch: (a: PadAction) => void;
  modelLabel: string;
  dimmed: boolean;
}) {
  const isModel = def.action.kind === "model_cycle";
  return (
    <button
      className={`pad-key ${dimmed ? "dimmed" : ""}`}
      style={{ "--accent": def.accent } as React.CSSProperties}
      onClick={() => dispatch(def.action)}
      title={def.sub}
    >
      <span className="key-emoji">{def.emoji}</span>
      <span className="key-label">{isModel ? modelLabel : def.label}</span>
      <span className="key-sub">{isModel ? "reasoning dial" : def.sub}</span>
    </button>
  );
}

const CHAT_KEY_IDS = new Set(["search", "prev", "next", "open"]);

export function MacroPad({ dispatch, speech, modelLabel, activeChatKeys }: MacroPadProps) {
  return (
    <div className="pad-grid">
      {PAD_KEYS.map((def) =>
        def.action.kind === "talk" ? (
          <TalkKey key={def.id} speech={speech} />
        ) : (
          <PadKey
            key={def.id}
            def={def}
            dispatch={dispatch}
            modelLabel={modelLabel}
            dimmed={CHAT_KEY_IDS.has(def.id) && !activeChatKeys}
          />
        ),
      )}
    </div>
  );
}

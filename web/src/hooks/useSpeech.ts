import { useCallback, useRef, useState } from "react";

/* Minimal Web Speech API typings (not in lib.dom for all TS configs). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined;
}

export interface Speech {
  supported: boolean;
  listening: boolean;
  transcript: string;
  /** Begin push-to-talk capture. */
  start: () => void;
  /** End capture; onDone fires once with the final transcript (may be ""). */
  stop: () => void;
}

export function useSpeech(onDone: (finalTranscript: string) => void): Speech {
  const supported = getCtor() !== undefined && (window.isSecureContext ?? true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    finalRef.current = "";
    setTranscript("");

    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]!;
        if (res.isFinal) finalRef.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = () => {
      /* mic denied / no-speech — onend still fires and finalizes */
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = finalRef.current.trim();
      setTranscript("");
      doneRef.current(text);
    };

    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop(); // final results flush, then onend fires
  }, []);

  return { supported, listening, transcript, start, stop };
}

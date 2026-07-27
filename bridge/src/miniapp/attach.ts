import { ClaudePadClient } from "../claude-client.js";
import { GlassesSession } from "../glasses-session.js";

/**
 * The miniapp adapter — the private path.
 *
 * A miniapp is a JS bundle running inside the MentraOS app's WebView on the
 * phone, driving the glasses over BLE. Nothing needs a public URL: the phone
 * is on your tailnet and talks to claude-pad directly, so no transcript and no
 * reply ever crosses someone else's server.
 *
 * `@mentra/miniapp` is still pre-release (a branch checkout, not on npm), so
 * this file depends on the narrow shape it needs rather than importing the
 * package. main.ts does the actual binding — if the SDK's surface shifts, only
 * that file moves.
 */

/** What we need from a miniapp runtime session. */
export interface MiniappRuntime {
  transcription: {
    subscribe(handler: (data: { text: string; isFinal: boolean }) => void): unknown;
  };
  display: {
    showTextWall(text: string): unknown;
    showDashboardCard?(left: string, right: string): unknown;
  };
  /** Optional: temple taps and swipes, where the runtime exposes them. */
  input?: {
    onTap?(handler: () => void): unknown;
    onLongPress?(handler: () => void): unknown;
    onSwipe?(handler: (direction: "forward" | "backward") => void): unknown;
  };
  storage?: {
    get(key: string): Promise<string | null> | string | null;
    set(key: string, value: string): Promise<void> | void;
  };
  log?(message: string): void;
}

export interface AttachOptions {
  padUrl: string;
  padToken?: string;
  columns?: number;
  lines?: number;
  pushToTalk?: boolean;
}

export interface AttachedMiniapp {
  session: GlassesSession;
  client: ClaudePadClient;
  stop(): void;
}

/**
 * Wire a miniapp runtime to a claude-pad instance. Returns the pieces so a
 * host can drive them (and so tests can, without any glasses).
 */
export function attachMiniapp(
  runtime: MiniappRuntime,
  options: AttachOptions,
): AttachedMiniapp {
  const client = new ClaudePadClient({
    baseUrl: options.padUrl,
    token: options.padToken,
    columns: options.columns,
    lines: options.lines,
  });

  const session = new GlassesSession({
    client,
    pushToTalk: options.pushToTalk ?? true,
    display: {
      text: (body) => void runtime.display.showTextWall(body),
      status: (left, right) => void runtime.display.showDashboardCard?.(left, right),
    },
    onLog: (message) => runtime.log?.(message),
  });

  session.begin();

  runtime.transcription.subscribe((data) => {
    void session.onTranscript(data.text, data.isFinal);
  });

  runtime.input?.onTap?.(() => {
    if (session.listening) {
      session.disarmMic();
    } else if (session.currentPhase === "reading" || session.currentPhase === "waiting") {
      void session.tap();
    } else {
      session.armMic();
    }
  });

  runtime.input?.onLongPress?.(() => void session.hold());

  runtime.input?.onSwipe?.((direction) => {
    if (direction === "forward") session.nextPage();
    else session.prevPage();
  });

  void client
    .connect({
      onEvent: (event) => session.handleEvent(event),
      onOpen: () => runtime.log?.("connected to claude-pad"),
      onError: (err) => runtime.log?.(`claude-pad stream dropped: ${err.message}`),
    })
    .catch((err: unknown) => runtime.log?.(`claude-pad connection ended: ${String(err)}`));

  return {
    session,
    client,
    stop: () => client.close(),
  };
}

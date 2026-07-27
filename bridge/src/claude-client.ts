import type {
  KeyName,
  PadEvent,
  PromptResponse,
  StateResponse,
} from "../../shared/text-protocol.js";

/**
 * Client for the pad's text-mode API.
 *
 * Written against fetch + streams rather than EventSource so the same file
 * runs in Node (the cloud adapter) and in the phone's WebView (the miniapp).
 * EventSource can't send an Authorization header, which would force the token
 * into the query string everywhere.
 */

export interface ClaudePadClientOptions {
  /** e.g. http://raspberrypi.tail1234.ts.net:7433 */
  baseUrl: string;
  /** The pad's token — required whenever it binds to anything but loopback. */
  token?: string;
  /** Display geometry the server should wrap replies to. */
  columns?: number;
  lines?: number;
  /** Reconnect backoff bounds for the event stream. */
  minRetryMs?: number;
  maxRetryMs?: number;
  fetchImpl?: typeof fetch;
}

export class ClaudePadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClaudePadError";
  }
}

export class ClaudePadClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly columns: number;
  private readonly lines: number;
  private readonly minRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly doFetch: typeof fetch;
  private abort: AbortController | null = null;
  private closed = false;

  constructor(options: ClaudePadClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.columns = options.columns ?? 40;
    this.lines = options.lines ?? 5;
    this.minRetryMs = options.minRetryMs ?? 500;
    this.maxRetryMs = options.maxRetryMs ?? 15_000;
    this.doFetch = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private url(path: string, params: Record<string, string | number> = {}): string {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return url.toString();
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.doFetch(this.url(path), { ...init, headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ClaudePadError(
        `${init.method ?? "GET"} ${path} failed: ${res.status} ${body}`.trim(),
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  /** Send something for Claude to do. */
  prompt(text: string, submit = true): Promise<PromptResponse> {
    return this.request<PromptResponse>("/api/prompt", {
      method: "POST",
      body: JSON.stringify({ text, submit }),
    });
  }

  /** Press a key — how a wearer answers a permission prompt or interrupts. */
  key(key: KeyName): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("/api/key", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
  }

  /** Start a fresh conversation. */
  newSession(): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("/api/new", { method: "POST" });
  }

  async state(): Promise<StateResponse> {
    const res = await this.doFetch(
      this.url("/api/state", { columns: this.columns, lines: this.lines }),
      { headers: this.headers() },
    );
    if (!res.ok) throw new ClaudePadError(`GET /api/state failed: ${res.status}`, res.status);
    return (await res.json()) as StateResponse;
  }

  /**
   * Follow the event stream until close() is called, reconnecting with
   * backoff. A pad on a Raspberry Pi will restart, the phone's radio will
   * drop — neither should end the wearer's session.
   */
  async connect(handlers: {
    onEvent: (event: PadEvent) => void;
    onOpen?: () => void;
    onError?: (err: Error) => void;
  }): Promise<void> {
    this.closed = false;
    let retry = this.minRetryMs;

    while (!this.closed) {
      this.abort = new AbortController();
      try {
        const res = await this.doFetch(
          this.url("/api/events", { columns: this.columns, lines: this.lines }),
          { headers: this.headers(), signal: this.abort.signal },
        );
        if (!res.ok || !res.body) {
          throw new ClaudePadError(`GET /api/events failed: ${res.status}`, res.status);
        }
        retry = this.minRetryMs; // a good connection resets the backoff
        handlers.onOpen?.();
        await readSse(res.body, handlers.onEvent);
      } catch (err) {
        if (this.closed) return;
        handlers.onError?.(err as Error);
      }
      if (this.closed) return;
      await sleep(retry + Math.floor(Math.random() * 250));
      retry = Math.min(retry * 2, this.maxRetryMs);
    }
  }

  close(): void {
    this.closed = true;
    this.abort?.abort();
    this.abort = null;
  }
}

/** Parse an SSE body, invoking `onEvent` for each complete `data:` frame. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: PadEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffered += decoder.decode(value, { stream: true });

    let split: number;
    // Frames are separated by a blank line; anything after the last one is a
    // partial frame and has to wait for more bytes.
    while ((split = buffered.indexOf("\n\n")) !== -1) {
      const frame = buffered.slice(0, split);
      buffered = buffered.slice(split + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue; // keepalive comment
      try {
        onEvent(JSON.parse(data) as PadEvent);
      } catch {
        // a frame we can't parse is not worth tearing the stream down for
      }
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

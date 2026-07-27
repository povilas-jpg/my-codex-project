import { EventEmitter } from "node:events";
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Follows the active conversation's JSONL transcript and emits Claude's
 * replies as clean text.
 *
 * The pad's WebSocket already carries the PTY stream, but that stream is ANSI
 * meant for a terminal — cursor moves, redraws, spinner frames. Reconstructing
 * "what did Claude actually say" from it is guesswork. Claude Code writes the
 * same conversation to ~/.claude/projects/<encoded-cwd>/<session>.jsonl as
 * structured messages, so a HUD (or anything else that wants prose rather than
 * pixels) reads that instead.
 *
 * Like SessionStore, every parse here is defensive: the format is internal to
 * claude, so a line we don't understand is skipped rather than fatal.
 *
 * Events:
 *  - "assistant" (msg: AssistantMessage)  a text reply block
 *  - "tool"      (use: ToolUseEvent)      claude started a tool
 *  - "error"     (err: Error)             transient read failure (non-fatal)
 */

export interface AssistantMessage {
  /** Session the message belongs to, when the transcript records one. */
  sessionId?: string;
  /** Message uuid from the transcript, when present. */
  uuid?: string;
  /** Concatenated text blocks — markdown, exactly as Claude wrote it. */
  text: string;
  /** Wall-clock ms when we observed it. */
  at: number;
}

export interface ToolUseEvent {
  name: string;
  /** A short, human-readable hint (file path, command) when we can find one. */
  target?: string;
  at: number;
}

export interface TranscriptTailerOptions {
  /** How often to check the file for growth. */
  pollMs?: number;
  /**
   * When no session id is known yet, follow whichever transcript in the
   * project directory was touched most recently. Needed with --no-hooks,
   * where nothing ever reports the real session id.
   */
  followNewest?: boolean;
}

/** Fields we pull a tool "target" from, most specific first. */
const TOOL_TARGET_KEYS = ["file_path", "path", "command", "pattern", "url", "prompt"];

/** Bytes of the file head kept as a "is this still the same file" fingerprint. */
const HEAD_BYTES = 64;

export class TranscriptTailer extends EventEmitter {
  private readonly pollMs: number;
  private readonly followNewest: boolean;
  private timer: NodeJS.Timeout | null = null;
  private path: string | null = null;
  private sessionId: string | undefined;
  private offset = 0;
  private pending: Buffer = Buffer.alloc(0);
  /** First bytes of the file we're following — see the resync note in poll(). */
  private head: Buffer = Buffer.alloc(0);
  private readonly seenUuids = new Set<string>();

  constructor(
    private readonly projectsDir: string,
    options: TranscriptTailerOptions = {},
  ) {
    super();
    this.pollMs = options.pollMs ?? 250;
    this.followNewest = options.followNewest ?? false;
  }

  get currentPath(): string | null {
    return this.path;
  }

  get currentSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Point the tailer at a session. Starts from the end of the file: we want
   * what Claude says from now on, not a replay of the whole conversation.
   */
  setSession(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.switchTo(join(this.projectsDir, `${sessionId}.jsonl`));
  }

  start(): void {
    if (this.timer) return;
    if (!this.path && this.followNewest) this.followNewestFile();
    this.timer = setInterval(() => this.poll(), this.pollMs);
    // Node shouldn't stay alive just to poll a log file.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Exposed for tests; the interval calls this. */
  poll(): void {
    if (!this.path && this.followNewest) this.followNewestFile();
    if (!this.path) return;

    let size: number;
    try {
      size = statSync(this.path).size;
    } catch {
      return; // not created yet, or removed — try again next tick
    }

    // Rewritten underneath us: resync from the top. A shrinking size catches
    // an in-place truncate, but not a delete-and-recreate at a similar size —
    // and we can't lean on the inode, since filesystems happily hand the freed
    // one straight back. Comparing the opening bytes catches both, and costs
    // one 64-byte read per tick.
    const head = this.readHead(this.path, size);
    const replaced =
      this.head.length > 0 && !head.subarray(0, this.head.length).equals(this.head);
    if (size < this.offset || replaced) {
      this.offset = 0;
      this.pending = Buffer.alloc(0);
    }
    this.head = head;
    if (size === this.offset) return;

    let chunk: Buffer;
    try {
      chunk = this.readRange(this.path, this.offset, size);
    } catch (err) {
      this.emit("error", err as Error);
      return;
    }
    this.offset = size;

    // Buffer, not string, concatenation: a read can land mid-UTF-8-sequence
    // and decoding the halves separately would corrupt the character.
    this.pending = Buffer.concat([this.pending, chunk]);
    let nl: number;
    while ((nl = this.pending.indexOf(0x0a)) !== -1) {
      const line = this.pending.subarray(0, nl).toString("utf8");
      this.pending = this.pending.subarray(nl + 1);
      this.handleLine(line);
    }
  }

  private readHead(path: string, size: number): Buffer {
    const n = Math.min(HEAD_BYTES, size);
    if (n <= 0) return Buffer.alloc(0);
    try {
      return this.readRange(path, 0, n);
    } catch {
      return Buffer.alloc(0);
    }
  }

  private readRange(path: string, from: number, to: number): Buffer {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(to - from);
      const read = readSync(fd, buf, 0, buf.length, from);
      return read === buf.length ? buf : buf.subarray(0, read);
    } finally {
      closeSync(fd);
    }
  }

  private switchTo(path: string): void {
    this.path = path;
    this.pending = Buffer.alloc(0);
    // Seek to EOF so history doesn't replay as if it just happened.
    try {
      this.offset = statSync(path).size;
      this.head = this.readHead(path, this.offset);
    } catch {
      this.offset = 0; // file appears once claude writes its first message
      this.head = Buffer.alloc(0);
    }
  }

  private followNewestFile(): void {
    let newest: { path: string; mtimeMs: number } | null = null;
    let files: string[];
    try {
      files = readdirSync(this.projectsDir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return; // project has no transcripts yet
    }
    for (const file of files) {
      const path = join(this.projectsDir, file);
      try {
        const st = statSync(path);
        if (!newest || st.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: st.mtimeMs };
      } catch {
        // unreadable — skip
      }
    }
    if (newest && newest.path !== this.path) {
      this.sessionId = basename(newest.path, ".jsonl");
      this.switchTo(newest.path);
    }
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      return; // partial write or a shape we don't know
    }
    // Subagent transcripts interleave here; they aren't what the user asked.
    if (obj.isSidechain === true) return;
    if (obj.type !== "assistant") return;

    const message = obj.message as { content?: unknown } | undefined;
    if (!message) return;

    const uuid = typeof obj.uuid === "string" ? obj.uuid : undefined;
    // Streaming transcripts can rewrite a message as it grows; only the first
    // sighting of a uuid is emitted so a reply isn't announced twice.
    if (uuid) {
      if (this.seenUuids.has(uuid)) return;
      this.seenUuids.add(uuid);
      if (this.seenUuids.size > 5000) this.seenUuids.clear();
    }

    const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : this.sessionId;
    const at = Date.now();

    const content = message.content;
    if (typeof content === "string") {
      if (content.trim()) this.emit("assistant", { sessionId, uuid, text: content, at });
      return;
    }
    if (!Array.isArray(content)) return;

    const texts: string[] = [];
    for (const raw of content) {
      if (typeof raw !== "object" || raw === null) continue;
      const block = raw as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string") {
        if (block.text.trim()) texts.push(block.text);
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        this.emit("tool", { name: block.name, target: toolTarget(block.input), at });
      }
      // "thinking" blocks are deliberately ignored — a HUD showing reasoning
      // instead of the answer is worse than showing nothing.
    }
    if (texts.length) {
      this.emit("assistant", { sessionId, uuid, text: texts.join("\n\n"), at });
    }
  }
}

/** Best-effort short label for what a tool is acting on. */
function toolTarget(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  for (const key of TOOL_TARGET_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      const flat = value.replace(/\s+/g, " ").trim();
      return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
    }
  }
  return undefined;
}

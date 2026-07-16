import { EventEmitter } from "node:events";
import { spawn, type IPty } from "node-pty";
import { RingBuffer } from "./ring-buffer.js";

export interface PtyManagerOptions {
  claudeBin: string;
  cwd: string;
  /** Extra argv appended to every launch (e.g. --settings <hooks file>). */
  extraArgs?: string[];
  cols?: number;
  rows?: number;
}

export interface StartOptions {
  /** Resume this conversation instead of starting a fresh one. */
  resumeSessionId?: string;
}

/**
 * Owns the claude CLI process running inside a pseudo-terminal.
 *
 * Events:
 *  - "data"    (chunk: string)  raw PTY output
 *  - "exit"    (code: number)   claude process ended
 *  - "spawned" (info: { resumedFrom?: string })
 */
export class PtyManager extends EventEmitter {
  private pty: IPty | null = null;
  private readonly ring = new RingBuffer();
  private cols: number;
  private rows: number;
  private lastResumedFrom: string | undefined;

  constructor(private readonly opts: PtyManagerOptions) {
    super();
    this.cols = opts.cols ?? 100;
    this.rows = opts.rows ?? 30;
  }

  get running(): boolean {
    return this.pty !== null;
  }

  get resumedFrom(): string | undefined {
    return this.lastResumedFrom;
  }

  start(startOpts: StartOptions = {}): void {
    if (this.pty) this.stop();
    const args = [...(this.opts.extraArgs ?? [])];
    if (startOpts.resumeSessionId) args.push("--resume", startOpts.resumeSessionId);
    this.lastResumedFrom = startOpts.resumeSessionId;

    // Nested-run guards: claude refuses some behaviors when it thinks it is
    // running inside another claude session (e.g. claude-pad launched from a
    // claude-driven terminal), so scrub those markers.
    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SSE_PORT;

    const pty = spawn(this.opts.claudeBin, args, {
      name: "xterm-256color",
      cols: this.cols,
      rows: this.rows,
      cwd: this.opts.cwd,
      env,
    });
    this.pty = pty;
    this.ring.clear();

    pty.onData((chunk) => {
      this.ring.push(chunk);
      this.emit("data", chunk);
    });
    pty.onExit(({ exitCode }) => {
      if (this.pty === pty) this.pty = null;
      this.emit("exit", exitCode);
    });
    this.emit("spawned", { resumedFrom: startOpts.resumeSessionId });
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      this.cols = cols;
      this.rows = rows;
      this.pty?.resize(cols, rows);
    }
  }

  /** Kill the current claude and start another (fresh or resumed). */
  restart(startOpts: StartOptions = {}): void {
    this.start(startOpts);
  }

  stop(): void {
    const pty = this.pty;
    this.pty = null;
    if (pty) {
      try {
        pty.kill();
      } catch {
        // already dead
      }
    }
  }

  replaySnapshot(): string {
    return this.ring.snapshot();
  }
}

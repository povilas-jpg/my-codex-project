import type { KeyName, PadEvent } from "../../shared/text-protocol.js";

/**
 * What the wearer sees and does, independent of which SDK is delivering it.
 *
 * The MentraOS cloud SDK and the on-phone miniapp SDK have different APIs but
 * the same shape of interaction: speech in, five lines out, a touchpad for
 * paging and approvals. This class holds that logic once so both adapters are
 * thin, and so it can be tested without any glasses.
 */

/** The two or three things a HUD can actually do. */
export interface Display {
  /** Main view: up to `lines` short lines. */
  text(body: string): void;
  /** Dashboard slot: a label and a value. */
  status?(left: string, right: string): void;
}

/** The subset of the pad client this controller needs (narrow, so it fakes easily). */
export interface PadCommands {
  prompt(text: string, submit?: boolean): Promise<unknown>;
  key(key: KeyName): Promise<unknown>;
  newSession(): Promise<unknown>;
}

export interface GlassesSessionOptions {
  client: PadCommands;
  display: Display;
  /**
   * Only forward speech to Claude while the mic is explicitly armed.
   *
   * This is the security boundary that matters: the pad drives a real shell
   * on your machine, and always-listening would mean anyone talking near you
   * can run commands. Defaults to true; turning it off is a deliberate choice.
   */
  pushToTalk?: boolean;
  /** Called for anything worth logging by the host adapter. */
  onLog?: (message: string) => void;
}

export type Phase = "idle" | "listening" | "working" | "waiting" | "reading";

const HINT_MORE = "▾ swipe for more";
const HINT_APPROVE = "tap = approve · hold = reject";

export class GlassesSession {
  private readonly client: PadCommands;
  private readonly display: Display;
  private readonly pushToTalk: boolean;
  private readonly log: (message: string) => void;

  private phase: Phase = "idle";
  private micArmed = false;
  private pages: string[] = [];
  private pageIndex = 0;
  private lastTool: string | null = null;

  constructor(options: GlassesSessionOptions) {
    this.client = options.client;
    this.display = options.display;
    this.pushToTalk = options.pushToTalk ?? true;
    this.log = options.onLog ?? (() => {});
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  get listening(): boolean {
    return this.micArmed;
  }

  get currentPage(): string {
    return this.pages[this.pageIndex] ?? "";
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Show the opening screen. */
  begin(): void {
    this.phase = "idle";
    this.render("Claude ready", this.pushToTalk ? "tap to talk" : "listening");
  }

  // ── input ───────────────────────────────────────────────────────────────

  /** Wearer started a push-to-talk gesture. */
  armMic(): void {
    if (this.phase === "waiting") return; // a permission prompt needs an answer, not a prompt
    this.micArmed = true;
    this.phase = "listening";
    this.render("Listening…", "");
  }

  disarmMic(): void {
    this.micArmed = false;
    if (this.phase === "listening") this.phase = "idle";
  }

  /**
   * A speech transcript from the glasses.
   *
   * Interim results are echoed so the wearer can see they're being heard;
   * only a final result is sent to Claude.
   */
  async onTranscript(text: string, isFinal: boolean): Promise<void> {
    if (this.pushToTalk && !this.micArmed) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isFinal) {
      this.phase = "listening";
      this.render(trimmed, "listening…");
      return;
    }

    this.micArmed = false;
    this.phase = "working";
    this.pages = [];
    this.pageIndex = 0;
    this.render(trimmed, "sent");
    try {
      await this.client.prompt(trimmed);
    } catch (err) {
      this.phase = "idle";
      this.render(`Couldn't reach Claude:\n${(err as Error).message}`, "error");
    }
  }

  /** Answer a permission prompt, or page forward through a reply. */
  async tap(): Promise<void> {
    if (this.phase === "waiting") {
      await this.send("enter", "approved");
      return;
    }
    this.nextPage();
  }

  /** Reject a permission prompt, or interrupt a running turn. */
  async hold(): Promise<void> {
    if (this.phase === "waiting") {
      await this.send("escape", "rejected");
      return;
    }
    if (this.phase === "working") {
      await this.send("escape", "interrupted");
      this.phase = "idle";
    }
  }

  nextPage(): void {
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.renderPage();
    }
  }

  prevPage(): void {
    if (this.pageIndex > 0) {
      this.pageIndex--;
      this.renderPage();
    }
  }

  private async send(key: KeyName, note: string): Promise<void> {
    try {
      await this.client.key(key);
      this.phase = "working";
      this.render(note, "");
    } catch (err) {
      this.render(`Failed: ${(err as Error).message}`, "error");
    }
  }

  // ── output ──────────────────────────────────────────────────────────────

  /** Feed one frame from the pad's event stream. */
  handleEvent(event: PadEvent): void {
    switch (event.type) {
      case "state":
        if (event.status === "working") {
          this.phase = "working";
          this.render("Working…", this.lastTool ?? "");
        } else if (event.status === "exited") {
          this.phase = "idle";
          this.render("Claude session ended", "");
        } else if (event.status === "error") {
          this.phase = "idle";
          this.render(event.detail ?? "Something failed", "error");
        }
        break;

      case "tool": {
        this.lastTool = event.target ? `${event.name}: ${event.target}` : event.name;
        // Only narrate tools while nothing more useful is on screen.
        if (this.phase === "working") this.render("Working…", this.lastTool);
        break;
      }

      case "reply":
        this.lastTool = null;
        this.pages = event.pages.length ? event.pages : [event.summary || "(no reply)"];
        this.pageIndex = 0;
        this.phase = "reading";
        this.renderPage();
        break;

      case "needs_input":
        this.phase = "waiting";
        this.render(event.detail ?? "Claude needs your approval", HINT_APPROVE);
        break;

      case "turn_end":
        // Stay on the reply; just stop implying work is still happening.
        if (this.phase === "working") {
          this.phase = "idle";
          this.render("Done", "");
        } else {
          this.phase = "reading";
        }
        break;
    }
  }

  private renderPage(): void {
    const body = this.pages[this.pageIndex] ?? "";
    const more = this.pageIndex < this.pages.length - 1;
    const hint =
      this.pages.length > 1
        ? `${this.pageIndex + 1}/${this.pages.length}${more ? ` ${HINT_MORE}` : ""}`
        : "";
    this.render(body, hint);
  }

  private render(body: string, status: string): void {
    this.display.text(body);
    this.display.status?.("Claude", status || this.phase);
    this.log(`[${this.phase}] ${body.split("\n")[0] ?? ""}`);
  }
}

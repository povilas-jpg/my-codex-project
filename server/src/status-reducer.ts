import { EventEmitter } from "node:events";
import type { PadStatus } from "../../shared/protocol.js";

/** Hook events posted by claude (see hooks-settings.ts). */
export type HookEvent =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SessionEnd";

export interface StatusSnapshot {
  status: PadStatus;
  detail?: string;
}

/**
 * Merges claude hook events (reliable, version-stable) with light PTY
 * heuristics (fallback) into a single LED state.
 *
 * Hook-driven transitions:
 *   SessionStart        -> idle
 *   UserPromptSubmit    -> working
 *   PreToolUse          -> tool (detail: tool name)
 *   PostToolUse         -> working
 *   Notification        -> waiting (claude needs input/permission)
 *   Stop                -> done
 *   SessionEnd          -> exited
 *
 * PTY heuristics only ever move idle<->working ("esc to interrupt" spinner
 * marker) so a wrong guess can't mask a hook-driven "waiting".
 *
 * Emits "change" (snapshot: StatusSnapshot).
 */
export class StatusReducer extends EventEmitter {
  private snap: StatusSnapshot = { status: "starting" };
  private doneResetTimer: NodeJS.Timeout | null = null;

  get snapshot(): StatusSnapshot {
    return this.snap;
  }

  onPtySpawned(): void {
    this.set({ status: "starting" });
  }

  onPtyExit(code: number): void {
    this.set({ status: "exited", detail: `claude exited (code ${code})` });
  }

  onHook(event: HookEvent, payload: Record<string, unknown> = {}): void {
    switch (event) {
      case "SessionStart":
        this.set({ status: "idle" });
        break;
      case "UserPromptSubmit":
        this.set({ status: "working" });
        break;
      case "PreToolUse":
        this.set({ status: "tool", detail: typeof payload.tool_name === "string" ? payload.tool_name : undefined });
        break;
      case "PostToolUse":
        this.set({ status: "working" });
        break;
      case "Notification":
        this.set({
          status: "waiting",
          detail: typeof payload.message === "string" ? payload.message : undefined,
        });
        break;
      case "Stop":
        this.set({ status: "done" });
        // After a finished turn, settle back to idle so "done" reads as a blink.
        this.doneResetTimer = setTimeout(() => {
          if (this.snap.status === "done") this.set({ status: "idle" });
        }, 4000);
        break;
      case "SessionEnd":
        this.set({ status: "exited" });
        break;
    }
  }

  /**
   * Fallback heuristic on raw PTY output. The interactive TUI shows
   * "esc to interrupt" while a turn is running. Only toggles idle<->working.
   */
  onPtyData(chunk: string): void {
    if (this.snap.status === "idle" && /esc to interrupt/i.test(chunk)) {
      this.set({ status: "working" });
    }
  }

  private set(next: StatusSnapshot): void {
    if (this.doneResetTimer && next.status !== "done") {
      clearTimeout(this.doneResetTimer);
      this.doneResetTimer = null;
    }
    if (this.snap.status === next.status && this.snap.detail === next.detail) return;
    this.snap = next;
    this.emit("change", next);
  }
}

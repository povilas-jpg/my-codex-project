/**
 * Entry point for the on-phone miniapp.
 *
 * This is the only file that touches `@mentra/miniapp` directly. That package
 * is pre-release — it lives on the MentraOS `mentra-miniapp-sdk` branch and
 * resolves as a `file:` dependency, not from npm — so it is imported
 * dynamically and adapted to the small structural interface in attach.ts.
 * When the SDK lands on npm, this file is the only one that should need edits.
 *
 * Build and run with the miniapp CLI (`mentra-miniapp dev`); see
 * ../../README.md for the branch checkout steps.
 */
import { attachMiniapp, type MiniappRuntime } from "./attach.js";

/** Settings the wearer fills in on the miniapp's own settings screen. */
interface MiniappSettings {
  padUrl: string;
  padToken?: string;
  columns?: number;
  lines?: number;
  pushToTalk?: boolean;
}

declare global {
  interface Window {
    __CLAUDE_PAD_SETTINGS__?: MiniappSettings;
  }
}

async function main(): Promise<void> {
  // Imported through a variable specifier on purpose: the package is a
  // pre-release `file:` dependency, so a literal import would make this file
  // fail to typecheck for anyone who only wants the cloud adapter. A missing
  // SDK becomes the clear runtime message below instead of a build error.
  const specifier = "@mentra/miniapp";
  const sdk = (await import(/* @vite-ignore */ specifier).catch(() => null)) as {
    createSession?: () => Promise<unknown>;
  } | null;

  if (!sdk?.createSession) {
    throw new Error(
      "@mentra/miniapp not found. Check out the MentraOS repo on the " +
        "mentra-miniapp-sdk branch and link sdk/miniapp — see bridge/README.md.",
    );
  }

  const runtime = (await sdk.createSession()) as MiniappRuntime;

  const settings: MiniappSettings = window.__CLAUDE_PAD_SETTINGS__ ?? {
    padUrl: "http://claude-pad.tailnet.ts.net:7433",
  };

  if (!settings.padUrl) {
    runtime.display.showTextWall("Set the claude-pad URL in settings");
    return;
  }

  attachMiniapp(runtime, {
    padUrl: settings.padUrl,
    padToken: settings.padToken,
    columns: settings.columns,
    lines: settings.lines,
    // Only ever an explicit opt-out: the pad drives a real shell.
    pushToTalk: settings.pushToTalk !== false,
  });
}

main().catch((err: unknown) => {
  console.error("claude-glasses miniapp failed to start:", err);
});

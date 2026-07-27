import { G2_GEOMETRY } from "../../shared/text-protocol.js";

/**
 * Bridge configuration, read from the environment.
 *
 * Only the cloud adapter needs the Mentra credentials; the miniapp runs on the
 * phone and is configured from its own settings screen, so those fields are
 * validated lazily rather than up front.
 */

export interface BridgeConfig {
  /** Where claude-pad is reachable — a tailnet name, not a public host. */
  padUrl: string;
  padToken?: string;
  columns: number;
  lines: number;
  pushToTalk: boolean;
  /** Cloud adapter only. */
  packageName: string;
  apiKey: string;
  port: number;
}

export function loadBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const padUrl = env.CLAUDE_PAD_URL ?? "http://127.0.0.1:7433";
  const padToken = env.CLAUDE_PAD_TOKEN;

  if (isPublicHost(padUrl) && !padToken) {
    // The pad drives a shell. Reaching it over anything but loopback without a
    // token would leave that shell open to whoever finds the port.
    throw new Error(
      `CLAUDE_PAD_TOKEN is required when CLAUDE_PAD_URL is not loopback (${padUrl}).\n` +
        `claude-pad prints the token on startup when it binds to a non-loopback address.`,
    );
  }

  return {
    padUrl,
    padToken,
    columns: intFromEnv(env.GLASSES_COLUMNS, G2_GEOMETRY.columns),
    lines: intFromEnv(env.GLASSES_LINES, G2_GEOMETRY.lines),
    // Opt-out, not opt-in: always-listening means ambient speech reaches a shell.
    pushToTalk: env.GLASSES_PUSH_TO_TALK !== "false",
    packageName: env.MENTRA_PACKAGE_NAME ?? "",
    apiKey: env.MENTRA_API_KEY ?? "",
    port: intFromEnv(env.PORT, 7010),
  };
}

export function isPublicHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true; // unparseable — assume the risky case
  }
  return !(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1");
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

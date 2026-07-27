import { AppServer, type AppSession } from "@mentra/sdk";
import { loadBridgeConfig } from "../config.js";
import { ClaudePadClient } from "../claude-client.js";
import { GlassesSession } from "../glasses-session.js";

/**
 * MentraOS **cloud** adapter — the fallback path.
 *
 * Runs as its own server that MentraOS Cloud calls back into, which means it
 * needs a publicly reachable HTTPS URL and that transcripts and Claude's
 * replies transit Mentra's relay. Prefer the miniapp adapter, which keeps
 * everything on your tailnet; use this one when you need the published,
 * stable SDK.
 *
 *   MENTRA_PACKAGE_NAME=com.you.claude MENTRA_API_KEY=... \
 *   CLAUDE_PAD_URL=http://pi.tail1234.ts.net:7433 CLAUDE_PAD_TOKEN=... \
 *   node dist/cloud/server.js
 */

const config = loadBridgeConfig();

class ClaudeBridgeServer extends AppServer {
  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    session.logger.info({ sessionId, userId }, "glasses connected; wiring claude-pad");

    const client = new ClaudePadClient({
      baseUrl: config.padUrl,
      token: config.padToken,
      columns: config.columns,
      lines: config.lines,
    });

    const glasses = new GlassesSession({
      client,
      pushToTalk: config.pushToTalk,
      display: {
        text: (body) => session.layouts.showTextWall(body),
        status: (left, right) => session.layouts.showDashboardCard(left, right),
      },
      onLog: (message) => session.logger.debug(message),
    });

    glasses.begin();

    // Speech. Gated by GlassesSession unless push-to-talk is disabled.
    session.events.onTranscription((data) => {
      void glasses.onTranscript(data.text, data.isFinal);
    });

    // Temple pad: short press talks (or pages), long press rejects/interrupts.
    session.events.onButtonPress((data) => {
      if (data.pressType === "long") {
        void glasses.hold();
      } else if (glasses.listening) {
        glasses.disarmMic();
      } else if (glasses.currentPhase === "reading" || glasses.currentPhase === "waiting") {
        void glasses.tap();
      } else {
        glasses.armMic();
      }
    });

    // Swipes page through a long reply.
    session.events.onTouchEvent((event) => {
      const gesture = (event as { gesture_name?: string }).gesture_name ?? "";
      if (gesture.includes("forward")) glasses.nextPage();
      else if (gesture.includes("backward")) glasses.prevPage();
    });

    // Follow the pad until the wearer disconnects.
    void client
      .connect({
        onEvent: (event) => glasses.handleEvent(event),
        onOpen: () => session.logger.info("connected to claude-pad"),
        onError: (err) => session.logger.warn({ err: err.message }, "claude-pad stream dropped"),
      })
      .catch((err) => session.logger.error({ err }, "claude-pad connection ended"));

    session.events.onDisconnected(() => {
      client.close();
      session.logger.info("glasses disconnected; closed claude-pad stream");
    });
  }
}

const server = new ClaudeBridgeServer({
  packageName: config.packageName,
  apiKey: config.apiKey,
  port: config.port,
});

server.start().then(
  () => console.log(`claude-glasses cloud bridge listening on :${config.port}`),
  (err: unknown) => {
    console.error("failed to start:", err);
    process.exit(1);
  },
);

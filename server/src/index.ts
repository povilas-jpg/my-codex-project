import { existsSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { DEFAULT_PORT, type SessionInfo } from "../../shared/protocol.js";
import { loadConfig } from "./config.js";
import { registerHookReceiver } from "./hook-receiver.js";
import { writeHookSettingsFile } from "./hooks-settings.js";
import { PtyManager } from "./pty-manager.js";
import { SessionStore } from "./session-store.js";
import { StatusReducer } from "./status-reducer.js";
import { registerTextApi } from "./text-api.js";
import { TranscriptTailer } from "./transcript-tailer.js";
import { registerWs } from "./ws-handler.js";

interface CliArgs {
  dir: string;
  port: number;
  host: string;
  claudeBin: string;
  configPath?: string;
  noHooks: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dir: process.cwd(),
    port: DEFAULT_PORT,
    host: "127.0.0.1",
    claudeBin: "claude",
    noHooks: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--dir":
        args.dir = resolve(next());
        break;
      case "--port":
        args.port = Number(next());
        break;
      case "--host":
        args.host = next();
        break;
      case "--claude-bin":
        args.claudeBin = next();
        break;
      case "--config":
        args.configPath = resolve(next());
        break;
      case "--no-hooks":
        args.noHooks = true;
        break;
      case "--help":
      case "-h":
        console.log(
          `claude-pad [options]\n\n` +
            `  --dir <path>         project directory claude works in (default: cwd)\n` +
            `  --port <n>           server port (default: ${DEFAULT_PORT})\n` +
            `  --host <addr>        bind address (default: 127.0.0.1; non-loopback enables token auth)\n` +
            `  --claude-bin <path>  claude executable (default: claude on PATH)\n` +
            `  --config <path>      claudepad.config.json path\n` +
            `  --no-hooks           don't wire status hooks (LEDs fall back to heuristics)\n`,
        );
        process.exit(0);
    }
  }
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error(`invalid --port`);
  }
  return args;
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function lanAddress(): string | undefined {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.dir) || !statSync(args.dir).isDirectory()) {
    console.error(`error: --dir ${args.dir} is not a directory`);
    process.exit(1);
  }

  // Preflight: claude must exist and run.
  const probe = spawnSync(args.claudeBin, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    console.error(
      `error: could not run "${args.claudeBin} --version".\n` +
        `Install Claude Code first: npm install -g @anthropic-ai/claude-code\n` +
        `(or pass --claude-bin /path/to/claude)`,
    );
    process.exit(1);
  }
  const claudeVersion = (probe.stdout.trim().split("\n")[0] ?? "").trim();

  const config = loadConfig(
    args.configPath ?? (existsSync(join(process.cwd(), "claudepad.config.json"))
      ? join(process.cwd(), "claudepad.config.json")
      : undefined),
  );

  const token =
    args.host === "127.0.0.1" || args.host === "localhost" || args.host === "::1"
      ? undefined
      : randomBytes(16).toString("hex");

  const extraArgs: string[] = [];
  if (!args.noHooks) {
    const settingsFile = writeHookSettingsFile(args.port);
    extraArgs.push("--settings", settingsFile);
  }

  const pty = new PtyManager({ claudeBin: args.claudeBin, cwd: args.dir, extraArgs });
  const status = new StatusReducer();
  const store = new SessionStore(args.dir);
  // Without hooks nothing ever reports the session id, so fall back to
  // following whichever transcript in this project was touched last.
  const tailer = new TranscriptTailer(store.projectsDir, { followNewest: args.noHooks });

  const session: SessionInfo = {
    cwd: args.dir,
    startedAt: Date.now(),
    claudeVersion,
  };
  pty.on("spawned", ({ resumedFrom }: { resumedFrom?: string }) => {
    session.startedAt = Date.now();
    session.resumedFrom = resumedFrom;
    session.sessionId = resumedFrom; // until a hook reports the real id
  });

  const app = Fastify({ logger: false });
  await app.register(websocket);

  const hub = registerWs(app, {
    pty,
    status,
    store,
    config,
    token,
    sessionInfo: () => session,
  });

  registerTextApi(app, {
    pty,
    status,
    tailer,
    token,
    sessionInfo: () => session,
  });

  registerHookReceiver(app, {
    status,
    onSessionId: (id) => {
      tailer.setSession(id);
      if (session.sessionId !== id) {
        session.sessionId = id;
        hub.broadcast({ type: "session_info", session });
      }
    },
  });

  app.get("/api/health", async () => ({ ok: true, claudeVersion }));

  // Serve the built web UI when present (production); Vite serves it in dev.
  const pkgRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const webDist = join(pkgRoot, "web", "dist");
  if (existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  await app.listen({ port: args.port, host: args.host });
  pty.start();
  tailer.start();

  const urlToken = token ? `?token=${token}` : "";
  console.log(`\nclaude-pad ready`);
  console.log(`  project : ${args.dir}`);
  console.log(`  claude  : ${claudeVersion}`);
  console.log(`  local   : http://localhost:${args.port}/${urlToken}`);
  if (token) {
    const lan = lanAddress();
    if (lan) console.log(`  network : http://${lan}:${args.port}/${urlToken}`);
    console.log(`  note    : token required — anyone with the URL controls this terminal`);
  }

  const shutdown = () => {
    tailer.stop();
    pty.stop();
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

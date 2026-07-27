# claude-glasses-bridge

Bridges Even Realities G2 smart glasses to a [claude-pad](../README.md)
session: speech in, Claude's replies on the lens.

Full setup — Raspberry Pi, Tailscale, wearing it, security model — is in
[docs/GLASSES.md](../docs/GLASSES.md). This file covers the code.

## Layout

```
src/
  claude-client.ts     HTTP + SSE client for the pad's text API (reconnects)
  glasses-session.ts   the wearer UX — SDK-agnostic, fully unit-tested
  config.ts            env config, with the token safety check
  cloud/server.ts      adapter for the published @mentra/sdk
  miniapp/attach.ts    adapter for the on-phone miniapp runtime
  miniapp/main.ts      the only file that imports @mentra/miniapp
```

`glasses-session.ts` holds every decision about what the wearer sees and what
a gesture means, so the two adapters stay thin and the behaviour can be tested
without hardware. Both adapters do the same three things: feed transcripts in,
feed pad events in, wire the touchpad.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CLAUDE_PAD_URL` | `http://127.0.0.1:7433` | where claude-pad is listening |
| `CLAUDE_PAD_TOKEN` | — | **required** unless the pad URL is loopback |
| `GLASSES_COLUMNS` | `40` | characters per line |
| `GLASSES_LINES` | `5` | lines per page |
| `GLASSES_PUSH_TO_TALK` | `true` | `false` makes the mic always-on |
| `MENTRA_PACKAGE_NAME` | — | cloud adapter only |
| `MENTRA_API_KEY` | — | cloud adapter only |
| `PORT` | `7010` | cloud adapter only |

`loadBridgeConfig` refuses to start with a non-loopback pad URL and no token.
The pad drives a real shell; that combination is never what you meant.

`GLASSES_PUSH_TO_TALK=false` is an opt-out, not a convenience. With it off,
anyone speaking near you is typing into that shell.

## Running

```bash
npm install
npm run dev:cloud     # cloud adapter against @mentra/sdk
npm run typecheck
```

Tests live with the rest of the suite (`npm test` at the repo root) because
they share the protocol types in `shared/`.

## The miniapp SDK

`@mentra/miniapp` is pre-release: not published to npm, resolved as a `file:`
dependency from the MentraOS repo's `mentra-miniapp-sdk` branch. `main.ts`
imports it through a variable specifier so the rest of the bridge builds
without it — a missing SDK is a clear runtime message, not a build failure.

When it lands on npm, `main.ts` should be the only file that needs changing.

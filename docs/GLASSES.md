# Claude on Even Realities G2

Talk to Claude Code through your glasses, with the session running on a
Raspberry Pi you reach from anywhere over Tailscale.

```
   G2 glasses  (mic · touchpad · 5-line HUD)
        ⇅ BLE
   phone  (MentraOS app running the miniapp)
        ⇅ HTTPS over your tailnet — never the public internet
   claude-pad on the Pi
        ⇅ PTY
   the real `claude` CLI  ← your Claude subscription, no API key
```

Nothing here uses the Agent SDK, so there is no per-token billing: the bridge
types into the same interactive CLI you'd use at a terminal.

## What runs where

| Piece | Where | What it does |
|---|---|---|
| `claude` | the Pi | the real CLI, logged into your account |
| claude-pad | the Pi | owns the PTY, exposes the WebSocket + text API |
| bridge | phone (miniapp) or the Pi (cloud adapter) | speech in, HUD pages out |
| MentraOS app | phone | BLE link to the glasses |

## 1. Set up the Pi

You need a 64-bit Raspberry Pi OS on a Pi 4 or 5. 4GB RAM is comfortable; 2GB
works but swaps. A 32-bit install will not work — Claude Code is 64-bit only.

```bash
# on the Pi
sudo apt-get update && sudo apt-get install -y build-essential python3
# Node 20+ (nodesource, or your preferred method)
npm install -g @anthropic-ai/claude-code
claude          # sign in once, interactively — this is the only manual step
```

`build-essential` and `python3` are not optional: node-pty compiles a native
addon and the failure without them is cryptic.

Then, from a checkout of this repo on the Pi:

```bash
bash scripts/pi-setup.sh --dir ~/code/your-project
```

That script checks the prerequisites, installs and brings up Tailscale, binds
claude-pad **to the tailnet address only**, provisions a stable access token,
and installs a systemd user service (with lingering enabled, so it survives
logout and reboot).

It prints the URL and token at the end. Both are also recoverable later:

```bash
cat ~/.config/claude-pad/token
systemctl --user status claude-pad
journalctl --user -u claude-pad -f
```

### Why the tailnet and not a public URL

The pad drives a real shell on the Pi. Anyone who can reach it and holds the
token can run commands there. Tailscale means the port is not exposed to the
internet at all — there is nothing to find and nothing to brute-force. The
setup script never enables `tailscale funnel`, and warns if it finds funnel
already serving something on that machine.

Add your phone to the same tailnet (install Tailscale from the App Store /
Play Store and sign in) and it will reach the Pi from any network.

## 2. Set up the glasses

Two adapters, same backend. Pick one.

### Miniapp — recommended

A JS bundle that runs inside the MentraOS app on your phone and drives the
glasses over BLE. **Nothing crosses a third-party server**: the phone is on
your tailnet and talks to the Pi directly.

The catch: `@mentra/miniapp` is still pre-release. It is not on npm — it lives
on the MentraOS repo's `mentra-miniapp-sdk` branch and resolves as a `file:`
dependency.

```bash
git clone -b mentra-miniapp-sdk https://github.com/Mentra-Community/MentraOS
cd bridge
npm install
npm link ../MentraOS/sdk/miniapp ../MentraOS/sdk/miniapp-cli
npx mentra-miniapp dev
```

Then set the pad URL and token on the miniapp's settings screen.

`bridge/src/miniapp/main.ts` is the only file that touches that SDK, and it
imports it dynamically — so if the API shifts, that's the one file to fix.

### Cloud adapter — the stable fallback

Uses the published `@mentra/sdk`. Works today, but transcripts and Claude's
replies transit MentraOS Cloud, and it needs a **publicly reachable** HTTPS
URL for the webhook (Tailscale Funnel, or a tunnel of your choice).

```bash
cd bridge
npm install
export MENTRA_PACKAGE_NAME=com.yourname.claude   # must match console.mentra.glass
export MENTRA_API_KEY=...
export CLAUDE_PAD_URL=http://your-pi.tail1234.ts.net:7433
export CLAUDE_PAD_TOKEN=...
npm run dev:cloud
```

Register the app at [console.mentra.glass](https://console.mentra.glass) with
your public URL, then launch it from the Mentra app on your phone.

## 3. Wearing it

| Gesture | Does |
|---|---|
| tap temple | arm the mic — speak, and it's sent when you stop |
| tap (while reading) | next page |
| swipe forward / back | page through a long reply |
| tap (on a permission prompt) | approve |
| long press | reject a prompt, or interrupt a running turn |

Replies arrive as pages sized to the display, with a `2/5` counter when there's
more. Long code blocks collapse to `[code: N lines]` rather than filling the
lens — read those on a real screen.

## Security model

Read this part.

**Push-to-talk is on by default and you should leave it on.** The mic is only
live between an explicit tap and the end of your sentence. With it off
(`GLASSES_PUSH_TO_TALK=false`), anyone talking near you is typing into a shell
on your Pi.

**Keep permission prompts on.** Do not run the pad's `claude` with
`--dangerously-skip-permissions`. The whole point of the approve/reject gesture
is that you stay in the loop for anything destructive — and on a HUD you are
reviewing a one-line summary, not a full diff, so the prompts matter more here
than at a terminal, not less.

**Scope the working directory.** `--dir` pins which project the session can
touch. Point it at one project, not at `~`.

**The token is a password.** It is stable across restarts by design, stored
0600 at `~/.config/claude-pad/token`, and passed to systemd through an
`EnvironmentFile` because unit files are world-readable. Rotate it by deleting
that file and re-running the setup script.

**What Mentra sees**, if you use the cloud adapter: your speech goes to their
relay and on to a third-party speech-to-text provider (Soniox), and Claude's
replies pass back through the relay to reach the lens. Their privacy notice
says raw audio isn't retained and transcripts aren't stored. The miniapp path
avoids the relay entirely — only speech-to-text is shared.

## The text API

The bridge is a client of a general-purpose API, so anything else can drive the
same session — a watch, a script, a different pair of glasses.

| Endpoint | Does |
|---|---|
| `POST /api/prompt` | `{text, submit?}` → `{turnId}` |
| `POST /api/key` | `{key}` — approve, reject, interrupt |
| `POST /api/new` | start a fresh conversation |
| `GET /api/state` | status, session, latest reply as pages |
| `GET /api/events` | SSE: state, replies, tool use, turn completion |

`?columns=40&lines=5` sets the wrapping geometry. Auth is the pad's token, as
`?token=`, `Authorization: Bearer`, or `X-Claude-Pad-Token`.

Replies come from Claude Code's own JSONL transcripts, not from scraping the
terminal, so what you get is the prose Claude actually wrote.

```bash
curl -s -X POST http://pi.tail1234.ts.net:7433/api/prompt \
  -H "Authorization: Bearer $CLAUDE_PAD_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"what changed in the last commit?"}'

curl -sN "http://pi.tail1234.ts.net:7433/api/events?columns=40&lines=5" \
  -H "Authorization: Bearer $CLAUDE_PAD_TOKEN"
```

## Troubleshooting

**Nothing on the lens.** Check the pad is up (`systemctl --user status
claude-pad`) and that the phone is on the tailnet (`tailscale status` on the
Pi should list it). The bridge logs each reconnect attempt.

**Speech does nothing.** Push-to-talk: tap the temple pad first. The HUD shows
"Listening…" when the mic is armed.

**Replies never arrive but the terminal shows them.** The tailer follows the
session id reported by the pad's hooks. With `--no-hooks` it falls back to the
most recently modified transcript in the project, which is wrong if you have
several sessions going. Drop `--no-hooks`.

**`npm install` fails on node-pty.** Missing `build-essential` / `python3`, or
Node older than 20.

**Claude Code won't install on the Pi.** Check `uname -m` — `armv7l` means a
32-bit OS. Reflash with the 64-bit image.

## Verifying the pipeline without glasses

```bash
npm test              # unit suite, incl. formatter, tailer, API, bridge
npm run test:smoke    # boots the real server against a stub claude and
                      # drives one full turn, printing the first HUD page
```

# Claude Code on Even Realities G2

Claude Code on your glasses, running on a Raspberry Pi you reach from anywhere
over Tailscale.

```
   G2 glasses (576×288 HUD)   R1 ring (input)
        ↑ BLE                      ↓ BLE
              Even app on your phone
                       ⇅
              your tailnet — no public exposure
                       ⇅
        even-terminal on the Pi  :3456
                       ⇅
              the real `claude` CLI  ← your subscription
```

The glasses side is **Even Realities' own tool**, not a third-party bridge:
[`@evenrealities/even-terminal`](https://www.npmjs.com/package/@evenrealities/even-terminal).
It spawns your `claude` binary, renders the output onto the G2 canvas, and turns
R1 ring gestures into keystrokes. The Even app has a matching **Agent Mode**
built in (Settings → Agent Mode → Add Host).

Because it wraps the interactive CLI, this runs on your Claude subscription —
no API key, no per-token billing.

## Setup

### 1. Prepare the Pi

64-bit Raspberry Pi OS on a Pi 4 or 5. 4GB RAM is comfortable, 2GB swaps. A
32-bit install will not work — check with `uname -m`, which must say `aarch64`.

```bash
# on the Pi
npm install -g @anthropic-ai/claude-code
claude          # sign in once, interactively — the only manual step
```

### 2. Run the setup script

```bash
bash scripts/pi-setup.sh --dir ~/code/your-project
```

It checks the prerequisites, installs `even-terminal` and Tailscale, provisions
a token that survives restarts, and installs a lingering systemd user service so
the whole thing comes back after a reboot. Upstream's docs assume a laptop you
type a command on and stop there; the always-on part is what this adds.

Install Tailscale on your phone too, and sign into the same tailnet. That's what
makes it work away from home — the phone is the link between the glasses and the
Pi, so the phone is what needs to reach it.

### 3. Pair it in the Even app

Settings → **Agent Mode** → Add Host, then fill in what the script printed:

| Field | Value |
|---|---|
| Host name | anything |
| Agent setup | Claude Code |
| Host | `100.x.y.z:3456` (your Pi's tailnet IP) |
| Auth Token | the token from the script |

Tap **Probe and Save**.

The scan icon in the top right takes a QR code instead, which `even-terminal`
prints at startup. Under systemd that goes to the journal, so the easiest way to
get it is to run the tool in the foreground once — the script prints the exact
command for that.

## Running it

```bash
systemctl --user status even-terminal
systemctl --user restart even-terminal
journalctl --user -u even-terminal -f
```

Token and config live in `~/.config/even-terminal/` (mode 600). Rotate the token
by deleting `token` and re-running the setup script — you'll need to update the
host entry in the app.

## Before you have the R1 ring

`even-terminal` describes input entirely as ring gestures, so without the R1 you
can see output but not steer it from the glasses. Its HTTP API works regardless,
so you can drive the same session from a phone browser, a shell, or a shortcut:

```bash
# send a prompt
curl -X POST http://100.x.y.z:3456/api/prompt \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"what changed in the last commit?"}'

# watch the session
curl -N "http://100.x.y.z:3456/api/events?token=$TOKEN"

# answer a permission prompt
curl -X POST http://100.x.y.z:3456/api/permission-response \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id>","decision":"allow"}'
```

Other endpoints: `/api/status`, `/api/info`, `/api/sessions`,
`/api/sessions/:id/history`, `/api/interrupt`, `/api/messages`. Auth is
`Authorization: Bearer <token>` or `?token=`.

## Security

**even-terminal binds `0.0.0.0`.** `--tailscale` only changes the address it
advertises and encodes in the QR code — the listener itself accepts connections
on every interface the Pi has. It is token-protected, but it is listening on
your Wi-Fi and Ethernet too, not only the tailnet.

If the Pi sits on untrusted Wi-Fi, lock the port to the tailnet:

```bash
bash scripts/pi-setup.sh --dir ~/code/your-project --firewall
```

That needs `ufw` already enabled. The script will not enable a firewall for you
— doing that over SSH is a good way to lock yourself out of the Pi.

**The token is a password.** Anyone who holds it and can reach the port drives
Claude Code on your Pi.

**Keep permission prompts on.** Don't run the agent with
`--dangerously-skip-permissions`. On a 5-line display you're approving a summary,
not a diff, so the prompts matter more here than at a terminal, not less.

**Scope the working directory.** `--dir` pins which project the session can
touch. Point it at one project, not at `~`.

**On iOS**, the Even app couldn't do HTTPS as of 2.2.1, so this runs as plain
HTTP. Over a tailnet that's fine — WireGuard is already encrypting the link.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Server unreachable" in the app | phone and Pi on different transports | both on Tailscale, or both on the same Wi-Fi |
| Host stops working after a reboot | token rotated | the setup script pins `--token`; check `~/.config/even-terminal/token` |
| `EADDRINUSE :3456` | a second even-terminal is running | `systemctl --user stop even-terminal`, or use `--port` |
| `command not found: claude` | not on the service's PATH | `which claude`; the unit uses an absolute path for even-terminal, so check claude too |
| Claude Code won't install | 32-bit OS | `uname -m` says `armv7l` → reflash with the 64-bit image |
| Output truncated mid-stream | something the 576×288 layout can't render | `even-terminal --verbose --log-file ./debug.log` and report it upstream |

## One host, three inputs

The point of putting this on a Pi is that **the Pi is the only machine running
`claude`**. Everything else is an input device:

```
              Raspberry Pi — the only Claude Code host
              ~/.claude/     memory, skills, MCP, chat history
              ~/code/        the project
                      │
               even-terminal :3456
                      │
      ┌───────────────┼───────────────┐
   glasses          phone           laptop
  (G2 + Even)    (Even app or      (ssh → claude)
                  /api/prompt)
```

Because Claude Code keeps everything as files under `~/.claude` on the machine
it runs on, a single host gives you one memory and one chat history for free:

| | Where on the Pi |
|---|---|
| user memory | `~/.claude/CLAUDE.md` |
| project memory | `<project>/CLAUDE.md` |
| skills | `~/.claude/skills/` |
| MCP servers | `~/.claude.json` |
| chat history | `~/.claude/projects/<encoded-cwd>/*.jsonl` |

even-terminal reads that same store — `dist/claude/provider.js` resolves
`~/.claude/projects` directly, and it launches the agent with
`settingSources: ["user", "project"]`. So a chat started on the laptop shows up
in the glasses' session list, and vice versa.

**The one rule:** use the same working directory everywhere. Chats are grouped
by `cwd`, so `--cwd ~/code` and an ssh session in `~/other` produce two separate
histories.

Sessions are handed off, not shared live: `claude --resume` on the laptop and
the app's session list on the glasses both read the same files, but each
surface runs its own process. Start on one, continue on another.

### What the glasses can and can't do

even-terminal hardcodes the agent options (`dist/claude/session.js`):

```js
model: "claude-opus-4-6"
maxTurns: 50
permissionMode: "acceptEdits"
allowedTools: [Read, Edit, Glob, Grep, Agent, WebSearch, WebFetch,
               TaskOutput, ExitPlanMode, ListMcpResources, ReadMcpResource]
```

Anything outside that list — `Bash`, `Write`, and **every MCP tool** — raises a
permission prompt on the glasses. Without an R1 ring you cannot answer those, so
in practice the glasses are for reading, asking and editing; shell work and MCP
queries belong on the laptop over ssh, against the same Pi and the same memory.

Until the ring arrives, answer prompts over HTTP:

```bash
curl -X POST http://100.x.y.z:3456/api/permission-response \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id>","decision":"allow"}'
```

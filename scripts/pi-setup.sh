#!/usr/bin/env bash
#
# Set up Even Terminal on a Raspberry Pi so your G2 glasses can reach Claude
# Code from anywhere over Tailscale, and so it comes back up after a reboot.
#
# Run it on the Pi:
#   bash scripts/pi-setup.sh --dir ~/code/your-project
#
# What it does:
#   - checks the Pi can actually run this (64-bit, Node, claude logged in)
#   - installs @evenrealities/even-terminal (Even Realities' own tool)
#   - installs Tailscale if missing, and brings it up
#   - provisions a token that survives restarts
#   - installs a lingering systemd user service, which the upstream docs skip
#     because they assume a laptop you type a command on
#
# What it does NOT do:
#   - log you into Claude Code (run `claude` once yourself; it's a browser login)
#   - enable a firewall behind your back (see --firewall, and read the note it
#     prints — even-terminal listens on every interface, not just the tailnet)
#   - expose anything publicly; no funnel, no ngrok, no pinggy

set -euo pipefail

PROJECT_DIR="${HOME}/code"
PORT=3456
SERVICE_NAME="even-terminal"
HOST_LABEL="$(hostname -s 2>/dev/null || echo pi)"
PROVIDER="claude"
LOCK_FIREWALL=0

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }
note() { printf '  %s\n' "$1"; }
warn() { printf '  \033[33m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) PROJECT_DIR="$(cd "$2" 2>/dev/null && pwd)" || die "--dir $2 does not exist"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --name) HOST_LABEL="$2"; shift 2 ;;
    --provider) PROVIDER="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --firewall) LOCK_FIREWALL=1; shift ;;
    -h|--help)
      awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

step "Checking this Pi can run Even Terminal"

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) note "architecture: $ARCH" ;;
  armv7l|armv6l)
    die "$ARCH is 32-bit. Claude Code needs 64-bit — reflash with the 64-bit Raspberry Pi OS." ;;
  x86_64) note "architecture: $ARCH (not a Pi, but fine)" ;;
  *) note "architecture: $ARCH (unrecognised — continuing anyway)" ;;
esac

command -v node >/dev/null 2>&1 || die "Node is not installed. Install Node 20 or newer, then re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
# even-terminal itself needs 18+; 20 is the floor for Claude Code.
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $(node -v) is too old; use Node 20 or newer."
note "node: $(node -v)"

if ! command -v claude >/dev/null 2>&1; then
  die "Claude Code is not installed. On the Pi:
    npm install -g @anthropic-ai/claude-code
    claude          # sign in once, interactively, then re-run this script"
fi
note "claude: $(claude --version 2>/dev/null | head -1)"

# even-terminal drives the agent through your logged-in CLI. If that login
# never happened, the failure surfaces much later as an unhelpful glasses error.
if [[ ! -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}" ]]; then
  warn "no Claude Code config dir found — run \`claude\` once and sign in first."
fi

TOTAL_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [[ "$TOTAL_MB" -gt 0 && "$TOTAL_MB" -lt 1800 ]]; then
  warn "${TOTAL_MB}MB RAM — Claude Code is comfortable from about 2GB; expect swapping."
else
  note "memory: ${TOTAL_MB}MB"
fi

[[ -d "$PROJECT_DIR" ]] || die "project dir $PROJECT_DIR does not exist (pass --dir)"
note "project: $PROJECT_DIR"

step "Installing Even Terminal"

if command -v even-terminal >/dev/null 2>&1; then
  note "updating @evenrealities/even-terminal"
else
  note "installing @evenrealities/even-terminal"
fi
npm install -g @evenrealities/even-terminal@latest >/dev/null
EVEN_TERMINAL_BIN="$(command -v even-terminal)" || die "even-terminal did not end up on PATH"
note "even-terminal: $("$EVEN_TERMINAL_BIN" --version 2>/dev/null | head -1)"

step "Setting up Tailscale"

if ! command -v tailscale >/dev/null 2>&1; then
  note "installing tailscale…"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

if ! tailscale status >/dev/null 2>&1; then
  note "bringing tailscale up — follow the login URL it prints"
  sudo tailscale up
fi

TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
[[ -n "$TAILSCALE_IP" ]] || die "could not read a tailnet IP. Run 'sudo tailscale up' and retry."
note "tailnet IP: $TAILSCALE_IP"
note "remember to install Tailscale on your phone and sign into the same tailnet"

step "Provisioning the access token"

# even-terminal mints a new token on every start unless you pass --token, which
# would silently invalidate the host saved in the Even app on each reboot.
TOKEN_DIR="${HOME}/.config/even-terminal"
TOKEN_FILE="${TOKEN_DIR}/token"
mkdir -p "$TOKEN_DIR"
chmod 700 "$TOKEN_DIR"
if [[ -s "$TOKEN_FILE" ]]; then
  note "reusing the existing token ($TOKEN_FILE)"
else
  node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))' > "$TOKEN_FILE"
  note "generated a new token ($TOKEN_FILE)"
fi
chmod 600 "$TOKEN_FILE"
EVEN_TOKEN="$(cat "$TOKEN_FILE")"

step "Network exposure"

# Worth knowing: --tailscale only decides which address even-terminal prints
# and encodes in its QR code. The server itself binds 0.0.0.0, so the port is
# reachable on Wi-Fi and Ethernet too — token-protected, but listening.
warn "even-terminal binds 0.0.0.0 — --tailscale only changes the advertised address."
warn "Port ${PORT} will accept connections from any network this Pi is on."

if [[ "$LOCK_FIREWALL" -eq 1 ]]; then
  command -v ufw >/dev/null 2>&1 || die "--firewall needs ufw: sudo apt-get install -y ufw"
  if ! sudo ufw status | grep -q "Status: active"; then
    die "ufw is installed but inactive. Enabling a firewall over SSH can lock you
  out, so this script will not do it for you. If you are on the console, or you
  have allowed SSH already (sudo ufw allow 22/tcp), run: sudo ufw enable"
  fi
  note "restricting port ${PORT} to the tailnet interface"
  sudo ufw allow in on tailscale0 to any port "$PORT" proto tcp >/dev/null
  sudo ufw deny "${PORT}/tcp" >/dev/null
  note "ufw rules added"
else
  cat <<FW

  To limit it to the tailnet (recommended if this Pi is on untrusted Wi-Fi),
  re-run with --firewall, or do it by hand:

    sudo apt-get install -y ufw
    sudo ufw allow 22/tcp                 # keep your SSH session alive first
    sudo ufw enable
    sudo ufw allow in on tailscale0 to any port ${PORT} proto tcp
    sudo ufw deny ${PORT}/tcp

FW
fi

step "Installing the systemd user service"

mkdir -p "${HOME}/.config/systemd/user"
UNIT_PATH="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"

TOKEN_ENV_FILE="${TOKEN_DIR}/token.env"
printf 'EVEN_TERMINAL_TOKEN=%s\n' "$EVEN_TOKEN" > "$TOKEN_ENV_FILE"
chmod 600 "$TOKEN_ENV_FILE"

cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Even Terminal (Claude Code on G2 glasses)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
# Read from a 0600 file rather than written into the unit, which is world-readable.
EnvironmentFile=${TOKEN_ENV_FILE}
ExecStart=${EVEN_TERMINAL_BIN} --tailscale --port ${PORT} --cwd ${PROJECT_DIR} --provider ${PROVIDER} --name ${HOST_LABEL} --token \${EVEN_TERMINAL_TOKEN}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}.service" >/dev/null

# Without lingering the service dies when you log out of SSH — which is exactly
# when you want it running.
if ! loginctl show-user "$USER" 2>/dev/null | grep -q "Linger=yes"; then
  note "enabling linger so the service survives logout"
  sudo loginctl enable-linger "$USER"
fi

systemctl --user restart "${SERVICE_NAME}.service"
sleep 3

step "Done"

if systemctl --user is-active --quiet "${SERVICE_NAME}.service"; then
  note "service: running"
else
  warn "service: NOT running — check: journalctl --user -u ${SERVICE_NAME} -n 50"
fi

cat <<EOF

  In the Even app: Settings → Agent Mode → Add Host

    Host name    ${HOST_LABEL}
    Agent setup  Claude Code
    Host         ${TAILSCALE_IP}:${PORT}
    Auth Token   ${EVEN_TOKEN}

  Then tap "Probe and Save". The token is stable across restarts and stored at
  ${TOKEN_FILE} (mode 600) — treat it like a password.

  Prefer the QR code? Stop the service and run it in the foreground once:

    systemctl --user stop ${SERVICE_NAME}
    ${EVEN_TERMINAL_BIN} --tailscale --port ${PORT} --cwd ${PROJECT_DIR} --token ${EVEN_TOKEN}
    # scan it, Ctrl-C, then:
    systemctl --user start ${SERVICE_NAME}

  No R1 ring yet? You can still drive the session over HTTP:

    curl -X POST http://${TAILSCALE_IP}:${PORT}/api/prompt \\
      -H "Authorization: Bearer ${EVEN_TOKEN}" \\
      -H 'Content-Type: application/json' \\
      -d '{"text":"what changed in the last commit?"}'

  Useful:
    systemctl --user status ${SERVICE_NAME}
    systemctl --user restart ${SERVICE_NAME}
    journalctl --user -u ${SERVICE_NAME} -f

EOF

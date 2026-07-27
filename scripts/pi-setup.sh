#!/usr/bin/env bash
#
# Set up claude-pad on a Raspberry Pi, reachable only over your tailnet.
#
# Run it on the Pi:
#   bash scripts/pi-setup.sh --dir ~/code/your-project
#
# What it does, and what it deliberately does not:
#   - checks the Pi can actually run this (64-bit, Node 20+, build tools)
#   - installs Tailscale if missing, and brings it up
#   - binds claude-pad to the tailnet address ONLY — never 0.0.0.0
#   - installs a systemd user service so it survives reboots
#   - never enables `tailscale funnel`; nothing here is exposed to the internet
#
# It does not log you into Claude Code. Run `claude` once yourself first —
# that's an interactive browser login and it should stay that way.

set -euo pipefail

PROJECT_DIR="${HOME}/code"
PORT=7433
SERVICE_NAME="claude-pad"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }
note() { printf '  %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) PROJECT_DIR="$(cd "$2" 2>/dev/null && pwd)" || die "--dir $2 does not exist"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --name) SERVICE_NAME="$2"; shift 2 ;;
    -h|--help)
      # The header comment block, up to the first line that isn't a comment.
      awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

step "Checking this Pi can run claude-pad"

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
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $(node -v) is too old; claude-pad needs Node 20+."
note "node: $(node -v)"

# node-pty compiles a native addon; without these, npm install fails confusingly.
MISSING_BUILD_DEPS=()
for tool in make g++ python3; do
  command -v "$tool" >/dev/null 2>&1 || MISSING_BUILD_DEPS+=("$tool")
done
if [[ ${#MISSING_BUILD_DEPS[@]} -gt 0 ]]; then
  die "missing build tools for node-pty: ${MISSING_BUILD_DEPS[*]}
  Install them with:  sudo apt-get install -y build-essential python3"
fi
note "build tools: present"

TOTAL_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [[ "$TOTAL_MB" -gt 0 && "$TOTAL_MB" -lt 1800 ]]; then
  note "warning: ${TOTAL_MB}MB RAM. Claude Code is comfortable from about 2GB;"
  note "         on a smaller Pi expect swapping. A 4GB Pi 4/5 is the sweet spot."
else
  note "memory: ${TOTAL_MB}MB"
fi

if ! command -v claude >/dev/null 2>&1; then
  die "Claude Code is not installed. On the Pi:
    npm install -g @anthropic-ai/claude-code
    claude          # sign in once, interactively, then re-run this script"
fi
note "claude: $(claude --version 2>/dev/null | head -1)"

[[ -d "$PROJECT_DIR" ]] || die "project dir $PROJECT_DIR does not exist (pass --dir)"
note "project: $PROJECT_DIR"

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
TAILSCALE_NAME="$(tailscale status --json 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const dns = JSON.parse(raw).Self?.DNSName ?? "";
      process.stdout.write(dns.replace(/\.$/, ""));
    } catch {
      /* name is a nicety; the IP is what matters */
    }
  });
' || true)"

note "tailnet IP: $TAILSCALE_IP"
[[ -n "$TAILSCALE_NAME" ]] && note "tailnet name: $TAILSCALE_NAME"

# Funnel would publish this to the internet. The pad drives a real shell, so
# that is never something this script does silently.
if tailscale funnel status 2>/dev/null | grep -q "https://"; then
  note "WARNING: tailscale funnel is serving something on this machine."
  note "         Make sure it is not claude-pad — funnel is public."
fi

step "Building claude-pad"

cd "$REPO_DIR"
[[ -d node_modules ]] || npm install
npm run build

step "Provisioning the access token"

# Generated once and reused. Left to itself claude-pad mints a new token every
# start, which would silently break the glasses bridge on every reboot.
TOKEN_DIR="${HOME}/.config/claude-pad"
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
PAD_TOKEN="$(cat "$TOKEN_FILE")"

# systemd reads the token from here; the unit file itself is world-readable.
TOKEN_ENV_FILE="${TOKEN_DIR}/token.env"
printf 'CLAUDE_PAD_TOKEN=%s\n' "$PAD_TOKEN" > "$TOKEN_ENV_FILE"
chmod 600 "$TOKEN_ENV_FILE"

step "Installing the systemd user service"

mkdir -p "${HOME}/.config/systemd/user"
UNIT_PATH="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"

cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=claude-pad (Claude Code, reachable on the tailnet)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
# Bound to the tailnet address only. Not 0.0.0.0 — that would put a terminal
# on every network this Pi ever joins.
ExecStart=$(command -v node) ${REPO_DIR}/bin/claude-pad.js --dir ${PROJECT_DIR} --host ${TAILSCALE_IP} --port ${PORT}
Restart=always
RestartSec=3
Environment=NODE_ENV=production
# Read from a 0600 file rather than written into the unit, which is world-readable.
EnvironmentFile=${TOKEN_ENV_FILE}

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}.service" >/dev/null

# Without lingering, the service dies when you log out of SSH — which is
# exactly when you want it running.
if ! loginctl show-user "$USER" 2>/dev/null | grep -q "Linger=yes"; then
  note "enabling linger so the service survives logout"
  sudo loginctl enable-linger "$USER"
fi

systemctl --user restart "${SERVICE_NAME}.service"
sleep 2

step "Done"

if systemctl --user is-active --quiet "${SERVICE_NAME}.service"; then
  note "service: running"
else
  note "service: NOT running — check: journalctl --user -u ${SERVICE_NAME} -n 50"
fi

HOST="${TAILSCALE_NAME:-$TAILSCALE_IP}"
cat <<EOF

  claude-pad is bound to the tailnet only:

    http://${HOST}:${PORT}/?token=${PAD_TOKEN}

  That token is required, it is stable across restarts, and anyone holding it
  controls a terminal on this Pi. Treat the URL like a password.
  It is stored at ${TOKEN_FILE} (mode 600).

  Point the glasses bridge at it:

    CLAUDE_PAD_URL=http://${HOST}:${PORT}
    CLAUDE_PAD_TOKEN=${PAD_TOKEN}

  Useful:
    systemctl --user status ${SERVICE_NAME}
    systemctl --user restart ${SERVICE_NAME}
    journalctl --user -u ${SERVICE_NAME} -f

EOF

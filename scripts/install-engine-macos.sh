#!/usr/bin/env bash
# Installs the Claude Cockpit engine as a macOS launchd user agent.
# Idempotent: re-run to update (rebuilds + restarts). Requires: node >= 20, claude CLI.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$REPO/engine"
LABEL="com.claude-cockpit.engine"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script is for macOS. On Linux/WSL use scripts/install-engine-service.sh" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node not found in PATH. Install it first: brew install node (or nodejs.org)" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node >= 20 required (found $(node --version))" >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code — then run 'claude' once to log in." >&2
  exit 1
fi

echo "→ install deps + build engine"
cd "$ENGINE"
npm install
npm run build

# UI statica: l'engine la serve su http://127.0.0.1:8130 (build dell'app se presente).
if [ -d "$REPO/app/dist" ]; then
  rm -rf "$ENGINE/ui"
  cp -r "$REPO/app/dist" "$ENGINE/ui"
fi

echo "→ write launch agent: $PLIST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>exec "$NODE_BIN" "$ENGINE/dist/server.js"</string>
  </array>
  <key>WorkingDirectory</key><string>$ENGINE</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/claude-cockpit-engine.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claude-cockpit-engine.log</string>
</dict>
</plist>
EOF

echo "→ (re)load agent"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

sleep 1
if launchctl list | grep -q "$LABEL"; then
  echo "OK: engine running — ws://127.0.0.1:8130 (log: ~/Library/Logs/claude-cockpit-engine.log)"
  echo "Token for browser access: $HOME/.claude-cockpit/token (created at first start)"
else
  echo "Agent not listed — check the log: ~/Library/Logs/claude-cockpit-engine.log" >&2
  exit 1
fi

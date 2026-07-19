#!/usr/bin/env bash
# Installa l'engine di Claude Cockpit come systemd user service.
# Idempotente: si può rilanciare per aggiornare (ricompila + riavvia).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$REPO/engine"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/claude-cockpit-engine.service"

NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  echo "node non trovato nel PATH" >&2
  exit 1
fi

echo "→ build engine"
cd "$ENGINE"
npm run build

echo "→ scrittura unit: $UNIT"
mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<EOF
[Unit]
Description=Claude Cockpit engine (WSL)
After=default.target

[Service]
Type=simple
WorkingDirectory=$ENGINE
# Login shell → eredita PATH del profilo (node, claude in ~/.local/bin, MCP).
ExecStart=/bin/bash -lc 'exec "$NODE_BIN" "$ENGINE/dist/server.js"'
Restart=always
RestartSec=2
MemoryHigh=3G
MemoryMax=4G

[Install]
WantedBy=default.target
EOF

echo "→ daemon-reload + enable --now"
systemctl --user daemon-reload
systemctl --user enable --now claude-cockpit-engine.service

# Utile se la macchina non ha una sessione utente sempre attiva.
loginctl enable-linger "$USER" >/dev/null 2>&1 || true

sleep 1
systemctl --user --no-pager status claude-cockpit-engine.service | head -12
echo "✓ engine installato. Log: journalctl --user -u claude-cockpit-engine -f"

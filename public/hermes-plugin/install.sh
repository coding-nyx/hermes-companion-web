#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   curl -fsSL https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main/install.sh | bash
#   bash install.sh
#   bash install.sh https://your-companion-host   # fetch from a running companion app

ORIGIN="${1:-}"
if [ -n "$ORIGIN" ]; then
  ORIGIN="${ORIGIN%/}"
  BASE="${ORIGIN}/hermes-plugin"
else
  BASE="https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main"
fi

DEST="${HOME}/.hermes/plugins/platforms/companion"
mkdir -p "$DEST"

echo "Installing Hermes Companion plugin → $DEST"
for f in plugin.yaml __init__.py adapter.py tools.py node_broker.py; do
  echo "  $f"
  curl -fsSL "$BASE/companion/$f" -o "$DEST/$f"
done

echo
echo "Installed. On the Hermes machine run:"
echo "  hermes plugins enable companion"
echo "  hermes gateway"
echo
echo "Web companion: scan this tailnet and pair with the on-screen code (mailbox /companion/*)."
echo "Android companion: Node tab → Pair as node → http://<magicdns>:8642 + the setup code."
echo "The plugin listens on port 8642 (override with COMPANION_PORT) on all interfaces so Tailscale MagicDNS can find it."

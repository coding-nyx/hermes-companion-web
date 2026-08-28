#!/usr/bin/env bash
set -euo pipefail

ORIGIN="${1:-${HERMES_COMPANION_ORIGIN:-}}"
if [ -z "$ORIGIN" ]; then
  echo "Usage: curl -fsSL <companion-origin>/hermes-plugin/install.sh | bash -s -- <companion-origin>"
  echo "Example origin: https://your-companion-host"
  exit 1
fi

ORIGIN="${ORIGIN%/}"
DEST="${HOME}/.hermes/plugins/platforms/companion"
mkdir -p "$DEST"

echo "Installing Hermes Companion plugin → $DEST"
for f in plugin.yaml __init__.py adapter.py tools.py; do
  echo "  $f"
  curl -fsSL "$ORIGIN/hermes-plugin/companion/$f" -o "$DEST/$f"
done

echo
echo "Installed. On the Hermes machine run:"
echo "  hermes plugins enable companion"
echo "  hermes gateway"
echo
echo "Then scan this tailnet from the Companion app and pair with the on-screen code."
echo "The plugin listens on port 8642 (override with COMPANION_PORT) on all interfaces so Tailscale MagicDNS can find it."

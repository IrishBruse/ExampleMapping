#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
NETSKOPE_CA="/Library/Application Support/Netskope/STAgent/data/nscacert.pem"

if ! command -v cloudflared &>/dev/null; then
  echo "cloudflared not found. Install it with:"
  echo "  brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi

echo "Starting Cloudflare tunnel for http://localhost:${PORT} ..."

if [ -f "$NETSKOPE_CA" ]; then
  echo "(Netskope CA detected — passing --origin-ca-pool)"
  exec cloudflared tunnel --url "http://localhost:${PORT}" \
    --origin-ca-pool "$NETSKOPE_CA"
else
  exec cloudflared tunnel --url "http://localhost:${PORT}"
fi

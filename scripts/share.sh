#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
CONFIG_FILE="$(cd "$(dirname "$0")/.." && pwd)/config.json"

if ! command -v cloudflared &>/dev/null; then
  echo "cloudflared not found. Install it with:"
  echo "  brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi

ACCESS_TOKEN=""
if command -v node &>/dev/null && [ -f "$CONFIG_FILE" ]; then
  ACCESS_TOKEN="$(node -e "try{const c=require('$CONFIG_FILE');process.stdout.write(c.accessToken||'')}catch(e){}")"
fi

TUNNEL_URL_FILE="$(mktemp)"

show_share_link() {
  local base_url="$1"
  echo ""
  if [ -n "$ACCESS_TOKEN" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ${base_url}/?token=${ACCESS_TOKEN}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  else
    echo "Missing access-token in config"
    exit 1
  fi
    echo ""
}

start_tunnel() {
  cloudflared tunnel --url "http://localhost:${PORT}" 2>&1 | \
    while IFS= read -r line; do
    #   echo "$line" # uncomment for debug logs
      if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]] && [ ! -s "$TUNNEL_URL_FILE" ]; then
        local url="${BASH_REMATCH[0]}"
        echo "$url" > "$TUNNEL_URL_FILE"
        show_share_link "$url"
      fi
    done
}

echo "Starting Cloudflare tunnel for http://localhost:${PORT} ..."
start_tunnel
rm -f "$TUNNEL_URL_FILE"

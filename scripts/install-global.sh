#!/usr/bin/env bash
# Build the app and install the `mapping-tool` CLI globally (npm prefix bin on your PATH).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building mapping-tool..."
npm run build

echo "Installing globally..."
if npm install -g .; then
  echo ""
  echo "Installed. Try: mapping-tool --help"
else
  echo ""
  echo "If you saw EACCES, either:"
  echo "  sudo npm install -g ."
  echo "  or configure a user-writable npm global prefix (see npm docs for 'prefix')."
  exit 1
fi

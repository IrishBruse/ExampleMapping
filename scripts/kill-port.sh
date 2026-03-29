#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-${PORT:-3000}}"
pids=$(lsof -ti ":${PORT}" 2>/dev/null || true)
if [ -z "${pids}" ]; then
    echo "Nothing listening on port ${PORT}"
    exit 0
fi
echo "Killing PID(s) on port ${PORT}: ${pids}"
kill -9 ${pids}

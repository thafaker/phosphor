#!/usr/bin/env bash
# Baut die App, startet `vite preview` und führt alle Browser-Tests aus.
#
# Voraussetzungen:
#   - `pnpm install`
#   - einmalig `pnpm exec playwright install chromium` (oder CHROME auf einen
#     vorhandenen Chromium zeigen lassen, z. B. CHROME=/snap/bin/chromium)
set -euo pipefail

PORT="${PORT:-4174}"
BASE="${BASE:-http://127.0.0.1:$PORT}"
LOG="${TMPDIR:-/tmp}/phosphor-e2e-preview.log"

pnpm build
./node_modules/.bin/vite preview --port "$PORT" --strictPort --host 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
	if curl -sf -o /dev/null "$BASE/"; then
		break
	fi
	sleep 0.2
done

if ! curl -sf -o /dev/null "$BASE/"; then
	echo "Preview-Server nicht erreichbar – siehe $LOG" >&2
	exit 1
fi

status=0
for script in e2e/*.mjs; do
	echo
	echo "▶ $(basename "$script")"
	BASE="$BASE" node "$script" || status=1
done

exit "$status"

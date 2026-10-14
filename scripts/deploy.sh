#!/usr/bin/env bash
#
# Baut Phosphor und veröffentlicht das statische Bundle auf dem Raspberry Pi.
# Der Pi serviert es mit Caddy aus /var/www/phosphor (siehe
# deploy/Caddyfile.phosphor).
#
set -euo pipefail

HOST="janmontag@thafaker.crabdance.com"
PORT="51416"
TARGET="/var/www/phosphor"

cd "$(dirname "$0")/.."

echo "→ Build"
pnpm run build

echo "→ Zielverzeichnis sicherstellen (${HOST}:${TARGET})"
ssh -p "${PORT}" "${HOST}" "mkdir -p '${TARGET}'"

echo "→ Sync build/ → ${HOST}:${TARGET}"
# -r l p t D z : rekursiv, Symlinks, rechte, zeiten, devices, komprimiert
# --delete      : entfernt veraltete Dateien (alte gehashte Bundles)
# --chmod       : Verzeichnisse 755, Dateien 644 -> für Caddy lesbar
rsync -rlptDz --delete --chmod=D755,F644 \
	-e "ssh -p ${PORT}" \
	build/ "${HOST}:${TARGET}/"

echo "✓ Deployt. → https://phosphor.janmontag.de"

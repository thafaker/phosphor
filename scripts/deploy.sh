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
# Die produktive Instanz als Vorgabe für die Login-Seite. Cloner setzen die
# Variable in einer eigenen `.env` (siehe `.env.example`) oder lassen sie leer.
VITE_INSTANCE_URL="${VITE_INSTANCE_URL:-https://social.janmontag.de}" pnpm run build

echo "→ Zielverzeichnis sicherstellen (${HOST}:${TARGET})"
ssh -p "${PORT}" "${HOST}" "mkdir -p '${TARGET}'"

echo "→ Sync build/ → ${HOST}:${TARGET}"
# -r l p t D z : rekursiv, Symlinks, rechte, zeiten, devices, komprimiert
# --delete      : entfernt veraltete Dateien (alte gehashte Bundles)
# Kein --chmod: macOS liefert openrsync, das die D/F-Syntax nicht kennt. Die
# Rechte werden stattdessen nach dem Sync remote gesetzt (s. u.).
rsync -rlptDz --delete \
	-e "ssh -p ${PORT}" \
	build/ "${HOST}:${TARGET}/"

# Verzeichnisse 755, Dateien 644 -> für Caddy lesbar, unabhängig vom lokalen umask.
ssh -p "${PORT}" "${HOST}" "chmod -R a+rX '${TARGET}'"

echo "✓ Deployt. → https://phosphor.janmontag.de"

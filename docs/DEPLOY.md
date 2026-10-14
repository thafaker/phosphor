# Deployment

Phosphor ist eine **rein statische Single-Page-App**. Es gibt keinen Server-Teil:
Der Browser spricht direkt mit der GoToSocial-Instanz (`https://social.janmontag.de`).
Auf dem Server wird also nur ein Verzeichnis mit Dateien ausgeliefert.

## Zielumgebung

|                  |                                                                     |
| ---------------- | ------------------------------------------------------------------- |
| Host             | Raspberry Pi, `janmontag@thafaker.crabdance.com`, Port `51416`      |
| Webserver        | Caddy 2.6.2, zentrale Caddyfile unter `/etc/caddy/Caddyfile`        |
| Dokumentenwurzel | `/var/www/phosphor`                                                 |
| Domain           | `https://phosphor.janmontag.de`                                     |
| Instanz          | `https://social.janmontag.de` (GtS, `reverse_proxy localhost:8080`) |

DNS zeigt `phosphor.janmontag.de` bereits auf dieselbe öffentliche IP wie `social.*`.
Caddy holt das TLS-Zertifikat automatisch (ACME).

## Erstes Setup (einmalig, auf dem Pi)

```bash
# 1) Dokumentenwurzel anlegen (janmontag ist in der Gruppe www-data)
mkdir -p /var/www/phosphor

# 2) Caddy-Block aus deploy/Caddyfile.phosphor in /etc/caddy/Caddyfile einfügen
#    (Backup nicht vergessen: cp /etc/caddy/Caddyfile{,.bak-$(date +%Y%m%d)})

# 3) Konfiguration prüfen und übernehmen
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Deployen

```bash
./scripts/deploy.sh
```

Das Skript baut lokal (`pnpm run build`) und synchronisiert `build/` per
`rsync --delete` nach `/var/www/phosphor`. Es ist idempotent und kann beliebig
oft laufen; alte gehashte Bundles werden entfernt.

## Warum das ohne Server-Teil funktioniert

- **CORS:** GtS antwortet mit `access-control-allow-origin: *`, auch beim
  Preflight für `/oauth/token`. Aufrufe von `phosphor.janmontag.de` sind erlaubt.
- **OAuth-Redirect:** `redirectUri()` ist `window.location.origin + '/callback'`.
  Die App registriert sich auf der jeweiligen Domain selbst. Login unter
  `phosphor.janmontag.de` und lokal (`localhost:5173`) sind getrennt, weil
  `localStorage` pro Origin isoliert ist.
- **Streaming:** WebSocket direkt gegen `wss://social.janmontag.de/api/v1/streaming`.

## Caching

- `/_app/immutable/*` trägt einen Inhalts-Hash im Dateinamen → `max-age=31536000, immutable`.
- Alles andere (u. a. `index.html`) → `no-cache` (revalidiert), damit ein Deploy
  sofort sichtbar wird.

## Als App auf dem Handy (PWA)

`static/manifest.webmanifest` plus Icons machen Phosphor installierbar
(`display: standalone`). Auf dem Handy die Seite öffnen und „Zum Home-Bildschirm"
wählen — danach startet sie ohne Browser-Leiste. Kein Service Worker, also kein
Offline-Betrieb (nicht nötig, die App braucht ohnehin die Instanz).

## Fehlersuche

| Symptom                                     | Ursache                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `/settings`, `/status/…`, `/callback` → 404 | `try_files {path} /index.html` fehlt                                        |
| Login bricht nach dem Rücksprung ab         | Redirect-URI passt nicht; in GtS unter _Einstellungen → Anwendungen_ prüfen |
| Leere Timelines beim ersten Start           | GtS füllt keine alten Beiträge nach — normal                                |
| 429/503                                     | Rate-Limits der Instanz; der Client wiederholt idempotente Requests         |
| Deploy nicht sichtbar                       | `index.html` wird noch gecacht → Hard-Reload                                |

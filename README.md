# Phosphor

Ein schlankes, schnelles Web-Frontend für [GoToSocial](https://gotosocial.org) — gebaut mit SvelteKit.

> GoToSocial ist ein API-only Server und bringt keine eigene Weboberfläche mit.
> Phosphor ist ein Mastodon-kompatibler Client, der direkt gegen die API deiner Instanz spricht.

## Status

Frühes MVP, aktuell fest auf eine einzige Instanz verdrahtet (`src/lib/config.ts`).

Bereits dabei:

- OAuth-Login (App-Registrierung → `/oauth/authorize` → `/oauth/token`)
- Start-Timeline und lokale Timeline, inkl. Infinite Scroll
- Live-Streaming über WebSocket (neue Beiträge und Meldungen)
- Beiträge verfassen (Inhaltswarnung, Sichtbarkeit)
- Favorisieren, Boosten, Merken
- Thread-Ansicht mit Kontext
- Benachrichtigungen
- Erscheinungsbild: Hell / Dunkel / System
- Barrierefreie Schriftgröße (100 % – 200 %), wirkt auf die ganze App

## Stack

- **SvelteKit 3 / Svelte 5** (Runes) als reines SPA über `adapter-static`
- **TypeScript**
- **Tailwind CSS v4**
- Eigener, dünner API-Client (`fetch` + `WebSocket`) — keine Client-Bibliothek nötig

## Entwicklung

Voraussetzungen: Node ≥ 22 und pnpm.

```bash
pnpm install
# Instanz-URL anpassen:
#   src/lib/config.ts  ->  INSTANCE_URL
pnpm dev
```

Dann <http://localhost:5173> öffnen und auf „Anmelden“ klicken.

### Scripts

| Befehl         | Zweck                          |
| -------------- | ------------------------------ |
| `pnpm dev`     | Dev-Server                     |
| `pnpm build`   | Production-Build nach `build/` |
| `pnpm preview` | Build lokal ausliefern         |
| `pnpm check`   | Typecheck (svelte-check)       |
| `pnpm lint`    | Prettier + ESLint              |
| `pnpm format`  | Code formatieren               |

## Deployment

`pnpm build` erzeugt eine rein statische SPA in `build/`. Die kann auf jedem Static-Host
(Netlify, Vercel, Cloudflare Pages, nginx, …) liegen — solange unbekannte Pfade auf
`index.html` zurückfallen (SPA-Fallback).

Die `redirect_uri` beim Login ist `window.location.origin + /callback`. Der Browser muss also
nach der Autorisierung zu dieser Origin zurückfinden.

## Barrierefreiheit

- **Farbschema:** Hell, Dunkel oder System (folgt `prefers-color-scheme`). Umschaltbar unter
  _Einstellungen_; die Wahl wird gespeichert und vor dem ersten Rendern angewendet.
- **Schriftgröße:** 100 % – 200 % in sechs Stufen. Statt einzelne Textstellen zu skalieren wird
  die Wurzel-Schriftgröße relativ zur Browser-Einstellung multipliziert, sodass auch die
  Bedienelemente mitwachsen und eine vorhandene Nutzerpräferenz respektiert bleibt.

## GoToSocial-Besonderheiten

- GoToSocial spricht **nur WebSocket-Streaming**, kein SSE.
- Die Standard-Sichtbarkeit neuer Beiträge ist häufig _nicht gelistet_.
- GoToSocial backfillt keine alten Beiträge — Timelines wirken anfangs leer.
- Rate-Limits (HTTP 429) und Throttling (503) kommen regelmäßig vor; der Client wiederholt
  idempotente Requests mit Backoff.

Mehr Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Lizenz

Noch nicht festgelegt. Naheliegend wären AGPL-3.0 (wie Pinafore) oder MIT (wie Phanpy/Elk).

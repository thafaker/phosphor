# Phosphor — Architektur

## Ziel

Eigenes, schnelles und barrierearmes Web-Frontend für eine einzelne GoToSocial-Instanz.
Vorbilder sind Pinafore (Svelte, schlank, offline-lesbar) und Phanpy (aufgeräumte Interaktion),
aber mit zeitgemäßem Stack und besserer Zugänglichkeit.

**Nicht-Ziele (vorerst):** Multi-Instanz-Betrieb, Admin-Panel, Multi-Column-Ansicht.

## Grundentscheidung: reines SPA

Phosphor ist eine statische Single-Page-App (`adapter-static`, `ssr = false`,
`prerender = false` in `src/routes/+layout.ts`). Es gibt keinen Server-Teil.

Warum: Mastodon-kompatible Server (also auch GoToSocial) setzen passende CORS-Header, damit
Web-Clients von einer anderen Origin aus auf die API zugreifen dürfen. Genau so arbeiten
Pinafore, Phanpy und Elk. Der Vorteil ist ein extrem billiges Deployment (nur statische Dateien)
und ein kleiner Angriffsvektor.

## Authentifizierung (OAuth)

```
 /login
   │  beginLogin()
   ▼
 POST /api/v1/apps            einmalig: client_id + client_secret holen
   │                          (redirect_uris = origin + /callback)
   ▼
 Redirect  →  GET /oauth/authorize?client_id=…&response_type=code&scope=read write follow&state=…
   │
   │  Nutzer bestätigt auf der Instanz
   ▼
 Redirect  →  /callback?code=…&state=…
   │  finishLogin(): state prüfen
   ▼
 POST /oauth/token            code → access_token
   │
   ▼
 GET /api/v1/accounts/verify_credentials   Account bestätigen
   │
   ▼
 Token + App-Daten in localStorage  →  ab jetzt Bearer-Token an jedem Request
```

- Der Token steckt in `src/lib/auth/session.svelte.ts` (Klasse mit `$state`-Feldern).
- `setTokenGetter()` in `src/lib/api/client.ts` versorgt den API-Client mit dem Token.
- Logout löscht nur die lokalen Daten (kein Revoke-Aufruf) — bewusst simpel gehalten.

## Streaming

GoToSocial bietet **nur WebSocket**, kein SSE. Der Client verbindet sich mit:

```
wss://<instanz>/api/v1/streaming?access_token=<token>&stream=user
```

- `src/lib/api/streaming.ts` kapselt Verbindung, Nachrichten-Parsing und automatisches
  Reconnect mit exponentiellem Backoff (max. 30 s).
- `src/lib/stores/streamer.svelte.ts` hält **genau eine** Verbindung und verteilt Events an
  Abonnenten. So öffnen mehrere Views nicht mehrere Sockets.
- Das Layout routet die Events in die Stores:
  - `update` → neuer Beitrag an den Anfang der Start-Timeline
  - `status.update` → bestehenden Beitrag ersetzen
  - `delete` → Beitrag entfernen
  - `notification` → neue Meldung + Unread-Punkt

## Verzeichnisstruktur

```
src/
  lib/
    config.ts                 # einziger Ort, der die Instanz-URL kennt
    api/
      types.ts                # Mastodon/GtS-Typen (Ausschnitt)
      client.ts               # fetch-Wrapper, Bearer-Token, 429/503-Retry
      oauth.ts                # App-Registrierung, authorize-URL, Token-Tausch
      gotosocial.ts           # Endpunkte: Timelines, Status, Aktionen, Meldungen
      streaming.ts            # WebSocket-Wrapper mit Reconnect
    auth/
      session.svelte.ts       # Session-State (Token, Account, Login/Logout)
    stores/
      streamer.svelte.ts      # zentrale Stream-Verteilung
      feed.svelte.ts          # TimelineFeed-Klasse; homeFeed & localFeed
      notifications.svelte.ts # Meldungen + Unread-Zähler
    components/
      Icon.svelte             # eigene Inline-SVG-Icons (keine Icon-Dependency)
      Avatar.svelte
      MediaGrid.svelte        # Anhänge, Sensitive-Blur, ALT-Badge
      StatusBody.svelte       # eine Statusdarstellung (Inhalt, Aktionen, Umfrage, Card)
      StatusCard.svelte       # Boost-Wrapper um StatusBody
      Composer.svelte         # Verfassen/Antworten
      Sidebar.svelte          # Navigation (Desktop-Sidebar, mobile Bottom-Bar)
      TimelineView.svelte     # Liste + Infinite Scroll + Zustände
  routes/
    +layout.ts                # SPA-Modus
    +layout.svelte            # App-Hülle, Auth-Guard, Stream-Verdrahtung
    layout.css                # Tailwind + Phosphor-Theme + Content-Styles
    +page.svelte              # Start-Timeline + Composer
    login/+page.svelte
    callback/+page.svelte
    local/+page.svelte        # lokale Timeline
    notifications/+page.svelte
    status/[id]/+page.svelte  # Thread (Vorfahren + Hauptstatus + Antworten)
```

## Datenfluss

```
Streamer ──events──▶ homeFeed / notificationsFeed ──▶ TimelineView ──▶ StatusCard ──▶ StatusBody
   ▲                                                                         │
   │                                                                  optimistic update
session.token ──▶ api/client (Bearer) ◀──────────────────────────────────────┘
```

Aktionen (Favorit, Boost, Merken) werden optimistisch im Store-Objekt gesetzt und bei einem
API-Fehler zurückgerollt. Da die Stores `$state` verwenden, greifen die Änderungen direkt in der UI.

## Bewusste Design-Entscheidungen

- **Eigener API-Client statt `masto.js`.** Die genutzte API-Fläche ist klein; eigener Code
  bedeutet weniger Bundle, volle Kontrolle über Retry/Backoff und keine Upstream-Abhängigkeit.
- **Rendering von `content` per `{@html}`.** GoToSocial liefert bereits sanitisiertes HTML.
  Links werden vor dem Rendern in neue Tabs umgebogen (`withExternalLinks`).
- **Kein Router-Base-Path.** Deshalb wird auf `resolve()` bei Links verzichtet.
- **Icons als Inline-SVG.** Keine zusätzliche Abhängigkeit, volle Kontrolle über Größe/Strich.

## MVP-Stand

✅ Login, ✅ Start-/Lokale Timeline, ✅ Streaming, ✅ Composer, ✅ Favorit/Boost/Merken,
✅ Thread, ✅ Benachrichtigungen.

## Nächste Schritte

1. **Profile** (`/accounts/[id]`: Bio, Header, Follower-Zahlen, Beiträge, Folgen/Entfolgen).
2. **Suche** (`/api/v2/search`) und Hashtag-Timelines.
3. **Interaktionen im Thread**: Antworten inline, Kontext laden, Favoriten/Boosts live.
4. **Meldungen filtern** (`types=`) und als gelesen markieren (`/notifications/clear`).
5. **Bilder-Lightbox** und Video-Handling statt „neuer Tab“.
6. **PWA/Offline**: Service Worker, Read-only-Cache der Timeline.
7. **Barrierefreiheit** ausbauen und mit Screenreadern testen (Phanpys bekannte Schwäche).
8. **i18n**: UI-Strings aus den Komponenten in Sprachdateien ziehen.
9. **Multi-Instanz**: `INSTANCE_URL` von Konstante zu Session-State machen; Login mit
   Instanz-Eingabe; App-Registrierung pro Instanz cachen.

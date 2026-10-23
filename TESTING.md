# Testen

## 1. Live testen (ohne Setup)

<https://phosphor.janmontag.de> öffnen und mit einem Konto auf
`social.janmontag.de` anmelden.

**Voraussetzung:** ein vorhandenes Konto. Die Instanz hat Registrierungen und
Einladungen deaktiviert (`registrations.enabled: false`, `invites_enabled: false`);
Konten kann nur die Administration anlegen. Wer kein Konto dort hat, testet entweder
lokal gegen die eigene Instanz (Abschnitt 2) oder lässt sich eines anlegen.

## 2. Lokal aus dem Quelltext

Voraussetzungen: **Node ≥ 22.12** (siehe `.nvmrc`) und **pnpm**.

```bash
git clone git@github.com:thafaker/phosphor.git
cd phosphor
pnpm install
pnpm dev            # http://localhost:5173
```

Die App ist fest auf `https://social.janmontag.de` verdrahtet
(`src/lib/config.ts`). Für eine andere Instanz dort `INSTANCE_URL` ändern.

Der Login funktioniert von jeder Origin aus: Die App registriert sich beim ersten
Login selbst als OAuth-App, mit `redirect_uri = window.location.origin + '/callback'`.
Es braucht also nur ein Konto auf der jeweiligen Zielinstanz. Ein Test-Login
hinterlässt eine OAuth-App in der Instanz (unbedenklich, aber sichtbar).

Hinweise:

- **Web Push** benötigt einen sicheren Kontext. `localhost` gilt als sicher, die
  produktive Domain liefert HTTPS. Auf iOS erst ab 16.4 und nur als installierte PWA.
- **Streaming** läuft über `wss://social.janmontag.de`; dafür muss die Instanz
  erreichbar sein.
- Der Service Worker cached bewusst nichts, ein Offline-Test ist also nicht sinnvoll.

## 3. Automatisierte Tests

### Unit-Tests (ohne Konto, ohne Netz)

```bash
pnpm test           # Vitest, 45 Tests
pnpm check          # svelte-check
pnpm lint           # Prettier + ESLint
```

### Browser-/E2E-Tests (ohne Konto, ohne echtes Backend)

```bash
pnpm exec playwright install chromium   # einmalig
pnpm test:e2e
```

`pnpm test:e2e` baut die App, startet `vite preview` auf Port 4174 und führt alle
`e2e/*.mjs` aus. Ein vorhandenes System-Chromium lässt sich wiederverwenden:

```bash
CHROME=/snap/bin/chromium pnpm test:e2e
```

Einzeln ausführen:

```bash
pnpm build
pnpm exec vite preview --port 4174 --host 127.0.0.1 &
BASE=http://127.0.0.1:4174 node e2e/notifications.mjs
```

Die E2E-Tests **mocken die komplette API** (`**/api/**`) und melden eine
Fake-Session an. Sie brauchen weder ein Konto noch Netzwerkzugriff. Abgedeckt sind:

| Datei                 | Prüft                                                           |
| --------------------- | --------------------------------------------------------------- |
| `pull-to-refresh.mjs` | Geste: Schwelle, Dämpfung, Scroll-/Seitenabgrenzung, Auslösung  |
| `notifications.mjs`   | Filter-Tabs, Ungelesen-Zähler, einzeln/alle gelesen, Persistenz |
| `composer-format.mjs` | Markdown/Plain-Modus, Backslash-Erhalt, Favicon                 |
| `emoji-picker.mjs`    | Emoji-Suche, Einfügen an der Cursorposition, POST-Body          |

## 4. Was nur manuell geht

Diese Bereiche decken die automatisierten Tests nicht ab:

- **Login/OAuth** (App-Registrierung, Callback, Token-Erneuerung)
- **Echte Timelines, Streaming und Lückenfüllung** beim Zurückkehren in die App
- **Medien-Upload** (Bild/Video/Audio, ALT-Text, Größenlimits)
- **Web Push** (Berechtigung, VAPID, Benachrichtigung bei neuem Beitrag)
- **Suche, Hashtag-Seiten, Folgen/Entfolgen, Blockieren/Stummschalten** gegen echte Daten
- **Barrierefreiheit** mit Screenreader und Tastatur

Eine kurze manuelle Checkliste für einen Testdurchgang:

1. Login, App neu laden (Session bleibt), Logout und erneuter Login.
2. Start-/Lokal-Timeline scrollen; neuen Beitrag in einem zweiten Tab posten
   (Streaming); App in den Hintergrund schicken und zurückholen (Lückenfüllung).
3. Beitrag mit CW, Sichtbarkeit, zwei Anhängen inkl. ALT-Text posten, bearbeiten, löschen.
4. Favorisieren, boosten, merken; Antwort mit sichtbarer Erwähnung.
5. Meldungen: Filter, einzeln als gelesen markieren, „Alle gelesen“, Reload.
6. Suche (Personen, Hashtags, Beiträge), Hashtag öffnen und folgen/entfolgen.
7. Composer: MD an/aus, Backslash-Hinweis, Custom-Emoji einfügen.
8. Profil öffnen, folgen/entfolgen, stummschalten/blockieren.
9. Einstellungen: Theme, Schriftgröße, reduzierte Bewegung, Pull-to-Refresh (PWA).
10. Push aktivieren und in einem zweiten Account eine Erwähnung auslösen.

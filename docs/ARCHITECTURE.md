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
 Redirect  →  GET /oauth/authorize?client_id=…&response_type=code&scope=read write follow push&state=…
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

## Wiederaufnahme aus dem Hintergrund

Auf dem Handy friert der Browser eine PWA ein, statt sie zu entladen: Timer stehen still,
der WebSocket stirbt, und beim Zurückkehren läuft **nichts** von selbst wieder an. Ohne
Gegenmaßnahme zeigt die App also den Stand von vor dem Einfrieren — nur ein vollständiger
Neustart lädt frisch. Da der GtS-Stream verpasste Ereignisse nicht nachliefert, muss die
Lücke aktiv nachgeladen werden.

Umgesetzt im `+layout.svelte`:

- Bei `visibilitychange` → sichtbar, `pageshow` (bfcache, `persisted`), `focus`, `online`
  und dem Page-Lifecycle-`resume` (Chromium/Android) läuft ein `refresh()`.
  Mehrere dieser Events können bei einer Wiederaufnahme gemeinsam feuern und werden über
  einen 5-s-Debounce zu einer Aktualisierung zusammengefasst.
- `refresh()` verbindet den Stream sofort neu (`streamer.ensureConnected` →
  `Stream.ensureConnected`, das einen eventuell laufenden Backoff-Timer verwirft) und ruft
  `pullNew()`.
- **`pullNew()` lädt nur die Lücke nach** (`since_id` = neueste bekannte ID) und hängt sie
  oben an, statt die Liste zu ersetzen (`TimelineFeed.loadNew` / `NotificationsFeed.loadNew`).
  So bleiben Pagination und Scrollposition erhalten; ist die Seite heruntergescrollt, wird
  die Viewport-Position über die Höhendifferenz gehalten, damit nichts springt.
- Ein 60-s-Watchdog prüft zusätzlich, ob der Socket im Vordergrund gestorben ist, und lädt
  nur dann nach, wenn er tatsächlich neu verbunden werden musste.

## Push-Benachrichtigungen

GoToSocial 0.22 bringt **Web Push** von Haus aus mit: Es erzeugt sein eigenes
VAPID-Schlüsselpaar (in der eigenen DB, keine Server-Konfiguration nötig) und stellt
den öffentlichen Schlüssel über `GET /api/v2/instance` → `configuration.vapid.public_key`
bereit. Die Mastodon-kompatiblen Endpunkte `/api/v1/push/subscription` (GET/POST/PUT/DELETE)
sind vorhanden.

Phosphor nutzt das direkt — ohne eigenen Relay:

1. `static/sw.js` wird als Service Worker registriert. Er **cached nichts** (kein Offline),
   sondern behandelt nur `push` (iOS/Safari: `registration.showNotification(...)`) und
   `notificationclick` (App fokussieren bzw. öffnen).
2. `src/lib/push/push.svelte.ts` holt den VAPID-Public-Key, ruft
   `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` auf und spiegelt
   das Abo per `POST /api/v1/push/subscription` an die Instanz (Alerts + `policy: all`).
3. `PushStore.refresh()` ist dabei **idempotent**: Hat der Browser bereits ein Abo, wird es
   beim App-Start (bzw. nach dem Login, siehe `+layout.svelte`) erneut an den Server gemeldet.
   Das heilt den Fall, dass der erste POST mit einem Token ohne `push`-Scope mit 403
   `token has insufficient scope permission` abgelehnt wurde — der Browser behält sein Abo,
   die App zeigte „Aktiviert", der Server wusste bislang aber nichts davon.
4. Der Schalter unter **Einstellungen → Benachrichtigungen** aktiviert/deaktiviert das Abo.

Randbedingungen:

- **Scope `push`** ist Teil von `SCOPES` in `src/lib/config.ts`. Ein vor dieser Änderung
  erteiltes Token hat den Scope nicht; die App erkennt den 401/403 und bietet „Neu einloggen“
  an. Beim erneuten Login registriert `session.svelte.ts` die App automatisch neu, wenn die
  im `RegisteredApp` gespeicherten Scopes nicht mehr passen — danach erledigt `refresh()`
  das erneute Melde des bestehenden Abos (Schritt 3).
- **iOS** unterstützt Web Push erst ab **16.4** und nur für zum Home-Bildschirm
  hinzugefügte PWAs (`apple-mobile-web-app-capable` ist gesetzt).
- Der Push-Payload ist GoToSocials `WebPushNotification` (`notification_id`, `title`, `body`,
  `icon`, …). Der Worker baut daraus die Systembenachrichtigung.
- **Neue Beiträge (`status`)** pusht GoToSocial nur an Follower mit gesetztem `notify`-Flag
  am Follow des Autors (die „Glocke" im Profil). Der `status`-Alert im Abo aktiviert die
  Möglichkeit — die Auswahl pro Account trifft weiterhin GoToSocial
  (`internal/surfacing/surfacetimeline.go`: `if !follow.Flags.Notify() { continue }`).
  Boosts und Antworten lösen keinen `status`-Push aus.

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
    push/
      push.svelte.ts          # Web-Push-Abo: SW registrieren, abonnieren, synchronisieren
    stores/
      streamer.svelte.ts      # zentrale Stream-Verteilung
      feed.svelte.ts          # TimelineFeed-Klasse; homeFeed & localFeed
      notifications.svelte.ts # Meldungen + Unread-Zähler
      statusSync.ts           # bearbeiteten Status in alle Ansichten spiegeln
      preferences.svelte.ts   # Theme + Schriftgröße (persistiert)
    components/
      Icon.svelte             # eigene Inline-SVG-Icons (keine Icon-Dependency)
      Avatar.svelte
      MediaGrid.svelte        # Anhänge, Sensitive-Blur, ALT-Badge
      MediaPicker.svelte      # Anhänge im Composer: Vorschau, ALT-Text, Entfernen
      StatusBody.svelte       # eine Statusdarstellung (Inhalt, Aktionen, Umfrage, Card)
      StatusEditor.svelte     # modaler Dialog zum Bearbeiten eigener Beiträge
      ConfirmDialog.svelte    # modaler Bestätigungsdialog (z. B. Löschen)
      StatusCard.svelte       # Boost-Wrapper um StatusBody
      Composer.svelte         # Verfassen/Antworten inkl. Anhänge
      Sidebar.svelte          # Navigation (Desktop-Sidebar, mobile Bottom-Bar)
      TimelineView.svelte     # Liste + Infinite Scroll + Zustände
      AccountHeader.svelte    # Profilkopf: Headerbild, Bio, Felder, Zahlen, Folgen-Button
  routes/
    +layout.ts                # SPA-Modus
    +layout.svelte            # App-Hülle, Auth-Guard, Stream-Verdrahtung
    layout.css                # Tailwind + Phosphor-Theme + Content-Styles
    +page.svelte              # Start-Timeline + Composer
    login/+page.svelte
    callback/+page.svelte
    local/+page.svelte        # lokale Timeline
    notifications/+page.svelte
    settings/+page.svelte     # Erscheinungsbild, Schriftgröße & Push-Benachrichtigungen
    status/[id]/+page.svelte  # Thread (Vorfahren + Hauptstatus + Antworten)
    accounts/[id]/+page.svelte # Profil: Kopf, Filter, Beiträge, Folgen/Entfolgen
```

`static/sw.js` ist der (nicht cachende) Service Worker für Push.

## Datenfluss

```
Streamer ──events──▶ homeFeed / notificationsFeed ──▶ TimelineView ──▶ StatusCard ──▶ StatusBody
   ▲                                                                         │
   │                                                                  optimistic update
session.token ──▶ api/client (Bearer) ◀──────────────────────────────────────┘
```

Aktionen (Favorit, Boost, Merken) werden optimistisch im Store-Objekt gesetzt und bei einem
API-Fehler zurückgerollt. Da die Stores `$state` verwenden, greifen die Änderungen direkt in der UI.

## Beiträge bearbeiten

Eigene Beiträge lassen sich über `PUT /api/v1/statuses/:id` bearbeiten (`editStatus` in
`api/gotosocial.ts`). Geöffnet wird der modale `<dialog>` (`components/StatusEditor.svelte`)
über „Bearbeiten“ im Kopf eigener Beiträge (`StatusBody.svelte`).

Drei Eigenheiten der GtS-API bestimmen die Umsetzung:

- **Rohtext statt HTML.** Der Dialog lädt den ungerenderten Text über
  `GET /api/v1/statuses/:id/source` (`getStatusSource`), weil `content` bereits gerendertes
  HTML ist.
- **Fehlende Felder löschen.** GtS ersetzt den Zustand durch das Gesendete: `media_ids` werden
  1:1 übernommen (`status.AttachmentIDs = form.MediaIDs`), ein fehlender Poll wird gelöscht,
  `sensitive` ist kein Zeiger und `language` fällt auf die Kontoeinstellung zurück. Der Dialog
  sendet deshalb die vorhandenen Anhang-IDs, den vorhandenen Poll (Optionen + `multiple`) und
  die aktuelle Sprache mit. Den Schalter „Zähler verbergen“ (`hide_counts`) gibt die API nicht
  heraus; er kann beim Bearbeiten einer Umfrage verloren gehen, die Stimmen bleiben erhalten.
- **Kein Sichtbarkeitswechsel.** GtS' Edit-Formular kennt kein `visibility`; die Sichtbarkeit
  bleibt unverändert.

Nach dem Speichern wird das Status-Objekt direkt mutiert (damit die Thread-Ansicht mitzieht) und
über `stores/statusSync.ts` (`applyStatusUpdate`) in beide Timelines und die Benachrichtigungen
gespiegelt — dieselbe Funktion verarbeitet auch das `status.update`-Stream-Ereignis.

## Anhänge

Der Composer kann Bilder, Videos und Audio anhängen (`components/MediaPicker.svelte`). Die
Dateien werden **erst beim Absenden** hochgeladen (`POST /api/v2/media`, `uploadMedia` in
`api/gotosocial.ts`) — nicht schon bei der Auswahl. So bleiben keine verwaisten Anhänge
zurück, wenn ein Entwurf verworfen wird; ein bereits hochgeladener Anhang behält bei einem
erneuten Versuch seine ID und wird nicht doppelt gesendet.

Zwei Eigenheiten der API bestimmen die Umsetzung:

- **Kein 202/Polling.** GoToSocial verarbeitet synchron und antwortet mit `200 OK` und fertigem
  Attachment (inkl. `url`) — anders als Mastodon, das `202 Accepted` samt Polling über
  `GET /api/v1/media/:id` verlangt.
- **ALT-Texte nur beim Upload.** `media_attributes` kennt nur `PUT /api/v1/statuses/:id`
  (Bearbeiten), nicht das Anlegen; die Bildbeschreibung muss also beim Upload als
  `description` mitgehen. Der Picker erfasst sie direkt an jedem Anhang.

Die Limits (Anzahl, Bild-/Videogröße, Beschreibungs- und Zeichenlänge) kommen gebündelt aus
`GET /api/v2/instance` (`getInstanceLimits` → `session.limits`), inklusive der akzeptierten
MIME-Typen fürs `accept`-Attribut. Fehlen die Instanzangaben, greifen die Fallbacks aus
`config.ts`. Dateityp und -größe werden schon vor dem Upload geprüft; der Upload selbst läuft
parallel über `Promise.allSettled`, damit ein fehlgeschlagener Anhang die anderen nicht blockt.

## Beiträge löschen

„Löschen“ im Kopf eigener Beiträge öffnet `components/ConfirmDialog.svelte` (nativer
`<dialog>`) und ruft `DELETE /api/v1/statuses/:id` auf. Danach räumt `applyStatusRemoval(id)`
(`stores/statusSync.ts`) den Beitrag aus beiden Timelines und aus den Benachrichtigungen;
dieselbe Funktion verarbeitet auch das `delete`-Stream-Ereignis. Die Thread-Ansicht hängt an
der optionalen `onDeleted`-Prop, entfernt den Beitrag aus ihren lokalen Listen und verlässt
die Seite, wenn der gelöschte Beitrag ihr Hauptstatus war.

## Antworten & Erwähnungen

Antworten tragen den Handle der beantworteten Person sichtbar voran (`@janmontag@host …`), genau
wie Mastodons eigener Client. Das ist kein Kosmetik: GoToSocial 0.22.2 bildet die Mentionsliste
ausschließlich aus dem Text und leitet daraus `to`/`cc`, das `tag:mention` und die Meldung ab.
Ohne Erwähnung gibt es für die beantwortete Person also keine Meldung — und wer uns nicht folgt,
bekommt den Beitrag auf fremden Instanzen gar nicht erst zugestellt (verifiziert mit einer
Sandbox-Instanz derselben Binärdatei: Antwort ohne Erwähnung → 0 Meldungen, mit `@alice` oder
`@alice@domain` → Meldung vom Typ `mention`).

Der Composer (`components/Composer.svelte`) setzt den Handle beim Zielwechsel als Textanfang und
lässt ihn bewusst editierbar: Wer ihn löscht, verzichtet auf die Erwähnung. `replyMention()` in
`utils/account.ts` liefert den Handle (`acct`, ferne Konten also mit Domain; beide Formen löst
GoToSocial auf) und `null` bei Antworten auf sich selbst, weil eine Selbst-Erwähnung nur uns
selbst eine Meldung beschert. Ein Entwurf, der mit auf ein anderes Ziel wechselt, wird nur am
Handle umadressiert; nach dem Posten bleibt der Composer in der Antwort-Modus und stellt den
Handle erneut bereit.

## Profile

Jeder Account ist unter `/accounts/[id]` erreichbar. Der Weg dorthin führt über Avatar und
Anzeigename in `StatusBody.svelte`, den Booster-Hinweis in `StatusCard.svelte`, die Namen in den
Meldungen und den eigenen Account in der `Sidebar.svelte` — überall also intern statt per
`target="_blank"` auf die Heimatinstanz. So bleibt man in Phosphor und kann direkt folgen,
favorisieren und boosten.

Der Kopf (`components/AccountHeader.svelte`) zeigt Headerbild, Avatar, Anzeigename inkl.
Custom-Emojis, Handle, Badges (Bot, privat, „Folgt dir“, „Du“), Bio als `{@html}`, Profilfelder
mit Häkchen bei `verified_at`, die Zähler sowie das Beitrittsdatum und einen Link auf das
Originalprofil.

Bio und Feldwerte kommen als HTML an (dieselbe Konvention wie bei Mastodon, das sie ebenfalls
clientseitig rendert); Feldnamen laufen zusätzlich durch `emojify`, weil sie Custom-Emojis als
`:shortcode:` enthalten können. Mastodon versteckt in Link-Texten die uninteressanten Teile in
`<span class="invisible">` — die Regel dafür steht in `layout.css` bei `.status-content`.

Der Beziehungsstatus kommt aus `GET /api/v1/accounts/relationships?id[]=<id>` (`getRelationship`)
und bestimmt die Schaltfläche:

- **Folgen** → `POST /api/v1/accounts/:id/follow`
- **Entfolgen** → `POST /api/v1/accounts/:id/unfollow`
- Bei privaten Konten legt „Folgen“ serverseitig eine Anfrage an (`requested: true`); derselbe
  `unfollow`-Aufruf zieht sie zurück. Die Auswahl trifft `followIntent()` in `utils/account.ts`.

Beide Aufrufe liefern die aktualisierte `Relationship` zurück, die direkt übernommen wird — kein
zweiter Request, keine pessimistischen Sperren. Fehlt die Relationship (z. B. weil die Instanz den
entfernten Account noch nicht aufgelöst hat), startet die Schaltfläche bei „Folgen“; ein Fehler
beim Folgen wird unter dem Kopf angezeigt.

Für die Beiträge wird die vorhandene `TimelineFeed`-Klasse mit einem Loader auf
`GET /api/v1/accounts/:id/statuses` instanziiert. Die Seite hält pro Konto und Filter je einen
Feed, sodass `TimelineView` Infinite Scroll und Ladezustände wie in den Timelines übernimmt.
Umschaltbar sind „Beiträge“ (`exclude_replies=true`), „Mit Antworten“ und „Medien“
(`only_media=true`). Eigene, hier gelöschte Beiträge verschwinden über den `onDeleted`-Callback
aus der Liste.

Bewusst offen: „Annehmen/Ablehnen“ für Follow-Anfragen, Blockieren/Stummschalten sowie das
Auflösen von @-Erwähnungen im Beitragstext zu internen Profillinks (die Erwähnung müsste dafür
erst über `/api/v1/accounts/lookup` auf eine ID abgebildet werden).

## Erscheinungsbild & Barrierefreiheit

Phosphor hatte ursprünglich ein festes Dark-Theme. Barrierefreiheit hat Vorrang, deshalb gibt
es jetzt beides.

**Farben als Tokens.** Komponenten benutzen keine literalen Farben mehr, sondern semantische
Utilities (`bg-canvas`, `bg-surface`, `text-ink-strong`, `text-ink`, `text-ink-soft`,
`text-ink-faint`, `border-line`, `text-accent`, `text-warn`, `text-danger`, `bg-scrim`, …).
Definiert werden sie in `src/routes/layout.css`:

- `:root` hält die Dark-Werte, `:root[data-theme='light']` überschreibt sie.
- Ein `@theme inline`-Block mappt Tailwinds Farb-Namespace auf die Custom Properties
  (`--color-canvas: var(--canvas)` usw.). `inline` ist entscheidend: dadurch referenzieren die
  generierten Utilities die Live-Variablen und ein Theme-Wechsel wirkt zur Laufzeit.
- `body`, Scrollbars, Auswahl und `.status-content` nutzen dieselben Variablen.

**Schriftgröße.** Nur die Typografie skaliert, nicht der Rahmen. Statt die Wurzel-Schriftgröße
zu verändern, multiplizieren die Text-Tokens in `layout.css` (`--text-*` samt Line-Heights)
ihren Wert mit `--text-scale`; `body { font-size: calc(1rem * var(--text-scale)) }` deckt
vererbten Text ohne `text-*`-Utility ab. Weil `rem` dadurch weiter auf der Standard-Wurzel
(16 px) steht, bleiben Breiten (`max-w-2xl` = 42 rem, `md:w-60` = 15 rem), Abstände und Bilder
konstant — es wirkt wie „Große Schrift“ statt wie Zoom. Icons (`Icon.svelte`) und Avatare
(`Avatar.svelte`) sind in px notiert und hängen sich explizit per
`calc(… * var(--ui-scale))` an denselben Faktor, damit sie mit dem Text wachsen. Feste Höhen
wurden auf `min-h-*` umgestellt, damit größere Schrift nicht abgeschnitten wird. Eingebaute
`px`-Textgrößen (`text-[11px]`, `text-[10px]`) wurden auf `calc(… * var(--text-scale))`
umgestellt.

**Kein horizontales Scrollen.** Weil nur die Glyphen wachsen, können enge Zeilen (untere
Navigation, Composer-Aktionsleiste, Status-Fußzeile) breiter werden als der Bildschirm. Solche
Zeilen sind deshalb umbruchfähig (`flex-wrap`) bzw. schrumpfbar (`min-w-0 flex-1`, Labels mit
`truncate`) ausgelegt; lange Wörter im Beitragstext brechen per `overflow-wrap: anywhere`. Als
Sicherheitsnetz verhindert `overflow-x: clip` auf `html`/`body` einen seitlichen Seiten-Scroll —
`clip` erzeugt, anders als `hidden`, keinen Scroll-Container und bricht daher das
`position: sticky` der Kopfzeilen nicht. Geprüft bis 200 % auf 320–1280 px Breite (kein
`scrollWidth > viewport`).

**Persistenz & kein Flackern.** `src/lib/stores/preferences.svelte.ts` hält die Wahl
(`theme`, `textScale`, `motion`) und spiegelt sie nach `document.documentElement`
(`data-theme`, `data-motion`, `--text-scale`) sowie in das `theme-color`-Meta. Gespeichert wird
unter `phosphor:prefs:v1`. Damit beim Laden kein heller/dunkler Blitz entsteht, wendet ein
kurzes Inline-Skript in `app.html` die gespeicherten Werte **vor** dem ersten Paint an; der
Store hält sich danach synchron.

**Bewegung.** `prefers-reduced-motion: reduce` wird automatisch respektiert (CSS-Medienabfrage
in `layout.css`), und `[data-motion='reduce']` erzwingt dasselbe unabhängig vom System. Die
Regel setzt `animation-duration`/`transition-duration` auf `0.01ms` statt die Animationen zu
entfernen, damit Hover-/Fokus-Rückmeldung und Zustandswechsel weiterhin korrekt gezeichnet
werden.

**Umschalter.** Die Seite `/settings` bietet Segmente für Hell/Dunkel/System, Bewegung
(System/Reduziert) und eine Schriftgrößensteuerung (A−/A+, Schieberegler, Zurücksetzen) mit
Live-Vorschau. `'system'` lauscht auf `prefers-color-scheme` und folgt Änderungen zur Laufzeit.

## Bewusste Design-Entscheidungen

- **Eigener API-Client statt `masto.js`.** Die genutzte API-Fläche ist klein; eigener Code
  bedeutet weniger Bundle, volle Kontrolle über Retry/Backoff und keine Upstream-Abhängigkeit.
- **Rendering von `content` per `{@html}`.** GoToSocial liefert bereits sanitisiertes HTML.
  Links werden vor dem Rendern in neue Tabs umgebogen (`withExternalLinks`).
- **Kein Router-Base-Path.** Deshalb wird auf `resolve()` bei Links verzichtet.
- **Icons als Inline-SVG.** Keine zusätzliche Abhängigkeit, volle Kontrolle über Größe/Strich.

## MVP-Stand

✅ Login, ✅ Start-/Lokale Timeline, ✅ Streaming, ✅ Composer, ✅ Favorit/Boost/Merken,
✅ Thread (Klick auf Beitrag), ✅ Benachrichtigungen, ✅ Push, ✅ Hell/Dunkel/System,
✅ Schriftgröße, ✅ reduzierte Bewegung, ✅ Bearbeiten eigener Beiträge,
✅ Anhänge (Bild/Video/Audio mit ALT-Text), ✅ Löschen eigener Beiträge,
✅ Profile (`/accounts/[id]` mit Bio, Beiträgen, Folgen/Entfolgen),
✅ Antworten mit sichtbarer @-Erwähnung.

## Nächste Schritte

1. **Suche** (`/api/v2/search`) und Hashtag-Timelines.
2. **Interaktionen im Thread**: Antworten inline, Kontext laden, Favoriten/Boosts live.
3. **Meldungen filtern** (`types=`) und als gelesen markieren (`/notifications/clear`).
4. **Bilder-Lightbox** und Video-Handling statt „neuer Tab“.
5. **Follow-Anfragen & Moderation**: Annehmen/Ablehnen (`/api/v1/follow_requests`),
   Blockieren/Stummschalten aus dem Profil.
6. **@-Erwähnungen im Text** zu internen Profillinks auflösen.
7. **Offline-Cache** (der Service Worker existiert bereits für Push, cached aber bewusst nichts).
8. **Barrierefreiheit** ausbauen und mit Screenreadern testen (Phanpys bekannte Schwäche).
9. **i18n**: UI-Strings aus den Komponenten in Sprachdateien ziehen.
10. **Multi-Instanz**: `INSTANCE_URL` von Konstante zu Session-State machen; Login mit
    Instanz-Eingabe; App-Registrierung pro Instanz cachen.

# Phosphor — Architektur

## Ziel

Eigenes, schnelles und barrierearmes Web-Frontend für GoToSocial-Instanzen.
Vorbilder sind Pinafore (Svelte, schlank, offline-lesbar) und Phanpy (aufgeräumte Interaktion),
aber mit zeitgemäßem Stack und besserer Zugänglichkeit.

**Nicht-Ziele (vorerst):** Admin-Panel, Multi-Column-Ansicht.

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

### Instanz-Auswahl

`stores/instance.svelte.ts` hält die gewählte Instanz als `$state`, damit jede Ansicht
reaktiv mitbekommt, wenn sie sich ändert:

- Die Login-Seite fragt die URL ab, `normalizeInstanceUrl()` (in `utils/instance.ts`)
  akzeptiert `example.social`, ergänzt fehlendes `https://`, verwirft Pfade/Queries und
  lehnt fremde Schemata sowie Zugangsdaten in der URL ab.
- Die Wahl liegt unter `phosphor:instance:v1` und überlebt Logout und Reload. Das ist
  wichtig, weil sie **vor** dem OAuth-Redirect und beim Callback-Rückweg bekannt sein muss.
- `VITE_INSTANCE_URL` (Build-Zeit, siehe `.env.example`) füllt die Login-Seite für
  Installationen vor, die fest an eine Instanz gebunden sind; ohne Vorgabe startet sie leer.
- Die OAuth-App-Registrierung wird **pro Instanz-Origin** gecacht
  (`phosphor:oauth-app:v1` ist eine Map `origin → app`), damit ein Instanzwechsel keine
  falschen Client-Credentials mitschickt. Alte Sessions ohne `instance`-Feld werden über
  die aktuelle Vorgabe migriert.
- `client.ts`, `oauth.ts` und `streaming.ts` lesen die URL ausschließlich aus diesem Store.

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
  - `update` → neuer Beitrag in den Puffer der Start-Timeline (siehe unten)
  - `status.update` → bestehenden Beitrag ersetzen
  - `delete` → Beitrag entfernen
  - `notification` → neue Meldung in den Puffer + Unread-Punkt; `follow_request` bzw.
    `follow` pflegen zusätzlich die Liste der Folgenanfragen (siehe unten)

### Leseposition bei Live-Updates

Neue Stream-Beiträge werden **nicht sofort** in die Timeline eingefügt. Sonst schiebt sich der
Inhalt unter dem Viewport nach unten: Der Browser behält seine Pixel-Scrollposition, für die
lesende Person sieht es wie ein Sprung nach oben aus. Stattdessen landen sie in
`TimelineFeed.pending` bzw. `NotificationsFeed.pending`, solange die Seite nicht ganz oben ist.
Ein kleiner Hinweis („↑ 3 neue Beiträge“) erscheint; ein Klick springt an den Anfang und fügt
sie dort ein. Scrollt man von selbst nach oben, werden sie ebenfalls übernommen. Ganz oben
werden sie sofort eingefügt, weil dort kein Inhalt verschoben wird.

`loadNew()` (Lücke nach dem Aufwachen) mischt den Puffer in der richtigen Reihenfolge mit den
nachgeladenen Beiträgen und leert ihn; die vorhandene Höhenkompensation in `pullNew()` hält
dabei die Scrollposition. Der Puffer wird auch bei `delete`/`status.update` mitgepflegt.

Die Thread-Ansicht hört **selbst** mit (`streamer.subscribe`): `update` fügt eine neue Antwort,
die in die offene Konversation gehört, an der richtigen Stelle ein und erhöht den Zähler des
beantworteten Beitrags, `status.update` und `delete` halten Vorfahren und Antworten aktuell.
Nur Beiträge von Accounts, denen wir folgen (und eigene), kommen über den Stream — Antworten
Fremder erscheinen erst beim nächsten Nachladen.

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
  Gepufferte Stream-Elemente werden dabei in der richtigen Reihenfolge mit eingemischt. So
  bleiben Pagination und Scrollposition erhalten; ist die Seite heruntergescrollt, wird die
  Viewport-Position über die Höhendifferenz gehalten, damit nichts springt.
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

## Meldungen: Filter & Gelesen-Status

GoToSocial 0.22 kennt **kein** „gelesen“ bzw. „verwerfen“ pro Meldung — nur
`POST /api/v1/notifications/clear` für alle. Phosphor führt den Status deshalb lokal:

- **Filter** (Alle, Erwähnungen, Favoriten, Boosts, Folgt, Sonstiges) laufen client-seitig
  über eine einzige, ungefilterte Liste. Das hält Stream-Einfügungen, Paginierung und
  Gelesen-Status konsistent; serverseitige Filter würden bei jedem Tabwechsel neu laden.
  GtS erwartet außerdem `types[]`/`exclude_types[]` als Query-Arrays, nicht `types=…`.
  „Sonstiges“ ist bewusst der Rest (alles, was in keinen anderen Eimer passt), damit neue
  Meldungstypen nicht stillschweigend verschwinden.
- **Gelesen-Status** liegt in `notifications.svelte.ts` und wird unter
  `phosphor:notifications:read:v1` gespeichert. Er besteht aus einer **Wassermarke**
  (`readUpTo`: alles bis zu diesem Zeitpunkt ist gelesen, gesetzt auf die neueste geladene
  Meldung bei „Alle gelesen“) und einer begrenzten Menge einzeln quittierter IDs
  (max. 500, älteste fallen heraus). Neue Meldungen nach der Wassermarke bleiben ungelesen.
- **Kein Auto-„alles gelesen“ mehr beim Öffnen.** Stattdessen markiert ein Häkchen an jeder
  ungelesenen Meldung genau diese, „Alle gelesen“ quittiert den sichtbaren Stand. Die Glocke
  in der Seitenleiste zählt ungelesene _geladene_ Meldungen; das Layout lädt beim Login eine
  erste Seite, damit der Punkt auch nach einem Reload stimmt.
- Ohne Server-Unterstützung ist der Status **pro Browser** und nicht geräteübergreifend.

## Verzeichnisstruktur

```
src/
  lib/
    config.ts                 # App-Name, Scopes, optionaler Instanz-Default (env)
    instance.svelte.ts        # gewählte Instanz (persistiert, reaktiv)
    utils/
      instance.ts             # URL-Normalisierung (Instanz-Eingabe)
      status.ts               # kanonische Beitrags-URL (url → uri)
      clipboard.ts            # Link kopieren inkl. Fallback für HTTP
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
      notifications.svelte.ts # Meldungen + Filter + lokaler Gelesen-Status
      followRequests.svelte.ts # offene Folgenanfragen (Liste + Annahme/Ablehnung)
      refresh.svelte.ts       # Refresh-Bus für „Neu laden“-Geste
      emojis.svelte.ts        # Custom-Emojis der Instanz (lazy, gecacht)
      statusSync.ts           # bearbeiteten Status in alle Ansichten spiegeln
      preferences.svelte.ts   # Theme, Schriftgröße, Gesten, Markdown-Vorgabe (persistiert)
    components/
      Icon.svelte             # eigene Inline-SVG-Icons (keine Icon-Dependency)
      Avatar.svelte
      MediaGrid.svelte        # Anhänge, Sensitive-Blur, ALT-Badge
      MediaPicker.svelte      # Anhänge im Composer: Vorschau, ALT-Text, Entfernen
      EmojiPicker.svelte      # Custom-Emoji-Auswahl (Suche, Einfügen am Cursor)
      StatusBody.svelte       # eine Statusdarstellung (Inhalt, Aktionen, Umfrage, Card)
      CopyLinkButton.svelte   # Link kopieren mit „Kopiert“-Rückmeldung
      StatusEditor.svelte     # modaler Dialog zum Bearbeiten eigener Beiträge
      ConfirmDialog.svelte    # modaler Bestätigungsdialog (z. B. Löschen, Blockieren)
      StatusCard.svelte       # Boost-Wrapper um StatusBody
      Composer.svelte         # Verfassen/Antworten inkl. Anhänge
      ReplyBox.svelte         # aufgeklappte Antwort direkt unter einem Beitrag
      PullToRefresh.svelte    # Zieh-Geste „neu laden“ am oberen Rand
      Sidebar.svelte          # Navigation (Desktop-Sidebar, mobile Bottom-Bar)
      TimelineView.svelte     # Liste + Infinite Scroll + Zustände
      AccountHeader.svelte    # Profilkopf: Headerbild, Bio, Felder, Zahlen, Aktionen
  routes/
    +layout.ts                # SPA-Modus
    +layout.svelte            # App-Hülle, Auth-Guard, Stream-Verdrahtung
    layout.css                # Tailwind + Phosphor-Theme + Content-Styles
    +page.svelte              # Start-Timeline + Composer
    login/+page.svelte
    callback/+page.svelte
    local/+page.svelte        # lokale Timeline
    follow_requests/+page.svelte # offene Folgenanfragen annehmen/ablehnen
    notifications/+page.svelte
    settings/+page.svelte     # Erscheinungsbild, Schriftgröße, Neu-laden-Geste & Push
    status/[id]/+page.svelte  # Thread (Vorfahren + Hauptstatus + Antworten)
    accounts/[id]/+page.svelte # Profil: Kopf, Filter, Beiträge, Folgen/Moderation
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

## Custom-Emojis

Die Instanz stellt ihre Emojis über `GET /api/v1/custom_emojis` bereit
(`getCustomEmojis`, gecacht in `stores/emojis.svelte.ts`). `EmojiPicker.svelte` zeigt sie
lazy in einem Dropdown mit Suche und fügt den Shortcode **an der Cursorposition** ein
(Auswahl wird ersetzt, danach steht der Cursor hinter dem Emoji).

GoToSocial ersetzt `:shortcode:` im `content` **nicht** selbst: Es liefert den Shortcode-Text
und die passende Liste `status.emojis` (bzw. `account.emojis`) daneben. Phosphor löst deshalb
clientseitig auf:

- `emojify()` für reine Textfelder (Anzeigenamen, Feldnamen); der Text wird zuerst escaped.
- `emojifyHtml()` für bereits gerendertes HTML (Beitragstext, Bio, Feldwerte). Es ersetzt nur
  Textknoten, lässt Attribute/URLs unangetastet und überspringt `<code>`/`<pre>`, damit
  Shortcode-Beispiele wörtlich bleiben.

## Link-Preview-Cards

`StatusBody.svelte` rendert `status.card` bereits vollständig (Bild, Provider, Titel,
Beschreibung). GoToSocial 0.22 liefert das Feld aber **nie** aus:
`internal/typeutils/internaltofrontend.go` setzt `Card: nil, // TODO: implement cards`,
und es gibt keinen OpenGraph-Fetch. Eine Client-Lösung scheitert an CORS (beliebige
Zielseiten erlauben keinen Browser-Fetch) und würde Nutzer-URLs an Dritte schicken.
Cards brauchen daher Server-/Proxy-Unterstützung oder eine spätere GtS-Version.

## Textformat: Markdown & Backslashes

GoToSocial parst Beitragstext standardmäßig **so, wie es das Konto vorgibt**
(`account.source.status_content_type`, meist `text/plain`, hier `text/markdown`). Phosphor
sendet den Modus jetzt immer explizit (`content_type` in `postStatus`/`editStatus`), statt
sich still auf die Kontoeinstellung zu verlassen:

- Der Composer hat einen **MD-Schalter**. Seine Vorgabe ist `auto` (folgt dem Konto);
  ein Klick setzt dauerhaft `on`/`off` (`preferences.markdown`, gespeichert unter
  `phosphor:prefs:v1`). Beim Bearbeiten spiegelt der Dialog den Formatmodus des Beitrags
  (`getStatusSource().content_type`).
- **Backslashes:** In Markdown maskiert `\` das folgende Sonderzeichen (`\"` → `"`, `\*` → `*`).
  Das ist gewolltes Markdown-Verhalten, aber unsichtbar, wenn der Modus nicht bekannt ist.
  Deshalb zeigt der Composer einen Hinweis, sobald ein Backslash im Text steht; für einen
  sichtbaren Backslash muss `\\` geschrieben werden. Im **Plaintext-Modus** (`text/plain`)
  bleibt ein Backslash dagegen literal — das behebt den ursprünglichen Bug.
- Markdown selbst rendert weiterhin der Server (goldmark); Phosphor zeigt das Ergebnis als
  sanitisiertes HTML. Ein clientseitiger Preview wäre eine spätere Ausbaustufe.

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

### Darstellung

`components/MediaGrid.svelte` rendert Anhänge direkt im Beitrag:

- **Bilder** sind Buttons und öffnen `components/MediaLightbox.svelte` als Overlay — kein
  neuer Tab. Die Lightbox zeigt Vor/Zurück (auch per Pfeiltasten), Zähler, ALT-Text,
  Original-Link, schließt per Esc/Button/Backdrop und gibt den Fokus an den Auslöser zurück.
- **Video/GIFV** laufen inline mit nativen Controls; ein Overlay-Button öffnet dieselbe
  Lightbox (GIFV dort stumm/loop).
- **Audio** bekommt einen inline `<audio controls>`-Player mit Beschreibung.
- **Unbekannte Typen** bleiben ein externer Link.

Bei sensiblen Beiträgen liegt vorher der Reveal-Button über dem Grid; die Lightbox öffnet
erst nach dem Aufdecken. Die Lightbox sperrt das Body-Scrolling und ist als
`role="dialog" aria-modal="true"` ausgezeichnet.

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

### Erwähnungen im Beitragstext

GoToSocial liefert Erwähnungen als Anchors mit `class="mention"` und der Profil-URL der
Herkunftsinstanz. Damit man beim Lesen in Phosphor bleibt, schreibt `utils/text.ts#linkMentions()`
sie auf `/accounts/{id}` um. Die Zuordnung kommt aus `status.mentions`: zuerst über die
kanonische `mention.url` (abschließender Schrägstrich wird ignoriert), sonst über den sichtbaren
`@acct`-Text oder – wenn GtS nur `@<span>username</span>` ohne Domain rendert – über
`username@host` aus der Anchor-URL. Der Fallback ist nötig, weil die URL im Anchor auf die ferne
Instanz zeigen kann, während `status.mentions[].url` auf die eigene Kopie verweist. Hashtags
tragen in GtS ebenfalls `class="mention hashtag"`; sie werden ausdrücklich ausgenommen.

Unbekannte Erwähnungen (nicht in `status.mentions`) bleiben unangetastet und öffnen wie bisher
die Herkunftsinstanz in einem neuen Tab. Die Render-Reihenfolge in `StatusBody` ist deshalb:
`linkMentions()` → `linkHashtags()` → `withExternalLinks()`. `withExternalLinks()` annotiert nur
noch absolute `http(s)`-Links ohne vorhandenes `target`; relative Ziele wie `/accounts/…` werden
nicht angefasst.

## Profile

Jeder Account ist unter `/accounts/[id]` erreichbar. Der Weg dorthin führt über Avatar und
Anzeigename in `StatusBody.svelte`, den Booster-Hinweis in `StatusCard.svelte`, die Namen in den
Meldungen und den eigenen Account in der `Sidebar.svelte` — überall also intern statt per
`target="_blank"` auf die Heimatinstanz. So bleibt man in Phosphor und kann direkt folgen,
favorisieren und boosten.

Der Kopf (`components/AccountHeader.svelte`) zeigt Headerbild, Avatar, Anzeigename inkl.
Custom-Emojis, Handle, Badges (Bot, privat, „Folgt dir“, „Du“), Bio als `{@html}`, Profilfelder
mit Häkchen bei `verified_at`, die Zähler sowie das Beitrittsdatum und einen Link auf das
Originalprofil (siehe „Original-Links & Teilen“).

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

- `src/lib/utils/thread.ts` bündelt die reine Logik (`insertReply`, `applyThreadRevision`,
  `mergeStatus`, `removeFromThread`), damit sie ohne Svelte testbar bleibt
  (`thread.spec.ts`).

## Original-Links & Teilen

Phosphor bleibt der Ort, an dem man liest und interagiert. Für manches braucht man aber die
Seite der Instanz, die einen Beitrag oder ein Profil tatsächlich hostet — zum Teilen, für
Vorschauen/Embeds, Meldewege oder Einstellungen. Deshalb gibt es direkte Links, ohne die App
zu verlassen zu müssen:

- **Profil:** Das Link-Symbol am Handle und „Auf \<host\> öffnen“ führen zu `account.url`.
  Bei entfernten Konten ist das die Heimatinstanz, bei lokalen die eigene. „Profil-Link“
  kopiert die URL in die Zwischenablage.
- **Beitrag:** Das externe Link-Symbol in der Fußzeile öffnet `status.url`; „Link“ kopiert
  die kanonische URL. Bei Boosts zeigt beides auf den Originalbeitrag, nicht auf den
  Boost-Wrapper (`StatusCard` reicht den effektiven Status weiter).
- `utils/status.ts#originalStatusUrl()` bevorzugt `status.url` und fällt auf `status.uri`
  zurück, weil manche entfernten Implementierungen `url` weglassen (GtS selbst liefert für
  entfernte Beiträge die URL der Herkunftsinstanz). Akzeptiert werden nur `http(s)`-URLs;
  fehlt beides, werden die Links ausgeblendet.
- Das Kopieren läuft über `utils/clipboard.ts` (Clipboard-API mit `textarea`-Fallback für
  HTTP-Origins). `components/CopyLinkButton.svelte` zeigt zwei Sekunden „Kopiert“ und
  meldet Erfolg/Fehler per `aria-live`.

Ein echtes `<iframe>`-Embed bietet GoToSocial 0.22 nicht: Es gibt weder `/embed` noch
oEmbed (Feature-Request #5000). Der kopierte Link ist aber genau die kanonische URL, die
Mastodon-kompatible Embed-Consumer und Link-Vorschauen verwenden.

## Antworten im Thread und in Timelines

Antworten müssen nicht mehr den Thread öffnen: Die Antwort-Schaltfläche klappt einen
Antwortkasten direkt **unter dem Beitrag** auf (`components/ReplyBox.svelte`, ein dünner
Wrapper um den Composer mit Kontextzeile und Zuklappen). Sie toggelt — erneutes Drücken
schließt wieder. Das gilt in der Start-/Lokal-/Profil-Timeline (`TimelineView`) und an jeder
Station des Threads (Vorfahren, Hauptbeitrag, Antworten); der Composer am Ende der
Thread-Seite bleibt für die Antwort auf den Hauptbeitrag.

Gemerkt wird nicht das Status-Objekt, sondern seine **ID**: Feed- und Thread-Listen werden bei
jedem Refresh neu aufgebaut, und ein Reply gegen eine veraltete Kopie würde den Zähler am
falschen Objekt erhöhen. Nach dem Absenden schließt der Kasten, die neue Antwort wird in den
Thread einsortiert (in der Timeline nur der `replies_count`-Zähler erhöht — sie gehört ja nicht
in die Zeitleiste).

## Folgenanfragen

Bei einem privaten Profil legt „Folgen“ serverseitig eine Anfrage an. Sie landen unter
`/follow_requests` (Sidebar-Eintrag „Anfragen“, mit Zahl-Badge), wo jeweils Annehmen
(`POST /api/v1/follow_requests/:id/authorize`) und Ablehnen
(`POST /api/v1/follow_requests/:id/reject`) möglich sind; beide Aufrufe antworten mit der
aktualisierten `Relationship`. Der Sidebar-Eintrag erscheint nur, wenn das eigene Profil privat
ist (`account.locked`) oder tatsächlich etwas offen ist.

Zwei Wege halten die Liste aktuell, ohne zu pollen:

- `GET /api/v1/follow_requests` beim Login (`stores/followRequests.svelte.ts`, lädt einmal) und
  erneut beim Öffnen der Seite.
- Der Stream: Eine `follow_request`-Meldung fügt den Account hinzu, eine `follow`-Meldung
  entfernt ihn. GoToSocial ersetzt beim Annehmen die `follow_request`-Meldung durch eine
  `follow`-Meldung — der zweite Zweig ist also die Bestätigung, wenn die Anfrage woanders
  (anderes Gerät, andere App) beantwortet wurde.

## Moderation im Profil

Der Profilkopf (`components/AccountHeader.svelte`) hat neben „Folgen“ ein Menü (⋯) mit
Stummschalten und Blockieren; der Zustand steht als Badge („Stummgeschaltet“, „Blockiert“)
daneben, ebenso „Hat dich blockiert“ bei `blocked_by`. Blockieren fragt über
`ConfirmDialog` nach, Stummschalten nicht (leicht reversibel, und der Menüeintrag toggelt).

API-Eigenheiten, in einer Sandbox gegen dieselbe GtS-Version geprüft:

- **`notifications` ist standardmäßig `false`.** `POST /api/v1/accounts/:id/mute` ohne Parameter
  setzt `muting_notifications: false` — Meldungen der Person kämen also weiter durch.
  `muteAccount()` sendet deshalb immer `notifications=true`.
- **Blockieren trennt beide Richtungen** und antwortet mit `blocking: true, following: false,
followed_by: false`.
- **Alle drei Aufrufe liefern die frische `Relationship`** — kein Nachladen nötig.

Antwortet jemand auf eine eigene Anfrage, kennt die Relationship das als `requested_by`: Ein
solches Profil zeigt statt des Folgen-Buttons „Annehmen“/„Ablehnen“ und hält die Anfragenliste
im Store synchron.

Bewusst offen: Domänen-Blocks, `domain_blocking` und das Auflösen von @-Erwähnungen im
Beitragstext zu internen Profillinks (die Erwähnung müsste dafür erst über
`/api/v1/accounts/lookup` auf eine ID abgebildet werden).

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
(`theme`, `textScale`, `motion`, `pullToRefresh`) und spiegelt sie nach `document.documentElement`
(`data-theme`, `data-motion`, `--text-scale`) sowie in das `theme-color`-Meta. Gespeichert wird
unter `phosphor:prefs:v1`. Damit beim Laden kein heller/dunkler Blitz entsteht, wendet ein
kurzes Inline-Skript in `app.html` die gespeicherten Werte **vor** dem ersten Paint an; der
Store hält sich danach synchron.

## Neu laden per Wischen

`PullToRefresh.svelte` sitzt in der App-Hülle (die Geste gilt für das Viewport, nicht für eine
Liste) und reagiert auf eine Abwärtsbewegung ab dem oberen Rand. Bewusst schlicht gehalten:

- **Nur ab dem oberen Rand.** Start erst ab `scrollY <= 8`; sonst bleibt die Geste normales
  Scrollen. Nach dem Start wird eine Bewegung abgebrochen, sobald sie aufwärts geht, seitlich
  dominiert (Verhältnis `|dx| > 1.5·|dy|`) oder die Seite wegscrollt.
- **Übernahme nur bei eindeutiger Richtung.** Ab 8 px Zug wird die Geste übernommen und
  `preventDefault()` gerufen, damit weder das Rubber-Banding der Seite noch das native
  Neuladen des Browsers dazwischenfunkt.
- **Gedämpft & mit Schwelle.** Der Zug wächst mit `0.5·Weg` (max. 96 px); ab 64 px löst das
  Loslassen aus. Der Indikator (Pille mit Pfeil, „Ziehen …“ → „Loslassen …“ → „Aktualisiere …“)
  folgt dem Zug, `prefers-reduced-motion` wird respektiert.
- **Ein Bus statt direkter Aufrufe.** Weil die Hülle nicht weiß, welche Seite offen ist,
  signalisiert sie nur `refreshEvent.request()` (`refresh.svelte.ts`). Die Hülle selbst lädt die
  drei Feeds über `refreshViews()` (`statusSync.ts`, dieselbe Lückenfüllung wie beim Resume —
  kein Scroll- oder Paginierungsverlust). Thread, Profil und Folgenanfragen registrieren in
  `onMount` einen Listener über `refreshEvent.subscribe(...)` und lesen ihre eigenen Daten neu
  (Thread: `getStatus` + `getContext` mit In-Place-Patch; Profil: Account + Relationship +
  `feed.loadNew()`; Anfragen: `followRequests.load(true)`). Der Bus hält die Listener als
  einfaches `Set` (kein `$state`/`$effect`), damit sich die Registrierung nicht selbst erneut
  auslöst.
- **Standard nur in der installierten App.** Im Browser-Tab gibt es die native Geste schon,
  deshalb ist die Einstellung `auto` (Standard) nur bei `display-mode: standalone` bzw.
  `navigator.standalone` aktiv. **Einstellungen → Neu laden per Wischen** erlaubt „Automatisch“,
  „Immer“ und „Aus“.

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
✅ Antworten mit sichtbarer @-Erwähnung,
✅ Antworten inline (Timeline & Thread), Live-Aktualisierung im Thread,
✅ Folgenanfragen annehmen/ablehnen, ✅ Blockieren/Stummschalten aus dem Profil,
✅ Suche & Hashtag-Timelines, ✅ Meldungen filtern & einzeln als gelesen markieren,
✅ expliziter Markdown-/Plaintext-Modus im Composer, ✅ Custom-Emoji-Picker,
✅ Custom-Emojis in Beiträgen, Bio und Profilfeldern,
✅ Medien-Lightbox für Bilder, Video-Overlay und Audio-Player,
✅ Instanz-Auswahl beim Login (eine App für beliebige GtS-Instanzen),
✅ Originalprofil/-beitrag öffnen und Link kopieren (Teilen/Embedden),
✅ Erwähnungen im Beitragstext als interne Profillinks.

## Nächste Schritte

1. **Offline-Cache** (der Service Worker existiert bereits für Push, cached aber bewusst nichts).
2. **Barrierefreiheit** ausbauen und mit Screenreadern testen (Phanpys bekannte Schwäche).
3. **i18n**: UI-Strings aus den Komponenten in Sprachdateien ziehen.
4. **Link-Preview-Cards**: GtS 0.22 liefert `card` nie (kein OpenGraph-Fetch); die Anzeige
   in `StatusBody` ist fertig, bräuchte aber Server-/Proxy-Unterstützung.

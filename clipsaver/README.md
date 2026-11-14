# ClipSaver

Android-App zum Speichern von Videos und Bildern **von jeder Plattform**: TikTok, YouTube, Instagram, X/Twitter, Facebook, Reddit,
Pinterest, Snapchat, Threads, Bluesky, Vimeo, Twitch, Tumblr und über 2000 weitere Seiten. Link einfügen (oder in der jeweiligen App auf
**Teilen → ClipSaver**), bei Videos die Qualität wählen – **1080p, 1440p oder 4K** – und herunterladen. Beiträge, die nur aus Bildern
bestehen (Fotos, Karussells, Galerien), werden genauso gespeichert, ebenso MP3 und **Werbung**, auch reine Bild-Anzeigen.

**APK:**
- [`release/ClipSaver.apk`](release/ClipSaver.apk) – für fast alle Handys (64-Bit, arm64-v8a), ab Android 7, ca. 54 MB
- [`release/ClipSaver-32bit.apk`](release/ClipSaver-32bit.apk) – nur falls die erste sich nicht installieren lässt (ältere bzw. 32-Bit-Handys, z. B. Android Go)

## Installieren

1. APK aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.
4. Beim ersten Start richtet die App ihre Download-Engine ein (einmalig ca. 10–30 Sekunden, oben rechts „Startet …“ → „Bereit“).
   Zusammen mit der Engine belegt die App etwa 250 MB.

## Funktionen

- **Links erkennen** – egal wie der Link ankommt:
  - **Teilen → ClipSaver** in jeder App, **Text markieren → „Mit ClipSaver laden“**, Einfügen ins Feld (📋) oder Vorschlag, wenn beim
    Öffnen ein neuer Link in der Zwischenablage liegt (abschaltbar unter „Mehr“).
  - Links mitten im Text, auch mit Emojis, „Anführungszeichen“, Klammern, Markdown, geschützten oder unsichtbaren Leerzeichen
    oder ohne `https://`. Unter dem Eingabefeld steht sofort, was erkannt wurde (z. B. „Instagram · Reel“).
  - Stehen mehrere Links im Text, nimmt die App den Beitrag statt Profil oder Startseite; ein anderer lässt sich auswählen.
  - Kurz- und Teilen-Links werden aufgelöst (t.co, pin.it, bit.ly, vm.tiktok.com, instagram.com/share/…, facebook.com/share/…,
    reddit.com/r/…/s/…, t.snapchat.com …), Weiterleitungen ausgepackt (google.com/url, l.instagram.com, l.facebook.com,
    YouTube-Weiterleitungen, Anmeldeseiten mit `next=`), Tracking-Anhängsel entfernt (`?igsh=`, `?si=`, `?s=…&t=…`, `utm_…` …).
- **Laden** – Die App fragt gleichzeitig drei Ausleser und führt die Ergebnisse zusammen – ein Beitrag mit Video **und** Bildern zeigt
  beides:
  - **Videos und Shorts** in **1080p**, **1440p** oder **4K** – die App zeigt zu jeder Stufe die ungefähre Dateigröße. Stufen, die es für
    ein Video nicht gibt, sind ausgegraut (hochgerechnet wird nichts). Hochkant-Videos zählen nach der kürzeren Seite (1080×1920 = 1080p).
  - **MP3** (nur Ton). Bei TikTok wird der Ton des Videos genommen, nicht nur die Hintergrundmusik.
  - **TikTok-Foto-Posts** (Slideshows): alle Bilder in voller Größe, einzeln auswählbar, plus die Musik.
  - **YouTube-Community-Beiträge** (`youtube.com/post/…`): alle Bilder in Originalgröße, auch Beiträge mit mehreren Bildern.
  - **Vorschaubild / Titelbild** jedes Videos in bester Auflösung.
  - **Instagram**: Reels, Videos, Fotos und Karussells (gemischt aus Bildern und Videos) – jedes Teil einzeln auswählbar.
  - **X/Twitter**: Videos (alle Qualitäten) und Bilder in Originalgröße, auch Beiträge, die nur Bilder haben; funktioniert ohne Anmeldung.
  - **Facebook, Reddit, Pinterest, Snapchat, Threads, Bluesky, Tumblr, Vimeo, Twitch, Imgur, Flickr …**: Videos über yt-dlp
    (über 1800 Seiten), Bilder und Galerien über gallery-dl (über 300 Seiten).
  - **Jede andere Webseite**: Video und Vorschaubild aus den Angaben der Seite (og:image, og:video, `<video>`), eingebettete Player
    (z. B. YouTube) werden erkannt.
  - **Playlists**: alle Videos auf einmal in der gewählten Qualität.
  - Findet die App auf einer Seite gar nichts, öffnet „Im Browser suchen“ die Seite und sammelt alle Videos und Bilder, die dort geladen
    werden. Zeigt eine Plattform den Beitrag nur angemeldet, bietet die Fehlermeldung direkt „Bei … anmelden“ an.
- **Werbung** – Video- und Bild-Anzeigen speichern:
  - Link einer Anzeige einfügen: TikTok-Anzeigen über **Teilen → Link kopieren**; viele YouTube-Spots sind normale (oft nicht gelistete) Videos.
  - **Werbebibliotheken** direkt in der App durchsuchen: [TikTok Werbebibliothek](https://library.tiktok.com/ads),
    [TikTok Top Ads](https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/de), das
    [Google Anzeigen-Transparenzcenter](https://adstransparency.google.com/?region=DE) (YouTube-Videowerbung, Bild-Anzeigen) und die
    [Meta Werbebibliothek](https://www.facebook.com/ads/library/) (Instagram- und Facebook-Anzeigen).
    Der eingebaute Browser erkennt alle Videos, Bilder, HLS-Streams und eingebetteten YouTube-Videos der Seite – auch in den iframes
    der Anzeigen. Unten auf „… gefunden – anzeigen“ tippen, auswählen, speichern. Kleine Icons werden automatisch ausgeblendet;
    eingebettete YouTube-Werbevideos lassen sich ebenfalls in 1080p/1440p/4K laden.
- **Downloads** – laufende Downloads mit Fortschritt, Geschwindigkeit und Restzeit (auch in der Benachrichtigung, mit „Abbrechen“).
  Downloads laufen im Hintergrund weiter. Fertige Dateien: öffnen, teilen, Original-Link öffnen, löschen.
  Gespeichert wird in der Galerie: Videos → **Filme/ClipSaver**, Bilder → **Bilder/ClipSaver**, Ton → **Musik/ClipSaver**.
- **Mehr** – Standard-Qualität, Download-Engine aktualisieren (yt-dlp und gallery-dl, automatisch einmal täglich, optional Nightly),
  Anmeldung bei Instagram, TikTok, X, YouTube, Facebook, Reddit (oder `cookies.txt` für jede andere Seite).

### Gut zu wissen

- **Qualität:** Geladen wird, was die Plattform anbietet. TikTok, Instagram und X liefern meist höchstens 1080p; 1440p/4K gibt es nur,
  wenn das Video so hochgeladen wurde (vor allem YouTube, Vimeo, Facebook). Bis 1080p nimmt die App H.264 (läuft überall, auch in Schnitt-Apps). 1440p und 4K bietet YouTube nur als VP9 oder AV1
  an – die App nimmt VP9 und packt es mit AAC-Ton in eine MP4-Datei; das spielen praktisch alle Handys ab Android 10 ab.
- **Wenn etwas nicht mehr klappt:** Plattformen ändern ihre Seiten oft. „Mehr → Jetzt aktualisieren“ holt die neuesten Versionen von
  yt-dlp und gallery-dl (ohne neue APK).
- **Anmeldung:** Instagram und Facebook zeigen viele Beiträge nur angemeldet; ohne Anmeldung liest die App Instagram-Bilder über die
  öffentliche Einbettung, Videos darin aber oft nur als Vorschaubild. Für private oder altersbeschränkte Inhalte bzw. wenn YouTube fragt
  „Bist du ein Bot?“: „Mehr → Anmeldung“. Google blockiert die Anmeldung manchmal in eingebauten Browsern – dann am PC eine `cookies.txt`
  exportieren und importieren.
- **Eigene Ausleser** gibt es für TikTok-Fotos, YouTube-Beiträge, X und Instagram (die übrigen Werkzeuge können das nicht oder nur
  angemeldet). Blockt TikTok oder YouTube die direkte Abfrage, versucht es die App automatisch noch einmal mit einem unsichtbaren Browser.
- Lade nur Inhalte herunter, die du speichern darfst (eigene Videos, mit Erlaubnis oder für den privaten Gebrauch, soweit das Urheberrecht es
  erlaubt). Inhalte bleiben Eigentum der Urheber.

## Aufbau

- `app/assets/www/` – die Oberfläche (HTML/CSS/JS, `app.js`); spricht über `window.Android` mit der App
- `app/java/de/clipsaver/app/`
  - `MainActivity.java` – WebView-Hülle, Brücke zur Oberfläche, Teilen-Empfang, Anmeldung/Cookies, unsichtbarer Browser als Ersatz
  - `Analyzer.java` – prüft einen Link: TikTok/YouTube mit eigenem Ablauf, alle anderen Seiten parallel über yt-dlp, gallery-dl und die
    eigenen Ausleser; `Results.java` führt die Ergebnisse zusammen
  - `Engine.java` – yt-dlp über [youtubedl-android](https://github.com/JunkFood02/youtubedl-android) 0.18.1 (Python 3.12, yt-dlp, QuickJS
    für die YouTube-Prüfungen, FFmpeg): Infos, Download, Update
  - `Formats.java` – wählt die Formate für 1080p/1440p/4K (die exakten Format-IDs bekommt yt-dlp beim Download), Größen, Vorschaubilder
  - `TikTok.java` – TikTok-Seiten auslesen: Foto-Posts, Videofassungen, Musik, Lösung der Sicherheitsprüfung (wie in yt-dlp)
  - `YouTubePosts.java` – Bilder aus Community-Beiträgen (`ytInitialData`)
  - `Gallery.java` + `GalleryList.java` – [gallery-dl](https://github.com/mikf/gallery-dl) 1.32.19 für Bilder und Galerien, läuft mit dem
    Python aus youtubedl-android (die Wheels von gallery-dl, requests & Co. liegen in den Assets, Updates kommen von PyPI)
  - `Twitter.java` – X/Twitter über den öffentlichen Einbettungs-Endpunkt (wie yt-dlp), `Instagram.java` – Instagram-Einbettungsseite,
    `PageMedia.java` – Bilder/Videos aus den Meta-Angaben beliebiger Webseiten
  - `BrowserActivity.java` + `MediaSniffer.java` – eingebauter Browser mit Medien-Erkennung (Werbebibliotheken, beliebige Seiten), Anmeldung
  - `DownloadService.java` – Warteschlange als Vordergrund-Dienst mit Benachrichtigungen; `Saver.java` – Galerie (MediaStore) und Verlauf
  - `Links.java` – Link-Erkennung: Links im Text finden, den passendsten wählen, Weiterleitungen und Tracking entfernen,
    Kurz-/Teilen-Links auflösen, Plattform und Art erkennen („Instagram · Reel“)
  - `Http.java`, `Cookies.java`, `Json.java` – Hilfsklassen
- `tools/build.sh` – baut die APKs ohne Android SDK (lädt aapt2, dx, Android-Klassen und die Bibliotheken von Maven Central, die
  gallery-dl-Wheels mit Prüfsumme von PyPI über `tools/fetch_wheels.py`)

## Selbst bauen

```sh
pip install cryptography
./tools/build.sh                                   # -> release/ClipSaver.apk + release/ClipSaver-32bit.apk
ABIS=arm64-v8a VERSION_CODE=4 VERSION_NAME=1.3 ./tools/build.sh
```

Signiert wird mit dem Debug-Schlüssel `tools/debug-signing.p12` (Passwort `android`), damit Updates sich über die alte Version installieren
lassen. Für eine Veröffentlichung einen eigenen, geheimen Schlüssel verwenden.

## Tests

```sh
./tools/test/run.sh                                # Link-Erkennung, Auslese (TikTok, YouTube, X, Instagram, Webseiten, gallery-dl-Ausgabe),
                                                   # Zusammenführen, Formatwahl, Medien-Erkennung, Cookies (Java)
node tools/test/browser-js.js                      # Skripte, die die App in fremden Seiten ausführt (Chromium/Playwright)
pip install "yt-dlp==2025.11.12" && python3 tools/ytdlp-test/test_ytdlp.py   # yt-dlp-Aufrufe der App mit echtem yt-dlp + FFmpeg, offline
./tools/robotest/run.sh                            # App-Start, Oberfläche, Browser, Download-Dienst in Robolectric (nach build.sh)
node tools/ui-preview/run.js                       # Oberfläche mit Testdaten durchklicken + Screenshots (tools/ui-preview/shots)
```

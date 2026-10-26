# ClipSaver

Android-App zum Speichern von TikTok- und YouTube-Inhalten: Link einfügen (oder in TikTok/YouTube auf **Teilen → ClipSaver**),
Qualität wählen – **1080p, 1440p oder 4K** – und herunterladen. Dazu Bilder (TikTok-Foto-Slideshows, YouTube-Community-Beiträge,
Vorschau-/Titelbilder), MP3 und **Werbung** von TikTok und YouTube, auch reine Bild-Anzeigen.

**APK:**
- [`release/ClipSaver.apk`](release/ClipSaver.apk) – für fast alle Handys (64-Bit, arm64-v8a), ab Android 7, ca. 53 MB
- [`release/ClipSaver-32bit.apk`](release/ClipSaver-32bit.apk) – nur falls die erste sich nicht installieren lässt (ältere bzw. 32-Bit-Handys, z. B. Android Go)

## Installieren

1. APK aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.
4. Beim ersten Start richtet die App ihre Download-Engine ein (einmalig ca. 10–30 Sekunden, oben rechts „Startet …“ → „Bereit“).
   Zusammen mit der Engine belegt die App etwa 250 MB.

## Funktionen

- **Laden** – TikTok- oder YouTube-Link einfügen (📋 fügt aus der Zwischenablage ein und prüft sofort):
  - **Videos und Shorts** in **1080p**, **1440p** oder **4K** – die App zeigt zu jeder Stufe die ungefähre Dateigröße. Stufen, die es für
    ein Video nicht gibt, sind ausgegraut (hochgerechnet wird nichts). Hochkant-Videos zählen nach der kürzeren Seite (1080×1920 = 1080p).
  - **MP3** (nur Ton). Bei TikTok wird der Ton des Videos genommen, nicht nur die Hintergrundmusik.
  - **TikTok-Foto-Posts** (Slideshows): alle Bilder in voller Größe, einzeln auswählbar, plus die Musik.
  - **YouTube-Community-Beiträge** (`youtube.com/post/…`): alle Bilder in Originalgröße, auch Beiträge mit mehreren Bildern.
  - **Vorschaubild / Titelbild** jedes Videos in bester Auflösung.
  - **Playlists**: alle Videos auf einmal in der gewählten Qualität.
  - Über 1000 weitere Seiten, die yt-dlp kennt. Erkennt die App auf einer Seite nichts, öffnet „Im Browser suchen“ die Seite und
    sammelt alle Videos und Bilder, die dort geladen werden.
- **Werbung** – Video- und Bild-Anzeigen speichern:
  - Link einer Anzeige einfügen: TikTok-Anzeigen über **Teilen → Link kopieren**; viele YouTube-Spots sind normale (oft nicht gelistete) Videos.
  - **Werbebibliotheken** direkt in der App durchsuchen: [TikTok Werbebibliothek](https://library.tiktok.com/ads),
    [TikTok Top Ads](https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/de) und das
    [Google Anzeigen-Transparenzcenter](https://adstransparency.google.com/?region=DE) (YouTube-Videowerbung, Bild-Anzeigen).
    Der eingebaute Browser erkennt alle Videos, Bilder, HLS-Streams und eingebetteten YouTube-Videos der Seite – auch in den iframes
    der Anzeigen. Unten auf „… gefunden – anzeigen“ tippen, auswählen, speichern. Kleine Icons werden automatisch ausgeblendet;
    eingebettete YouTube-Werbevideos lassen sich ebenfalls in 1080p/1440p/4K laden.
- **Downloads** – laufende Downloads mit Fortschritt, Geschwindigkeit und Restzeit (auch in der Benachrichtigung, mit „Abbrechen“).
  Downloads laufen im Hintergrund weiter. Fertige Dateien: öffnen, teilen, Original-Link öffnen, löschen.
  Gespeichert wird in der Galerie: Videos → **Filme/ClipSaver**, Bilder → **Bilder/ClipSaver**, Ton → **Musik/ClipSaver**.
- **Mehr** – Standard-Qualität, Download-Engine aktualisieren (automatisch einmal täglich, optional Nightly), Anmeldung.

### Gut zu wissen

- **Qualität:** Geladen wird, was die Plattform anbietet. TikTok liefert meist höchstens 1080p; 1440p/4K gibt es nur, wenn das Video so
  hochgeladen wurde. Bis 1080p nimmt die App H.264 (läuft überall, auch in Schnitt-Apps). 1440p und 4K bietet YouTube nur als VP9 oder AV1
  an – die App nimmt VP9 und packt es mit AAC-Ton in eine MP4-Datei; das spielen praktisch alle Handys ab Android 10 ab.
- **Wenn etwas nicht mehr klappt:** YouTube und TikTok ändern ihre Seiten oft. „Mehr → Jetzt aktualisieren“ holt die neueste yt-dlp-Version
  (ohne neue APK). Für altersbeschränkte oder private Inhalte bzw. wenn YouTube fragt „Bist du ein Bot?“: „Mehr → Anmeldung“.
  Google blockiert die Anmeldung manchmal in eingebauten Browsern – dann am PC eine `cookies.txt` von youtube.com exportieren und importieren.
- **TikTok-Fotos und YouTube-Beiträge** liest die App selbst aus (yt-dlp kann das nicht). Blockt die Plattform die direkte Abfrage, versucht
  es die App automatisch noch einmal mit einem unsichtbaren Browser.
- Lade nur Inhalte herunter, die du speichern darfst (eigene Videos, mit Erlaubnis oder für den privaten Gebrauch, soweit das Urheberrecht es
  erlaubt). Inhalte bleiben Eigentum der Urheber.

## Aufbau

- `app/assets/www/` – die Oberfläche (HTML/CSS/JS, `app.js`); spricht über `window.Android` mit der App
- `app/java/de/clipsaver/app/`
  - `MainActivity.java` – WebView-Hülle, Brücke zur Oberfläche, Teilen-Empfang, Anmeldung/Cookies, unsichtbarer Browser als Ersatz
  - `Analyzer.java` – prüft einen Link und wählt den Weg (yt-dlp, eigene TikTok-/YouTube-Auslese, Browser)
  - `Engine.java` – yt-dlp über [youtubedl-android](https://github.com/JunkFood02/youtubedl-android) 0.18.1 (Python 3.12, yt-dlp, QuickJS
    für die YouTube-Prüfungen, FFmpeg): Infos, Download, Update
  - `Formats.java` – wählt die Formate für 1080p/1440p/4K (die exakten Format-IDs bekommt yt-dlp beim Download), Größen, Vorschaubilder
  - `TikTok.java` – TikTok-Seiten auslesen: Foto-Posts, Videofassungen, Musik, Lösung der Sicherheitsprüfung (wie in yt-dlp)
  - `YouTubePosts.java` – Bilder aus Community-Beiträgen (`ytInitialData`)
  - `BrowserActivity.java` + `MediaSniffer.java` – eingebauter Browser mit Medien-Erkennung (Werbebibliotheken, beliebige Seiten), Anmeldung
  - `DownloadService.java` – Warteschlange als Vordergrund-Dienst mit Benachrichtigungen; `Saver.java` – Galerie (MediaStore) und Verlauf
  - `Links.java`, `Http.java`, `Cookies.java`, `Json.java` – Hilfsklassen
- `tools/build.sh` – baut die APKs ohne Android SDK (lädt aapt2, dx, Android-Klassen und die Bibliotheken von Maven Central)

## Selbst bauen

```sh
pip install cryptography
./tools/build.sh                                   # -> release/ClipSaver.apk + release/ClipSaver-32bit.apk
ABIS=arm64-v8a VERSION_CODE=2 VERSION_NAME=1.1 ./tools/build.sh
```

Signiert wird mit dem Debug-Schlüssel `tools/debug-signing.p12` (Passwort `android`), damit Updates sich über die alte Version installieren
lassen. Für eine Veröffentlichung einen eigenen, geheimen Schlüssel verwenden.

## Tests

```sh
./tools/test/run.sh                                # Link-Erkennung, TikTok/YouTube-Auslese, Formatwahl, Medien-Erkennung, Cookies (Java)
node tools/test/browser-js.js                      # Skripte, die die App in fremden Seiten ausführt (Chromium/Playwright)
pip install "yt-dlp==2025.11.12" && python3 tools/ytdlp-test/test_ytdlp.py   # yt-dlp-Aufrufe der App mit echtem yt-dlp + FFmpeg, offline
./tools/robotest/run.sh                            # App-Start, Oberfläche, Browser, Download-Dienst in Robolectric (nach build.sh)
node tools/ui-preview/run.js                       # Oberfläche mit Testdaten durchklicken + Screenshots (tools/ui-preview/shots)
```

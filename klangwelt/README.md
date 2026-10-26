# Klangwelt

Musik-App im Stil von Spotify für **Windows (EXE)** und **Android (APK)**, gebaut auf dem
[Spotify Tracks Dataset](https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset): **81.206 Songs** von rund
30.000 Künstlern aus 114 Genres, mit Audio-Merkmalen (Tempo, Tonart, Energie, Tanzbarkeit, Stimmung …).
Keine Anmeldung, kein Spotify-Konto nötig. Wer will, verbindet zusätzlich Spotify und findet dann **jeden Song auf Spotify**
(siehe „Spotify-Suche“).

## Download

| | Datei | |
|---|---|---|
| Windows 10/11 (64 Bit) | `Klangwelt-Windows-x64.zip` (ca. 145 MB) | entpacken, `Klangwelt.exe` starten |
| Android 7+ | [`release/Klangwelt.apk`](release/Klangwelt.apk) (ca. 4 MB) | aufs Handy laden und installieren |

Die Windows-ZIP ist zu groß fürs Repository (max. 100 MB pro Datei); sie entsteht mit `npm run build:win` (siehe unten).
Windows SmartScreen bzw. Android/Play Protect warnen eventuell, weil die Apps nicht aus einem Store kommen.

## Funktionen

- **Entdecken:** Suche über Songs, Künstler, Alben und Genres (Akzente egal), „Bester Treffer“, alle 114 Genres als Kacheln.
- **Mixe:** bis zu 6 **Daily Mixe** aus deinen Lieblingssongs (nach Genre, jeden Tag neu), **Mix der Woche** mit neuen Songs,
  die zu deinem Geschmack passen (jeden Montag neu), **Stimmungen** (Gute Laune, Chillen, Workout, Party, Fokus, Akustisch,
  Traurig & schön, Zum Einschlafen), **Charts** (Top 50 gesamt und je Genre), **Radio** zu jedem Song, Künstler und Genre.
  Jeder Mix lässt sich als Playlist speichern.
- **Bibliothek:** Lieblingssongs (Herz), eigene Playlists (erstellen, umbenennen, Beschreibung, sortieren, löschen) mit
  Song-Suche und **Empfehlungen** passend zur Playlist, gespeicherte Alben, gefolgte Künstler, zuletzt gehört.
- **Player:** ohne Werbung, **unbegrenzt überspringen**, jeden Song direkt wählen, Warteschlange („Als Nächstes spielen“),
  Zufall, Wiederholen (alle/einen), **Endlos-Wiedergabe** (geht nach dem letzten Song mit passenden Songs weiter),
  **Sleep-Timer**, Song-Infos (BPM, Tonart, Energie, Tanzbarkeit …). Desktop: „Jetzt läuft“-Bereich rechts, Tastatur
  (Leertaste, Strg+←/→, Strg+K). Handy: Mini-Player und Vollbild-Player.
- **Übertragen:** Einstellungen → „Code kopieren“ / „Code einfügen“ nimmt die Bibliothek vom PC aufs Handy (und umgekehrt).

### Spotify-Suche (alle Songs, optional)

Der Datensatz hat „nur“ 81.206 Songs. Über **Einstellungen → Spotify verbinden** (oder den Hinweis in der Suche) durchsucht
Klangwelt zusätzlich den ganzen Spotify-Katalog über die offizielle Spotify Web API:

- Unter den Katalog-Treffern erscheinen „Songs/Künstler/Alben auf Spotify“ (10 Treffer pro Abruf, „Mehr laden“ bis 200).
- Spotify-Songs lassen sich abspielen (Vorschau), liken, in Playlists und die Warteschlange packen; sie bleiben gespeichert und
  wandern mit dem Bibliotheks-Code mit. Spotify-Alben und -Künstler haben eigene Seiten (speichern/folgen).
- Für Spotify-Songs außerhalb des Datensatzes gibt es keine Audio-Merkmale; Radio und Endlos-Wiedergabe nehmen dann die Songs
  desselben Künstlers aus dem Katalog.

Einmalig nötig ist eine eigene Spotify-Entwickler-App (die von Klangraum geht auch): auf
[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) **Create app**, bei **Redirect URIs**
`http://127.0.0.1:43822/callback` (Windows) und `klangwelt://callback` (Android) eintragen, **Web API** ankreuzen und die
**Client ID** in Klangwelt einfügen. Premium braucht nur der Besitzer der Entwickler-App (Regel seit Februar 2026); das eigene
Konto darf kostenlos sein und wird dann im Dashboard unter „User Management“ eingetragen. Das automatische Auslesen von
open.spotify.com ist nach den Spotify-Nutzungsbedingungen nicht erlaubt und wird deshalb nicht verwendet.

### Was abgespielt wird

Der Datensatz enthält **keine Musik**, nur Songdaten. Klangwelt spielt deshalb über den **offiziellen Spotify-Player**
(Spotify iFrame API) die **30-Sekunden-Vorschau** jedes Songs – ohne Anmeldung, Internet nötig. Ganze Songs gibt es nur bei
Spotify selbst: „Ganzen Song in Spotify hören“ öffnet den Song in der Spotify-App (bzw. im Browser). Ganze Songs kostenlos
und ohne Werbung in der App abzuspielen, ist rechtlich nicht möglich – die Musik gehört den Labels.

Cover: zuerst ein erzeugtes Farbcover (geht offline), dann – wenn online – das echte Albumcover über `open.spotify.com/oembed`
(nur für sichtbare Einträge, wird gespeichert).

## Aufbau

- `web/` – Oberfläche (HTML/CSS/JS, ohne Abhängigkeiten): `catalog.js` (Katalog laden, Suche, Künstler/Alben/Genres,
  ähnliche Songs über die Audio-Merkmale, Mixe, Spotify-Songs außerhalb des Datensatzes), `library.js` (Bibliothek in
  `localStorage`, Export-Code), `spotify.js` (Spotify-Anmeldung mit PKCE und Suche, gleiche Datei wie in Klangraum), `preview.js`
  (Spotify-Player steuern, Ende erkennen), `covers.js`, `platform.js`, `app.js`, `data/catalog.json` (Katalog, 8 MB)
- `desktop/` – Electron-Hülle (`app://klangwelt/`, Cover-Abruf und Spotify-Anmeldung über `127.0.0.1:43822` im Hauptprozess)
  und `build.mjs` (Windows-ZIP ohne Wine)
- `android/` – WebView-Hülle (`MainActivity.java`: Spotify-Anmeldung im Custom Tab, Rückkehr über `klangwelt://callback`),
  Manifest, Icons
- `tools/` – `build_catalog.py` (CSV → Katalog), APK-Build, Icons, Tests

## Selbst bauen

```sh
# Katalog aus dem Datensatz erzeugen (CSV von Hugging Face/Kaggle)
python3 -I klangwelt/tools/build_catalog.py dataset.csv klangwelt/web/data/catalog.json

# Windows-ZIP (Node.js 22.12+)
cd klangwelt/desktop && npm install && npm run build:win    # -> klangwelt/release/Klangwelt-Windows-x64.zip
npm start                                                   # direkt starten (Entwicklung)

# Android-APK (JDK 17+, Python 3 mit "cryptography")
./klangwelt/tools/build-android.sh                          # -> klangwelt/release/Klangwelt.apk

# Icons
python3 klangwelt/tools/make_icons.py
```

## Tests

```sh
node klangwelt/tools/test-catalog.js                  # Katalog, Suche, Ähnlichkeit, Mixe, Bibliothek
node klangwelt/tools/ui-test.js [bilder-ordner]       # Oberfläche in Chromium (PC + Handy), Spotify-Player nachgebaut
xvfb-run -a node klangwelt/tools/electron-test.js     # Desktop-App (KW_APP=…/app.asar für die gepackte App)
```

## Daten und Rechte

Songdaten: „Spotify Tracks Dataset“ von Maharshi Pandya (Hugging Face, BSD-Lizenz; Spiegel mit CC0 von
sai-chaitanya-reddy auf GitHub), gesammelt über die Spotify Web API. Vorschauen und Cover kommen direkt von Spotify.
Klangwelt ist kein offizielles Spotify-Produkt.

# Klangwelt

Musik-App im Stil von Spotify für **Windows (EXE)** und **Android (APK)**, gebaut auf dem
[Spotify Tracks Dataset](https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset): **81.206 Songs** von rund
30.000 Künstlern aus 114 Genres, mit Audio-Merkmalen (Tempo, Tonart, Energie, Tanzbarkeit, Stimmung …).
Keine Anmeldung, kein Spotify-Konto nötig.

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

### Was abgespielt wird

Der Datensatz enthält **keine Musik**, nur Songdaten. Klangwelt spielt deshalb über den **offiziellen Spotify-Player**
(Spotify iFrame API) die **30-Sekunden-Vorschau** jedes Songs – ohne Anmeldung, Internet nötig. Ganze Songs gibt es nur bei
Spotify selbst: „Ganzen Song in Spotify hören“ öffnet den Song in der Spotify-App (bzw. im Browser). Ganze Songs kostenlos
und ohne Werbung in der App abzuspielen, ist rechtlich nicht möglich – die Musik gehört den Labels.

Cover: zuerst ein erzeugtes Farbcover (geht offline), dann – wenn online – das echte Albumcover über `open.spotify.com/oembed`
(nur für sichtbare Einträge, wird gespeichert).

## Aufbau

- `web/` – Oberfläche (HTML/CSS/JS, ohne Abhängigkeiten): `catalog.js` (Katalog laden, Suche, Künstler/Alben/Genres,
  ähnliche Songs über die Audio-Merkmale, Mixe), `library.js` (Bibliothek in `localStorage`, Export-Code), `preview.js`
  (Spotify-Player steuern, Ende erkennen), `covers.js`, `platform.js`, `app.js`, `data/catalog.json` (Katalog, 8 MB)
- `desktop/` – Electron-Hülle (`app://klangwelt/`, Cover-Abruf im Hauptprozess) und `build.mjs` (Windows-ZIP ohne Wine)
- `android/` – WebView-Hülle (`MainActivity.java`), Manifest, Icons
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

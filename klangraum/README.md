# Klangraum

Eine Musik-App im Stil von Spotify für **Windows (EXE)** und **Android (APK)**. Du verbindest einmal dein Spotify-Konto,
danach zeigt Klangraum automatisch:

- **alle deine Playlists** – eigene, gemeinsame und die von anderen Leuten, die du gespeichert hast (Filter „Von dir“ / „Von anderen“),
- **deine Lieblingssongs** („Favorite Songs“, alle Seiten, mit Suche und Sortierung),
- gespeicherte Alben, gefolgte Künstler, zuletzt gehört und deine Top-Songs/-Künstler.

Abgespielt wird über Spotify Connect: Klangraum steuert die Spotify-App auf dem PC, dem Handy, im Browser oder auf einem Lautsprecher
(Play/Pause, Vor/Zurück, Zufall, Wiederholen, Spulen, Lautstärke, Gerät wechseln, Warteschlange, Herz für Lieblingssongs).

## Download

| | Datei | |
|---|---|---|
| Windows 10/11 (64 Bit) | `Klangraum-Windows-x64.zip` (ca. 140 MB) | entpacken, `Klangraum.exe` starten |
| Android 7+ | [`release/Klangraum.apk`](release/Klangraum.apk) (ca. 90 KB) | aufs Handy laden und installieren |

Die Windows-ZIP ist zu groß fürs Repository (GitHub erlaubt max. 100 MB pro Datei). Sie wird mit `npm run build:win` erzeugt (siehe unten).

- **Windows:** SmartScreen warnt eventuell, weil die EXE nicht signiert ist → „Weitere Informationen“ → „Trotzdem ausführen“.
- **Android:** „Unbekannte Apps installieren“ für Browser/Dateimanager erlauben; Play Protect eventuell mit „Trotzdem installieren“ bestätigen.

## Einmalig einrichten (ca. 2 Minuten)

Spotify lässt nur registrierte Apps auf ein Konto zugreifen. Deshalb legst du einmal eine eigene, kostenlose Spotify-Entwickler-App an
und gibst ihre Client-ID in Klangraum ein (PC und Handy können dieselbe Client-ID nutzen):

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) öffnen, mit dem Spotify-Konto anmelden, **Create app**.
2. Bei **Redirect URIs** beide Adressen eintragen (jeweils **Add**):
   - `http://127.0.0.1:43821/callback` (Windows-App)
   - `klangraum://callback` (Android-App)
3. **Web API** ankreuzen, Bedingungen bestätigen, **Save**.
4. Unter **Settings** die **Client ID** kopieren, in Klangraum einfügen und **Mit Spotify verbinden** klicken.
   Es öffnet sich der Browser mit der Spotify-Anmeldung; nach „Zustimmen“ geht es in der App automatisch weiter.

## Was Spotify seit Februar 2026 vorgibt

Spotify hat die Regeln für selbst angelegte Apps („Development Mode“) im Februar 2026 verschärft. Klangraum ist darauf ausgelegt:

- **Premium:** Nur der Besitzer der Entwickler-App braucht Spotify Premium, sonst lehnt Spotify alle Anfragen ab. Die (bis zu 5)
  eingetragenen Konten dürfen kostenlos sein – siehe „Ohne Premium“.
- **Bis zu 5 Konten** pro Entwickler-App; weitere Konten im Dashboard unter „User Management“ eintragen.
- **Playlists von anderen:** Spotify liefert die Songliste nur noch für eigene und gemeinsame Playlists. Gespeicherte Playlists anderer
  Leute erscheinen trotzdem vollständig in der Bibliothek (Name, Cover, Ersteller, Anzahl Songs) und lassen sich komplett abspielen
  (auch mit Zufall); die Songliste zeigt Klangraum dort über den offiziellen Spotify-Player (Embed) an.
- Die Suche liefert höchstens 10 Treffer pro Typ; Künstler-Top-Songs gibt es nicht mehr (Klangraum zeigt stattdessen Songs aus der Suche
  und deine Lieblingssongs dieses Künstlers).

## Ohne Premium

Wer selbst kein Premium hat, kann Klangraum trotzdem mit dem eigenen (kostenlosen) Konto nutzen:

1. Jemand mit Premium (Familie, Freunde) legt die Entwickler-App an wie oben beschrieben.
2. Er trägt dich im Dashboard unter **User Management** ein (Name + E-Mail-Adresse deines Spotify-Kontos).
3. Er gibt dir die **Client ID**; du fügst sie in Klangraum ein und verbindest **dein eigenes Konto**.

Bibliothek, alle Playlists (eigene und gespeicherte von anderen), Lieblingssongs, Suche und das Herz funktionieren dann normal.
Fernsteuern lässt Spotify kostenlose Konten nicht. Klangraum erkennt das beim ersten Abspielen und öffnet Songs, Playlists und Alben
ab dann direkt in der Spotify-App (am PC wahlweise im Browser); dort gelten die Regeln des kostenlosen Kontos. In den Einstellungen
lässt sich das umschalten („Ich habe jetzt Premium“ / „Kostenloses Konto: in Spotify öffnen“).

## Bedienung

- **Desktop:** Seitenleiste mit Bibliothek (Filter, Suche, Sortierung), Startseite mit Schnellzugriff, Doppelklick auf einen Song spielt ihn
  im Kontext der Playlist. Tasten: Leertaste = Play/Pause, Strg+→/← = Weiter/Zurück, Strg+K = Suchen, F5 = neu laden.
- **Handy:** Tabs Start / Suchen / Bibliothek, Mini-Player über den Tabs, Tippen darauf öffnet den Vollbild-Player. Die Zurück-Taste schließt
  Menüs und Seiten.
- Läuft auf keinem Gerät Spotify, bietet Klangraum „Spotify öffnen“ (bzw. am PC den Web-Player) an und startet die Musik, sobald das Gerät
  auftaucht. Über das Geräte-Symbol im Player wechselst du jederzeit das Gerät.
- Bibliothek und Playlists werden zwischengespeichert, damit die App sofort startet; im Hintergrund wird aktualisiert.

## Aufbau

- `web/` – die gemeinsame Oberfläche (HTML/CSS/JS, keine Abhängigkeiten): `spotify.js` (Anmeldung mit PKCE, Token-Erneuerung,
  Blättern, Player, Normalisierung der API-Antworten inkl. der neuen Feldnamen), `app.js` (Oberfläche), `platform.js` (Brücke zu
  Windows/Android/Browser), `store.js` (Zwischenspeicher in IndexedDB)
- `desktop/` – Windows-App mit Electron: `main.js` (Fenster, `app://`-Protokoll, Anmelde-Server auf `127.0.0.1:43821`, Token-Abruf),
  `preload.js`, `build.mjs` (packt die Windows-ZIP mit Icon und Versionsinfo – auch unter Linux, ohne Wine)
- `android/` – WebView-Hülle: `MainActivity.java` (Oberfläche unter `https://appassets.androidplatform.net`, Anmeldung im Custom Tab,
  Rückkehr über `klangraum://callback`, Spotify-App starten), Manifest und Icons
- `tools/` – Build-Skript für die APK, Icons, Tests

## Selbst bauen

```sh
# Windows-ZIP (unter Windows, macOS oder Linux; Node.js 22.12+)
cd klangraum/desktop
npm install
npm run build:win            # -> klangraum/release/Klangraum-Windows-x64.zip
npm start                    # App direkt starten (Entwicklung)

# Android-APK (JDK 17+, Python 3 mit "cryptography")
./klangraum/tools/build-android.sh            # -> klangraum/release/Klangraum.apk
VERSION_CODE=4 VERSION_NAME=1.2.0 ./klangraum/tools/build-android.sh

# Icons neu erzeugen (Python mit Pillow)
python3 klangraum/tools/make_icons.py
```

Die APK wird mit dem Debug-Schlüssel des Repos (`tools/debug-signing.p12`) signiert, damit Updates sich über die alte Version installieren lassen.

## Tests

```sh
node klangraum/tools/test-spotify.js                     # API-Client gegen nachgebaute Spotify-API
node klangraum/tools/ui-test.js [bilder-ordner]          # Oberfläche in Chromium (PC, Handy, Android-Brücke), mit Screenshots
xvfb-run -a node klangraum/tools/electron-test.js        # Desktop-App: Anmeldung über 127.0.0.1, Bibliothek, Links
```

`ui-test.js` und `electron-test.js` brauchen Playwright (`npm install playwright`) und, für den Desktop-Test, `npm install` in `desktop/`.

Klangraum ist kein offizielles Spotify-Produkt. Musik, Cover und Daten stammen von Spotify.

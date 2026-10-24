# DarkOS – Custom Handy-Launcher

Ein futuristischer Android-Launcher mit schwarzem Design, Neon-Akzenten, Widgets, Animationen und eigenen App-Icons.

**APK:** [`release/DarkOS.apk`](../release/DarkOS.apk) (ab Android 7, ca. 330 KB)

## Installieren

1. `release/DarkOS.apk` aufs Handy laden und öffnen („Unbekannte Apps installieren“ erlauben, Play-Protect-Hinweis mit
   „Trotzdem installieren“ bestätigen).
2. DarkOS öffnen → „Als Startbildschirm festlegen“. Danach öffnet die Home-Taste DarkOS.
   Zurück zum alten Launcher: Android-Einstellungen → Apps → Standard-Apps → Startbildschirm.

## Bedienung

| Geste | Wirkung |
|---|---|
| Nach oben wischen / Suchleiste | App-Menü mit Suche, „Häufig genutzt“ und Buchstabenleiste |
| Nach rechts wischen | Widget-Seite |
| Nach unten wischen | Benachrichtigungen |
| App lange drücken | Zum Startbildschirm/Dock, Icon anpassen, Umbenennen, Ausblenden, App-Info, Deinstallieren, App-Verknüpfungen |
| Leere Fläche lange drücken | Design, Widgets, alle Apps |
| Home-Taste auf dem Startbildschirm | Menü/App-Menü schließen bzw. zurück zur Startseite |

## Funktionen

- **Startseite:** große Neon-Uhr (Schrift Orbitron), Datum, nächster Wecker, Begrüßung mit Namen, Mini-Widgets (Akku, Wetter,
  Speicher), bis zu 16 Lieblings-Apps und ein leuchtendes Dock mit 5 Apps. Bei der ersten Einrichtung belegt DarkOS
  Dock und Startbildschirm automatisch mit Telefon, Nachrichten, Browser, Kamera, Galerie und beliebten Apps.
- **Eigene App-Icons:** Für rund 250 bekannte Apps (WhatsApp, YouTube, Spotify, Banking-Apps, Samsung/Xiaomi/Pixel-System-Apps …)
  und typische Namen („Kamera“, „Rechner“, „Wetter“ …) zeichnet DarkOS ein eigenes Neon-Symbol. Unbekannte Apps bekommen
  ihr Monochrom-Icon (ab Android 13) oder ein leuchtendes Monogramm. Stile: **Neon**, **Verlauf**, **Glas** (Original-Icon im
  Neon-Rahmen), **Original**; Formen: abgerundet, Kreis, eckig; Farben bunt oder in der Akzentfarbe.
  Pro App lassen sich Symbol (138 zur Auswahl), Farbe oder das Original-Icon einstellen.
- **Widgets** (Widget-Seite): Wetter mit 4-Tage-Vorhersage ([Open-Meteo](https://open-meteo.com), ohne Konto), Akku
  (Ladestand, Temperatur, Restladezeit), Schnellzugriff (Taschenlampe, WLAN, Bluetooth, Internet, Ton, Display, Wecker, Kamera),
  Kalender, Notiz, System (Speicher, Arbeitsspeicher, Laufzeit) – plus **Android-Widgets** aller installierten Apps.
  Widgets lassen sich verschieben, entfernen und (Android-Widgets) in der Höhe anpassen.
- **Animationen:** bewegter Hintergrund (Neon-Grid, Nebel, Partikel oder reines Schwarz für AMOLED), App-Menü folgt dem Finger,
  Icons ploppen gestaffelt herein, Weichzeichner hinter dem App-Menü (ab Android 12), Zoom beim App-Start, leuchtender Ladering.
  Respektiert „Animationen entfernen“ in den Bedienungshilfen und lässt sich abschalten.
- **Einstellungen:** 8 Akzentfarben, Hintergrund, Icon-Stil/-Form/-Farben, App-Namen, 4 oder 5 Spalten, Name, Mini-Widgets,
  Wetter-Ort, ausgeblendete Apps, Startbildschirm zurücksetzen.

Internet wird nur für das Wetter genutzt. Alle Einstellungen bleiben auf dem Gerät.

## Aufbau

- `java/de/darkos/launcher/` – nativer Java-Code ohne Bibliotheken:
  `LauncherActivity` (Startbildschirm), `HomePage`, `WidgetsPage`, `DrawerView` (App-Menü), `PagerLayout` (Gesten),
  `IconFactory`/`Icons` (eigene Icons + Cache), `NeonBackground`, `Widgets`, `WidgetHost` (Android-Widgets), `Menus`/`Sheet`
  (Neon-Menüs), `SettingsActivity`, `Weather`, `Prefs`
- `res/drawable/g_*.xml` – Neon-Symbole, erzeugt aus [Lucide](https://lucide.dev) (ISC) mit
  `node darkos/tools/make_glyphs.js <lucide-static>/icon-nodes.json`
- `assets/fonts/` – Orbitron (SIL Open Font License), Lizenzen in `assets/licenses/`
- `tools/build.sh` – baut `release/DarkOS.apk` ohne Android SDK (lädt aapt2, dx und die Android-Klassen von Maven Central)
- `tools/make_icons.py` – PNG-Launcher-Icons für Android 7
- `test/` – Robolectric-Tests mit Screenshots: `darkos/tools/build.sh && mvn -f darkos/test/pom.xml test`
  (Screenshots landen in `build/darkos/screenshots/`). `test/src/stubs` ersetzt die nur bei Google gehostete
  Bibliothek `androidx.test:monitor` durch minimale Platzhalter.

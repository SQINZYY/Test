# SetupBuilder

Android-App zum Planen von Gaming-PCs und Setups: Komponenten auswählen, die garantiert zusammenpassen, Teile vergleichen, Budget verwalten, den eigenen PC mit Freunden teilen und Upgrade-Tipps bekommen.

**APK:** [`release/SetupBuilder.apk`](release/SetupBuilder.apk) (ab Android 7, ca. 7 MB). Internet wird nur für Geizhals (Wunschlisten und Preise) genutzt.

## Installieren

1. `release/SetupBuilder.apk` aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## Funktionen

- **Entdecken** – Setup-Stile (Teal Night, Budget-Einstieg, Clean White, Mini-ITX, 4K Battlestation, Streamer) als Startpunkt übernehmen.
- **Builder** – PC-Komponenten plus Setup (Monitore, Tastatur, Maus, Headset, Stuhl, Tisch, Extras).
  Die Teileauswahl zeigt **nur Teile, die zum Rest des Builds passen**. Geprüft wird u. a.:
  - CPU ↔ Mainboard-Sockel (AM4, AM5, LGA1700, LGA1851), BIOS-Hinweise
  - RAM-Typ (DDR4/DDR5), Anzahl Riegel vs. Steckplätze, max. RAM
  - Mainboard-Formfaktor ↔ Gehäuse
  - Grafikkarte ↔ Mainboard (PCIe x16; Karten mit nur 8 Lanes im PCIe-3.0-Slot), Gehäuse (Länge in mm und Dicke in Slots)
    und Netzteil (Leistung, Anzahl 8-Pin-PCIe-Stecker, 12V-2×6-Adapter)
  - RAM-Takt auf Chipsätzen ohne XMP (z. B. H610)
  - Netzteil-Leistung inkl. Reserve, ATX/SFX ↔ Gehäuse
  - Kühler: Sockel, Bauhöhe bzw. Radiatorgröße ↔ Gehäuse, Kühlleistung ↔ CPU
  - M.2-/SATA-Plätze und 3,5"-Schächte
  - CPU ohne Grafikeinheit und ohne Grafikkarte, CPU ohne Kühler

  Unpassende Teile lassen sich einblenden – mit Begründung, warum sie nicht passen.
- **Importieren** (Builder → „Import“ oder Startseite → „Importieren“):
  - **Geizhals-Wunschliste:** Link einfügen, auch Kurzlinks wie `gh.de/g/…` (oder aus dem Browser an SetupBuilder teilen). Die Liste öffnet sich
    kurz im eingebauten Browser (ein Cookie-Hinweis kann dort bestätigt werden) und wird automatisch ausgelesen, inkl. Preisen.
  - **Screenshots:** Screenshots einer Teileliste (Geizhals, Shop, Discord …) auswählen oder an SetupBuilder teilen. Die Texterkennung
    ([Tesseract](https://github.com/naptha/tesseract.js), läuft komplett auf dem Handy) liest die Produktnamen, und die Produktbilder
    werden aus dem Screenshot ausgeschnitten und im Builder angezeigt. Auch lange Screenshots einer ganzen Geizhals-Liste (helles oder
    dunkles Design) funktionieren: Produktkarten werden als Ganzes gelesen, die Kategoriezeilen helfen bei unbekannten Teilen.
  - **Text oder Build-Code** einfügen.

  Danach zeigt eine Prüfseite jede Zuordnung („Erkannt“, „Ähnliches Modell“ = gleicher Chip/gleiche Serie, „Nicht in der Datenbank“)
  und lässt dich Teil, Kategorie und Preis ändern. Teile, die nicht in der Datenbank stehen, kommen als „eigenes Teil“ in den Build –
  sie zählen fürs Budget, werden aber nicht auf Kompatibilität geprüft.
- **Vergleichen** – bis zu 3 Teile nebeneinander, inkl. geschätzter FPS in deinem Build.
- **Aktuelle Preise** (Budget → „Preise von Geizhals abrufen“) – sucht jedes Teil auf Geizhals und übernimmt den Bestpreis („ab …“).
  In der Teile-Ansicht öffnet „Auf Geizhals ansehen“ die Suche im Browser.
- **Budget** – Budget festlegen (nur PC oder PC + Setup), Aufteilung nach Kategorien, Spar-Tipps mit passenden günstigeren Teilen, eigene Preise pro Teil, **Auto-Build** (schnellster kompatibler PC fürs Budget).
- **Mein PC & Teilen** – eigenen PC eintragen und als **Bildkarte** (Setup-Grafik, Teile mit Produktbildern, Preis, FPS) oder als Text über WhatsApp, Discord usw. teilen. Die Nachricht enthält einen Build-Code (`SB1.…`), den Freunde unter „Meine PCs → Code importieren“ einfügen oder die Nachricht direkt an SetupBuilder teilen.
- **Upgrade-Berater** – schlägt Upgrades vor, die zu deinem Mainboard, Gehäuse und Netzteil passen (bei Bedarf inkl. neuem Netzteil), mit geschätztem FPS-Gewinn und Preis. Lässt sich als Upgrade-Plan speichern.

Preise sind Richtpreise und FPS-Werte grobe Schätzungen. Alle Daten bleiben auf dem Handy.

## Aufbau

- `app/assets/www/` – die Oberfläche (HTML/CSS/JS): `data.js` (Teile-Datenbank), `engine.js` (Kompatibilität, Leistung, Upgrades, Teilen),
  `import.js` (Erkennung von Teilen in Geizhals-HTML/Text), `ocr.js` (Screenshots → Text → Teile + Produktbilder),
  `sharecard.js` (Build als Bild), `app.js` (UI)
- `app/assets/www/vendor/tesseract/` – tesseract.js 7 mit englischen Sprachdaten (Apache-2.0)
- `app/java/…/MainActivity.java` – WebView-Hülle: Teilen, Zwischenablage, Speicher, eingebauter Browser für Geizhals, Bildauswahl,
  geteilte Links/Screenshots empfangen; `ShareProvider.java` stellt das Bild der Build-Karte zum Teilen bereit
- `tools/build.sh` – baut die APK ohne Android SDK (lädt aapt2, dx und die Android-Klassen von Maven Central)
- `tools/test-engine.js` – Tests für Datenbank und Logik: `node tools/test-engine.js`

## Selbst bauen

```sh
pip install cryptography
./tools/build.sh                          # -> release/SetupBuilder.apk
VERSION_CODE=4 VERSION_NAME=1.3 ./tools/build.sh
```

Signiert wird mit dem Debug-Schlüssel `tools/debug-signing.p12` (Passwort `android`), damit Updates sich über die alte Version installieren lassen. Für eine Veröffentlichung im Play Store einen eigenen, geheimen Schlüssel verwenden.

Neue Teile kommen in `app/assets/www/data.js` (mit Suchbegriffen `k` für den Import); danach `node tools/test-engine.js` laufen lassen.

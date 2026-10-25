# Standbild

Video oder Foto rein, Poster raus: Standbild schaut sich ein Video an (TikTok, YouTube Shorts oder längere Videos), sucht die
stärksten Momente heraus und gestaltet daraus zwölf druckfertige Poster in verschiedenen Stilen. Fotos (eins oder bis zu 12)
werden direkt zu Postern. Alles läuft auf dem Gerät, nichts wird hochgeladen.

- **Android:** [`release/Standbild.apk`](../release/Standbild.apk) (ab Android 7, ca. 250 KB). Installation wie bei SetupBuilder:
  APK aufs Handy laden, öffnen, „Unbekannte Apps installieren“ erlauben.
- **PC (Browser):** [`release/Standbild.html`](../release/Standbild.html) herunterladen und doppelt anklicken. Eine einzige Datei mit
  allen Schriften und Skripten, läuft offline in Chrome, Edge, Firefox und Safari.

## So funktioniert's

1. **Video oder Fotos wählen** – über die Buttons oder hineinziehen. Auf Android kann man Videos und Fotos auch aus der Galerie,
   TikTok usw. per „Teilen“ an Standbild schicken. TikTok- und YouTube-Videos vorher herunterladen (ein Link allein reicht nicht).
2. **Analyse eines Videos** (ca. 20–30 s für ein kurzes Video):
   - tastet das Video ab (4 Bilder pro Sekunde, höchstens 180 Bilder) und misst Schärfe, Kontrast, Belichtung und Farbigkeit,
   - überspringt schwarze Übergänge und schneidet Kino-Balken (Letterbox) weg,
   - erkennt Schnitte und nimmt aus jeder Szene das beste Bild, möglichst unterschiedlich zueinander,
   - sucht rund um jedes gewählte Bild nach einem noch schärferen Moment,
   - holt bis zu 6 Standbilder in voller Auflösung (plus Zusatzbilder für den Kontaktabzug),
   - bestimmt Farbpaletten und den Bildschwerpunkt, damit beim Zuschneiden ins Hochformat das Motiv drinbleibt.
   **Fotos** brauchen keine Auswahl: Jedes Foto wird in voller Auflösung übernommen (bis 4096 px, ab drei Fotos 2560 px),
   Palette und Bildschwerpunkt werden genauso bestimmt. Statt Zeitcodes stehen auf den Postern Fotonummer und Bildgröße;
   Filmstreifen und Kontaktabzug gibt es ab zwei Fotos, der Filmbarcode wird zu Farbstreifen (Farben jeder Spalte nach Helligkeit sortiert).
3. **Poster** – zwölf Ideen, jede Vorlage mit dem dazu passendsten Standbild:
   Kino, Magazin, Duotone, Raster, Galerie, Farbpalette, Filmstreifen, Kontaktabzug, Siebdruck, Halbton, Minimal, Filmbarcode.
   „Mehr Ideen“ kombiniert weitere Stile und Bilder.
4. **Bearbeiten** – Poster antippen: Stil, Standbild, Ausschnitt (im Bild ziehen, Zoom), Akzentfarbe und eigene Texte ändern,
   duplizieren oder entfernen. Titel, Untertitel und Zeile oben gelten für alle Poster.
5. **Speichern** – einzeln oder alle auf einmal (Browser: ZIP, Android: Galerie unter *Bilder › Standbild*).
   Formate: Poster 2:3 (2400 × 3600), DIN A (2480 × 3508 = A4 bei 300 dpi), Insta 4:5, Story 9:16; als JPG oder PNG.
   Die Standbilder lassen sich auch ohne Gestaltung speichern.

Ohne eigene Texte schlägt die App einen Titel nach der Stimmung der Farben vor (z. B. „Goldene Stunde“, „Blaue Stunde“) und nutzt
den Dateinamen, wenn er lesbar ist. Als Claude-Artifact geöffnet, kann zusätzlich Claude Titel, Untertitel und Zeile vorschlagen.

## Aufbau

- `www/js/analyze.js` – Videoanalyse: Abtasten per `<video>` + Canvas, Bildmerkmale, Szenen, Auswahl, Paletten (k-means), Bildschwerpunkt
- `www/js/posters.js` – die zwölf Vorlagen; zeichnen auf ein Canvas beliebiger Größe (Vorschau und Druck aus demselben Code)
- `www/js/app.js` – Oberfläche, Editor, Speichern (Browser-Download, Claude-Artifact oder Android-Galerie)
- `www/js/zip.js` – kleiner ZIP-Packer für „Alle herunterladen“
- `www/fonts/` – Anton, Archivo Black, IBM Plex Sans/Mono, Instrument Serif, Shrikhand (SIL Open Font License, siehe `fonts/LICENSE.md`)
- `android/` – WebView-Hülle: Video- und Fotoauswahl, geteilte Dateien, Speichern in der Galerie, Zurück-Taste
- `build.sh` – baut `release/Standbild.apk` ohne Android SDK (gleiche Werkzeuge wie `tools/build.sh`)
- `build-web.js` – baut `release/Standbild.html` für den PC: `node standbild/build-web.js`
- `make_icons.py` – erzeugt die PNG-Launcher-Icons

Welche Videos gehen, hängt vom Browser bzw. der Android-WebView ab: MP4 (H.264) und WebM klappen überall, HEVC/H.265 (iPhone-MOV)
nicht auf jedem Gerät. Bei Fotos gehen JPG, PNG und WebP überall; HEIC vom iPhone nur in Safari.

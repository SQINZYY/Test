# Standbild

Video rein, Poster raus: Standbild schaut sich ein Video an (TikTok, YouTube Shorts oder längere Videos), sucht die stärksten
Momente heraus und gestaltet daraus zwölf druckfertige Poster in verschiedenen Stilen. Alles läuft auf dem Gerät, das Video
wird nirgendwo hochgeladen.

**APK:** [`release/Standbild.apk`](../release/Standbild.apk) (ab Android 7, ca. 250 KB). Installation wie bei SetupBuilder:
APK aufs Handy laden, öffnen, „Unbekannte Apps installieren“ erlauben.
Im Browser läuft die App auch: `standbild/www/index.html` über einen beliebigen Webserver öffnen (z. B. `python3 -m http.server` im Ordner `www`).

## So funktioniert's

1. **Video wählen** – Datei auswählen oder hineinziehen. Auf Android kann man ein Video auch aus der Galerie, TikTok usw.
   per „Teilen“ an Standbild schicken. TikTok- und YouTube-Videos vorher herunterladen (ein Link allein reicht nicht).
2. **Analyse** (ca. 20–30 s für ein kurzes Video):
   - tastet das Video ab (4 Bilder pro Sekunde, höchstens 180 Bilder) und misst Schärfe, Kontrast, Belichtung und Farbigkeit,
   - überspringt schwarze Übergänge und schneidet Kino-Balken (Letterbox) weg,
   - erkennt Schnitte und nimmt aus jeder Szene das beste Bild, möglichst unterschiedlich zueinander,
   - sucht rund um jedes gewählte Bild nach einem noch schärferen Moment,
   - holt bis zu 6 Standbilder in voller Auflösung (plus Zusatzbilder für den Kontaktabzug),
   - bestimmt Farbpaletten und den Bildschwerpunkt, damit beim Zuschneiden ins Hochformat das Motiv drinbleibt.
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
- `android/` – WebView-Hülle: Videoauswahl, geteilte Videos, Speichern in der Galerie, Zurück-Taste
- `build.sh` – baut `release/Standbild.apk` ohne Android SDK (gleiche Werkzeuge wie `tools/build.sh`)
- `make_icons.py` – erzeugt die PNG-Launcher-Icons

Welche Videos gehen, hängt vom Browser bzw. der Android-WebView ab: MP4 (H.264) und WebM klappen überall, HEVC/H.265 (iPhone-MOV)
nicht auf jedem Gerät.

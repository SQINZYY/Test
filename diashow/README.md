# Diashow Studio

Android-App, die aus deinen Fotos **Diashow-Videos (MP4)** macht – mit Übergängen, Zoom-Effekten, Farb-Looks,
Titeln und eigener Musik. Dazu gibt es **Collagen**, einen **Foto-Editor** und **animierte GIFs**.
Alles läuft auf dem Handy, ohne Internet und ohne Konto.

**APK:** [`release/DiashowStudio.apk`](../release/DiashowStudio.apk) (ab Android 7, ca. 250 KB)

## Installieren

1. `release/DiashowStudio.apk` aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## Funktionen

- **Diashow:** „Neue Diashow“ → Bilder auswählen (Android-Fotoauswahl, auch HEIC und sehr große Fotos) → die App baut
  sofort eine fertige Diashow und spielt sie ab. Bilder lassen sich auch aus der Galerie per **Teilen → Diashow Studio**
  schicken.
  - **Stile** mit einem Fingertipp: Klassisch, Modern, Romantisch, Kino, Retro, Party, Schwarz-Weiß, Minimal
  - **Übergänge:** Überblenden, über Schwarz, Blitz, Schieben, Nach oben, Zoom, Wischen, Kreis, Jalousie, Unschärfe,
    harter Schnitt oder gemischt – für alle Bilder oder pro Bild
  - **Bewegung (Ken-Burns-Effekt):** automatisch passend zum Bild (Hochformat-Fotos werden z. B. senkrecht abgefahren)
    oder pro Bild Zoom rein/raus bzw. Schwenk; **wichtigster Bildbereich** antippen, damit Gesichter im Bild bleiben
  - **Farb-Looks:** Lebendig, Warm, Kühl, Träumerisch, Kino, Verblasst, Nostalgie, Drama, Schwarz-Weiß, Noir;
    dazu Vignette, Filmkorn, Kino-Balken
  - **Text:** Titel + Untertitel am Anfang, Text am Ende, Bildtext pro Foto; 5 Schriften, Schatten/Kasten/Kontur, Farben
  - **Musik:** eigenes Lied vom Handy (MP3, M4A, OGG, WAV …), Lautstärke, Startpunkt, Ausblenden am Ende,
    „Diashow an Musiklänge anpassen“
  - **Format:** 16:9 (YouTube/TV), 9:16 (Story, Reels, TikTok, Status), 1:1, 4:5; Bilder füllen oder ganz zeigen
    (mit unscharfem, schwarzem oder weißem Hintergrund); Full HD oder 720p
  - Reihenfolge: Bild lange drücken und ziehen, Pfeile, nach Aufnahmedatum, umkehren, mischen
  - **Export:** MP4 (H.264, 30 Bilder/s, AAC-Ton) über den Hardware-Encoder des Handys, schneller als Echtzeit.
    Das Video landet in der Galerie (Album „Diashow Studio“, Ordner `Movies`) und kann direkt geteilt werden.
  - Diashows werden automatisch gespeichert („Meine Diashows“) und lassen sich umbenennen, kopieren und löschen.
- **Collage:** 2–9 Fotos, 38 Aufteilungen, Abstand, runde Ecken, Hintergrundfarbe oder unscharf, Farb-Look;
  Feld antippen → Bild verschieben, zoomen, tauschen, ersetzen. Speichert als JPEG (2400 px).
- **Foto bearbeiten:** Filter, Helligkeit/Kontrast/Sättigung/Wärme/Vignette, Zuschnitt (1:1, 4:5, 3:4, 16:9, 9:16),
  drehen, spiegeln, Rahmen (weiß, schwarz, Sofortbild) und Text. Mehrere Fotos auf einmal: „Alle so speichern“.
- **GIF:** animiertes Bild aus mehreren Fotos, mit Überblenden und „Hin und zurück“, 320–640 px.

Fotos werden beim Einlesen auf höchstens 2400 px verkleinert (reicht für Full-HD-Videos und Social Media).

## Aufbau

- `app/assets/www/` – Oberfläche (HTML/CSS/JS-Module, ohne Build-Schritt)
  - `js/slideshow.js` – Diashow-Modell, Stile, Zeitleiste und Renderer (Vorschau und Export nutzen denselben Code)
  - `js/draw.js` – Looks, Vignette, Filmkorn, Schriften, Text; `js/export.js` – Video-Export (WebCodecs + mp4-muxer,
    Ersatzweg MediaRecorder); `js/audio.js` – Musik; `js/editor.js` – Diashow-Editor;
    `js/collage.js`, `js/photoedit.js`, `js/gif.js` – weitere Werkzeuge; `js/store.js` – Projekte in IndexedDB;
    `js/native.js` – Verbindung zur Android-Hülle
  - `vendor/` – [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT), [gifenc](https://github.com/mattdesl/gifenc) (MIT)
  - `fonts/` – Playfair Display, Montserrat, Dancing Script, Bebas Neue (SIL Open Font License 1.1)
- `app/java/…/MainActivity.java` – WebView-Hülle: Fotoauswahl, Teilen empfangen, Dateien schreiben, Galerie, Teilen
- `app/java/…/ImageImport.java` – Bilder speichersparend einlesen (EXIF-Drehung, HEIC, große Fotos)
- `app/java/…/AudioMux.java` – Musik als AAC anfügen, falls die WebView selbst kein AAC kodieren kann
- `tools/build.sh` – baut die APK ohne Android SDK (lädt aapt2, dx und die Android-Klassen von Maven Central)

## Tests

```bash
node diashow/tools/test-timeline.mjs                    # Zeitleiste, Übergänge, Stile
node diashow/tools/e2e.js <testordner> <ausgabe>        # ganze Oberfläche im Chromium inkl. Video-Export
node diashow/tools/e2e-native.js <testordner> <ausgabe> # Android-Brücke (nachgebaut): Import, Speichern, nativer Ton
```

Der Testordner braucht `img1.jpg` … `img6.jpg` und `music.mp3`. Die erzeugten Videos lassen sich mit `ffprobe` prüfen.

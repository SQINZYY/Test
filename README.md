# Meine Apps

Jedes Projekt hat seinen eigenen Ordner mit Quellcode, Anleitung (`README.md`) und fertiger App im Unterordner `release/`.

| Projekt | Worum es geht | Download |
|---|---|---|
| [**Arbeitszeit**](arbeitszeit/) | Arbeitszeiten planen und tatsächliche Zeiten erfassen, 30 min Pause automatisch, 39-Stunden-Woche, Überstundenkonto | [Arbeitszeit.apk](arbeitszeit/release/Arbeitszeit.apk) |
| [**ClipSaver**](clipsaver/) | Videos (bis 4K) und Bilder von TikTok, YouTube, Instagram, X und über 2000 weiteren Seiten speichern, auch Werbung | [ClipSaver.apk](clipsaver/release/ClipSaver.apk) · [32-Bit](clipsaver/release/ClipSaver-32bit.apk) |
| [**Dark Fantasy Generator**](darkfantasy/) | Fantasy-Charaktere mit Namen, Klassen, Fähigkeiten, Seltenheiten und Lore – mit Editor und Arena-Spiel | [DarkFantasyGenerator.apk](darkfantasy/release/DarkFantasyGenerator.apk) |
| [**DarkOS**](darkos/) | Futuristischer Handy-Launcher mit schwarzem Design, Neon-Akzenten, Widgets und eigenen Icons | [DarkOS.apk](darkos/release/DarkOS.apk) |
| [**Diashow Studio**](diashow/) | Aus Fotos Diashow-Videos (MP4) mit Musik, Collagen, Foto-Editor und GIFs machen | [DiashowStudio.apk](diashow/release/DiashowStudio.apk) |
| [**Klangraum**](klangraum/) | Musik-App im Spotify-Stil für Windows und Android: eigene Spotify-Playlists und Lieblingssongs | [Klangraum.apk](klangraum/release/Klangraum.apk) |
| [**Klangwelt**](klangwelt/) | Musik-App im Spotify-Stil mit 81.000 Songs (Spotify Tracks Dataset), Mixe, Radio, Playlists, optional Spotify-Konto | [Klangwelt.apk](klangwelt/release/Klangwelt.apk) |
| [**SetupBuilder**](setupbuilder/) | Gaming-PCs und Setups planen: passende Teile, Vergleiche, Budget, Import von Geizhals-Listen, eigenen PC erkennen | [SetupBuilder.apk](setupbuilder/release/SetupBuilder.apk) |
| [**Standbild**](standbild/) | Aus Videos oder Fotos druckfertige Poster in zwölf Stilen machen | [Standbild.apk](standbild/release/Standbild.apk) · [PC-Version](standbild/release/Standbild.html) |
| [**Unterwegs**](unterwegs/) | Routenplaner mit frei kombinierbaren Verkehrsmitteln (zu Fuß, Rad, Auto, Bus, Bahn, Zug), Favoriten, Losgeh-Erinnerung | [Unterwegs.apk](unterwegs/release/Unterwegs.apk) |
| [**Weckton**](weckton/) | Eigene MP3 als Klingelton für alle oder ausgewählte Wecker der Samsung-Uhr | [Weckton.apk](weckton/release/Weckton.apk) |

Die Windows-Versionen von Klangraum und Klangwelt sind zu groß fürs Repo; wie man sie baut, steht in der jeweiligen Anleitung.

## App installieren (Android)

1. Die `.apk` aus der Tabelle aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## Gemeinsame Werkzeuge

[`tools/`](tools/) enthält, was alle Apps zum Bauen brauchen: `sign_apk.py` (APK packen und signieren) und den
Debug-Schlüssel `debug-signing.p12` (Passwort `android`), damit Updates sich über die alte Version installieren lassen.
Die Build-Werkzeuge (aapt2, dx, Android-Klassen) landen beim ersten Bauen in `.build-tools/` und werden von allen Apps geteilt.

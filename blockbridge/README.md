# BlockBridge

Wandelt Minecraft-Inhalte zwischen **Java Edition** (PC/Mac) und **Bedrock Edition** (Handy/früher Pocket Edition,
Windows, Xbox, PlayStation, Switch) um – als App für Windows (`.exe`) und Android (`.apk`).
Datei hochladen, Ziel-Edition wählen, umwandeln, fertig. Alles läuft auf dem eigenen Gerät, nichts wird hochgeladen.

**Downloads:** [`release/BlockBridge.exe`](../release/BlockBridge.exe) (Windows 10/11, 64 Bit, ca. 7 MB, keine Installation)
· [`release/BlockBridge.apk`](../release/BlockBridge.apk) (ab Android 7, ca. 0,3 MB)

## Was lässt sich umwandeln?

| Datei | → Bedrock | → Java |
| --- | --- | --- |
| Java-Ressourcenpaket (`.zip`) | ✔ Texturen, Animationen, Rüstung, Sounds, Schrift → `.mcpack` | ✔ andere Java-Version (1.8 bis 1.21.10 oder eigene `pack_format`-Nummer) |
| Bedrock-Ressourcenpaket (`.mcpack`) | – | ✔ Texturen (auch `.tga`), Flipbook-Animationen, Rüstung, Sounds → `.zip` |
| Java-Mod (`.jar`: Forge, NeoForge, Fabric, Quilt) | ◐ Items, Blöcke, Pflanzen, Namen (alle Sprachen), Rezepte → `.mcaddon` | – |
| Java-Datenpaket (`.zip`) | ◐ Funktionen (Befehle werden übersetzt), Rezepte, Tick-Funktionen → `.mcpack` | ✔ andere Java-Version (Ordnernamen, Rezept-Format) |
| Bedrock-Add-on / Verhaltenspaket | – | ◐ Texturen, Funktionen, Rezepte → Ressourcen- + Datenpaket |
| Skins (`.png`, auch mehrere) / Bedrock-Skinpaket | ✔ Skinpaket (Steve/Alex wird erkannt) | ✔ PNG 64×64 (alte 64×32-Skins werden erweitert) |

◐ = teilweise. Nach jeder Umwandlung zeigt BlockBridge eine Liste, was übernommen, angepasst oder weggelassen wurde.

**Was nicht geht – und warum:** Mods bestehen größtenteils aus Java-Programmcode. Maschinen, Kreaturen, neue Dimensionen,
Effekte oder Weltgenerierung lassen sich nicht automatisch in Bedrock-Add-ons übersetzen; übernommen wird alles, was als
Daten in der Mod steckt (Texturen, Modelle, Namen, Rezepte). Server-Plugins (Bukkit/Spigot/Paper) laufen nur auf Java-Servern.
Für **Welten** gibt es das kostenlose Programm „Chunker“ (chunker.app).

### Einzelheiten

- **Texturen:** Rund 98 % der Java-Blocktexturen haben eine Zuordnung zu ihrem Bedrock-Namen (z. B. `oak_planks` → `planks_oak`,
  `zombie_spawn_egg` → `spawn_eggs/spawn_egg_zombie`), geprüft gegen die Vanilla-Namenslisten beider Editionen
  (`src/core/data/textures.js`, erzeugt mit `node tools/gen-texture-lists.mjs`). Bedrock-Zusatzbilder entstehen automatisch:
  eingefärbte Inventar-Bilder für Gras/Laub (`*_carried`) und undurchsichtiges Laub (`*_opaque`).
  Animierte Texturen bleiben animiert, wenn Bedrock sie auch animiert; sonst wird das erste Bild genommen.
- **Mods → Add-on:** Items (mit Symbol, Name, Stapelgröße, Werkzeuge in der Hand), Blöcke als ganze Würfel mit den richtigen
  Seiten (z. B. Stämme oben/unten anders), Pflanzen (Kreuz-Form), durchsichtige Blöcke (Glas), Rezepte (Werkbank, Ofen,
  Schmelzofen, Räucherofen, Lagerfeuer, Steinsäge, Schmiedetisch). Tags aus Mods wie `#c:ingots/iron` werden in Vanilla-Items übersetzt.
  Treppen, Stufen und eigene 3D-Modelle werden als ganzer Block übernommen.
- **Befehle:** z. B. `effect give @a[distance=..5] minecraft:speed` → `effect @a[r=5] speed`, `tellraw`-Texte → `rawtext`,
  `execute … in minecraft:the_nether` → `execute … in nether`. Befehle ohne Gegenstück (NBT-Daten, Teams, Bossleisten …)
  werden mit `# [BlockBridge] Nicht umgewandelt (Grund)` auskommentiert, damit Bedrock die Funktion trotzdem lädt.

## Installieren

**Windows:** `BlockBridge.exe` herunterladen und starten. Windows zeigt beim ersten Start eventuell „Der Computer wurde durch
Windows geschützt“, weil die Datei nicht signiert ist → „Weitere Informationen“ → „Trotzdem ausführen“. BlockBridge nutzt die
in Windows 10/11 eingebaute „Edge WebView2“; fehlt sie ausnahmsweise, öffnet die App die Download-Seite von Microsoft.
Dateien lassen sich auch direkt auf die EXE ziehen. „In Minecraft öffnen“ übergibt `.mcpack`/`.mcaddon` an Minecraft Bedrock.

**Android:** `BlockBridge.apk` aufs Handy laden und öffnen; wenn Android fragt, „Unbekannte Apps installieren“ erlauben.
Dateien kann man in der App auswählen oder aus dem Dateimanager/Browser an BlockBridge teilen. „In Minecraft öffnen“
übergibt das fertige Paket direkt an Minecraft, „Speichern“ öffnet den Speichern-Dialog, „Teilen“ schickt die Datei an andere Apps.

## Aufbau

- `src/core/` – der Umwandlungs-Kern (reines JavaScript, läuft in der App und in Node):
  `index.js` (Erkennen + Umwandeln), `convert/resourcepack.js`, `convert/mod.js`, `convert/skins.js`, `convert/datapack.js`,
  `convert/recipes.js`, `convert/commands.js`, `mappings.js` (Namens-Tabellen), `image.js` (PNG/TGA ohne Canvas), `zip.js`
- `src/ui/` + `src/index.html`, `src/styles.css` – die Oberfläche; die Umwandlung läuft in einem Web Worker
- `windows/main.go` – Windows-App: Fenster mit Edge-WebView2 (über [go-webview2](https://github.com/jchv/go-webview2)),
  Speichern-Dialog, „In Minecraft öffnen“, Dateien per „Öffnen mit“
- `android/` – Android-App: WebView-Hülle (`MainActivity.java`), `FilesProvider.java` gibt fertige Dateien an Minecraft weiter
- `test/core.test.mjs` – Tests mit selbst erzeugten Paketen, Mods, Skins und Datenpaketen

## Bauen

```bash
npm install
npm test             # Tests
npm run build:win    # release/BlockBridge.exe  (braucht Go 1.22+, geht auch unter Linux/macOS)
npm run build:apk    # release/BlockBridge.apk  (braucht Java 17+, Python 3 mit "cryptography"; kein Android SDK nötig)
```

Die APK wird wie die SetupBuilder-APK gebaut (`../tools/sign_apk.py`, Debug-Schlüssel `../tools/debug-signing.p12`).

BlockBridge ist kein offizielles Minecraft-Produkt und nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.

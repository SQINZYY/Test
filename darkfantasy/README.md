# Dark Fantasy Generator

Android-App, die Fantasy-Charaktere mit zufälligen Namen, Klassen, Fähigkeiten, Seltenheiten und Lore erschafft – komplett offline,
ohne Berechtigungen.

**APK:** [`release/DarkFantasyGenerator.apk`](../release/DarkFantasyGenerator.apk) (ab Android 7, ca. 90 KB).
Installieren wie SetupBuilder: APK aufs Handy laden, öffnen, „Unbekannte Apps installieren“ erlauben.

## Funktionen

- **4 Stile:** High Fantasy, Dark Fantasy, Mythische Kreaturen, Mittelalter – jeweils mit eigenen Namen, Völkern, Klassen, Orten,
  Feinden, Artefakten, Waffen und Zitaten. **Chaos-Modus** mischt alle Welten.
- **Seltenheiten:** Gewöhnlich (46 %), Selten (28 %), Episch (16 %), Legendär (8 %), Mythisch (2 %). Höhere Seltenheit = mehr
  Attributpunkte, höhere Stufe, mehr Fähigkeiten, ab Episch eine **Ultimative Fähigkeit**, bei Mythisch eine **Mythische Gabe**.
- **Charakterkarte:** Siegel-Porträt (Runenkreis in Seltenheitsfarbe, Symbol der Klasse), Name + Beiname, Volk, Klasse, Stufe,
  Gesinnung, Macht, 6 Attribute, Waffe, Fähigkeiten, Lore (Herkunft, Wendepunkt, Ziel, Geheimnis) und Zitat.
- **Geschlecht** wählbar (zufällig/männlich/weiblich) – Klassen, Völker und Lore werden passend gebeugt.
- **Neu würfeln** von Name, Fähigkeiten oder Lore einzeln.
- **Sammlung** (♡ Speichern, Filter nach Seltenheit) und **Verlauf** der letzten 60 Beschwörungen.
- **Selbst erstellen:** eigener Editor für Name, Beiname, Stil, Geschlecht, Volk, Klasse, Gesinnung, Seltenheit, Stufe, Attribute
  (Punkte-Budget je Seltenheit), Fähigkeiten, Ultimative Fähigkeit, Mythische Gabe, Waffe (auch eigene), Lore und Zitat – mit 🎲 für
  Zufallsvorschläge und Live-Vorschau der Karte. Jede Auswahl zeigt ihre Stufe (Selten/Episch/Legendär/Mythisch); die stärkste Wahl ist mit
  **★ Beste** markiert (z. B. Seltenheit Mythisch, maximale Stufe, „Optimal verteilen“ bei Attributen, legendäre Fähigkeiten und Waffen,
  die Ultimative der eigenen Klasse). Auch jeder beschworene Charakter lässt sich über „✎ Bearbeiten“ anpassen.
- **Teilen** als Text; jeder Charakter hat einen Code (`DF1.…`, selbst erstellte `DFC1.…`), der ihn exakt wiederherstellt – unter Sammlung → „Code einfügen“
  oder per „Teilen“ direkt an die App.

## Aufbau

- `assets/www/data.js` – alle Inhalte, `generator.js` – Generator mit Seeds und Codes, `sigil.js` – Porträt-SVG, `app.js` – Oberfläche
- `java/…/MainActivity.java` – WebView-Hülle: Speicher, Teilen, Zwischenablage, geteilte Codes empfangen
- `build.sh` – baut die APK ohne Android SDK (gleiche Werkzeuge und Signatur wie `tools/build.sh`)
- `test.js` – Tests für den Generator: `node darkfantasy/test.js`
- `make_icons.py` – erzeugt die PNG-Icons

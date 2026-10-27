# Weckton

Android-App, mit der du eine eigene MP3 als Klingelton für **alle oder ausgewählte Wecker** deiner Uhr-App setzt. Weckton liest dafür alle
Wecker aus, die in der Samsung-Uhr gespeichert sind (auch alle 100, wenn das Limit voll ist), und zeigt sie mit Uhrzeit, Tagen, Name und
aktuellem Ton an.

**APK:** [`release/Weckton.apk`](release/Weckton.apk) (ab Android 10, ca. 30 KB, braucht kein Internet).

## Installieren

1. `weckton/release/Weckton.apk` aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## So geht’s

1. **MP3-Datei auswählen** (oder eine MP3 aus dem Dateimanager an Weckton teilen) und mit ▶ probehören.
2. **Wecker auswählen**: einzeln antippen oder „Alle auswählen“. Mit „An“/„Aus“ lässt sich die Liste auf eingeschaltete oder
   ausgeschaltete Wecker eingrenzen, „Alle auswählen“ gilt dann nur für diese.
3. **Übernehmen** – danach einmal auf **„Uhr-App öffnen“** tippen (siehe unten).

Weckton ändert nur den Klingelton. Uhrzeit, Tage, Name und ob ein Wecker an ist, bleiben unverändert. Vor der ersten Änderung merkt sich
die App den alten Ton jedes Weckers; **„Alte Töne wiederherstellen“** setzt alles zurück.

## Gut zu wissen

- **Nur mit der Samsung-Uhr.** Die Samsung-Uhr gibt ihre Wecker über eine Schnittstelle frei, die jede App mit den Berechtigungen
  `READ_ALARM`/`WRITE_ALARM` nutzen darf. Andere Uhr-Apps (z. B. die Google Uhr) haben so etwas nicht – dort lassen sich die Wecker von außen
  weder auslesen noch ändern. Weckton bietet dann an, die MP3 als **Standard-Weckton** des Handys zu setzen; außerdem erscheint sie in jeder
  Uhr-App in der Liste der Wecktöne.
- **Die MP3 landet im Ordner `Alarms`** im internen Speicher. Die Uhr-App spielt nur Töne aus der Medienbibliothek ab; die Datei also nicht
  löschen, solange Wecker sie benutzen.
- **Berechtigung „Musik und Audio“ der Uhr-App:** Ohne sie kann die Uhr die MP3 nicht lesen und klingelt mit ihrem Standardton. Weckton
  warnt in diesem Fall und öffnet auf Wunsch die passenden Einstellungen.
- **„Uhr-App öffnen“ nach dem Übernehmen:** Die Uhr-App plant den jeweils nächsten Wecker mit einer Kopie seiner Einstellungen vor. Weckton
  beendet sie deshalb im Hintergrund und öffnet sie neu, damit sie auch diesen Wecker mit dem neuen Ton plant. Ohne diesen Schritt klingelt
  höchstens der nächste Wecker noch einmal mit dem alten Ton.
- Wecker mit ausgeschaltetem Weckton (nur Vibration) bleiben stumm. Wecker mit Bixby-Briefing bekommen den normalen Weckton mit der MP3.
- Die Schnittstelle der Samsung-Uhr ist nicht offiziell dokumentiert. Geprüft wurde der Aufbau anhand der Samsung-Uhr 10; spätere Versionen
  können ihn ändern. Meldet Weckton „Die Uhr-App verweigert den Zugriff“, hilft meist eine Neuinstallation von Weckton.

## Aufbau

- `app/assets/www/` – Oberfläche (HTML/CSS/JS): `alarms.js` (Uhrzeit, Wochentage und Ton aus den Rohdaten der Samsung-Uhr),
  `app.js` (Bedienung)
- `app/java/…/ClockAlarms.java` – Wecker der Samsung-Uhr lesen, Klingelton setzen, alte Töne sichern und wiederherstellen
- `app/java/…/Sounds.java` – MP3 in den Ordner `Alarms` der Medienbibliothek übernehmen, Standard-Weckton setzen
- `app/java/…/MainActivity.java` – WebView-Hülle mit Dateiauswahl, Probehören und Brücke zur Oberfläche
- `tools/test-alarms.js` – Tests für die Auswertung der Wecker: `node weckton/tools/test-alarms.js`
- `tools/ui-preview.js` – zeigt die Oberfläche im Browser mit 100 Beispiel-Weckern und speichert Screenshots (Playwright)

## Selbst bauen

```sh
pip install cryptography
./weckton/tools/build.sh                         # -> weckton/release/Weckton.apk
VERSION_CODE=2 VERSION_NAME=1.1 ./weckton/tools/build.sh
```

Nutzt dieselben Werkzeuge und denselben Debug-Schlüssel wie SetupBuilder (`tools/sign_apk.py`, `tools/debug-signing.p12`).

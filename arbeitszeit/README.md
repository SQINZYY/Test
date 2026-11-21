# Arbeitszeit

Android-App zum Planen und Erfassen der Arbeitszeit: Plan-Zeiten eintragen, die tatsächlichen Zeiten
(z. B. „schon um 6:57 statt 7:00 da“) festhalten und sehen, wie lange man am Tag da war bzw. da sein will.
Die **Mittagspause (30 min) wird automatisch abgezogen**, das **Wochensoll ist 39 Stunden** (beides einstellbar).

**APK:** [`release/Arbeitszeit.apk`](release/Arbeitszeit.apk) (ab Android 7, ca. 70 KB, braucht kein Internet und keine Berechtigungen).

## Installieren

1. `release/Arbeitszeit.apk` aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## Reiter

- **Plan** – pro Tag Beginn und Ende der geplanten Arbeitszeit. Die App zeigt sofort Anwesenheit, Arbeitszeit
  (nach Abzug der Pause) und die Abweichung zum Tagessoll (39 h / 5 Tage = 7:48 h). Ist nur der Beginn eingetragen,
  schlägt sie das passende Ende vor (7:00 → 15:18). **„Woche ausfüllen“** verteilt das Wochensoll auf die gewählten
  Tage, **„Wie Vorwoche“** übernimmt den Plan der letzten Woche.
- **Ist-Zeit** – die wirklichen Zeiten. Oben „Heute“ mit **Kommen/Gehen-Knopf** (trägt die aktuelle Uhrzeit ein),
  bisheriger Arbeitszeit und wann Tagessoll bzw. Wochensoll erreicht sind. Bei jedem Tag steht der Plan dabei
  und wie viele Minuten man früher/später gekommen oder gegangen ist; „Wie geplant eintragen“ übernimmt die Planzeiten.
- **Übersicht** – Soll, geplant, gearbeitet und noch offen für die Woche, Balken pro Tag, **Überstundenkonto**
  über alle erfassten Tage und die letzten Wochen. „Woche teilen“ schickt eine Aufstellung als Text (WhatsApp, Mail …).
- **Rechner** – „Wie lange war ich da?“ (von–bis), „Wann habe ich Feierabend?“ und „Wann muss ich anfangen?“.

Jeder Tag kann auf **Urlaub, Krank oder Feiertag** gestellt werden (das Tagessoll wird angerechnet) oder auf
**Gleittag** (Überstundenabbau, das Tagessoll geht vom Konto ab). Samstag und Sonntag sind frei, lassen sich aber
bei Bedarf eintragen.

**Einstellungen** (Symbol oben rechts): Wochenstunden, Arbeitstage, Pausenlänge, Pause „immer“ oder „erst ab 6 h
Anwesenheit“, Startwert fürs Überstundenkonto, helles/dunkles Design, Backup teilen/einfügen, alles löschen.

Alle Daten bleiben auf dem Handy. Updates der APK (gleiche Signatur) behalten die Daten.

## Aufbau

- `app/assets/www/calc.js` – Rechenlogik (Pause, Tages-/Wochensoll, Überstundenkonto, Woche ausfüllen)
- `app/assets/www/app.js`, `index.html`, `styles.css` – Oberfläche
- `app/java/…/MainActivity.java` – WebView-Hülle: Speicher (SharedPreferences), Teilen, Zwischenablage, Hell/Dunkel
- `tools/test-calc.js` – Tests der Rechenlogik: `node arbeitszeit/tools/test-calc.js`
- `tools/build.sh` – baut die APK ohne Android SDK (nutzt `tools/sign_apk.py` und die Werkzeuge des Repos)
- `tools/make_icons.py` – erzeugt die PNG-Icons

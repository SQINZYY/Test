# Unterwegs – Routenplaner

Android-App, die eine Route von einer Adresse zu einer anderen berechnet – mit genau den Verkehrsmitteln, die du auswählst:
**zu Fuß, Fahrrad, Auto, Bus, Bahn (S-/U-Bahn, Tram) und Zug (Regional- und Fernverkehr)**, auch kombiniert.

**APK:** [`release/Unterwegs.apk`](../release/Unterwegs.apk) – Version 1.1 (ab Android 7, ca. 150 KB, braucht Internet).

## Installieren

1. `release/Unterwegs.apk` aufs Handy laden und öffnen.
2. Wenn Android fragt: „Unbekannte Apps installieren“ für den Browser bzw. Dateimanager erlauben.
3. Play Protect warnt eventuell, weil die App nicht aus dem Play Store kommt – „Trotzdem installieren“.

## So funktioniert's

1. **Start und Ziel** eingeben: Adresse, Haltestelle oder Ort. Beim Tippen erscheinen Vorschläge.
   Das Fadenkreuz setzt **„Mein Standort“** per GPS als Start.
2. **Verkehrsmittel antippen** (beliebig viele):
   - nur *Zu Fuß*, *Fahrrad* oder *Auto* → direkte Route mit Dauer und Strecke (zu Fuß auch mit **Schrittzahl**),
     bei mehreren bekommst du jede Variante zum Vergleich.
   - *Bus*, *Bahn* und/oder *Zug* → Verbindungen aus dem Fahrplan, nur mit den gewählten Linienarten.
   - kombiniert, z. B. **Zu Fuß + Bahn**: Die App sucht die Bahn passend zu deiner Uhrzeit und zeigt
     - **wann die Bahn fährt** (mit Gleis, Richtung und – wo verfügbar – Echtzeit-Verspätung),
     - **wann du losgehen musst** und einen Countdown („in 12 Min.“),
     - **wie lange und wie viele Schritte** es bis zur Haltestelle sind (z. B. „11 Min. · 950 m · ca. 1.250 Schritte“).
     Ist die Bahn verspätet, verschiebt sich die Losgeh-Zeit entsprechend.
   - *Fahrrad + Zug*: mit dem Rad zur Haltestelle; ohne *Zu Fuß* werden nur Verbindungen gesucht, in denen das Rad mitfahren darf.
   - *Auto + Bahn/Zug*: mit dem Auto zum Park+Ride, dann weiter mit Bus & Bahn.
3. **Wann?** – zwei Angaben, einzeln oder zusammen:
   - **Losgehen:** *Jetzt*, *Ab …* (ich kann frühestens um … los) oder *Um …* (ich will um … los)
   - **Da sein:** *Egal*, *Spätestens* (ich muss bis … da sein) oder *Gegen …* (ich will gegen … da sein)

   Beispiele: „Ab jetzt los, spätestens 9:00 da“, „Ab 8:00 los, spätestens 9:00 da“, „Gegen 18:30 da sein“.
   Ein Satz unter der Auswahl erklärt, was die App daraus macht.
4. **Route berechnen.** Ganz oben steht die Antwort, z. B. **„Spätestens losgehen um 08:31 – mit RE 5, an 08:54,
   6 Min. vor 09:00“**. Die passendste Verbindung ist als *Beste Wahl* markiert, unpassende zeigen z. B. *8 Min. zu spät*.
   Schafft nichts die Frist, sucht die App automatisch ab dem frühesten Losgehen und sagt, wann du **frühestens** da wärst.
   Frühere/spätere Verbindungen lassen sich nachladen; ein Tipp öffnet die Detailansicht mit **Karte**, Zeitleiste,
   Umstiegszeiten, Zwischenhalten, Störungsmeldungen und Wegbeschreibung. Mit „Teilen“ geht die Route als Text an WhatsApp & Co.
5. **Google Maps:** In den Details startet **„Zur Haltestelle navigieren“** bzw. **„Navigation starten“** die
   Navigation direkt in der Google-Maps-App; „In Google Maps“ zeigt die ganze Strecke dort an (auch mit aktuellem
   Verkehr fürs Auto). Jeder Fußweg in der Zeitleiste hat „Mit Google Maps navigieren“, und unter den Ergebnissen gibt es
   „Auch in Google Maps ansehen“. Ohne Google-Maps-App öffnet sich Google Maps im Browser. Google Maps startet immer mit
   „jetzt“ – bei einer anderen Uhrzeit diese dort anpassen.

**Einstellungen** (Regler-Symbol oben rechts): Gehtempo, Schrittlänge (für die Schrittzahl), Puffer an der Haltestelle
(so viel früher zeigt die App die Losgeh-Zeit), längster Fußweg zur Haltestelle, maximale Umstiege, stufenfreie Wege.

## Datenquellen

| Wofür | Dienst | Ausweichlösung |
|---|---|---|
| Bus, Bahn, Zug inkl. Echtzeit | [Transitous](https://transitous.org) (MOTIS, offene Fahrplandaten, u. a. ganz Deutschland) | ältere API-Versionen; Park+Ride → Auto → Fußweg |
| Zu Fuß, Fahrrad, Auto | [Valhalla](https://valhalla.openstreetmap.de) der FOSSGIS (deutsche Wegbeschreibung) | [OSRM](https://routing.openstreetmap.de) der FOSSGIS |
| Adresssuche | Transitous | [Photon](https://photon.komoot.io), [Nominatim](https://nominatim.openstreetmap.org) |
| Karte | © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2) | – |
| Navigation, Verkehr | Google-Maps-App über offizielle [Maps-URLs](https://developers.google.com/maps/documentation/urls/get-started) und `google.navigation:` (kein API-Schlüssel nötig) | Google Maps im Browser |

Warum Google Maps nicht direkt *in* der App rechnet: Dafür bräuchte man einen kostenpflichtigen Google-API-Schlüssel, und
Googles Nutzungsbedingungen verbieten, deren Routen auf einer anderen Karte (hier OpenStreetMap) anzuzeigen. Die Übergabe
an die Google-Maps-App ist kostenlos und erlaubt.

Die Dienste sind kostenlose Gemeinschaftsprojekte ohne Gewähr. Autofahrzeiten berücksichtigen keinen aktuellen Verkehr,
Schrittzahlen sind aus der Strecke und deiner Schrittlänge geschätzt. Start, Ziel und Uhrzeit werden für die Berechnung an diese
Dienste geschickt; der Standort wird nur abgefragt, wenn du „Mein Standort“ antippst. Zuletzt gesuchte Orte bleiben nur auf dem Handy.

## Aufbau

- `app/assets/www/` – die Oberfläche (HTML/CSS/JS):
  - `js/core.js` – Logik ohne Oberfläche: Abfragen bauen, Antworten von MOTIS/Valhalla/OSRM auswerten, Losgeh-Zeit,
    Schritte, Umstiege, deutsche Wegbeschreibung, Formatierung
  - `js/api.js` – Anfragen mit Ausweichlösungen; in der App über Java, im Browser über `fetch`
  - `js/app.js` – Planen → Verbindungen → Details, Einstellungen, „Zuletzt gesucht“
  - `js/map.js` – Karte (Leaflet), `js/icons.js` – Symbole (Material Icons, Apache-2.0)
- `app/java/de/unterwegs/app/MainActivity.java` – WebView-Hülle: Internet-Anfragen (nur an die oben genannten Dienste,
  mit eigenem User-Agent), Standortfreigabe, Google Maps öffnen, Teilen, Links im Browser öffnen, Zurück-Taste
- `tools/build.sh` – baut die APK ohne Android SDK (nutzt `tools/sign_apk.py` und den Schlüssel von SetupBuilder)
- `tools/make_icons.py` – App-Icons
- `tools/test.js` – Tests für Logik und Ausweichlösungen: `node unterwegs/tools/test.js`
- `tools/ui-test.js` + `tools/fixtures.js` – Oberflächentest in Chromium mit nachgebauten Antworten der Dienste
  (hell und dunkel, mit Screenshots): `node unterwegs/tools/ui-test.js`

## Bauen

```sh
unterwegs/tools/build.sh          # → release/Unterwegs.apk
node unterwegs/tools/test.js
node unterwegs/tools/ui-test.js   # braucht Playwright + Chromium
```

Die Oberfläche läuft auch im Browser: `app/assets/www/` mit einem beliebigen Webserver ausliefern und `index.html` öffnen.

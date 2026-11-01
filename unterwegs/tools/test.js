/*
 * Tests für die Logik von Unterwegs: node unterwegs/tools/test.js
 * Prüft core.js direkt und api.js mit einem nachgebauten fetch (Ausweich-Logik).
 */
'use strict';
const assert = require('assert');
const path = require('path');
const core = require('../app/assets/www/js/core.js');
const fx = require('./fixtures.js');

let failed = 0, passed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

// ------------------------------------------------------------ Formatierung

test('Zahlen, Zeiten, Dauer, Strecke', () => {
  assert.strictEqual(core.fmtNumber(4800), '4.800');
  assert.strictEqual(core.fmtNumber(1234567), '1.234.567');
  assert.strictEqual(core.fmtTime(new Date(2026, 10, 1, 9, 5)), '09:05');
  assert.strictEqual(core.fmtDuration(20), '< 1 Min.');
  assert.strictEqual(core.fmtDuration(8 * 60), '8 Min.');
  assert.strictEqual(core.fmtDuration(65 * 60), '1 Std. 5 Min.');
  assert.strictEqual(core.fmtDuration(120 * 60), '2 Std.');
  assert.strictEqual(core.fmtDurationShort(65 * 60), '1:05');
  assert.strictEqual(core.fmtDistance(37), '40 m');
  assert.strictEqual(core.fmtDistance(640), '650 m');
  assert.strictEqual(core.fmtDistance(3420), '3,4 km');
  assert.strictEqual(core.fmtDistance(27800), '28 km');
});

test('Tag und Countdown', () => {
  const now = new Date(2026, 10, 1, 14, 0);
  assert.strictEqual(core.fmtDay(new Date(2026, 10, 1, 20, 0), now), 'heute');
  assert.strictEqual(core.fmtDay(new Date(2026, 10, 2, 8, 0), now), 'morgen');
  assert.strictEqual(core.fmtDay(new Date(2026, 10, 4, 8, 0), now), 'Mi., 4.11.');
  assert.strictEqual(core.fmtCountdown(new Date(2026, 10, 1, 14, 12), now), 'in 12 Min.');
  assert.strictEqual(core.fmtCountdown(new Date(2026, 10, 1, 13, 57), now), 'vor 3 Min.');
  assert.strictEqual(core.fmtCountdown(now, now), 'jetzt');
});

test('Schritte', () => {
  assert.strictEqual(core.stepsFor(600, 75), 800);
  assert.strictEqual(core.stepsFor(940, 75), 1250);
  assert.strictEqual(core.stepsFor(27800, 75), 37100);
  assert.strictEqual(core.stepsFor(20, 75), 30);
  assert.strictEqual(core.stepsFor(0, 75), 0);
  assert.strictEqual(core.fmtSteps(1250), 'ca. 1.250 Schritte');
});

// ------------------------------------------------------------ Geometrie

test('Polyline: bekanntes Google-Beispiel (Genauigkeit 5)', () => {
  const pts = core.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  assert.deepStrictEqual(pts.map(p => p.map(v => Math.round(v * 1e5) / 1e5)), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('Polyline: Hin und zurück mit Genauigkeit 6 und 7 (auch große Längengrade)', () => {
  const pts = [[50.9510, 6.9571], [-33.8688, 151.2093], [64.1466, -21.9426], [0, 179.9999]];
  [6, 7].forEach(p => {
    const back = core.decodePolyline(core.encodePolyline(pts, p), p);
    back.forEach((b, i) => {
      assert.ok(Math.abs(b[0] - pts[i][0]) < 1e-6 && Math.abs(b[1] - pts[i][1]) < 1e-6, 'Punkt ' + i + ' bei Genauigkeit ' + p);
    });
  });
});

test('Entfernung', () => {
  const d = core.haversine(fx.P.start, fx.P.hbf);
  assert.ok(d > 850 && d < 950, String(d));
});

// ------------------------------------------------------------ Abfrage

const from = { name: 'Ebertplatz 2', lat: fx.P.start[0], lon: fx.P.start[1], kind: 'address' };
const to = { name: 'Poppelsdorfer Allee 49', lat: fx.P.ziel[0], lon: fx.P.ziel[1], kind: 'address' };

function params(url) {
  const u = new URL(url);
  const o = {};
  u.searchParams.forEach((v, k) => { o[k] = v; });
  o._path = u.pathname;
  return o;
}

test('Verkehrsmittel: Bus/Bahn/Zug → MOTIS-Modi (S-Bahn je nach API-Version)', () => {
  assert.deepStrictEqual(core.transitModesFor({ bus: true }, 6), ['BUS', 'COACH']);
  assert.deepStrictEqual(core.transitModesFor({ bahn: true }, 6), ['TRAM', 'SUBWAY', 'SUBURBAN', 'FUNICULAR']);
  assert.deepStrictEqual(core.transitModesFor({ bahn: true }, 4), ['TRAM', 'SUBWAY', 'METRO', 'FUNICULAR']);
  assert.deepStrictEqual(core.transitModesFor({ zug: true }, 6), ['REGIONAL_RAIL', 'LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL']);
  assert.ok(core.transitModesFor({ bus: true, bahn: true, zug: true }, 6).indexOf('FERRY') >= 0);
});

test('Weg zur Haltestelle je nach Auswahl', () => {
  assert.deepStrictEqual(core.accessModesFor({ bus: true }), { pre: ['WALK'], post: ['WALK'], requireBikeTransport: false });
  assert.deepStrictEqual(core.accessModesFor({ walk: true, zug: true }), { pre: ['WALK'], post: ['WALK'], requireBikeTransport: false });
  assert.deepStrictEqual(core.accessModesFor({ bike: true, zug: true }), { pre: ['BIKE'], post: ['BIKE'], requireBikeTransport: true });
  assert.deepStrictEqual(core.accessModesFor({ walk: true, bike: true, zug: true }), { pre: ['WALK', 'BIKE'], post: ['WALK'], requireBikeTransport: false });
  assert.deepStrictEqual(core.accessModesFor({ car: true, zug: true }), { pre: ['CAR_PARKING'], post: ['WALK'], requireBikeTransport: false });
  assert.deepStrictEqual(core.accessModesFor({ car: true, zug: true }, 1).pre, ['CAR']);
  assert.deepStrictEqual(core.accessModesFor({ car: true, bike: true, zug: true }, 2), { pre: ['WALK'], post: ['WALK'], requireBikeTransport: false });
});

test('Plan-URL enthält alle Angaben', () => {
  const time = new Date(Date.UTC(2026, 10, 1, 13, 20));
  const url = core.motisPlanUrl('https://api.transitous.org', {
    from, to, time, arriveBy: false, sel: { walk: true, bahn: true, zug: true },
    settings: { pace: 'fast', maxWalkMin: 20, maxTransfers: 1, wheelchair: true }
  }, { version: 6 });
  const p = params(url);
  assert.strictEqual(p._path, '/api/v6/plan');
  assert.strictEqual(p.fromPlace, '50.951050,6.957120');
  assert.strictEqual(p.toPlace, '50.727440,7.094530');
  assert.strictEqual(p.time, '2026-11-01T13:20:00.000Z');
  assert.strictEqual(p.arriveBy, 'false');
  assert.strictEqual(p.transitModes, 'TRAM,SUBWAY,SUBURBAN,FUNICULAR,REGIONAL_RAIL,LONG_DISTANCE,HIGHSPEED_RAIL,NIGHT_RAIL');
  assert.strictEqual(p.preTransitModes, 'WALK');
  assert.strictEqual(p.maxPreTransitTime, '1200');
  assert.strictEqual(p.pedestrianSpeed, '1.6');
  assert.strictEqual(p.pedestrianProfile, 'WHEELCHAIR');
  assert.strictEqual(p.maxTransfers, '1');
  assert.strictEqual(p.language, 'de');
  assert.ok(url.indexOf('transitModes=TRAM,SUBWAY') > 0, 'Listen kommagetrennt (explode: false)');
});

test('Plan-URL: Haltestellen-ID, Ankunft, Blättern, minimale Variante', () => {
  const url = core.motisPlanUrl('https://api.transitous.org/', {
    from: { name: 'Ebertplatz', lat: 1, lon: 2, stopId: 'de:05315:11201' }, to, time: new Date(), arriveBy: true,
    sel: { bus: true }, settings: {}, pageCursor: 'abc|1'
  }, { version: 5, minimal: true });
  const p = params(url);
  assert.strictEqual(p._path, '/api/v5/plan');
  assert.strictEqual(p.fromPlace, 'de:05315:11201');
  assert.strictEqual(p.arriveBy, 'true');
  assert.strictEqual(p.pageCursor, 'abc|1');
  assert.strictEqual(p.maxPreTransitTime, undefined);
  assert.strictEqual(p.language, undefined);
});

test('Valhalla- und OSRM-URLs', () => {
  const v = new URL(core.valhallaUrl(from, to, 'walk', { pace: 'slow' }));
  assert.strictEqual(v.host, 'valhalla1.openstreetmap.de');
  const j = JSON.parse(v.searchParams.get('json'));
  assert.strictEqual(j.costing, 'pedestrian');
  assert.strictEqual(j.directions_options.language, 'de-DE');
  assert.strictEqual(j.costing_options.pedestrian.walking_speed, 4);
  assert.strictEqual(JSON.parse(new URL(core.valhallaUrl(from, to, 'car')).searchParams.get('json')).costing, 'auto');
  const o = core.osrmUrl(from, to, 'bike');
  assert.ok(o.indexOf('https://routing.openstreetmap.de/routed-bike/route/v1/driving/6.957120,50.951050;7.094530,50.727440?') === 0, o);
});

// ------------------------------------------------------------ Orte

test('Geocoding-Ergebnisse von Transitous, Photon, Nominatim', () => {
  const m = fx.makeGeocode('ebert');
  const a = core.placeFromMotis(m[0]);
  assert.strictEqual(a.name, 'Ebertplatz 2');
  assert.strictEqual(a.kind, 'address');
  assert.ok(a.detail.indexOf('50668 Köln') >= 0, a.detail);
  const s = core.placeFromMotis(m[1]);
  assert.strictEqual(s.kind, 'stop');
  assert.strictEqual(s.stopId, 'de:05315:11201');
  const ph = core.placeFromPhoton(fx.makePhoton().features[0]);
  assert.strictEqual(ph.name, 'Poppelsdorfer Allee 49');
  assert.strictEqual(ph.detail, '53115 Bonn, Nordrhein-Westfalen');
  const n = core.placeFromNominatim({ lat: '50.1', lon: '7.2', display_name: 'X', address: { road: 'Hauptstraße', house_number: '5', postcode: '12345', town: 'Musterstadt' } });
  assert.strictEqual(n.name, 'Hauptstraße 5');
  assert.strictEqual(n.detail, '12345 Musterstadt');
  assert.strictEqual(core.parseCoordinates('50,95 6,96').lon, 6.96);
  assert.strictEqual(core.parseCoordinates('50.9510, 6.9571').lat, 50.951);
  assert.strictEqual(core.parseCoordinates('Hauptstraße 5'), null);
});

// ------------------------------------------------------------ Antworten auswerten

const now = new Date();
const plan = core.parseMotisPlan(fx.makePlan(now), { from: 'Ebertplatz 2', to: 'Poppelsdorfer Allee 49' });

test('MOTIS-Antwort: Verbindungen, Linien, Echtzeit, Zwischenhalte', () => {
  assert.strictEqual(plan.itineraries.length, 3);
  assert.strictEqual(plan.nextPageCursor, 'LATER|1');
  const it = plan.itineraries[0];
  assert.strictEqual(it.kind, 'transit');
  assert.strictEqual(it.legs.length, 3);
  const [w, re, w2] = it.legs;
  assert.strictEqual(w.type, 'walk');
  assert.strictEqual(w.from.name, 'Ebertplatz 2', 'START wurde ersetzt');
  assert.strictEqual(w2.to.name, 'Poppelsdorfer Allee 49', 'END wurde ersetzt');
  assert.strictEqual(w.distance, 940);
  assert.ok(w.geometry.length > 3);
  assert.strictEqual(re.type, 'transit');
  assert.strictEqual(re.cat, 'zug');
  assert.strictEqual(re.name, 'RE 5');
  assert.strictEqual(re.headsign, 'Koblenz Hbf');
  assert.strictEqual(re.color, '#9a1b1f');
  assert.strictEqual(re.from.track, '5');
  assert.strictEqual(re.delayStart, 2);
  assert.strictEqual(re.stops.length, 4);
  assert.strictEqual(re.stops[1].name, 'Brühl');
  assert.strictEqual(re.alerts.length, 1);
  const it2 = plan.itineraries[1];
  assert.strictEqual(it2.legs[1].name, 'Tram 16');
  assert.strictEqual(it2.legs[2].name, 'Bus 600');
  assert.strictEqual(it2.legs[2].cat, 'bus');
  assert.strictEqual(it2.transfers, 1);
  assert.strictEqual(plan.itineraries[2].legs[1].from.trackChanged, true);
});

test('Fußweg-Anweisungen aus MOTIS-Schritten', () => {
  const steps = plan.itineraries[0].legs[0].steps;
  assert.deepStrictEqual(steps.map(s => s.text), ['Starte auf Ebertplatz', 'Rechts abbiegen auf Eigelstein', 'Leicht links halten', 'Treppe nehmen']);
  assert.strictEqual(steps[1].distance, Math.round(940 * 0.6) + 30, 'gleiche Straße zusammengefasst');
});

test('Losgehen, Schritte bis zur Haltestelle, Wartezeit', () => {
  const it = plan.itineraries[0];
  const re = it.legs[1];
  const a = core.analyzeRoute(it, { strideCm: 75 });
  assert.strictEqual(a.firstTransit, re);
  assert.strictEqual(a.access.type, 'walk');
  assert.strictEqual(a.access.duration, 11 * 60);
  assert.strictEqual(a.access.distance, 940);
  assert.strictEqual(a.access.steps, 1250);
  assert.strictEqual(a.access.toName, 'Köln Hbf');
  // RE fährt (mit 2 Min. Verspätung) 14 Min. nach Start des Fußwegs → 11 Min. gehen, 3 Min. Luft
  assert.strictEqual(a.leaveAt.getTime(), re.start.getTime() - 11 * 60000);
  assert.strictEqual(a.waitAtStop, 3 * 60);
  const b = core.analyzeRoute(it, { strideCm: 75, bufferMin: 5 });
  assert.strictEqual(b.leaveAt.getTime(), re.start.getTime() - 16 * 60000);
  assert.strictEqual(a.walk.distance, 940 + 520);
  const sentence = core.leaveSentence(it, a);
  assert.ok(/^Um \d\d:\d\d losgehen: 11 Min\. zu Fuß \(ca\. 1\.250 Schritte\) bis Köln Hbf, Gleis\/Steig 5\. RE 5 fährt um \d\d:\d\d\.$/.test(sentence), sentence);
});

test('Weg zur Haltestelle an Abfahrt und Puffer ausrichten', () => {
  const it = plan.itineraries[0];
  const re = it.legs[1];
  const r = core.alignRoute(it, { bufferMin: 2 });
  assert.notStrictEqual(r, it);
  assert.strictEqual(r.legs[1], re, 'ÖPNV-Abschnitt bleibt unverändert');
  assert.strictEqual(r.legs[0].end.getTime(), re.start.getTime() - 2 * 60000);
  assert.strictEqual(r.start.getTime(), re.start.getTime() - 13 * 60000);
  assert.strictEqual(r.duration, Math.round((it.end - r.start) / 1000));
  assert.strictEqual(core.analyzeRoute(r, { bufferMin: 2 }).leaveAt.getTime(), r.start.getTime());
  assert.strictEqual(it.legs[0].start.getTime(), new Date(fx.makePlan(now).itineraries[0].legs[0].startTime).getTime(), 'Original unverändert');
});

test('Umstiegszeiten', () => {
  const it = plan.itineraries[1];
  const t = core.transferTimes(it);
  assert.deepStrictEqual(Object.keys(t), ['2']);
  assert.strictEqual(t[2], 4);
});

test('Valhalla-Antwort (deutsche Anweisungen)', () => {
  const r = core.parseValhalla(fx.makeValhalla('walk'), 'walk', from, to);
  assert.strictEqual(r.kind, 'direct');
  assert.strictEqual(r.mode, 'walk');
  assert.strictEqual(r.distance, 27800);
  assert.strictEqual(r.duration, 6 * 3600 + 25 * 60);
  assert.strictEqual(r.legs[0].steps[1].text, 'Rechts abbiegen auf Eigelstein');
  assert.ok(r.legs[0].geometry.length > 10);
  core.timeDirectRoute(r, new Date(2026, 10, 1, 9, 0), true);
  assert.strictEqual(core.fmtTime(r.start), '02:35');
  assert.strictEqual(core.fmtTime(r.end), '09:00');
  assert.throws(() => core.parseValhalla({ error_code: 171, error: 'No suitable edges near location', status_code: 400 }, 'walk', from, to), /No suitable edges/);
});

test('OSRM-Antwort (Anweisungen selbst übersetzt)', () => {
  const r = core.parseOsrm(fx.makeOsrm('bike'), 'bike', from, to);
  assert.strictEqual(r.distance, 28650);
  assert.deepStrictEqual(r.legs[0].steps.map(s => s.text), ['Starte auf Ebertplatz', 'Rechts abbiegen auf Eigelstein', 'Im Kreisverkehr die 2. Ausfahrt nehmen auf Bonner Straße', 'Ziel erreicht']);
  assert.throws(() => core.parseOsrm({ code: 'NoRoute', message: 'Impossible route' }, 'bike', from, to), /Impossible/);
});

test('Text zum Teilen', () => {
  const t = core.routeText(plan.itineraries[0], from, to, { strideCm: 75 });
  assert.ok(t.indexOf('Ebertplatz 2 → Poppelsdorfer Allee 49') === 0, t);
  assert.ok(/RE 5 Richtung Koblenz Hbf ab Köln Hbf \(Gleis 5\)/.test(t), t);
  assert.ok(/Fußweg 11 Min\. · 950 m, ca\. 1\.250 Schritte bis Köln Hbf/.test(t), t);
  assert.ok(/bis Poppelsdorfer Allee 49/.test(t), t);
});

// ------------------------------------------------------------ Zeitwunsch

function at(h, m, dayOffset) { return new Date(2026, 10, 2 + (dayOffset || 0), h, m); }
function fakeRoute(sh, sm, eh, em) { return { kind: 'transit', start: at(sh, sm), end: at(eh, em), legs: [] }; }
const NOW = at(7, 30);

test('Zeitwunsch: Abfragezeit für die Fahrplanauskunft', () => {
  assert.deepStrictEqual(core.specQuery({ dep: 'now', arr: 'any' }, NOW), { time: NOW, arriveBy: false });
  assert.deepStrictEqual(core.specQuery({ dep: 'from', depTime: at(8, 0) }, NOW), { time: at(8, 0), arriveBy: false });
  assert.deepStrictEqual(core.specQuery({ dep: 'at', depTime: at(8, 0) }, NOW), { time: at(7, 50), arriveBy: false });
  assert.deepStrictEqual(core.specQuery({ dep: 'at', depTime: at(7, 35) }, NOW), { time: NOW, arriveBy: false }, 'nicht in der Vergangenheit');
  assert.deepStrictEqual(core.specQuery({ dep: 'now', arr: 'by', arrTime: at(9, 0) }, NOW), { time: at(9, 0), arriveBy: true });
  assert.deepStrictEqual(core.specQuery({ dep: 'from', depTime: at(8, 0), arr: 'around', arrTime: at(9, 0) }, NOW), { time: at(9, 10), arriveBy: true });
  assert.deepStrictEqual(core.specFallbackQuery({ dep: 'from', depTime: at(8, 0), arr: 'by', arrTime: at(9, 0) }, NOW), { time: at(8, 0), arriveBy: false });
  assert.deepStrictEqual(core.specFallbackQuery({ dep: 'now', arr: 'by', arrTime: at(9, 0) }, NOW), { time: NOW, arriveBy: false });
});

test('Zeitwunsch: Eingaben prüfen', () => {
  assert.strictEqual(core.checkSpec({ dep: 'now', arr: 'any' }, NOW), '');
  assert.ok(/Vergangenheit/.test(core.checkSpec({ dep: 'now', arr: 'by', arrTime: at(7, 0) }, NOW)));
  assert.ok(/nach „Losgehen“/.test(core.checkSpec({ dep: 'from', depTime: at(9, 0), arr: 'by', arrTime: at(8, 0) }, NOW)));
  assert.ok(/wann du losgehen/.test(core.checkSpec({ dep: 'from', depTime: null }, NOW)));
});

test('Zeitwunsch: passt / zu spät / zu früh / verpasst', () => {
  const spec = { dep: 'from', depTime: at(8, 0), arr: 'by', arrTime: at(9, 0) };
  assert.deepStrictEqual(core.judgeRoute(fakeRoute(8, 10, 8, 52), spec, NOW), { ok: true, code: 'ok', text: '', lateMin: 0, spareMin: 8 });
  const late = core.judgeRoute(fakeRoute(8, 30, 9, 5), spec, NOW);
  assert.strictEqual(late.code, 'late');
  assert.strictEqual(late.text, '5 Min. zu spät');
  assert.strictEqual(core.judgeRoute(fakeRoute(7, 50, 8, 40), spec, NOW).code, 'early');
  assert.strictEqual(core.judgeRoute(fakeRoute(7, 20, 8, 0), { dep: 'now' }, NOW).code, 'missed');
});

test('Zeitwunsch: beste Verbindung', () => {
  const r1 = fakeRoute(8, 5, 8, 40), r2 = fakeRoute(8, 20, 8, 55), r3 = fakeRoute(8, 35, 9, 10), r4 = fakeRoute(7, 55, 8, 30);
  const all = [r1, r2, r3, r4];
  // muss bis 9 da sein → so spät wie möglich los
  assert.strictEqual(core.bestRoute(all, { dep: 'now', arr: 'by', arrTime: at(9, 0) }, NOW), r2);
  // kann ab 8 los + muss bis 9 → r4 fährt zu früh, r3 kommt zu spät
  assert.strictEqual(core.bestRoute(all, { dep: 'from', depTime: at(8, 0), arr: 'by', arrTime: at(9, 0) }, NOW), r2);
  // will gegen 8:45 da sein → r1 (5 Min. früher) schlägt r2 (10 Min. später)
  assert.strictEqual(core.bestRoute(all, { dep: 'now', arr: 'around', arrTime: at(8, 45) }, NOW), r1);
  // will um 8:30 los → r3 (8:35) am nächsten
  assert.strictEqual(core.bestRoute(all, { dep: 'at', depTime: at(8, 30) }, NOW), r3);
  // jetzt los → am frühesten da
  assert.strictEqual(core.bestRoute(all, { dep: 'now' }, NOW), r4);
  // nichts schafft 8:20
  assert.strictEqual(core.bestRoute(all, { dep: 'now', arr: 'by', arrTime: at(8, 20) }, NOW), null);
  assert.strictEqual(core.earliestArrival(all, { dep: 'now', arr: 'by', arrTime: at(8, 20) }, NOW), r4);
});

test('Zeitwunsch: direkte Wege einplanen', () => {
  const walk = () => core.parseValhalla(fx.makeValhalla('car'), 'car', from, to); // 36 Min.
  let r = core.timeDirectSpec(walk(), { dep: 'now', arr: 'by', arrTime: at(9, 0) }, NOW);
  assert.strictEqual(core.fmtTime(r.start), '08:24');
  assert.strictEqual(core.fmtTime(r.end), '09:00');
  r = core.timeDirectSpec(walk(), { dep: 'from', depTime: at(8, 40), arr: 'by', arrTime: at(9, 0) }, NOW);
  assert.strictEqual(core.fmtTime(r.start), '08:40', 'nicht vor dem frühesten Losgehen');
  assert.strictEqual(core.judgeRoute(r, { dep: 'from', depTime: at(8, 40), arr: 'by', arrTime: at(9, 0) }, NOW).lateMin, 16);
  r = core.timeDirectSpec(walk(), { dep: 'at', depTime: at(8, 0) }, NOW);
  assert.strictEqual(core.fmtTime(r.start) + '-' + core.fmtTime(r.end), '08:00-08:36');
  r = core.timeDirectSpec(walk(), { dep: 'now' }, NOW);
  assert.strictEqual(r.start.getTime(), NOW.getTime());
});

test('Zeitwunsch: Texte', () => {
  assert.strictEqual(core.describeSpec({ dep: 'from', depTime: at(8, 0), arr: 'by', arrTime: at(9, 0) }, NOW), 'Los ab 08:00 · da bis 09:00');
  assert.strictEqual(core.describeSpec({ dep: 'now', arr: 'around', arrTime: at(9, 0, 1) }, NOW), 'Los ab jetzt · da gegen morgen 09:00');
  assert.strictEqual(core.describeSpec({ dep: 'now' }, NOW), 'Jetzt, 07:30');
  assert.ok(/spätestens losgehen musst/.test(core.explainSpec({ dep: 'now', arr: 'by', arrTime: at(9, 0) }, NOW)));
  assert.ok(/um 08:00 los/.test(core.explainSpec({ dep: 'at', depTime: at(8, 0) }, NOW)));
});

// ------------------------------------------------------------ Favoriten

test('Favoriten: speichern, ersetzen, sortieren, löschen', () => {
  const home = { name: 'Ebertplatz 2', detail: '50668 Köln', lat: fx.P.start[0], lon: fx.P.start[1], kind: 'address' };
  const work = { name: 'Poppelsdorfer Allee 49', detail: '53115 Bonn', lat: fx.P.ziel[0], lon: fx.P.ziel[1], kind: 'address' };
  const oma = { name: 'Poppelsdorfer Platz', detail: 'Bonn', lat: fx.P.poppelsdorferPlatz[0], lon: fx.P.poppelsdorferPlatz[1], kind: 'stop', stopId: 'de:05314:61107' };
  let l = [];
  l = core.upsertFav(l, { kind: 'other', label: 'Oma', place: oma }, 'f1');
  l = core.upsertFav(l, { kind: 'work', place: work });
  l = core.upsertFav(l, { kind: 'home', place: home });
  assert.deepStrictEqual(l.map(f => f.id + ':' + core.favLabel(f)), ['home:Zuhause', 'work:Arbeit', 'f1:Oma']);
  assert.strictEqual(l[2].place.stopId, 'de:05314:61107');
  // neues Zuhause ersetzt das alte
  l = core.upsertFav(l, { kind: 'home', place: work });
  assert.strictEqual(l.filter(f => f.kind === 'home').length, 1);
  assert.strictEqual(l[0].place.name, 'Poppelsdorfer Allee 49');
  // eigener Favorit umbenennen bleibt an seiner Stelle
  l = core.upsertFav(l, { kind: 'other', label: 'Mama', place: home }, 'f2');
  l = core.upsertFav(l, { id: 'f1', kind: 'other', label: 'Oma & Opa', place: oma });
  assert.deepStrictEqual(l.map(f => core.favLabel(f)), ['Zuhause', 'Arbeit', 'Oma & Opa', 'Mama']);
  // eigener Favorit wird zu "Arbeit" → alter Eintrag weg
  l = core.upsertFav(l, { id: 'f2', kind: 'work', place: home });
  assert.deepStrictEqual(l.map(f => f.id), ['home', 'work', 'f1']);
  assert.strictEqual(l[1].place.name, 'Ebertplatz 2');
  l = core.removeFav(l, 'home');
  assert.deepStrictEqual(l.map(f => f.id), ['work', 'f1']);
  assert.deepStrictEqual(core.normFavs([{ kind: 'home', place: { name: 'x' } }, null, { kind: 'other', place: home }]), [], 'kaputte Einträge fallen weg');
});

test('Favoriten: finden, Suche, Standort speichern', () => {
  const home = { name: 'Ebertplatz 2', detail: '50668 Köln', lat: 50.95105, lon: 6.95712, kind: 'address' };
  const l = core.upsertFav([], { kind: 'home', place: home });
  assert.strictEqual(core.findFav(l, { lat: 50.95106, lon: 6.95714 }).id, 'home', 'wenige Meter daneben');
  assert.strictEqual(core.findFav(l, { lat: 50.952, lon: 6.957 }), null, '100 m daneben');
  assert.strictEqual(core.findFav(l, { kind: 'here', lat: 50.95105, lon: 6.95712 }), null, 'Mein Standort bleibt Mein Standort');
  assert.deepStrictEqual(core.matchFavs(l, 'zuh').map(core.favLabel), ['Zuhause']);
  assert.deepStrictEqual(core.matchFavs(l, 'ebert').map(core.favLabel), ['Zuhause']);
  assert.deepStrictEqual(core.matchFavs(l, 'xyz'), []);
  const p = core.favPlace(l[0]);
  assert.strictEqual(p.fav, 'Zuhause');
  assert.strictEqual(p.favId, 'home');
  // aktueller Standort als Zuhause: Adresse aus der Standortsuche wird der Name
  const h = core.upsertFav([], { kind: 'home', place: { name: 'Mein Standort', detail: 'Ebertplatz 2, 50668 Köln', lat: 50.95, lon: 6.95, kind: 'here' } });
  assert.strictEqual(h[0].place.name, 'Ebertplatz 2');
  assert.strictEqual(h[0].place.detail, '50668 Köln');
  assert.strictEqual(h[0].place.kind, 'address');
});

// ------------------------------------------------------------ Google Maps

test('Google Maps: Route und Navigation', () => {
  const u = new URL(core.gmapsDirUrl(from, to, 'transit'));
  assert.strictEqual(u.origin + u.pathname, 'https://www.google.com/maps/dir/');
  assert.strictEqual(u.searchParams.get('api'), '1');
  assert.strictEqual(u.searchParams.get('origin'), '50.951050,6.957120');
  assert.strictEqual(u.searchParams.get('destination'), '50.727440,7.094530');
  assert.strictEqual(u.searchParams.get('travelmode'), 'transit');
  const n = new URL(core.gmapsDirUrl(null, to, 'bike', true));
  assert.strictEqual(n.searchParams.get('origin'), null, 'ohne Start nimmt Google den aktuellen Standort');
  assert.strictEqual(n.searchParams.get('travelmode'), 'bicycling');
  assert.strictEqual(n.searchParams.get('dir_action'), 'navigate');
  assert.strictEqual(core.gmapsNavUri(to, 'walk'), 'google.navigation:q=50.727440,7.094530&mode=w');
  assert.strictEqual(core.gmapsNavUri(to, 'car'), 'google.navigation:q=50.727440,7.094530&mode=d');
});

// ------------------------------------------------------------ api.js mit nachgebautem Netz

function loadApi(handler) {
  const calls = [];
  global.window = { U: { core } };
  global.fetch = (url) => {
    calls.push(url);
    const r = handler(url, calls.length);
    return Promise.resolve({ status: r[0], text: () => Promise.resolve(typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1])) });
  };
  const file = path.join(__dirname, '../app/assets/www/js/api.js');
  delete require.cache[require.resolve(file)];
  require(file);
  return { api: global.window.U.api, calls };
}

const q = { from, to, time: new Date(), arriveBy: false, sel: { walk: true, bus: true, bahn: true, zug: true }, settings: {} };

test('API: neueste Version, bei 404 ältere Version', async () => {
  const { api, calls } = loadApi((url) => url.indexOf('/api/v6/') > 0 ? [404, 'Not Found'] : [200, fx.makePlan(new Date())]);
  const res = await api.planTransit(q);
  assert.strictEqual(res.itineraries.length, 3);
  assert.ok(calls[0].indexOf('/api/v6/plan') > 0 && calls[1].indexOf('/api/v5/plan') > 0);
  assert.strictEqual(res.state.vIdx, 1);
});

test('API: Park+Ride abgelehnt → Auto, dann Fußweg', async () => {
  const { api, calls } = loadApi((url) => {
    if (url.indexOf('CAR') > 0) return [400, { error: 'unsupported mode' }];
    return [200, fx.makePlan(new Date())];
  });
  const res = await api.planTransit(Object.assign({}, q, { sel: { car: true, zug: true } }));
  assert.ok(calls[0].indexOf('preTransitModes=CAR_PARKING') > 0);
  assert.ok(calls[1].indexOf('preTransitModes=CAR&') > 0);
  assert.ok(calls[2].indexOf('preTransitModes=WALK') > 0);
  assert.strictEqual(res.notes.length, 1);
  assert.ok(/Auto/.test(res.notes[0]));
});

test('API: Blättern nutzt dieselbe Version ohne neue Versuche', async () => {
  const { api, calls } = loadApi(() => [200, fx.makeLaterPage(new Date())]);
  const res = await api.planTransit(Object.assign({}, q, { pageCursor: 'LATER|1' }), { vIdx: 1, access: 0, minimal: false, coords: false });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].indexOf('/api/v5/plan') > 0 && calls[0].indexOf('pageCursor=LATER%7C1') > 0);
  assert.strictEqual(res.nextPageCursor, 'LATER|2');
});

test('API: Netzfehler wird als solcher gemeldet', async () => {
  global.window = { U: { core } };
  global.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  const file = path.join(__dirname, '../app/assets/www/js/api.js');
  delete require.cache[require.resolve(file)];
  require(file);
  await assert.rejects(global.window.U.api.planTransit(q), (e) => e.network === true);
});

test('API: Adresssuche fällt auf Photon zurück', async () => {
  const { api, calls } = loadApi((url) => url.indexOf('transitous') > 0 ? [500, 'oops'] : [200, fx.makePhoton()]);
  const res = await api.geocode('Poppelsdorfer Allee 49');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].source, 'photon');
  assert.ok(calls[1].indexOf('photon.komoot.io') > 0);
});

test('API: direkter Weg fällt von Valhalla auf OSRM zurück', async () => {
  const { api, calls } = loadApi((url) => url.indexOf('valhalla') > 0 ? [400, { error_code: 154, error: 'Path distance exceeds the max distance limit', status_code: 400 }] : [200, fx.makeOsrm('bike')]);
  const r = await api.planDirect(from, to, 'bike', {});
  assert.strictEqual(r.source, 'osrm');
  assert.strictEqual(calls.length, 2);
});

test('API: Android-Brücke (Antwort per Java-Rückruf)', async () => {
  global.window = {
    U: { core },
    Android: {
      bodies: {},
      httpGet(id, url) {
        this.bodies[id] = JSON.stringify(fx.makeGeocode('ebert'));
        setTimeout(() => global.window.U.api._done(id, 200), 5);
      },
      httpBody(id) { const b = this.bodies[id]; delete this.bodies[id]; return b; }
    }
  };
  const file = path.join(__dirname, '../app/assets/www/js/api.js');
  delete require.cache[require.resolve(file)];
  require(file);
  const res = await global.window.U.api.geocode('Ebertplatz');
  assert.strictEqual(res[0].name, 'Ebertplatz 2');
  assert.strictEqual(res[1].kind, 'stop');
});

(async () => {
  for (const [name, fn] of queue) {
    try {
      await fn();
      passed++;
      console.log('  ok  ' + name);
    } catch (e) {
      failed++;
      console.log('FEHLER ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e));
    }
  }
  console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
  process.exit(failed ? 1 : 0);
})();

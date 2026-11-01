/*
 * Nachgebaute Antworten der Online-Dienste für Tests (Aufbau laut MOTIS-OpenAPI v6,
 * Valhalla- und OSRM-Dokumentation). Zeiten werden relativ zu "jetzt" erzeugt.
 * Beispiel: Köln, Ebertplatz → Bonn, Poppelsdorfer Allee.
 */
'use strict';
const core = require('../app/assets/www/js/core.js');

const P = {
  start: [50.95105, 6.95712],
  ebertplatzStop: [50.95052, 6.95789],
  hbf: [50.94295, 6.95859],
  koelnSued: [50.92458, 6.93743],
  bruehl: [50.83228, 6.90337],
  sechtem: [50.79002, 6.94834],
  roisdorf: [50.75377, 7.06455],
  bonnHbf: [50.73201, 7.09709],
  poppelsdorferPlatz: [50.72581, 7.09163],
  ziel: [50.72744, 7.09453]
};

function iso(d) { return new Date(d).toISOString(); }
function add(d, min) { return new Date(d.getTime() + min * 60000); }

function line(points, n) {
  // Zwischenpunkte, damit die Linie auf der Karte nicht nur aus zwei Punkten besteht
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    for (let k = 0; k < (n || 4); k++) {
      const t = k / (n || 4);
      out.push([a[0] + (b[0] - a[0]) * t + Math.sin(t * Math.PI) * 0.0004, a[1] + (b[1] - a[1]) * t]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function geom(points, precision) {
  const p = precision || 6;
  return { points: core.encodePolyline(points, p), precision: p, length: points.length };
}

function place(name, pt, extra) {
  return Object.assign({ name, lat: pt[0], lon: pt[1], level: 0 }, extra || {});
}

function walkLeg(fromName, fromPt, toName, toPt, start, minutes, distance, stopExtra) {
  const end = add(start, minutes);
  return {
    mode: 'WALK',
    from: place(fromName, fromPt, { departure: iso(start), scheduledDeparture: iso(start) }),
    to: place(toName, toPt, Object.assign({ arrival: iso(end), scheduledArrival: iso(end) }, stopExtra || {})),
    duration: minutes * 60,
    startTime: iso(start), endTime: iso(end),
    scheduledStartTime: iso(start), scheduledEndTime: iso(end),
    realTime: false, scheduled: true,
    distance,
    legGeometry: geom(line([fromPt, toPt], 6)),
    steps: [
      { relativeDirection: 'DEPART', distance: 40, fromLevel: 0, toLevel: 0, polyline: geom([fromPt, fromPt]), streetName: 'Ebertplatz', exit: '', stayOn: false, area: false },
      { relativeDirection: 'RIGHT', distance: Math.round(distance * 0.6), fromLevel: 0, toLevel: 0, polyline: geom([fromPt, toPt]), streetName: 'Eigelstein', exit: '', stayOn: false, area: false },
      { relativeDirection: 'CONTINUE', distance: 30, fromLevel: 0, toLevel: 0, polyline: geom([fromPt, toPt]), streetName: 'Eigelstein', exit: '', stayOn: false, area: false },
      { relativeDirection: 'SLIGHTLY_LEFT', distance: Math.round(distance * 0.4) - 70, fromLevel: 0, toLevel: 0, polyline: geom([fromPt, toPt]), streetName: '', exit: '', stayOn: false, area: false },
      { relativeDirection: 'STAIRS', distance: 0, fromLevel: 0, toLevel: 1, polyline: geom([toPt, toPt]), streetName: '', exit: '', stayOn: false, area: false }
    ]
  };
}

function transitLeg(o) {
  const start = o.start, end = add(start, o.minutes);
  const delay = o.delay || 0;
  const rStart = add(start, delay), rEnd = add(end, delay);
  const pts = [o.fromPt].concat((o.stops || []).map(s => s[1])).concat([o.toPt]);
  const n = (o.stops || []).length + 1;
  return {
    mode: o.mode,
    from: place(o.fromName, o.fromPt, {
      stopId: 'de:' + o.fromName, departure: iso(rStart), scheduledDeparture: iso(start),
      track: o.track || undefined, scheduledTrack: o.schedTrack || o.track || undefined
    }),
    to: place(o.toName, o.toPt, {
      stopId: 'de:' + o.toName, arrival: iso(rEnd), scheduledArrival: iso(end), track: o.toTrack || undefined, scheduledTrack: o.toTrack || undefined
    }),
    duration: o.minutes * 60,
    startTime: iso(rStart), endTime: iso(rEnd),
    scheduledStartTime: iso(start), scheduledEndTime: iso(end),
    realTime: !!o.realTime, scheduled: true,
    headsign: o.headsign,
    tripTo: place(o.headsign, o.toPt),
    routeShortName: o.short, displayName: o.display, tripShortName: o.trip,
    routeColor: o.color, routeTextColor: o.textColor,
    agencyName: o.agency, tripId: 'trip-' + o.short + '-' + start.getTime(),
    bikesAllowed: o.bikes !== false,
    intermediateStops: (o.stops || []).map((s, i) => {
      const t = add(rStart, Math.round(o.minutes * (i + 1) / n));
      const st = add(start, Math.round(o.minutes * (i + 1) / n));
      return place(s[0], s[1], { stopId: 'de:' + s[0], arrival: iso(t), departure: iso(t), scheduledArrival: iso(st), scheduledDeparture: iso(st) });
    }),
    alerts: o.alerts,
    legGeometry: geom(line(pts, 5))
  };
}

function itinerary(legs, transfers) {
  const start = legs[0].startTime, end = legs[legs.length - 1].endTime;
  return {
    duration: Math.round((new Date(end) - new Date(start)) / 1000),
    startTime: start, endTime: end, transfers,
    id: 'it-' + start + '-' + legs.length,
    legs
  };
}

/** /api/v6/plan – drei Verbindungen ab "now". */
function makePlan(now) {
  const base = new Date(Math.ceil(now.getTime() / 60000) * 60000);

  // 1) zu Fuß zum Hbf, RE 5 nach Bonn, zu Fuß zum Ziel
  const w1Start = add(base, 9);
  const re5Start = add(w1Start, 12);
  const it1 = itinerary([
    walkLeg('START', P.start, 'Köln Hbf', P.hbf, w1Start, 11, 940, { track: '5' }),
    transitLeg({
      mode: 'REGIONAL_RAIL', fromName: 'Köln Hbf', fromPt: P.hbf, toName: 'Bonn Hbf', toPt: P.bonnHbf,
      start: re5Start, minutes: 23, track: '5', toTrack: '1', headsign: 'Koblenz Hbf', short: 'RE5', display: 'RE 5', trip: '10520',
      color: '9a1b1f', textColor: 'ffffff', agency: 'DB Regio NRW', realTime: true, delay: 2,
      stops: [['Köln Süd', P.koelnSued], ['Brühl', P.bruehl], ['Sechtem', P.sechtem], ['Roisdorf', P.roisdorf]],
      alerts: [{ headerText: 'Bauarbeiten zwischen Brühl und Bonn', descriptionText: 'Einzelne Fahrten verkehren mit geänderten Zeiten.' }]
    }),
    walkLeg('Bonn Hbf', P.bonnHbf, 'END', P.ziel, add(re5Start, 23 + 2), 7, 520)
  ], 0);

  // 2) zur Stadtbahn Ebertplatz, Linie 16 bis Bonn Hbf, Bus 600, kurz zu Fuß
  const w2Start = add(base, 14);
  const t16Start = add(w2Start, 3);
  const bus = add(t16Start, 58);
  const it2 = itinerary([
    walkLeg('START', P.start, 'Ebertplatz', P.ebertplatzStop, w2Start, 2, 110),
    transitLeg({
      mode: 'TRAM', fromName: 'Ebertplatz', fromPt: P.ebertplatzStop, toName: 'Bonn Hbf', toPt: P.bonnHbf,
      start: t16Start, minutes: 54, headsign: 'Bad Godesberg Stadthalle', short: '16', display: '16',
      agency: 'KVB', realTime: true, delay: 0, color: '009ee0',
      stops: [['Breslauer Platz/Hbf', P.hbf], ['Neumarkt', [50.9358, 6.9474]], ['Barbarossaplatz', [50.9271, 6.9395]], ['Wesseling', [50.8264, 6.9772]], ['Bonn West', [50.7348, 7.0812]]]
    }),
    transitLeg({
      mode: 'BUS', fromName: 'Bonn Hbf', fromPt: P.bonnHbf, toName: 'Poppelsdorfer Platz', toPt: P.poppelsdorferPlatz,
      start: bus, minutes: 4, track: 'C1', headsign: 'Ippendorf Altenheim', short: '600', display: '600', agency: 'SWB Bus und Bahn',
      bikes: false
    }),
    walkLeg('Poppelsdorfer Platz', P.poppelsdorferPlatz, 'END', P.ziel, add(bus, 4), 3, 230)
  ], 1);

  // 3) später, RB 26 – ohne Echtzeit
  const w3Start = add(base, 30);
  const rbStart = add(w3Start, 13);
  const it3 = itinerary([
    walkLeg('START', P.start, 'Köln Hbf', P.hbf, w3Start, 11, 940),
    transitLeg({
      mode: 'REGIONAL_RAIL', fromName: 'Köln Hbf', fromPt: P.hbf, toName: 'Bonn Hbf', toPt: P.bonnHbf,
      start: rbStart, minutes: 27, track: '3', schedTrack: '2', toTrack: '2', headsign: 'Koblenz Hbf', short: 'RB26', display: 'RB 26', agency: 'trans regio',
      stops: [['Köln Süd', P.koelnSued], ['Brühl', P.bruehl]]
    }),
    walkLeg('Bonn Hbf', P.bonnHbf, 'END', P.ziel, add(rbStart, 27), 7, 520)
  ], 0);

  return {
    requestParameters: {}, debugOutput: {},
    from: place('START', P.start), to: place('END', P.ziel),
    direct: [],
    itineraries: [it1, it2, it3],
    previousPageCursor: 'EARLIER|1', nextPageCursor: 'LATER|1'
  };
}

/** Eine spätere Seite fürs Blättern. */
function makeLaterPage(now) {
  const plan = makePlan(add(now, 60));
  plan.itineraries = plan.itineraries.slice(0, 1).map(it => Object.assign({}, it, { id: it.id + '-later' }));
  plan.nextPageCursor = 'LATER|2';
  return plan;
}

/** Valhalla /route mit language=de-DE. */
function makeValhalla(mode) {
  const pts = line([P.start, P.hbf, P.koelnSued, P.bruehl, P.sechtem, P.roisdorf, P.ziel], 3);
  const km = { walk: 27.8, bike: 29.4, car: 31.2 }[mode];
  const time = { walk: 6 * 3600 + 25 * 60, bike: 1 * 3600 + 52 * 60, car: 36 * 60 }[mode];
  const travel = { walk: 'pedestrian', bike: 'bicycle', car: 'drive' }[mode];
  return {
    trip: {
      locations: [{ type: 'break', lat: P.start[0], lon: P.start[1] }, { type: 'break', lat: P.ziel[0], lon: P.ziel[1] }],
      legs: [{
        maneuvers: [
          { type: 1, instruction: 'Auf Ebertplatz Richtung Süden gehen.', time: 30, length: 0.04, begin_shape_index: 0, end_shape_index: 1, travel_mode: travel },
          { type: 10, instruction: 'Rechts abbiegen auf Eigelstein.', time: 400, length: 0.6, begin_shape_index: 1, end_shape_index: 4, travel_mode: travel },
          { type: 15, instruction: 'Links abbiegen auf Bonner Straße.', time: time - 460, length: km - 0.68, begin_shape_index: 4, end_shape_index: pts.length - 2, travel_mode: travel },
          { type: 4, instruction: 'Sie haben Ihr Ziel erreicht.', time: 0, length: 0, begin_shape_index: pts.length - 1, end_shape_index: pts.length - 1, travel_mode: travel }
        ],
        summary: { time, length: km },
        shape: core.encodePolyline(pts, 6)
      }],
      summary: { time, length: km },
      status_message: 'Found route between points', status: 0, units: 'kilometers', language: 'de-DE'
    }
  };
}

function makeOsrm(mode) {
  const pts = line([P.start, P.hbf, P.bonnHbf, P.ziel], 4);
  return {
    code: 'Ok',
    routes: [{
      geometry: core.encodePolyline(pts, 6),
      legs: [{
        steps: [
          { maneuver: { type: 'depart', location: [P.start[1], P.start[0]] }, name: 'Ebertplatz', distance: 50, duration: 10 },
          { maneuver: { type: 'turn', modifier: 'right' }, name: 'Eigelstein', distance: 600, duration: 120 },
          { maneuver: { type: 'roundabout', exit: 2 }, name: 'Bonner Straße', distance: 28000, duration: 5400 },
          { maneuver: { type: 'arrive' }, name: '', distance: 0, duration: 0 }
        ],
        distance: 28650, duration: 5530
      }],
      distance: 28650, duration: 5530
    }],
    waypoints: []
  };
}

/** /api/v1/geocode */
function makeGeocode(text) {
  const t = (text || '').toLowerCase();
  if (t.indexOf('ebert') >= 0) {
    return [
      { type: 'ADDRESS', name: 'Ebertplatz 2', id: 'a1', lat: P.start[0], lon: P.start[1], street: 'Ebertplatz', houseNumber: '2', zip: '50668', tokens: [[0, 7]], score: 1,
        areas: [{ name: 'Deutschland', adminLevel: 2, matched: false }, { name: 'Nordrhein-Westfalen', adminLevel: 4, matched: false }, { name: 'Köln', adminLevel: 6, matched: false, default: true }, { name: 'Neustadt-Nord', adminLevel: 10, matched: false, unique: true }] },
      { type: 'STOP', name: 'Ebertplatz', id: 'de:05315:11201', lat: P.ebertplatzStop[0], lon: P.ebertplatzStop[1], tokens: [[0, 7]], score: 0.9,
        areas: [{ name: 'Köln', adminLevel: 6, matched: false, default: true }], modes: ['TRAM', 'BUS'] }
    ];
  }
  if (t.indexOf('poppels') >= 0) {
    return [
      { type: 'ADDRESS', name: 'Poppelsdorfer Allee 49', id: 'a2', lat: P.ziel[0], lon: P.ziel[1], street: 'Poppelsdorfer Allee', houseNumber: '49', zip: '53115', tokens: [[0, 7]], score: 1,
        areas: [{ name: 'Deutschland', adminLevel: 2, matched: false }, { name: 'Bonn', adminLevel: 6, matched: false, default: true }] },
      { type: 'STOP', name: 'Poppelsdorfer Platz', id: 'de:05314:61107', lat: P.poppelsdorferPlatz[0], lon: P.poppelsdorferPlatz[1], tokens: [[0, 7]], score: 0.8,
        areas: [{ name: 'Bonn', adminLevel: 6, matched: false, default: true }] }
    ];
  }
  return [];
}

function makePhoton() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [P.ziel[1], P.ziel[0]] },
      properties: { osm_key: 'place', osm_value: 'house', type: 'house', street: 'Poppelsdorfer Allee', housenumber: '49', postcode: '53115', city: 'Bonn', state: 'Nordrhein-Westfalen', country: 'Deutschland' }
    }]
  };
}

module.exports = { P, makePlan, makeLaterPage, makeValhalla, makeOsrm, makeGeocode, makePhoton };

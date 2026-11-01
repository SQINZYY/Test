/*
 * Unterwegs – Kernlogik ohne DOM.
 * Formatierung, Polylines, Schrittzahlen, Abfrage-Parameter und die Auswertung der Antworten
 * von Transitous/MOTIS (Bus & Bahn), Valhalla und OSRM (zu Fuß, Fahrrad, Auto).
 * Läuft im Browser (window.U.core) und in Node (require) für die Tests.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- Verkehrsmittel

  /** Was man in der App auswählen kann. */
  var CHOICES = [
    { id: 'walk', label: 'Zu Fuß', sub: 'mit Schritten', street: true },
    { id: 'bike', label: 'Fahrrad', sub: 'eigenes Rad', street: true },
    { id: 'car', label: 'Auto', sub: 'ohne Verkehr', street: true },
    { id: 'bus', label: 'Bus', sub: 'Stadt & Region', transit: true },
    { id: 'bahn', label: 'Bahn', sub: 'S-/U-Bahn, Tram', transit: true },
    { id: 'zug', label: 'Zug', sub: 'Regio & ICE', transit: true }
  ];

  /** MOTIS-Verkehrsmittel → Kategorie in der App + deutscher Name. */
  var MODE_INFO = {
    WALK: { cat: 'walk', label: 'Fußweg' },
    BIKE: { cat: 'bike', label: 'Fahrrad' },
    RENTAL: { cat: 'bike', label: 'Leihfahrzeug' },
    CAR: { cat: 'car', label: 'Auto' },
    CAR_PARKING: { cat: 'car', label: 'Auto' },
    CAR_DROPOFF: { cat: 'car', label: 'Auto' },
    HGV: { cat: 'car', label: 'Auto' },
    BUS: { cat: 'bus', label: 'Bus' },
    COACH: { cat: 'bus', label: 'Fernbus' },
    ODM: { cat: 'bus', label: 'Rufbus' },
    FLEX: { cat: 'bus', label: 'Rufbus' },
    RIDE_SHARING: { cat: 'other', label: 'Mitfahrgelegenheit' },
    TRAM: { cat: 'bahn', label: 'Straßenbahn' },
    SUBWAY: { cat: 'bahn', label: 'U-Bahn' },
    SUBURBAN: { cat: 'bahn', label: 'S-Bahn' },
    METRO: { cat: 'bahn', label: 'S-Bahn' },
    FUNICULAR: { cat: 'bahn', label: 'Standseilbahn' },
    AERIAL_LIFT: { cat: 'other', label: 'Seilbahn' },
    AREAL_LIFT: { cat: 'other', label: 'Seilbahn' },
    CABLE_CAR: { cat: 'other', label: 'Seilbahn' },
    REGIONAL_RAIL: { cat: 'zug', label: 'Regionalzug' },
    REGIONAL_FAST_RAIL: { cat: 'zug', label: 'Regionalexpress' },
    LONG_DISTANCE: { cat: 'zug', label: 'Fernzug' },
    HIGHSPEED_RAIL: { cat: 'zug', label: 'Fernzug' },
    NIGHT_RAIL: { cat: 'zug', label: 'Nachtzug' },
    RAIL: { cat: 'zug', label: 'Zug' },
    FERRY: { cat: 'ferry', label: 'Fähre' },
    AIRPLANE: { cat: 'plane', label: 'Flug' },
    OTHER: { cat: 'other', label: 'Verkehrsmittel' }
  };

  var STREET_MODES = { WALK: 1, BIKE: 1, RENTAL: 1, CAR: 1, CAR_PARKING: 1, CAR_DROPOFF: 1, HGV: 1 };

  /** Farben je Kategorie (Linienfarbe aus dem Fahrplan hat Vorrang). */
  var CAT_COLOR = {
    walk: '#64748b', bike: '#16a34a', car: '#475569',
    bus: '#a21caf', bahn: '#0284c7', zug: '#dc2626',
    ferry: '#0369a1', plane: '#7c3aed', other: '#6b7280'
  };

  function modeInfo(mode) {
    return MODE_INFO[mode] || { cat: 'other', label: 'Verkehrsmittel' };
  }

  function isStreetMode(mode) {
    return !!STREET_MODES[mode];
  }

  // ---------------------------------------------------------------- Einstellungen

  var PACE = {
    slow: { label: 'gemütlich', motis: 1.0, valhalla: 4.0 },
    normal: { label: 'normal', motis: 1.3, valhalla: 5.0 },
    fast: { label: 'zügig', motis: 1.6, valhalla: 6.0 }
  };

  var DEFAULT_SETTINGS = {
    pace: 'normal',     // Gehtempo
    strideCm: 75,       // Schrittlänge für die Schrittzahl
    bufferMin: 0,       // Puffer an der Haltestelle
    maxWalkMin: 15,     // längster Fußweg zur/von der Haltestelle
    maxTransfers: -1,   // -1 = beliebig
    wheelchair: false   // stufenfreie Wege
  };

  function withDefaults(settings) {
    var s = {};
    for (var k in DEFAULT_SETTINGS) s[k] = DEFAULT_SETTINGS[k];
    if (settings) for (var j in settings) if (settings[j] !== undefined && settings[j] !== null) s[j] = settings[j];
    if (!PACE[s.pace]) s.pace = 'normal';
    s.strideCm = clamp(Number(s.strideCm) || 75, 40, 120);
    return s;
  }

  // ---------------------------------------------------------------- kleine Helfer

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toDate(v) {
    if (v === undefined || v === null || v === '') return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /** Tausenderpunkt wie im Deutschen: 4800 → "4.800". */
  function fmtNumber(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = '';
    while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (n < 0 ? '-' : '') + s + out;
  }

  function fmtTime(d) {
    d = toDate(d);
    return d ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : '–';
  }

  var WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

  function dayDiff(a, b) {
    var da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((da - db) / 86400000);
  }

  /** "heute", "morgen", "gestern" oder "Mo., 3.11." */
  function fmtDay(d, now) {
    d = toDate(d); now = toDate(now) || new Date();
    if (!d) return '';
    var diff = dayDiff(d, now);
    if (diff === 0) return 'heute';
    if (diff === 1) return 'morgen';
    if (diff === -1) return 'gestern';
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
  }

  /** Dauer in Sekunden → "8 Min.", "1 Std. 5 Min." */
  function fmtDuration(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return '–';
    var min = Math.round(sec / 60);
    if (min < 1) return '< 1 Min.';
    if (min < 60) return min + ' Min.';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' Std.' + (m ? ' ' + m + ' Min.' : '');
  }

  /** Kurzform für Leisten: "8", "1:05" */
  function fmtDurationShort(sec) {
    var min = Math.max(1, Math.round((sec || 0) / 60));
    if (min < 60) return String(min);
    return Math.floor(min / 60) + ':' + pad2(min % 60);
  }

  function fmtDistance(m) {
    if (m === null || m === undefined || !isFinite(m)) return '';
    if (m < 950) return (m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50) + ' m';
    var km = m / 1000;
    if (km < 10) return km.toFixed(1).replace('.', ',') + ' km';
    return fmtNumber(Math.round(km)) + ' km';
  }

  /** Schrittzahl aus der Strecke (gerundet, damit sie nicht genauer wirkt, als sie ist). */
  function stepsFor(meters, strideCm) {
    if (!meters || meters <= 0) return 0;
    var raw = meters / ((strideCm || 75) / 100);
    if (raw < 100) return Math.max(10, Math.round(raw / 10) * 10);
    if (raw < 1000) return Math.round(raw / 10) * 10;
    if (raw < 10000) return Math.round(raw / 50) * 50;
    return Math.round(raw / 100) * 100;
  }

  function fmtSteps(n) {
    return 'ca. ' + fmtNumber(n) + ' Schritte';
  }

  /** "jetzt", "in 5 Min.", "vor 3 Min." */
  function fmtCountdown(target, now) {
    target = toDate(target); now = toDate(now) || new Date();
    if (!target) return '';
    var min = Math.round((target - now) / 60000);
    if (min === 0) return 'jetzt';
    if (min > 0) return 'in ' + fmtDuration(min * 60);
    return 'vor ' + fmtDuration(-min * 60);
  }

  /** Verspätung in Minuten zwischen Plan und Echtzeit. */
  function delayMinutes(actual, scheduled) {
    actual = toDate(actual); scheduled = toDate(scheduled);
    if (!actual || !scheduled) return null;
    return Math.round((actual - scheduled) / 60000);
  }

  // ---------------------------------------------------------------- Geometrie

  /**
   * Google-Polyline dekodieren. MOTIS v1 liefert Genauigkeit 7, ab v2 und Valhalla/OSRM 6.
   * Rechnet ohne Bit-Operatoren, damit Werte mit Genauigkeit 7 nicht überlaufen.
   */
  function decodePolyline(str, precision) {
    var factor = Math.pow(10, precision === undefined ? 6 : precision);
    var out = [], index = 0, lat = 0, lon = 0;
    if (!str) return out;
    while (index < str.length) {
      var vals = [0, 0];
      for (var k = 0; k < 2; k++) {
        var result = 0, mult = 1, b;
        do {
          if (index >= str.length) return out;
          b = str.charCodeAt(index++) - 63;
          result += (b & 31) * mult;
          mult *= 32;
        } while (b >= 32);
        vals[k] = (result % 2) ? -(result + 1) / 2 : result / 2;
      }
      lat += vals[0];
      lon += vals[1];
      out.push([lat / factor, lon / factor]);
    }
    return out;
  }

  /** Gegenstück zu decodePolyline (für Tests und Testdaten). */
  function encodePolyline(points, precision) {
    var factor = Math.pow(10, precision === undefined ? 6 : precision);
    var out = '', pLat = 0, pLon = 0;
    function enc(v) {
      var s = v < 0 ? -2 * v - 1 : 2 * v;
      var r = '';
      while (s >= 32) {
        r += String.fromCharCode((32 | (s % 32)) + 63);
        s = Math.floor(s / 32);
      }
      return r + String.fromCharCode(s + 63);
    }
    for (var i = 0; i < points.length; i++) {
      var lat = Math.round(points[i][0] * factor), lon = Math.round(points[i][1] * factor);
      out += enc(lat - pLat) + enc(lon - pLon);
      pLat = lat; pLon = lon;
    }
    return out;
  }

  function haversine(a, b) {
    var R = 6371008.8, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function lineLength(points) {
    var d = 0;
    for (var i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
    return d;
  }

  // ---------------------------------------------------------------- Orte (Geocoding)

  function cleanStr(s) { return typeof s === 'string' ? s.trim() : ''; }

  /** Ergebnis von Transitous/MOTIS /api/v1/geocode → Ort der App. */
  function placeFromMotis(m) {
    if (!m || num(m.lat) === null || num(m.lon) === null) return null;
    var name = cleanStr(m.name);
    if (m.type === 'ADDRESS' && cleanStr(m.street) && name.indexOf(cleanStr(m.street)) < 0) {
      name = (cleanStr(m.street) + ' ' + cleanStr(m.houseNumber)).trim();
    }
    var areas = Array.isArray(m.areas) ? m.areas : [];
    var def = null, parts = [];
    for (var i = 0; i < areas.length; i++) if (areas[i] && areas[i].default) def = areas[i];
    var city = def ? cleanStr(def.name) : '';
    for (var j = areas.length - 1; j >= 0; j--) {
      var a = areas[j];
      if (!a || !a.name || a.name === name) continue;
      if ((a.matched || a.unique || a.default || a.adminLevel === 4) && parts.indexOf(a.name) < 0 && !/^[0-9]*$/.test(a.name)) parts.push(a.name);
    }
    if (city && cleanStr(m.zip)) {
      var at = parts.indexOf(city);
      if (at >= 0) parts[at] = cleanStr(m.zip) + ' ' + city;
    }
    return {
      name: name || 'Ort',
      detail: parts.slice(0, 3).join(', '),
      lat: m.lat,
      lon: m.lon,
      kind: m.type === 'STOP' ? 'stop' : m.type === 'ADDRESS' ? 'address' : 'place',
      stopId: m.type === 'STOP' && m.id ? String(m.id) : undefined,
      source: 'transitous'
    };
  }

  /** Photon (komoot) GeoJSON-Feature → Ort der App. */
  function placeFromPhoton(f) {
    if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
    var p = f.properties || {};
    var street = cleanStr(p.street), hn = cleanStr(p.housenumber);
    var address = (street + ' ' + hn).trim();
    var name = cleanStr(p.name) || address;
    var city = cleanStr(p.city) || cleanStr(p.town) || cleanStr(p.village) || cleanStr(p.locality) || cleanStr(p.county);
    var detailParts = [];
    if (address && name !== address) detailParts.push(address);
    if (city || p.postcode) detailParts.push((cleanStr(p.postcode) + ' ' + city).trim());
    if (p.state && detailParts.length < 2) detailParts.push(p.state);
    var isStop = p.osm_key === 'public_transport' || p.osm_value === 'bus_stop' || p.osm_value === 'station' || p.osm_value === 'tram_stop' || p.osm_value === 'halt';
    return {
      name: name || city || 'Ort',
      detail: detailParts.filter(Boolean).join(', '),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      kind: isStop ? 'stop' : hn ? 'address' : 'place',
      source: 'photon'
    };
  }

  /** Nominatim (format=jsonv2, addressdetails=1) → Ort der App. */
  function placeFromNominatim(r) {
    if (!r) return null;
    var lat = parseFloat(r.lat), lon = parseFloat(r.lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    var a = r.address || {};
    var street = cleanStr(a.road) || cleanStr(a.pedestrian) || cleanStr(a.footway);
    var hn = cleanStr(a.house_number);
    var city = cleanStr(a.city) || cleanStr(a.town) || cleanStr(a.village) || cleanStr(a.municipality);
    var name = cleanStr(r.name) || (street + ' ' + hn).trim() || cleanStr((r.display_name || '').split(',')[0]);
    var detail = [];
    if (street && name.indexOf(street) < 0) detail.push((street + ' ' + hn).trim());
    if (city) detail.push((cleanStr(a.postcode) + ' ' + city).trim());
    return { name: name || 'Ort', detail: detail.join(', '), lat: lat, lon: lon, kind: hn ? 'address' : 'place', source: 'nominatim' };
  }

  /** "52.52, 13.40" direkt als Koordinate erkennen. */
  function parseCoordinates(text) {
    var m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(text || '');
    if (!m) return null;
    var lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { name: lat.toFixed(5) + ', ' + lon.toFixed(5), detail: 'Koordinate', lat: lat, lon: lon, kind: 'place', source: 'input' };
  }

  function placeKey(p) {
    return p ? (p.stopId || (Number(p.lat).toFixed(5) + ',' + Number(p.lon).toFixed(5))) : '';
  }

  // ---------------------------------------------------------------- Abfrage an MOTIS

  /** Verkehrsmittel für den ÖPNV-Teil. Ab API v5 heißt die S-Bahn SUBURBAN, davor METRO. */
  function transitModesFor(sel, version) {
    var v = version || 6, m = [];
    if (sel.bus) m.push('BUS', 'COACH');
    if (sel.bahn) m.push('TRAM', 'SUBWAY', v >= 5 ? 'SUBURBAN' : 'METRO', 'FUNICULAR');
    if (sel.zug) m.push('REGIONAL_RAIL', 'LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL');
    if (sel.bus && sel.bahn && sel.zug) m.push('FERRY', v >= 5 ? 'AERIAL_LIFT' : 'AREAL_LIFT');
    return m;
  }

  function hasTransit(sel) { return !!(sel && (sel.bus || sel.bahn || sel.zug)); }
  function streetChoices(sel) {
    var out = [];
    ['walk', 'bike', 'car'].forEach(function (k) { if (sel && sel[k]) out.push(k); });
    return out;
  }

  /**
   * Wie man zur ersten Haltestelle kommt und von der letzten weiter.
   * level 0: wie ausgewählt (Auto = Park+Ride), 1: Auto ohne Parkplatzsuche, 2: nur zu Fuß.
   */
  function accessModesFor(sel, level) {
    level = level || 0;
    var pre = [], post = [], bikeAlong = false;
    if (level < 2) {
      if (sel.walk) { pre.push('WALK'); post.push('WALK'); }
      if (sel.bike) {
        pre.push('BIKE');
        if (!sel.walk) { post.push('BIKE'); bikeAlong = true; }
      }
      if (sel.car) pre.push(level === 0 ? 'CAR_PARKING' : 'CAR');
    }
    if (!pre.length) pre.push('WALK');
    if (!post.length) post.push('WALK');
    return { pre: pre, post: post, requireBikeTransport: bikeAlong };
  }

  function placeParam(p) {
    if (p.stopId) return p.stopId;
    return Number(p.lat).toFixed(6) + ',' + Number(p.lon).toFixed(6);
  }

  function qs(params) {
    var parts = [];
    for (var i = 0; i < params.length; i++) {
      var k = params[i][0], v = params[i][1];
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (!v.length) continue;
        v = v.map(encodeURIComponent).join(',');
      } else {
        v = encodeURIComponent(String(v));
      }
      parts.push(k + '=' + v);
    }
    return parts.join('&');
  }

  /**
   * URL für /api/vX/plan.
   * q = { from, to, time: Date, arriveBy, sel, settings, pageCursor }
   * opts = { version, accessLevel, minimal }
   */
  function motisPlanUrl(base, q, opts) {
    opts = opts || {};
    var version = opts.version || 6;
    var s = withDefaults(q.settings);
    var acc = accessModesFor(q.sel, opts.accessLevel || 0);
    var walkSec = clamp(s.maxWalkMin, 5, 60) * 60;
    var preSec = acc.pre.length === 1 && acc.pre[0] === 'WALK' ? walkSec : Math.max(walkSec, 1800);
    var postSec = acc.post.length === 1 && acc.post[0] === 'WALK' ? walkSec : Math.max(walkSec, 1800);
    var params = [
      ['fromPlace', placeParam(q.from)],
      ['toPlace', placeParam(q.to)],
      ['time', (toDate(q.time) || new Date()).toISOString()],
      ['arriveBy', q.arriveBy ? 'true' : 'false'],
      ['transitModes', transitModesFor(q.sel, version)],
      ['preTransitModes', acc.pre],
      ['postTransitModes', acc.post]
    ];
    if (!opts.minimal) {
      params.push(['maxPreTransitTime', preSec]);
      params.push(['maxPostTransitTime', postSec]);
      if (acc.requireBikeTransport) params.push(['requireBikeTransport', 'true']);
      if (s.pace !== 'normal') params.push(['pedestrianSpeed', PACE[s.pace].motis]);
      if (s.wheelchair) params.push(['pedestrianProfile', 'WHEELCHAIR']);
      if (s.maxTransfers >= 0) params.push(['maxTransfers', version >= 3 ? s.maxTransfers : s.maxTransfers + 1]);
      params.push(['numItineraries', 6]);
      params.push(['language', 'de']);
    }
    if (q.pageCursor) params.push(['pageCursor', q.pageCursor]);
    return base.replace(/\/$/, '') + '/api/v' + version + '/plan?' + qs(params);
  }

  function motisGeocodeUrl(base, text, bias) {
    var params = [['text', text], ['language', 'de'], ['numResults', 8]];
    if (bias) params.push(['place', Number(bias.lat).toFixed(5) + ',' + Number(bias.lon).toFixed(5)]);
    return base.replace(/\/$/, '') + '/api/v1/geocode?' + qs(params);
  }

  function motisReverseUrl(base, lat, lon) {
    return base.replace(/\/$/, '') + '/api/v1/reverse-geocode?' + qs([['place', lat.toFixed(6) + ',' + lon.toFixed(6)], ['numResults', 3]]);
  }

  function photonUrl(text, bias) {
    var params = [['q', text], ['limit', 8], ['lang', 'de']];
    if (bias) { params.push(['lat', Number(bias.lat).toFixed(4)]); params.push(['lon', Number(bias.lon).toFixed(4)]); }
    return 'https://photon.komoot.io/api/?' + qs(params);
  }

  function photonReverseUrl(lat, lon) {
    return 'https://photon.komoot.io/reverse?' + qs([['lat', lat.toFixed(6)], ['lon', lon.toFixed(6)], ['lang', 'de'], ['limit', 1]]);
  }

  function nominatimUrl(text) {
    return 'https://nominatim.openstreetmap.org/search?' + qs([['q', text], ['format', 'jsonv2'], ['addressdetails', 1], ['limit', 6], ['accept-language', 'de']]);
  }

  // ---------------------------------------------------------------- Abfrage für direkte Wege

  var VALHALLA_COSTING = { walk: 'pedestrian', bike: 'bicycle', car: 'auto' };
  var OSRM_PROFILE = { walk: 'foot', bike: 'bike', car: 'car' };

  function valhallaUrl(from, to, mode, settings) {
    var s = withDefaults(settings);
    var req = {
      locations: [{ lat: +from.lat, lon: +from.lon }, { lat: +to.lat, lon: +to.lon }],
      costing: VALHALLA_COSTING[mode],
      directions_options: { units: 'kilometers', language: 'de-DE' }
    };
    if (mode === 'walk') {
      var ped = { walking_speed: PACE[s.pace].valhalla };
      if (s.wheelchair) ped.type = 'wheelchair';
      req.costing_options = { pedestrian: ped };
    }
    return 'https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(req));
  }

  function osrmUrl(from, to, mode) {
    return 'https://routing.openstreetmap.de/routed-' + OSRM_PROFILE[mode] + '/route/v1/driving/' +
      (+from.lon).toFixed(6) + ',' + (+from.lat).toFixed(6) + ';' + (+to.lon).toFixed(6) + ',' + (+to.lat).toFixed(6) +
      '?overview=full&geometries=polyline6&steps=true';
  }

  // ---------------------------------------------------------------- Wegbeschreibung auf Deutsch

  var DIRECTION = {
    DEPART: 'Los geht’s',
    CONTINUE: 'Geradeaus weiter',
    SLIGHTLY_LEFT: 'Leicht links halten',
    LEFT: 'Links abbiegen',
    HARD_LEFT: 'Scharf links abbiegen',
    SLIGHTLY_RIGHT: 'Leicht rechts halten',
    RIGHT: 'Rechts abbiegen',
    HARD_RIGHT: 'Scharf rechts abbiegen',
    CIRCLE_CLOCKWISE: 'In den Kreisverkehr',
    CIRCLE_COUNTERCLOCKWISE: 'In den Kreisverkehr',
    STAIRS: 'Treppe nehmen',
    ELEVATOR: 'Aufzug nehmen',
    UTURN_LEFT: 'Wenden',
    UTURN_RIGHT: 'Wenden'
  };

  function niceStreet(name) {
    var n = cleanStr(name);
    if (!n || /^(way|path|footway|service|unnamed|null)$/i.test(n)) return '';
    return n;
  }

  function motisStepText(step) {
    var street = niceStreet(step.streetName);
    var dir = step.relativeDirection;
    if (dir === 'DEPART') return street ? 'Starte auf ' + street : 'Los geht’s';
    if (dir === 'CONTINUE') return street ? 'Weiter auf ' + street : 'Geradeaus weiter';
    if (dir === 'STAIRS' || dir === 'ELEVATOR') return DIRECTION[dir] + (street ? ' (' + street + ')' : '');
    var base = DIRECTION[dir] || 'Weiter';
    return street ? base + ' auf ' + street : base;
  }

  /** MOTIS-Schritte → Liste mit Text und Strecke; gleiche Straße hintereinander wird zusammengefasst. */
  function motisSteps(steps) {
    var out = [];
    if (!Array.isArray(steps)) return out;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i] || {};
      var dist = num(s.distance) || 0;
      var street = niceStreet(s.streetName);
      var prev = out[out.length - 1];
      if (prev && (s.relativeDirection === 'CONTINUE' || !s.relativeDirection) && prev.street === street) {
        prev.distance += dist;
        continue;
      }
      if (prev && dist < 3 && s.relativeDirection !== 'STAIRS' && s.relativeDirection !== 'ELEVATOR') {
        prev.distance += dist;
        continue;
      }
      out.push({ text: motisStepText(s), distance: dist, street: street });
    }
    return out.map(function (s) { return { text: s.text, distance: s.distance }; });
  }

  var OSRM_MOD = {
    uturn: 'wenden', 'sharp right': 'scharf rechts', right: 'rechts', 'slight right': 'leicht rechts',
    straight: 'geradeaus', 'slight left': 'leicht links', left: 'links', 'sharp left': 'scharf links'
  };

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function osrmStepText(st) {
    var m = st.maneuver || {};
    var name = cleanStr(st.name) || cleanStr(st.ref);
    var on = name ? ' auf ' + name : '';
    var mod = OSRM_MOD[m.modifier] || '';
    switch (m.type) {
      case 'depart': return name ? 'Starte auf ' + name : 'Los geht’s';
      case 'arrive': return 'Ziel erreicht';
      case 'roundabout':
      case 'rotary':
        return 'Im Kreisverkehr die ' + (m.exit || 1) + '. Ausfahrt nehmen' + on;
      case 'roundabout turn': return mod ? 'Im Kreisverkehr ' + mod + on : 'Durch den Kreisverkehr' + on;
      case 'exit roundabout':
      case 'exit rotary': return 'Kreisverkehr verlassen' + on;
      case 'merge': return 'Einfädeln' + on;
      case 'on ramp': return 'Auffahrt nehmen' + on;
      case 'off ramp': return 'Ausfahrt nehmen' + on;
      case 'fork': return 'An der Gabelung ' + (mod || 'weiter') + ' halten' + on;
      case 'end of road': return 'Am Ende der Straße ' + (mod || 'weiter') + (mod ? ' abbiegen' : '') + on;
      case 'new name':
      case 'continue':
        if (m.modifier && m.modifier !== 'straight' && m.modifier !== 'uturn') return cap(mod) + ' halten' + on;
        return 'Weiter' + on;
      default:
        if (m.modifier === 'uturn') return 'Wenden' + on;
        if (m.modifier === 'straight') return 'Geradeaus' + on;
        return mod ? cap(mod) + ' abbiegen' + on : 'Weiter' + on;
    }
  }

  // ---------------------------------------------------------------- Antworten auswerten

  function lineName(l) {
    var n = cleanStr(l.displayName) || cleanStr(l.routeShortName) || cleanStr(l.tripShortName);
    var info = modeInfo(l.mode);
    if (!n) return info.label;
    if (/^\d/.test(n)) {
      if (info.cat === 'bus') n = 'Bus ' + n;
      else if (l.mode === 'TRAM') n = 'Tram ' + n;
      else if (l.mode === 'SUBWAY') n = 'U' + n;
      else if (l.mode === 'SUBURBAN' || l.mode === 'METRO') n = 'S' + n;
      else if (l.mode === 'FERRY') n = 'Fähre ' + n;
    }
    return n;
  }

  function hexColor(c) {
    c = cleanStr(c).replace(/^#/, '');
    return /^[0-9a-fA-F]{6}$/.test(c) ? '#' + c.toLowerCase() : null;
  }

  function placeOut(p) {
    p = p || {};
    return {
      name: cleanStr(p.name) || 'Unbekannt',
      lat: num(p.lat), lon: num(p.lon),
      track: cleanStr(p.track) || cleanStr(p.scheduledTrack) || '',
      trackChanged: !!(p.track && p.scheduledTrack && p.track !== p.scheduledTrack),
      stopId: p.stopId || undefined,
      cancelled: !!p.cancelled
    };
  }

  function alertsOut(list) {
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function (a) {
      if (!a) return;
      var title = cleanStr(a.headerText), text = cleanStr(a.descriptionText);
      var key = title + '|' + text;
      if ((!title && !text) || seen[key]) return;
      seen[key] = 1;
      out.push({ title: title || 'Hinweis', text: text === title ? '' : text, url: cleanStr(a.url) });
    });
    return out;
  }

  /** Strecke eines Wegstücks: Angabe der API, sonst Schritte, sonst Linie, sonst Luftlinie. */
  function legDistance(given, steps, geometry, from, to) {
    if (num(given) !== null && given > 0) return given;
    var sum = 0;
    (steps || []).forEach(function (s) { sum += s.distance || 0; });
    if (sum > 0) return sum;
    if (geometry && geometry.length > 2) return lineLength(geometry);
    if (from && to && from.lat !== null && to.lat !== null) return haversine([from.lat, from.lon], [to.lat, to.lon]) * 1.25;
    return null;
  }

  function motisLeg(l) {
    var info = modeInfo(l.mode);
    var street = isStreetMode(l.mode);
    var from = placeOut(l.from), to = placeOut(l.to);
    var geometry = [];
    if (l.legGeometry && l.legGeometry.points) {
      geometry = decodePolyline(l.legGeometry.points, l.legGeometry.precision || 6);
    }
    if (geometry.length < 2 && from.lat !== null && to.lat !== null) geometry = [[from.lat, from.lon], [to.lat, to.lon]];
    var steps = street ? motisSteps(l.steps) : [];
    var start = toDate(l.startTime), end = toDate(l.endTime);
    var sStart = toDate(l.scheduledStartTime) || start, sEnd = toDate(l.scheduledEndTime) || end;
    var duration = num(l.duration);
    if (duration === null && start && end) duration = (end - start) / 1000;
    var leg = {
      type: street ? info.cat : 'transit',
      cat: info.cat,
      mode: l.mode,
      label: info.label,
      name: street ? info.label : lineName(l),
      headsign: cleanStr(l.headsign) || (l.tripTo ? cleanStr(l.tripTo.name) : ''),
      agency: cleanStr(l.agencyName),
      color: hexColor(l.routeColor),
      textColor: hexColor(l.routeTextColor),
      from: from,
      to: to,
      start: start,
      end: end,
      scheduledStart: sStart,
      scheduledEnd: sEnd,
      realTime: !!l.realTime,
      delayStart: l.realTime ? delayMinutes(start, sStart) : null,
      delayEnd: l.realTime ? delayMinutes(end, sEnd) : null,
      cancelled: !!l.cancelled,
      duration: duration || 0,
      geometry: geometry,
      steps: steps,
      stops: [],
      alerts: alertsOut(l.alerts),
      interline: !!l.interlineWithPreviousLeg,
      bikesAllowed: l.bikesAllowed
    };
    leg.distance = street ? legDistance(l.distance, steps, geometry, from, to) : (geometry.length > 2 ? lineLength(geometry) : null);
    if (!street && Array.isArray(l.intermediateStops)) {
      leg.stops = l.intermediateStops.map(function (p) {
        var arr = toDate(p.arrival) || toDate(p.departure);
        var sched = toDate(p.scheduledArrival) || toDate(p.scheduledDeparture) || arr;
        return { name: cleanStr(p.name) || 'Halt', time: arr, scheduled: sched, track: cleanStr(p.track), cancelled: !!p.cancelled };
      });
    }
    return leg;
  }

  function motisItinerary(it) {
    var legs = (it.legs || []).map(motisLeg);
    var start = toDate(it.startTime) || (legs[0] && legs[0].start);
    var end = toDate(it.endTime) || (legs.length && legs[legs.length - 1].end);
    var transit = legs.filter(function (l) { return l.type === 'transit'; });
    return {
      kind: transit.length ? 'transit' : 'direct',
      mode: transit.length ? null : (legs[0] ? legs[0].cat : 'walk'),
      id: cleanStr(it.id) || legs.map(function (l) { return l.mode + '@' + (l.start ? l.start.getTime() : ''); }).join('|'),
      start: start,
      end: end,
      duration: num(it.duration) !== null ? it.duration : (start && end ? (end - start) / 1000 : 0),
      transfers: num(it.transfers) !== null ? it.transfers : Math.max(0, transit.length - 1),
      distance: null,
      legs: legs,
      source: 'transitous'
    };
  }

  /** MOTIS nennt Koordinaten "START"/"END" – durch die Namen aus der Suche ersetzen. */
  function renamePlaces(route, names) {
    if (!names) return route;
    route.legs.forEach(function (l) {
      [l.from, l.to].forEach(function (p) {
        if (p.name === 'START' && names.from) p.name = names.from;
        if (p.name === 'END' && names.to) p.name = names.to;
      });
    });
    return route;
  }

  /** Ganze /plan-Antwort. names = { from, to } (optional) */
  function parseMotisPlan(json, names) {
    if (!json || typeof json !== 'object') throw new Error('Leere Antwort der Fahrplanauskunft');
    var its = Array.isArray(json.itineraries) ? json.itineraries : [];
    var direct = Array.isArray(json.direct) ? json.direct : [];
    function conv(it) { return renamePlaces(motisItinerary(it), names); }
    return {
      itineraries: its.map(conv).filter(function (r) { return r.legs.length; }),
      direct: direct.map(conv).filter(function (r) { return r.legs.length; }),
      previousPageCursor: json.previousPageCursor || null,
      nextPageCursor: json.nextPageCursor || null
    };
  }

  /** Direkter Weg (ohne ÖPNV) aus einer Strecke + Dauer. */
  function directRoute(mode, data, from, to, source) {
    var info = { walk: 'Fußweg', bike: 'Fahrrad', car: 'Auto' }[mode];
    var leg = {
      type: mode, cat: mode, mode: { walk: 'WALK', bike: 'BIKE', car: 'CAR' }[mode], label: info, name: info,
      headsign: '', agency: '', color: null, textColor: null,
      from: { name: from.name || 'Start', lat: +from.lat, lon: +from.lon, track: '' },
      to: { name: to.name || 'Ziel', lat: +to.lat, lon: +to.lon, track: '' },
      start: null, end: null, scheduledStart: null, scheduledEnd: null, realTime: false,
      delayStart: null, delayEnd: null, cancelled: false,
      duration: data.duration, distance: data.distance, geometry: data.geometry,
      steps: data.steps, stops: [], alerts: [], interline: false
    };
    return {
      kind: 'direct', mode: mode, id: 'direct-' + mode, start: null, end: null,
      duration: data.duration, transfers: 0, distance: data.distance, legs: [leg], source: source
    };
  }

  function parseValhalla(json, mode, from, to) {
    if (!json || !json.trip || !Array.isArray(json.trip.legs) || !json.trip.legs.length) {
      var msg = json && (json.error || json.status_message);
      throw new Error(msg ? String(msg) : 'Keine Route gefunden');
    }
    var trip = json.trip, factor = trip.units === 'miles' ? 1609.344 : 1000;
    var geometry = [], steps = [], duration = 0, distance = 0;
    trip.legs.forEach(function (leg) {
      geometry = geometry.concat(decodePolyline(leg.shape, 6));
      (leg.maneuvers || []).forEach(function (m) {
        if (!m.instruction) return;
        steps.push({ text: String(m.instruction).replace(/\.$/, ''), distance: (num(m.length) || 0) * factor });
      });
    });
    if (trip.summary) {
      duration = num(trip.summary.time) || 0;
      distance = (num(trip.summary.length) || 0) * factor;
    }
    if (!distance) distance = lineLength(geometry);
    return directRoute(mode, { duration: duration, distance: distance, geometry: geometry, steps: steps }, from, to, 'valhalla');
  }

  function parseOsrm(json, mode, from, to) {
    if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || !json.routes.length) {
      throw new Error(json && json.message ? String(json.message) : 'Keine Route gefunden');
    }
    var r = json.routes[0];
    var geometry = typeof r.geometry === 'string' ? decodePolyline(r.geometry, 6)
      : (r.geometry && Array.isArray(r.geometry.coordinates) ? r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) : []);
    var steps = [];
    (r.legs || []).forEach(function (leg) {
      (leg.steps || []).forEach(function (st) {
        steps.push({ text: osrmStepText(st), distance: num(st.distance) || 0 });
      });
    });
    return directRoute(mode, { duration: num(r.duration) || 0, distance: num(r.distance) || lineLength(geometry), geometry: geometry, steps: steps }, from, to, 'osrm');
  }

  // ---------------------------------------------------------------- Zusammenfassung einer Route

  function isTrivialStreetLeg(l) {
    return l.type !== 'transit' && (l.duration || 0) < 60 && (l.distance === null || (l.distance || 0) < 40);
  }

  /** Legt Start/Ende eines direkten Wegs fest (Abfahrt ab Zeit oder Ankunft bis Zeit). */
  function timeDirectRoute(route, time, arriveBy) {
    var t = toDate(time) || new Date();
    var start = arriveBy ? new Date(t.getTime() - route.duration * 1000) : t;
    var end = new Date(start.getTime() + route.duration * 1000);
    route.start = start; route.end = end;
    route.legs.forEach(function (l) { l.start = start; l.end = end; l.scheduledStart = start; l.scheduledEnd = end; });
    return route;
  }

  // ---------------------------------------------------------------- Zeitwunsch

  /*
   * Zeitwunsch = wann man losgehen kann/will und wann man da sein muss/will:
   *   dep: 'now'  – jetzt los
   *        'from' – kann frühestens ab depTime los
   *        'at'   – will möglichst um depTime los
   *   arr: 'any'    – egal
   *        'by'     – muss spätestens um arrTime da sein
   *        'around' – will möglichst gegen arrTime da sein
   */
  var AROUND_MS = 10 * 60000;

  function normSpec(spec) {
    spec = spec || {};
    var s = {
      dep: spec.dep === 'from' || spec.dep === 'at' ? spec.dep : 'now',
      arr: spec.arr === 'by' || spec.arr === 'around' ? spec.arr : 'any',
      depTime: toDate(spec.depTime),
      arrTime: toDate(spec.arrTime)
    };
    if (s.dep !== 'now' && !s.depTime) s.dep = 'now';
    if (s.arr !== 'any' && !s.arrTime) s.arr = 'any';
    return s;
  }

  /** Prüft einen Zeitwunsch; Rückgabe: Fehlertext oder ''. */
  function checkSpec(spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    if (spec && spec.dep && spec.dep !== 'now' && !s.depTime) return 'Bitte gib an, wann du losgehen willst.';
    if (spec && spec.arr && spec.arr !== 'any' && !s.arrTime) return 'Bitte gib an, wann du da sein willst.';
    if (s.arr !== 'any' && s.arrTime < now - 60000) return 'Die Ankunftszeit liegt in der Vergangenheit.';
    if (s.arr !== 'any' && s.dep !== 'now' && s.arrTime <= s.depTime) return '„Da sein“ muss nach „Losgehen“ liegen.';
    return '';
  }

  /** Frühester Zeitpunkt, zu dem man los kann (nie in der Vergangenheit). */
  function earliestLeave(spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    if (s.dep === 'from' && s.depTime > now) return s.depTime;
    return now;
  }

  /** Abfragezeit für die Fahrplanauskunft. */
  function specQuery(spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    if (s.arr === 'by') return { time: s.arrTime, arriveBy: true };
    if (s.arr === 'around') return { time: new Date(s.arrTime.getTime() + AROUND_MS), arriveBy: true };
    if (s.dep === 'from') return { time: s.depTime, arriveBy: false };
    if (s.dep === 'at') return { time: new Date(Math.max(now.getTime(), s.depTime.getTime() - AROUND_MS)), arriveBy: false };
    return { time: now, arriveBy: false };
  }

  /** Zweite Abfrage, falls bis zur Frist nichts passt: ab frühestmöglichem Losgehen. */
  function specFallbackQuery(spec, now) {
    return { time: earliestLeave(spec, now), arriveBy: false };
  }

  /** Direkten Weg (zu Fuß/Rad/Auto) passend zum Zeitwunsch einplanen. */
  function timeDirectSpec(route, spec, now) {
    var s = normSpec(spec);
    var earliest = earliestLeave(s, now);
    var dur = (route.duration || 0) * 1000;
    var start;
    if (s.arr !== 'any') {
      start = new Date(s.arrTime.getTime() - dur);
      if (start < earliest) start = earliest;
    } else if (s.dep === 'now') {
      start = toDate(now) || new Date();
    } else {
      start = s.depTime < earliest ? earliest : s.depTime;
    }
    return timeDirectRoute(route, start, false);
  }

  /**
   * Passt eine Route zum Zeitwunsch?
   * { ok, code: 'ok'|'missed'|'early'|'late', text, lateMin, spareMin }
   */
  function judgeRoute(route, spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    var res = { ok: true, code: 'ok', text: '', lateMin: 0, spareMin: null };
    if (!route || !route.start || !route.end) return res;
    if (s.arr === 'by') res.spareMin = Math.floor((s.arrTime - route.end) / 60000);
    if (route.start < now.getTime() - 60000) {
      res.ok = false; res.code = 'missed'; res.text = 'schon vorbei';
    } else if (s.dep === 'from' && route.start < s.depTime.getTime() - 60000) {
      res.ok = false; res.code = 'early'; res.text = 'vor ' + fmtTime(s.depTime);
    } else if (s.arr === 'by' && route.end > s.arrTime.getTime() + 30000) {
      res.ok = false; res.code = 'late';
      res.lateMin = Math.ceil((route.end - s.arrTime) / 60000);
      res.text = fmtDuration(res.lateMin * 60) + ' zu spät';
    }
    return res;
  }

  /**
   * Die Route, die am besten zum Zeitwunsch passt:
   * Frist → so spät wie möglich los; "gegen" → am nächsten an der Wunschzeit;
   * sonst → am frühesten da.
   */
  function bestRoute(routes, spec, now) {
    var s = normSpec(spec);
    var fits = (routes || []).filter(function (r) { return r && r.start && judgeRoute(r, s, now).ok; });
    if (!fits.length) return null;
    function score(r) {
      if (s.arr === 'by') return -r.start.getTime() / 60000 + (r.end.getTime() / 60000) * 1e-3;
      if (s.arr === 'around') {
        var d = (r.end - s.arrTime) / 60000;
        return d > 0 ? d * 1.5 : -d;
      }
      if (s.dep === 'at') return Math.abs(r.start - s.depTime) / 60000 + (r.end.getTime() / 60000) * 1e-4;
      return r.end.getTime() / 60000 - (r.start.getTime() / 60000) * 1e-3;
    }
    var best = fits[0], bestScore = score(best);
    for (var i = 1; i < fits.length; i++) {
      var sc = score(fits[i]);
      if (sc < bestScore) { best = fits[i]; bestScore = sc; }
    }
    return best;
  }

  /** Früheste mögliche Ankunft (für "nicht zu schaffen"). */
  function earliestArrival(routes, spec, now) {
    var earliest = earliestLeave(spec, now);
    var cand = (routes || []).filter(function (r) { return r && r.start && r.start >= earliest.getTime() - 60000; });
    if (!cand.length) return null;
    return cand.reduce(function (a, b) { return b.end < a.end ? b : a; });
  }

  function dayTime(d, now) {
    var day = fmtDay(d, now);
    return (day === 'heute' ? '' : day + ' ') + fmtTime(d);
  }

  /** Kurzbeschreibung des Zeitwunschs, z. B. "Los ab 08:00 · da bis 09:00". */
  function describeSpec(spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    var parts = [];
    if (s.dep === 'now') parts.push(s.arr === 'any' ? 'Jetzt, ' + fmtTime(now) : 'Los ab jetzt');
    else parts.push((s.dep === 'from' ? 'Los ab ' : 'Los um ') + dayTime(s.depTime, now));
    if (s.arr === 'by') parts.push('da bis ' + dayTime(s.arrTime, now));
    if (s.arr === 'around') parts.push('da gegen ' + dayTime(s.arrTime, now));
    return parts.join(' · ');
  }

  /** Erklärsatz unter der Zeitauswahl. */
  function explainSpec(spec, now) {
    var s = normSpec(spec);
    now = toDate(now) || new Date();
    var dep = s.dep === 'now' ? '' : dayTime(s.depTime, now);
    var arr = s.arr === 'any' ? '' : dayTime(s.arrTime, now);
    if (s.arr === 'any') {
      if (s.dep === 'now') return 'Du willst jetzt los – du siehst die nächsten Verbindungen.';
      if (s.dep === 'from') return 'Du kannst frühestens um ' + dep + ' los – du siehst die Verbindungen ab dann.';
      return 'Du willst um ' + dep + ' los – die Verbindung, die am besten dazu passt, wird markiert.';
    }
    var head = s.dep === 'now' ? 'Du kannst ab jetzt los' : s.dep === 'from' ? 'Du kannst ab ' + dep + ' los' : 'Du willst um ' + dep + ' los';
    if (s.arr === 'by') return head + ' und musst spätestens um ' + arr + ' da sein. Die App zeigt dir, wann du spätestens losgehen musst.';
    return head + ' und willst gegen ' + arr + ' da sein. Die App markiert die Verbindung, die am besten passt.';
  }

  // ---------------------------------------------------------------- Favoriten

  /*
   * Favorit = { id, kind: 'home'|'work'|'other', label, place }
   * Zuhause und Arbeit gibt es höchstens einmal; eigene Favoriten beliebig viele.
   */
  var FAV_KIND = {
    home: { label: 'Zuhause', icon: 'home' },
    work: { label: 'Arbeit', icon: 'work' },
    other: { label: 'Favorit', icon: 'star' }
  };

  function favLabel(f) {
    if (!f) return '';
    if (f.kind === 'home' || f.kind === 'work') return FAV_KIND[f.kind].label;
    return cleanStr(f.label) || (f.place ? f.place.name : '') || 'Favorit';
  }

  function cleanPlace(p) {
    if (!p || num(+p.lat) === null || num(+p.lon) === null) return null;
    var out = { name: cleanStr(p.name) || 'Ort', detail: cleanStr(p.detail), lat: +p.lat, lon: +p.lon, kind: p.kind || 'place' };
    if (p.kind === 'here') {
      // Standort als Favorit: die Adresse aus der Standortsuche wird zum Namen
      var parts = out.detail.split(',');
      out.name = cleanStr(parts.shift()) || 'Gespeicherter Standort';
      out.detail = parts.join(',').trim();
      out.kind = 'address';
    }
    if (p.stopId) out.stopId = String(p.stopId);
    return out;
  }

  /** Favoriten aufräumen und sortieren: Zuhause, Arbeit, dann eigene in Reihenfolge. */
  function normFavs(list) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (f) {
      if (!f || !f.place) return;
      var kind = f.kind === 'home' || f.kind === 'work' ? f.kind : 'other';
      var id = kind === 'other' ? String(f.id || '') : kind;
      var place = cleanPlace(f.place);
      if (!id || !place || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, kind: kind, label: kind === 'other' ? cleanStr(f.label) || place.name : FAV_KIND[kind].label, place: place });
    });
    var rank = { home: 0, work: 1, other: 2 };
    return out.map(function (f, i) { return [f, i]; })
      .sort(function (a, b) { return (rank[a[0].kind] - rank[b[0].kind]) || (a[1] - b[1]); })
      .map(function (x) { return x[0]; });
  }

  /** Favorit speichern; ersetzt Zuhause/Arbeit bzw. denselben eigenen Favoriten. */
  function upsertFav(list, fav, newId) {
    var kind = fav.kind === 'home' || fav.kind === 'work' ? fav.kind : 'other';
    var id = kind === 'other' ? (fav.id && fav.id !== 'home' && fav.id !== 'work' ? fav.id : newId || 'f' + Date.now()) : kind;
    var entry = { id: id, kind: kind, label: kind === 'other' ? cleanStr(fav.label) : FAV_KIND[kind].label, place: fav.place };
    // alten Eintrag entfernen, falls der Favorit die Art gewechselt hat (z. B. eigener → Zuhause)
    var favs = normFavs(list).filter(function (f) { return !(fav.id && f.id === fav.id && f.id !== id); });
    var found = false;
    favs = favs.map(function (f) {
      if (f.id !== id) return f;
      found = true;
      return entry;
    });
    if (!found) favs.push(entry);
    return normFavs(favs);
  }

  function removeFav(list, id) {
    return normFavs(list).filter(function (f) { return f.id !== id; });
  }

  /** Favorit zu einem Ort (gleiche Haltestelle oder näher als 30 m). */
  function findFav(list, place) {
    if (!place || place.kind === 'here') return null;
    var favs = normFavs(list);
    for (var i = 0; i < favs.length; i++) {
      var p = favs[i].place;
      if ((place.stopId && p.stopId === place.stopId) || haversine([p.lat, p.lon], [+place.lat, +place.lon]) < 30) return favs[i];
    }
    return null;
  }

  /** Favoriten passend zur Eingabe ("zu" → Zuhause, "Haupt" → Hauptstraße 5 …). */
  function matchFavs(list, text) {
    var t = cleanStr(text).toLowerCase();
    var favs = normFavs(list);
    if (!t) return favs;
    return favs.filter(function (f) {
      return favLabel(f).toLowerCase().indexOf(t) >= 0 || f.place.name.toLowerCase().indexOf(t) >= 0;
    });
  }

  /** Ort aus einem Favoriten für Start/Ziel (mit Favoriten-Namen). */
  function favPlace(f) {
    var p = cleanPlace(f.place);
    p.fav = favLabel(f);
    p.favId = f.id;
    return p;
  }

  // ---------------------------------------------------------------- Google Maps

  var GMAPS_MODE = { walk: 'walking', bike: 'bicycling', car: 'driving', transit: 'transit' };
  var GMAPS_NAV = { walk: 'w', bike: 'b', car: 'd' };
  var GMAPS_PACKAGE = 'com.google.android.apps.maps';

  function coord(p) { return Number(p.lat).toFixed(6) + ',' + Number(p.lon).toFixed(6); }

  /** Route in Google Maps (App oder Web) anzeigen – Maps-URLs mit api=1. */
  function gmapsDirUrl(from, to, mode, navigate) {
    var params = [['api', 1]];
    if (from) params.push(['origin', coord(from)]);
    params.push(['destination', coord(to)]);
    params.push(['travelmode', GMAPS_MODE[mode] || 'transit']);
    if (navigate) params.push(['dir_action', 'navigate']);
    return 'https://www.google.com/maps/dir/?' + qs(params);
  }

  /** Navigation in der Google-Maps-App direkt starten (vom aktuellen Standort aus). */
  function gmapsNavUri(to, mode) {
    return 'google.navigation:q=' + coord(to) + '&mode=' + (GMAPS_NAV[mode] || 'w');
  }

  /**
   * Das, was man vor dem Losgehen wissen will:
   * Wann muss ich los? Wie weit/wie viele Schritte bis zur Haltestelle? Wann kommt die Bahn?
   */
  function analyzeRoute(route, settings) {
    var s = withDefaults(settings);
    var legs = route.legs || [];
    var firstIdx = -1;
    for (var i = 0; i < legs.length; i++) if (legs[i].type === 'transit') { firstIdx = i; break; }
    var walk = { distance: 0, duration: 0, steps: 0 };
    legs.forEach(function (l) {
      if (l.type === 'walk') { walk.distance += l.distance || 0; walk.duration += l.duration || 0; }
    });
    walk.steps = stepsFor(walk.distance, s.strideCm);

    var res = {
      firstTransit: firstIdx >= 0 ? legs[firstIdx] : null,
      transitLegs: legs.filter(function (l) { return l.type === 'transit'; }),
      access: null,
      leaveAt: route.start,
      waitAtStop: 0,
      walk: walk,
      bufferMin: 0
    };

    if (firstIdx >= 0) {
      var ft = legs[firstIdx];
      var accLegs = legs.slice(0, firstIdx).filter(function (l) { return !isTrivialStreetLeg(l); });
      var accDur = 0, accDist = 0, accType = null;
      accLegs.forEach(function (l) {
        accDur += l.duration || 0;
        accDist += l.distance || 0;
        if (!accType || l.type !== 'walk') accType = l.type;
      });
      var accWalkDist = 0;
      accLegs.forEach(function (l) { if (l.type === 'walk') accWalkDist += l.distance || 0; });
      if (accLegs.length) {
        res.access = {
          type: accType,
          duration: accDur,
          distance: accDist,
          steps: stepsFor(accType === 'walk' ? accDist : accWalkDist, s.strideCm),
          toName: ft.from.name,
          toTrack: ft.from.track
        };
      }
      var buffer = res.access ? s.bufferMin * 60 : 0;
      res.bufferMin = res.access ? s.bufferMin : 0;
      if (ft.start) {
        res.leaveAt = new Date(ft.start.getTime() - (accDur + buffer) * 1000);
        if (route.start) res.waitAtStop = Math.max(0, Math.round((ft.start - route.start) / 1000 - accDur));
      }
    }
    return res;
  }

  /**
   * Weg zur ersten Haltestelle so legen, dass man genau rechtzeitig (plus Puffer) ankommt.
   * Danach stimmen Losgeh-Zeit, Startzeit der Verbindung und Zeitleiste überein – auch wenn
   * die Bahn laut Echtzeit später fährt als geplant.
   */
  function alignRoute(route, settings) {
    var a = analyzeRoute(route, settings);
    var ft = a.firstTransit;
    if (!ft || !ft.start) return route;
    var idx = route.legs.indexOf(ft);
    var legs = route.legs.slice();
    var t = ft.start.getTime() - a.bufferMin * 60000;
    for (var i = idx - 1; i >= 0; i--) {
      var c = {}, l = legs[i];
      for (var k in l) c[k] = l[k];
      c.end = new Date(t);
      c.start = new Date(t - (l.duration || 0) * 1000);
      c.scheduledStart = c.start;
      c.scheduledEnd = c.end;
      t = c.start.getTime();
      legs[i] = c;
    }
    var r = {};
    for (var key in route) r[key] = route[key];
    r.legs = legs;
    r.start = idx > 0 ? a.leaveAt : ft.start;
    if (r.end) r.duration = Math.round((r.end - r.start) / 1000);
    return r;
  }

  /** Umstiegszeit vor jedem ÖPNV-Abschnitt (ab dem zweiten). */
  function transferTimes(route) {
    var out = {}, lastEnd = null;
    (route.legs || []).forEach(function (l, i) {
      if (l.type !== 'transit') return;
      if (lastEnd && l.start && !l.interline) out[i] = Math.round((l.start - lastEnd) / 60000);
      lastEnd = l.end;
    });
    return out;
  }

  /** Kurze Satzbeschreibung für die Ergebniskarte. */
  function leaveSentence(route, a) {
    if (!a.firstTransit) return '';
    var ft = a.firstTransit;
    var stop = ft.from.name + (ft.from.track ? ', Gleis/Steig ' + ft.from.track : '');
    var dep = ft.name + ' fährt um ' + fmtTime(ft.start);
    if (!a.access) return dep + ' ab ' + stop + '.';
    var verb = a.access.type === 'walk' ? 'losgehen' : 'losfahren';
    var how = a.access.type === 'walk'
      ? fmtDuration(a.access.duration) + ' zu Fuß (' + fmtSteps(a.access.steps) + ')'
      : fmtDuration(a.access.duration) + (a.access.type === 'bike' ? ' mit dem Fahrrad' : ' mit dem Auto');
    return 'Um ' + fmtTime(a.leaveAt) + ' ' + verb + ': ' + how + ' bis ' + stop + '. ' + dep + '.';
  }

  /** Text zum Teilen. */
  function routeText(route, from, to, settings) {
    var s = withDefaults(settings);
    var lines = [];
    lines.push((from && from.name ? from.name : 'Start') + ' → ' + (to && to.name ? to.name : 'Ziel'));
    lines.push(fmtDay(route.start) + ', ' + fmtTime(route.start) + ' – ' + fmtTime(route.end) + ' (' + fmtDuration(route.duration) + ')');
    lines.push('');
    route.legs.forEach(function (l) {
      if (isTrivialStreetLeg(l)) return;
      if (l.type === 'transit') {
        lines.push(fmtTime(l.start) + ' ' + l.name + (l.headsign ? ' Richtung ' + l.headsign : '') + ' ab ' + l.from.name + (l.from.track ? ' (Gleis ' + l.from.track + ')' : ''));
        lines.push(fmtTime(l.end) + ' an ' + l.to.name + (l.to.track ? ' (Gleis ' + l.to.track + ')' : ''));
      } else {
        var extra = l.type === 'walk' && l.distance ? ', ' + fmtSteps(stepsFor(l.distance, s.strideCm)) : '';
        lines.push(l.label + ' ' + fmtDuration(l.duration) + (l.distance ? ' · ' + fmtDistance(l.distance) : '') + extra + ' bis ' + l.to.name);
      }
    });
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- Export

  var core = {
    CHOICES: CHOICES, MODE_INFO: MODE_INFO, CAT_COLOR: CAT_COLOR, PACE: PACE, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    modeInfo: modeInfo, isStreetMode: isStreetMode, withDefaults: withDefaults,
    fmtNumber: fmtNumber, fmtTime: fmtTime, fmtDay: fmtDay, fmtDuration: fmtDuration, fmtDurationShort: fmtDurationShort,
    fmtDistance: fmtDistance, stepsFor: stepsFor, fmtSteps: fmtSteps, fmtCountdown: fmtCountdown, delayMinutes: delayMinutes,
    decodePolyline: decodePolyline, encodePolyline: encodePolyline, haversine: haversine, lineLength: lineLength,
    placeFromMotis: placeFromMotis, placeFromPhoton: placeFromPhoton, placeFromNominatim: placeFromNominatim,
    parseCoordinates: parseCoordinates, placeKey: placeKey,
    transitModesFor: transitModesFor, accessModesFor: accessModesFor, hasTransit: hasTransit, streetChoices: streetChoices,
    motisPlanUrl: motisPlanUrl, motisGeocodeUrl: motisGeocodeUrl, motisReverseUrl: motisReverseUrl,
    photonUrl: photonUrl, photonReverseUrl: photonReverseUrl, nominatimUrl: nominatimUrl,
    valhallaUrl: valhallaUrl, osrmUrl: osrmUrl,
    motisStepText: motisStepText, motisSteps: motisSteps, osrmStepText: osrmStepText,
    lineName: lineName, motisLeg: motisLeg, motisItinerary: motisItinerary, parseMotisPlan: parseMotisPlan,
    parseValhalla: parseValhalla, parseOsrm: parseOsrm, directRoute: directRoute, timeDirectRoute: timeDirectRoute,
    isTrivialStreetLeg: isTrivialStreetLeg, analyzeRoute: analyzeRoute, alignRoute: alignRoute, transferTimes: transferTimes,
    leaveSentence: leaveSentence, routeText: routeText,
    normSpec: normSpec, checkSpec: checkSpec, earliestLeave: earliestLeave, specQuery: specQuery,
    specFallbackQuery: specFallbackQuery, timeDirectSpec: timeDirectSpec, judgeRoute: judgeRoute,
    bestRoute: bestRoute, earliestArrival: earliestArrival, describeSpec: describeSpec, explainSpec: explainSpec,
    gmapsDirUrl: gmapsDirUrl, gmapsNavUri: gmapsNavUri, GMAPS_PACKAGE: GMAPS_PACKAGE,
    FAV_KIND: FAV_KIND, favLabel: favLabel, normFavs: normFavs, upsertFav: upsertFav, removeFav: removeFav,
    findFav: findFav, matchFavs: matchFavs, favPlace: favPlace
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else { root.U = root.U || {}; root.U.core = core; }
})(typeof window !== 'undefined' ? window : this);

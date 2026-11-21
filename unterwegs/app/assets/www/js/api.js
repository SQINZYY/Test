/*
 * Unterwegs – Zugriff auf die Online-Dienste, jeweils mit Ausweichlösung:
 *  - Adresssuche: Transitous (MOTIS) → Photon → Nominatim
 *  - Bus & Bahn: Transitous /api/v6/plan (ältere API-Versionen als Rückfall)
 *  - Zu Fuß / Fahrrad / Auto: Valhalla (FOSSGIS) → OSRM (FOSSGIS)
 * In der Android-App laufen die Anfragen über Java (eigener User-Agent, kein CORS),
 * im Browser über fetch().
 */
(function (root) {
  'use strict';
  var core = root.U.core;
  var TRANSITOUS = 'https://api.transitous.org';
  var VERSIONS = [6, 5, 4, 3, 2];

  // ---------------------------------------------------------------- HTTP

  var pending = {}, seq = 0;

  function nativeHttp() {
    return !!(root.Android && typeof root.Android.httpGet === 'function');
  }

  function netError(msg) {
    var e = new Error(msg || 'Keine Verbindung');
    e.network = true;
    return e;
  }

  function httpGet(url, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    if (nativeHttp()) {
      return new Promise(function (resolve, reject) {
        var id = 'h' + (++seq) + '_' + Date.now();
        var timer = setTimeout(function () {
          delete pending[id];
          reject(netError('Zeitüberschreitung'));
        }, timeoutMs + 5000);
        pending[id] = function (status) {
          clearTimeout(timer);
          var body = '';
          try { body = root.Android.httpBody(id) || ''; } catch (e) { body = ''; }
          if (!status || status <= 0) reject(netError(body || 'Keine Verbindung'));
          else resolve({ status: status, text: body });
        };
        root.Android.httpGet(id, url, timeoutMs);
      });
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.text().then(function (t) {
          clearTimeout(timer);
          return { status: r.status, text: t };
        });
      }, function (e) {
        clearTimeout(timer);
        throw netError(e && e.name === 'AbortError' ? 'Zeitüberschreitung' : 'Keine Verbindung');
      });
  }

  /** Wird von Java aufgerufen, sobald eine Antwort da ist. */
  function done(id, status) {
    var cb = pending[id];
    if (cb) { delete pending[id]; cb(status); }
  }

  function getJson(url, timeoutMs) {
    return httpGet(url, timeoutMs).then(function (r) {
      var json = null;
      try { json = r.text ? JSON.parse(r.text) : null; } catch (e) { json = null; }
      if (r.status < 200 || r.status >= 300) {
        var msg = json && (json.error || json.message || json.status_message);
        var err = new Error(msg ? String(msg) : 'HTTP ' + r.status);
        err.status = r.status;
        err.json = json;
        throw err;
      }
      if (json === null) {
        var e2 = new Error('Ungültige Antwort');
        e2.status = r.status;
        throw e2;
      }
      return json;
    });
  }

  // ---------------------------------------------------------------- Adresssuche

  function uniquePlaces(list) {
    var seen = {}, out = [];
    list.forEach(function (p) {
      if (!p) return;
      var key = p.name + '|' + p.detail;
      var near = out.some(function (o) {
        return o.name === p.name && core.haversine([o.lat, o.lon], [p.lat, p.lon]) < 60;
      });
      if (seen[key] || near) return;
      seen[key] = 1;
      out.push(p);
    });
    return out;
  }

  /** Vorschläge während des Tippens. */
  function geocode(text, bias) {
    var coord = core.parseCoordinates(text);
    if (coord) return Promise.resolve([coord]);
    return getJson(core.motisGeocodeUrl(TRANSITOUS, text, bias), 12000)
      .then(function (list) {
        return uniquePlaces((Array.isArray(list) ? list : []).map(core.placeFromMotis));
      })
      .catch(function () { return []; })
      .then(function (res) {
        if (res.length) return res;
        return getJson(core.photonUrl(text, bias), 12000).then(function (j) {
          return uniquePlaces((j && Array.isArray(j.features) ? j.features : []).map(core.placeFromPhoton));
        });
      });
  }

  /** Beim Absenden ohne gewählten Vorschlag: alles versuchen, auch Nominatim. */
  function geocodeOnce(text, bias) {
    return geocode(text, bias).catch(function () { return []; }).then(function (res) {
      if (res.length) return res[0];
      return getJson(core.nominatimUrl(text), 12000).then(function (list) {
        var p = Array.isArray(list) && list.length ? core.placeFromNominatim(list[0]) : null;
        return p;
      }, function () { return null; });
    });
  }

  /** Adresse zum GPS-Standort. Die genaue Koordinate bleibt erhalten. */
  function reverse(lat, lon) {
    function keep(p) {
      if (!p) throw new Error('nichts gefunden');
      return { name: 'Mein Standort', detail: p.name + (p.detail ? ', ' + p.detail : ''), lat: lat, lon: lon, kind: 'here', source: p.source };
    }
    return getJson(core.motisReverseUrl(TRANSITOUS, lat, lon), 10000)
      .then(function (list) {
        var addr = (Array.isArray(list) ? list : []).filter(function (m) { return m && m.type === 'ADDRESS'; });
        return keep(core.placeFromMotis(addr[0] || (list && list[0])));
      })
      .catch(function () {
        return getJson(core.photonReverseUrl(lat, lon), 10000).then(function (j) {
          return keep(j && j.features && j.features.length ? core.placeFromPhoton(j.features[0]) : null);
        });
      })
      .catch(function () {
        return { name: 'Mein Standort', detail: lat.toFixed(5) + ', ' + lon.toFixed(5), lat: lat, lon: lon, kind: 'here' };
      });
  }

  // ---------------------------------------------------------------- Bus & Bahn

  var knownVersion = null;

  function placeName(p) {
    return p.kind === 'here' ? 'Mein Standort' : p.name;
  }

  function withoutStops(q) {
    var c = {};
    for (var k in q) c[k] = q[k];
    c.from = { lat: q.from.lat, lon: q.from.lon, name: q.from.name };
    c.to = { lat: q.to.lat, lon: q.to.lon, name: q.to.name };
    return c;
  }

  function sameAsWalk(acc) {
    return acc.pre.length === 1 && acc.pre[0] === 'WALK' && acc.post.length === 1 && acc.post[0] === 'WALK' && !acc.requireBikeTransport;
  }

  /**
   * Verbindungen suchen. q = { from, to, time, arriveBy, sel, settings, pageCursor }
   * state (optional): die Einstellungen eines früheren erfolgreichen Aufrufs (fürs Blättern).
   * Ergebnis: { itineraries, direct, previousPageCursor, nextPageCursor, notes, state }
   */
  function planTransit(q, state) {
    var hasStop = !!(q.from.stopId || q.to.stopId);
    var st = state ? {
      vIdx: state.vIdx, access: state.access, minimal: state.minimal, coords: state.coords
    } : {
      vIdx: Math.max(0, VERSIONS.indexOf(knownVersion)), access: 0, minimal: false, coords: false
    };
    var fixed = !!state;

    function run() {
      var qq = st.coords ? withoutStops(q) : q;
      var url = core.motisPlanUrl(TRANSITOUS, qq, { version: VERSIONS[st.vIdx], accessLevel: st.access, minimal: st.minimal });
      return getJson(url, 60000).then(function (json) {
        knownVersion = VERSIONS[st.vIdx];
        var res = core.parseMotisPlan(json, { from: placeName(q.from), to: placeName(q.to) });
        res.notes = notesFor(q.sel, st.access);
        res.state = { vIdx: st.vIdx, access: st.access, minimal: st.minimal, coords: st.coords };
        return res;
      }, function (err) {
        if (!err.status || fixed) throw err;
        if (err.status === 404) {
          if (hasStop && !st.coords) { st.coords = true; return run(); }
          if (st.vIdx + 1 < VERSIONS.length) { st.vIdx++; st.coords = false; return run(); }
          throw err;
        }
        if (err.status === 400 || err.status === 422 || err.status === 500) {
          while (st.access < 2) {
            var before = core.accessModesFor(q.sel, st.access);
            st.access++;
            var after = core.accessModesFor(q.sel, st.access);
            if (JSON.stringify(before) !== JSON.stringify(after)) return run();
            if (sameAsWalk(after)) break;
          }
          if (!st.minimal) { st.minimal = true; return run(); }
          if (hasStop && !st.coords) { st.coords = true; return run(); }
        }
        throw err;
      });
    }
    return run();
  }

  function notesFor(sel, access) {
    var notes = [];
    if (access === 1 && sel.car) notes.push('Park+Ride-Daten fehlen hier – berechnet wurde die Fahrt mit dem Auto bis zur Haltestelle.');
    if (access >= 2 && (sel.car || sel.bike)) notes.push((sel.car && sel.bike ? 'Fahrrad und Auto' : sel.car ? 'Das Auto' : 'Das Fahrrad') +
      ' als Weg zur Haltestelle wird hier nicht unterstützt – stattdessen mit Fußwegen berechnet.');
    return notes;
  }

  // ---------------------------------------------------------------- Zu Fuß, Fahrrad, Auto

  function planDirect(from, to, mode, settings) {
    return getJson(core.valhallaUrl(from, to, mode, settings), 30000)
      .then(function (j) { return core.parseValhalla(j, mode, from, to); })
      .catch(function (e1) {
        return getJson(core.osrmUrl(from, to, mode), 30000)
          .then(function (j) { return core.parseOsrm(j, mode, from, to); })
          .catch(function (e2) { throw e1.network && !e2.network ? e2 : e1; });
      });
  }

  root.U.api = {
    httpGet: httpGet,
    getJson: getJson,
    _done: done,
    geocode: geocode,
    geocodeOnce: geocodeOnce,
    reverse: reverse,
    planTransit: planTransit,
    planDirect: planDirect,
    TRANSITOUS: TRANSITOUS
  };
})(window);

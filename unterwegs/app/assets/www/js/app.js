/* Unterwegs – Oberfläche: Planen → Verbindungen → Details mit Karte. */
(function (root) {
  'use strict';
  var U = root.U, core = U.core, api = U.api, icons = U.icons;
  var doc = root.document;

  function $(id) { return doc.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ic(name, cls) { return icons.svg(name, cls); }

  // ---------------------------------------------------------------- Speicher

  var PREFIX = 'unterwegs.';
  function load(key, def) {
    try {
      var v = root.localStorage.getItem(PREFIX + key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* egal */ }
  }

  // ---------------------------------------------------------------- Zustand

  var S = {
    from: null,
    to: null,
    sel: load('modes', { walk: true, bus: true, bahn: true, zug: true }),
    when: 'now',
    settings: core.withDefaults(load('settings', null)),
    view: 'plan',
    search: null,
    detail: null,
    lastPos: load('lastPos', null)
  };

  // ---------------------------------------------------------------- Allgemeines

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  function errorText(err) {
    if (!err) return 'Unbekannter Fehler';
    if (err.network) return 'Keine Internetverbindung oder Dienst nicht erreichbar';
    if (err.status) return 'Der Dienst meldet einen Fehler (' + err.status + (err.message && err.message.indexOf('HTTP') !== 0 ? ': ' + err.message : '') + ')';
    return err.message || String(err);
  }

  function contrast(hex) {
    var h = (hex || '').replace('#', '');
    if (h.length !== 6) return '#ffffff';
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111827' : '#ffffff';
  }

  function legColors(l) {
    var bg = l.color || core.CAT_COLOR[l.cat] || '#6b7280';
    var fg = l.textColor && l.textColor !== bg ? l.textColor : contrast(bg);
    return { bg: bg, fg: fg, border: bg.toLowerCase() === '#ffffff' ? '#d1d5db' : bg };
  }

  function badge(l) {
    var c = legColors(l);
    return '<span class="badge" style="background:' + c.bg + ';color:' + c.fg + ';border-color:' + c.border + '">' +
      ic(l.cat) + '<span>' + esc(l.name) + '</span></span>';
  }

  function transitWords(sel) {
    var w = [];
    if (sel.bus) w.push('Bus');
    if (sel.bahn) w.push('Bahn');
    if (sel.zug) w.push('Zug');
    if (w.length <= 1) return w.join('');
    return w.slice(0, -1).join(', ') + ' & ' + w[w.length - 1];
  }

  function streetWord(m) { return { walk: 'zu Fuß', bike: 'mit dem Fahrrad', car: 'mit dem Auto' }[m]; }
  function streetTitle(m) { return { walk: 'Zu Fuß', bike: 'Fahrrad', car: 'Auto' }[m]; }

  function placeLabel(p) {
    if (!p) return '';
    if (p.kind === 'here') return 'Mein Standort';
    var city = (p.detail || '').split(',').pop().trim().replace(/^\d{4,5}\s+/, '');
    return p.name + (city && p.name.indexOf(city) < 0 ? ', ' + city : '');
  }

  function shortName(p) {
    if (!p) return '';
    return p.kind === 'here' ? 'Mein Standort' : p.name;
  }

  /** Countdown-Text; weit entfernte Zeiten als Tag. */
  function cdText(d, isLeave) {
    var now = new Date();
    var diff = (d - now) / 60000;
    if (diff > 12 * 60) return core.fmtDay(d, now);
    if (diff < -1) return isLeave ? 'Zeit ist vorbei' : 'schon weg';
    return core.fmtCountdown(d, now);
  }

  function cdSpan(d, isLeave) {
    if (!d) return '';
    return '<span class="cd" data-cd="' + d.toISOString() + '"' + (isLeave ? ' data-leave="1"' : '') + '>' + esc(cdText(d, isLeave)) + '</span>';
  }

  function tickCountdowns() {
    var els = doc.querySelectorAll('[data-cd]');
    for (var i = 0; i < els.length; i++) {
      var d = new Date(els[i].getAttribute('data-cd'));
      els[i].textContent = cdText(d, !!els[i].getAttribute('data-leave'));
      els[i].classList.toggle('late', (d - new Date()) < -60000);
      els[i].classList.toggle('soon', (d - new Date()) >= -60000 && (d - new Date()) < 5 * 60000);
    }
  }

  // ---------------------------------------------------------------- Ansichten

  var VIEWS = ['plan', 'results', 'detail'];
  function show(view) {
    S.view = view;
    VIEWS.forEach(function (v) { $('view-' + v).classList.toggle('active', v === view); });
    root.scrollTo(0, 0);
    if (view === 'detail' && S.detail) {
      setTimeout(function () { U.map.show($('map'), S.detail); }, 30);
    }
  }

  /** Zurück-Taste (Android ruft das auf). true = erledigt. */
  function back() {
    if (!$('sheet').hidden) { closeSheet(); return true; }
    if (!$('suggest').hidden) { hideSuggest(); return true; }
    if (S.view === 'detail') { show('results'); return true; }
    if (S.view === 'results') { show('plan'); return true; }
    return false;
  }

  // ---------------------------------------------------------------- Verkehrsmittel

  function modeHint(sel) {
    var t = core.hasTransit(sel), st = core.streetChoices(sel);
    if (!t && !st.length) return 'Wähle mindestens ein Verkehrsmittel.';
    if (!t) {
      if (st.length > 1) return 'Du bekommst für jedes Verkehrsmittel eine eigene Route zum Vergleichen.';
      return sel.walk ? 'Route zu Fuß mit Dauer, Strecke und Schrittzahl.' : sel.bike ? 'Fahrradroute mit Dauer und Strecke.' : 'Autoroute mit Fahrzeit (ohne aktuellen Verkehr).';
    }
    var parts = [];
    if (!st.length) parts.push('Kurze Fußwege zur Haltestelle werden immer eingerechnet.');
    var what = sel.bus && !sel.bahn && !sel.zug ? 'dein Bus' : sel.zug && !sel.bus && !sel.bahn ? 'dein Zug' : sel.bahn && !sel.bus && !sel.zug ? 'deine Bahn' : 'deine Verbindung';
    parts.push('Du siehst, wann ' + what + ' fährt, wann du losgehen musst und wie viele Schritte es bis zur Haltestelle sind.');
    if (sel.bike && !sel.walk) parts.push('Mit dem Rad zur Haltestelle – nur Verbindungen, in denen das Rad mitfahren darf.');
    else if (sel.bike) parts.push('Zur Haltestelle zu Fuß oder mit dem Rad (das Rad bleibt dort).');
    if (sel.car) parts.push('Mit dem Auto zum Park+Ride, dann weiter mit ' + transitWords(sel) + '.');
    if (st.length) parts.push('Zum Vergleich gibt es auch die Route nur ' + st.map(streetWord).join(' / ') + '.');
    return parts.join(' ');
  }

  function renderModes() {
    $('modes').innerHTML = core.CHOICES.map(function (c) {
      var on = !!S.sel[c.id];
      return '<button type="button" class="mode' + (on ? ' on' : '') + '" data-mode="' + c.id + '" aria-pressed="' + on + '" style="--c:' + core.CAT_COLOR[c.id] + '">' +
        '<span class="m-icon">' + ic(c.id) + '</span>' +
        '<span class="m-label">' + esc(c.label) + '</span>' +
        '<span class="m-sub">' + esc(c.sub) + '</span>' +
        '<span class="m-check">' + ic('check') + '</span></button>';
    }).join('');
    $('mode-hint').textContent = modeHint(S.sel);
  }

  // ---------------------------------------------------------------- Eingabe Start/Ziel

  var sug = { field: null, items: [], token: 0, timer: null };

  function input(field) { return $('in-' + field); }

  function setPlace(field, place) {
    S[field] = place;
    input(field).value = place ? (place.kind === 'here' ? 'Mein Standort' + (place.detail ? ' · ' + place.detail.split(',')[0] : '') : placeLabel(place)) : '';
    updateClear();
  }

  function updateClear() {
    ['from', 'to'].forEach(function (f) {
      var b = doc.querySelector('[data-clear="' + f + '"]');
      if (b) b.hidden = !input(f).value;
    });
  }

  function biasFor(field) {
    var other = S[field === 'from' ? 'to' : 'from'];
    return other || S.lastPos || null;
  }

  function hideSuggest() {
    $('suggest').hidden = true;
    sug.field = null;
    sug.items = [];
  }

  function kindIcon(k) {
    return { stop: 'stop', address: 'home', here: 'locate', recent: 'history' }[k] || 'pin';
  }

  function renderSuggest(field, items, message, heading) {
    var box = $('suggest');
    var fieldEl = $('field-' + field);
    if (fieldEl.nextSibling !== box) fieldEl.parentNode.insertBefore(box, fieldEl.nextSibling);
    sug.field = field;
    sug.items = items || [];
    var html = heading ? '<div class="sg-head">' + esc(heading) + '</div>' : '';
    sug.items.forEach(function (p, i) {
      html += '<button type="button" class="sg-item" data-sg="' + i + '" role="option">' +
        '<span class="sg-icon k-' + esc(p.kind) + '">' + ic(p.action === 'locate' ? 'locate' : p.recent ? 'history' : kindIcon(p.kind)) + '</span>' +
        '<span class="sg-text"><b>' + esc(p.name) + '</b>' + (p.detail ? '<small>' + esc(p.detail) + '</small>' : '') + '</span></button>';
    });
    if (message) html += '<div class="sg-msg">' + esc(message) + '</div>';
    box.innerHTML = html;
    box.hidden = !html;
  }

  function recentPlaces() { return load('recentPlaces', []); }

  function showDefaultSuggest(field) {
    var items = [{ kind: 'here', name: 'Mein Standort', detail: 'Aktuellen Standort per GPS verwenden', action: 'locate' }];
    recentPlaces().slice(0, 6).forEach(function (p) {
      var c = {}; for (var k in p) c[k] = p[k];
      c.recent = true;
      items.push(c);
    });
    renderSuggest(field, items, '', items.length > 1 ? 'Vorschläge' : '');
  }

  function onInput(field) {
    S[field] = null;
    updateClear();
    var text = input(field).value.trim();
    clearTimeout(sug.timer);
    if (text.length < 3) { showDefaultSuggest(field); return; }
    sug.timer = setTimeout(function () { runSuggest(field, text); }, 280);
  }

  function runSuggest(field, text) {
    var token = ++sug.token;
    renderSuggest(field, [], 'Suche …');
    api.geocode(text, biasFor(field)).then(function (list) {
      if (token !== sug.token || input(field).value.trim() !== text) return;
      renderSuggest(field, list, list.length ? '' : 'Nichts gefunden – probiere Straße, Hausnummer und Ort.');
    }, function (err) {
      if (token !== sug.token) return;
      renderSuggest(field, [], 'Adresssuche nicht möglich: ' + errorText(err));
    });
  }

  function pickSuggest(i) {
    var field = sug.field, p = sug.items[i];
    if (!field || !p) return;
    hideSuggest();
    if (p.action === 'locate') { locate(field); return; }
    var c = {}; for (var k in p) if (k !== 'recent') c[k] = p[k];
    setPlace(field, c);
    if (field === 'from' && !S.to) input('to').focus();
    else input(field).blur();
  }

  function locate(field) {
    if (!root.navigator.geolocation) { toast('Standort ist auf diesem Gerät nicht verfügbar.'); return; }
    var el = input(field);
    el.value = '';
    el.placeholder = 'Standort wird ermittelt …';
    $('btn-locate').classList.add('busy');
    function reset() {
      el.placeholder = field === 'from' ? 'Start: Adresse, Haltestelle, Ort' : 'Ziel: Adresse, Haltestelle, Ort';
      $('btn-locate').classList.remove('busy');
    }
    root.navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      S.lastPos = { lat: lat, lon: lon };
      save('lastPos', S.lastPos);
      setPlace(field, { name: 'Mein Standort', detail: '', lat: lat, lon: lon, kind: 'here' });
      api.reverse(lat, lon).then(function (p) {
        reset();
        if (S[field] && S[field].kind === 'here' && S[field].lat === lat) setPlace(field, p);
      });
    }, function (err) {
      reset();
      toast(err && err.code === 1 ? 'Standortzugriff wurde nicht erlaubt.' : 'Standort konnte nicht ermittelt werden.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // ---------------------------------------------------------------- Zeit

  function roundedNow() {
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    return d;
  }

  function fillDateTime(d) {
    $('in-date').value = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    $('in-time').value = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function setWhen(v) {
    S.when = v;
    var btns = $('when-type').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-v') === v;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-checked', on);
    }
    $('when-inputs').hidden = v === 'now';
    if (v !== 'now' && !$('in-time').value) fillDateTime(roundedNow());
  }

  function chosenTime() {
    if (S.when === 'now') return new Date();
    var d = $('in-date').value, t = $('in-time').value;
    if (!d || !t) return null;
    var parts = d.split('-'), hm = t.split(':');
    var res = new Date(+parts[0], +parts[1] - 1, +parts[2], +hm[0], +hm[1], 0, 0);
    return isNaN(res.getTime()) ? null : res;
  }

  function whenText(q) {
    if (q.now) return 'Jetzt, ' + core.fmtTime(q.time);
    return (q.arriveBy ? 'Ankunft bis ' : 'Abfahrt ') + core.fmtDay(q.time) + ', ' + core.fmtTime(q.time);
  }

  // ---------------------------------------------------------------- Suche starten

  function resolveField(field) {
    if (S[field]) return Promise.resolve(S[field]);
    var text = input(field).value.trim();
    if (!text) return Promise.resolve(null);
    return api.geocodeOnce(text, biasFor(field)).then(function (p) {
      if (p) setPlace(field, p);
      return p;
    });
  }

  function remember(from, to, sel) {
    var places = recentPlaces();
    [to, from].forEach(function (p) {
      if (!p || p.kind === 'here') return;
      var key = core.placeKey(p);
      places = places.filter(function (o) { return core.placeKey(o) !== key; });
      places.unshift({ name: p.name, detail: p.detail || '', lat: p.lat, lon: p.lon, kind: p.kind, stopId: p.stopId });
    });
    save('recentPlaces', places.slice(0, 10));

    var routes = load('recentRoutes', []);
    var entry = {
      from: from.kind === 'here' ? null : from,
      to: to.kind === 'here' ? null : to,
      sel: sel
    };
    var key = (entry.from ? core.placeKey(entry.from) : 'here') + '>' + (entry.to ? core.placeKey(entry.to) : 'here');
    routes = routes.filter(function (r) {
      return ((r.from ? core.placeKey(r.from) : 'here') + '>' + (r.to ? core.placeKey(r.to) : 'here')) !== key;
    });
    routes.unshift(entry);
    save('recentRoutes', routes.slice(0, 5));
    renderRecent();
  }

  var searching = false;
  function onSearch() {
    if (searching) return;
    hideSuggest();
    if (!core.hasTransit(S.sel) && !core.streetChoices(S.sel).length) { toast('Bitte wähle mindestens ein Verkehrsmittel.'); return; }
    var time = chosenTime();
    if (!time) { toast('Bitte Datum und Uhrzeit angeben.'); return; }
    var btn = $('btn-search');
    searching = true;
    btn.classList.add('busy');
    Promise.all([resolveField('from'), resolveField('to')]).then(function (res) {
      var from = res[0], to = res[1];
      if (!from) { toast(input('from').value.trim() ? 'Start nicht gefunden.' : 'Bitte gib einen Start ein.'); input('from').focus(); return; }
      if (!to) { toast(input('to').value.trim() ? 'Ziel nicht gefunden.' : 'Bitte gib ein Ziel ein.'); input('to').focus(); return; }
      if (core.haversine([from.lat, from.lon], [to.lat, to.lon]) < 20) { toast('Start und Ziel liegen am selben Ort.'); return; }
      var sel = {};
      for (var k in S.sel) if (S.sel[k]) sel[k] = true;
      remember(from, to, sel);
      startSearch({
        from: from, to: to, time: time, arriveBy: S.when === 'arr', now: S.when === 'now',
        sel: sel, settings: core.withDefaults(S.settings)
      });
    }).catch(function (err) {
      toast('Suche fehlgeschlagen: ' + errorText(err));
    }).then(function () {
      searching = false;
      btn.classList.remove('busy');
    });
  }

  function startSearch(q) {
    var s = { q: q, transit: null, direct: {}, seq: Date.now() };
    S.search = s;
    if (core.hasTransit(q.sel)) s.transit = { status: 'loading', list: [] };
    var streets = core.streetChoices(q.sel);
    streets.forEach(function (m) { s.direct[m] = { status: 'loading' }; });
    renderResults();
    show('results');
    if (s.transit) loadTransit(s);
    streets.forEach(function (m) { loadDirect(s, m); });
  }

  function current(s) { return S.search === s; }

  function loadTransit(s) {
    var tr = s.transit;
    tr.status = 'loading';
    renderResults();
    api.planTransit(s.q).then(function (res) {
      if (!current(s)) return;
      tr.status = 'ok';
      tr.raw = res.itineraries;
      alignList(s);
      tr.prev = res.previousPageCursor;
      tr.next = res.nextPageCursor;
      tr.state = res.state;
      tr.notes = res.notes || [];
      tr.motisDirect = res.direct || [];
      patchWalk(s);
      renderResults();
    }, function (err) {
      if (!current(s)) return;
      tr.status = 'error';
      tr.error = err;
      renderResults();
    });
  }

  /** Losgeh-Zeit an Abfahrt (Echtzeit) und Puffer anpassen. */
  function alignList(s) {
    var tr = s.transit;
    tr.list = (tr.raw || []).map(function (r) { return core.alignRoute(r, s.q.settings); });
  }

  function loadDirect(s, mode) {
    var d = s.direct[mode];
    var q = s.q;
    var crow = core.haversine([q.from.lat, q.from.lon], [q.to.lat, q.to.lon]);
    var limit = { walk: 80000, bike: 400000, car: 3000000 }[mode];
    if (crow > limit) {
      d.status = 'skip';
      d.message = 'Zu weit ' + streetWord(mode) + ' (' + core.fmtDistance(crow) + ' Luftlinie).';
      renderResults();
      return;
    }
    d.status = 'loading';
    renderResults();
    api.planDirect(q.from, q.to, mode, q.settings).then(function (route) {
      if (!current(s)) return;
      core.timeDirectRoute(route, q.time, q.arriveBy);
      d.status = 'ok';
      d.route = route;
      renderResults();
    }, function (err) {
      if (!current(s)) return;
      d.status = 'error';
      d.error = err;
      patchWalk(s);
      renderResults();
    });
  }

  /** Fällt der Fußweg-Dienst aus, kann der Fußweg aus der Fahrplanauskunft einspringen. */
  function patchWalk(s) {
    var d = s.direct.walk, tr = s.transit;
    if (!d || d.status !== 'error' || !tr || !tr.motisDirect) return;
    var walk = tr.motisDirect.filter(function (r) { return r.legs.length === 1 && r.legs[0].type === 'walk'; })[0];
    if (!walk) return;
    walk.mode = 'walk';
    walk.distance = walk.legs[0].distance;
    walk.legs[0].from.name = s.q.from.name;
    walk.legs[0].to.name = s.q.to.name;
    core.timeDirectRoute(walk, s.q.time, s.q.arriveBy);
    d.status = 'ok';
    d.route = walk;
  }

  function loadMore(dir) {
    var s = S.search;
    if (!s || !s.transit || s.transit.paging) return;
    var tr = s.transit;
    var cursor = dir === 'prev' ? tr.prev : tr.next;
    if (!cursor) return;
    tr.paging = dir;
    renderResults();
    var q = {};
    for (var k in s.q) q[k] = s.q[k];
    q.pageCursor = cursor;
    api.planTransit(q, tr.state).then(function (res) {
      if (!current(s)) return;
      tr.paging = null;
      var ids = {};
      tr.raw.forEach(function (r) { ids[r.id] = 1; });
      var fresh = res.itineraries.filter(function (r) { return !ids[r.id]; });
      if (dir === 'prev') { tr.raw = fresh.concat(tr.raw); tr.prev = res.previousPageCursor; }
      else { tr.raw = tr.raw.concat(fresh); tr.next = res.nextPageCursor; }
      alignList(s);
      if (!fresh.length) toast('Keine weiteren Verbindungen gefunden.');
      renderResults();
    }, function (err) {
      if (!current(s)) return;
      tr.paging = null;
      toast('Laden fehlgeschlagen: ' + errorText(err));
      renderResults();
    });
  }

  // ---------------------------------------------------------------- Ergebnisse

  function legPills(route) {
    var legs = route.legs.filter(function (l) { return !core.isTrivialStreetLeg(l); });
    if (!legs.length) legs = route.legs;
    return legs.map(function (l) {
      if (l.type === 'transit') return badge(l);
      return '<span class="pill street c-' + l.cat + '">' + ic(l.cat) + '<span>' + core.fmtDurationShort(l.duration) + '</span></span>';
    }).join('<span class="pill-sep" aria-hidden="true"></span>');
  }

  function transfersText(n) {
    return n === 0 ? 'Ohne Umstieg' : n === 1 ? '1 Umstieg' : n + ' Umstiege';
  }

  function delayHtml(l, which) {
    if (!l.realTime) return '';
    var d = which === 'end' ? l.delayEnd : l.delayStart;
    if (d === null) return '';
    if (d > 0) return ' <span class="delay late">+' + d + '</span>';
    if (d < 0) return ' <span class="delay early">' + d + '</span>';
    return ' <span class="delay ok">pünktlich</span>';
  }

  function accessText(acc, settings) {
    if (!acc) return '';
    if (acc.type === 'walk') {
      return core.fmtDuration(acc.duration) + ' · ' + core.fmtDistance(acc.distance) + ' · <b>' + core.fmtSteps(acc.steps) + '</b>';
    }
    return core.fmtDuration(acc.duration) + ' ' + streetWord(acc.type) + (acc.distance ? ' · ' + core.fmtDistance(acc.distance) : '');
  }

  function leaveBlock(route, a, settings) {
    var ft = a.firstTransit;
    if (!ft) return '';
    var acc = a.access;
    var verb = !acc ? 'Abfahrt' : acc.type === 'walk' ? 'Losgehen' : 'Losfahren';
    var track = ft.from.track ? ', Gleis/Steig ' + esc(ft.from.track) : '';
    var html = '<div class="leave">' +
      '<span class="leave-icon c-' + (acc ? acc.type : 'clock') + '">' + ic(acc ? acc.type : 'clock') + '</span>' +
      '<div class="leave-text"><div class="leave-head"><b>' + verb + ' ' + core.fmtTime(a.leaveAt) + '</b>' + cdSpan(a.leaveAt, true) + '</div>' +
      (acc ? '<div class="muted">' + accessText(acc, settings) + ' bis ' + esc(ft.from.name) + track + '</div>' : '<div class="muted">ab ' + esc(ft.from.name) + track + '</div>') +
      '</div></div>';
    html += '<div class="dep">' + badge(ft) + '<span>fährt <b>' + core.fmtTime(ft.start) + '</b>' + delayHtml(ft, 'start') +
      (ft.headsign ? ' Richtung ' + esc(ft.headsign) : '') + (ft.cancelled ? ' <span class="delay late">fällt aus</span>' : '') + '</span></div>';
    return html;
  }

  function transitCard(route, idx, s, tags) {
    var settings = s.q.settings;
    var a = core.analyzeRoute(route, settings);
    var now = Date.now();
    var missed = a.leaveAt && a.leaveAt.getTime() < now - 60000 && Math.abs(s.q.time - now) < 6 * 3600000;
    var cancelled = route.legs.some(function (l) { return l.cancelled; });
    var meta = [transfersText(route.transfers)];
    if (a.walk.distance > 0) meta.push(core.fmtDistance(a.walk.distance) + ' zu Fuß');
    var tagHtml = (tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    return '<div class="rcard' + (missed ? ' missed' : '') + (cancelled ? ' cancelled' : '') + '" role="button" tabindex="0" data-open="t' + idx + '">' +
      '<div class="rc-top"><span class="rc-times">' + core.fmtTime(route.start) + ' – ' + core.fmtTime(route.end) + '</span>' +
      '<span class="rc-dur">' + core.fmtDuration(route.duration) + '</span></div>' +
      '<div class="rc-meta">' + esc(meta.join(' · ')) + tagHtml + '</div>' +
      '<div class="pills">' + legPills(route) + '</div>' +
      leaveBlock(route, a, settings) +
      (cancelled ? '<div class="warnline">' + ic('warn') + 'Ein Teil dieser Verbindung fällt aus.</div>' : '') +
      '</div>';
  }

  function directCard(mode, d, s) {
    var title = streetTitle(mode);
    if (d.status === 'loading') {
      return '<div class="rcard direct loading"><div class="rc-top"><span class="rc-mode c-' + mode + '">' + ic(mode) + title + '</span><span class="spinner"></span></div>' +
        '<div class="rc-meta">Route wird berechnet …</div></div>';
    }
    if (d.status === 'skip') {
      return '<div class="rcard direct off"><div class="rc-top"><span class="rc-mode c-' + mode + '">' + ic(mode) + title + '</span></div><div class="rc-meta">' + esc(d.message) + '</div></div>';
    }
    if (d.status === 'error') {
      return '<div class="rcard direct off"><div class="rc-top"><span class="rc-mode c-' + mode + '">' + ic(mode) + title + '</span>' +
        '<button type="button" class="link" data-retry="' + mode + '">Erneut versuchen</button></div>' +
        '<div class="rc-meta">Konnte nicht berechnet werden: ' + esc(errorText(d.error)) + '</div></div>';
    }
    var r = d.route;
    var meta = [core.fmtDistance(r.distance)];
    if (mode === 'walk') meta.push(core.fmtSteps(core.stepsFor(r.distance, s.q.settings.strideCm)));
    meta.push(s.q.arriveBy ? 'los ' + core.fmtTime(r.start) : 'an ' + core.fmtTime(r.end));
    if (mode === 'car') meta.push('ohne Verkehr');
    return '<div class="rcard direct" role="button" tabindex="0" data-open="d-' + mode + '">' +
      '<div class="rc-top"><span class="rc-mode c-' + mode + '">' + ic(mode) + title + '</span><span class="rc-dur">' + core.fmtDuration(r.duration) + '</span></div>' +
      '<div class="rc-meta">' + esc(meta.join(' · ')) + '</div></div>';
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="rcard skeleton"><div class="sk w60"></div><div class="sk w40"></div><div class="sk w80"></div></div>';
    return h;
  }

  function renderResults() {
    var s = S.search;
    if (!s) return;
    var q = s.q;
    $('res-title').textContent = shortName(q.from) + ' → ' + shortName(q.to);
    var modes = [];
    core.streetChoices(q.sel).forEach(function (m) { modes.push(streetTitle(m)); });
    if (core.hasTransit(q.sel)) modes.push(transitWords(q.sel));
    $('res-sub').textContent = whenText(q) + ' · ' + modes.join(', ');

    var html = '';
    var tr = s.transit;
    if (tr) {
      html += '<h2 class="section-title">Mit ' + esc(transitWords(q.sel)) + '</h2>';
      (tr.notes || []).forEach(function (n) { html += '<div class="note">' + ic('info') + '<span>' + esc(n) + '</span></div>'; });
      if (tr.status === 'loading') {
        html += '<div class="loading-line"><span class="spinner"></span>Suche Verbindungen und Abfahrtszeiten …</div>' + skeleton(3);
      } else if (tr.status === 'error') {
        html += '<div class="rcard off"><div class="rc-top"><span class="rc-mode">' + ic('warn') + 'Fahrplanauskunft nicht erreichbar</span></div>' +
          '<div class="rc-meta">' + esc(errorText(tr.error)) + '</div><button type="button" class="secondary" data-retry="transit">Erneut versuchen</button></div>';
      } else if (!tr.list.length) {
        html += '<div class="rcard off"><div class="rc-top"><span class="rc-mode">' + ic('info') + 'Keine Verbindung gefunden</span></div>' +
          '<div class="rc-meta">Wähle weitere Verkehrsmittel, erlaube längere Fußwege (Einstellungen) oder probiere eine andere Uhrzeit.</div>' +
          (tr.next ? '<button type="button" class="secondary" data-more="next">Spätere Verbindungen suchen</button>' : '') + '</div>';
      } else {
        if (tr.prev) html += '<button type="button" class="more" data-more="prev">' + (tr.paging === 'prev' ? '<span class="spinner"></span>' : '') + 'Frühere Verbindungen</button>';
        var fastest = null, fewest = null;
        tr.list.forEach(function (r) {
          if (!fastest || r.duration < fastest.duration) fastest = r;
          if (!fewest || r.transfers < fewest.transfers) fewest = r;
        });
        tr.list.forEach(function (r, i) {
          var tags = [];
          if (tr.list.length > 1 && r === fastest) tags.push('Schnellste');
          if (tr.list.length > 1 && r === fewest && r !== fastest && r.transfers < fastest.transfers) tags.push('Wenigste Umstiege');
          html += transitCard(r, i, s, tags);
        });
        if (tr.next) html += '<button type="button" class="more" data-more="next">' + (tr.paging === 'next' ? '<span class="spinner"></span>' : '') + 'Spätere Verbindungen</button>';
      }
    }
    var streets = core.streetChoices(q.sel);
    if (streets.length) {
      html += '<h2 class="section-title">' + (tr ? 'Ohne Bus &amp; Bahn' : streets.length > 1 ? 'Deine Routen' : 'Deine Route') + '</h2>';
      streets.forEach(function (m) { html += directCard(m, s.direct[m], s); });
    }
    $('res-body').innerHTML = html;
  }

  // ---------------------------------------------------------------- Details

  function openDetail(key) {
    var s = S.search;
    if (!s) return;
    var route = null;
    if (key.charAt(0) === 't' && s.transit) route = s.transit.list[+key.slice(1)];
    else if (key.indexOf('d-') === 0 && s.direct[key.slice(2)]) route = s.direct[key.slice(2)].route;
    if (!route) return;
    S.detail = route;
    renderDetail(route, s);
    show('detail');
  }

  function timeCell(l, which) {
    var t = which === 'end' ? l.end : l.start;
    var sched = which === 'end' ? l.scheduledEnd : l.scheduledStart;
    var d = l.type === 'transit' && l.realTime ? (which === 'end' ? l.delayEnd : l.delayStart) : null;
    if (d && d !== 0 && sched) {
      return '<s>' + core.fmtTime(sched) + '</s><b class="' + (d > 0 ? 'late' : 'early') + '">' + core.fmtTime(t) + '</b>';
    }
    return '<b>' + core.fmtTime(t) + '</b>';
  }

  function trackHtml(p, l) {
    if (!p.track) return '';
    var word = l && (l.cat === 'bus') ? 'Steig' : 'Gleis';
    return '<span class="track' + (p.trackChanged ? ' changed' : '') + '">' + word + ' ' + esc(p.track) + '</span>';
  }

  function stopRow(opts) {
    // opts: { arrLeg, depLeg, place, label, first, last }
    var arr = opts.arrLeg, dep = opts.depLeg;
    var time = '';
    if (dep && arr) {
      var gap = Math.round(((dep.start || 0) - (arr.end || 0)) / 60000);
      // Ankunft klein darüber, wenn man nach einer Fahrt erst später weiterkommt
      time = (gap >= 1 && arr.type === 'transit' ? '<small>an ' + core.fmtTime(arr.end) + '</small>' : '') + timeCell(dep, 'start');
    } else if (dep) time = timeCell(dep, 'start');
    else if (arr) time = timeCell(arr, 'end');
    var p = opts.place;
    var tracks = '';
    if (arr && arr.type === 'transit') tracks += trackHtml(arr.to, arr);
    if (dep && dep.type === 'transit' && (!arr || arr.type !== 'transit' || arr.to.track !== dep.from.track)) tracks += trackHtml(dep.from, dep);
    return '<div class="tl-row tl-stop' + (opts.first ? ' first' : '') + (opts.last ? ' last' : '') + '">' +
      '<div class="tl-time">' + time + '</div>' +
      '<div class="tl-node"><span class="node' + (opts.first ? ' start' : opts.last ? ' end' : '') + '"></span></div>' +
      '<div class="tl-place"><b>' + esc(p.name) + '</b>' + (opts.label ? '<small>' + esc(opts.label) + '</small>' : '') + tracks + '</div></div>';
  }

  function stepsList(l) {
    if (!l.steps || !l.steps.length) return '';
    return '<details class="steps"><summary>Wegbeschreibung (' + l.steps.length + (l.steps.length === 1 ? ' Anweisung' : ' Anweisungen') + ')</summary><ol>' +
      l.steps.map(function (st) {
        return '<li><span>' + esc(st.text) + '</span>' + (st.distance >= 10 ? '<small>' + core.fmtDistance(st.distance) + '</small>' : '') + '</li>';
      }).join('') + '</ol></details>';
  }

  function legRow(l, settings, waitAfter, transferMin, bikeWanted) {
    var c = legColors(l);
    var body = '';
    if (l.type !== 'transit') {
      var parts = [core.fmtDuration(l.duration)];
      if (l.distance) parts.push(core.fmtDistance(l.distance));
      body += '<div class="leg-head"><span class="leg-mode c-' + l.cat + '">' + ic(l.cat) + esc(l.label) + '</span><span>' + esc(parts.join(' · ')) + '</span></div>';
      if (l.type === 'walk' && l.distance) body += '<div class="leg-steps">' + ic('walk') + '<b>' + core.fmtSteps(core.stepsFor(l.distance, settings.strideCm)) + '</b></div>';
      if (waitAfter >= 60) body += '<div class="muted">Danach ' + core.fmtDuration(waitAfter) + ' Zeit bis zur Abfahrt</div>';
      body += stepsList(l);
    } else {
      body += '<div class="leg-head">' + badge(l) + (l.headsign ? '<span>Richtung <b>' + esc(l.headsign) + '</b></span>' : '') + '</div>';
      var info = [l.label, core.fmtDuration(l.duration)];
      if (l.stops.length) info.push((l.stops.length + 1) + ' Stationen');
      body += '<div class="muted">' + esc(info.join(' · ')) + (l.agency ? ' · ' + esc(l.agency) : '') + '</div>';
      if (l.cancelled) body += '<div class="warnline">' + ic('warn') + 'Diese Fahrt fällt aus!</div>';
      else if (l.realTime) {
        var d = l.delayStart;
        body += d > 0 ? '<div class="rt late">' + ic('clock') + '+' + d + ' Min. Verspätung (Echtzeit)</div>'
          : d < 0 ? '<div class="rt early">' + ic('clock') + Math.abs(d) + ' Min. früher (Echtzeit)</div>'
            : '<div class="rt ok">' + ic('clock') + 'Pünktlich (Echtzeit)</div>';
      }
      if (bikeWanted && l.bikesAllowed === false) body += '<div class="warnline">' + ic('warn') + 'Fahrradmitnahme laut Fahrplan nicht möglich.</div>';
      l.alerts.slice(0, 3).forEach(function (a) {
        body += '<details class="alert"><summary>' + ic('warn') + esc(a.title) + '</summary>' + (a.text ? '<p>' + esc(a.text) + '</p>' : '') + '</details>';
      });
      if (l.stops.length) {
        body += '<details class="stops"><summary>' + l.stops.length + ' Zwischenhalt' + (l.stops.length === 1 ? '' : 'e') + '</summary><ol>' +
          l.stops.map(function (st) {
            var late = st.time && st.scheduled && st.time - st.scheduled >= 60000;
            return '<li' + (st.cancelled ? ' class="cancelled"' : '') + '><span class="st-time' + (late ? ' late' : '') + '">' + core.fmtTime(st.time) + '</span><span>' + esc(st.name) + '</span></li>';
          }).join('') + '</ol></details>';
      }
    }
    var transfer = '';
    if (transferMin !== undefined) {
      transfer = '<div class="tl-row tl-transfer"><div class="tl-time"></div><div class="tl-node"></div><div class="tl-place"><span class="transfer' + (transferMin < 3 ? ' tight' : '') + '">' +
        ic('swap') + 'Umstieg: ' + transferMin + ' Min.' + (transferMin < 3 ? ' – knapp!' : '') + '</span></div></div>';
    }
    return transfer + '<div class="tl-row tl-leg ' + (l.type === 'transit' ? 'transit' : 'street c-' + l.cat) + '" style="--c:' + c.bg + '">' +
      '<div class="tl-time"></div><div class="tl-node"><span class="rail"></span></div><div class="tl-body">' + body + '</div></div>';
  }

  function timeline(route, s) {
    var settings = s.q.settings;
    var shown = [];
    route.legs.forEach(function (l, i) { if (!core.isTrivialStreetLeg(l)) shown.push({ leg: l, i: i }); });
    if (!shown.length) route.legs.forEach(function (l, i) { shown.push({ leg: l, i: i }); });
    var transfers = core.transferTimes(route);
    var html = '<div class="timeline">';
    shown.forEach(function (x, k) {
      var l = x.leg, prev = k > 0 ? shown[k - 1].leg : null;
      if (k === 0) {
        html += stopRow({ depLeg: l, place: l.type === 'transit' ? l.from : { name: shortName(s.q.from) }, label: 'Start', first: true });
      } else if (prev.to.name === l.from.name || prev.type !== 'transit' || l.type !== 'transit') {
        html += stopRow({ arrLeg: prev, depLeg: l, place: l.type === 'transit' ? l.from : prev.to });
      } else {
        html += stopRow({ arrLeg: prev, place: prev.to });
        html += stopRow({ depLeg: l, place: l.from });
      }
      var next = shown[k + 1] ? shown[k + 1].leg : null;
      var waitAfter = next && next.type === 'transit' && l.type !== 'transit' && next.start && l.end ? (next.start - l.end) / 1000 : 0;
      html += legRow(l, settings, waitAfter, l.type === 'transit' && k > 0 ? transfers[x.i] : undefined, !!s.q.sel.bike);
    });
    var last = shown[shown.length - 1].leg;
    html += stopRow({ arrLeg: last, place: last.type === 'transit' ? last.to : { name: shortName(s.q.to) }, label: 'Ziel', last: true });
    return html + '</div>';
  }

  function heroHtml(route, s) {
    var settings = s.q.settings;
    if (route.kind === 'direct') {
      var facts = [core.fmtDistance(route.distance)];
      if (route.mode === 'walk') facts.push(core.fmtSteps(core.stepsFor(route.distance, settings.strideCm)));
      return '<div class="hero-card">' +
        '<div class="hero-row"><span class="hero-icon c-' + route.mode + '">' + ic(route.mode) + '</span>' +
        '<div><div class="hero-label">' + esc(streetTitle(route.mode)) + '</div><div class="hero-time">' + core.fmtDuration(route.duration) + '</div></div>' +
        cdSpan(route.start, true) + '</div>' +
        '<ul class="hero-facts">' +
        '<li>' + ic('route') + '<span>' + esc(facts.join(' · ')) + '</span></li>' +
        '<li>' + ic('clock') + '<span>Los um <b>' + core.fmtTime(route.start) + '</b>, an um <b>' + core.fmtTime(route.end) + '</b></span></li>' +
        (route.mode === 'car' ? '<li>' + ic('info') + '<span>Fahrzeit ohne aktuellen Verkehr und Parkplatzsuche</span></li>' : '') +
        '</ul></div>';
    }
    var a = core.analyzeRoute(route, settings);
    var ft = a.firstTransit;
    var acc = a.access;
    var label = !acc ? 'Abfahrt um' : acc.type === 'walk' ? 'Losgehen um' : 'Losfahren um';
    var html = '<div class="hero-card">' +
      '<div class="hero-row"><span class="hero-icon c-' + (acc ? acc.type : 'clock') + '">' + ic(acc ? acc.type : 'clock') + '</span>' +
      '<div><div class="hero-label">' + label + '</div><div class="hero-time">' + core.fmtTime(a.leaveAt) + '</div></div>' + cdSpan(a.leaveAt, true) + '</div><ul class="hero-facts">';
    if (acc) {
      html += '<li>' + ic(acc.type) + '<span>' + accessText(acc, settings) + ' bis <b>' + esc(ft.from.name) + '</b>' +
        (ft.from.track ? ', ' + (ft.cat === 'bus' ? 'Steig ' : 'Gleis ') + esc(ft.from.track) : '') + '</span></li>';
    }
    html += '<li>' + badge(ft) + '<span>fährt um <b>' + core.fmtTime(ft.start) + '</b>' + delayHtml(ft, 'start') +
      (ft.headsign ? ' Richtung ' + esc(ft.headsign) : '') + '</span></li>';
    var spare = Math.round(a.waitAtStop / 60);
    if (acc && spare >= 1) html += '<li>' + ic('clock') + '<span>Du bist ' + spare + ' Min. vor der Abfahrt an der Haltestelle</span></li>';
    html += '<li>' + ic('pin') + '<span>Ankunft am Ziel um <b>' + core.fmtTime(route.end) + '</b> · ' + transfersText(route.transfers) + '</span></li>';
    if (a.walk.distance > 0) html += '<li>' + ic('walk') + '<span>Insgesamt ' + core.fmtDistance(a.walk.distance) + ' zu Fuß · ' + core.fmtSteps(a.walk.steps) + '</span></li>';
    return html + '</ul></div>';
  }

  function renderDetail(route, s) {
    if (route.kind === 'direct') {
      $('det-title').textContent = streetTitle(route.mode) + ' · ' + core.fmtDuration(route.duration);
    } else {
      $('det-title').textContent = core.fmtTime(route.start) + ' – ' + core.fmtTime(route.end) + ' · ' + core.fmtDuration(route.duration);
    }
    $('det-sub').textContent = shortName(s.q.from) + ' → ' + shortName(s.q.to) + ' · ' + core.fmtDay(route.start);
    var src = route.source === 'transitous' ? 'Fahrplan & Echtzeit: Transitous (MOTIS). Angaben ohne Gewähr.'
      : route.source === 'valhalla' ? 'Route: Valhalla (FOSSGIS) auf OpenStreetMap-Daten.'
        : 'Route: OSRM (FOSSGIS) auf OpenStreetMap-Daten.';
    $('det-body').innerHTML = heroHtml(route, s) + timeline(route, s) + '<p class="credits">' + esc(src) + '</p>';
  }

  function shareRoute() {
    var s = S.search, r = S.detail;
    if (!s || !r) return;
    var text = core.routeText(r, s.q.from, s.q.to, s.q.settings);
    if (root.Android && root.Android.share) { root.Android.share(text); return; }
    if (root.navigator.share) { root.navigator.share({ title: 'Route', text: text }).catch(function () {}); return; }
    if (root.navigator.clipboard) root.navigator.clipboard.writeText(text).then(function () { toast('Route kopiert.'); }, function () { toast(text); });
  }

  // ---------------------------------------------------------------- Zuletzt gesucht

  function selIcons(sel) {
    return core.CHOICES.filter(function (c) { return sel && sel[c.id]; }).map(function (c) {
      return '<span class="mini c-' + c.id + '">' + ic(c.id) + '</span>';
    }).join('');
  }

  function renderRecent() {
    var routes = load('recentRoutes', []);
    $('recent-box').hidden = !routes.length;
    $('recent').innerHTML = routes.map(function (r, i) {
      return '<button type="button" class="recent-item" data-recent="' + i + '">' + ic('history') +
        '<span class="ri-text"><b>' + esc(r.from ? r.from.name : 'Mein Standort') + ' → ' + esc(r.to ? r.to.name : 'Mein Standort') + '</b>' +
        '<span class="ri-modes">' + selIcons(r.sel) + '</span></span></button>';
    }).join('');
  }

  function useRecent(i) {
    var r = load('recentRoutes', [])[i];
    if (!r) return;
    if (r.sel) { S.sel = r.sel; save('modes', S.sel); renderModes(); }
    setWhen('now');
    if (r.from) setPlace('from', r.from); else { setPlace('from', null); locate('from'); }
    if (r.to) setPlace('to', r.to); else { setPlace('to', null); locate('to'); }
    if (r.from && r.to) onSearch();
  }

  // ---------------------------------------------------------------- Einstellungen

  function seg(name, options, value) {
    return '<div class="segmented small" data-setting="' + name + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" class="' + (String(o[0]) === String(value) ? 'on' : '') + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function renderSheet() {
    var s = S.settings;
    $('sheet-body').innerHTML =
      '<div class="set"><div class="set-label">Gehtempo</div>' + seg('pace', [['slow', 'gemütlich'], ['normal', 'normal'], ['fast', 'zügig']], s.pace) + '</div>' +
      '<div class="set"><div class="set-label">Schrittlänge <b id="stride-val">' + s.strideCm + ' cm</b></div>' +
      '<input type="range" min="50" max="100" step="1" id="stride" value="' + s.strideCm + '"><div class="set-help">Für die Schrittzahl. Grob: Körpergröße × 0,42 (z. B. 1,80 m → 75 cm).</div></div>' +
      '<div class="set"><div class="set-label">Puffer an der Haltestelle</div>' + seg('bufferMin', [[0, 'keiner'], [2, '2 Min.'], [5, '5 Min.'], [10, '10 Min.']], s.bufferMin) +
      '<div class="set-help">So viel früher zeigt die App die Losgeh-Zeit an.</div></div>' +
      '<div class="set"><div class="set-label">Längster Fußweg zur Haltestelle</div>' + seg('maxWalkMin', [[10, '10 Min.'], [15, '15 Min.'], [20, '20 Min.'], [30, '30 Min.']], s.maxWalkMin) + '</div>' +
      '<div class="set"><div class="set-label">Umstiege</div>' + seg('maxTransfers', [[-1, 'egal'], [0, 'keine'], [1, 'max. 1'], [2, 'max. 2']], s.maxTransfers) + '</div>' +
      '<label class="set toggle"><span><span class="set-label">Stufenfreie Wege</span><span class="set-help">Für Rollstuhl, Kinderwagen oder Rollator</span></span>' +
      '<input type="checkbox" id="wheelchair"' + (s.wheelchair ? ' checked' : '') + '><span class="switch"></span></label>' +
      '<p class="set-help">Tempo, Fußweg, Umstiege und stufenfreie Wege gelten ab der nächsten Suche.</p>';
  }

  function openSheet() {
    renderSheet();
    $('sheet').hidden = false;
    setTimeout(function () { $('sheet').classList.add('open'); }, 10);
  }

  function closeSheet() {
    $('sheet').classList.remove('open');
    $('sheet').hidden = true;
  }

  function settingsChanged() {
    save('settings', S.settings);
    if (S.search) {
      // Puffer und Schrittlänge wirken sofort auf die Anzeige
      S.search.q.settings.bufferMin = S.settings.bufferMin;
      S.search.q.settings.strideCm = S.settings.strideCm;
      var tr = S.search.transit;
      if (tr && tr.raw) {
        alignList(S.search);
        if (S.detail && S.detail.kind === 'transit') {
          var same = tr.list.filter(function (r) { return r.id === S.detail.id; })[0];
          if (same) S.detail = same;
        }
      }
      renderResults();
      if (S.view === 'detail' && S.detail) renderDetail(S.detail, S.search);
    }
  }

  // ---------------------------------------------------------------- Ereignisse

  function bind() {
    icons.fill(doc);

    ['from', 'to'].forEach(function (field) {
      var el = input(field);
      el.addEventListener('input', function () { onInput(field); });
      el.addEventListener('focus', function () {
        if (!el.value.trim() || S[field]) showDefaultSuggest(field);
        else onInput(field);
        setTimeout(function () { $('field-' + field).scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 250);
      });
      el.addEventListener('blur', function () { setTimeout(function () { if (doc.activeElement !== input('from') && doc.activeElement !== input('to')) hideSuggest(); }, 180); });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (sug.field === field && sug.items.length && !S[field] && el.value.trim().length >= 3) pickSuggest(0);
        else if (field === 'from') input('to').focus();
        else { el.blur(); onSearch(); }
      });
    });

    $('suggest').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('suggest').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sg]');
      if (b) pickSuggest(+b.getAttribute('data-sg'));
    });

    doc.addEventListener('click', function (e) {
      var c = e.target.closest('[data-clear]');
      if (c) {
        var f = c.getAttribute('data-clear');
        setPlace(f, null);
        input(f).focus();
        showDefaultSuggest(f);
      }
    });

    $('btn-locate').addEventListener('click', function () { hideSuggest(); locate('from'); });
    $('btn-swap').addEventListener('click', function () {
      var a = S.from, b = S.to, ta = input('from').value, tb = input('to').value;
      S.from = b; S.to = a;
      input('from').value = tb; input('to').value = ta;
      updateClear();
      hideSuggest();
    });

    $('modes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      var id = b.getAttribute('data-mode');
      S.sel[id] = !S.sel[id];
      if (!S.sel[id]) delete S.sel[id];
      save('modes', S.sel);
      renderModes();
    });

    $('when-type').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) setWhen(b.getAttribute('data-v'));
    });

    $('btn-search').addEventListener('click', onSearch);
    $('btn-settings').addEventListener('click', openSheet);

    $('recent').addEventListener('click', function (e) {
      var b = e.target.closest('[data-recent]');
      if (b) useRecent(+b.getAttribute('data-recent'));
    });

    var all = doc.querySelectorAll('[data-back]');
    for (var i = 0; i < all.length; i++) all[i].addEventListener('click', back);

    $('res-refresh').addEventListener('click', function () {
      if (!S.search) return;
      var q = S.search.q;
      if (q.now) q.time = new Date();
      startSearch(q);
    });

    function openFrom(e) {
      var more = e.target.closest('[data-more]');
      if (more) { loadMore(more.getAttribute('data-more')); return; }
      var retry = e.target.closest('[data-retry]');
      if (retry) {
        var what = retry.getAttribute('data-retry');
        if (what === 'transit') loadTransit(S.search); else loadDirect(S.search, what);
        return;
      }
      var card = e.target.closest('[data-open]');
      if (card) openDetail(card.getAttribute('data-open'));
    }
    $('res-body').addEventListener('click', openFrom);
    $('res-body').addEventListener('keydown', function (e) { if (e.key === 'Enter') openFrom(e); });

    $('det-share').addEventListener('click', shareRoute);

    $('sheet').addEventListener('click', function (e) {
      if (e.target.closest('[data-close-sheet]')) { closeSheet(); return; }
      var b = e.target.closest('[data-setting] [data-v]');
      if (b) {
        var name = b.parentNode.getAttribute('data-setting');
        var v = b.getAttribute('data-v');
        S.settings[name] = name === 'pace' ? v : Number(v);
        renderSheet();
        settingsChanged();
      }
    });
    $('sheet').addEventListener('input', function (e) {
      if (e.target.id === 'stride') {
        S.settings.strideCm = Number(e.target.value);
        $('stride-val').textContent = S.settings.strideCm + ' cm';
        settingsChanged();
      }
    });
    $('sheet').addEventListener('change', function (e) {
      if (e.target.id === 'wheelchair') { S.settings.wheelchair = e.target.checked; settingsChanged(); }
    });

    root.addEventListener('resize', function () { if (S.view === 'detail') U.map.refresh(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') back(); });
    setInterval(tickCountdowns, 15000);
  }

  function init() {
    renderModes();
    fillDateTime(roundedNow());
    setWhen('now');
    renderRecent();
    bind();
    doc.documentElement.classList.toggle('android', !!root.Android);
  }

  U.app = { back: back, state: S, startSearch: startSearch, openDetail: openDetail, setPlace: setPlace };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);

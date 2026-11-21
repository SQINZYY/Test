/* Oberfläche der Arbeitszeit-App */
(function () {
  'use strict';

  const C = window.Calc;
  const VERSION = '1.0';
  const KEY_DATA = 'az-data';
  const KEY_UI = 'az-ui';
  const TIME_KEYS = ['planStart', 'planEnd', 'start', 'end'];
  const bridge = window.Android || null;
  const $ = sel => document.querySelector(sel);

  // ---------- Symbole ----------
  function svg(body, size) {
    size = size || 22;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  const ICON = {
    plan: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    ist: svg('<circle cx="12" cy="12.5" r="8.5"/><path d="M12 8v4.5l3 2"/>'),
    overview: svg('<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="5" width="3" height="12.5" rx="1"/><rect x="15.5" y="8" width="3" height="9.5" rx="1"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01" stroke-width="2.6"/>'),
    settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    left: svg('<path d="M14.5 6l-6 6 6 6"/>'),
    right: svg('<path d="M9.5 6l6 6-6 6"/>'),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    x: svg('<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>', 18),
    down: svg('<path d="M7 10l5 5 5-5"/>', 16),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 20),
    share: svg('<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/>', 19)
  };

  // ---------- Speicher (Android: SharedPreferences, sonst localStorage) ----------
  function rawGet(k) {
    try { if (bridge && bridge.load) return bridge.load(k); } catch (e) { /* weiter mit localStorage */ }
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function rawSet(k, v) {
    try { if (bridge && bridge.save) { bridge.save(k, v); return; } } catch (e) { /* weiter mit localStorage */ }
    try { localStorage.setItem(k, v); } catch (e) { /* nicht speicherbar */ }
  }
  function readJSON(k) {
    const s = rawGet(k);
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function sanitizeDays(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const out = {};
    Object.keys(d).forEach(k => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const src = d[k] || {}, o = {};
      TIME_KEYS.forEach(f => { const m = C.parseHM(src[f]); if (m != null) o[f] = C.clock(m); });
      if (C.TYPES[src.type] && src.type !== 'work') o.type = src.type;
      if (Object.keys(o).length) out[k] = o;
    });
    return out;
  }

  function loadData() {
    const d = readJSON(KEY_DATA) || {};
    return { v: 1, settings: C.normSettings(d.settings), days: sanitizeDays(d.days) || {} };
  }
  let data = loadData();
  const saveData = () => rawSet(KEY_DATA, JSON.stringify(data));
  const st = () => data.settings;

  const ui = Object.assign({ tab: 'plan', fillStart: '07:00', calc: {} }, readJSON(KEY_UI) || {});
  if (!ui.calc || typeof ui.calc !== 'object') ui.calc = {};
  const saveUi = () => rawSet(KEY_UI, JSON.stringify({ tab: ui.tab, fillStart: ui.fillStart, calc: ui.calc }));

  // ---------- Zustand ----------
  const todayYmd = () => C.ymd(new Date());
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const S = { monday: C.mondayOf(todayYmd()), stack: [], depth: 0, expanded: {}, renderedDay: todayYmd() };

  const day = date => data.days[date] || {};
  function setDay(date, patch) {
    const d = Object.assign({}, data.days[date] || {}, patch);
    Object.keys(d).forEach(k => { if (d[k] === '' || d[k] == null) delete d[k]; });
    if (d.type === 'work') delete d.type;
    if (Object.keys(d).length) data.days[date] = d; else delete data.days[date];
    saveData();
  }

  // ---------- Textbausteine ----------
  const SEP = '<span class="sep">·</span>';
  const fmtNum = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const hoursLabel = () => fmtNum(st().weekHours) + ' h';
  const pauseShort = () => st().pauseMin + ' min';
  const minTxt = m => (m < 60 ? m + ' min' : C.dur(m) + ' h');
  const cls = v => (Math.round(v) > 0 ? 'pos' : Math.round(v) < 0 ? 'neg' : '');
  const diffSpan = (v, suffix) => `<span class="${cls(v)}">${C.signedDur(v)} h</span>${suffix ? ' ' + suffix : ''}`;
  const pauseLabel = p => (p > 0 ? `−${Math.round(p)} min Pause` : 'ohne Pause');
  const pill = date => (date === todayYmd() ? '<span class="pill">Heute</span>' : '');
  const wdName = date => C.WEEKDAYS[C.weekdayIdx(date)];

  function absentValue(r) {
    if (r.worked > 0) return C.dur(r.worked) + ' h angerechnet';
    if (r.type === 'flex' && r.target > 0) return '−' + C.dur(r.target) + ' h vom Konto';
    return 'kein Soll an diesem Tag';
  }

  /** Zeitfeld: zeigt die Zeit groß an, darüber liegt unsichtbar das native Zeit-Eingabefeld */
  function tf(label, value, key, opt) {
    opt = opt || {};
    const has = !!value;
    const attrs = `data-k="${key}"${opt.date ? ` data-d="${opt.date}"` : ''}${opt.scope ? ` data-scope="${opt.scope}"` : ''}`;
    const shown = has ? (opt.dur ? C.dur(C.parseHM(value)) + ' h' : value) : '––:––';
    const clear = has && !opt.noClear
      ? `<button type="button" class="tf-x" data-act="clear" ${attrs} aria-label="${label} löschen">${ICON.x}</button>` : '';
    return `<div class="tf${has ? '' : ' empty'}${opt.cls ? ' ' + opt.cls : ''}"><span class="tf-label">${label}</span>` +
      `<span class="tf-val">${shown}</span><input type="time" value="${has ? value : ''}" ${attrs} aria-label="${label}">${clear}</div>`;
  }

  // ---------- Kopf & Navigation ----------
  const TABS = [
    { id: 'plan', label: 'Plan', title: 'Geplante Zeiten', icon: ICON.plan, render: renderPlan, week: true },
    { id: 'ist', label: 'Ist-Zeit', title: 'Tatsächliche Zeiten', icon: ICON.ist, render: renderIst, week: true },
    { id: 'overview', label: 'Übersicht', title: 'Übersicht', icon: ICON.overview, render: renderOverview, week: true },
    { id: 'calc', label: 'Rechner', title: 'Rechner', icon: ICON.calc, render: renderCalc, week: false }
  ];
  const tabById = id => TABS.filter(t => t.id === id)[0] || TABS[0];

  function renderTop(tab) {
    const cur = C.mondayOf(todayYmd());
    let h = `<div class="top-row"><h1>${tab.title}</h1>`;
    if (tab.week && S.monday !== cur) h += '<button class="today-chip" data-act="thisweek">Heute</button>';
    h += `<button class="icon-btn" data-act="settings" aria-label="Einstellungen">${ICON.settings}</button></div>`;
    if (tab.week) {
      const w = C.isoWeek(S.monday);
      h += `<div class="weeknav"><button class="icon-btn" data-act="week" data-n="-1" aria-label="Vorige Woche">${ICON.left}</button>` +
        `<div class="wk"><b>KW ${w.week}${S.monday === cur ? ' · diese Woche' : ''}</b><span>${C.fmtRange(S.monday)}</span></div>` +
        `<button class="icon-btn" data-act="week" data-n="1" aria-label="Nächste Woche">${ICON.right}</button></div>`;
    }
    return h;
  }

  function render() {
    const tab = tabById(ui.tab);
    $('#top').innerHTML = renderTop(tab);
    $('#main').innerHTML = tab.render();
    $('#nav').innerHTML = TABS.map(t =>
      `<button data-act="tab" data-tab="${t.id}" class="${t.id === tab.id ? 'active' : ''}"><span class="ic">${t.icon}</span>${t.label}</button>`).join('');
    S.renderedDay = todayYmd();
  }

  // ---------- Wochen-Zusammenfassung ----------
  function summaryCard(kind, wk) {
    const val = kind === 'plan' ? wk.planned : wk.worked;
    const target = wk.target;
    const rest = Math.round(target - val);
    const pct = target > 0 ? Math.min(100, val / target * 100) : (val > 0 ? 100 : 0);
    let state = '', status;
    if (kind === 'plan') {
      if (rest > 0) status = `Noch <b>${C.dur(rest)} h</b> zu planen`;
      else if (rest < 0) { state = 'over'; status = `<b>${C.dur(-rest)} h</b> mehr geplant als das Wochensoll`; }
      else { state = 'ok'; status = 'Woche ist genau verplant'; }
    } else {
      if (rest > 0) status = `Noch <b>${C.dur(rest)} h</b> bis zum Wochensoll`;
      else if (rest < 0) { state = 'ok'; status = `Wochensoll erreicht, <b>${C.dur(-rest)} h</b> mehr`; }
      else { state = 'ok'; status = 'Wochensoll genau erreicht'; }
    }
    const w = C.isoWeek(wk.monday).week;
    const planBar = kind === 'ist' && wk.planned > 0 && target > 0
      ? `<i class="plan" style="width:${Math.min(100, wk.planned / target * 100)}%"></i>` : '';
    let extra = '';
    if (kind === 'plan') {
      extra = '<div class="actions"><button class="btn" data-act="fill">Woche ausfüllen</button>' +
        '<button class="btn" data-act="copyprev">Wie Vorwoche</button></div>';
    } else {
      const bits = [];
      if (wk.planned > 0) bits.push(`Geplant: ${C.dur(wk.planned)} h`);
      if (wk.istDays > 0) bits.push(`Saldo bisher: ${diffSpan(wk.istDiff)}`);
      if (bits.length) extra = `<div class="status" style="margin-top:4px">${bits.join(SEP)}</div>`;
    }
    return `<section class="card"><div class="eyebrow">${kind === 'plan' ? 'Geplant' : 'Gearbeitet'} in KW ${w}</div>` +
      `<div class="sum-row"><span class="sum-val">${C.dur(val)} h</span><span class="sum-of">von ${C.dur(target)} h Soll</span></div>` +
      `<div class="progress ${state}">${planBar}<i class="now" style="width:${pct}%"></i></div>` +
      `<div class="status ${state}">${status}</div>${extra}</section>`;
  }

  // ---------- Tageskarten ----------
  function dayCard(r, kind) {
    const date = r.date, d = r.day, res = r[kind];
    const kS = kind === 'plan' ? 'planStart' : 'start';
    const kE = kind === 'plan' ? 'planEnd' : 'end';
    const isToday = date === todayYmd();
    if (res.target === 0 && res.type === 'work' && !d[kS] && !d[kE] && !S.expanded[date]) {
      return `<button class="day-mini" data-act="expand" data-d="${date}"><span><b>${wdName(date)}</b> ${C.fmtDate(date)}${pill(date)}</span><span>frei · eintragen +</span></button>`;
    }
    const type = C.TYPES[res.type];
    let h = `<section class="day${isToday ? ' is-today' : ''}"><div class="day-head">` +
      `<div class="day-name"><b>${wdName(date)}</b> <span class="date">${C.fmtDate(date)}</span>${pill(date)}</div>` +
      `<button class="type-chip t-${res.type}" data-act="type" data-d="${date}">${type.label}${ICON.down}</button></div>`;
    if (res.absent) return h + `<div class="absent-body"><span>${type.info}</span><b>${absentValue(res)}</b></div></section>`;
    if (kind === 'ist') h += planRef(r.plan);
    h += '<div class="day-body">' +
      tf(kind === 'plan' ? 'Beginn' : 'Kommen', d[kS], kS, { date }) +
      tf(kind === 'plan' ? 'Ende' : 'Gehen', d[kE], kE, { date }) +
      (res.complete ? `<div class="res"><b>${C.dur(res.net)} h</b><span>Arbeitszeit</span></div>`
        : kind === 'ist' && isToday && d.start ? '<div class="res"><b class="live-txt">läuft</b><span>seit ' + d.start + '</span></div>'
          : '<div class="res empty"><b>–:––</b><span>Arbeitszeit</span></div>') + '</div>';
    h += kind === 'plan' ? planFoot(r) : istFoot(r);
    return h + '</section>';
  }

  function planRef(p) {
    if (p.absent || (!p.start && !p.end)) return '';
    if (p.complete) return `<div class="plan-ref">Geplant: ${p.start}–${p.end} (${C.dur(p.net)} h)</div>`;
    return `<div class="plan-ref">Geplant: ${p.start ? 'ab ' + p.start : 'bis ' + p.end}</div>`;
  }

  function calcLine(res) {
    const parts = [`${C.dur(res.presence)} h da`, pauseLabel(res.pause)];
    parts.push(res.target > 0 ? diffSpan(res.diff, 'zum Tagessoll') : 'zusätzlicher Tag');
    return `<div class="day-foot">${parts.join(SEP)}</div>`;
  }

  function planFoot(r) {
    const p = r.plan, d = r.day, s = st();
    if (p.complete) return calcLine(p);
    if (p.target > 0 && d.planStart && !d.planEnd) {
      const end = C.clock(C.parseHM(d.planStart) + C.presenceFor(p.target, s));
      return `<button class="suggest" data-act="suggest" data-d="${r.date}" data-k="planEnd" data-v="${end}">Ende für ${C.dur(p.target)} h Arbeitszeit: <b>${end} Uhr</b> übernehmen</button>`;
    }
    if (p.target > 0 && d.planEnd && !d.planStart) {
      const start = C.clock(C.parseHM(d.planEnd) - C.presenceFor(p.target, s));
      return `<button class="suggest" data-act="suggest" data-d="${r.date}" data-k="planStart" data-v="${start}">Beginn für ${C.dur(p.target)} h Arbeitszeit: <b>${start} Uhr</b> übernehmen</button>`;
    }
    return p.target > 0 ? `<div class="day-foot">Tagessoll ${C.dur(p.target)} h Arbeitszeit, dazu ${pauseShort()} Pause</div>` : '';
  }

  function istFoot(r) {
    const i = r.ist, p = r.plan, d = r.day;
    let h = i.complete ? calcLine(i) : '';
    const dev = [];
    if (d.start && p.start) {
      const x = C.parseHM(p.start) - C.parseHM(d.start);
      dev.push(x > 0 ? `${minTxt(x)} früher gekommen` : x < 0 ? `${minTxt(-x)} später gekommen` : 'pünktlich gekommen');
    }
    if (d.end && p.end) {
      const y = C.parseHM(d.end) - C.parseHM(p.end);
      dev.push(y > 0 ? `${minTxt(y)} länger geblieben` : y < 0 ? `${minTxt(-y)} früher gegangen` : 'pünktlich gegangen');
    }
    if (dev.length) h += `<div class="day-foot" style="margin-top:2px">Im Vergleich zum Plan: ${dev.join(', ')}</div>`;
    if (!d.start && !d.end && p.complete && r.date <= todayYmd()) {
      h += `<button class="suggest" data-act="asplanned" data-d="${r.date}">Wie geplant eintragen: <b>${p.start}–${p.end}</b></button>`;
    }
    return h;
  }

  // ---------- Heute (Kommen/Gehen) ----------
  function heroCard() {
    const t = todayYmd();
    if (C.mondayOf(t) !== S.monday) return '';
    const s = st(), d = day(t), info = C.todayInfo(t, nowMin(), data.days, s), r = info.r;
    const now = C.clock(nowMin());
    const head = `<div class="hero-head"><span>Heute · ${C.WEEKDAYS_LONG[C.weekdayIdx(t)]}, ${C.fmtDateLong(t)}</span>` +
      `${info.running ? '<span class="live"><i></i>läuft</span>' : ''}</div>`;
    let body;
    if (r.absent) {
      body = `<div class="hero-big">${C.TYPES[r.type].label}</div><div class="hero-sub">${absentValue(r)}</div>`;
    } else if (!d.start) {
      const sub = d.planStart ? `Geplant: ${d.planStart}${d.planEnd ? '–' + d.planEnd : ''} Uhr`
        : r.target > 0 ? `Tagessoll ${C.dur(r.target)} h Arbeitszeit` : 'Heute ist kein Arbeitstag';
      body = `<div class="hero-big">Noch nicht da</div><div class="hero-sub">${sub}</div>` +
        `<button class="btn big" data-act="stamp" data-k="start">Kommen <small>· jetzt ${now}</small></button>`;
    } else if (!d.end) {
      const li = [];
      if (info.leaveDay != null) {
        const done = info.presence >= C.presenceFor(r.target, s);
        li.push([`Tagessoll ${C.dur(r.target)} h ${done ? 'erreicht' : 'erreicht um'}`, done ? 'seit ' + C.clock(info.leaveDay) : C.clock(info.leaveDay) + ' Uhr']);
      }
      if (info.weekRemaining <= 0) li.push([`Wochensoll ${hoursLabel()}`, 'schon erreicht']);
      else if (info.leaveWeek != null && Math.abs(info.weekRemaining - r.target) >= 1 && info.weekRemaining <= 16 * 60) {
        li.push([`Wochensoll ${hoursLabel()} voll um`, C.clock(info.leaveWeek) + ' Uhr']);
      }
      if (d.planEnd) li.push(['Geplanter Feierabend', d.planEnd + ' Uhr']);
      body = `<div class="hero-big">${C.dur(info.net)} <small>h gearbeitet</small></div>` +
        `<div class="hero-sub">Da seit ${d.start} Uhr · ${C.dur(info.presence)} h anwesend, ${pauseShort()} Pause schon abgezogen</div>` +
        (li.length ? `<ul class="hero-list">${li.map(x => `<li><span>${x[0]}</span><b>${x[1]}</b></li>`).join('')}</ul>` : '') +
        `<button class="btn big" data-act="stamp" data-k="end">Gehen <small>· jetzt ${now}</small></button>`;
    } else {
      body = `<div class="hero-big">${C.dur(r.net)} <small>h gearbeitet</small></div>` +
        `<div class="hero-sub">${d.start}–${d.end} Uhr · ${r.target > 0 ? C.signedDur(r.diff) + ' h zum Tagessoll' : 'zusätzlicher Tag'}</div>`;
    }
    return `<section class="hero" id="hero">${head}${body}</section>`;
  }

  // ---------- Reiter ----------
  function renderPlan() {
    const wk = C.weekCalc(S.monday, data.days, st());
    return summaryCard('plan', wk) + wk.rows.map(r => dayCard(r, 'plan')).join('') +
      `<p class="foot-note">Tippe auf Beginn oder Ende, um eine Uhrzeit zu wählen. Pro Arbeitstag werden automatisch ${pauseShort()} Mittagspause abgezogen.</p>`;
  }

  function renderIst() {
    const wk = C.weekCalc(S.monday, data.days, st());
    return heroCard() + summaryCard('ist', wk) + wk.rows.map(r => dayCard(r, 'ist')).join('') +
      `<p class="foot-note">Trage hier ein, wann du wirklich gekommen und gegangen bist. ${pauseShort()} Mittagspause werden automatisch abgezogen.</p>`;
  }

  function tile(label, value, c) { return `<div class="tile"><span>${label}</span><b class="${c || ''}">${value}</b></div>`; }

  function barRow(r, max) {
    const p = r.plan, i = r.ist, wd = wdName(r.date);
    if (i.absent) {
      return `<div class="bar-row"><span class="bar-day">${wd}</span><span class="bar-tag">${C.TYPES[i.type].label} · ${absentValue(i)}</span></div>`;
    }
    const pw = p.complete ? p.worked / max * 100 : 0;
    const iw = i.complete ? i.worked / max * 100 : 0;
    return `<div class="bar-row"><span class="bar-day">${wd}</span><div class="bar-track">` +
      `<i class="b-plan" style="width:${pw}%"></i><i class="b-ist" style="width:${iw}%"></i>` +
      (p.target > 0 ? `<i class="b-target" style="left:${p.target / max * 100}%"></i>` : '') + '</div>' +
      `<span class="bar-val">${i.complete ? C.dur(i.worked) : '–'}</span>` +
      `<span class="bar-diff ${i.complete ? cls(i.diff) : ''}">${i.complete && i.target > 0 ? C.signedDur(i.diff) : ''}</span></div>`;
  }

  function renderOverview() {
    const s = st(), t = todayYmd();
    const wk = C.weekCalc(S.monday, data.days, s);
    const open = Math.round(wk.target - wk.worked);
    let h = `<section class="card"><h2>KW ${C.isoWeek(S.monday).week}</h2><div class="tiles">` +
      tile('Soll', C.dur(wk.target) + ' h') + tile('Geplant', C.dur(wk.planned) + ' h') +
      tile('Gearbeitet', C.dur(wk.worked) + ' h') +
      (open >= 0 ? tile('Noch offen', C.dur(open) + ' h') : tile('Mehr als Soll', '+' + C.dur(-open) + ' h', 'pos')) +
      '</div>' + (wk.istDays ? `<p class="note-row">An den ${wk.istDays} erfassten Tagen: ${diffSpan(wk.istDiff)} zum Soll</p>` : '') + '</section>';

    const rows = wk.rows.filter(r => r.plan.target > 0 || r.plan.complete || r.ist.complete);
    let max = 600;
    rows.forEach(r => { max = Math.max(max, r.plan.worked, r.ist.worked, r.plan.target); });
    h += '<section class="card"><h3>Tage</h3><div class="legend"><span><i class="l-plan"></i>Geplant</span>' +
      '<span><i class="l-ist"></i>Gearbeitet</span><span><i class="l-target"></i>Tagessoll</span></div>' +
      rows.map(r => barRow(r, max)).join('') + '</section>';

    const b = C.balance(data.days, s, t);
    h += `<section class="card"><div class="eyebrow">Überstundenkonto</div><div class="balance ${cls(b.total)}">${C.signedDur(b.total)} h</div>` +
      `<p class="hint">Stand heute aus ${b.count} erfasste${b.count === 1 ? 'm Tag' : 'n Tagen'}` +
      `${s.startBalance ? `, inklusive Startwert ${C.signedDur(s.startBalance)} h` : ''}. Es zählen nur Tage mit Kommen und Gehen (oder Urlaub, Krank, Feiertag, Gleittag).</p></section>`;

    const weeks = C.weeksWithData(data.days, t).slice(0, 10);
    if (weeks.length) {
      h += '<section class="card"><h3>Letzte Wochen</h3><ul class="week-list">' + weeks.map(m => {
        const x = C.weekCalc(m, data.days, s);
        return `<li><button data-act="gotoweek" data-m="${m}"><span><b>KW ${C.isoWeek(m).week}</b> <span class="muted">${C.fmtDate(m)}–${C.fmtDate(C.addDays(m, 6))}</span></span>` +
          `<span class="wl-r"><span>${C.dur(x.worked)} h</span><span class="${cls(x.istDiff)}">${x.istDays ? C.signedDur(x.istDiff) : ''}</span></span></button></li>`;
      }).join('') + '</ul></section>';
    }
    h += `<button class="btn primary big" data-act="shareweek">${ICON.share} Woche teilen</button>`;
    return h;
  }

  function renderCalc() {
    const s = st(), c = ui.calc, avg = C.avgTarget(s);
    const avgHM = C.clock(Math.round(avg));
    const net1 = c.net1 || avgHM, net2 = c.net2 || avgHM;

    const sp = C.span(c.from, c.to, s);
    const out1 = sp ? `<div class="calc-out"><div class="big">${C.dur(sp.net)} h Arbeitszeit</div><div class="lines">` +
      `<div class="kv"><span>Anwesend</span><b>${C.dur(sp.presence)} h</b></div>` +
      `<div class="kv"><span>Mittagspause</span><b>−${sp.pause} min</b></div>` +
      `<div class="kv"><span>Zum Tagessoll (${C.dur(avg)} h)</span><b class="${cls(sp.net - avg)}">${C.signedDur(sp.net - avg)} h</b></div></div></div>`
      : '<div class="calc-out empty">Von und Bis eintragen</div>';

    const st2 = C.parseHM(c.start), n1 = C.parseHM(net1);
    let out2 = '<div class="calc-out empty">Beginn eintragen</div>';
    if (st2 != null && n1 != null) {
      const p = C.presenceFor(n1, s);
      out2 = `<div class="calc-out"><div class="big">${C.clock(st2 + p)} Uhr</div><div class="lines">${C.dur(p)} h anwesend, davon ${p - n1} min Pause</div></div>`;
    }
    const en3 = C.parseHM(c.end), n2 = C.parseHM(net2);
    let out3 = '<div class="calc-out empty">Feierabend eintragen</div>';
    if (en3 != null && n2 != null) {
      const p = C.presenceFor(n2, s);
      out3 = `<div class="calc-out"><div class="big">${C.clock(en3 - p)} Uhr</div><div class="lines">${C.dur(p)} h anwesend, davon ${p - n2} min Pause</div></div>`;
    }
    const o = { scope: 'calc' };
    return '<section class="card"><h3>Wie lange war ich da?</h3><div class="calc-grid">' +
      tf('Von', c.from, 'from', o) + tf('Bis', c.to, 'to', o) + '</div>' + out1 + '</section>' +
      '<section class="card"><h3>Wann habe ich Feierabend?</h3><div class="calc-grid">' +
      tf('Beginn', c.start, 'start', o) + tf('Arbeitszeit', net1, 'net1', { scope: 'calc', dur: true, noClear: true }) + '</div>' + out2 + '</section>' +
      '<section class="card"><h3>Wann muss ich anfangen?</h3><div class="calc-grid">' +
      tf('Feierabend', c.end, 'end', o) + tf('Arbeitszeit', net2, 'net2', { scope: 'calc', dur: true, noClear: true }) + '</div>' + out3 + '</section>' +
      `<p class="foot-note">Gerechnet wird mit ${pauseShort()} Mittagspause${s.pauseRule === 'over6' ? ' (erst ab 6 h Anwesenheit)' : ''} und ${C.dur(avg)} h Tagessoll (${hoursLabel()} pro Woche).</p>`;
  }

  // ---------- Blätter (unten) und Einstellungen ----------
  const SHEETS = {
    type(sh) {
      const cur = day(sh.date).type || 'work';
      return `<div class="grab"></div><h2>${C.WEEKDAYS_LONG[C.weekdayIdx(sh.date)]}, ${C.fmtDateLong(sh.date)}</h2><p>Was ist an diesem Tag?</p><ul class="opt-list">` +
        Object.keys(C.TYPES).map(k => `<li><button class="opt t-${k}" data-act="settype" data-v="${k}"><i class="dot"></i>` +
          `<span><b>${C.TYPES[k].label}</b><small>${C.TYPES[k].info}</small></span>${k === cur ? `<i class="check">${ICON.check}</i>` : ''}</button></li>`).join('') +
        '</ul>';
    },

    fill(sh) {
      const s = st(), dates = C.weekDates(S.monday);
      const sel = dates.filter(d => sh.sel.indexOf(d) >= 0);
      const res = C.planFill(S.monday, data.days, s, ui.fillStart, sel);
      let preview, ok = false;
      if (!sel.length) preview = '<div class="preview err">Wähle mindestens einen Tag.</div>';
      else if (!res) preview = '<div class="preview err">Beginn wählen.</div>';
      else if (res.error) preview = `<div class="preview err">${res.error}</div>`;
      else {
        ok = true;
        const ends = sel.map(d => res.changes[d].planEnd);
        const same = ends.every(e => e === ends[0]);
        preview = '<div class="preview">' + (same
          ? `${sel.length === 1 ? wdName(sel[0]) : sel.length + ' Tage je'} <b>${ui.fillStart}–${ends[0]} Uhr</b><br>${C.dur(res.changes[sel[0]].net)} h Arbeitszeit + ${pauseShort()} Pause pro Tag`
          : sel.map(d => `${wdName(d)} <b>${res.changes[d].planStart}–${res.changes[d].planEnd}</b> (${C.dur(res.changes[d].net)} h)`).join('<br>')) + '</div>';
        if (sel.some(d => day(d).planStart || day(d).planEnd)) preview += '<p class="hint">Bereits geplante Zeiten an diesen Tagen werden ersetzt.</p>';
      }
      const chips = dates.map(d => {
        const absent = day(d).type && day(d).type !== 'work';
        return `<button class="chip${sel.indexOf(d) >= 0 ? ' on' : ''}" data-act="fillday" data-d="${d}"${absent ? ' disabled' : ''}>${wdName(d)}</button>`;
      }).join('');
      return '<div class="grab"></div><h2>Woche ausfüllen</h2>' +
        `<p>Das Wochensoll von ${hoursLabel()} wird gleichmäßig auf die gewählten Tage verteilt (Urlaub &amp; Co. sind schon abgezogen). Pro Tag kommen ${pauseShort()} Pause dazu.</p>` +
        tf('Beginn', ui.fillStart, 'fillStart', { scope: 'fill', noClear: true, cls: 'wide' }) +
        `<div class="field-label">Tage</div><div class="chips week">${chips}</div>${preview}` +
        `<div class="sheet-actions"><button class="btn plain" data-act="close">Abbrechen</button><button class="btn primary" data-act="dofill"${ok ? '' : ' disabled'}>Ausfüllen</button></div>`;
    },

    confirm(sh) {
      return `<div class="grab"></div><h2>${sh.title}</h2><p>${sh.text}</p><div class="sheet-actions">` +
        `<button class="btn plain" data-act="close">Abbrechen</button><button class="btn ${sh.danger ? 'danger' : 'primary'}" data-act="confirm">${sh.ok}</button></div>`;
    },

    import() {
      return '<div class="grab"></div><h2>Backup einfügen</h2><p>Füge den Text eines Backups ein. Deine aktuellen Daten werden dabei ersetzt.</p>' +
        '<textarea id="imp" placeholder="{&quot;v&quot;:1, …}" spellcheck="false"></textarea>' +
        '<div class="sheet-actions"><button class="btn plain" data-act="paste">Aus Zwischenablage</button><button class="btn primary" data-act="doimport">Importieren</button></div>';
    },

    settings() {
      const s = st();
      const wdChips = C.WEEKDAYS.map((w, i) =>
        `<button class="chip${s.workdays.indexOf(i) >= 0 ? ' on' : ''}" data-act="wd" data-i="${i}">${w}</button>`).join('');
      const seg = (act, cur, opts) => `<div class="seg">${opts.map(o =>
        `<button class="${o[0] === cur ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
      const n = Object.keys(data.days).length;
      return `<div class="page"><div class="page-head"><button class="icon-btn" data-act="close" aria-label="Zurück">${ICON.back}</button><h2>Einstellungen</h2></div>` +
        '<section class="card"><h3>Arbeitszeit</h3>' +
        `<div class="set-row"><label for="s-week">Pro Woche</label><span class="unit"><input id="s-week" data-set="weekHours" inputmode="decimal" value="${settingValue('weekHours')}">Stunden</span></div>` +
        `<div class="field-label" style="margin-top:4px">Arbeitstage</div><div class="chips week">${wdChips}</div>` +
        `<p class="hint" id="s-avg">${avgHint()}</p></section>` +
        '<section class="card"><h3>Mittagspause</h3>' +
        `<div class="set-row"><label for="s-pause">Dauer</label><span class="unit"><input id="s-pause" data-set="pauseMin" inputmode="numeric" value="${settingValue('pauseMin')}">Minuten</span></div>` +
        seg('prule', s.pauseRule, [['always', 'Immer abziehen'], ['over6', 'Erst ab 6 h']]) +
        `<p class="hint">${s.pauseRule === 'over6' ? 'Die Pause wird nur abgezogen, wenn du an dem Tag länger als 6 Stunden da bist.' : 'Die Pause wird von jedem Arbeitstag automatisch abgezogen.'}</p></section>` +
        '<section class="card"><h3>Überstundenkonto</h3>' +
        `<div class="set-row"><label for="s-bal">Startwert</label><input id="s-bal" class="text-in" data-set="startBalance" value="${settingValue('startBalance')}"></div>` +
        '<p class="hint">Zum Beispiel „+12:30“ oder „-4“. Änderungen an Wochenstunden, Arbeitstagen und Pause gelten auch rückwirkend.</p></section>' +
        '<section class="card"><h3>Design</h3>' + seg('theme', s.theme, [['system', 'Wie System'], ['light', 'Hell'], ['dark', 'Dunkel']]) + '</section>' +
        `<section class="card"><h3>Daten</h3><p class="hint" style="margin:0 0 12px">Alles bleibt auf diesem Handy gespeichert (${n} Tag${n === 1 ? '' : 'e'} eingetragen). Mit einem Backup kannst du die Daten aufs neue Handy mitnehmen.</p>` +
        '<div class="stack"><button class="btn" data-act="backup">Backup teilen</button><button class="btn" data-act="import">Backup einfügen</button>' +
        '<button class="btn danger" data-act="wipe">Alle Zeiten löschen</button></div></section>' +
        `<p class="version">Arbeitszeit ${VERSION}</p></div>`;
    }
  };

  function settingValue(k) {
    const s = st();
    if (k === 'weekHours') return fmtNum(s.weekHours);
    if (k === 'pauseMin') return String(s.pauseMin);
    return C.signedDur(s.startBalance).replace('±', '');
  }
  const avgHint = () => `= ${C.dur(C.avgTarget(st()))} h Arbeitszeit an jedem der ${st().workdays.length} Arbeitstage`;

  function renderSheet() {
    const el = $('#sheet');
    // Scrollposition der offenen Ebenen merken, damit Änderungen nicht nach oben springen
    const scroll = Array.prototype.map.call(el.querySelectorAll('.layer'), l => {
      const panel = l.querySelector('.sheet-panel');
      return (panel || l).scrollTop;
    });
    if (!S.stack.length) {
      el.className = ''; el.innerHTML = ''; document.body.classList.remove('locked'); S.depth = 0;
      return;
    }
    el.className = 'open';
    document.body.classList.add('locked');
    el.innerHTML = S.stack.map((sh, i) => {
      const anim = i >= S.depth ? ' anim' : '';
      return sh.kind === 'settings'
        ? `<div class="layer page-mode${anim}">${SHEETS.settings(sh)}</div>`
        : `<div class="layer${anim}"><div class="scrim" data-act="close"></div><div class="sheet-panel">${SHEETS[sh.kind](sh)}</div></div>`;
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.layer'), (l, i) => {
      const panel = l.querySelector('.sheet-panel');
      if (scroll[i]) (panel || l).scrollTop = scroll[i];
    });
    S.depth = S.stack.length;
  }
  const topSheet = () => S.stack[S.stack.length - 1] || null;
  function openSheet(sh) { S.stack.push(sh); renderSheet(); }
  function closeSheet() { S.stack.pop(); renderSheet(); }
  function rerenderAll() { render(); renderSheet(); }

  // ---------- Hinweise, Teilen ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function copyText(text) {
    try { if (bridge && bridge.copy) { bridge.copy(text); return true; } } catch (e) { /* weiter */ }
    try { navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }

  function share(text, title) {
    try { if (bridge && bridge.share) { bridge.share(text, title); return; } } catch (e) { /* weiter */ }
    if (navigator.share) { navigator.share({ title, text }).catch(() => {}); return; }
    toast(copyText(text) ? 'In die Zwischenablage kopiert' : 'Teilen ist hier nicht möglich');
  }

  function weekText() {
    const s = st(), wk = C.weekCalc(S.monday, data.days, s);
    const lines = [`Arbeitszeit KW ${C.isoWeek(S.monday).week} (${C.fmtRange(S.monday)})`, ''];
    wk.rows.forEach(r => {
      const i = r.ist, label = `${wdName(r.date)} ${C.fmtDate(r.date)}`;
      if (i.absent) lines.push(`${label}  ${C.TYPES[i.type].label}${i.worked ? ' (' + C.dur(i.worked) + ' h angerechnet)' : ''}`);
      else if (i.complete) lines.push(`${label}  ${i.start}–${i.end}  =  ${C.dur(i.net)} h`);
      else if (r.plan.target > 0) lines.push(`${label}  –`);
    });
    lines.push('', `Summe: ${C.dur(wk.worked)} h von ${C.dur(wk.target)} h (${C.signedDur(wk.worked - wk.target)} h)`);
    lines.push(`Mittagspause: ${pauseShort()} pro Tag abgezogen`);
    return lines.join('\n');
  }

  // ---------- Aktionen ----------
  const ACTIONS = {
    tab(ds) { ui.tab = ds.tab; saveUi(); render(); window.scrollTo(0, 0); },
    week(ds) { S.monday = C.addDays(S.monday, 7 * Number(ds.n)); render(); },
    thisweek() { S.monday = C.mondayOf(todayYmd()); render(); },
    gotoweek(ds) { S.monday = ds.m; render(); window.scrollTo(0, 0); },
    settings() { openSheet({ kind: 'settings' }); },
    close() { closeSheet(); },
    expand(ds) { S.expanded[ds.d] = true; render(); },

    clear(ds) {
      if (ds.scope === 'calc') { delete ui.calc[ds.k]; saveUi(); } else setDay(ds.d, { [ds.k]: '' });
      render();
    },
    suggest(ds) { setDay(ds.d, { [ds.k]: ds.v }); render(); },
    asplanned(ds) { const d = day(ds.d); setDay(ds.d, { start: d.planStart, end: d.planEnd }); render(); },
    stamp(ds) {
      const now = C.clock(nowMin());
      setDay(todayYmd(), { [ds.k]: now });
      render();
      toast(`${ds.k === 'start' ? 'Kommen' : 'Gehen'} um ${now} Uhr eingetragen`);
    },

    type(ds) { openSheet({ kind: 'type', date: ds.d }); },
    settype(ds) { setDay(topSheet().date, { type: ds.v }); closeSheet(); render(); },

    fill() {
      const s = st();
      const sel = C.weekDates(S.monday).filter(d => s.workdays.indexOf(C.weekdayIdx(d)) >= 0 && !(day(d).type && day(d).type !== 'work'));
      openSheet({ kind: 'fill', sel });
    },
    fillday(ds) {
      const sh = topSheet(), i = sh.sel.indexOf(ds.d);
      if (i >= 0) sh.sel.splice(i, 1); else sh.sel.push(ds.d);
      renderSheet();
    },
    dofill() {
      const sh = topSheet();
      const res = C.planFill(S.monday, data.days, st(), ui.fillStart, C.weekDates(S.monday).filter(d => sh.sel.indexOf(d) >= 0));
      if (!res || res.error) return;
      Object.keys(res.changes).forEach(d => setDay(d, { planStart: res.changes[d].planStart, planEnd: res.changes[d].planEnd }));
      closeSheet(); render();
      toast('Woche ausgefüllt');
    },
    copyprev() {
      const prev = C.addDays(S.monday, -7), dates = C.weekDates(S.monday);
      const isAbsent = d => day(d).type && day(d).type !== 'work';
      const changes = [];
      dates.forEach((d, i) => {
        const from = day(C.addDays(prev, i));
        if ((from.planStart || from.planEnd) && !isAbsent(d)) changes.push([d, from]);
      });
      if (!changes.length) { toast('In der Vorwoche ist nichts geplant'); return; }
      const apply = () => {
        changes.forEach(c => setDay(c[0], { planStart: c[1].planStart || '', planEnd: c[1].planEnd || '' }));
        render();
        toast('Plan der Vorwoche übernommen');
      };
      if (dates.some(d => day(d).planStart || day(d).planEnd)) {
        openSheet({ kind: 'confirm', title: 'Plan überschreiben?', text: 'Die geplanten Zeiten dieser Woche werden durch die der Vorwoche ersetzt.', ok: 'Übernehmen', onOk: apply });
      } else apply();
    },
    confirm() { const fn = topSheet().onOk; closeSheet(); fn(); },

    shareweek() { share(weekText(), `Arbeitszeit KW ${C.isoWeek(S.monday).week}`); },

    wd(ds) {
      const s = Object.assign({}, st()), i = Number(ds.i);
      const w = s.workdays.slice(), at = w.indexOf(i);
      if (at >= 0) { if (w.length === 1) { toast('Mindestens ein Arbeitstag'); return; } w.splice(at, 1); } else w.push(i);
      s.workdays = w;
      data.settings = C.normSettings(s); saveData(); rerenderAll();
    },
    prule(ds) { data.settings = C.normSettings(Object.assign({}, st(), { pauseRule: ds.v })); saveData(); rerenderAll(); },
    theme(ds) { data.settings = C.normSettings(Object.assign({}, st(), { theme: ds.v })); saveData(); applyTheme(); rerenderAll(); },
    backup() { share(JSON.stringify(data), 'Arbeitszeit-Backup'); },
    import() { openSheet({ kind: 'import' }); },
    paste() {
      let t = null;
      try { if (bridge && bridge.getClipboard) t = bridge.getClipboard(); } catch (e) { t = null; }
      if (t) $('#imp').value = t;
      else if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(x => { $('#imp').value = x; }).catch(() => toast('Zwischenablage ist leer'));
      else toast('Zwischenablage ist leer');
    },
    doimport() {
      let obj = null;
      try { obj = JSON.parse(($('#imp').value || '').trim()); } catch (e) { obj = null; }
      const days = obj && sanitizeDays(obj.days);
      if (!days) { toast('Das ist kein gültiges Backup'); return; }
      data = { v: 1, settings: C.normSettings(obj.settings), days };
      saveData(); applyTheme();
      S.stack = []; renderSheet(); render();
      toast(`${Object.keys(days).length} Tage importiert`);
    },
    wipe() {
      openSheet({
        kind: 'confirm', title: 'Alle Zeiten löschen?', danger: true, ok: 'Löschen',
        text: 'Alle geplanten und tatsächlichen Zeiten werden gelöscht. Die Einstellungen bleiben. Das lässt sich nicht rückgängig machen.',
        onOk() { data.days = {}; saveData(); rerenderAll(); toast('Alle Zeiten gelöscht'); }
      });
    }
  };

  function onSetting(inp) {
    const k = inp.dataset.set, s = Object.assign({}, st());
    let ok = true;
    if (k === 'weekHours') {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (v > 0 && v <= 100) s.weekHours = Math.round(v * 100) / 100; else ok = false;
    } else if (k === 'pauseMin') {
      const v = parseInt(inp.value, 10);
      if (v >= 0 && v <= 240) s.pauseMin = v; else ok = false;
    } else if (k === 'startBalance') {
      const v = C.parseDuration(inp.value === '' ? '0' : inp.value);
      if (v != null) s.startBalance = v; else ok = false;
    }
    if (!ok) toast('Ungültiger Wert');
    data.settings = C.normSettings(s);
    saveData();
    inp.value = settingValue(k);
    const hint = $('#s-avg');
    if (hint) hint.textContent = avgHint();
    render();
  }

  function onTime(inp) {
    const v = (inp.value || '').slice(0, 5);
    const k = inp.dataset.k;
    if (inp.dataset.scope === 'calc') {
      if (v) ui.calc[k] = v; else delete ui.calc[k];
      saveUi(); render();
    } else if (inp.dataset.scope === 'fill') {
      ui.fillStart = v || '07:00';
      saveUi(); renderSheet();
    } else if (inp.dataset.d && TIME_KEYS.indexOf(k) >= 0) {
      setDay(inp.dataset.d, { [k]: v });
      render();
    }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = ACTIONS[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b.dataset, b); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.set) onSetting(t);
    else if (t.type === 'time') onTime(t);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.set) e.target.blur();
  });

  // ---------- Design (hell/dunkel) ----------
  let sysDark = null;
  function systemDark() {
    if (sysDark != null) return sysDark;
    try { if (bridge && bridge.isDark) return !!bridge.isDark(); } catch (e) { /* weiter */ }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function applyTheme() {
    const p = st().theme;
    const dark = p === 'dark' || (p === 'system' && systemDark());
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { if (bridge && bridge.setDark) bridge.setDark(dark); } catch (e) { /* egal */ }
  }
  if (!bridge && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }

  // ---------- Live-Anzeige & Android-Anbindung ----------
  let lastMin = -1;
  function tick(force) {
    const t = todayYmd();
    if (t !== S.renderedDay) {
      if (S.monday === C.mondayOf(S.renderedDay)) S.monday = C.mondayOf(t);
      render();
      return;
    }
    const m = nowMin();
    if (m === lastMin && !force) return;
    lastMin = m;
    const hero = $('#hero');
    if (hero) hero.outerHTML = heroCard();
  }
  setInterval(tick, 10000);

  window.AZ = {
    back() { if (S.stack.length) { closeSheet(); return true; } return false; },
    refresh() { tick(true); },
    systemTheme(dark) { sysDark = !!dark; applyTheme(); }
  };

  applyTheme();
  render();
})();

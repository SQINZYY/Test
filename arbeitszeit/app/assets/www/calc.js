/*
 * Rechenlogik der Arbeitszeit-App (ohne Oberfläche, damit sie sich mit Node testen lässt).
 * Zeiten werden intern als Minuten gerechnet, Tage als "JJJJ-MM-TT".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(this, function () {
  'use strict';

  var DAY_MIN = 1440;
  var WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  var MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Art des Tages. "credit": das Tagessoll wird angerechnet (zählt wie gearbeitet).
  var TYPES = {
    work: { label: 'Arbeit', info: 'Normale Arbeitszeit mit Beginn und Ende' },
    vacation: { label: 'Urlaub', credit: true, info: 'Tagessoll wird angerechnet' },
    sick: { label: 'Krank', credit: true, info: 'Tagessoll wird angerechnet' },
    holiday: { label: 'Feiertag', credit: true, info: 'Tagessoll wird angerechnet' },
    flex: { label: 'Gleittag', credit: false, info: 'Überstunden abbauen: das Tagessoll geht vom Konto ab' }
  };

  var DEFAULTS = {
    weekHours: 39,          // Wochenarbeitszeit in Stunden
    workdays: [0, 1, 2, 3, 4], // Mo–Fr (0 = Montag)
    pauseMin: 30,           // Mittagspause in Minuten
    pauseRule: 'always',    // 'always' = immer abziehen, 'over6' = erst bei mehr als 6 h Anwesenheit
    startBalance: 0,        // Startwert des Überstundenkontos in Minuten
    theme: 'system'
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function num(x) { return typeof x === 'number' && isFinite(x); }

  // ---------- Uhrzeiten & Dauern ----------

  /** "07:05" → 425, sonst null */
  function parseHM(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /** Minuten → Uhrzeit "07:05" (über Mitternacht hinaus wird umgebrochen) */
  function clock(min) {
    var r = Math.round(min);
    r = ((r % DAY_MIN) + DAY_MIN) % DAY_MIN;
    return pad(Math.floor(r / 60)) + ':' + pad(r % 60);
  }

  /** Minuten → Dauer "7:48" (negativ mit "−") */
  function dur(min) {
    var r = Math.round(Math.abs(min));
    var sign = min < 0 && r > 0 ? '−' : '';
    return sign + Math.floor(r / 60) + ':' + pad(r % 60);
  }

  /** Minuten → "+0:03", "−1:12", "±0:00" */
  function signedDur(min) {
    var r = Math.round(min);
    return (r > 0 ? '+' : r < 0 ? '−' : '±') + dur(Math.abs(r));
  }

  /** "39", "38,5", "7:48", "-2:30", "+1,5 h" → Minuten (mit Vorzeichen), sonst null */
  function parseDuration(s) {
    if (s == null) return null;
    s = String(s).trim().replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/(h|std\.?|stunden)$/i, '');
    if (!s) return null;
    var sign = 1;
    if (s.charAt(0) === '-') { sign = -1; s = s.slice(1); } else if (s.charAt(0) === '+') s = s.slice(1);
    var m = /^(\d{1,5}):(\d{1,2})$/.exec(s);
    if (m) return +m[2] > 59 ? null : sign * (+m[1] * 60 + +m[2]);
    m = /^(\d{1,5})(?:[.,](\d+))?$/.exec(s);
    if (m) return sign * Math.round(parseFloat(m[1] + '.' + (m[2] || '0')) * 60);
    return null;
  }

  /** Anwesenheit von Beginn bis Ende in Minuten. Ende vor Beginn = über Mitternacht. */
  function presence(start, end) {
    var a = parseHM(start), b = parseHM(end);
    if (a == null || b == null) return null;
    var d = b - a;
    if (d < 0) d += DAY_MIN;
    return d;
  }

  /** Abzuziehende Pause für eine Anwesenheit */
  function pauseFor(pres, st) {
    if (pres == null || pres <= 0) return 0;
    if (st.pauseRule === 'over6' && pres <= 360) return 0;
    return Math.min(st.pauseMin, pres);
  }

  /** Nötige Anwesenheit, um eine bestimmte Arbeitszeit (netto) zu erreichen */
  function presenceFor(netMin, st) {
    if (netMin <= 0) return 0;
    if (st.pauseRule === 'over6' && netMin <= 360) return netMin;
    return netMin + st.pauseMin;
  }

  /** Rechner: Von–Bis → Anwesenheit, Pause, Arbeitszeit */
  function span(start, end, st) {
    var p = presence(start, end);
    if (p == null) return null;
    var pause = pauseFor(p, st);
    return { presence: p, pause: pause, net: p - pause };
  }

  // ---------- Datum ----------

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n) { var d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  /** 0 = Montag … 6 = Sonntag */
  function weekdayIdx(s) { return (fromYmd(s).getDay() + 6) % 7; }
  function mondayOf(s) { return addDays(s, -weekdayIdx(s)); }
  function weekDates(monday) { var r = []; for (var i = 0; i < 7; i++) r.push(addDays(monday, i)); return r; }

  /** ISO-Kalenderwoche */
  function isoWeek(s) {
    var d = fromYmd(s);
    var thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - (d.getDay() + 6) % 7, 12);
    var jan1 = new Date(thu.getFullYear(), 0, 1, 12);
    return { week: Math.floor(Math.round((thu - jan1) / 86400000) / 7) + 1, year: thu.getFullYear() };
  }

  function fmtDate(s) { var d = fromYmd(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; }
  function fmtDateLong(s) { var d = fromYmd(s); return d.getDate() + '. ' + MONTHS_LONG[d.getMonth()]; }
  function fmtRange(monday) {
    var a = fromYmd(monday), b = fromYmd(addDays(monday, 6));
    if (a.getFullYear() !== b.getFullYear())
      return a.getDate() + '. ' + MONTHS[a.getMonth()] + ' ' + a.getFullYear() + ' – ' + b.getDate() + '. ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
    if (a.getMonth() !== b.getMonth())
      return a.getDate() + '. ' + MONTHS[a.getMonth()] + ' – ' + b.getDate() + '. ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
    return a.getDate() + '.–' + b.getDate() + '. ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
  }

  // ---------- Einstellungen ----------

  function normSettings(s) {
    s = s || {};
    var o = {
      weekHours: DEFAULTS.weekHours, workdays: DEFAULTS.workdays.slice(), pauseMin: DEFAULTS.pauseMin,
      pauseRule: DEFAULTS.pauseRule, startBalance: DEFAULTS.startBalance, theme: DEFAULTS.theme
    };
    if (num(s.weekHours) && s.weekHours > 0 && s.weekHours <= 100) o.weekHours = s.weekHours;
    if (Array.isArray(s.workdays)) {
      var w = [];
      s.workdays.forEach(function (i) { if (num(i) && i >= 0 && i <= 6 && i === Math.floor(i) && w.indexOf(i) < 0) w.push(i); });
      w.sort();
      if (w.length) o.workdays = w;
    }
    if (num(s.pauseMin) && s.pauseMin >= 0 && s.pauseMin <= 240) o.pauseMin = Math.round(s.pauseMin);
    if (s.pauseRule === 'over6') o.pauseRule = 'over6';
    if (num(s.startBalance) && Math.abs(s.startBalance) < 600000) o.startBalance = Math.round(s.startBalance);
    if (s.theme === 'light' || s.theme === 'dark') o.theme = s.theme;
    return o;
  }

  /** Durchschnittliche Arbeitszeit pro Arbeitstag (39 h / 5 Tage = 468 min = 7:48 h) */
  function avgTarget(st) { return st.workdays.length ? st.weekHours * 60 / st.workdays.length : 0; }

  /** Tagessoll eines Datums in Minuten (0 an freien Tagen) */
  function dailyTarget(date, st) {
    return st.workdays.indexOf(weekdayIdx(date)) >= 0 ? avgTarget(st) : 0;
  }

  // ---------- Tage & Wochen ----------

  /**
   * Ergebnis eines Tages für den Plan ("plan") oder die tatsächlichen Zeiten ("ist").
   * worked = Arbeitszeit inkl. angerechneter Abwesenheit, diff = worked − Tagessoll.
   */
  function dayCalc(day, date, st, kind) {
    day = day || {};
    var target = dailyTarget(date, st);
    var type = TYPES[day.type] ? day.type : 'work';
    if (type !== 'work') {
      var credit = TYPES[type].credit ? target : 0;
      return { type: type, target: target, absent: true, complete: true, worked: credit, diff: credit - target,
        presence: null, pause: 0, net: null, start: null, end: null };
    }
    var start = (kind === 'plan' ? day.planStart : day.start) || null;
    var end = (kind === 'plan' ? day.planEnd : day.end) || null;
    var p = presence(start, end);
    if (p == null) {
      return { type: type, target: target, absent: false, complete: false, worked: 0, diff: null,
        presence: null, pause: 0, net: null, start: start, end: end };
    }
    var pause = pauseFor(p, st);
    return { type: type, target: target, absent: false, complete: true, worked: p - pause, diff: p - pause - target,
      presence: p, pause: pause, net: p - pause, start: start, end: end };
  }

  function weekCalc(monday, days, st) {
    var rows = weekDates(monday).map(function (date) {
      var day = days[date] || {};
      return { date: date, day: day, plan: dayCalc(day, date, st, 'plan'), ist: dayCalc(day, date, st, 'ist') };
    });
    var target = 0, planned = 0, worked = 0, istDiff = 0, istDays = 0;
    rows.forEach(function (r) {
      target += r.plan.target;
      if (r.plan.complete) planned += r.plan.worked;
      if (r.ist.complete) { worked += r.ist.worked; istDiff += r.ist.diff; istDays++; }
    });
    return { monday: monday, rows: rows, target: target, planned: planned, worked: worked, istDiff: istDiff, istDays: istDays };
  }

  /** Überstundenkonto: Startwert + Abweichungen aller erfassten Tage bis einschließlich "today" */
  function balance(days, st, today) {
    var total = st.startBalance || 0, count = 0;
    Object.keys(days).forEach(function (date) {
      if (date > today) return;
      var r = dayCalc(days[date], date, st, 'ist');
      if (r.complete) { total += r.diff; count++; }
    });
    return { total: total, count: count };
  }

  /** Montage aller Wochen mit Einträgen (bis einschließlich der Woche von "today"), neueste zuerst */
  function weeksWithData(days, today) {
    var last = mondayOf(today), seen = {};
    Object.keys(days).forEach(function (date) {
      var m = mondayOf(date);
      if (m <= last) seen[m] = true;
    });
    return Object.keys(seen).sort().reverse();
  }

  /**
   * Stand für heute, wenn schon "Kommen" eingetragen ist und noch kein "Gehen":
   * bisherige Arbeitszeit und wann Tages- bzw. Wochensoll erreicht sind.
   */
  function todayInfo(date, nowMin, days, st) {
    var day = days[date] || {};
    var r = dayCalc(day, date, st, 'ist');
    var info = { r: r, target: r.target, running: false };
    var startMin = parseHM(day.start);
    if (r.absent || startMin == null || day.end) return info;
    var p = nowMin - startMin;
    if (p < 0) p += DAY_MIN;
    info.running = true;
    info.presence = p;
    info.net = Math.max(0, p - pauseFor(p, st));
    info.leaveDay = r.target > 0 ? startMin + presenceFor(r.target, st) : null;
    var wk = weekCalc(mondayOf(date), days, st);
    var others = 0;
    wk.rows.forEach(function (x) { if (x.date !== date && x.ist.complete) others += x.ist.worked; });
    info.weekRemaining = wk.target - others;
    info.leaveWeek = info.weekRemaining > 0 ? startMin + presenceFor(info.weekRemaining, st) : null;
    return info;
  }

  /**
   * "Woche ausfüllen": verteilt das restliche Wochensoll gleichmäßig auf die gewählten Tage.
   * Nicht gewählte Tage mit Plan (und angerechnete Abwesenheiten) werden vorher abgezogen.
   */
  function planFill(monday, days, st, startHM, selected) {
    var start = parseHM(startHM);
    if (start == null || !selected.length) return null;
    var wk = weekCalc(monday, days, st);
    var budget = wk.target;
    wk.rows.forEach(function (r) {
      if (selected.indexOf(r.date) < 0 && r.plan.complete) budget -= r.plan.worked;
    });
    budget = Math.round(budget);
    if (budget <= 0) return { error: 'Die Woche ist ohne diese Tage schon voll geplant.', budget: budget };
    var n = selected.length, base = Math.floor(budget / n), extra = budget - base * n;
    var changes = {};
    selected.forEach(function (date, i) {
      var share = base + (i < extra ? 1 : 0);
      changes[date] = { planStart: clock(start), planEnd: clock(start + presenceFor(share, st)), net: share };
    });
    return { changes: changes, budget: budget, perDay: budget / n };
  }

  return {
    DAY_MIN: DAY_MIN, WEEKDAYS: WEEKDAYS, WEEKDAYS_LONG: WEEKDAYS_LONG, MONTHS: MONTHS, MONTHS_LONG: MONTHS_LONG,
    TYPES: TYPES, DEFAULTS: DEFAULTS,
    pad: pad, parseHM: parseHM, clock: clock, dur: dur, signedDur: signedDur, parseDuration: parseDuration,
    presence: presence, pauseFor: pauseFor, presenceFor: presenceFor, span: span,
    ymd: ymd, fromYmd: fromYmd, addDays: addDays, weekdayIdx: weekdayIdx, mondayOf: mondayOf, weekDates: weekDates,
    isoWeek: isoWeek, fmtDate: fmtDate, fmtDateLong: fmtDateLong, fmtRange: fmtRange,
    normSettings: normSettings, avgTarget: avgTarget, dailyTarget: dailyTarget,
    dayCalc: dayCalc, weekCalc: weekCalc, balance: balance, weeksWithData: weeksWithData,
    todayInfo: todayInfo, planFill: planFill
  };
});

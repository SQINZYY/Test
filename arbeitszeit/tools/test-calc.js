// Tests für die Rechenlogik: node arbeitszeit/tools/test-calc.js
'use strict';
const assert = require('assert');
const C = require('../app/assets/www/calc.js');

let n = 0;
function t(name, fn) { fn(); n++; }
const st = C.normSettings({});

t('Standard: 39 h, Mo–Fr, 30 min Pause', () => {
  assert.strictEqual(st.weekHours, 39);
  assert.deepStrictEqual(st.workdays, [0, 1, 2, 3, 4]);
  assert.strictEqual(st.pauseMin, 30);
  assert.strictEqual(C.avgTarget(st), 468); // 7:48 h
  assert.strictEqual(C.dur(C.avgTarget(st)), '7:48');
});

t('Uhrzeiten und Dauern', () => {
  assert.strictEqual(C.parseHM('06:57'), 417);
  assert.strictEqual(C.parseHM('7:00'), 420);
  assert.strictEqual(C.parseHM('24:00'), null);
  assert.strictEqual(C.parseHM(''), null);
  assert.strictEqual(C.clock(15 * 60 + 18), '15:18');
  assert.strictEqual(C.clock(1440 + 30), '00:30');
  assert.strictEqual(C.dur(-75), '−1:15');
  assert.strictEqual(C.signedDur(3), '+0:03');
  assert.strictEqual(C.signedDur(-72), '−1:12');
  assert.strictEqual(C.signedDur(0.2), '±0:00');
  assert.strictEqual(C.parseDuration('38,5'), 2310);
  assert.strictEqual(C.parseDuration('-2:30'), -150);
  assert.strictEqual(C.parseDuration('+12'), 720);
  assert.strictEqual(C.parseDuration('−1,5 h'), -90);
  assert.strictEqual(C.parseDuration('abc'), null);
});

t('Pause wird immer abgezogen', () => {
  const s = C.span('07:00', '15:18', st);
  assert.deepStrictEqual(s, { presence: 498, pause: 30, net: 468 });
  assert.strictEqual(C.span('06:57', '15:20', st).net, 473); // 7:53 h
  assert.strictEqual(C.span('08:00', '08:20', st).net, 0);    // kürzer als die Pause
  assert.strictEqual(C.span('22:00', '06:00', st).net, 450);  // Nachtschicht
});

t('Pause erst ab 6 h Anwesenheit (Option)', () => {
  const s6 = C.normSettings({ pauseRule: 'over6' });
  assert.strictEqual(C.span('08:00', '12:00', s6).net, 240);
  assert.strictEqual(C.span('08:00', '14:00', s6).net, 360);
  assert.strictEqual(C.span('08:00', '14:30', s6).net, 360);
  assert.strictEqual(C.presenceFor(300, s6), 300);
  assert.strictEqual(C.presenceFor(468, s6), 498);
});

t('Datum und Kalenderwoche', () => {
  assert.strictEqual(C.weekdayIdx('2026-11-12'), 3); // Donnerstag
  assert.strictEqual(C.mondayOf('2026-11-15'), '2026-11-09');
  assert.deepStrictEqual(C.isoWeek('2026-11-12'), { week: 46, year: 2026 });
  assert.deepStrictEqual(C.isoWeek('2026-01-01'), { week: 1, year: 2026 });
  assert.deepStrictEqual(C.isoWeek('2027-01-01'), { week: 53, year: 2026 });
  assert.deepStrictEqual(C.isoWeek('2024-12-30'), { week: 1, year: 2025 });
  assert.strictEqual(C.addDays('2026-03-28', 2), '2026-03-30'); // Zeitumstellung
  assert.strictEqual(C.fmtRange('2026-11-09'), '9.–15. Nov. 2026');
  assert.strictEqual(C.fmtRange('2026-11-30'), '30. Nov. – 6. Dez. 2026');
  assert.strictEqual(C.fmtRange('2026-12-28'), '28. Dez. 2026 – 3. Jan. 2027');
});

t('Woche: 5 × 07:00–15:18 = genau 39 h', () => {
  const days = {};
  C.weekDates('2026-11-09').slice(0, 5).forEach(d => { days[d] = { planStart: '07:00', planEnd: '15:18' }; });
  const wk = C.weekCalc('2026-11-09', days, st);
  assert.strictEqual(wk.target, 39 * 60);
  assert.strictEqual(wk.planned, 39 * 60);
  assert.strictEqual(wk.worked, 0);
});

t('Tatsächliche Zeiten, früher gekommen', () => {
  const days = { '2026-11-09': { planStart: '07:00', planEnd: '15:18', start: '06:57', end: '15:18' } };
  const r = C.dayCalc(days['2026-11-09'], '2026-11-09', st, 'ist');
  assert.strictEqual(r.presence, 501);
  assert.strictEqual(r.net, 471);
  assert.strictEqual(r.diff, 3);
});

t('Urlaub/Feiertag werden angerechnet, Gleittag geht vom Konto ab', () => {
  const days = {
    '2026-11-09': { type: 'holiday' },
    '2026-11-10': { type: 'vacation' },
    '2026-11-11': { type: 'flex' },
    '2026-11-12': { start: '07:00', end: '16:00' }
  };
  const wk = C.weekCalc('2026-11-09', days, st);
  assert.strictEqual(wk.worked, 468 * 2 + 510);
  assert.strictEqual(wk.istDiff, -468 + 42);
  const b = C.balance(days, st, '2026-11-12');
  assert.strictEqual(b.total, -426);
  assert.strictEqual(b.count, 4);
});

t('Überstundenkonto mit Startwert, Zukunft zählt nicht', () => {
  const s = C.normSettings({ startBalance: 120 });
  const days = { '2026-11-10': { start: '07:00', end: '16:00' }, '2026-11-20': { start: '07:00', end: '18:00' } };
  assert.strictEqual(C.balance(days, s, '2026-11-12').total, 120 + 42);
});

t('Heute: Feierabend für Tages- und Wochensoll', () => {
  const days = {
    '2026-11-09': { start: '07:00', end: '16:00' }, // 8:30
    '2026-11-10': { start: '07:00', end: '16:00' },
    '2026-11-11': { start: '07:00', end: '16:00' },
    '2026-11-12': { start: '07:00', end: '16:00' },
    '2026-11-13': { start: '06:57' }
  };
  const i = C.todayInfo('2026-11-13', 10 * 60, days, st);
  assert.strictEqual(i.running, true);
  assert.strictEqual(i.presence, 183);
  assert.strictEqual(i.net, 153);
  assert.strictEqual(C.clock(i.leaveDay), '15:15');  // 06:57 + 7:48 + 0:30
  assert.strictEqual(i.weekRemaining, 2340 - 4 * 510); // 5:00 h
  assert.strictEqual(C.clock(i.leaveWeek), '12:27');
});

t('Woche ausfüllen verteilt das Restsoll', () => {
  const days = { '2026-11-09': { type: 'holiday' } };
  const sel = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const f = C.planFill('2026-11-09', days, st, '07:00', sel);
  assert.strictEqual(f.budget, 4 * 468);
  sel.forEach(d => assert.deepStrictEqual(f.changes[d], { planStart: '07:00', planEnd: '15:18', net: 468 }));
  const odd = C.planFill('2026-11-09', {}, C.normSettings({ weekHours: 38.6 }), '06:30', C.weekDates('2026-11-09').slice(0, 5));
  const sum = Object.values(odd.changes).reduce((a, c) => a + c.net, 0);
  assert.strictEqual(sum, 2316);
  const full = C.planFill('2026-11-09', { '2026-11-09': { planStart: '06:00', planEnd: '23:59' }, '2026-11-10': { planStart: '06:00', planEnd: '23:59' }, '2026-11-11': { planStart: '06:00', planEnd: '23:59' } }, st, '07:00', ['2026-11-12']);
  assert.ok(full.error);
});

t('Einstellungen werden geprüft', () => {
  const s = C.normSettings({ weekHours: -3, workdays: [9, 'x'], pauseMin: 1000, pauseRule: 'egal', theme: 'dark' });
  assert.strictEqual(s.weekHours, 39);
  assert.deepStrictEqual(s.workdays, [0, 1, 2, 3, 4]);
  assert.strictEqual(s.pauseMin, 30);
  assert.strictEqual(s.pauseRule, 'always');
  assert.strictEqual(s.theme, 'dark');
  const four = C.normSettings({ workdays: [3, 0, 1, 2, 3] });
  assert.deepStrictEqual(four.workdays, [0, 1, 2, 3]);
  assert.strictEqual(C.dailyTarget('2026-11-13', four), 0); // Freitag frei
  assert.strictEqual(C.dailyTarget('2026-11-12', four), 585);
});

t('Wochen mit Daten', () => {
  const w = C.weeksWithData({ '2026-11-02': {}, '2026-11-10': {}, '2026-11-11': {}, '2026-12-01': {} }, '2026-11-12');
  assert.deepStrictEqual(w, ['2026-11-09', '2026-11-02']);
});

console.log(n + ' Tests bestanden');

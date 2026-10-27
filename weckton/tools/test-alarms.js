// Tests für die Auswertung der Samsung-Wecker: node weckton/tools/test-alarms.js
'use strict';
const assert = require('assert');
const A = require('../app/assets/www/alarms.js');

// Wochentage so kodieren, wie die Samsung-Uhr es tut: Tag (Calendar: So=1 … Sa=7) → Bit ((7 - Tag) + 1) * 4
const CAL = { So: 1, Mo: 2, Di: 3, Mi: 4, Do: 5, Fr: 6, Sa: 7 };
function repeat(type, ...days) {
  let r = type;
  for (const d of days) r |= 1 << (((7 - CAL[d]) + 1) * 4);
  return r;
}
const alarm = (o) => Object.assign({ id: 1, active: 1, time: 730, repeat: repeat(5, 'Mo'), brief: 0, alert: -1, volume: 11, toneIndex: 3, tone: 'content://media/internal/audio/media/48', toneTitle: 'Morgentau', name: '' }, o);

let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log('ok  ' + name);
}

test('Uhrzeit', () => {
  assert.strictEqual(A.time(alarm({ time: 730 })), '07:30');
  assert.strictEqual(A.time(alarm({ time: 0 })), '00:00');
  assert.strictEqual(A.time(alarm({ time: 2359 })), '23:59');
});

test('Wochentage entschlüsseln', () => {
  assert.deepStrictEqual(A.days(repeat(5, 'Mo', 'Mi', 'So')), [true, false, true, false, false, false, true]);
  assert.deepStrictEqual(A.days(repeat(5, 'Sa')), [false, false, false, false, false, true, false]);
});

test('Wiederholung als Text', () => {
  const now = new Date(2026, 9, 27, 21, 0).getTime(); // Di, 27.10.2026
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(5, 'Mo', 'Di', 'Mi', 'Do', 'Fr') }), now), 'Mo–Fr');
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(5, 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So') }), now), 'Täglich');
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(5, 'Sa', 'So') }), now), 'Wochenende');
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(5, 'Di', 'Do') }), now), 'Di, Do');
  const tomorrow = new Date(2026, 9, 28, 7, 30).getTime();
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(1, 'Mi'), alert: tomorrow }), now), 'Einmalig · morgen');
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(1, 'Mi'), active: 0, alert: tomorrow }), now), 'Einmalig');
  const xmas = new Date(2026, 11, 24, 8, 0).getTime();
  assert.strictEqual(A.repeatText(alarm({ repeat: repeat(1, 'Do'), brief: 1, alert: xmas }), now), 'Am Do, 24.12.');
});

test('Status', () => {
  assert.strictEqual(A.statusText(alarm({ active: 0 })), 'Aus');
  assert.strictEqual(A.statusText(alarm({ active: 1 })), 'An');
  assert.strictEqual(A.statusText(alarm({ active: 2 })), 'Schlummert');
});

test('Ton', () => {
  assert.deepStrictEqual(A.sound(alarm({})), { off: false, text: 'Morgentau' });
  assert.strictEqual(A.sound(alarm({ toneTitle: '' })).text, 'Eigener Ton');
  assert.strictEqual(A.sound(alarm({ toneTitle: '', tone: '' })).text, 'Standardton');
  assert.deepStrictEqual(A.sound(alarm({ brief: 8192 })), { off: true, text: 'Weckton ausgeschaltet' });
  assert.strictEqual(A.sound(alarm({ tone: 'alarm_silent_ringtone' })).off, true);
  assert.strictEqual(A.sound(alarm({ toneIndex: -2 })).off, true);
  assert.strictEqual(A.sound(alarm({ volume: 0 })).off, true);
  assert.strictEqual(A.sound(alarm({ brief: 16384 })).text, 'Bixby-Briefing');
});

test('Schon gesetzter Ton wird erkannt', () => {
  const uri = 'content://media/external/audio/media/812';
  assert.strictEqual(A.hasSound(alarm({ tone: uri }), uri), true);
  assert.strictEqual(A.hasSound(alarm({ tone: uri, brief: 16384 }), uri), false);
  assert.strictEqual(A.hasSound(alarm({}), uri), false);
  assert.strictEqual(A.hasSound(alarm({}), null), false);
});

test('Sortierung nach Uhrzeit', () => {
  const s = A.sortAlarms([alarm({ id: 3, time: 900 }), alarm({ id: 1, time: 600 }), alarm({ id: 2, time: 600 })]);
  assert.deepStrictEqual(s.map((a) => a.id), [1, 2, 3]);
});

console.log(n + ' Tests bestanden');

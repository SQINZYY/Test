/* Macht die Rohdaten der Samsung-Uhr lesbar: Uhrzeit, Wochentage, Ton. Reine Logik, auch in Node testbar. */
(function (root) {
  'use strict';

  // Wochentage im Feld "repeattype": je 4 Bit pro Tag, Samstag ab Bit 4 … Montag ab Bit 24, Sonntag ab Bit 28.
  // Die unteren 4 Bit sind die Art: 1 = einmalig, 5 = wöchentlich.
  const DAYS = [
    { short: 'Mo', shift: 24 }, { short: 'Di', shift: 20 }, { short: 'Mi', shift: 16 }, { short: 'Do', shift: 12 },
    { short: 'Fr', shift: 8 }, { short: 'Sa', shift: 4 }, { short: 'So', shift: 28 },
  ];
  const WEEKLY = 5;
  // Bits im Feld "dailybrief"
  const SPECIFIC_DATE = 1;
  const TONE_OFF = 64;
  const MASTER_SOUND_OFF = 8192;
  const BIXBY = 16384;
  const CELEB = 32768;
  const SILENT = 'alarm_silent_ringtone';
  const WEEKDAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const pad = (n) => String(n).padStart(2, '0');

  function time(a) {
    return pad(Math.floor(a.time / 100) % 24) + ':' + pad(a.time % 100);
  }

  /** [Mo, Di, Mi, Do, Fr, Sa, So] als true/false */
  function days(repeat) {
    return DAYS.map((d) => ((repeat >>> d.shift) & 15) !== 0);
  }

  function isWeekly(a) {
    return (a.repeat & 15) === WEEKLY;
  }

  function dateLabel(ms, now) {
    const d = new Date(ms);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    if (diff === 0) return 'heute';
    if (diff === 1) return 'morgen';
    return WEEKDAY_NAMES[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.';
  }

  /** "Mo–Fr", "Täglich", "Einmalig · morgen", "Am Fr, 24.12." … */
  function repeatText(a, now) {
    if ((a.brief & SPECIFIC_DATE) && a.alert > 0) return 'Am ' + dateLabel(a.alert, now);
    if (isWeekly(a)) {
      const d = days(a.repeat);
      const n = d.filter(Boolean).length;
      if (n === 7) return 'Täglich';
      if (n === 5 && d.slice(0, 5).every(Boolean)) return 'Mo–Fr';
      if (n === 2 && d[5] && d[6]) return 'Wochenende';
      if (n > 0) return DAYS.filter((_, i) => d[i]).map((x) => x.short).join(', ');
    }
    if (a.active > 0 && a.alert > 0) return 'Einmalig · ' + dateLabel(a.alert, now);
    return 'Einmalig';
  }

  function statusText(a) {
    if (a.active === 2) return 'Schlummert';
    return a.active > 0 ? 'An' : 'Aus';
  }

  /** Was beim Wecken zu hören ist. off = es kommt kein Ton (auch nach dem Ändern nicht). */
  function sound(a) {
    if (a.brief & MASTER_SOUND_OFF) return { off: true, text: 'Weckton ausgeschaltet' };
    if (a.tone === SILENT || a.toneIndex === -2) return { off: true, text: 'Lautlos' };
    if (a.volume === 0) return { off: true, text: 'Lautstärke 0' };
    if (a.brief & (BIXBY | CELEB)) return { off: false, text: 'Bixby-Briefing' };
    return { off: false, text: a.toneTitle || (a.tone ? 'Eigener Ton' : 'Standardton') };
  }

  /** Hat der Wecker schon diesen Ton? */
  function hasSound(a, uri) {
    return !!uri && a.tone === uri && !(a.brief & (TONE_OFF | BIXBY | CELEB));
  }

  function sortAlarms(list) {
    return list.slice().sort((x, y) => (x.time - y.time) || (x.id - y.id));
  }

  const api = { DAYS, time, days, isWeekly, repeatText, statusText, sound, hasSound, sortAlarms, dateLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Alarms = api;
})(this);

// Zeigt die Oberfläche im Browser mit 100 Beispiel-Weckern und speichert Screenshots.
// Aufruf: node weckton/tools/ui-preview.js <ausgabe-ordner>   (braucht Playwright mit Chromium)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.argv[2] || path.join(__dirname, '..', 'build', 'preview');
const PAGE = 'file://' + path.join(__dirname, '..', 'app', 'assets', 'www', 'index.html');

// Ersetzt die Android-Brücke durch eine Attrappe mit Beispiel-Weckern
function mock(opts) {
  const CAL = { So: 1, Mo: 2, Di: 3, Mi: 4, Do: 5, Fr: 6, Sa: 7 };
  const rep = (type, days) => days.reduce((r, d) => r | (1 << (((7 - CAL[d]) + 1) * 4)), type);
  const patterns = [rep(5, ['Mo', 'Di', 'Mi', 'Do', 'Fr']), rep(5, ['Sa', 'So']), rep(5, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']), rep(1, ['Mi']), rep(5, ['Di', 'Do'])];
  const names = ['', 'Arbeit', '', 'Training', '', '', 'Tabletten', ''];
  const tones = [['content://media/internal/audio/media/48', 'Morgentau'], ['content://media/internal/audio/media/51', 'Sonnenaufgang'], ['content://media/internal/audio/media/60', 'Spaziergang im Wald']];
  const alarms = [];
  for (let i = 0; i < (opts.count == null ? 100 : opts.count); i++) {
    const t = tones[i % 3];
    alarms.push({
      id: i + 1, active: i % 3 === 0 ? 1 : 0, time: (5 + Math.floor(i / 6)) % 24 * 100 + (i * 5) % 60,
      repeat: patterns[i % patterns.length], brief: i === 4 ? 8192 : 0, alert: Date.now() + 86400000, volume: 11,
      toneIndex: 2, tone: t[0], toneTitle: t[1], name: names[i % names.length],
    });
  }
  let backup = 0;
  let sound = null;
  window.Android = {
    load: () => JSON.stringify(opts.status === 'ok'
      ? { status: 'ok', alarms, clockAudio: opts.clockAudio || 'ok', backup, canWriteSettings: false, defaultAlarm: 'Morgentau', sound }
      : { status: opts.status, backup: 0, defaultAlarm: 'Morgentau' }),
    pickSound: () => {
      W.onSoundLoading();
      setTimeout(() => { sound = { uri: 'content://media/external/audio/media/812', title: 'Lieblingssong' }; W.onSound(sound); }, 300);
    },
    preview: () => {},
    stopPreview: () => W.onPreviewEnd(),
    apply: (ids, uri) => {
      const list = JSON.parse(ids);
      setTimeout(() => {
        for (const a of alarms) if (list.includes(a.id)) { a.tone = uri; a.toneTitle = 'Lieblingssong'; }
        backup += list.length;
        W.onApplied({ ok: list.length, failed: 0 });
      }, 300);
    },
    restore: () => setTimeout(() => { W.onRestored({ ok: backup, gone: 0, failed: 0 }); backup = 0; }, 300),
    setDefault: () => 'permission',
    openClock: () => {},
    openClockSettings: () => {},
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const shot = async (page, name, full) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
  };
  const open = async (opts) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(mock, opts);
    await page.goto(PAGE);
    return page;
  };

  let page = await open({ status: 'ok' });
  await shot(page, '1-start');
  await page.click('[data-a=pick]');
  await page.waitForSelector('.play');
  await page.click('[data-a=all]');
  await shot(page, '2-alle-ausgewaehlt');
  await page.click('[data-a=filter][data-f=on]');
  await page.click('[data-a=all]');
  await page.click('[data-a=all]');
  await page.click('.alarm[data-id="4"]');
  await shot(page, '3-filter-an');
  await page.click('#bar [data-a=apply]');
  await page.waitForSelector('.sheet');
  await shot(page, '4-fertig');
  await page.click('.sheet [data-a=close]');
  await shot(page, '5-nachher', true);
  await page.close();

  page = await open({ status: 'ok', clockAudio: 'denied' });
  await shot(page, '6-berechtigung-fehlt');
  await page.close();

  page = await open({ status: 'no_samsung' });
  await shot(page, '7-keine-samsung-uhr');
  await page.close();

  page = await open({ status: 'ok', count: 0 });
  await shot(page, '8-keine-wecker');
  await page.close();

  await browser.close();
  if (errors.length) {
    console.error('Fehler in der Seite:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('Screenshots in ' + OUT);
})();

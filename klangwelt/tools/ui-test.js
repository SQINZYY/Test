// Oberflächen-Test für Klangwelt (Playwright/Chromium) mit nachgebautem Spotify-Player und oEmbed.
// Aufruf: node klangwelt/tools/ui-test.js [bilder-ordner]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'build', 'klangwelt-ui'));
fs.mkdirSync(OUT, { recursive: true });

// Nachbau der Spotify iFrame API: lädt Songs, spielt die "Vorschau" beschleunigt ab und meldet Fortschritt/Ende
const FAKE_IFRAME_API = `(() => {
  window.__embed = { loads: [], plays: 0 };
  const api = { createController(el, opts, cb) {
    const frame = document.createElement('div');
    frame.className = 'fake-embed';
    frame.style.cssText = 'height:152px;background:linear-gradient(90deg,#3a3a5a,#272727);color:#fff;font:13px sans-serif;display:flex;align-items:center;padding:0 16px';
    frame.textContent = 'Spotify-Player (Test)';
    el.replaceWith(frame);
    let uri = opts.uri, pos = 0, playing = false, timer = null;
    const listeners = {};
    const D = 30000;
    const emit = (ev, data) => (listeners[ev] || []).forEach(f => f({ data }));
    const state = p => emit('playback_update', { isPaused: p, isBuffering: false, duration: D, position: pos });
    const tick = () => {
      if (!playing) return;
      pos += 250 * (window.__embedSpeed || 1);
      if (pos >= D) { pos = D; playing = false; clearInterval(timer); state(true); return; }
      state(false);
    };
    const c = {
      addListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      loadUri(u) { uri = u; pos = 0; playing = false; clearInterval(timer); window.__embed.loads.push(u); frame.dataset.uri = u; setTimeout(() => emit('ready', {}), 40); },
      play() {
        if ((window.__noPreview || []).includes(uri)) return;
        playing = true; window.__embed.plays++; clearInterval(timer); timer = setInterval(tick, 250);
      },
      resume() { c.play(); },
      pause() { playing = false; clearInterval(timer); state(true); },
      seek(s) { pos = s * 1000; state(!playing); },
    };
    window.__embed.loads.push(uri);
    frame.dataset.uri = uri;
    window.__embed.ctrl = c;
    setTimeout(() => { cb(c); emit('ready', {}); }, 40);
  } };
  setTimeout(() => window.onSpotifyIframeApiReady(api), 10);
})();`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/mock/cover/')) {
    let h = 0;
    for (const c of u.pathname) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(' + (h % 360) + ',55%,40%)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,.35)"/><circle cx="150" cy="150" r="12" fill="#111"/></svg>');
    return;
  }
  const file = path.join(WEB, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
  if (!file.startsWith(WEB) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let BASE = '';
const oembedCalls = [];

async function newPage(browser, opts, init) {
  const context = await browser.newContext(opts);
  await context.route('https://open.spotify.com/embed/iframe-api/v1', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_IFRAME_API }));
  await context.route('https://open.spotify.com/oembed**', r => {
    const id = new URL(new URL(r.request().url()).searchParams.get('url')).pathname.split('/').pop();
    oembedCalls.push(id);
    return r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x', thumbnail_url: BASE + '/mock/cover/' + id + '.svg' }) });
  });
  await context.addInitScript(o => {
    window.__kwNoPreviewMs = 2500;
    window.__embedSpeed = o.speed || 1;
    if (o.android) {
      window.__android = { opened: [], spotify: [] };
      window.Android = {
        openUrl: u => window.__android.opened.push(u),
        openSpotify: u => { window.__android.spotify.push(u); return true; },
        copy: t => { window.__android.copied = t; },
        appVersion: () => '1.0.0',
        get: (id, url) => setTimeout(() => Platform._http(id, 200, JSON.stringify({ thumbnail_url: location.origin + '/mock/cover/a.svg' })), 20),
      };
    }
  }, init || {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { context, page, errors };
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('Bild: ' + name + '.png');
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e).split('\n').slice(0, 8).join('\n     ')); }
  };

  const d = await newPage(browser, { viewport: { width: 1440, height: 900 } }, { speed: 12 });
  const P = d.page;
  const title = () => P.textContent('.np-t');

  await check('Start: Katalog lädt, Startseite mit Stimmungen, Charts und Künstlern', async () => {
    await P.goto(BASE + '/index.html');
    await P.waitForSelector('#home-secs .sec', { timeout: 20000 });
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    for (const s of ['Stimmungen', 'Charts', 'Beliebte Künstler', 'Genres entdecken']) assert.ok(secs.includes(s), s + ' fehlt: ' + secs);
    assert.ok(await P.$('.welcome'), 'Begrüßung für neue Nutzer');
    assert.strictEqual(await P.$$eval('.shortcut', x => x.length), 8);
  });
  await shot(P, 'pc-1-start');

  await check('Suche: Künstler als bester Treffer, Songs, Abspielen über den Spotify-Player', async () => {
    await P.click('.side-nav a[href="#/search"]');
    await P.fill('#q', 'bad bunny');
    await P.waitForSelector('#r-songs .trow');
    assert.ok((await P.textContent('.best')).includes('Bad Bunny'));
    await P.dblclick('#r-songs .trow:nth-child(1) .c-dur');
    await P.waitForFunction(() => window.__embed && window.__embed.plays > 0);
    const first = await P.getAttribute('#r-songs .trow:nth-child(1)', 'data-id');
    assert.strictEqual(await P.evaluate(() => window.__embed.loads[window.__embed.loads.length - 1]), 'spotify:track:' + first);
    await P.waitForFunction(() => document.querySelector('.np-t').textContent.length > 2 && !/nichts/.test(document.querySelector('.np-t').textContent));
    assert.ok(await P.$('.npp-info .facts'), 'Song-Infos im Jetzt-läuft-Bereich');
    // Der Spotify-Player liegt über dem Platzhalter im Jetzt-läuft-Bereich
    const host = await P.$eval('#embed-host', e => ({ parked: e.classList.contains('parked'), top: e.getBoundingClientRect().top }));
    const slot = await P.$eval('[data-slot="panel"]', e => e.getBoundingClientRect().top);
    assert.ok(!host.parked && Math.abs(host.top - slot) < 2, JSON.stringify(host) + ' vs ' + slot);
  });
  await shot(P, 'pc-2-suche');

  await check('Ende der Vorschau: nächster Song startet von selbst', async () => {
    const before = await title();
    await P.waitForFunction(t => document.querySelector('.np-t').textContent !== t, before, { timeout: 15000 });
  });

  await check('Lieblingssong: Herz im Player, Bibliothek zählt mit', async () => {
    await P.click('.player .np-like');
    await P.waitForFunction(() => document.querySelector('.side-list .lib-row').textContent.includes('1 Song'));
  });

  await check('Künstlerseite: Beliebt, Alben, ähnliche Künstler, Folgen', async () => {
    await P.goto(BASE + '/index.html#/search');
    await P.fill('#q', 'rammstein');
    await P.waitForSelector('.best:has-text("Rammstein")');
    await P.click('.best');
    await P.waitForSelector('#ar-top .trow');
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    for (const s of ['Beliebt', 'Alben und Singles', 'Das gefällt Fans auch']) assert.ok(secs.includes(s), s + ' fehlt: ' + secs);
    await P.click('[data-act="follow"]');
    assert.strictEqual(await P.textContent('[data-act="follow"]'), 'Gefolgt');
    await P.click('.side-lib [data-chip="artists"]');
    assert.ok((await P.textContent('.side-list')).includes('Rammstein'));
    await P.click('.side-lib [data-chip="artists"]');
  });
  await shot(P, 'pc-3-kuenstler');

  await check('Playlist erstellen, Songs suchen und hinzufügen, Empfehlungen', async () => {
    await P.click('[data-act="new-playlist"]');
    await P.waitForSelector('#pl-q');
    await P.fill('#pl-q', 'dancing queen');
    await P.waitForSelector('#pl-add .trow [data-act="add"]');
    await P.click('#pl-add .trow:nth-child(1) [data-act="add"]');
    await P.waitForSelector('#list .trow');
    await P.waitForSelector('#pl-add .trow [data-act="add"]');
    assert.ok((await P.textContent('.find h2')).includes('Empfohlen'));
    await P.click('#pl-add .trow:nth-child(1) [data-act="add"]');
    await P.waitForFunction(() => document.querySelectorAll('#list .trow').length === 2);
    assert.ok((await P.textContent('.hero-by')).includes('2 Songs'));
  });
  await shot(P, 'pc-4-playlist');

  await check('Playlist umbenennen', async () => {
    await P.click('.hero-title');
    await P.fill('#pl-name', 'Sommer 2026');
    await P.click('.modal .btn-primary');
    await P.waitForFunction(() => document.querySelector('.hero-title').textContent === 'Sommer 2026');
    assert.ok((await P.textContent('.side-list')).includes('Sommer 2026'));
  });

  await check('Stimmungs-Mix „Party“: 50 Songs, als Playlist speichern', async () => {
    await P.goto(BASE + '/index.html#/mix/mood-party');
    await P.waitForSelector('#list .trow');
    assert.strictEqual(await P.$$eval('#list .trow', r => r.length), 50);
    await P.click('[data-act="save-mix"]');
    await P.waitForFunction(() => document.querySelector('.side-list').textContent.includes('Party'));
  });
  await shot(P, 'pc-5-mix');

  await check('Genre: Top-Songs und Genre-Radio', async () => {
    await P.goto(BASE + '/index.html#/genre/german');
    await P.waitForSelector('#list .trow');
    await P.click('[data-act="genre-radio"]');
    await P.waitForFunction(() => document.querySelector('.npp-ctx').textContent === 'Radio: Deutsch');
  });

  await check('Warteschlange: „Als Nächstes spielen“ und Warteschlangen-Seite', async () => {
    await P.goto(BASE + '/index.html#/mix/top');
    await P.waitForSelector('#list .trow');
    const name = await P.textContent('#list .trow:nth-child(7) .tname');
    await P.click('#list .trow:nth-child(7) [data-act="menu"]', { force: true });
    await P.click('.popup [data-k="next"]');
    await P.click('.player [data-act="queue"]');
    await P.waitForSelector('#q2 .trow');
    assert.strictEqual(await P.textContent('#q2 .trow .tname'), name);
    await P.click('.player [data-act="next"]');
    await P.waitForFunction(n => document.querySelector('.np-t').textContent === n, name);
  });
  await shot(P, 'pc-6-warteschlange');

  await check('Endlos-Wiedergabe: nach dem letzten Song geht es mit passenden Songs weiter', async () => {
    await P.evaluate(() => KW.player.playList([5], 0, { kind: 'list', name: 'Test' }));
    await P.waitForFunction(() => KW.player.order.length > 1, null, { timeout: 15000 });
    assert.ok(await P.evaluate(() => KW.player.current !== 5));
  });

  await check('Keine Vorschau: Song wird übersprungen', async () => {
    const uri = await P.evaluate(() => { const t = Catalog.track(9); window.__noPreview = [t.uri]; KW.player.playList([9, 10, 11], 0, { kind: 'list', name: 'Test' }); return t.uri; });
    await P.waitForFunction(() => KW.player.current === 10, null, { timeout: 8000 });
    void uri;
  });

  await check('Zufall und Wiederholen, Sleep-Timer', async () => {
    await P.click('.ctl-btns [data-act="shuffle"]');
    assert.ok(await P.evaluate(() => KW.player.shuffle));
    await P.click('.ctl-btns [data-act="repeat"]');
    assert.strictEqual(await P.evaluate(() => KW.player.repeat), 'all');
    await P.click('.ctl-btns [data-act="repeat"]');
    await P.click('.ctl-btns [data-act="repeat"]');
    await P.click('.ctl-btns [data-act="shuffle"]');
    await P.click('.player [data-act="sleep"]');
    await P.click('.popup [data-k="30"]');
    assert.ok(await P.evaluate(() => KW.player.sleepAt > Date.now()));
  });

  await check('Daily Mixe aus Lieblingssongs', async () => {
    await P.evaluate(() => {
      const ids = [];
      for (const g of ['pop', 'hip-hop', 'rock']) for (const i of Catalog.genreTracks(Catalog.genreIndex(g)).slice(0, 6)) ids.push(Catalog.track(i).id);
      for (const id of ids) KW.lib.setLiked(id, true);
    });
    await P.goto(BASE + '/index.html#/home');
    await P.waitForSelector('.sec-head h2');
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    assert.ok(secs.includes('Deine Mixe') && secs.includes('Für dich entdeckt'), secs.join());
    assert.ok(!(await P.$('.welcome')));
    await P.click('a.card[href="#/mix/daily-1"]');
    await P.waitForSelector('#list .trow');
    assert.ok(await P.$$eval('#list .trow', r => r.length) >= 20);
  });
  await shot(P, 'pc-7-daily-mix');

  await check('Cover werden nachgeladen (oEmbed) und zwischengespeichert', async () => {
    await P.waitForFunction(() => document.querySelectorAll('.cv.has-img').length > 3);
    assert.ok(oembedCalls.length > 3);
  });

  let code = '';
  await check('Bibliothek als Code exportieren', async () => {
    await P.goto(BASE + '/index.html#/settings');
    await P.waitForSelector('.stats');
    code = await P.evaluate(() => KW.lib.exportCode());
    assert.ok(code.startsWith('KW1.'));
    await P.click('[data-toggle="autoplay"] + .switch');
    assert.strictEqual(await P.evaluate(() => KW.lib.setting('autoplay')), false);
    await P.click('[data-toggle="autoplay"] + .switch');
  });
  await shot(P, 'pc-8-einstellungen');
  assert.deepStrictEqual(d.errors, [], 'Konsolenfehler: ' + d.errors.join('\n'));

  // ---------- Handy (Android-Brücke) ----------
  const m = await newPage(browser, { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { android: true, speed: 1 });
  const M = m.page;
  await check('Handy: Start, Bibliotheks-Code einfügen', async () => {
    await M.goto(BASE + '/index.html');
    await M.waitForSelector('#home-secs .sec', { timeout: 20000 });
    await M.evaluate(c => KW.lib.importCode(c, true), code);
    await M.waitForFunction(() => document.querySelector('.shortcut span').textContent === 'Lieblingssongs');
    await M.goto(BASE + '/index.html#/home');
    await M.waitForSelector('.sec-head h2');
    assert.ok((await M.$$eval('.sec-head h2', h => h.map(x => x.textContent))).includes('Deine Mixe'));
  });
  await shot(M, 'handy-1-start');
  await check('Handy: Bibliothek mit Playlists, Künstlern und Lieblingssongs', async () => {
    await M.tap('.tabbar a[href="#/library"]');
    await M.waitForSelector('.lib-page .lib-row');
    const t = await M.textContent('.lib-page');
    assert.ok(t.includes('Lieblingssongs') && t.includes('Sommer 2026') && t.includes('Rammstein'), t);
  });
  await shot(M, 'handy-2-bibliothek');
  await check('Handy: Tippen spielt, Vollbild-Player mit Spotify-Player darunter', async () => {
    await M.tap('.lib-page a[href="#/liked"]');
    await M.waitForSelector('#list .trow');
    await M.tap('#list .trow:nth-child(2) .tname');
    await M.waitForFunction(() => window.__embed && window.__embed.plays > 0);
    await M.tap('.player .np-meta');
    await M.waitForSelector('#full.open');
    await M.waitForTimeout(500);
    const host = await M.$eval('#embed-host', e => ({ parked: e.classList.contains('parked'), top: e.getBoundingClientRect().top }));
    const slot = await M.$eval('[data-slot="full"]', e => e.getBoundingClientRect().top);
    assert.ok(!host.parked && Math.abs(host.top - slot) < 2, JSON.stringify(host) + ' vs ' + slot);
  });
  await shot(M, 'handy-3-player');
  await check('Handy: Play/Pause im Vollbild-Player schaltet genau einmal', async () => {
    await M.waitForFunction(() => KW.player.playing);
    await M.tap('#full .pp');
    assert.strictEqual(await M.evaluate(() => KW.player.playing), false);
    await M.tap('#full .pp');
    assert.strictEqual(await M.evaluate(() => KW.player.playing), true);
  });
  await check('Handy: „Ganzer Song“ öffnet die Spotify-App', async () => {
    await M.tap('#full [data-act="full-song"]');
    const opened = await M.evaluate(() => window.__android.spotify);
    assert.ok(opened.length === 1 && opened[0].startsWith('spotify:track:'), JSON.stringify(opened));
  });
  await check('Handy: Zurück schließt Player, dann Seite', async () => {
    assert.strictEqual(await M.evaluate(() => KW.back()), true);
    await M.waitForFunction(() => document.querySelector('#full').hidden);
    assert.ok(await M.$eval('#embed-host', e => e.classList.contains('parked')));
  });
  await M.goto(BASE + '/index.html#/search');
  await M.waitForSelector('.tile');
  await shot(M, 'handy-4-suche');
  await M.fill('#q', 'taylor swift');
  await M.waitForSelector('#r-songs .trow');
  await shot(M, 'handy-5-suche-treffer');
  await M.goto(BASE + '/index.html#/mix/daily-1');
  await M.waitForSelector('#list .trow');
  await shot(M, 'handy-6-mix');
  assert.deepStrictEqual(m.errors, [], 'Konsolenfehler: ' + m.errors.join('\n'));

  await browser.close();
  server.close();
  console.log(failures ? '\n' + failures + ' Prüfungen fehlgeschlagen' : '\nAlle Prüfungen bestanden. Bilder in ' + OUT);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

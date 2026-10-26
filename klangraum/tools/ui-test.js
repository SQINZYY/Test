// Oberflächen-Test mit nachgebauter Spotify-API (Playwright/Chromium), erzeugt Screenshots.
// Aufruf: node klangraum/tools/ui-test.js [ausgabe-ordner]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'build', 'klangraum-ui'));
fs.mkdirSync(OUT, { recursive: true });

const { api, coverSvg, setBase, log, mode, trackObj, PLAYLISTS, OTHERS, LIKED, DEVICES } = require('./mock-spotify.js');

// ---------- Server ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/mock/cover/')) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' });
    res.end(coverSvg(decodeURIComponent(u.pathname.slice(12, -4))));
    return;
  }
  const file = path.join(WEB, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
  if (!file.startsWith(WEB) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function routeSpotify(context) {
  await context.route('https://api.spotify.com/**', async route => {
    const req = route.request();
    const r = api(new URL(req.url()), req.method(), req.postData());
    const [status, body] = Array.isArray(r) ? r : [200, r];
    await route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body) });
  });
  await context.route('https://open.spotify.com/embed/**', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<body style="margin:0;background:#3b3b5a;color:#fff;font:14px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">Spotify-Player (Platzhalter im Test)</body>',
  }));
}

const AUTH = JSON.stringify({ clientId: '0123456789abcdef0123456789abcdef', access: 'TEST', refresh: 'R', expires: Date.now() + 36e5 });

async function newPage(browser, opts, auth) {
  const context = await browser.newContext(opts);
  await routeSpotify(context);
  if (auth) await context.addInitScript(a => { if (!localStorage.getItem('kr.auth')) localStorage.setItem('kr.auth', a); }, AUTH);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // 403 (fremde Playlists) und 404 (kein aktives Gerät) sind erwartete API-Antworten, der Browser meldet sie trotzdem
  page.on('console', m => { if (m.type() === 'error' && !/status of 40[34]/.test(m.text())) errors.push(m.text()); });
  return { context, page, errors };
}

/** Wie ein Mensch scrollen (Mausrad/Wischen statt scrollIntoView) und prüfen, ob der Verbinden-Knopf sichtbar wird. */
async function scrollToConnect(page) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const box = await page.locator('#connect').boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= vp.height, 'Knopf nicht erreichbar, liegt bei y=' + (box && Math.round(box.y)) + ' (Fensterhöhe ' + vp.height + ')');
}

async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('Bild: ' + name + '.png');
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  setBase(BASE);
  const browser = await chromium.launch();
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e).split('\n').slice(0, 8).join('\n     ')); }
  };

  // ---------- PC ----------
  const d = await newPage(browser, { viewport: { width: 1360, height: 860 } }, true);
  const P = d.page;
  await P.goto(BASE + '/index.html');

  await check('Desktop: Bibliothek lädt Playlists, fremde Playlists und Lieblingssongs', async () => {
    await P.waitForSelector('.side-list .lib-row');
    await P.waitForFunction(() => !document.querySelector('#sync').textContent, null, { timeout: 15000 });
    const rows = await P.$$eval('.side-list .lib-row', r => r.map(x => x.textContent));
    assert.ok(rows[0].includes('Lieblingssongs') && rows[0].includes('263 Songs'), rows[0]);
    assert.ok(rows.some(r => r.includes('Lofi Beats zum Lernen') && r.includes('von Lena')), 'fremde Playlist mit Besitzer');
    assert.strictEqual(rows.filter(r => r.includes('Playlist')).length, 1 + PLAYLISTS.length);
  });
  await check('Desktop: Startseite mit Kacheln und Abschnitten', async () => {
    await P.waitForSelector('.shortcut');
    await P.waitForSelector('#top-tracks .trow');
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    for (const s of ['Zuletzt gehört', 'Deine Top-Songs diesen Monat', 'Deine Playlists', 'Von anderen gespeichert']) assert.ok(secs.includes(s), s + ' fehlt: ' + secs);
    assert.strictEqual(await P.$$eval('.shortcut', x => x.length), 8);
  });
  await check('Desktop: Player zeigt aktuellen Song und Gerät', async () => {
    await P.waitForFunction(() => document.querySelector('.np-t').textContent.length > 3 && !/nichts/.test(document.querySelector('.np-t').textContent));
    const t = await P.textContent('.np-t');
    assert.strictEqual(t, trackObj(4).name);
  });
  await shot(P, 'pc-1-start');

  await check('Desktop: Filter „Von anderen“', async () => {
    await P.click('.side-lib [data-chip="others"]');
    const n = await P.$$eval('.side-list .lib-row', r => r.length);
    assert.strictEqual(n, OTHERS.length);
    await P.click('.side-lib [data-chip="others"]');
  });

  await check('Desktop: Lieblingssongs mit allen 263 Songs, Filter und Sortierung', async () => {
    await P.click('.side-list a[href="#/liked"]');
    await P.waitForSelector('#list .trow');
    assert.ok((await P.textContent('.hero-by')).includes('263 Songs'));
    await P.fill('[data-trackq]', 'Neon');
    const n = await P.$$eval('#list .trow', r => r.length);
    const expected = LIKED.filter(x => (x.track.name + ' ' + x.track.artists.map(a => a.name).join(' ') + ' ' + x.track.album.name).toLowerCase().includes('neon')).length;
    assert.strictEqual(n, expected);
    await P.fill('[data-trackq]', '');
    // nachladen beim Scrollen
    await P.evaluate(() => { document.querySelector('#main').scrollTop = 1e6; });
    await P.waitForFunction(() => document.querySelectorAll('#list .trow').length > 120);
    await P.evaluate(() => { document.querySelector('#main').scrollTop = 0; });
  });
  await shot(P, 'pc-2-lieblingssongs');

  await check('Desktop: Doppelklick spielt im Kontext der Lieblingssongs', async () => {
    log.length = 0;
    await P.dblclick('#list .trow:nth-child(3) .c-dur');
    await P.waitForFunction(() => true);
    await P.waitForTimeout(300);
    const play = log.find(l => l.startsWith('PUT /me/player/play'));
    assert.ok(play, 'kein play-Aufruf: ' + log.join(' | '));
  });

  await check('Desktop: eigene Playlist mit Songs', async () => {
    await P.click('.side-list a[href="#/playlist/own1"]');
    await P.waitForSelector('#list .trow');
    assert.strictEqual(await P.textContent('.hero-title'), 'Workout 2026');
    assert.ok((await P.textContent('.hero-desc')).includes('Pump it up – für jeden Tag & jede Session'));
    assert.strictEqual(await P.$$eval('#list .trow', r => r.length), PLAYLISTS[1].total);
  });
  await shot(P, 'pc-3-playlist');

  await check('Desktop: fremde Playlist zeigt Spotify-Liste statt Fehler', async () => {
    await P.click('.side-list a[href="#/playlist/oth0"]');
    await P.waitForSelector('iframe.embed');
    assert.ok((await P.textContent('.notice')).includes('Abspielen klappt trotzdem'));
    assert.ok((await P.textContent('.hero-by')).includes('Lena'));
    log.length = 0;
    await P.click('.actions .bigplay');
    await P.waitForTimeout(300);
    assert.ok(log.some(l => l.startsWith('PUT /me/player/play')), log.join(' | '));
  });
  await shot(P, 'pc-4-fremde-playlist');

  await check('Desktop: Album', async () => {
    await P.goto(BASE + '/index.html#/album/al3');
    await P.waitForSelector('#list .trow');
    assert.strictEqual(await P.$$eval('#list .trow', r => r.length), 11);
  });
  await shot(P, 'pc-5-album');

  await check('Desktop: Künstler mit Lieblingssongs und Alben (Rückfall auf Suche)', async () => {
    await P.goto(BASE + '/index.html#/artist/ar1');
    await P.waitForSelector('#ar-liked .trow');
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    assert.ok(secs.includes('Deine Lieblingssongs'), secs.join());
  });
  await shot(P, 'pc-6-kuenstler');

  await check('Desktop: Suche', async () => {
    await P.click('.side-nav a[href="#/search"]');
    await P.fill('#q', 'Sommer');
    await P.waitForSelector('#r-songs .trow');
    const secs = await P.$$eval('.sec-head h2', h => h.map(x => x.textContent));
    assert.ok(secs.includes('Songs') && secs.some(s => s.startsWith('In deinen Lieblingssongs')), secs.join());
  });
  await shot(P, 'pc-7-suche');

  await check('Desktop: Geräteauswahl', async () => {
    await P.click('.extra .dev-btn');
    await P.waitForSelector('.pop-item.dev');
    const names = await P.$$eval('.pop-item.dev b', b => b.map(x => x.textContent));
    assert.deepStrictEqual(names, ['MAX-PC', 'Pixel 9']);
  });
  await shot(P, 'pc-8-geraete');
  await P.keyboard.press('Escape');

  await check('Desktop: Herz setzt Lieblingssong über /me/library', async () => {
    await P.goto(BASE + '/index.html#/album/al3');
    await P.waitForSelector('#list .trow');
    log.length = 0;
    // Song 1 des Albums ist noch kein Lieblingssong (Song 2 schon)
    await P.hover('#list .trow:nth-child(1)');
    await P.click('#list .trow:nth-child(1) [data-act="like"]');
    await P.waitForTimeout(300);
    assert.ok(log.some(l => l.startsWith('PUT /me/library?uris=spotify%3Atrack%3Atr150')), log.join(' | '));
    assert.ok(await P.$eval('#list .trow:nth-child(1) .like', b => b.classList.contains('on')));
  });

  await check('Desktop: ohne aktives Gerät – Dialog, dann Wiedergabe auf dem gefundenen Gerät', async () => {
    mode.noDevice = true;
    await P.goto(BASE + '/index.html#/playlist/own2');
    await P.waitForSelector('#list .trow');
    log.length = 0;
    await P.click('.actions .bigplay');
    await P.waitForSelector('.modal-wrap .modal h2');
    assert.strictEqual(await P.textContent('.modal h2'), 'Spotify öffnen');
    await shot(P, 'pc-8b-kein-geraet');
    mode.devices = [Object.assign({}, DEVICES[0], { is_active: false })]; // Spotify wurde geöffnet
    await P.waitForSelector('.modal-wrap', { state: 'detached', timeout: 8000 });
    await P.waitForTimeout(300);
    const play = log.filter(l => l.startsWith('PUT /me/player/play'));
    assert.ok(play.some(l => l.includes('device_id=dev-pc')), play.join(' | '));
    mode.noDevice = false;
    mode.devices = null;
  });

  await check('Desktop: Einstellungen', async () => {
    await P.goto(BASE + '/index.html#/settings');
    await P.waitForSelector('.stats');
    const stats = await P.textContent('.stats');
    assert.ok(stats.includes('14eigene Playlists') && stats.includes('9von anderen'), stats);
  });
  await shot(P, 'pc-9-einstellungen');
  await check('Desktop: kostenloses Konto – einmal Hinweis, danach öffnet sich Spotify statt einer Fehlermeldung', async () => {
    mode.free = true;
    await P.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; location.hash = '#/playlist/own2'; });
    await P.waitForSelector('#list .trow');
    log.length = 0;
    await P.click('.actions .bigplay');
    await P.waitForSelector('.modal h2');
    assert.strictEqual(await P.textContent('.modal h2'), 'Kostenloses Spotify-Konto');
    await shot(P, 'pc-10-kostenlos-hinweis');
    await P.click('.modal .btn-primary');
    assert.deepStrictEqual(await P.evaluate(() => window.__opened), ['https://open.spotify.com/playlist/own2']);
    assert.ok(await P.evaluate(() => document.body.classList.contains('free')));
    // Ab jetzt ohne Dialog und ohne weitere Steuerbefehle an Spotify
    await P.dblclick('#list .trow:nth-child(3) .c-dur');
    const t3 = await P.getAttribute('#list .trow:nth-child(3)', 'data-uri');
    assert.strictEqual(await P.evaluate(() => window.__opened[1]), 'https://open.spotify.com/track/' + t3.split(':')[2]);
    assert.strictEqual(await P.$$eval('.modal-wrap', m => m.length), 0);
    assert.strictEqual(log.filter(l => /^(PUT|POST) \/me\/player/.test(l)).length, 1, log.join(' | '));
    assert.strictEqual(await P.$eval('.ctl-btns [data-act="next"]', b => getComputedStyle(b).pointerEvents), 'none');
    await P.evaluate(() => { location.hash = '#/liked'; });
    await P.waitForSelector('#list .trow');
    await P.click('.actions .bigplay');
    assert.strictEqual(await P.evaluate(() => window.__opened[2]), 'https://open.spotify.com/collection/tracks');
    await shot(P, 'pc-11-kostenlos');
  });
  await check('Desktop: kostenloses Konto – Einstellungen zeigen den Modus, Umschalten auf Premium', async () => {
    await P.evaluate(() => { location.hash = '#/settings'; });
    await P.waitForSelector('#set-play');
    assert.ok((await P.textContent('#set-play')).includes('Kostenloses Spotify-Konto'));
    await P.click('[data-set="target-web"]');
    assert.ok(await P.$eval('[data-set="target-web"]', b => b.classList.contains('on')));
    await P.click('[data-set="premium"]');
    assert.ok(!(await P.evaluate(() => document.body.classList.contains('free'))));
    assert.ok((await P.textContent('#set-play')).includes('Spotify Connect'));
    // Klick-Handler hängen nicht mehrfach (zweimal Einstellungen öffnen, ein Klick = ein Umschalten)
    await P.evaluate(() => { location.hash = '#/home'; });
    await P.evaluate(() => { location.hash = '#/settings'; });
    await P.waitForSelector('#set-play [data-set="free"]');
    await P.click('[data-set="free"]');
    assert.ok(await P.evaluate(() => document.body.classList.contains('free')));
    await P.click('[data-set="premium"]');
    assert.ok(!(await P.evaluate(() => document.body.classList.contains('free'))));
    mode.free = false;
  });
  assert.deepStrictEqual(d.errors, [], 'Konsolenfehler: ' + d.errors.join('\n'));

  // ---------- Einrichtung + Anmeldung (Browser-Variante) ----------
  const s = await newPage(browser, { viewport: { width: 1200, height: 860 } }, false);
  await s.context.route('https://accounts.spotify.com/authorize**', route => {
    const u = new URL(route.request().url());
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.searchParams.set('code', 'CODE123');
    back.searchParams.set('state', u.searchParams.get('state'));
    return route.fulfill({ status: 302, headers: { Location: back.toString() } });
  });
  let tokenBody = null;
  await s.context.route('https://accounts.spotify.com/api/token', route => {
    tokenBody = Object.fromEntries(new URLSearchParams(route.request().postData()));
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: 'NEW', refresh_token: 'RNEW', expires_in: 3600 }) });
  });
  await s.page.goto(BASE + '/index.html');
  await s.page.waitForSelector('#connect');
  await shot(s.page, 'pc-0-einrichtung');
  await check('Einrichtung (PC, kleines Fenster): Seite lässt sich bis zum Verbinden-Knopf scrollen', async () => {
    await s.page.setViewportSize({ width: 1000, height: 600 });
    await scrollToConnect(s.page);
    await s.page.evaluate(() => { document.querySelector('.setup').scrollTop = 0; });
    await s.page.setViewportSize({ width: 1200, height: 860 });
  });
  await check('Einrichtung: ungültige Client-ID wird erklärt', async () => {
    await s.page.fill('#cid', 'abc');
    await s.page.click('#connect');
    assert.ok((await s.page.textContent('#setup-status')).includes('32 Zeichen'));
  });
  await check('Einrichtung: Anmeldung mit PKCE bis zur Bibliothek', async () => {
    await s.page.fill('#cid', ' 0123456789ABCDEF0123456789abcdef ');
    await s.page.click('#connect');
    await s.page.waitForSelector('.side-list .lib-row', { timeout: 15000 });
    assert.strictEqual(tokenBody.grant_type, 'authorization_code');
    assert.strictEqual(tokenBody.code, 'CODE123');
    assert.strictEqual(tokenBody.client_id, '0123456789ABCDEF0123456789abcdef');
    assert.ok(tokenBody.code_verifier.length === 64);
    assert.ok(!s.page.url().includes('code='), 'Code bleibt nicht in der Adresse');
  });
  assert.deepStrictEqual(s.errors, [], 'Konsolenfehler: ' + s.errors.join('\n'));

  // ---------- Handy ----------
  const m = await newPage(browser, { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true);
  const M = m.page;
  await M.goto(BASE + '/index.html');
  await M.waitForSelector('.shortcut');
  await M.waitForFunction(() => !document.querySelector('#sync').textContent, null, { timeout: 15000 });
  await M.waitForSelector('#top-tracks .trow');
  await shot(M, 'handy-1-start');
  await check('Handy: Bibliothek-Tab mit Filtern', async () => {
    await M.tap('.tabbar a[href="#/library"]');
    await M.waitForSelector('.lib-page .lib-row');
    await M.tap('.lib-page [data-chip="others"]');
    assert.strictEqual(await M.$$eval('.lib-page .lib-row', r => r.length), OTHERS.length);
  });
  await shot(M, 'handy-2-bibliothek-andere');
  await M.tap('.lib-page [data-chip="others"]');
  await check('Handy: Lieblingssongs, Tippen spielt ab', async () => {
    await M.tap('.lib-page a[href="#/liked"]');
    await M.waitForSelector('#list .trow');
    log.length = 0;
    await M.tap('#list .trow:nth-child(2) .tname');
    await M.waitForTimeout(300);
    assert.ok(log.some(l => l.startsWith('PUT /me/player/play')), log.join(' | '));
  });
  await shot(M, 'handy-3-lieblingssongs');
  await M.goto(BASE + '/index.html#/playlist/own0');
  await M.waitForSelector('#list .trow');
  await shot(M, 'handy-4-playlist');
  await check('Handy: Vollbild-Player', async () => {
    await M.tap('.player .np-meta');
    await M.waitForSelector('#full.open');
    assert.strictEqual(await M.textContent('.full-t'), trackObj(4).name);
    assert.strictEqual(await M.textContent('.full-ctx b'), 'Autofahrt');
  });
  await shot(M, 'handy-5-player');
  await check('Handy: Zurück schließt den Vollbild-Player', async () => {
    assert.strictEqual(await M.evaluate(() => KR.back()), true);
    await M.waitForFunction(() => document.querySelector('#full').hidden);
  });
  await M.goto(BASE + '/index.html#/search');
  await M.fill('#q', 'Golden');
  await M.waitForSelector('#r-songs .trow');
  await shot(M, 'handy-6-suche');
  await check('Handy: Song-Menü als Leiste von unten', async () => {
    await M.tap('#r-songs .trow:nth-child(1) [data-act="menu"]');
    await M.waitForSelector('.popup .pop-item');
  });
  await shot(M, 'handy-7-menue');
  assert.deepStrictEqual(m.errors, [], 'Konsolenfehler: ' + m.errors.join('\n'));

  const ms = await newPage(browser, { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, false);
  await ms.page.goto(BASE + '/index.html');
  await ms.page.waitForSelector('#connect');
  await shot(ms.page, 'handy-0-einrichtung');
  await check('Einrichtung (Handy): Seite lässt sich bis zum Verbinden-Knopf scrollen', async () => {
    await scrollToConnect(ms.page);
  });
  await shot(ms.page, 'handy-0b-einrichtung-unten');
  await check('Einrichtung (Handy): Redirect-URIs passen in eine Zeile', async () => {
    const lines = await ms.page.$$eval('.copyrow code', els => els.map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '16'))));
    const h = await ms.page.$$eval('.copyrow code', els => els.map(e => e.getBoundingClientRect().height));
    assert.ok(Math.abs(h[0] - h[1]) < 2, 'http-Adresse bricht um: Höhen ' + h.join(' / '));
  });
  const small = await newPage(browser, { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, false);
  await small.page.goto(BASE + '/index.html');
  await small.page.waitForSelector('#connect');
  await check('Einrichtung (kleines Handy 360×640): scrollen bis zum Knopf', async () => {
    await scrollToConnect(small.page);
    const h = await small.page.$$eval('.copyrow code', els => els.map(e => e.getBoundingClientRect().height));
    assert.ok(Math.abs(h[0] - h[1]) < 2, 'http-Adresse bricht um: Höhen ' + h.join(' / '));
  });

  // ---------- Android-Brücke (wie MainActivity.Bridge) ----------
  const a = await newPage(browser, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }, false);
  await a.context.addInitScript(() => {
    window.__android = { opened: [], posts: [], spotify: [] };
    window.Android = {
      openAuth: url => window.__android.opened.push(url),
      openUrl: url => window.__android.opened.push(url),
      openSpotify: uri => { window.__android.spotify.push(uri); return true; },
      post: (id, url, body) => {
        window.__android.posts.push({ url, body });
        // Antwort kommt asynchron über Platform._http, wie aus dem Java-Thread
        setTimeout(() => Platform._http(id, 200, JSON.stringify({ access_token: 'AND', refresh_token: 'ANDR', expires_in: 3600 })), 30);
      },
      copy: () => {},
      appVersion: () => '1.0.0',
    };
  });
  await a.page.goto(BASE + '/index.html');
  await a.page.waitForSelector('#connect');
  await check('Android: Anmeldung über Browser und klangraum://callback', async () => {
    assert.strictEqual(await a.page.evaluate(() => Platform.kind), 'android');
    await a.page.fill('#cid', '0123456789abcdef0123456789abcdef');
    await a.page.tap('#connect');
    await a.page.waitForFunction(() => window.__android.opened.length === 1);
    const auth = new URL(await a.page.evaluate(() => window.__android.opened[0]));
    assert.strictEqual(auth.searchParams.get('redirect_uri'), 'klangraum://callback');
    // So ruft MainActivity nach onNewIntent die Oberfläche auf
    await a.page.evaluate(u => KR.onAuthCallback(u), 'klangraum://callback?code=ANDCODE&state=' + auth.searchParams.get('state'));
    await a.page.waitForSelector('.shortcut', { timeout: 15000 });
    const post = await a.page.evaluate(() => window.__android.posts[0]);
    assert.strictEqual(post.url, 'https://accounts.spotify.com/api/token');
    const body = Object.fromEntries(new URLSearchParams(post.body));
    assert.strictEqual(body.code, 'ANDCODE');
    assert.strictEqual(body.redirect_uri, 'klangraum://callback');
  });
  await check('Android: App nach Neustart – Rückruf ohne wartende Anmeldung', async () => {
    await a.page.evaluate(() => { localStorage.removeItem('kr.auth'); localStorage.setItem('kr.auth', JSON.stringify({ clientId: '0123456789abcdef0123456789abcdef' })); });
    await a.page.reload();
    await a.page.waitForSelector('#connect');
    await a.page.tap('#connect');
    await a.page.waitForFunction(() => window.__android.opened.length === 1);
    const auth = new URL(await a.page.evaluate(() => window.__android.opened[0]));
    await a.page.reload(); // Activity wurde vom System beendet, PKCE-Daten liegen noch im Speicher
    await a.page.waitForSelector('#connect');
    await a.page.evaluate(u => KR.onAuthCallback(u), 'klangraum://callback?code=C2&state=' + auth.searchParams.get('state'));
    await a.page.waitForSelector('.shortcut', { timeout: 15000 });
  });
  await check('Android: kostenloses Konto öffnet die Spotify-App mit der Playlist', async () => {
    mode.free = true;
    await a.page.evaluate(() => { location.hash = '#/playlist/own2'; });
    await a.page.waitForSelector('#list .trow');
    await a.page.tap('.actions .bigplay');
    await a.page.waitForSelector('.modal h2');
    await a.page.tap('.modal .btn-primary');
    assert.deepStrictEqual(await a.page.evaluate(() => window.__android.spotify), ['spotify:playlist:own2']);
    await a.page.tap('#list .trow:nth-child(2) .tname');
    const t2 = await a.page.getAttribute('#list .trow:nth-child(2)', 'data-uri');
    assert.strictEqual(await a.page.evaluate(() => window.__android.spotify[1]), t2);
    await a.page.evaluate(() => { location.hash = '#/home'; });
    await a.page.waitForSelector('.shortcut');
    await a.page.waitForTimeout(400);
    await shot(a.page, 'handy-8-kostenlos');
    await a.page.evaluate(() => { localStorage.removeItem('kr.free'); });
    mode.free = false;
  });
  await check('Android: Zurück-Taste schließt Menü, dann Seite, dann App', async () => {
    await a.page.evaluate(() => { location.hash = '#/library'; });
    await a.page.waitForSelector('.lib-page');
    assert.strictEqual(await a.page.evaluate(() => KR.back()), true);
    await a.page.waitForFunction(() => document.body.dataset.view === 'home');
    assert.strictEqual(await a.page.evaluate(() => KR.back()), false, 'auf der Startseite geht die App in den Hintergrund');
  });
  assert.deepStrictEqual(a.errors, [], 'Konsolenfehler: ' + a.errors.join('\n'));

  await browser.close();
  server.close();
  console.log(failures ? '\n' + failures + ' Prüfungen fehlgeschlagen' : '\nAlle Prüfungen bestanden. Bilder in ' + OUT);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

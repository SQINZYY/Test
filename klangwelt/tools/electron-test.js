// Startet die Klangwelt-Desktop-App (Linux-Electron, gleicher Code wie unter Windows) und prüft Katalog, Abspielen und Links.
// Aufruf: xvfb-run -a node klangwelt/tools/electron-test.js [bilder-ordner]
// KW_APP=<pfad>/resources/app.asar testet die gepackte App aus dem Windows-Build.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const http = require('http');
const { _electron: electron } = require('playwright');

const DESKTOP = path.join(__dirname, '..', 'desktop');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'build', 'klangwelt-ui'));

const FAKE_IFRAME_API = `(() => {
  window.__embed = { loads: [], plays: 0 };
  setTimeout(() => window.onSpotifyIframeApiReady({ createController(el, opts, cb) {
    const box = document.createElement('div'); box.style.height = '152px'; box.textContent = 'Spotify-Player (Test)'; el.replaceWith(box);
    const listeners = {}; let pos = 0, timer = null;
    const emit = (ev, data) => (listeners[ev] || []).forEach(f => f({ data }));
    const c = {
      addListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      loadUri(u) { window.__embed.loads.push(u); pos = 0; setTimeout(() => emit('ready', {}), 30); },
      play() { window.__embed.plays++; clearInterval(timer); timer = setInterval(() => { pos += 500; emit('playback_update', { isPaused: false, isBuffering: false, duration: 30000, position: pos }); }, 250); },
      resume() { c.play(); }, pause() { clearInterval(timer); emit('playback_update', { isPaused: true, duration: 30000, position: pos }); }, seek() {},
    };
    window.__embed.loads.push(opts.uri);
    setTimeout(() => { cb(c); emit('ready', {}); }, 30);
  } }), 10);
})();`;

(async () => {
  const app = await electron.launch({
    executablePath: require(path.join(DESKTOP, 'node_modules', 'electron')),
    args: [process.env.KW_APP || DESKTOP, '--no-sandbox'],
    env: Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: '1', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'kw-')) }),
  });
  await app.evaluate(({ shell, net }) => {
    global.__opened = [];
    shell.openExternal = async url => { global.__opened.push(url); };
    const real = net.fetch.bind(net);
    net.fetch = async (url, opts) => {
      if (String(url) === 'https://accounts.spotify.com/api/token') {
        global.__tokenBody = String(opts.body);
        return new Response(JSON.stringify({ access_token: 'EA', refresh_token: 'ER', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).startsWith('https://open.spotify.com/oembed?')) return new Response(JSON.stringify({ thumbnail_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22%3E%3Crect width=%2210%22 height=%2210%22 fill=%22%23e91e63%22/%3E%3C/svg%3E' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return real(url, opts);
    };
  });
  await app.context().route('https://open.spotify.com/embed/iframe-api/v1', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_IFRAME_API }));

  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(String(e.stack || e)));
  win.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e).split('\n').slice(0, 6).join('\n     ')); }
  };

  await check('Fenster lädt app://klangwelt und den ganzen Katalog', async () => {
    await win.waitForSelector('#home-secs .sec', { timeout: 30000 });
    assert.strictEqual(win.url().split('#')[0], 'app://klangwelt/index.html');
    assert.strictEqual(await win.evaluate(() => Platform.kind), 'desktop');
    assert.strictEqual(await win.evaluate(() => Platform.version), require(path.join(DESKTOP, 'package.json')).version);
    assert.ok(await win.evaluate(() => Catalog.count) > 80000);
    assert.strictEqual(await win.evaluate(() => typeof require), 'undefined', 'kein Node im Fenster');
  });

  await check('Abspielen über den Spotify-Player, Cover über den Hauptprozess', async () => {
    await win.evaluate(() => { location.hash = '#/mix/top'; });
    await win.waitForSelector('#list .trow');
    await win.dblclick('#list .trow:nth-child(1) .c-dur');
    await win.waitForFunction(() => window.__embed && window.__embed.plays > 0);
    await win.waitForFunction(() => document.querySelectorAll('.cv.has-img').length > 0, null, { timeout: 15000 });
  });

  await check('Oembed-Abruf ist auf open.spotify.com/oembed beschränkt', async () => {
    const r = await win.evaluate(() => klangweltDesktop.getJson('https://example.com/x').then(() => 'ok', e => 'blocked'));
    assert.strictEqual(r, 'blocked');
  });

  await check('„Ganzer Song“ öffnet Spotify über das System', async () => {
    await win.click('.player [data-act="full-song"]');
    await win.waitForTimeout(200);
    const opened = await app.evaluate(() => global.__opened);
    assert.ok(opened.length === 1 && opened[0].startsWith('spotify:track:'), JSON.stringify(opened));
  });

  await check('Spotify verbinden: Browser, Rückkehr über 127.0.0.1:43822, Token im Hauptprozess', async () => {
    await win.evaluate(() => { location.hash = '#/settings'; });
    await win.click('.set-card [data-act="sp-connect"]');
    await win.fill('#sp-cid', 'abcdefabcdefabcdefabcdefabcdef12');
    const before = (await app.evaluate(() => global.__opened)).length;
    await win.click('.modal .btn-primary');
    let opened = [];
    for (let k = 0; k < 50 && opened.length <= before; k++) { await win.waitForTimeout(100); opened = await app.evaluate(() => global.__opened); }
    const auth = new URL(opened[opened.length - 1]);
    assert.strictEqual(auth.searchParams.get('redirect_uri'), 'http://127.0.0.1:43822/callback');
    const res = await new Promise((resolve, reject) => http.get('http://127.0.0.1:43822/callback?code=EC&state=' + auth.searchParams.get('state'), r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => resolve({ status: r.statusCode, body: b })); }).on('error', reject));
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('Verbunden!'));
    await win.waitForFunction(() => /Verbunden\./.test(document.querySelector('.view').textContent));
    const body = Object.fromEntries(new URLSearchParams(await app.evaluate(() => global.__tokenBody)));
    assert.strictEqual(body.code, 'EC');
    assert.strictEqual(body.redirect_uri, 'http://127.0.0.1:43822/callback');
  });

  await win.waitForTimeout(500);
  await win.screenshot({ path: path.join(OUT, 'electron-klangwelt.png') });
  assert.deepStrictEqual(errors, [], 'Konsolenfehler: ' + errors.join('\n'));
  await app.close();
  console.log(failures ? '\n' + failures + ' Prüfungen fehlgeschlagen' : '\nAlle Desktop-Prüfungen bestanden');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// Startet die Desktop-App (Linux-Electron, gleicher Code wie unter Windows) und prüft Anmeldung + Bibliothek.
// Aufruf: xvfb-run -a node klangraum/tools/electron-test.js [ausgabe-ordner]
'use strict';
process.env.MOCK_BASE = 'https://mock.klangraum.test';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const assert = require('assert');
const { _electron: electron } = require('playwright');
const { api, coverSvg, log } = require('./mock-spotify.js');

const DESKTOP = path.join(__dirname, '..', 'desktop');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'build', 'klangraum-ui'));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
}

(async () => {
  const app = await electron.launch({
    executablePath: require(path.join(DESKTOP, 'node_modules', 'electron')),
    // KR_APP: gepacktes app.asar aus dem Windows-Build testen (gleicher Inhalt wie in der ZIP)
    args: [process.env.KR_APP || DESKTOP, '--no-sandbox'],
    // Frisches Profil (Linux: XDG_CONFIG_HOME), damit kein Login vom letzten Lauf übrig ist
    env: Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: '1', XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'kr-')) }),
  });

  // Hauptprozess: Browser-Aufruf abfangen und Token-Anfrage beantworten
  await app.evaluate(({ shell, net }) => {
    global.__opened = [];
    global.__tokenBodies = [];
    shell.openExternal = async url => { global.__opened.push(url); };
    const realFetch = net.fetch.bind(net);
    net.fetch = async (url, opts) => {
      if (String(url) === 'https://accounts.spotify.com/api/token') {
        global.__tokenBodies.push(String(opts.body));
        return new Response(JSON.stringify({ access_token: 'EACCESS', refresh_token: 'EREFRESH', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(url, opts);
    };
  });

  const ctx = app.context();
  await ctx.route('https://api.spotify.com/**', async route => {
    const req = route.request();
    const r = api(new URL(req.url()), req.method());
    const [status, body] = Array.isArray(r) ? r : [200, r];
    await route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body) });
  });
  await ctx.route('https://mock.klangraum.test/**', route => {
    const seed = decodeURIComponent(new URL(route.request().url()).pathname.slice(12, -4));
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' }, body: coverSvg(seed) });
  });

  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(String(e)));
  win.on('console', m => { if (m.type() === 'error' && !/status of 403/.test(m.text())) errors.push(m.text()); });
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e).split('\n').slice(0, 3).join('\n     ')); }
  };

  await check('Fenster lädt app://klangraum mit Desktop-Brücke', async () => {
    await win.waitForSelector('#connect');
    assert.strictEqual(win.url(), 'app://klangraum/index.html');
    assert.strictEqual(await win.evaluate(() => Platform.kind), 'desktop');
    assert.strictEqual(await win.evaluate(() => Platform.redirectUri), 'http://127.0.0.1:43821/callback');
    assert.strictEqual(await win.evaluate(() => typeof require), 'undefined', 'kein Node im Fenster');
    assert.strictEqual(await win.title(), 'Klangraum');
    assert.strictEqual(await win.evaluate(() => Platform.version), '1.0.0');
  });

  await check('Anmeldung: Browser öffnen, Rückruf auf 127.0.0.1:43821, Token im Hauptprozess', async () => {
    await win.fill('#cid', 'abcdefabcdefabcdefabcdefabcdef12');
    await win.click('#connect');
    let opened = [];
    for (let i = 0; i < 50 && !opened.length; i++) { await win.waitForTimeout(100); opened = await app.evaluate(() => global.__opened); }
    const auth = new URL(opened[0]);
    assert.strictEqual(auth.origin + auth.pathname, 'https://accounts.spotify.com/authorize');
    assert.strictEqual(auth.searchParams.get('redirect_uri'), 'http://127.0.0.1:43821/callback');
    // Unbekannter Pfad auf dem Anmelde-Server
    assert.strictEqual((await get('http://127.0.0.1:43821/irgendwas')).status, 404);
    const res = await get('http://127.0.0.1:43821/callback?code=ECODE&state=' + auth.searchParams.get('state'));
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('Verbunden!'));
    await win.waitForSelector('.side-list .lib-row', { timeout: 15000 });
    const body = Object.fromEntries(new URLSearchParams((await app.evaluate(() => global.__tokenBodies))[0]));
    assert.strictEqual(body.code, 'ECODE');
    assert.strictEqual(body.redirect_uri, 'http://127.0.0.1:43821/callback');
    assert.strictEqual(body.client_id, 'abcdefabcdefabcdefabcdefabcdef12');
    // Server ist danach wieder zu
    await assert.rejects(get('http://127.0.0.1:43821/callback'));
  });

  await check('Bibliothek und Player im Desktop-Fenster', async () => {
    await win.waitForFunction(() => !document.querySelector('#sync').textContent, null, { timeout: 15000 });
    const first = await win.textContent('.side-list .lib-row');
    assert.ok(first.includes('263 Songs'), first);
    await win.waitForFunction(() => !/nichts/.test(document.querySelector('.np-t').textContent));
    log.length = 0;
    await win.click('.shortcut .sc-play', { force: true });
    await win.waitForTimeout(300);
    assert.ok(log.some(l => l.startsWith('PUT /me/player/play')), log.join(' | '));
  });

  await check('Externe Links gehen in den Browser, nicht ins App-Fenster', async () => {
    await win.evaluate(() => { location.hash = '#/settings'; });
    await win.waitForSelector('.set-card');
    const before = (await app.evaluate(() => global.__opened)).length;
    await win.click('[data-ext="https://developer.spotify.com/dashboard"]');
    await win.waitForTimeout(200);
    const opened = await app.evaluate(() => global.__opened);
    assert.strictEqual(opened.length, before + 1);
    assert.strictEqual(opened[opened.length - 1], 'https://developer.spotify.com/dashboard');
    assert.strictEqual(win.url().split('#')[0], 'app://klangraum/index.html');
  });

  await win.evaluate(() => { location.hash = '#/home'; });
  await win.waitForSelector('.shortcut');
  await win.waitForTimeout(600);
  await win.screenshot({ path: path.join(OUT, 'electron-start.png') });
  assert.deepStrictEqual(errors, [], 'Konsolenfehler: ' + errors.join('\n'));
  await app.close();
  console.log(failures ? '\n' + failures + ' Prüfungen fehlgeschlagen' : '\nAlle Desktop-Prüfungen bestanden');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

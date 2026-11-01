/*
 * Oberflächentest im Browser (Playwright/Chromium) mit nachgebauten Antworten der Dienste.
 * Aufruf: node unterwegs/tools/ui-test.js [ausgabeordner]
 * Speichert Screenshots und bricht bei Fehlern (auch JS-Fehlern in der Seite) ab.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const fx = require('./fixtures.js');

const WWW = path.join(__dirname, '../app/assets/www');
const OUT = process.argv[2] || path.join(__dirname, '../../build/ui-test');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// 256×256 graue Kachel statt echter OSM-Kacheln
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4/f7DfwAJdAPf2gZtpQAAAABJRU5ErkJggg==', 'base64');

async function mockNetwork(page, log) {
  await page.route(/^https:\/\/(api\.transitous\.org|photon\.komoot\.io|nominatim\.openstreetmap\.org|valhalla1\.openstreetmap\.de|routing\.openstreetmap\.de|tile\.openstreetmap\.org)\//, (route) => {
    const url = route.request().url();
    log.push(url);
    const json = (obj, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    if (url.indexOf('tile.openstreetmap.org') > 0) return route.fulfill({ status: 200, contentType: 'image/png', body: TILE });
    if (url.indexOf('/api/v1/geocode') > 0) return json(fx.makeGeocode(new URL(url).searchParams.get('text')));
    if (url.indexOf('/api/v1/reverse-geocode') > 0) return json(fx.makeGeocode('ebert').slice(0, 1));
    if (url.indexOf('/plan') > 0) {
      const cursor = new URL(url).searchParams.get('pageCursor');
      return json(cursor ? fx.makeLaterPage(new Date()) : fx.makePlan(new Date()));
    }
    if (url.indexOf('valhalla') > 0) {
      const req = JSON.parse(new URL(url).searchParams.get('json'));
      const mode = { pedestrian: 'walk', bicycle: 'bike', auto: 'car' }[req.costing];
      return json(fx.makeValhalla(mode));
    }
    if (url.indexOf('routing.openstreetmap.de') > 0) return json(fx.makeOsrm('car'));
    return json([], 404);
  });
}

async function run(scheme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'de-DE', timezoneId: 'Europe/Berlin',
    geolocation: { latitude: fx.P.start[0], longitude: fx.P.start[1] }, permissions: ['geolocation']
  });
  const page = await ctx.newPage();
  const errors = [], log = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await mockNetwork(page, log);
  const base = 'http://127.0.0.1:' + server.address().port + '/index.html';
  await page.goto(base);
  const shot = (name) => page.screenshot({ path: path.join(OUT, scheme + '-' + name + '.png'), fullPage: true });

  // Startseite
  await page.waitForSelector('.mode');
  assert.strictEqual(await page.locator('.mode').count(), 6);
  await shot('1-start');

  // Start per GPS, Ziel per Vorschlag
  await page.click('#btn-locate');
  await page.waitForFunction(() => document.getElementById('in-from').value.indexOf('Mein Standort ·') === 0);
  await page.fill('#in-to', 'Poppelsdorfer');
  await page.waitForSelector('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await shot('2-vorschlaege');
  assert.ok((await page.textContent('#suggest')).indexOf('Poppelsdorfer Allee 49') >= 0);
  await page.click('.sg-item >> nth=0');
  assert.strictEqual(await page.inputValue('#in-to'), 'Poppelsdorfer Allee 49, Bonn');

  // Zu Fuß + Bahn + Zug (Bus aus), dazu Fahrrad und Auto zum Vergleich
  await page.click('[data-mode="bus"]');
  await page.click('[data-mode="bike"]');
  await page.click('[data-mode="car"]');
  const hint = await page.textContent('#mode-hint');
  assert.ok(/Park\+Ride/.test(hint) && /Schritte/.test(hint), hint);
  await page.click('[data-mode="bike"]');
  await page.click('[data-mode="car"]');
  await page.click('[data-mode="car"]');
  await page.click('#when-type [data-v="dep"]');
  assert.ok(await page.isVisible('#in-time'));
  await page.click('#when-type [data-v="now"]');
  await shot('3-auswahl');

  // Suchen
  await page.click('#btn-search');
  await page.waitForSelector('#view-results.active .rcard[data-open="t0"]');
  await page.waitForSelector('.rcard[data-open="d-car"]');
  await page.waitForSelector('.rcard[data-open="d-walk"]');
  const res = await page.textContent('#res-body');
  assert.ok(/Losgehen \d\d:\d\d/.test(res), 'Losgeh-Zeit');
  assert.ok(/ca\. 1\.250 Schritte bis Köln Hbf/.test(res), 'Schritte bis zur Haltestelle');
  assert.ok(/RE 5fährt \d\d:\d\d \+2/.test(res.replace(/\s+/g, ' ').replace('RE 5 fährt', 'RE 5fährt')), 'Abfahrt mit Verspätung: ' + res.slice(0, 400));
  assert.ok(/Ohne Bus & Bahn/.test(res));
  assert.ok(/ca\. 37\.100 Schritte/.test(res), 'Schritte für den ganzen Fußweg');
  const planUrl = log.find((u) => u.indexOf('/plan') > 0);
  assert.ok(planUrl.indexOf('transitModes=TRAM,SUBWAY,SUBURBAN,FUNICULAR,REGIONAL_RAIL') > 0, planUrl);
  assert.ok(planUrl.indexOf('preTransitModes=WALK,CAR_PARKING') > 0, planUrl);
  await shot('4-ergebnisse');

  // Spätere Verbindungen
  await page.click('[data-more="next"]');
  await page.waitForFunction(() => document.querySelectorAll('.rcard[data-open^="t"]').length === 4);

  // Details mit Karte
  await page.click('.rcard[data-open="t0"]');
  await page.waitForSelector('#view-detail.active .timeline');
  await page.waitForSelector('#map .leaflet-overlay-pane path');
  await page.waitForTimeout(400);
  const det = await page.textContent('#det-body');
  assert.ok(/Losgehen um/.test(det));
  assert.ok(/Gleis 5/.test(det));
  assert.ok(/4 Zwischenhalte/.test(det));
  assert.ok(/Bauarbeiten/.test(det));
  assert.ok(/\+2 Min\. Verspätung/.test(det));
  await shot('5-details');
  await page.click('details.steps summary');
  await page.click('details.stops summary');
  await shot('6-details-offen');

  // Zweite Verbindung mit Umstieg
  await page.click('#view-detail [data-back]');
  await page.click('.rcard[data-open="t1"]');
  await page.waitForSelector('#view-detail.active .tl-transfer');
  const det2 = await page.textContent('#det-body');
  assert.ok(/Umstieg: 4 Min\./.test(det2), det2.slice(0, 300));
  await shot('7-umstieg');

  // Nur zu Fuß
  await page.click('#view-detail [data-back]');
  await page.click('.rcard[data-open="d-walk"]');
  await page.waitForSelector('#view-detail.active .hero-card');
  assert.ok(/ca\. 37\.100 Schritte/.test(await page.textContent('#det-body')));
  await shot('8-zu-fuss');

  // Einstellungen: Schrittlänge ändert die Anzeige sofort
  await page.click('#view-detail [data-back]');
  await page.click('#view-results [data-back]');
  await page.click('#btn-settings');
  await page.waitForSelector('#sheet:not([hidden]) #stride');
  await page.$eval('#stride', (el) => { el.value = '60'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-setting="bufferMin"] [data-v="5"]');
  await shot('9-einstellungen');
  await page.click('.sheet-head [data-close-sheet]');
  assert.ok(await page.isHidden('#sheet'));
  assert.ok(/ca\. 1\.550 Schritte bis Köln Hbf/.test(await page.textContent('#res-body')), 'Schrittlänge 60 cm');

  // Zuletzt gesucht
  assert.ok(await page.isVisible('#recent-box'));
  assert.ok((await page.textContent('#recent')).indexOf('Mein Standort → Poppelsdorfer Allee 49') >= 0);

  // Fehlerfall: Fahrplanauskunft nicht erreichbar
  await page.unroute(/./);
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.click('#btn-search');
  await page.waitForSelector('[data-retry="transit"]');
  await shot('10-fehler');

  assert.deepStrictEqual(errors, [], 'JS-Fehler in der Seite: ' + errors.join('\n'));
  await browser.close();
}

server.listen(0, '127.0.0.1', async () => {
  try {
    await run('light');
    await run('dark');
    console.log('UI-Test bestanden. Screenshots: ' + OUT);
    server.close();
  } catch (e) {
    console.error('UI-Test FEHLGESCHLAGEN:', e && e.stack || e);
    server.close();
    process.exit(1);
  }
});

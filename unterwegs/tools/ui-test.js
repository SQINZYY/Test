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
  await page.click('#dep-type [data-v="from"]');
  assert.ok(await page.isVisible('#dep-time'));
  await page.click('#arr-type [data-v="by"]');
  assert.ok(await page.isVisible('#arr-time'));
  assert.ok(/Du kannst ab .* los und musst spätestens um .* da sein/.test(await page.textContent('#when-hint')), await page.textContent('#when-hint'));
  await shot('3a-zeitfenster');
  await page.click('#dep-type [data-v="now"]');
  await page.click('#arr-type [data-v="any"]');
  assert.ok(await page.isHidden('#dep-inputs') && await page.isHidden('#arr-inputs'));
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

  // Google Maps aus der Detailansicht (im Browser: window.open)
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; });
  await page.click('#view-plan #btn-search');
  await page.waitForSelector('#view-results.active .rcard[data-open="t0"]');
  await page.click('.rcard[data-open="t0"]');
  await page.waitForSelector('#view-detail.active .hero-actions');
  await page.click('.hero-actions [data-nav]');
  await page.click('.hero-actions [data-gmaps="transit"]');
  await page.click('.tl-leg .nav-link >> nth=-1');
  await page.click('#view-detail [data-back]');
  await page.click('.rcard[data-open="d-car"] [data-gmaps="car"]');
  assert.ok(await page.isVisible('#view-results.active'), 'Klick auf Google-Maps-Knopf öffnet keine Details');
  await page.click('.gm-chip[data-gmaps="walk"]');
  const opened = await page.evaluate(() => window.__opened);
  const nav = new URL(opened[0]);
  assert.strictEqual(nav.searchParams.get('destination'), '50.942950,6.958590', 'Navigation zur Haltestelle Köln Hbf');
  assert.strictEqual(nav.searchParams.get('travelmode'), 'walking');
  assert.strictEqual(nav.searchParams.get('dir_action'), 'navigate');
  const whole = new URL(opened[1]);
  assert.strictEqual(whole.searchParams.get('travelmode'), 'transit');
  assert.strictEqual(whole.searchParams.get('origin'), null, 'Mein Standort → Google nimmt den aktuellen Standort');
  assert.strictEqual(new URL(opened[2]).searchParams.get('destination'), '50.727440,7.094530', 'letzter Fußweg zum Ziel');
  assert.strictEqual(new URL(opened[3]).searchParams.get('travelmode'), 'driving');
  assert.strictEqual(new URL(opened[4]).searchParams.get('travelmode'), 'walking');
  await page.click('#view-results [data-back]');

  // Zeitfenster: ab jetzt los, spätestens in 75 Min. da (ohne Auto)
  async function setArrival(minutes) {
    await page.click('#arr-type [data-v="by"]');
    await page.evaluate((m) => {
      const d = new Date(Date.now() + m * 60000);
      const p = (n) => String(n).padStart(2, '0');
      document.getElementById('arr-date').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      document.getElementById('arr-time').value = p(d.getHours()) + ':' + p(d.getMinutes());
      document.getElementById('arr-time').dispatchEvent(new Event('change'));
    }, minutes);
  }
  await page.click('[data-mode="car"]');
  await setArrival(75);
  await page.click('#btn-search');
  await page.waitForSelector('#view-results.active .banner');
  await page.waitForSelector('.rcard[data-open="d-walk"]:not(.loading)');
  const banner = await page.textContent('.banner');
  assert.ok(/Spätestens losgehen um/.test(banner), banner);
  const leave0 = (await page.textContent('.rcard[data-open="t0"] .leave-head b')).replace('Losgehen ', '');
  assert.ok(banner.indexOf(leave0) >= 0, 'Banner nennt die Losgeh-Zeit der besten Verbindung: ' + banner + ' / ' + leave0);
  assert.ok(await page.isVisible('.rcard.best[data-open="t0"]'));
  assert.ok(/Min\. zu spät/.test(await page.textContent('.rcard[data-open="t1"]')));
  assert.ok(/Min\. zu spät/.test(await page.textContent('.rcard[data-open="d-walk"]')));
  const planCall = log.filter((u) => u.indexOf('/plan') > 0).pop();
  assert.strictEqual(new URL(planCall).searchParams.get('arriveBy'), 'true');
  await shot('11-zeitfenster-ergebnis');
  await page.click('.banner');
  await page.waitForSelector('#view-detail.active .judge.ok');
  assert.ok(/Min\. vor/.test(await page.textContent('.judge.ok')));
  await shot('12-zeitfenster-details');
  await page.click('#view-detail [data-back]');
  await page.click('#view-results [data-back]');

  // Nicht zu schaffen: spätestens in 30 Min. da → zweite Suche ab jetzt
  const before = log.filter((u) => u.indexOf('/plan') > 0).length;
  await setArrival(30);
  await page.click('#btn-search');
  await page.waitForSelector('.banner.bad');
  await page.waitForFunction(() => !document.querySelector('#res-body .loading-line'));
  const plans = log.filter((u) => u.indexOf('/plan') > 0).slice(before);
  assert.strictEqual(plans.length, 2, 'Fristsuche + Suche ab jetzt');
  assert.strictEqual(new URL(plans[1]).searchParams.get('arriveBy'), 'false');
  assert.ok(/nicht zu schaffen/.test(await page.textContent('.banner.bad')));
  assert.ok(/Frühestens da um \d\d:\d\d/.test(await page.textContent('.banner.bad')));
  await shot('13-nicht-zu-schaffen');
  await page.click('#view-results [data-back]');
  await page.click('#arr-type [data-v="any"]');
  await page.click('[data-mode="car"]');

  // Zuletzt gesucht
  assert.ok(await page.isVisible('#recent-box'));
  assert.ok((await page.textContent('#recent')).indexOf('Mein Standort → Poppelsdorfer Allee 49') >= 0);

  // Favoriten: Zuhause festlegen über die Leiste
  await page.click('#view-plan [data-clear="to"]');
  await page.click('#view-plan [data-clear="from"]');
  await page.keyboard.press('Escape');
  assert.ok((await page.textContent('#favs')).indexOf('Zuhause festlegen') >= 0);
  await page.click('#favs [data-fav-new="home"]');
  await page.waitForSelector('#sheet:not([hidden]) #fav-addr');
  await page.fill('#fav-addr', 'Ebertplatz');
  await page.waitForSelector('#fav-sug [data-favsg="0"]');
  await page.click('#fav-sug [data-favsg="0"]');
  await page.waitForSelector('.fav-place');
  await shot('14-favorit-zuhause');
  await page.click('[data-fav-save]');
  assert.ok(await page.isHidden('#sheet'));
  assert.ok(await page.isVisible('#favs [data-fav="home"]'));

  // Ziel eingeben und über den Stern als "Arbeit" speichern
  await page.fill('#in-to', 'Poppelsdorfer');
  await page.waitForSelector('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await page.click('.sg-item:has-text("Poppelsdorfer Allee 49")');
  assert.ok(await page.isVisible('[data-star="to"]'));
  await page.click('[data-star="to"]');
  await page.waitForSelector('#sheet:not([hidden]) [data-fav-kind]');
  assert.strictEqual(await page.inputValue('#fav-name'), 'Poppelsdorfer Allee 49');
  await page.click('[data-fav-kind] [data-v="work"]');
  await page.click('[data-fav-save]');
  assert.strictEqual(await page.inputValue('#in-to'), 'Arbeit · Poppelsdorfer Allee 49');
  assert.ok(await page.isVisible('[data-star="to"].on'));

  // Eigener Favorit "Oma" über "Bearbeiten" → "Neuer Favorit"
  await page.click('#favs [data-fav-manage]');
  await page.waitForSelector('#sheet:not([hidden]) .fav-list');
  await page.click('#sheet [data-fav-new="other"]');
  await page.fill('#fav-name', 'Oma');
  await page.fill('#fav-addr', 'Poppelsdorfer');
  await page.waitForSelector('#fav-sug [data-favsg="1"]');
  await page.click('#fav-sug [data-favsg="1"]');
  assert.strictEqual(await page.inputValue('#fav-name'), 'Oma', 'Name bleibt nach Adresswahl erhalten');
  await page.click('[data-fav-save]');
  await page.waitForSelector('#sheet:not([hidden]) .fav-list');
  const rows = await page.$$eval('.fav-row .fav-txt b', (els) => els.map((e) => e.textContent));
  assert.deepStrictEqual(rows, ['Zuhause', 'Arbeit', 'Oma']);
  await shot('15-favoriten-verwalten');
  await page.click('.sheet-head [data-close-sheet]');
  await shot('16-favoriten-leiste');

  // Favorit antippen: Ziel = Oma, Start (leer) = Mein Standort (GPS)
  assert.strictEqual(await page.inputValue('#in-from'), '');
  await page.click('#favs [data-fav]:has-text("Oma")');
  assert.strictEqual(await page.inputValue('#in-to'), 'Oma · Poppelsdorfer Platz');
  await page.waitForFunction(() => document.getElementById('in-from').value.indexOf('Mein Standort') === 0);

  // Vorschläge: Favoriten zuerst
  await page.click('#view-plan [data-clear="to"]');
  const firstSug = await page.textContent('#suggest .sg-item >> nth=1');
  assert.ok(firstSug.indexOf('Zuhause') >= 0, 'nach "Mein Standort" kommt Zuhause: ' + firstSug);
  await page.fill('#in-to', 'Om');
  await page.waitForSelector('#suggest .sg-item:has-text("Oma")');
  await page.click('#suggest .sg-item:has-text("Oma")');
  await page.click('#btn-search');
  await page.waitForSelector('#view-results.active');
  assert.strictEqual(await page.textContent('#res-title'), 'Mein Standort → Oma');
  await page.click('#view-results [data-back]');

  // Zuhause löschen (zweimal tippen)
  await page.click('#favs [data-fav-manage]');
  await page.click('[data-fav-edit="home"]');
  await page.click('[data-fav-delete]');
  assert.ok(/Wirklich löschen/.test(await page.textContent('[data-fav-delete]')));
  await page.click('[data-fav-delete]');
  await page.waitForSelector('#sheet .fav-row.empty[data-fav-new="home"]');
  await page.click('.sheet-head [data-close-sheet]');
  assert.ok((await page.textContent('#favs')).indexOf('Zuhause festlegen') >= 0);
  // Favoriten bleiben nach dem Neuladen erhalten
  await page.reload();
  await page.waitForSelector('#favs [data-fav="work"]');
  assert.ok(await page.isVisible('#favs [data-fav]:has-text("Oma")'));
  await page.fill('#in-to', 'Poppelsdorfer');
  await page.waitForSelector('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await page.click('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await page.click('#btn-locate');
  await page.waitForFunction(() => document.getElementById('in-from').value.indexOf('Mein Standort ·') === 0);

  // Fehlerfall: Fahrplanauskunft nicht erreichbar
  await page.unroute(/./);
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.click('#btn-search');
  await page.waitForSelector('[data-retry="transit"]');
  await shot('10-fehler');

  assert.deepStrictEqual(errors, [], 'JS-Fehler in der Seite: ' + errors.join('\n'));
  await browser.close();
}

/** Wie in der Android-App: window.Android als Brücke (Netz über fetch, damit die Testantworten greifen). */
async function runAndroid() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Berlin',
    geolocation: { latitude: fx.P.start[0], longitude: fx.P.start[1] }, permissions: ['geolocation']
  });
  const page = await ctx.newPage();
  const errors = [], log = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockNetwork(page, log);
  await page.addInitScript(() => {
    const bodies = {};
    // wie SharedPreferences: übersteht das Neuladen der Seite
    const javaList = () => JSON.parse(sessionStorage.getItem('javaList') || '[]');
    const setJavaList = (l) => sessionStorage.setItem('javaList', JSON.stringify(l));
    window.__sched = []; window.__cancel = []; window.__maps = [];
    window.Android = {
      httpGet(id, url) {
        fetch(url).then((r) => r.text().then((t) => { bodies[id] = t; window.U.api._done(id, r.status); }),
          () => { bodies[id] = 'Keine Verbindung'; window.U.api._done(id, 0); });
      },
      httpBody(id) { const b = bodies[id]; delete bodies[id]; return b || ''; },
      scheduleReminder(json) { const r = JSON.parse(json); window.__sched.push(r); setJavaList(javaList().concat([r])); return '{"alarm":"exact","notify":"asking"}'; },
      cancelReminder(id) { window.__cancel.push(id); setJavaList(javaList().filter((r) => r.id !== id)); },
      listReminders() { return JSON.stringify(javaList()); },
      openMaps(p, f) { window.__maps.push([p, f]); },
      openNotifySettings() { window.__notifySettings = true; },
      share() {}
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
  const shot = (name, full) => page.screenshot({ path: path.join(OUT, 'android-' + name + '.png'), fullPage: full !== false });

  await page.click('#btn-locate');
  await page.waitForFunction(() => document.getElementById('in-from').value.indexOf('Mein Standort ·') === 0);
  await page.fill('#in-to', 'Poppelsdorfer');
  await page.waitForSelector('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await page.click('.sg-item:has-text("Poppelsdorfer Allee 49")');
  await page.click('#btn-search');
  await page.waitForSelector('#view-results.active .rcard[data-open="t0"]');
  await page.click('.rcard[data-open="t0"]');
  await page.waitForSelector('#view-detail.active [data-remind]');

  // Google Maps über die Brücke: App-Link + Ersatz-Link
  await page.click('.hero-actions [data-nav]');
  const maps = await page.evaluate(() => window.__maps);
  assert.strictEqual(maps[0][0], 'google.navigation:q=50.942950,6.958590&mode=w');
  assert.ok(maps[0][1].indexOf('dir_action=navigate') > 0);

  // Erinnerung stellen: Losgehen ist in ca. 12 Min. → 15 Min. vorher geht nicht mehr
  await page.click('[data-remind]');
  await page.waitForSelector('#sheet:not([hidden]) .remind-leads');
  assert.ok(await page.isDisabled('[data-lead="15"]'), '15 Min. vorher liegt in der Vergangenheit');
  assert.ok(!(await page.isDisabled('[data-lead="5"]')));
  await page.click('[data-lead="5"]');
  assert.ok(/Du bekommst um \d\d:\d\d eine Erinnerung und um \d\d:\d\d die Meldung „Jetzt losgehen!“/.test(await page.textContent('#sheet-body')));
  await page.waitForTimeout(300);
  await shot('1-erinnern', false);
  await page.click('[data-remind-set]');
  const sched = await page.evaluate(() => window.__sched);
  assert.strictEqual(sched.length, 1);
  const r = sched[0];
  assert.strictEqual(r.lead, 5);
  assert.strictEqual(r.titleBefore, 'In 5 Min. losgehen');
  assert.strictEqual(r.titleNow, 'Jetzt losgehen!');
  assert.ok(/Köln Hbf/.test(r.text) && /Schritte/.test(r.text), r.text);
  assert.ok(r.navUrl.indexOf('destination=50.942950%2C6.958590') > 0 || r.navUrl.indexOf('destination=50.942950,6.958590') > 0, r.navUrl);
  assert.strictEqual(r.label, 'Mein Standort → Poppelsdorfer Allee 49');
  assert.ok(r.leaveAt > Date.now());
  assert.ok(await page.isVisible('.action.remind.on'));
  await shot('2-erinnerung-aktiv');

  // Benachrichtigungen abgelehnt → Hinweis mit Einstellungen
  await page.evaluate(() => window.U.app.onNotifyPermission(false));
  await page.click('#view-detail [data-back]');
  await page.click('#view-results [data-back]');
  assert.ok(await page.isVisible('#remind-box'));
  assert.ok(/Benachrichtigungen sind ausgeschaltet/.test(await page.textContent('#reminders')));
  await page.click('[data-notify-settings]');
  assert.strictEqual(await page.evaluate(() => window.__notifySettings), true);
  await shot('3-erinnerungen-liste');

  // Tipp auf die Benachrichtigung → aktuelle Verbindungen
  await page.evaluate((rem) => window.U.app.onReminderTap(rem.id, rem), r);
  await page.waitForSelector('#view-results.active .rcard[data-open="t0"]');
  assert.strictEqual(await page.textContent('#res-title'), 'Mein Standort → Poppelsdorfer Allee 49');
  await page.click('#view-results [data-back]');

  // Nach Neustart der Seite: Liste kommt aus Android
  await page.reload();
  await page.waitForSelector('#remind-box:not([hidden]) .remind-item');
  await page.click('[data-remind-cancel]');
  assert.deepStrictEqual(await page.evaluate(() => window.__cancel), [r.id]);
  assert.ok(await page.isHidden('#remind-box'));

  assert.deepStrictEqual(errors, [], 'JS-Fehler: ' + errors.join('\n'));
  await browser.close();
}

server.listen(0, '127.0.0.1', async () => {
  try {
    await run('light');
    await run('dark');
    await runAndroid();
    console.log('UI-Test bestanden. Screenshots: ' + OUT);
    server.close();
  } catch (e) {
    console.error('UI-Test FEHLGESCHLAGEN:', e && e.stack || e);
    server.close();
    process.exit(1);
  }
});

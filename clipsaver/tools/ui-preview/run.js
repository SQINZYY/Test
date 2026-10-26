// Öffnet die Oberfläche mit mock.js in Chromium (Playwright), klickt die wichtigsten Abläufe durch,
// macht Screenshots und meldet JavaScript-Fehler.  Aufruf: node tools/ui-preview/run.js [ausgabe-ordner]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WWW = path.join(__dirname, '..', '..', 'app', 'assets', 'www');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/www\//, '/');
  const file = path.join(WWW, p === '/' ? 'index.html' : p);
  if (!file.startsWith(WWW) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/www/index.html`;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript({ path: path.join(__dirname, 'mock.js') });
  await page.goto(base);
  // Element mittig scrollen, damit die feste Navigation unten den Tipp nicht abfängt
  const tap = async (sel, opts) => {
    await page.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
    await page.click(sel, opts);
  };
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };
  const analyze = async url => {
    await page.fill('#in-home', url);
    await tap('[data-a="analyze"][data-slot="home"]');
    await page.waitForSelector('.q, .grid, .error-card, .libcard', { timeout: 3000 });
  };

  await shot('01-start');
  await analyze('https://www.youtube.com/watch?v=abcdefghijk');
  await tap('[data-q="2160"]');
  await shot('02-youtube-4k');
  await tap('[data-a="downloadVideo"]');
  await analyze('https://vm.tiktok.com/ZMabc/');
  await shot('03-tiktok-video');
  await tap('[data-q="2160"]', { force: true }); // ausgegraut → nur Hinweis, Auswahl bleibt
  await analyze('https://www.tiktok.com/@travel.diary/photo/7300000000000000001');
  await tap('[data-a="toggleImg"][data-i="1"]');
  await shot('04-tiktok-photos');
  await analyze('https://www.youtube.com/post/UgkxAAAAAAAAAAAA');
  await shot('05-youtube-post');
  await analyze('https://www.youtube.com/watch?v=old');
  await shot('06-low-res');
  await analyze('https://www.youtube.com/playlist?list=PL1');
  await shot('07-playlist');
  await analyze('https://www.youtube.com/watch?v=privat');
  await shot('08-error');
  await page.click('[data-tab="ads"]');
  await shot('09-ads');
  await tap('[data-a="lib"][data-lib="google"]');
  await page.waitForSelector('.screen');
  await shot('10-found-media');
  await tap('[data-a="downloadFound"]');
  await page.waitForTimeout(300);
  await shot('11-downloads');
  await tap('[data-a="histMenu"][data-i="0"]');
  await shot('12-history-menu');
  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });
  await page.click('[data-tab="more"]');
  await shot('13-more');
  const handled = await page.evaluate(() => CS.back());
  await browser.close();
  server.close();
  if (!handled) errors.push('CS.back() hat nicht zur Startseite gewechselt');
  if (errors.length) { console.error('Fehler:\n' + errors.join('\n')); process.exit(1); }
  console.log('OK – Screenshots in ' + OUT);
})().catch(e => { console.error(e); server.close(); process.exit(1); });

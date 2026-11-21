// Prüft die JavaScript-Schnipsel, die die App in fremden Seiten ausführt, in Chromium (Playwright):
//   BrowserActivity.SCAN_JS (Medien-Erkennung), Analyzer.TIKTOK_JS und Analyzer.YT_JS (unsichtbarer Browser).
// Die Schnipsel werden direkt aus dem Java-Quelltext gelesen.  Aufruf: node tools/test/browser-js.js
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'app', 'java', 'de', 'clipsaver', 'app');

/** Liest eine Java-Konstante aus "..." + "..." + MAX_ITEMS + "..." zusammen. */
function javaConst(file, name, vars) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8');
  const start = src.indexOf(name + ' = ');
  const end = src.indexOf(';\n', start);
  const expr = src.slice(start + name.length + 3, end);
  let out = '';
  const re = /"((?:[^"\\]|\\.)*)"|([A-Z_]+)/g;
  let m;
  while ((m = re.exec(expr))) out += m[1] !== undefined ? JSON.parse('"' + m[1] + '"') : String(vars[m[2]]);
  return out;
}

/** Kleines PNG (einfarbig) in beliebiger Größe. */
function png(w, h) {
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const AD_PAGE = `<!doctype html><html><head><meta property="og:image" content="/og.png"></head><body>
<img src="/ad-big.png" width="300"><img src="/icon.png"><img src="/ad-square.png">
<video src="/ad.mp4" poster="/poster.png"></video>
<video><source src="/stream.m3u8" type="application/x-mpegURL"></video>
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0" width="10" height="10"></iframe>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":
{"imagePost":{"images":[{"imageURL":{"urlList":["https://p16.tiktokcdn.com/a~tplv-photomode-image.jpeg"]},"imageWidth":1080,"imageHeight":1440}]}}}}}}</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const sizes = { '/ad-big.png': [1200, 628], '/icon.png': [32, 32], '/ad-square.png': [600, 600], '/og.png': [1200, 630], '/poster.png': [400, 700] };
  if (sizes[u]) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(png(...sizes[u])); }
  if (u === '/ads') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(AD_PAGE); }
  const fix = { '/tiktok': 'tiktok-photo.html', '/post': 'youtube-post.html' }[u];
  if (fix) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'fixtures', fix))); }
  res.writeHead(404); res.end();
});

let failed = 0;
const check = (cond, what) => { console.log((cond ? 'ok     ' : 'FEHLER ') + what); if (!cond) failed++; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const SCAN_JS = javaConst('BrowserActivity.java', 'SCAN_JS', { MAX_ITEMS: 300 });
  const TIKTOK_JS = javaConst('Analyzer.java', 'TIKTOK_JS', {});
  const YT_JS = javaConst('Analyzer.java', 'YT_JS', {});
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Externe Adressen (YouTube-iframe) nicht wirklich laden
  await page.route(/^https:\/\//, r => r.fulfill({ status: 204, body: '' }));

  await page.goto(base + '/ads', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const items = JSON.parse(await page.evaluate(SCAN_JS));
  const find = (k, part) => items.find(i => i.k === k && i.u.includes(part));
  check(find('image', '/ad-big.png') && find('image', '/ad-big.png').w === 1200, 'SCAN_JS: großes Bild mit echter Größe');
  check(!find('image', '/icon.png'), 'SCAN_JS: kleines Icon ausgelassen');
  check(find('image', '/ad-square.png'), 'SCAN_JS: zweites Bild');
  check(find('video', '/ad.mp4') && find('video', '/ad.mp4').p.endsWith('/poster.png'), 'SCAN_JS: Video mit Vorschaubild');
  check(find('image', '/poster.png'), 'SCAN_JS: Vorschaubild auch als Bild');
  check(find('hls', '/stream.m3u8'), 'SCAN_JS: HLS-Quelle');
  check(find('frame', 'youtube.com/embed/dQw4w9WgXcQ'), 'SCAN_JS: YouTube-iframe');
  check(find('image', '/og.png'), 'SCAN_JS: og:image (relativ → absolut)');
  check(find('image', 'tplv-photomode-image.jpeg'), 'SCAN_JS: TikTok-Seitendaten (Foto-Post)');

  await page.goto(base + '/tiktok');
  const tt = await page.evaluate(TIKTOK_JS);
  check(tt && JSON.parse(tt).imagePost.images.length === 3, 'TIKTOK_JS: itemStruct aus der Seite');
  await page.goto(base + '/ads');
  const ttNone = await page.evaluate(`(function(){var e=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');e.textContent='kaputt';return ${TIKTOK_JS}})()`);
  check(ttNone === null, 'TIKTOK_JS: kaputte Daten → null statt Fehler');

  await page.goto(base + '/post');
  const yt = await page.evaluate(YT_JS);
  check(yt && JSON.parse(yt).contents.twoColumnBrowseResultsRenderer, 'YT_JS: ytInitialData');

  await browser.close();
  server.close();
  console.log(failed + ' Fehler');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });

// Oberflächentest im Chromium (Playwright): Diashow anlegen, Musik, Text, Stil, Video exportieren,
// Collage, Foto-Editor und GIF. Aufruf:
//   node diashow/tools/e2e.js <ordner-mit-testbildern+music.mp3> <ausgabeordner>
// Erwartet im Testordner: img1.jpg … img6.jpg, music.mp3
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app', 'assets');
const DATA = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'e2e-out');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});

const imgs = (n) => [...Array(n).keys()].map((i) => path.join(DATA, `img${i + 1}.jpg`));
let step = 0;
async function shot(page, name) {
  step++;
  const f = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: f });
  console.log('  Screenshot', path.basename(f));
}

async function pick(page, files, click) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click()]);
  await chooser.setFiles(files);
}

async function download(page, click, name) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), click()]);
  const f = path.join(OUT, name || dl.suggestedFilename());
  await dl.saveAs(f);
  console.log('  Datei', path.basename(f), fs.statSync(f).size, 'Bytes');
  return f;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });
  await page.goto(`http://localhost:${port}/www/index.html`);
  await page.waitForSelector('.hero');
  await page.waitForTimeout(400);
  await shot(page, 'start');

  console.log('Diashow anlegen');
  await pick(page, imgs(6), () => page.click('.hero'));
  await page.waitForSelector('.editor canvas.preview');
  await page.waitForTimeout(1500);
  await shot(page, 'editor');
  if ((await page.$$('.strip .thumb:not(.add)')).length !== 6) throw new Error('Nicht 6 Bilder in der Leiste');

  // Bildtext beim 2. Bild
  await page.click('.strip .thumb[data-i="1"]');
  await page.fill('.panel input.input', 'Ein Tag in den Bergen');
  await page.waitForTimeout(600);
  await shot(page, 'bild-text');

  // Stil
  await page.click('.tab[data-tab="style"]');
  await page.waitForTimeout(500);
  await shot(page, 'stil');
  await page.click('.style-card:nth-child(4)'); // Kino
  await page.waitForTimeout(1200);
  await page.click('.canvas-wrap'); // Pause
  await shot(page, 'stil-kino');

  // Text
  await page.click('.tab[data-tab="text"]');
  const inputs = await page.$$('.panel input.input');
  await inputs[0].fill('Sommerurlaub 2026');
  await inputs[1].fill('Italien · August');
  await inputs[2].fill('Danke fürs Zuschauen');
  await page.waitForTimeout(800);
  await shot(page, 'text');

  // Musik
  await page.click('.tab[data-tab="music"]');
  await pick(page, [path.join(DATA, 'music.mp3')], () => page.click('.music-empty .btn'));
  await page.waitForSelector('.music-card');
  await page.waitForTimeout(400);
  await shot(page, 'musik');

  // Format: Hochformat + 720p (schnellerer Test)
  await page.click('.tab[data-tab="format"]');
  await page.click('.format-card:nth-child(2)');
  await page.waitForTimeout(300);
  await page.click('text=HD (720p)');
  await page.waitForTimeout(500);
  await shot(page, 'format');

  console.log('Video exportieren');
  const t0 = Date.now();
  const video = await download(page, () => page.click('.bar .btn.primary'), 'diashow.mp4');
  console.log('  Export dauerte', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await page.waitForSelector('.result-video');
  await page.waitForTimeout(800);
  await shot(page, 'video-fertig');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Zurück zur Startseite: Projekt muss in der Liste stehen
  await page.keyboard.press('Escape');
  await page.waitForSelector('.project');
  await page.waitForTimeout(500);
  await shot(page, 'start-mit-projekt');

  // Projekt wieder öffnen (aus IndexedDB)
  await page.click('.project');
  await page.waitForSelector('.editor canvas.preview');
  await page.waitForTimeout(1200);
  const n = (await page.$$('.strip .thumb:not(.add)')).length;
  if (n !== 6) throw new Error('Projekt nach erneutem Öffnen unvollständig: ' + n);
  await page.click('.tab[data-tab="music"]');
  await page.waitForSelector('.music-card');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('Collage');
  await pick(page, imgs(4), () => page.click('.tool:nth-child(1)'));
  await page.waitForSelector('.tool-screen canvas.preview');
  await page.waitForTimeout(800);
  await page.click('.layout:nth-child(2)');
  await page.waitForTimeout(300);
  const cbox = await page.$('canvas.tool-canvas');
  const bb = await cbox.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.25, bb.y + bb.height * 0.5);
  await page.waitForTimeout(300);
  await shot(page, 'collage');
  const collage = await download(page, () => page.click('.bar .btn.primary'), 'collage.jpg');
  await page.waitForSelector('.result-img');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  console.log('Foto bearbeiten');
  await pick(page, imgs(2), () => page.click('.tool:nth-child(2)'));
  await page.waitForSelector('.tool-screen canvas.preview');
  await page.waitForTimeout(800);
  await page.click('.look:nth-child(3)');
  await page.click('.tab[data-tab="frame"]');
  await page.click('text=Sofortbild');
  await page.click('.tab[data-tab="text"]');
  await page.fill('.panel input.input', 'Ciao Bella!');
  await page.waitForTimeout(500);
  await shot(page, 'foto');
  const photo = await download(page, () => page.click('.bar .btn.primary'), 'foto.jpg');
  await page.waitForSelector('.result-img');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  console.log('GIF');
  await pick(page, imgs(3), () => page.click('.tool:nth-child(3)'));
  await page.waitForSelector('.tool-screen canvas.preview');
  await page.waitForTimeout(900);
  await shot(page, 'gif');
  const gif = await download(page, () => page.click('.bar .btn.primary'), 'animation.gif');
  await page.waitForSelector('.result-img');
  await shot(page, 'gif-fertig');

  // Breiter Bildschirm (Tablet quer)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('.project');
  await page.waitForSelector('.editor canvas.preview');
  await page.waitForTimeout(1200);
  await shot(page, 'tablet');

  await browser.close();
  server.close();
  const fatal = errors.filter((e) => !/Export mit .* fehlgeschlagen/.test(e));
  console.log('\nKonsole:', errors.length ? '\n  ' + errors.join('\n  ') : 'keine Fehler');
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ video, collage, photo, gif, errors }, null, 2));
  if (fatal.length) process.exitCode = 1;
})().catch(async (e) => {
  console.error('FEHLER:', e);
  server.close();
  process.exit(1);
});

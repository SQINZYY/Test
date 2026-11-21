// Testet die JavaScript-Seite der Android-Brücke mit einem nachgebauten window.Android:
// Bildimport über Ereignisse, stückweises Schreiben (Base64, Positionen), Speichern in der Galerie,
// Musik über den nativen AAC-Weg (Chromium unter Linux kann kein AAC kodieren).
//   node diashow/tools/e2e-native.js <testordner> <ausgabeordner>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app', 'assets');
const DATA = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'e2e-native-out');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // /import/… wie in MainActivity: Testbilder ausliefern
  const p = url.startsWith('/import/') ? path.join(DATA, url.slice(8)) : path.join(ROOT, url);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});

// Nachbau von MainActivity.Bridge (gleiche Methoden und Rückrufe)
const FAKE = `
(() => {
  const files = new Map();
  const log = [];
  window.__native = { files, log };
  const later = (f) => setTimeout(f, 30);
  window.Android = {
    info: () => JSON.stringify({ sdk: 34, version: 'test', model: 'Fake' }),
    pickImages(id, multiple) {
      log.push(['pickImages', multiple]);
      const list = multiple ? [1, 2, 3, 4] : [5];
      later(() => {
        NativeBus.importEvent(id, 'start', { total: list.length + 1 });
        list.forEach((n, i) => NativeBus.importEvent(id, 'item', { url: '/import/img' + n + '.jpg', thumb: '/import/img' + n + '.jpg', w: 2400, h: 1600, date: 1700000000000 - n * 1000, name: 'img' + n + '.jpg', index: i, total: list.length + 1 }));
        NativeBus.importEvent(id, 'item', { error: 'Kein unterstütztes Bildformat', index: list.length, total: list.length + 1 });
        NativeBus.importEvent(id, 'done', { total: list.length + 1 });
      });
    },
    takeShared(id) { this.pickImages(id, true); },
    discardShared() { log.push(['discardShared']); },
    clearImports() { log.push(['clearImports']); },
    fileOpen(name) { const id = Math.random().toString(36).slice(2, 8) + '_' + name; files.set(id, { name, data: new Uint8Array(0), size: 0, closed: false }); return id; },
    fileWrite(id, b64, pos) {
      const f = files.get(id); if (!f || f.closed) return false;
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const at = pos < 0 ? f.size : pos;
      if (at + u8.length > f.data.length) { const n = new Uint8Array(Math.max(at + u8.length, f.data.length * 2)); n.set(f.data.subarray(0, f.size)); f.data = n; }
      f.data.set(u8, at); f.size = Math.max(f.size, at + u8.length); return true;
    },
    fileClose(id) { const f = files.get(id); if (!f) return -1; f.closed = true; return f.size; },
    fileDelete(id) { log.push(['fileDelete', id]); files.delete(id); },
    saveToGallery(id, mime, name, cb) { log.push(['saveToGallery', mime, name, files.has(id)]); later(() => NativeBus.callback(cb, { ok: true, where: (mime.startsWith('video') ? 'Movies' : 'Pictures') + '/Diashow Studio' })); },
    shareFile(id, mime, text) { log.push(['shareFile', mime]); },
    viewFile(id, mime) { log.push(['viewFile', mime]); },
    muxAudio(videoId, pcmId, sr, ch, outId, cb) {
      const v = files.get(videoId), p = files.get(pcmId), o = files.get(outId);
      log.push(['muxAudio', sr, ch, v && v.size, p && p.size, !!o]);
      // Video unverändert als Ergebnis übernehmen (das echte Muxen macht AudioMux.java)
      o.data = v.data.slice(0, v.size); o.size = v.size;
      later(() => NativeBus.callback(cb, { ok: true, size: o.size }));
    },
    keepScreenOn(on) { log.push(['keepScreenOn', on]); },
    toast(t) { log.push(['toast', t]); },
    exit() {},
  };
})();
`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // /out/… (Videovorschau) liefert auf dem Handy MainActivity aus – hier gibt es das nicht
    if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://localhost:${port}/www/index.html`);
  await page.waitForSelector('.hero');

  // Bildimport (4 Bilder + 1 Fehler)
  await page.click('.hero');
  await page.waitForSelector('.editor canvas.preview');
  await page.waitForTimeout(800);
  const thumbs = (await page.$$('.strip .thumb:not(.add)')).length;
  console.log('Bilder in der Diashow:', thumbs);
  if (thumbs !== 4) throw new Error('Erwartet 4 Bilder');
  const toastText = await page.textContent('#toast');
  console.log('Hinweis:', toastText);

  // Musik (normale Dateiauswahl der WebView)
  await page.click('.tab[data-tab="music"]');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.music-empty .btn')]);
  await chooser.setFiles(path.join(DATA, 'music.mp3'));
  await page.waitForSelector('.music-card');

  // Kurz halten: Dauer 2 s, 720p
  await page.click('.tab[data-tab="style"]');
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.panel input[type=range]')][0];
    r.value = 2;
    r.dispatchEvent(new Event('input'));
  });
  await page.click('.tab[data-tab="format"]');
  await page.click('text=HD (720p)');

  await page.click('.bar .btn.primary');
  await page.waitForSelector('.result-video', { timeout: 180000 });
  const res = await page.evaluate(() => {
    const out = [];
    for (const [id, f] of window.__native.files) {
      let s = '';
      const u8 = f.data.subarray(0, f.size);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      out.push({ id, name: f.name, size: f.size, b64: btoa(s) });
    }
    return { files: out, log: window.__native.log };
  });
  console.log('Brücken-Aufrufe:');
  for (const l of res.log) console.log('  ', JSON.stringify(l));
  for (const f of res.files) {
    console.log('Datei', f.name, f.size);
    fs.writeFileSync(path.join(OUT, f.name), Buffer.from(f.b64, 'base64'));
  }
  const info = await page.textContent('.result');
  console.log('Ergebnis:', info.replace(/\s+/g, ' ').trim());
  await browser.close();
  server.close();
  console.log('Konsole:', errors.length ? errors.join('\n') : 'keine Fehler');
  if (errors.length) process.exitCode = 1;
})().catch((e) => {
  console.error('FEHLER:', e);
  server.close();
  process.exit(1);
});

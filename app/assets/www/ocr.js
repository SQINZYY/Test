// Screenshots -> Text (Tesseract, läuft komplett auf dem Handy) -> Teile + Produktbilder.
'use strict';

let ocrWorker = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}

async function getOcrWorker(onProgress) {
  if (ocrWorker) return ocrWorker;
  const base = new URL('vendor/tesseract/', location.href).href;
  if (typeof Tesseract === 'undefined') await loadScript(base + 'tesseract.min.js');
  ocrWorker = await Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base + 'core',
    langPath: base + 'lang',
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: m => onProgress && onProgress(m),
  });
  return ocrWorker;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild kann nicht geladen werden'));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Für die Texterkennung: Graustufen, bei dunklem Design invertiert, kleine Bilder vergrößert.
function prepareForOcr(img) {
  const scale = img.naturalWidth < 1000 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth * scale;
  c.height = img.naturalHeight * scale;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = l;
    sum += l;
  }
  if (sum / (px.length / 4) < 110) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  g.putImageData(d, 0, 0);
  return { canvas: c, scale };
}

// Sucht neben (links) bzw. über einer Textzeile ein Produktbild und schneidet es aus.
function cropProductImage(img, box) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const lh = Math.max(8, box.y1 - box.y0);
  const bgPx = g.getImageData(Math.max(0, box.x0 - 3), Math.round((box.y0 + box.y1) / 2), 1, 1).data;

  const find = (rx0, ry0, rx1, ry1, preferBottom) => {
    rx0 = Math.max(0, Math.round(rx0)); ry0 = Math.max(0, Math.round(ry0));
    rx1 = Math.min(W, Math.round(rx1)); ry1 = Math.min(H, Math.round(ry1));
    const w = rx1 - rx0, h = ry1 - ry0;
    if (w < 24 || h < 24) return null;
    const data = g.getImageData(rx0, ry0, w, h).data;
    const diff = (x, y) => {
      const i = (y * w + x) * 4;
      return Math.abs(data[i] - bgPx[0]) + Math.abs(data[i + 1] - bgPx[1]) + Math.abs(data[i + 2] - bgPx[2]) > 60;
    };
    const step = 2;
    const cols = new Array(w).fill(0), rows = new Array(h).fill(0);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (diff(x, y)) { cols[x]++; rows[y]++; }
    // Längster zusammenhängender Bereich mit genug "Nicht-Hintergrund"
    const runs = (arr, n, min) => {
      const out = [];
      let s = -1;
      for (let i = 0; i < n; i += step) {
        const on = arr[i] >= min;
        if (on && s < 0) s = i;
        if (!on && s >= 0) { out.push([s, i]); s = -1; }
      }
      if (s >= 0) out.push([s, n]);
      return out;
    };
    const colRuns = runs(cols, w, Math.max(2, h / step * 0.12)).filter(r => r[1] - r[0] >= 20);
    if (!colRuns.length) return null;
    // Beim Suchen links: der Bereich, der der Zeile am nächsten ist; oben: der breiteste
    let cr = preferBottom ? colRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] : colRuns[colRuns.length - 1];
    const rowsIn = new Array(h).fill(0);
    for (let y = 0; y < h; y += step) for (let x = cr[0]; x < cr[1]; x += step) if (diff(x, y)) rowsIn[y]++;
    const rowRuns = runs(rowsIn, h, Math.max(2, (cr[1] - cr[0]) / step * 0.12)).filter(r => r[1] - r[0] >= 20);
    if (!rowRuns.length) return null;
    const mid = (box.y0 + box.y1) / 2 - ry0;
    const rr = preferBottom ? rowRuns[rowRuns.length - 1]
      : rowRuns.slice().sort((a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid))[0];
    // Spalten nur in den gewählten Zeilen neu bestimmen (sonst zählen Nachbarbilder/Kopfzeilen mit)
    const colsIn = new Array(w).fill(0);
    for (let y = rr[0]; y < rr[1]; y += step) for (let x = 0; x < w; x += step) if (diff(x, y)) colsIn[x]++;
    const colRuns2 = runs(colsIn, w, Math.max(2, (rr[1] - rr[0]) / step * 0.12)).filter(x => x[1] - x[0] >= 20);
    if (colRuns2.length) cr = preferBottom ? colRuns2.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] : colRuns2[colRuns2.length - 1];
    const bw = cr[1] - cr[0], bh = rr[1] - rr[0];
    if (bw < Math.max(28, lh * 1.4) || bh < Math.max(28, lh * 1.4)) return null;
    if (bw / bh > 2.5 || bh / bw > 2.5) return null;
    return { x: rx0 + cr[0], y: ry0 + rr[0], w: bw, h: bh };
  };

  const r = find(0, box.y0 - lh * 5, box.x0 - 4, box.y1 + lh * 5, false)
    || find(box.x0 - lh * 2, box.y0 - lh * 14, Math.max(box.x1, box.x0 + lh * 10), box.y0 - 2, true);
  if (!r) return null;
  const out = document.createElement('canvas');
  const size = 112;
  out.width = out.height = size;
  const og = out.getContext('2d');
  og.fillStyle = `rgb(${bgPx[0]},${bgPx[1]},${bgPx[2]})`;
  og.fillRect(0, 0, size, size);
  const k = Math.min(size / r.w, size / r.h);
  og.drawImage(img, r.x, r.y, r.w, r.h, (size - r.w * k) / 2, (size - r.h * k) / 2, r.w * k, r.h * k);
  return out.toDataURL('image/jpeg', 0.82);
}

// Steht links neben dem Text ein Produktbild, liest Tesseract oft ein paar Zeichen des Bildes mit
// ("men | egend WiFi" statt "Legend WiFi"). Solche Zeilen ab der Textspalte noch einmal lesen.
async function cleanLeftNoise(worker, canvas, scale, lines) {
  const counts = {};
  for (const l of lines) if (l.text.length > 12) { const x = Math.round(l.bbox.x0 / 8) * 8; counts[x] = (counts[x] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 3) return;
  const col = +top[0];
  const lh = Math.max(10, ...lines.slice(0, 50).map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b).slice(0, 1));
  const inCol = lines.filter(l => Math.abs(l.bbox.x0 - col) <= 16);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const b = l.bbox;
    if (b.x0 >= col - 16 || b.x1 < col + 40) continue;
    if (categoryLine(l.text)) continue;
    // Nur innerhalb einer Produktkarte (andere Zeilen in der Textspalte direkt darüber/darunter),
    // nicht bei Fließtext über die ganze Breite
    if (!inCol.some(c => Math.abs(c.bbox.y0 - b.y0) < lh * 4)) continue;
    const pad = 4;
    const rect = {
      left: Math.round((col - 8) * scale), top: Math.round((b.y0 - pad) * scale),
      width: Math.round((b.x1 - col + 8 + pad) * scale), height: Math.round((b.y1 - b.y0 + 2 * pad) * scale),
    };
    try {
      const { data } = await worker.recognize(canvas, { rectangle: rect });
      const prev = i > 0 ? normText(lines[i - 1].text) : '';
      // Ist die vorige Zeile mit im Ausschnitt gelandet, nicht doppelt übernehmen
      const t = (data.text || '').split('\n').map(s => s.trim()).filter(s => s && !(prev && prev.includes(normText(s))))
        .join(' ').replace(/\s+/g, ' ').trim();
      if (t.length >= 3) { l.text = t; l.bbox = { ...b, x0: col }; }
    } catch (e) { /* alte Zeile behalten */ }
  }
}

// Ein oder mehrere Screenshots (Data-URLs) -> Import-Kandidaten
async function itemsFromScreenshots(sources, onProgress) {
  const worker = await getOcrWorker(m => {
    if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') onProgress && onProgress('Texterkennung wird geladen …', m.progress * 0.3);
  });
  const all = [];
  for (let n = 0; n < sources.length; n++) {
    onProgress && onProgress(`Screenshot ${n + 1} von ${sources.length} wird gelesen …`, 0.3 + 0.7 * n / sources.length);
    const img = await loadImage(sources[n]);
    const { canvas, scale } = prepareForOcr(img);
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const lines = [];
    for (const block of data.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
      const b = line.bbox;
      lines.push({ text: line.text.trim(), conf: line.confidence, bbox: { x0: b.x0 / scale, y0: b.y0 / scale, x1: b.x1 / scale, y1: b.y1 / scale } });
    }
    lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    await cleanLeftNoise(worker, canvas, scale, lines);
    const items = itemsFromBlocks(lines);
    for (const it of items) {
      if (it.line) {
        try { it.img = cropProductImage(img, it.line.bbox); } catch (e) { it.img = null; }
      }
      delete it.line;
    }
    all.push(...items);
  }
  onProgress && onProgress('Fertig', 1);
  return all;
}

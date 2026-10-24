// Build als Bildkarte zum Teilen (WhatsApp, Discord, Instagram-Story …).
'use strict';

const CARD_W = 1080;

function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Grafik konnte nicht gezeichnet werden'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function dataImage(src) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Text auf maximale Breite kürzen ("…")
function fitText(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

async function renderShareCard(b, author) {
  const theme = DEFAULT_THEME;
  const rows = [];
  for (const c of CATS.filter(x => x.group === 'pc')) {
    for (const p of partsOf(b, c.key)) rows.push({ cat: c, name: p.name, price: priceOf(b, c.key, p), img: safeImg((b.images || {})[c.key + ':' + p.id]) });
    for (const o of customsOf(b, c.key)) rows.push({ cat: c, name: o.name, price: o.price || 0, img: safeImg(o.img) });
  }
  const setup = CATS.filter(x => x.group === 'setup').filter(c => hasAny(b, c.key)).map(c => c.short);
  const t = totals(b);
  const pf = perf(b);

  const sceneH = 560, rowH = 92;
  const H = sceneH + 210 + Math.max(1, rows.length) * rowH + (setup.length ? 70 : 0) + 170;
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = H;
  const g = cv.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, Roboto, "Segoe UI", sans-serif`;

  g.fillStyle = '#071116';
  g.fillRect(0, 0, CARD_W, H);

  // Setup-Grafik oben
  const svg = scene(theme, Math.max(1, partsOf(b, 'monitor').length), true)
    .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${sceneH}" `);
  try { g.drawImage(await svgToImage(svg), 0, 0, CARD_W, sceneH); } catch (e) { /* ohne Grafik weiter */ }
  const fade = g.createLinearGradient(0, sceneH - 260, 0, sceneH);
  fade.addColorStop(0, 'rgba(7,17,22,0)');
  fade.addColorStop(1, 'rgba(7,17,22,1)');
  g.fillStyle = fade;
  g.fillRect(0, sceneH - 260, CARD_W, 260);

  // Titel
  let y = sceneH - 70;
  g.fillStyle = '#2dd4bf';
  g.font = font(600, 32);
  g.fillText(fitText(g, (b.kind === 'mine' ? 'MEIN PC' : 'PC-BUILD') + (author ? ' VON ' + author.toUpperCase() : ''), CARD_W - 120), 60, y - 64);
  g.fillStyle = '#ffffff';
  g.font = font(800, 72);
  g.fillText(fitText(g, b.name, CARD_W - 120), 60, y + 10);

  // Kennzahlen
  y = sceneH + 40;
  const stats = [['Gesamt', fmtEur(t.all)], ['PC', fmtEur(t.pc)]];
  if (pf && pf.fps['1440p']) stats.push(['1440p', `~${pf.fps['1440p']} FPS`]);
  else if (pf && pf.fps['1080p']) stats.push(['1080p', `~${pf.fps['1080p']} FPS`]);
  const sw = (CARD_W - 120 - (stats.length - 1) * 20) / stats.length;
  stats.forEach(([label, val], i) => {
    const x = 60 + i * (sw + 20);
    g.fillStyle = '#0e1f26';
    roundRect(g, x, y, sw, 120, 24);
    g.fill();
    g.fillStyle = '#8ea9ab';
    g.font = font(500, 28);
    g.fillText(label, x + 28, y + 44);
    g.fillStyle = i === stats.length - 1 && pf ? '#2dd4bf' : '#ffffff';
    g.font = font(800, 42);
    g.fillText(fitText(g, val, sw - 56), x + 28, y + 96);
  });

  // Teileliste
  y += 170;
  const imgs = await Promise.all(rows.map(r => dataImage(r.img)));
  if (!rows.length) {
    g.fillStyle = '#8ea9ab';
    g.font = font(500, 34);
    g.fillText('Noch keine Teile im Build', 60, y + 50);
  }
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    if (i > 0) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(60, ry - 6, CARD_W - 120, 2);
    }
    const im = imgs[i];
    g.save();
    roundRect(g, 60, ry + 8, 68, 68, 16);
    g.fillStyle = '#142a33';
    g.fill();
    g.clip();
    if (im) g.drawImage(im, 60, ry + 8, 68, 68);
    g.restore();
    if (!im) {
      g.fillStyle = '#2dd4bf';
      g.font = font(700, 24);
      g.textAlign = 'center';
      g.fillText(r.cat.short.slice(0, 4).toUpperCase(), 94, ry + 50);
      g.textAlign = 'left';
    }
    g.fillStyle = '#8ea9ab';
    g.font = font(500, 24);
    g.fillText(r.cat.short, 150, ry + 32);
    g.fillStyle = '#ffffff';
    g.font = font(700, 32);
    const price = r.price == null ? '–' : fmtEur(r.price);
    g.fillText(fitText(g, r.name, CARD_W - 150 - 60 - 170), 150, ry + 70);
    g.font = font(700, 32);
    g.textAlign = 'right';
    g.fillText(price, CARD_W - 60, ry + 70);
    g.textAlign = 'left';
  });
  y += Math.max(1, rows.length) * rowH;

  if (setup.length) {
    g.fillStyle = '#8ea9ab';
    g.font = font(500, 28);
    g.fillText(fitText(g, `Setup: ${setup.join(' · ')} (${fmtEur(t.setup)})`, CARD_W - 120), 60, y + 44);
    y += 70;
  }

  // Fußzeile
  y = H - 120;
  g.fillStyle = '#0e1f26';
  g.fillRect(0, y, CARD_W, 120);
  const lg = g.createLinearGradient(60, y + 30, 120, y + 90);
  lg.addColorStop(0, '#2dd4bf');
  lg.addColorStop(1, '#0e7490');
  g.fillStyle = lg;
  roundRect(g, 60, y + 30, 60, 60, 16);
  g.fill();
  g.strokeStyle = '#042f2a';
  g.lineWidth = 5;
  g.strokeRect(76, y + 47, 28, 20);
  g.font = font(500, 40);
  g.fillStyle = '#ffffff';
  g.fillText('Setup', 140, y + 74);
  const sw2 = g.measureText('Setup').width;
  g.font = font(800, 40);
  g.fillStyle = '#2dd4bf';
  g.fillText('Builder', 140 + sw2, y + 74);
  g.fillStyle = '#8ea9ab';
  g.font = font(500, 26);
  g.textAlign = 'right';
  g.fillText('Import-Code steht in der Nachricht', CARD_W - 60, y + 72);
  g.textAlign = 'left';
  return cv;
}

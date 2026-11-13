// Collage: 2–9 Fotos in einem Bild. Layout wählen, Abstände/Ecken/Hintergrund einstellen,
// Feld antippen → Bild darin verschieben, zoomen, tauschen oder ersetzen.
import { h, icon, toast, chips, slider, section, clamp, stamp, progressOverlay, sheet } from './util.js';
import { push, header, importImages } from './nav.js';
import { LOOKS, lookById, applyTint, coverSource, roundRect } from './draw.js';
import { FORMATS } from './slideshow.js';
import { Output } from './native.js';

const BGS = [
  { id: '#ffffff', name: 'Weiß', swatch: '#ffffff' },
  { id: '#111111', name: 'Schwarz', swatch: '#111111' },
  { id: '#f3ebe1', name: 'Creme', swatch: '#f3ebe1' },
  { id: '#ffd8cc', name: 'Rosé', swatch: '#ffd8cc' },
  { id: '#cfe6ff', name: 'Himmel', swatch: '#cfe6ff' },
  { id: '#ff7a59', name: 'Koralle', swatch: '#ff7a59' },
  { id: 'blur', name: 'Unscharf', swatch: 'linear-gradient(135deg,#8a7,#c96,#79a)' },
];

const rows = (counts) => {
  const out = [];
  counts.forEach((c, r) => {
    for (let k = 0; k < c; k++) out.push([k / c, r / counts.length, 1 / c, 1 / counts.length]);
  });
  return out;
};
const cols = (counts) => rows(counts).map(([x, y, w, hh]) => [y, x, hh, w]);

/** Layouts im Einheitsquadrat: [x, y, w, h]. over = Feld liegt über den anderen (mit Rand). */
export function layoutsFor(n) {
  const L = [];
  const add = (cells, over) => L.push({ cells, over });
  switch (n) {
    case 2:
      add(cols([1, 1]));
      add(rows([1, 1]));
      add([[0, 0, 0.64, 1], [0.64, 0, 0.36, 1]]);
      add([[0, 0, 1, 0.64], [0, 0.64, 1, 0.36]]);
      add([[0, 0, 1, 1], [0.52, 0.52, 0.4, 0.4]], 1);
      break;
    case 3:
      add([[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]);
      add([[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]]);
      add(cols([1, 1, 1]));
      add(rows([1, 1, 1]));
      add([[0, 0, 0.5, 0.4], [0.5, 0, 0.5, 0.4], [0, 0.4, 1, 0.6]]);
      add([[0, 0, 0.4, 0.5], [0, 0.5, 0.4, 0.5], [0.4, 0, 0.6, 1]]);
      break;
    case 4:
      add(rows([2, 2]));
      add([[0, 0, 0.62, 1], [0.62, 0, 0.38, 1 / 3], [0.62, 1 / 3, 0.38, 1 / 3], [0.62, 2 / 3, 0.38, 1 / 3]]);
      add([[0, 0, 1, 0.62], [0, 0.62, 1 / 3, 0.38], [1 / 3, 0.62, 1 / 3, 0.38], [2 / 3, 0.62, 1 / 3, 0.38]]);
      add([[0, 0, 0.6, 0.6], [0.6, 0, 0.4, 0.6], [0, 0.6, 0.4, 0.4], [0.4, 0.6, 0.6, 0.4]]);
      add(cols([1, 1, 1, 1]));
      add(rows([1, 1, 1, 1]));
      break;
    case 5:
      add(rows([2, 3]));
      add([[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]]);
      add([[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0.25, 0.25, 0.5, 0.5]], 4);
      add(rows([3, 2]));
      add(cols([2, 3]));
      break;
    case 6:
      add(rows([3, 3]));
      add(rows([2, 2, 2]));
      add([[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]]);
      add(rows([1, 2, 3]));
      break;
    case 7:
      add(rows([2, 3, 2]));
      add([[0, 0, 1, 0.5], ...rows([3, 3]).map(([x, y, w, hh]) => [x, 0.5 + y / 2, w, hh / 2])]);
      add(rows([3, 1, 3]));
      add(cols([2, 3, 2]));
      break;
    case 8:
      add(rows([3, 2, 3]));
      add(rows([4, 4]));
      add(rows([2, 2, 2, 2]));
      add([[0, 0, 0.5, 0.5], ...[[0.5, 0], [0.75, 0], [0.5, 0.25], [0.75, 0.25]].map(([x, y]) => [x, y, 0.25, 0.25]), [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]]);
      break;
    default:
      add(rows([3, 3, 3]));
      add([[0, 0, 2 / 3, 2 / 3], ...[[2 / 3, 0], [2 / 3, 1 / 3]].map(([x, y]) => [x, y, 1 / 3, 1 / 3]), ...[0, 1, 2].map((k) => [k / 3, 2 / 3, 1 / 3, 1 / 6]), ...[0, 1, 2].map((k) => [k / 3, 5 / 6, 1 / 3, 1 / 6])]);
      add(rows([2, 3, 4]));
      add(cols([3, 3, 3]));
  }
  return L;
}

function cellRect([x, y, w, hh], W, H, g) {
  const e = 1e-4;
  const l = x * W + (x <= e ? g : g / 2);
  const r = (x + w) * W - (x + w >= 1 - e ? g : g / 2);
  const t = y * H + (y <= e ? g : g / 2);
  const b = (y + hh) * H - (y + hh >= 1 - e ? g : g / 2);
  return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
}

function overRect(cell, W, H, g) {
  const [x, y, w, hh] = cell;
  return { x: x * W, y: y * H, w: w * W, h: hh * H, g };
}

/** Zeichnet die Collage. src(i) → Bitmap des i-ten Feldes. */
export function renderCollage(ctx, W, H, st, src, { selected = -1 } = {}) {
  const lay = st.layouts[st.layout];
  const unit = Math.min(W, H);
  const g = (st.gap / 100) * unit * 0.06;
  const rad = (st.radius / 100) * unit * 0.08;
  ctx.save();
  if (st.bg === 'blur') {
    const b = src(0);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, W, H);
    if (b) {
      const c = coverSource(b.width, b.height, W, H, {});
      ctx.filter = `blur(${Math.round(unit * 0.03)}px) brightness(0.85) saturate(1.2)`;
      ctx.drawImage(b, c.sx, c.sy, c.sw, c.sh, -unit * 0.05, -unit * 0.05, W + unit * 0.1, H + unit * 0.1);
      ctx.filter = 'none';
    }
  } else {
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, W, H);
  }
  const rects = [];
  lay.cells.forEach((cell, k) => {
    let r;
    if (lay.over === k) {
      const o = overRect(cell, W, H, g);
      const pad = Math.max(g, unit * 0.012);
      r = { x: o.x + pad, y: o.y + pad, w: o.w - pad * 2, h: o.h - pad * 2 };
      ctx.fillStyle = st.bg === 'blur' ? '#fff' : st.bg;
      roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, rad + pad);
      ctx.fill();
    } else r = cellRect(cell, W, H, g);
    rects.push(r);
    const c = st.cells[k];
    const bmp = src(k);
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    ctx.fillStyle = '#2a2a33';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (bmp) {
      const s = coverSource(bmp.width, bmp.height, r.w, r.h, { fx: c.fx, fy: c.fy, zoom: c.zoom });
      ctx.filter = lookById(st.look).filter || 'none';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, s.sx, s.sy, s.sw, s.sh, r.x, r.y, r.w, r.h);
      ctx.filter = 'none';
      applyTint(ctx, r.x, r.y, r.w, r.h, st.look);
    }
    ctx.restore();
    if (k === selected) {
      ctx.save();
      ctx.lineWidth = Math.max(3, unit * 0.008);
      ctx.strokeStyle = '#ff7a59';
      roundRect(ctx, r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, r.w - ctx.lineWidth, r.h - ctx.lineWidth, rad);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.restore();
  return rects;
}

function exportSize(format) {
  const [a, b] = format.split(':').map(Number);
  const L = 2400;
  return a >= b ? { w: L, h: Math.round((L * b) / a) } : { w: Math.round((L * a) / b), h: L };
}

export function openCollage(store, ids) {
  const n = Math.min(9, ids.length);
  const st = {
    format: '1:1',
    layouts: layoutsFor(n),
    layout: 0,
    gap: 40,
    radius: 15,
    bg: '#ffffff',
    look: 'none',
    cells: ids.slice(0, n).map((x) => ({ img: x.id, fx: 0.5, fy: 0.5, zoom: 1 })),
  };
  let sel = -1;
  let swapFrom = -1;
  let rects = [];

  const canvas = h('canvas', { class: 'preview tool-canvas' });
  const ctx = canvas.getContext('2d');
  const cellBar = h('div', { class: 'cell-bar' });
  const panel = h('div', { class: 'panel' });
  const saveBtn = h('button', { class: 'btn primary small', onclick: exportCollage }, icon('download', 18), 'Speichern');
  const el = h('div', { class: 'screen tool-screen' },
    header('Collage', saveBtn),
    h('div', { class: 'tool-main' },
      h('div', { class: 'stage tool-stage' }, canvas, cellBar),
      panel));

  // Vorschau mit den Vorschaubildern (400 px); volle Auflösung erst beim Speichern
  const bmpFor = (k) => {
    const id = st.cells[k] && st.cells[k].img;
    return id ? store.thumb(id) : null;
  };

  function size() {
    const [a, b] = st.format.split(':').map(Number);
    const box = el.querySelector('.tool-stage').getBoundingClientRect();
    const availW = Math.max(150, (box.width || window.innerWidth) - 24);
    const maxH = window.innerWidth > 760 && window.innerWidth > window.innerHeight ? window.innerHeight * 0.7 : window.innerHeight * 0.44;
    let cw = availW;
    let ch = (cw * b) / a;
    if (ch > maxH) {
      ch = maxH;
      cw = (ch * a) / b;
    }
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    draw();
  }

  function draw() {
    rects = renderCollage(ctx, canvas.width, canvas.height, st, bmpFor, { selected: sel });
  }

  function hit(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    for (let k = rects.length - 1; k >= 0; k--) {
      const q = rects[k];
      if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return k;
    }
    return -1;
  }

  // Antippen = auswählen; im ausgewählten Feld ziehen = Bild verschieben
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const k = hit(e);
    canvas.setPointerCapture(e.pointerId);
    drag = { k, x: e.clientX, y: e.clientY, moved: false, fx: k >= 0 ? st.cells[k].fx : 0, fy: k >= 0 ? st.cells[k].fy : 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.k < 0 || drag.k !== sel) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const c = st.cells[sel];
    const bmp = bmpFor(sel);
    const q = rects[sel];
    if (!bmp || !q) return;
    const r = canvas.getBoundingClientRect();
    const scale = canvas.width / r.width;
    const s = coverSource(bmp.width, bmp.height, q.w, q.h, { zoom: c.zoom });
    const k = s.sw / q.w;
    c.fx = clamp(drag.fx - (dx * scale * k) / bmp.width, 0, 1);
    c.fy = clamp(drag.fy - (dy * scale * k) / bmp.height, 0, 1);
    // Wert auf den wirksamen Bereich begrenzen, damit sich das Ziehen nicht „festhakt“
    const hx = s.sw / 2 / bmp.width;
    const hy = s.sh / 2 / bmp.height;
    c.fx = clamp(c.fx, Math.min(0.5, hx), Math.max(0.5, 1 - hx));
    c.fy = clamp(c.fy, Math.min(0.5, hy), Math.max(0.5, 1 - hy));
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) return;
    if (swapFrom >= 0 && d.k >= 0 && d.k !== swapFrom) {
      const a = st.cells[swapFrom];
      const b = st.cells[d.k];
      st.cells[swapFrom] = { ...b, fx: 0.5, fy: 0.5, zoom: 1 };
      st.cells[d.k] = { ...a, fx: 0.5, fy: 0.5, zoom: 1 };
      swapFrom = -1;
      sel = d.k;
    } else {
      swapFrom = -1;
      sel = d.k === sel ? -1 : d.k;
    }
    renderCellBar();
    draw();
  });

  function renderCellBar() {
    cellBar.textContent = '';
    if (swapFrom >= 0) {
      cellBar.append(h('div', { class: 'cell-hint' }, 'Tippe auf das Feld, mit dem getauscht werden soll'));
      return;
    }
    if (sel < 0) {
      cellBar.append(h('div', { class: 'cell-hint' }, 'Feld antippen, um das Bild darin zu verschieben, zu zoomen oder zu tauschen'));
      return;
    }
    const c = st.cells[sel];
    cellBar.append(
      h('button', { class: 'btn small', onclick: () => {
        swapFrom = sel;
        renderCellBar();
      } }, icon('swap', 16), 'Tauschen'),
      h('button', { class: 'btn small', onclick: replace }, icon('image', 16), 'Ersetzen'),
      slider('Zoom', { min: 100, max: 300, value: Math.round(c.zoom * 100), fmt: (v) => v + ' %', onInput: (v) => {
        c.zoom = v / 100;
        draw();
      } }));
  }

  async function replace() {
    const k = sel;
    const items = await importImages({ multiple: false });
    if (!items.length) return;
    const { id } = await store.add(items[0]);
    st.cells[k] = { img: id, fx: 0.5, fy: 0.5, zoom: 1 };
    draw();
  }

  function renderPanel() {
    panel.textContent = '';
    const layRow = h('div', { class: 'layout-row' });
    st.layouts.forEach((lay, i) => {
      const c = h('canvas', { width: 72, height: 72 });
      const g = c.getContext('2d');
      g.fillStyle = '#3a3a48';
      g.fillRect(0, 0, 72, 72);
      lay.cells.forEach((cell, k) => {
        const r = lay.over === k ? (() => {
          const o = overRect(cell, 72, 72, 3);
          return { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 6 };
        })() : cellRect(cell, 72, 72, 3);
        if (lay.over === k) {
          g.fillStyle = '#3a3a48';
          g.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
        }
        g.fillStyle = k % 2 ? '#ffb09a' : '#ff7a59';
        g.fillRect(r.x, r.y, r.w, r.h);
      });
      layRow.append(h('button', { class: 'layout' + (i === st.layout ? ' on' : ''), onclick: () => {
        st.layout = i;
        sel = -1;
        renderPanel();
        renderCellBar();
        draw();
      } }, c));
    });
    panel.append(section('Aufteilung', layRow));
    panel.append(section('Format',
      chips(Object.entries(FORMATS).map(([id, f]) => ({ id, name: `${id} ${f.name}` })), st.format, (v) => {
        st.format = v;
        size();
      })));
    panel.append(section(null,
      slider('Abstand', { min: 0, max: 100, value: st.gap, fmt: (v) => v + ' %', onInput: (v) => {
        st.gap = v;
        draw();
      } }),
      slider('Runde Ecken', { min: 0, max: 100, value: st.radius, fmt: (v) => v + ' %', onInput: (v) => {
        st.radius = v;
        draw();
      } })));
    panel.append(section('Hintergrund', chips(BGS, st.bg, (v) => {
      st.bg = v;
      draw();
    })));
    panel.append(section('Farb-Look', chips(LOOKS.map((l) => ({ id: l.id, name: l.name })), st.look, (v) => {
      st.look = v;
      draw();
    })));
  }

  async function exportCollage() {
    const ov = progressOverlay('Collage wird gespeichert');
    try {
      ov.set(0.1);
      const { w, h: hh } = exportSize(st.format);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = hh;
      // Feldgrößen bestimmen, dann jedes Foto nur so groß wie nötig behalten (spart Speicher)
      const cellRects = renderCollage(c.getContext('2d'), w, hh, st, () => null);
      const scaled = [];
      for (let k = 0; k < st.cells.length; k++) {
        const bmp = (await store.getFull(st.cells[k].img)).bmp;
        const r = cellRects[k];
        const sc = Math.min(1, Math.max(r.w / bmp.width, r.h / bmp.height) * st.cells[k].zoom);
        const sc2 = document.createElement('canvas');
        sc2.width = Math.max(1, Math.round(bmp.width * sc));
        sc2.height = Math.max(1, Math.round(bmp.height * sc));
        const g2 = sc2.getContext('2d');
        g2.imageSmoothingQuality = 'high';
        g2.drawImage(bmp, 0, 0, sc2.width, sc2.height);
        scaled.push(sc2);
        ov.set(0.1 + (0.6 * (k + 1)) / st.cells.length);
      }
      renderCollage(c.getContext('2d'), w, hh, st, (k) => scaled[k]);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      ov.set(0.85);
      const out = await Output.fromBlob(blob, `Collage_${stamp()}.jpg`, 'image/jpeg');
      const where = await out.save();
      ov.done();
      resultSheet(out, where, 'Collage gespeichert');
    } catch (e) {
      ov.done();
      toast('Speichern fehlgeschlagen: ' + (e.message || e));
    }
  }

  const onResize = () => size();
  window.addEventListener('resize', onResize);
  push({
    el,
    destroy: () => {
      window.removeEventListener('resize', onResize);
      store.dispose();
    },
  });
  renderPanel();
  renderCellBar();
  requestAnimationFrame(size);
}

/** Ergebnis-Ansicht für Bilder/GIFs: Vorschau, Speicherort, Teilen. */
export function resultSheet(out, where, title) {
  sheet(title, h('div', { class: 'result' },
    h('img', { src: out.url, class: 'result-img', alt: '' }),
    where ? h('p', { class: 'ok' }, icon('check', 18), ` Gespeichert in der Galerie: ${where}`) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => out.share() }, icon('share', 18), 'Teilen'),
      h('button', { class: 'btn', onclick: () => out.open() }, icon('open', 18), 'Öffnen'))));
}

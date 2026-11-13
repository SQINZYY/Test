// Foto-Editor: Filter, Anpassungen, Zuschnitt/Drehen, Rahmen und Text.
// Die Einstellungen gelten für alle ausgewählten Bilder („Alle speichern“).
import { h, icon, toast, chips, slider, section, clamp, stamp, progressOverlay, debounce } from './util.js';
import { push, header } from './nav.js';
import { LOOKS, FONTS, filterString, applyTint, drawText, coverSource } from './draw.js';
import { Output } from './native.js';
import { resultSheet } from './collage.js';

const ASPECTS = [
  { id: 'orig', name: 'Original' },
  { id: '1:1', name: '1:1' },
  { id: '4:5', name: '4:5' },
  { id: '3:4', name: '3:4' },
  { id: '16:9', name: '16:9' },
  { id: '9:16', name: '9:16' },
];
const FRAMES = [
  { id: 'none', name: 'Kein Rahmen' },
  { id: 'white', name: 'Weiß' },
  { id: 'black', name: 'Schwarz' },
  { id: 'polaroid', name: 'Sofortbild' },
];
const TEXT_COLORS = ['#ffffff', '#111111', '#ffd166', '#ff7a59', '#9be7ff'];

/** Bild drehen/spiegeln (zwischengespeichert). */
function oriented(bmp, rot, flip) {
  if (!rot && !flip) return bmp;
  const swap = rot % 180 !== 0;
  const c = document.createElement('canvas');
  c.width = swap ? bmp.height : bmp.width;
  c.height = swap ? bmp.width : bmp.height;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 180);
  if (flip) g.scale(-1, 1);
  g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return c;
}

/** Ausschnitt (in Pixeln des gedrehten Bildes) für Seitenverhältnis, Zoom und Position. */
function cropRect(iw, ih, st, pos) {
  let cw = iw;
  let ch = ih;
  if (st.aspect !== 'orig') {
    const [a, b] = st.aspect.split(':').map(Number);
    if (iw / ih > a / b) {
      ch = ih;
      cw = (ih * a) / b;
    } else {
      cw = iw;
      ch = (iw * b) / a;
    }
  }
  cw /= st.zoom;
  ch /= st.zoom;
  const s = coverSource(iw, ih, cw, ch, { fx: pos.fx, fy: pos.fy });
  return { x: s.sx, y: s.sy, w: s.sw, h: s.sh };
}

/** Zeichnet das bearbeitete Foto auf eine neue Leinwand (lange Seite ≤ maxSide). */
export function renderPhoto(src, st, pos, maxSide) {
  const crop = cropRect(src.width, src.height, st, pos);
  const s = Math.min(1, maxSide / Math.max(crop.w, crop.h));
  const iw = Math.round(crop.w * s);
  const ih = Math.round(crop.h * s);
  const unit = Math.min(iw, ih);
  let pl = 0;
  let pt = 0;
  let pr = 0;
  let pb = 0;
  if (st.frame === 'white' || st.frame === 'black') pl = pt = pr = pb = Math.round(unit * 0.045);
  if (st.frame === 'polaroid') {
    pl = pt = pr = Math.round(unit * 0.055);
    pb = Math.round(unit * 0.24);
  }
  const c = document.createElement('canvas');
  c.width = iw + pl + pr;
  c.height = ih + pt + pb;
  const g = c.getContext('2d');
  g.fillStyle = st.frame === 'black' ? '#111' : st.frame === 'polaroid' ? '#fbfaf6' : '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.filter = filterString(st.look, st.adj);
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, pl, pt, iw, ih);
  g.filter = 'none';
  applyTint(g, pl, pt, iw, ih, st.look, st.adj.warmth);
  if (st.adj.vignette > 0) {
    g.save();
    g.beginPath();
    g.rect(pl, pt, iw, ih);
    g.clip();
    const r = Math.hypot(iw, ih) / 2;
    const grd = g.createRadialGradient(pl + iw / 2, pt + ih / 2, r * 0.4, pl + iw / 2, pt + ih / 2, r);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${(st.adj.vignette / 100) * 0.85})`);
    g.fillStyle = grd;
    g.fillRect(pl, pt, iw, ih);
    g.restore();
  }
  if (st.text) {
    if (st.frame === 'polaroid') {
      drawText(g, st.text, { x: c.width / 2, y: pt + ih + pb / 2, maxW: iw * 0.9, size: unit * 0.075, font: st.font, color: '#2a2a2a', style: 'none' });
    } else {
      const y = st.textPos === 'top' ? pt + unit * 0.1 : st.textPos === 'center' ? pt + ih / 2 : pt + ih - unit * 0.06;
      drawText(g, st.text, { x: pl + iw / 2, y, maxW: iw * 0.88, size: unit * st.textSize / 100 * 0.12, font: st.font, color: st.textColor, style: 'shadow', anchor: st.textPos === 'bottom' ? 'bottom' : 'center' });
    }
  }
  return c;
}

export function openPhotoEditor(store, ids) {
  const st = {
    look: 'none',
    adj: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 },
    aspect: 'orig',
    zoom: 1,
    rot: 0,
    flip: false,
    frame: 'none',
    text: '',
    font: 'script',
    textColor: '#ffffff',
    textPos: 'bottom',
    textSize: 50,
  };
  const pos = ids.map(() => ({ fx: 0.5, fy: 0.5 }));
  let cur = 0;
  let tab = 'filter';
  let orientCache = { key: '', canvas: null };

  const canvas = h('canvas', { class: 'preview tool-canvas photo-canvas' });
  const strip = h('div', { class: 'strip small' });
  const panel = h('div', { class: 'panel' });
  const tabsEl = h('nav', { class: 'tabs' });
  const TABS = [['filter', 'palette', 'Filter'], ['adjust', 'sliders', 'Anpassen'], ['crop', 'crop', 'Zuschnitt'], ['frame', 'frame', 'Rahmen'], ['text', 'text', 'Text']];
  for (const [id, ic, label] of TABS) tabsEl.append(h('button', { class: 'tab', 'data-tab': id, onclick: () => setTab(id) }, icon(ic, 22), h('span', null, label)));
  const saveBtn = h('button', { class: 'btn primary small', onclick: () => save(false) }, icon('download', 18), 'Speichern');
  const stage = h('div', { class: 'stage tool-stage' }, canvas);
  const el = h('div', { class: 'screen tool-screen' },
    header('Foto bearbeiten', saveBtn),
    h('div', { class: 'tool-main' }, h('div', { class: 'editor-left' }, stage, ids.length > 1 ? strip : null), panel),
    tabsEl);

  const off = store.onLoaded(() => draw());

  function source() {
    const id = ids[cur].id;
    const f = store.peekFull(id);
    const bmp = f ? f.bmp : store.thumb(id);
    if (!bmp) return null;
    const key = `${id}|${f ? 'f' : 't'}|${st.rot}|${st.flip}`;
    if (orientCache.key !== key) orientCache = { key, canvas: oriented(bmp, st.rot, st.flip) };
    return orientCache.canvas;
  }

  const draw = () => {
    const src = source();
    if (!src) return;
    const box = stage.getBoundingClientRect();
    const availW = Math.max(150, (box.width || window.innerWidth) - 24);
    const maxH = window.innerWidth > 760 && window.innerWidth > window.innerHeight ? window.innerHeight * 0.7 : window.innerHeight * 0.42;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const out = renderPhoto(src, st, pos[cur], Math.round(Math.max(availW, maxH) * dpr));
    let cw = availW;
    let ch = (cw * out.height) / out.width;
    if (ch > maxH) {
      ch = maxH;
      cw = (ch * out.width) / out.height;
    }
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d').drawImage(out, 0, 0);
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
  };
  const drawSoon = debounce(draw, 16);

  // Ziehen im Bild verschiebt den Ausschnitt (bei Zuschnitt oder Zoom)
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, fx: pos[cur].fx, fy: pos[cur].fy };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const src = source();
    if (!src) return;
    const crop = cropRect(src.width, src.height, st, pos[cur]);
    const r = canvas.getBoundingClientRect();
    const k = crop.w / r.width;
    pos[cur].fx = clamp(drag.fx - ((e.clientX - drag.x) * k) / src.width, 0, 1);
    pos[cur].fy = clamp(drag.fy - ((e.clientY - drag.y) * k) / src.height, 0, 1);
    drawSoon();
  });
  canvas.addEventListener('pointerup', () => (drag = null));

  function renderStrip() {
    strip.textContent = '';
    ids.forEach((x, i) => {
      strip.append(h('div', { class: 'thumb' + (i === cur ? ' sel' : ''), onclick: () => {
        cur = i;
        renderStrip();
        store.getFull(ids[cur].id).catch(() => {});
        draw();
      } }, h('img', { src: store.thumbUrl(x.id), alt: '' })));
    });
  }

  function setTab(id) {
    tab = id;
    for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === id);
    renderPanel();
  }

  function renderPanel() {
    panel.textContent = '';
    if (tab === 'filter') {
      const row = h('div', { class: 'look-strip wrap' });
      const bmp = store.thumb(ids[cur].id);
      for (const l of LOOKS) {
        const c = h('canvas', { width: 120, height: 120 });
        if (bmp) {
          const g = c.getContext('2d');
          const sc = Math.max(120 / bmp.width, 120 / bmp.height);
          g.filter = l.filter || 'none';
          g.drawImage(bmp, (120 - bmp.width * sc) / 2, (120 - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
          g.filter = 'none';
          applyTint(g, 0, 0, 120, 120, l.id);
        }
        const b = h('button', { class: 'look' + (l.id === st.look ? ' on' : ''), onclick: () => {
          st.look = l.id;
          for (const x of row.children) x.classList.remove('on');
          b.classList.add('on');
          draw();
        } }, c, h('span', null, l.name));
        row.append(b);
      }
      panel.append(section('Filter', row));
    } else if (tab === 'adjust') {
      const A = [['brightness', 'Helligkeit'], ['contrast', 'Kontrast'], ['saturation', 'Sättigung'], ['warmth', 'Wärme']];
      const sliders = A.map(([k, label]) => slider(label, { min: -60, max: 60, value: st.adj[k], fmt: (v) => (v > 0 ? '+' : '') + v, onInput: (v) => {
        st.adj[k] = v;
        drawSoon();
      } }));
      sliders.push(slider('Vignette', { min: 0, max: 100, value: st.adj.vignette, fmt: (v) => v + ' %', onInput: (v) => {
        st.adj.vignette = v;
        drawSoon();
      } }));
      panel.append(section('Anpassen', ...sliders,
        h('button', { class: 'link small', onclick: () => {
          st.adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };
          renderPanel();
          draw();
        } }, 'Zurücksetzen')));
    } else if (tab === 'crop') {
      panel.append(section('Seitenverhältnis', chips(ASPECTS, st.aspect, (v) => {
        st.aspect = v;
        draw();
      })));
      panel.append(section(null,
        slider('Zoom', { min: 100, max: 300, value: Math.round(st.zoom * 100), fmt: (v) => v + ' %', onInput: (v) => {
          st.zoom = v / 100;
          drawSoon();
        } }),
        h('p', { class: 'hint' }, 'Im Bild ziehen, um den Ausschnitt zu verschieben.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => {
            st.rot = (st.rot + 90) % 360;
            draw();
          } }, icon('rotate', 18), 'Drehen'),
          h('button', { class: 'btn', onclick: () => {
            st.flip = !st.flip;
            draw();
          } }, icon('flip', 18), 'Spiegeln'))));
    } else if (tab === 'frame') {
      panel.append(section('Rahmen', chips(FRAMES, st.frame, (v) => {
        st.frame = v;
        draw();
        if (v === 'polaroid' && !st.text) toast('Tipp: Unter „Text“ eine Beschriftung für den Rand eingeben');
      })));
    } else if (tab === 'text') {
      const inp = h('input', { class: 'input', type: 'text', value: st.text, placeholder: 'Text auf dem Bild', maxlength: 80 });
      inp.addEventListener('input', () => {
        st.text = inp.value;
        drawSoon();
      });
      const fontRow = h('div', { class: 'chips' });
      for (const f of FONTS) {
        const b = h('button', { class: 'chip font' + (st.font === f.id ? ' on' : ''), style: { fontFamily: f.family, fontWeight: f.weight }, onclick: () => {
          st.font = f.id;
          for (const x of fontRow.children) x.classList.remove('on');
          b.classList.add('on');
          draw();
        } }, f.upper ? f.name.toUpperCase() : f.name);
        fontRow.append(b);
      }
      const colors = h('div', { class: 'swatches' });
      for (const c of TEXT_COLORS) {
        const b = h('button', { class: 'swatch' + (st.textColor === c ? ' on' : ''), style: { background: c }, onclick: () => {
          st.textColor = c;
          for (const x of colors.children) x.classList.remove('on');
          b.classList.add('on');
          draw();
        } });
        colors.append(b);
      }
      panel.append(section('Text', inp), section('Schrift', fontRow),
        section('Position', chips([{ id: 'top', name: 'Oben' }, { id: 'center', name: 'Mitte' }, { id: 'bottom', name: 'Unten' }], st.textPos, (v) => {
          st.textPos = v;
          draw();
        })),
        section(null, slider('Größe', { min: 20, max: 100, value: st.textSize, fmt: (v) => v + ' %', onInput: (v) => {
          st.textSize = v;
          drawSoon();
        } })),
        section('Farbe', colors),
        st.frame === 'polaroid' ? h('p', { class: 'hint' }, 'Beim Sofortbild-Rahmen steht der Text unten auf dem Rand.') : null);
    }
    if (ids.length > 1) {
      panel.append(h('div', { class: 'section' },
        h('button', { class: 'btn wide', onclick: () => save(true) }, icon('images', 18), `Alle ${ids.length} Bilder so speichern`),
        h('p', { class: 'hint' }, 'Filter, Anpassungen, Zuschnitt, Rahmen und Text gelten für alle Bilder.')));
    }
  }

  async function save(all) {
    const list = all ? ids.map((_, i) => i) : [cur];
    const ov = progressOverlay(all ? 'Bilder werden gespeichert' : 'Bild wird gespeichert');
    let last = null;
    let where = null;
    try {
      for (let n = 0; n < list.length; n++) {
        const i = list[n];
        const f = await store.getFull(ids[i].id);
        const src = oriented(f.bmp, st.rot, st.flip);
        const c = renderPhoto(src, st, pos[i], 2400);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93));
        last = await Output.fromBlob(blob, `Foto_${stamp()}_${i + 1}.jpg`, 'image/jpeg');
        where = await last.save();
        ov.set((n + 1) / list.length, `${n + 1} von ${list.length}`);
      }
      ov.done();
      if (all) toast(`${list.length} Bilder gespeichert: ${where}`, 3500);
      else resultSheet(last, where, 'Foto gespeichert');
    } catch (e) {
      ov.done();
      toast('Speichern fehlgeschlagen: ' + (e.message || e));
    }
  }

  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  push({
    el,
    destroy: () => {
      off();
      window.removeEventListener('resize', onResize);
      store.dispose();
    },
  });
  renderStrip();
  setTab('filter');
  requestAnimationFrame(draw);
  store.getFull(ids[0].id).catch(() => {});
}

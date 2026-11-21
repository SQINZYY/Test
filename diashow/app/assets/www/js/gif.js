// GIF: animiertes Bild aus mehreren Fotos (mit Überblenden, Hin-und-zurück, Farb-Look).
import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.esm.js';
import { h, icon, toast, chips, slider, section, stamp, progressOverlay, toggle, fmtSec, fmtSize, sleep } from './util.js';
import { push, header } from './nav.js';
import { LOOKS, lookById, applyTint, coverSource } from './draw.js';
import { Output } from './native.js';
import { resultSheet } from './collage.js';

const FADE_STEPS = 4;
const FADE_MS = 70;

/** Bildfolge: [{ a, b, mix, ms }] – a/b = Bildindex, mix = Anteil von b. */
export function gifFrames(n, st) {
  const order = [...Array(n).keys()];
  if (st.boomerang && n > 2) order.push(...[...Array(n - 2).keys()].map((k) => n - 2 - k));
  const frames = [];
  const hold = Math.round(st.delay * 1000);
  for (let k = 0; k < order.length; k++) {
    const a = order[k];
    const b = order[(k + 1) % order.length];
    frames.push({ a, b: a, mix: 0, ms: st.fade ? Math.max(60, hold - FADE_STEPS * FADE_MS) : hold });
    if (st.fade) for (let s = 1; s <= FADE_STEPS; s++) frames.push({ a, b, mix: s / (FADE_STEPS + 1), ms: FADE_MS });
  }
  return frames;
}

function gifSize(format, side) {
  const [a, b] = format.split(':').map(Number);
  return a >= b ? { w: side, h: Math.round((side * b) / a / 2) * 2 } : { w: Math.round((side * a) / b / 2) * 2, h: side };
}

function drawFrame(ctx, W, H, st, fr, bmps) {
  const draw = (bmp, alpha) => {
    if (!bmp) return;
    const s = coverSource(bmp.width, bmp.height, W, H, {});
    ctx.globalAlpha = alpha;
    ctx.filter = lookById(st.look).filter || 'none';
    ctx.drawImage(bmp, s.sx, s.sy, s.sw, s.sh, 0, 0, W, H);
    ctx.filter = 'none';
  };
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  draw(bmps(fr.a), 1);
  if (fr.mix > 0) draw(bmps(fr.b), fr.mix);
  ctx.globalAlpha = 1;
  applyTint(ctx, 0, 0, W, H, st.look);
  ctx.restore();
}

export function openGif(store, ids) {
  const st = { format: '1:1', side: 480, delay: 0.8, fade: true, boomerang: false, look: 'none' };
  const canvas = h('canvas', { class: 'preview tool-canvas' });
  const ctx = canvas.getContext('2d');
  const info = h('p', { class: 'hint' });
  const panel = h('div', { class: 'panel' });
  const saveBtn = h('button', { class: 'btn primary small', onclick: exportGif }, icon('download', 18), 'GIF erstellen');
  const el = h('div', { class: 'screen tool-screen' },
    header('GIF erstellen', saveBtn),
    h('div', { class: 'tool-main' }, h('div', { class: 'stage tool-stage' }, canvas), panel));

  let frames = gifFrames(ids.length, st);
  let fi = 0;
  let timer = 0;
  let alive = true;
  // Vorschau mit den Vorschaubildern (400 px) – spart Speicher bei vielen Fotos
  const bmpFor = (i) => store.thumb(ids[i].id);

  function size() {
    const [a, b] = st.format.split(':').map(Number);
    const box = el.querySelector('.tool-stage').getBoundingClientRect();
    const availW = Math.max(150, (box.width || window.innerWidth) - 24);
    const maxH = window.innerWidth > 760 && window.innerWidth > window.innerHeight ? window.innerHeight * 0.7 : window.innerHeight * 0.42;
    let cw = availW;
    let ch = (cw * b) / a;
    if (ch > maxH) {
      ch = maxH;
      cw = (ch * a) / b;
    }
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
    const s = gifSize(st.format, st.side);
    canvas.width = s.w;
    canvas.height = s.h;
  }

  function tick() {
    if (!alive) return;
    frames = gifFrames(ids.length, st);
    if (fi >= frames.length) fi = 0;
    const fr = frames[fi];
    drawFrame(ctx, canvas.width, canvas.height, st, fr, bmpFor);
    fi = (fi + 1) % frames.length;
    timer = setTimeout(tick, fr.ms);
  }

  function updateInfo() {
    frames = gifFrames(ids.length, st);
    const total = frames.reduce((s, f) => s + f.ms, 0) / 1000;
    const s = gifSize(st.format, st.side);
    // grobe Schätzung: ca. 0,45 Byte pro Pixel und Bild
    const est = frames.length * s.w * s.h * 0.45;
    info.textContent = `${ids.length} Fotos · ${frames.length} Einzelbilder · ${fmtSec(total)} pro Durchlauf · ${s.w} × ${s.h} · ca. ${fmtSize(est)}`;
  }

  function renderPanel() {
    panel.textContent = '';
    panel.append(section(null,
      slider('Zeit pro Foto', { min: 0.2, max: 3, step: 0.1, value: st.delay, fmt: fmtSec, onInput: (v) => {
        st.delay = v;
        updateInfo();
      } }),
      toggle('Überblenden', st.fade, (v) => {
        st.fade = v;
        updateInfo();
      }, 'Weicher Übergang zwischen den Fotos'),
      toggle('Hin und zurück', st.boomerang, (v) => {
        st.boomerang = v;
        updateInfo();
      }, 'Läuft vorwärts und wieder rückwärts')));
    panel.append(section('Format', chips([{ id: '1:1', name: '1:1' }, { id: '4:5', name: '4:5' }, { id: '16:9', name: '16:9' }, { id: '9:16', name: '9:16' }], st.format, (v) => {
      st.format = v;
      size();
      updateInfo();
    })));
    panel.append(section('Größe', chips([{ id: 320, name: 'Klein (320)' }, { id: 480, name: 'Mittel (480)' }, { id: 640, name: 'Groß (640)' }], st.side, (v) => {
      st.side = v;
      size();
      updateInfo();
    })));
    panel.append(section('Farb-Look', chips(LOOKS.map((l) => ({ id: l.id, name: l.name })), st.look, (v) => {
      st.look = v;
    })));
    panel.append(info);
    updateInfo();
  }

  async function exportGif() {
    const ov = progressOverlay('GIF wird erstellt');
    try {
      const { w, h: hh } = gifSize(st.format, st.side);
      // Jedes Foto einmal laden und gleich auf GIF-Größe verkleinern (spart Speicher und Zeit)
      const small = [];
      for (let i = 0; i < ids.length; i++) {
        const b = (await store.getFull(ids[i].id)).bmp;
        const sc = document.createElement('canvas');
        sc.width = w;
        sc.height = hh;
        const s = coverSource(b.width, b.height, w, hh, {});
        const sg = sc.getContext('2d');
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(b, s.sx, s.sy, s.sw, s.sh, 0, 0, w, hh);
        small.push(sc);
        ov.set((0.15 * (i + 1)) / ids.length, 'Fotos werden geladen …');
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = hh;
      const g = c.getContext('2d', { willReadFrequently: true });
      const fr = gifFrames(ids.length, st);
      const gif = GIFEncoder();
      for (let k = 0; k < fr.length; k++) {
        drawFrame(g, w, hh, st, fr[k], (i) => small[i]);
        const { data } = g.getImageData(0, 0, w, hh);
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, w, hh, { palette, delay: fr[k].ms, repeat: 0 });
        ov.set(0.15 + (0.8 * (k + 1)) / fr.length, `Bild ${k + 1} von ${fr.length}`);
        if (k % 2 === 0) await sleep(0);
      }
      gif.finish();
      const blob = new Blob([gif.bytes()], { type: 'image/gif' });
      const out = await Output.fromBlob(blob, `Animation_${stamp()}.gif`, 'image/gif');
      const where = await out.save();
      ov.done();
      resultSheet(out, where, `GIF gespeichert (${fmtSize(blob.size)})`);
    } catch (e) {
      ov.done();
      toast('GIF fehlgeschlagen: ' + (e.message || e));
    }
  }

  push({
    el,
    destroy: () => {
      alive = false;
      clearTimeout(timer);
      store.dispose();
    },
  });
  renderPanel();
  requestAnimationFrame(() => {
    size();
    tick();
  });
}

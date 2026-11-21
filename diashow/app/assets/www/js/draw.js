// Gemeinsame Zeichen-Bausteine: Looks (Filter), Vignette, Filmkorn, Schriften, Text, Bildausschnitte.
import { clamp } from './util.js';

/** Looks = Farbstimmungen. filter: Canvas-Filter (wie CSS), tint: Farbschicht mit Mischmodus. */
export const LOOKS = [
  { id: 'none', name: 'Original', filter: '' },
  { id: 'vivid', name: 'Lebendig', filter: 'saturate(1.35) contrast(1.08)' },
  { id: 'warm', name: 'Warm', filter: 'saturate(1.12) contrast(1.04) brightness(1.03)', tint: ['#ff8a2a', 0.22, 'soft-light'] },
  { id: 'cool', name: 'Kühl', filter: 'saturate(0.95) contrast(1.06)', tint: ['#2a8bff', 0.22, 'soft-light'] },
  { id: 'dream', name: 'Träumerisch', filter: 'brightness(1.07) saturate(1.15) contrast(0.92)', tint: ['#ff9ad5', 0.2, 'soft-light'] },
  { id: 'cinema', name: 'Kino', filter: 'contrast(1.14) saturate(1.12)', tint: ['#007c8c', 0.3, 'soft-light'] },
  { id: 'fade', name: 'Verblasst', filter: 'contrast(0.82) saturate(0.78) brightness(1.1)', tint: ['#ffe9d6', 0.12, 'source-over'] },
  { id: 'sepia', name: 'Nostalgie', filter: 'sepia(0.6) contrast(0.95) brightness(1.04) saturate(0.95)' },
  { id: 'drama', name: 'Drama', filter: 'contrast(1.35) saturate(0.85) brightness(0.95)' },
  { id: 'bw', name: 'Schwarz-Weiß', filter: 'grayscale(1) contrast(1.15)' },
  { id: 'noir', name: 'Noir', filter: 'grayscale(1) contrast(1.55) brightness(0.9)' },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

/** Filter-Zeichenkette aus Look + Anpassungen (Foto-Editor). */
export function filterString(lookId, adj) {
  let f = lookById(lookId).filter;
  if (adj) {
    if (adj.brightness) f += ` brightness(${(1 + adj.brightness / 100).toFixed(3)})`;
    if (adj.contrast) f += ` contrast(${(1 + adj.contrast / 100).toFixed(3)})`;
    if (adj.saturation) f += ` saturate(${(1 + adj.saturation / 100).toFixed(3)})`;
    if (adj.blur) f += ` blur(${adj.blur}px)`;
  }
  return f.trim() || 'none';
}

/** Farbschicht des Looks (und Wärme aus dem Editor) über den Bereich legen. */
export function applyTint(ctx, x, y, w, h, lookId, warmth = 0) {
  const look = lookById(lookId);
  ctx.save();
  if (look.tint) {
    const [color, alpha, mode] = look.tint;
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  if (warmth) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(0.5, Math.abs(warmth) / 100 * 0.5);
    ctx.fillStyle = warmth > 0 ? '#ff8a1e' : '#1e7bff';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

const vignetteCache = new Map();
export function vignette(ctx, W, H, amount) {
  if (amount <= 0) return;
  const key = `${W}x${H}`;
  let g = vignetteCache.get(key);
  if (!g) {
    const r = Math.hypot(W, H) / 2;
    g = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    vignetteCache.clear();
    vignetteCache.set(key, g);
  }
  ctx.save();
  ctx.globalAlpha = clamp(amount, 0, 1) * 0.85;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

let grainCanvas = null;
export function grain(ctx, W, H, amount, seed) {
  if (amount <= 0) return;
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = grainCanvas.height = 256;
    const g = grainCanvas.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const s = Math.max(1, Math.round(Math.min(W, H) / 540));
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = clamp(amount, 0, 1) * 0.35;
  const pat = ctx.createPattern(grainCanvas, 'repeat');
  const ox = (seed * 7919) % 256;
  const oy = (seed * 104729) % 256;
  ctx.translate(-ox * s, -oy * s);
  ctx.scale(s, s);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W / s + 256, H / s + 256);
  ctx.restore();
}

// ---------- Schriften ----------

export const FONTS = [
  { id: 'serif', name: 'Elegant', family: '"Playfair Display", Georgia, serif', weight: 700, scale: 1 },
  { id: 'sans', name: 'Modern', family: '"Montserrat", Roboto, sans-serif', weight: 800, scale: 0.92 },
  { id: 'script', name: 'Handschrift', family: '"Dancing Script", cursive', weight: 700, scale: 1.18 },
  { id: 'display', name: 'Plakativ', family: '"Bebas Neue", Impact, sans-serif', weight: 400, scale: 1.3, upper: true, spacing: 0.04 },
  { id: 'system', name: 'Schlicht', family: 'Roboto, system-ui, sans-serif', weight: 500, scale: 0.95 },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

export function loadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all(FONTS.map((f) => document.fonts.load(`${f.weight} 40px ${f.family}`).catch(() => {}))).then(() => {});
}

export function setFont(ctx, fontId, size) {
  const f = fontById(fontId);
  ctx.font = `${f.weight} ${Math.round(size * f.scale)}px ${f.family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = f.spacing ? `${(size * f.spacing).toFixed(1)}px` : '0px';
  return f;
}

export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out.slice(0, 6);
}

/**
 * Text zeichnen. style: 'shadow' (Schatten), 'box' (dunkler Kasten), 'outline' (Kontur).
 * anchor: 'center' (y = Mitte des Blocks) oder 'bottom' (y = Unterkante).
 */
export function drawText(ctx, text, { x, y, maxW, size, font, color = '#fff', style = 'shadow', anchor = 'center', alpha = 1, lineH = 1.2 }) {
  if (!text || alpha <= 0) return 0;
  ctx.save();
  const f = setFont(ctx, font, size);
  const t = f.upper ? String(text).toUpperCase() : String(text);
  const lines = wrapText(ctx, t, maxW);
  const lh = size * f.scale * lineH;
  const total = lh * lines.length;
  let top = anchor === 'bottom' ? y - total : anchor === 'top' ? y : y - total / 2;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style === 'box') {
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = size * 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, x - w / 2 - pad, top - pad * 0.6, w + pad * 2, total + pad * 1.2, size * 0.3);
    ctx.fill();
  } else if (style === 'shadow') {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.35;
    ctx.shadowOffsetY = size * 0.04;
  }
  for (let i = 0; i < lines.length; i++) {
    const ly = top + lh * (i + 0.5);
    if (style === 'outline') {
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(lines[i], x, ly);
    }
    ctx.fillStyle = color;
    ctx.fillText(lines[i], x, ly);
  }
  ctx.restore();
  return total;
}

/** Höhe eines umbrochenen Textblocks (für die Anordnung mehrerer Texte). */
export function textHeight(ctx, text, { size, font, maxW, lineH = 1.2 }) {
  if (!text) return 0;
  ctx.save();
  const f = setFont(ctx, font, size);
  const lines = wrapText(ctx, f.upper ? String(text).toUpperCase() : String(text), maxW);
  ctx.restore();
  return size * f.scale * lineH * lines.length;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Ausschnitt eines Bildes (iw × ih), der einen Bereich w × h füllt („cover“).
 * fx/fy = Bildpunkt, der möglichst in der Mitte liegen soll (0–1), zoom ≥ 1, px/py = Verschiebung (-1–1) im Spielraum.
 */
export function coverSource(iw, ih, w, h, { fx = 0.5, fy = 0.5, zoom = 1, px = 0, py = 0 } = {}) {
  const s = Math.max(w / iw, h / ih) * zoom;
  const sw = w / s;
  const sh = h / s;
  const slackX = (iw - sw) / 2;
  const slackY = (ih - sh) / 2;
  const cx = clamp(iw * fx + px * slackX, sw / 2, iw - sw / 2);
  const cy = clamp(ih * fy + py * slackY, sh / 2, ih - sh / 2);
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

/** Bild vollständig in einen Bereich einpassen („contain“). */
export function containRect(iw, ih, x, y, w, h, zoom = 1) {
  const s = Math.min(w / iw, h / ih) * zoom;
  const dw = iw * s;
  const dh = ih * s;
  return { dx: x + (w - dw) / 2, dy: y + (h - dh) / 2, dw, dh };
}

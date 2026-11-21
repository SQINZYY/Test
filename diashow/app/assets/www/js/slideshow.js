// Diashow-Modell (Projekt, Stile, Zeitleiste) und der Renderer, der ein einzelnes Bild der
// Diashow zu einem beliebigen Zeitpunkt zeichnet. Vorschau und Video-Export nutzen denselben Code.
import { clamp, lerp, ease, rng, hash, uid } from './util.js';
import { lookById, applyTint, vignette, grain, drawText, textHeight, coverSource, containRect } from './draw.js';

export const FORMATS = {
  '16:9': { name: 'Querformat', hint: 'YouTube, Fernseher, PC', w: 1920, h: 1080, w720: 1280, h720: 720 },
  '9:16': { name: 'Hochformat', hint: 'Story, Reels, TikTok, Status', w: 1080, h: 1920, w720: 720, h720: 1280 },
  '1:1': { name: 'Quadrat', hint: 'Instagram, Facebook', w: 1080, h: 1080, w720: 720, h720: 720 },
  '4:5': { name: 'Porträt', hint: 'Instagram-Beitrag', w: 1080, h: 1344, w720: 720, h720: 896 },
};

export function outputSize(format, quality) {
  const f = FORMATS[format] || FORMATS['16:9'];
  return quality === '720' ? { w: f.w720, h: f.h720 } : { w: f.w, h: f.h };
}

export const TRANSITIONS = [
  { id: 'fade', name: 'Überblenden' },
  { id: 'black', name: 'Über Schwarz' },
  { id: 'white', name: 'Blitz' },
  { id: 'slide', name: 'Schieben' },
  { id: 'slideUp', name: 'Nach oben' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'wipe', name: 'Wischen' },
  { id: 'circle', name: 'Kreis' },
  { id: 'blinds', name: 'Jalousie' },
  { id: 'blur', name: 'Unschärfe' },
  { id: 'none', name: 'Harter Schnitt' },
  { id: 'mix', name: 'Gemischt' },
];
const MIX = ['fade', 'slide', 'zoom', 'wipe', 'circle', 'slideUp', 'blinds', 'fade', 'blur'];

export const MOTIONS = [
  { id: 'auto', name: 'Automatisch' },
  { id: 'in', name: 'Zoom rein' },
  { id: 'out', name: 'Zoom raus' },
  { id: 'left', name: 'Schwenk ←' },
  { id: 'right', name: 'Schwenk →' },
  { id: 'up', name: 'Schwenk ↑' },
  { id: 'down', name: 'Schwenk ↓' },
  { id: 'none', name: 'Keine' },
];

/** Stile = fertige Einstellungs-Pakete für einen Fingertipp. */
export const STYLES = [
  { id: 'classic', name: 'Klassisch', desc: 'Sanftes Überblenden, langsamer Zoom',
    set: { duration: 3.5, transition: 'fade', transDur: 1.0, motion: true, look: 'none', vignette: 0.2, grain: 0, letterbox: false, font: 'serif', fit: 'cover' } },
  { id: 'modern', name: 'Modern', desc: 'Abwechslungsreiche Übergänge, kräftige Farben',
    set: { duration: 2.5, transition: 'mix', transDur: 0.6, motion: true, look: 'vivid', vignette: 0.1, grain: 0, letterbox: false, font: 'sans', fit: 'cover' } },
  { id: 'romantic', name: 'Romantisch', desc: 'Langsam, weich und warm',
    set: { duration: 4.2, transition: 'fade', transDur: 1.6, motion: true, look: 'dream', vignette: 0.3, grain: 0, letterbox: false, font: 'script', fit: 'cover' } },
  { id: 'cinema', name: 'Kino', desc: 'Breitbild-Balken und Film-Farben',
    set: { duration: 4.5, transition: 'fade', transDur: 1.4, motion: true, look: 'cinema', vignette: 0.35, grain: 0.1, letterbox: true, font: 'display', fit: 'cover' } },
  { id: 'retro', name: 'Retro', desc: 'Alte Fotos mit Filmkorn',
    set: { duration: 3.5, transition: 'black', transDur: 1.0, motion: true, look: 'sepia', vignette: 0.5, grain: 0.45, letterbox: false, font: 'serif', fit: 'cover' } },
  { id: 'party', name: 'Party', desc: 'Schnelle Schnitte für Feiern',
    set: { duration: 1.4, transition: 'mix', transDur: 0.35, motion: true, look: 'vivid', vignette: 0, grain: 0, letterbox: false, font: 'display', fit: 'cover' } },
  { id: 'bw', name: 'Schwarz-Weiß', desc: 'Zeitlos und ruhig',
    set: { duration: 3.8, transition: 'fade', transDur: 1.2, motion: true, look: 'bw', vignette: 0.35, grain: 0.15, letterbox: false, font: 'serif', fit: 'cover' } },
  { id: 'minimal', name: 'Minimal', desc: 'Ganze Bilder auf Weiß, ohne Zoom',
    set: { duration: 3, transition: 'slide', transDur: 0.7, motion: false, look: 'none', vignette: 0, grain: 0, letterbox: false, font: 'sans', fit: 'contain', bg: 'white' } },
];

export function newProject(images) {
  const p = {
    id: uid(),
    kind: 'slideshow',
    title: 'Diashow vom ' + new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }),
    created: Date.now(),
    updated: Date.now(),
    style: 'classic',
    format: '16:9',
    quality: '1080',
    fit: 'cover',
    bg: 'blur',
    duration: 3.5,
    transition: 'fade',
    transDur: 1.0,
    motion: true,
    look: 'none',
    vignette: 0.2,
    grain: 0,
    letterbox: false,
    font: 'serif',
    textColor: '#ffffff',
    textStyle: 'shadow',
    intro: { text: '', sub: '' },
    ending: { text: '' },
    music: null,
    images: {},
    slides: [],
  };
  for (const im of images || []) addSlide(p, im.id, im.meta);
  if (p.slides.length > 30) p.duration = 2.5;
  return p;
}

export function addSlide(p, imgId, meta, at = p.slides.length) {
  p.images[imgId] = meta;
  const s = { id: uid(), img: imgId, dur: null, tr: null, motion: 'auto', caption: '', fx: 0.5, fy: 0.5, fit: null };
  p.slides.splice(at, 0, s);
  return s;
}

export function applyStyle(p, styleId) {
  const st = STYLES.find((s) => s.id === styleId);
  if (!st) return;
  Object.assign(p, { bg: 'blur' }, JSON.parse(JSON.stringify(st.set)));
  p.style = styleId;
}

export const slideDur = (p, s) => clamp(s.dur || p.duration, 0.5, 30);

/** Zeitleiste: Start/Ende jedes Bildes und Übergang zum nächsten. */
export function timeline(p) {
  const items = [];
  let t = 0;
  const n = p.slides.length;
  for (let i = 0; i < n; i++) {
    const s = p.slides[i];
    const d = slideDur(p, s);
    items.push({ start: t, end: t + d, dur: d, trOut: 0, trKind: 'none', trIn: 0 });
    t += d;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = p.slides[i];
    let kind = s.tr || p.transition;
    if (kind === 'mix') kind = MIX[hash(s.id) % MIX.length];
    const T = kind === 'none' ? 0 : Math.min(p.transDur, items[i].dur * 0.5, items[i + 1].dur * 0.5);
    items[i].trOut = T;
    items[i].trKind = kind;
    items[i + 1].trIn = T;
  }
  for (const it of items) {
    it.visStart = it.start - it.trIn;
    it.visEnd = it.end;
  }
  return { items, total: t };
}

export function indexAt(tl, t) {
  const items = tl.items;
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (items[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Bewegung (Ken-Burns-Effekt) eines Bildes: Zoom z0→z1 und Verschiebung x/y (-1–1). */
export function motionFor(p, s, iw, ih, W, H) {
  let type = s.motion || 'auto';
  if (type === 'auto' && !p.motion) type = 'none';
  if (type === 'auto') {
    const r = rng(hash(s.id))();
    const ar = iw / ih;
    const far = W / H;
    if (ar < far * 0.72) type = r < 0.5 ? 'down' : 'up';
    else if (ar > far * 1.4) type = r < 0.5 ? 'right' : 'left';
    else type = ['in', 'out', 'in', 'out', 'right', 'left'][Math.floor(r * 6)];
  }
  const r2 = rng(hash(s.id) + 7);
  const drift = (r2() - 0.5) * 0.6;
  const Z = 1.15;
  switch (type) {
    case 'in': return { z0: 1, z1: Z, x0: 0, x1: drift, y0: 0, y1: drift * 0.5 };
    case 'out': return { z0: Z, z1: 1, x0: drift, x1: 0, y0: drift * 0.5, y1: 0 };
    case 'left': return { z0: 1.08, z1: 1.08, x0: 0.9, x1: -0.9, y0: 0, y1: 0 };
    case 'right': return { z0: 1.08, z1: 1.08, x0: -0.9, x1: 0.9, y0: 0, y1: 0 };
    case 'up': return { z0: 1.06, z1: 1.06, x0: 0, x1: 0, y0: 0.9, y1: -0.9 };
    case 'down': return { z0: 1.06, z1: 1.06, x0: 0, x1: 0, y0: -0.9, y1: 0.9 };
    default: return { z0: 1, z1: 1, x0: 0, x1: 0, y0: 0, y1: 0 };
  }
}

const smooth = (k) => 0.65 * k + 0.35 * ease.sine(k);

/** Zeichnet Bild i zum Zeitpunkt t (inkl. Bewegung und Look). */
function drawSlide(ctx, W, H, p, tl, i, t, src) {
  const s = p.slides[i];
  const it = tl.items[i];
  const img = src(s.img);
  ctx.fillStyle = p.bg === 'white' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, W, H);
  if (!img || !img.bmp) return;
  const bmp = img.bmp;
  const iw = bmp.width;
  const ih = bmp.height;
  const m = motionFor(p, s, iw, ih, W, H);
  const k = clamp((t - it.visStart) / Math.max(0.001, it.visEnd - it.visStart), 0, 1);
  const e = smooth(k);
  const z = lerp(m.z0, m.z1, e);
  const fit = s.fit || p.fit;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const filter = lookById(p.look).filter;
  ctx.filter = filter || 'none';
  if (fit === 'contain') {
    if (p.bg === 'blur' && img.blur) {
      const b = coverSource(img.blur.width, img.blur.height, W, H, { zoom: 1 + (z - 1) * 0.5 });
      ctx.drawImage(img.blur, b.sx, b.sy, b.sw, b.sh, 0, 0, W, H);
    } else if (p.bg === 'blur') {
      // Noch kein Hintergrund geladen: dunkel abgedeckt
      ctx.filter = 'none';
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);
      ctx.filter = filter || 'none';
    }
    const zz = 1 + (z - 1) * 0.35;
    const r = containRect(iw, ih, 0, 0, W, H, zz);
    const dx = r.dx + lerp(m.x0, m.x1, e) * W * 0.012;
    const dy = r.dy + lerp(m.y0, m.y1, e) * H * 0.012;
    if (p.bg !== 'blur') {
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = Math.min(W, H) * 0.02;
    }
    ctx.drawImage(bmp, dx, dy, r.dw, r.dh);
  } else {
    const c = coverSource(iw, ih, W, H, { fx: s.fx, fy: s.fy, zoom: z, px: lerp(m.x0, m.x1, e), py: lerp(m.y0, m.y1, e) });
    ctx.drawImage(bmp, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
  }
  ctx.restore();
}

// Zwei Zwischenebenen für Übergänge (werden wiederverwendet)
const layers = [];
function layer(n, W, H) {
  let c = layers[n];
  if (!c) c = layers[n] = document.createElement('canvas');
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  return c;
}

function drawTransition(ctx, W, H, kind, prog, A, B) {
  const e = ease.inOut(clamp(prog, 0, 1));
  ctx.save();
  switch (kind) {
    case 'black':
    case 'white': {
      const flash = kind === 'white';
      const mid = flash ? 0.35 : 0.5;
      const color = flash ? '#fff' : '#000';
      if (prog < mid) {
        ctx.drawImage(A, 0, 0);
        ctx.globalAlpha = ease.inOut(prog / mid);
      } else {
        ctx.drawImage(B, 0, 0);
        ctx.globalAlpha = 1 - ease.inOut((prog - mid) / (1 - mid));
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'slide':
      ctx.drawImage(A, -W * e, 0);
      ctx.drawImage(B, W * (1 - e), 0);
      break;
    case 'slideUp':
      ctx.drawImage(A, 0, -H * e);
      ctx.drawImage(B, 0, H * (1 - e));
      break;
    case 'zoom': {
      const za = 1 + 0.35 * e;
      ctx.drawImage(A, W / 2 - (W * za) / 2, H / 2 - (H * za) / 2, W * za, H * za);
      const zb = 1.25 - 0.25 * e;
      ctx.globalAlpha = e;
      ctx.drawImage(B, W / 2 - (W * zb) / 2, H / 2 - (H * zb) / 2, W * zb, H * zb);
      break;
    }
    case 'wipe': {
      ctx.drawImage(A, 0, 0);
      const x = W * e;
      ctx.beginPath();
      ctx.rect(0, 0, x, H);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'circle': {
      ctx.drawImage(A, 0, 0);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * e, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'blinds': {
      ctx.drawImage(A, 0, 0);
      const n = 8;
      const sw = W / n;
      ctx.beginPath();
      for (let k = 0; k < n; k++) ctx.rect(k * sw, 0, sw * e + 0.5, H);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'blur': {
      const r = Math.sin(Math.PI * prog) * Math.min(W, H) * 0.02;
      ctx.filter = r > 0.3 ? `blur(${r.toFixed(1)}px)` : 'none';
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'fade':
    default:
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
}

function fadeWindow(t, a, b, f) {
  if (t < a || t > b) return 0;
  return clamp(Math.min((t - a) / f, (b - t) / f), 0, 1);
}

/**
 * Zeichnet die Diashow zum Zeitpunkt t.
 * src(imgId) → { bmp, blur } (volles Bild oder Vorschaubild).
 */
export function renderFrame(ctx, W, H, p, tl, t, src, { frameSeed = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const n = tl.items.length;
  if (!n) {
    ctx.restore();
    return;
  }
  t = clamp(t, 0, Math.max(0, tl.total - 1e-4));
  const i = indexAt(tl, t);
  const it = tl.items[i];
  const trStart = it.end - it.trOut;
  if (i < n - 1 && it.trOut > 0 && t >= trStart) {
    const A = layer(0, W, H);
    const B = layer(1, W, H);
    drawSlide(A.getContext('2d'), W, H, p, tl, i, t, src);
    drawSlide(B.getContext('2d'), W, H, p, tl, i + 1, t, src);
    drawTransition(ctx, W, H, it.trKind, (t - trStart) / it.trOut, A, B);
  } else {
    drawSlide(ctx, W, H, p, tl, i, t, src);
  }

  applyTint(ctx, 0, 0, W, H, p.look);
  // Auf weißem Hintergrund (ganze Bilder) würde die Vignette grau wirken
  if (!(p.fit === 'contain' && p.bg === 'white')) vignette(ctx, W, H, p.vignette || 0);
  grain(ctx, W, H, p.grain || 0, frameSeed);

  const unit = Math.min(W, H);
  let bar = 0;
  if (p.letterbox) {
    bar = W > H ? Math.max(0, (H - W / 2.35) / 2) : H * 0.07;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
  drawTexts(ctx, W, H, p, tl, t, i, unit, bar);

  // Weiches Ein- und Ausblenden am Anfang und Ende
  const fadeIn = clamp(1 - t / 0.6, 0, 1);
  const fadeOut = clamp((t - (tl.total - 1.0)) / 1.0, 0, 1);
  const black = Math.max(fadeIn, fadeOut);
  if (black > 0) {
    ctx.globalAlpha = black;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawTexts(ctx, W, H, p, tl, t, i, unit, bar) {
  const base = { font: p.font, color: p.textColor || '#fff', style: p.textStyle || 'shadow', x: W / 2, maxW: W * 0.86 };
  const items = tl.items;
  const title = p.intro || {};
  if (title.text || title.sub) {
    const first = items[0];
    const end = Math.max(2.8, Math.min(4.8, first.end - first.trOut * 0.5));
    const a = fadeWindow(t, 0.25, end, 0.6);
    if (a > 0) {
      const rise = (1 - ease.out(clamp((t - 0.25) / 1.2, 0, 1))) * unit * 0.03;
      ctx.save();
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const size = unit * 0.1;
      const subSize = unit * 0.048;
      const th = textHeight(ctx, title.text, { font: p.font, size, maxW: base.maxW });
      const sh = textHeight(ctx, title.sub, { font: 'system', size: subSize, maxW: base.maxW });
      const gap = th && sh ? size * 0.3 : 0;
      const top = H / 2 - (th + gap + sh) / 2 + rise;
      drawText(ctx, title.text, { ...base, y: top, anchor: 'top', size, alpha: a, style: base.style === 'box' ? 'shadow' : base.style });
      drawText(ctx, title.sub, { ...base, font: 'system', y: top + th + gap, anchor: 'top', size: subSize, alpha: a });
    }
  }
  // Bildtexte: beim aktuellen und (im Übergang) beim nächsten Bild
  for (const j of [i, i + 1]) {
    const s = p.slides[j];
    if (!s || !s.caption) continue;
    const it = items[j];
    const a = fadeWindow(t, it.start + (j === 0 ? 0.6 : 0.15), it.end - it.trOut - 0.05, 0.4);
    if (a <= 0) continue;
    const y = H - Math.max(bar, 0) - unit * 0.07;
    drawText(ctx, s.caption, { ...base, y, anchor: 'bottom', size: unit * 0.052, alpha: a });
  }
  if (p.ending && p.ending.text && items.length) {
    const last = items[items.length - 1];
    const a = fadeWindow(t, Math.max(last.start + 0.4, tl.total - 3.6), tl.total - 0.15, 0.6);
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      drawText(ctx, p.ending.text, { ...base, y: H / 2, size: unit * 0.085, alpha: a, style: base.style === 'box' ? 'shadow' : base.style });
    }
  }
}

/** Welche Bilder werden im Zeitraum [t, t + ahead] gebraucht? (zum Vorladen) */
export function imagesAround(p, tl, t, ahead = 1) {
  const out = new Set();
  if (!tl.items.length) return [];
  const i = indexAt(tl, t);
  for (let j = i; j < tl.items.length; j++) {
    if (tl.items[j].visStart > t + ahead) break;
    out.add(p.slides[j].img);
  }
  return [...out];
}

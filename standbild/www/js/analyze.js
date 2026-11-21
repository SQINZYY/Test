/* Standbild – Videoanalyse: Bilder abtasten, bewerten, Szenen erkennen, die besten Standbilder wählen,
   Farbpaletten und Bildschwerpunkte bestimmen. Läuft komplett im Browser (Video-Element + Canvas). */
(function () {
  'use strict';
  const S = window.Standbild = window.Standbild || {};

  const BUDGET = 256 * 144;      // Pixel pro Analysebild
  const ROWS = 48;               // Zeilen pro Bild für Filmbarcode und Zeitleiste
  const MAX_KEY = 8;             // Standbilder für die Poster
  const MAX_ALL = 10;            // inkl. Zusatzbilder für den Kontaktabzug
  const CAPTURE = 1920;          // längste Seite der gespeicherten Standbilder
  const CAPTURE_EXTRA = 960;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  S.canvas = canvas;

  function analysisSize(w, h) {
    const k = Math.sqrt(BUDGET / (w * h));
    return [Math.max(24, Math.round(w * k)), Math.max(24, Math.round(h * k))];
  }

  // ---------- Video öffnen und Bilder holen ----------

  function openVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      // Manche Browser (iOS) dekodieren nur Videos, die im Dokument hängen
      v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(v);
      const fail = () => { cleanup(); v.remove(); reject(new Error('codec')); };
      const ok = () => { cleanup(); resolve(v); };
      const timer = setTimeout(fail, 30000);
      function cleanup() { clearTimeout(timer); v.removeEventListener('loadeddata', ok); v.removeEventListener('error', fail); }
      v.addEventListener('loadeddata', ok);
      v.addEventListener('error', fail);
      v.src = url;
      v.load();
    });
  }

  function seekTo(v, t) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeEventListener('seeked', finish);
        resolve();
      };
      const timer = setTimeout(finish, 5000);
      v.addEventListener('seeked', finish);
      v.currentTime = clamp(t, 0, Math.max(0, v.duration - 0.04));
    });
  }

  // ---------- Bildmerkmale ----------

  // Misst ein Analysebild: Balken (Letterbox), Helligkeit, Kontrast, Schärfe, Farbigkeit, Histogramm, Zeilenfarben
  function measure(px, w, h, noBars) {
    const n = w * h;
    const lum = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) lum[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];

    const barRow = y => {
      let mx = 0, sum = 0;
      for (let x = 0, o = y * w; x < w; x++) { const v = lum[o + x]; sum += v; if (v > mx) mx = v; }
      return mx < 42 && sum / w < 22;
    };
    // Fotos haben keine Balken – dort würde ein dunkler Himmel sonst abgeschnitten
    let top = 0, bottom = 0, left = 0, right = 0;
    if (!noBars) {
      while (top < h * 0.45 && barRow(top)) top++;
      while (bottom < h * 0.45 && barRow(h - 1 - bottom)) bottom++;
      const barCol = x => {
        let mx = 0, sum = 0;
        for (let y = top; y < h - bottom; y++) { const v = lum[y * w + x]; sum += v; if (v > mx) mx = v; }
        return mx < 42 && sum / Math.max(1, h - top - bottom) < 22;
      };
      while (left < w * 0.45 && barCol(left)) left++;
      while (right < w * 0.45 && barCol(w - 1 - right)) right++;
      // Bleibt kaum etwas übrig, ist das kein Balken, sondern ein schwarzes Bild
      // (Querformat im Hochformat-Video hat dagegen bis zu ~70 % Balken)
      if (h - top - bottom < h * 0.12 || w - left - right < w * 0.12) top = bottom = left = right = 0;
    }
    const cx = left, cy = top, cw = w - left - right, ch = h - top - bottom;

    let sum = 0, sum2 = 0, sr = 0, sg = 0, sb = 0, rgS = 0, rgS2 = 0, ybS = 0, ybS2 = 0, cnt = 0;
    const hist = new Float32Array(64);
    for (let y = cy; y < cy + ch; y++) {
      for (let x = cx, p = (y * w + cx) * 4; x < cx + cw; x++, p += 4) {
        const r = px[p], g = px[p + 1], b = px[p + 2], l = lum[y * w + x];
        sum += l; sum2 += l * l; sr += r; sg += g; sb += b;
        const rg = r - g, yb = 0.5 * (r + g) - b;
        rgS += rg; rgS2 += rg * rg; ybS += yb; ybS2 += yb * yb;
        hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++;
        cnt++;
      }
    }
    for (let i = 0; i < 64; i++) hist[i] /= cnt;
    const mean = sum / cnt;
    const std = Math.sqrt(Math.max(0, sum2 / cnt - mean * mean));
    const rgM = rgS / cnt, ybM = ybS / cnt;
    const colorful = Math.sqrt(Math.max(0, rgS2 / cnt - rgM * rgM) + Math.max(0, ybS2 / cnt - ybM * ybM)) + 0.3 * Math.hypot(rgM, ybM);

    // Schärfe: Varianz des Laplace-Operators
    let ls = 0, ls2 = 0, lc = 0;
    for (let y = cy + 1; y < cy + ch - 1; y++) {
      for (let x = cx + 1, o = y * w + cx + 1; x < cx + cw - 1; x++, o++) {
        const v = 4 * lum[o] - lum[o - 1] - lum[o + 1] - lum[o - w] - lum[o + w];
        ls += v; ls2 += v * v; lc++;
      }
    }
    const lm = lc ? ls / lc : 0;
    const sharp = lc ? ls2 / lc - lm * lm : 0;

    // Zeilenfarben (für Filmbarcode / Zeitleiste)
    const rows = new Uint8Array(ROWS * 3);
    const stepX = Math.max(1, Math.floor(cw / 64));
    for (let r = 0; r < ROWS; r++) {
      const y0 = cy + Math.floor(r * ch / ROWS), y1 = Math.max(y0 + 1, cy + Math.floor((r + 1) * ch / ROWS));
      let a = 0, b = 0, c = 0, k = 0;
      for (let y = y0; y < y1; y++) for (let x = cx; x < cx + cw; x += stepX) {
        const p = (y * w + x) * 4; a += px[p]; b += px[p + 1]; c += px[p + 2]; k++;
      }
      rows[r * 3] = a / k; rows[r * 3 + 1] = b / k; rows[r * 3 + 2] = c / k;
    }

    return {
      mean, std, colorful, sharp, hist, rows,
      avg: [sr / cnt, sg / cnt, sb / cnt],
      black: mean < 20 || (std < 6 && mean < 40),
      flat: std < 10,
      bars: top + bottom + left + right > 0,
      content: { x: cx / w, y: cy / h, w: cw / w, h: ch / h },
      lum, w, h,
    };
  }

  function histDist(a, b) {
    let s = 0;
    for (let i = 0; i < 64; i++) s += Math.min(a[i], b[i]);
    return 1 - s;
  }
  S.histDist = histDist;

  function percentile(arr, q) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[clamp(Math.floor(q * (s.length - 1)), 0, s.length - 1)];
  }

  function score(samples) {
    const ok = samples.filter(s => !s.black);
    const sharpRef = percentile(ok.map(s => s.sharp), 0.9) || 1;
    const colorRef = percentile(ok.map(s => s.colorful), 0.9) || 1;
    for (const s of samples) {
      if (s.black) { s.score = -1; continue; }
      // Unschärfe wirkt als Faktor: ein verwackeltes Bild wird nie Poster, egal wie schön die Farben sind
      const sharpN = Math.min(1, Math.sqrt(s.sharp / sharpRef));
      const look = 0.3 * Math.min(1, s.colorful / colorRef) + 0.3 * Math.min(1, s.std / 60)
        + 0.4 * (1 - Math.min(1, Math.abs(s.mean - 118) / 118));
      s.score = Math.pow(sharpN, 0.8) * (0.45 + 0.55 * look) - (s.flat ? 0.5 : 0);
    }
  }

  // Szenen: harte Schnitte (großer Histogrammsprung) oder Übergänge über Schwarz
  function scenes(samples) {
    const d = [];
    for (let i = 1; i < samples.length; i++) d.push(histDist(samples[i - 1].hist, samples[i].hist));
    const thr = clamp(percentile(d, 0.5) * 3 + 0.12, 0.25, 0.5);
    let scene = -1, prevBlack = true;
    const out = [];
    samples.forEach((s, i) => {
      if (s.black) { s.scene = -1; prevBlack = true; return; }
      if (prevBlack || d[i - 1] > thr) { scene++; out.push({ start: s.t, end: s.t, items: [] }); }
      s.scene = scene;
      out[scene].items.push(i);
      out[scene].end = s.t;
      prevBlack = false;
      // Übergangsbilder (anders als beide Nachbarn) abwerten
      if (i > 0 && i < samples.length - 1 && d[i - 1] > thr && d[i] > thr) s.score -= 0.15;
    });
    return out;
  }

  function select(samples, sceneList) {
    const top = Math.max(0, ...samples.map(s => s.score));
    const good = s => s && s.score >= Math.max(0.3, top * 0.55); // unscharfe oder dunkle Bilder gar nicht erst nehmen
    const cands = sceneList.map(sc => sc.items.map(i => samples[i]).sort((a, b) => b.score - a.score)[0])
      .filter(good).sort((a, b) => b.score - a.score);
    const picked = [];
    const far = (s, min) => picked.every(p => histDist(p.hist, s.hist) > min);
    for (const c of cands) {
      if (picked.length >= MAX_KEY) break;
      if (far(c, 0.2)) picked.push(c);
    }
    const rest = samples.filter(s => !s.black && good(s) && !picked.includes(s)).sort((a, b) => b.score - a.score);
    const gap = (samples.length > 1 ? samples[1].t - samples[0].t : 1) * 3;
    for (const min of [0.12, 0.05]) {
      for (const c of rest) {
        if (picked.length >= Math.min(6, MAX_KEY)) break;
        if (!picked.includes(c) && far(c, min) && picked.every(p => Math.abs(p.t - c.t) > gap)) picked.push(c);
      }
    }
    // Zusatzbilder für den Kontaktabzug: möglichst gleichmäßig über die Zeit verteilt
    const extras = [];
    const pool = rest.filter(s => !picked.includes(s));
    while (picked.length + extras.length < MAX_ALL && pool.length) {
      let best = null, bestD = -1;
      for (const c of pool) {
        const dmin = Math.min(...picked.concat(extras).map(p => Math.abs(p.t - c.t)));
        if (dmin > bestD) { bestD = dmin; best = c; }
      }
      if (bestD < gap) break;
      extras.push(best);
      pool.splice(pool.indexOf(best), 1);
    }
    return { picked, extras };
  }

  // ---------- Farben ----------

  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  S.rng = rng;

  function kmeans(pts, k, seed) {
    const n = pts.length / 3;
    if (!n) return [];
    const rand = rng(seed || 7);
    const cents = [];
    cents.push(Array.from(pts.slice(0, 3)));
    const d2 = new Float32Array(n).fill(Infinity);
    while (cents.length < k) {
      const c = cents[cents.length - 1];
      let tot = 0;
      for (let i = 0; i < n; i++) {
        const dr = pts[i * 3] - c[0], dg = pts[i * 3 + 1] - c[1], db = pts[i * 3 + 2] - c[2];
        d2[i] = Math.min(d2[i], dr * dr + dg * dg + db * db);
        tot += d2[i];
      }
      if (!tot) break;
      let r = rand() * tot, j = 0;
      while (j < n - 1 && (r -= d2[j]) > 0) j++;
      cents.push([pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]]);
    }
    const as = new Uint8Array(n);
    let counts = [];
    for (let it = 0; it < 10; it++) {
      const acc = cents.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < cents.length; c++) {
          const dr = pts[i * 3] - cents[c][0], dg = pts[i * 3 + 1] - cents[c][1], db = pts[i * 3 + 2] - cents[c][2];
          const dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; best = c; }
        }
        as[i] = best;
        const a = acc[best]; a[0] += pts[i * 3]; a[1] += pts[i * 3 + 1]; a[2] += pts[i * 3 + 2]; a[3]++;
      }
      acc.forEach((a, c) => { if (a[3]) cents[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
      counts = acc.map(a => a[3]);
    }
    let pal = cents.map((c, i) => ({ rgb: c.map(Math.round), share: counts[i] / n })).filter(p => p.share > 0.004);
    // Fast gleiche Farben zusammenlegen
    pal.sort((a, b) => b.share - a.share);
    const merged = [];
    for (const p of pal) {
      const m = merged.find(q => Math.hypot(q.rgb[0] - p.rgb[0], q.rgb[1] - p.rgb[1], q.rgb[2] - p.rgb[2]) < 22);
      if (m) m.share += p.share; else merged.push(p);
    }
    return merged;
  }

  function pixelsOf(cv, content, max) {
    const [w, h] = analysisSize(content.w * cv.width, content.h * cv.height).map(v => Math.max(8, Math.round(v / 3)));
    const t = canvas(w, h);
    const ctx = t.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, content.x * cv.width, content.y * cv.height, content.w * cv.width, content.h * cv.height, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const n = Math.min(max || 4000, w * h), step = (w * h) / n;
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = Math.floor(i * step) * 4;
      out[i * 3] = px[p]; out[i * 3 + 1] = px[p + 1]; out[i * 3 + 2] = px[p + 2];
    }
    return out;
  }

  // ---------- Standbild vorbereiten: Inhalt, Bildschwerpunkt, Palette ----------

  function prepareFrame(cv, info, opts) {
    const [aw, ah] = analysisSize(cv.width, cv.height);
    const t = canvas(aw, ah);
    const ctx = t.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0, aw, ah);
    const px = ctx.getImageData(0, 0, aw, ah).data;
    const m = measure(px, aw, ah, opts && opts.bars === false);

    // Energiekarte: Kanten auf einem weichgezeichneten Bild (Laub, Kies und Rauschen fallen weg, Umrisse bleiben),
    // dazu Sättigung und helle Lichter → wo das Motiv ist
    const soft = boxBlur(boxBlur(m.lum, aw, ah, 1), aw, ah, 2);
    const e = new Float32Array(aw * ah);
    for (let y = 1; y < ah - 1; y++) {
      for (let x = 1; x < aw - 1; x++) {
        const o = y * aw + x, p = o * 4;
        const gx = soft[o + 1 - aw] + 2 * soft[o + 1] + soft[o + 1 + aw] - soft[o - 1 - aw] - 2 * soft[o - 1] - soft[o - 1 + aw];
        const gy = soft[o + aw - 1] + 2 * soft[o + aw] + soft[o + aw + 1] - soft[o - aw - 1] - 2 * soft[o - aw] - soft[o - aw + 1];
        const r = px[p], g = px[p + 1], b = px[p + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        e[o] = Math.hypot(gx, gy) + 0.3 * sat;
      }
    }
    const blurred = boxBlur(e, aw, ah, Math.max(2, Math.round(aw / 40)));
    const integ = new Float64Array((aw + 1) * (ah + 1));
    for (let y = 0; y < ah; y++) {
      let row = 0;
      for (let x = 0; x < aw; x++) {
        row += blurred[y * aw + x];
        integ[(y + 1) * (aw + 1) + x + 1] = integ[y * (aw + 1) + x + 1] + row;
      }
    }

    const content = {
      x: m.content.x * cv.width, y: m.content.y * cv.height,
      w: m.content.w * cv.width, h: m.content.h * cv.height,
    };
    const palette = kmeans(pixelsOf(cv, m.content, 3000), 6, 11);
    const warmth = (m.avg[0] - m.avg[2]) / 255;
    return Object.assign({
      canvas: cv, content, palette,
      energy: { w: aw, h: ah, integ },
      stats: { mean: m.mean, std: m.std, colorful: m.colorful, sharp: m.sharp, warmth, bars: m.bars, avg: m.avg },
      _focus: {},
    }, info);
  }
  S.prepareFrame = prepareFrame;

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1);
        acc += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1);
        acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  // Bildausschnitt in Bildpixeln für ein Seitenverhältnis (Breite/Höhe), Zoom und Fokus (0..1)
  S.cropBox = function (frame, aspect, zoom, focus) {
    const c = frame.content;
    let w, h;
    if (c.w / c.h > aspect) { h = c.h; w = h * aspect; } else { w = c.w; h = w / aspect; }
    zoom = Math.max(1, zoom || 1);
    w /= zoom; h /= zoom;
    const f = focus || S.autoFocus(frame, aspect, zoom);
    const x = clamp(f.x * frame.canvas.width - w / 2, c.x, c.x + c.w - w);
    const y = clamp(f.y * frame.canvas.height - h / 2, c.y, c.y + c.h - h);
    return { x, y, w, h };
  };

  // Sucht das Fenster mit der meisten „Energie“ (leicht zur Mitte gezogen)
  S.autoFocus = function (frame, aspect, zoom) {
    const key = aspect.toFixed(3) + '|' + (zoom || 1).toFixed(2);
    if (frame._focus[key]) return frame._focus[key];
    const E = frame.energy, cv = frame.canvas;
    const kx = E.w / cv.width, ky = E.h / cv.height;
    const c = { x: frame.content.x * kx, y: frame.content.y * ky, w: frame.content.w * kx, h: frame.content.h * ky };
    const aE = aspect * (cv.height / cv.width) * (E.w / E.h); // Seitenverhältnis im Raster der Energiekarte
    let w, h;
    if (c.w / c.h > aE) { h = c.h; w = h * aE; } else { w = c.w; h = w / aE; }
    w /= zoom || 1; h /= zoom || 1;
    const W1 = E.w + 1, I = E.integ;
    const sum = (x0, y0, x1, y1) => {
      x0 = clamp(Math.round(x0), 0, E.w); x1 = clamp(Math.round(x1), 0, E.w);
      y0 = clamp(Math.round(y0), 0, E.h); y1 = clamp(Math.round(y1), 0, E.h);
      return I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
    };
    const total = sum(c.x, c.y, c.x + c.w, c.y + c.h) || 1;
    let best = -Infinity, bx = c.x + (c.w - w) / 2, by = c.y + (c.h - h) / 2;
    const sx = Math.max(1, (c.w - w) / 60), sy = Math.max(1, (c.h - h) / 60);
    for (let y = c.y; y <= c.y + c.h - h + 0.01; y += sy) {
      for (let x = c.x; x <= c.x + c.w - w + 0.01; x += sx) {
        const dx = (x + w / 2 - (c.x + c.w / 2)) / c.w, dy = (y + h / 2 - (c.y + c.h / 2)) / c.h;
        const s = sum(x, y, x + w, y + h) / total - 0.8 * (dx * dx + dy * dy);
        if (s > best) { best = s; bx = x; by = y; }
      }
    }
    const f = { x: (bx + w / 2) / E.w, y: (by + h / 2) / E.h };
    frame._focus[key] = f;
    return f;
  };

  // ---------- Hauptablauf ----------

  S.analyzeVideo = async function (file, onProgress) {
    const report = (phase, done, total, extra) => onProgress && onProgress(Object.assign({ phase, done, total }, extra));
    report('load', 0, 1);
    const url = URL.createObjectURL(file);
    let video;
    try {
      video = await openVideo(url);
      const D = video.duration;
      if (!isFinite(D) || D <= 0) throw new Error('duration');
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) throw new Error('codec');
      const [aw, ah] = analysisSize(vw, vh);
      const cv = canvas(aw, ah);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const grab = async t => {
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, aw, ah);
        return measure(ctx.getImageData(0, 0, aw, ah).data, aw, ah);
      };

      const n = Math.round(clamp(D * 4, 40, 180));
      const step = D / n;
      const samples = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * step;
        const s = await grab(t);
        delete s.lum;
        s.t = t; s.i = i;
        samples.push(s);
        report('sample', i + 1, n, { sample: s });
      }

      score(samples);
      const sceneList = scenes(samples);
      const { picked, extras } = select(samples, sceneList);
      if (!picked.length) {
        const best = samples.filter(s => !s.black).sort((a, b) => b.score - a.score)[0];
        if (!best) throw new Error('empty');
        picked.push(best);
      }

      // Feinsuche: rund um jedes gewählte Bild nach einem noch schärferen Moment suchen
      for (let k = 0; k < picked.length; k++) {
        report('refine', k, picked.length);
        const p = picked[k];
        let best = { t: p.t, sharp: p.sharp };
        for (const off of [-step / 3, step / 3]) {
          const m = await grab(p.t + off);
          if (!m.black && !m.flat && m.sharp > best.sharp * 1.08 && histDist(m.hist, p.hist) < 0.2) best = { t: p.t + off, sharp: m.sharp };
        }
        p.tBest = best.t;
      }

      // Standbilder in voller Auflösung holen (zeitlich sortiert, damit das Spulen kurz bleibt)
      const all = picked.map(s => ({ s, key: true })).concat(extras.map(s => ({ s, key: false })))
        .sort((a, b) => (a.s.tBest ?? a.s.t) - (b.s.tBest ?? b.s.t));
      const frames = [];
      for (let k = 0; k < all.length; k++) {
        report('capture', k, all.length);
        const { s, key } = all[k];
        const t = s.tBest ?? s.t;
        await seekTo(video, t);
        const cap = key ? CAPTURE : CAPTURE_EXTRA;
        const sc = Math.min(1, cap / Math.max(vw, vh));
        const fc = canvas(vw * sc, vh * sc);
        const fx = fc.getContext('2d');
        fx.imageSmoothingQuality = 'high';
        fx.drawImage(video, 0, 0, fc.width, fc.height);
        frames.push(prepareFrame(fc, { t, key, score: s.score, sample: s.i, scene: s.scene }));
      }

      report('colors', 0, 1);
      return finish({
        kind: 'video',
        name: file.name || 'Video',
        duration: D, width: vw, height: vh,
        samples: samples.map(s => ({ t: s.t, black: s.black, scene: s.scene, rows: s.rows, avg: s.avg, mean: s.mean, score: s.score })),
        scenes: sceneList.map(sc => ({ start: sc.start, end: sc.end })),
        frames,
        checked: n + picked.length * 2,
        blackCount: samples.filter(s => s.black).length,
        letterbox: frames.some(f => f.stats.bars),
      });
    } finally {
      if (video) { video.removeAttribute('src'); video.load(); video.remove(); }
      URL.revokeObjectURL(url);
    }
  };

  // ---------- Fotos ----------

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      im.src = url;
    });
  }

  // Farbstreifen eines Fotos: k senkrechte Streifen, die Farben jedes Streifens nach Helligkeit sortiert
  // (hell oben, dunkel unten) – ein Farbverlauf statt eines verpixelten Fotos
  function photoStripes(cv, c, k, index) {
    const R = 160; // feiner als bei Videos, damit der sortierte Verlauf weich wird
    const mid = canvas(k * 8, R * 2), mx = mid.getContext('2d');
    mx.imageSmoothingQuality = 'high';
    mx.drawImage(cv, c.x, c.y, c.w, c.h, 0, 0, mid.width, mid.height);
    const small = canvas(k, R), sx = small.getContext('2d', { willReadFrequently: true });
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(mid, 0, 0, k, R);
    const px = sx.getImageData(0, 0, k, R).data;
    const out = [];
    for (let i = 0; i < k; i++) {
      const col = [];
      let r = 0, g = 0, b = 0;
      for (let y = 0; y < R; y++) {
        const p = (y * k + i) * 4;
        col.push([px[p], px[p + 1], px[p + 2]]);
        r += px[p]; g += px[p + 1]; b += px[p + 2];
      }
      col.sort((x, y) => (0.299 * y[0] + 0.587 * y[1] + 0.114 * y[2]) - (0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2]));
      // leicht weichzeichnen, damit aus einzelnen Pixeln ein ruhiger Verlauf wird
      const rows = new Uint8Array(R * 3);
      for (let y = 0; y < R; y++) {
        const acc = [0, 0, 0];
        let cnt = 0;
        for (let d = -4; d <= 4; d++) {
          const q = col[clamp(y + d, 0, R - 1)];
          acc[0] += q[0]; acc[1] += q[1]; acc[2] += q[2]; cnt++;
        }
        rows[y * 3] = acc[0] / cnt; rows[y * 3 + 1] = acc[1] / cnt; rows[y * 3 + 2] = acc[2] / cnt;
      }
      const avg = [r / R, g / R, b / R];
      out.push({ t: index + (i + 0.5) / k, black: false, scene: index, rows, avg, mean: 0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2], score: 1 });
    }
    return out;
  }

  S.analyzePhotos = async function (files, onProgress) {
    const report = (phase, done, total) => onProgress && onProgress({ phase, done, total });
    const n = files.length, cap = n <= 2 ? 4096 : 2560;
    const k = Math.max(8, Math.round(48 / n));
    const frames = [], samples = [];
    for (let i = 0; i < n; i++) {
      report('load', i, n);
      const im = await loadImage(files[i]);
      const w0 = im.naturalWidth, h0 = im.naturalHeight;
      if (!w0 || !h0) throw new Error('image');
      const sc = Math.min(1, cap / Math.max(w0, h0));
      const cv = canvas(w0 * sc, h0 * sc);
      const cx = cv.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(im, 0, 0, cv.width, cv.height);
      // Reihenfolge wie hochgeladen: Punktzahl fällt mit der Position
      const f = prepareFrame(cv, { t: i, index: i, key: true, score: 1 - i * 0.01, sample: i * k, scene: i, name: files[i].name || `Foto ${i + 1}`, size: [w0, h0] }, { bars: false });
      frames.push(f);
      samples.push(...photoStripes(cv, f.content, k, i));
      await new Promise(r => setTimeout(r, 0));
    }
    report('colors', 0, 1);
    return finish({
      kind: 'photo',
      name: n === 1 ? (files[0].name || 'Foto') : `${n} Fotos`,
      duration: n, width: frames[0].size[0], height: frames[0].size[1],
      samples, scenes: frames.map((f, i) => ({ start: i, end: i + 1 })), frames,
      stripes: k, checked: n, blackCount: 0, letterbox: false,
    });
  };

  // Gemeinsamer Abschluss für Video und Beispiel: Reihenfolge, globale Palette, Stimmung
  function finish(a) {
    a.keyframes = a.frames.filter(f => f.key).sort((x, y) => y.score - x.score);
    a.keyframes.forEach((f, i) => { f.rank = i; });
    a.timeline = a.frames.slice().sort((x, y) => x.t - y.t);
    const pts = [];
    for (const f of a.keyframes) pts.push(pixelsOf(f.canvas, {
      x: f.content.x / f.canvas.width, y: f.content.y / f.canvas.height,
      w: f.content.w / f.canvas.width, h: f.content.h / f.canvas.height,
    }, 1500));
    const merged = new Float32Array(pts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of pts) { merged.set(p, o); o += p.length; }
    a.palette = kmeans(merged, 7, 5);
    a.mood = S.mood ? S.mood(a) : null;
    return a;
  }
  S.finishAnalysis = finish;
})();

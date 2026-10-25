/* Standbild – Poster-Vorlagen. Jede Vorlage zeichnet auf ein Canvas beliebiger Größe (Vorschau wie Druck),
   alle Maße relativ zur Breite (u = 1 % der Breite). */
(function () {
  'use strict';
  const S = window.Standbild = window.Standbild || {};

  const F = {
    display: 'Anton, Impact, "Arial Narrow", sans-serif',
    serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
    heavy: '"Archivo Black", "Arial Black", Arial, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
    sans: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    retro: 'Shrikhand, Georgia, serif',
  };
  S.fonts = F;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- Farben ----------

  const hex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const css = (c, a) => (a === undefined || a >= 1) ? `rgb(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')})`
    : `rgba(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')},${a})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const luma = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  function toHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => {
      t = (t + 1) % 1;
      return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const withL = (c, l, sMin) => { const [h, s] = toHsl(c); return fromHsl(h, Math.max(s, sMin || 0), l); };
  const lightAtLeast = (c, l) => { const x = toHsl(c); return x[2] >= l ? c : fromHsl(x[0], x[1], l); };
  const darkAtMost = (c, l) => { const x = toHsl(c); return x[2] <= l ? c : fromHsl(x[0], x[1], l); };
  const onColor = c => luma(c) > 0.55 ? [18, 18, 20] : [250, 248, 244];

  const darkest = pal => pal.reduce((a, b) => luma(b.rgb) < luma(a.rgb) ? b : a).rgb;
  const lightest = pal => pal.reduce((a, b) => luma(b.rgb) > luma(a.rgb) ? b : a).rgb;
  const dominant = pal => pal[0].rgb;
  function vivid(pal) {
    let best = null, bs = -1;
    for (const p of pal) {
      const [, s, l] = toHsl(p.rgb);
      const v = s * (1 - Math.abs(l - 0.5) * 1.4) * Math.pow(p.share, 0.25);
      if (v > bs) { bs = v; best = p.rgb; }
    }
    const [h, s] = toHsl(best);
    return s < 0.18 ? [214, 48, 49] : fromHsl(h, Math.max(s, 0.55), 0.52);
  }
  S.color = { hex, css, mix, luma, toHsl, fromHsl, vivid, darkest, lightest, onColor };

  // Deutsche Farbnamen für Paletten-Beschriftungen
  function colorName(c) {
    const [h, s, l] = toHsl(c);
    if (s < 0.13 || l < 0.07 || l > 0.95) {
      return l < 0.1 ? 'Schwarz' : l < 0.28 ? 'Anthrazit' : l < 0.5 ? 'Schiefer' : l < 0.72 ? 'Grau' : l < 0.9 ? 'Silber' : 'Weiß';
    }
    let base;
    if (h < 14 || h >= 340) base = 'Rot';
    else if (h < 40) base = l < 0.36 ? 'Braun' : s < 0.4 && l > 0.6 ? 'Sand' : 'Orange';
    else if (h < 64) base = l < 0.36 ? 'Oliv' : s < 0.4 && l > 0.6 ? 'Beige' : 'Gelb';
    else if (h < 160) base = 'Grün';
    else if (h < 196) base = 'Türkis';
    else if (h < 250) base = 'Blau';
    else if (h < 290) base = 'Violett';
    else base = 'Pink';
    if (['Braun', 'Oliv', 'Sand', 'Beige'].includes(base)) return base;
    if (s < 0.3) return (l < 0.4 ? 'Graues ' : 'Blasses ') + base;
    return (l < 0.3 ? 'Tief' : l < 0.45 ? 'Dunkel' : l > 0.72 ? 'Hell' : '') + (l < 0.45 || l > 0.72 ? base.toLowerCase() : base);
  }
  S.colorName = colorName;

  // Stimmung → Titelvorschlag, wenn noch kein Titel eingegeben wurde
  S.mood = function (a) {
    const pal = a.palette;
    let L = 0, warm = 0, sat = 0, tot = 0;
    const hues = {};
    for (const p of pal) {
      const [h, s, l] = toHsl(p.rgb);
      L += l * p.share; sat += s * p.share; tot += p.share;
      warm += (p.rgb[0] - p.rgb[2]) / 255 * p.share;
      if (s > 0.2 && l > 0.12 && l < 0.9) {
        const k = h < 14 || h >= 340 ? 'rot' : h < 45 ? 'gold' : h < 64 ? 'gelb' : h < 160 ? 'grün' : h < 200 ? 'petrol' : h < 255 ? 'blau' : 'neon';
        hues[k] = (hues[k] || 0) + p.share * s;
      }
    }
    L /= tot; sat /= tot; warm /= tot;
    const top = Object.entries(hues).sort((x, y) => y[1] - x[1])[0];
    const hue = top && top[1] > 0.05 ? top[0] : null;
    let title;
    if (L < 0.2) title = hue === 'blau' || hue === 'petrol' || hue === 'neon' ? 'Nachtfahrt' : warm > 0.05 ? 'Glut' : 'Schattenspiel';
    else if (L > 0.68) title = sat < 0.15 ? 'Nebel' : warm > 0.04 ? 'Sommerlicht' : 'Weite';
    else if (sat < 0.12) title = 'Silber';
    else title = { rot: 'Rotlicht', gold: 'Goldene Stunde', gelb: 'Hochsommer', grün: 'Waldlicht', petrol: 'Tiefe Wasser', blau: 'Blaue Stunde', neon: 'Neonträume' }[hue] || (warm > 0.04 ? 'Goldene Stunde' : 'Stille');
    const line = {
      Nachtfahrt: 'Wenn das Licht ausgeht, fängt es an.', Glut: 'Was brennt, bleibt.', Schattenspiel: 'Im Dunkeln sieht man mehr.',
      Nebel: 'Was man nicht sieht, bleibt im Kopf.', Sommerlicht: 'Ein Tag, der nicht enden will.', Weite: 'So weit das Auge reicht.',
      Silber: 'Alles in Grautönen, nichts ist grau.', Rotlicht: 'Alles auf Rot.', 'Goldene Stunde': 'Das Licht, kurz bevor es geht.',
      Hochsommer: 'Heiß, hell und laut.', Waldlicht: 'Zwischen den Bäumen steht die Zeit still.', 'Tiefe Wasser': 'Stille Wasser sind tief.',
      'Blaue Stunde': 'Kurz nach Sonnenuntergang.', Neonträume: 'Die Nacht leuchtet in Farbe.',
    }[title] || 'Ein Moment, angehalten.';
    return { title, line, light: L, warmth: warm, saturation: sat };
  };

  // Lesbarer Name aus dem Dateinamen (ohne Downloader-Kürzel und lange Nummern)
  S.cleanName = function (name) {
    let s = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    s = s.replace(/(ssstik\.io|snaptik(\.app)?|savetik|tiktok|y2mate(\.com)?|ssyoutube|savefrom(\.net)?|yt1s(\.com)?|musicaldown|tikmate|shorts?)/gi, ' ');
    s = s.replace(/[@#][\wäöüß.]*/gi, ' ').replace(/[_\-.()[\]]+/g, ' ');
    // Nummern, IDs und Hash-artige Wörter weglassen (Jahreszahlen und „V10“ bleiben)
    s = s.split(/\s+/).filter(w => w && !/^\d{1,3}$/.test(w) && !/^\d{5,}$/.test(w)
      && !(w.length >= 6 && /\d/.test(w) && /[a-z]/i.test(w)) && !/^\d{3,4}p$/i.test(w) && !/^(io|com|net|app|www|download|video|img|vid|mov|dsc|pxl|mvimg)$/i.test(w)).join(' ');
    s = s.trim();
    return (s.match(/[a-zäöüß]/gi) || []).length >= 3 ? s : '';
  };

  // ---------- Zeit ----------

  const pad = (n, k) => String(n).padStart(k || 2, '0');
  function tc(t, long) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t % 1) * 100);
    return long ? `${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(s)}.${pad(cs)}` : `${m}:${pad(s)}`;
  }
  S.tc = tc;
  const num = (v, d) => v.toFixed(d || 0).replace('.', ',');
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // ---------- Schrift ----------

  const NATIVE_SPACING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

  function setFont(ctx, px, fam, o) {
    o = o || {};
    ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${px}px ${fam}`;
    ctx._sp = (o.spacing || 0) * px;
    if (NATIVE_SPACING) ctx.letterSpacing = ctx._sp + 'px';
    ctx.textBaseline = 'alphabetic';
    return px;
  }
  function tw(ctx, s) {
    const w = ctx.measureText(s).width;
    if (!ctx._sp) return w;
    return NATIVE_SPACING ? w - ctx._sp : w + ctx._sp * (s.length - 1);
  }
  function put(ctx, s, x, y, align, stroke) {
    s = String(s);
    const w = tw(ctx, s);
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    if (!ctx._sp || NATIVE_SPACING) { stroke ? ctx.strokeText(s, x0, y) : ctx.fillText(s, x0, y); return w; }
    for (const ch of s) {
      stroke ? ctx.strokeText(ch, x0, y) : ctx.fillText(ch, x0, y);
      x0 += ctx.measureText(ch).width + ctx._sp;
    }
    return w;
  }
  function fit(ctx, s, fam, maxW, maxPx, o) {
    setFont(ctx, maxPx, fam, o);
    const w = tw(ctx, s);
    return w > maxW ? setFont(ctx, maxPx * maxW / w, fam, o) : maxPx;
  }
  function wrap(ctx, s, maxW, maxLines) {
    const words = String(s).split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && tw(ctx, test) > maxW) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    if (maxLines && out.length > maxLines) {
      const keep = out.slice(0, maxLines);
      let last = keep[maxLines - 1] + '…';
      while (tw(ctx, last) > maxW && last.length > 2) last = last.slice(0, -2) + '…';
      keep[maxLines - 1] = last;
      return keep;
    }
    return out;
  }

  // Titel auf 1–n Zeilen verteilen, sodass die Schrift möglichst groß wird
  function titleLayout(ctx, text, fam, o, maxW, maxH, maxLines, lh, maxPx) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { lines: [], px: 0 };
    setFont(ctx, 100, fam, o);
    const width = ws => tw(ctx, ws.join(' '));
    let best = null;
    const tryLines = lines => {
      const wMax = Math.max(...lines.map(l => width(l)));
      const px = Math.min(maxPx, maxW / wMax * 100, maxH / (lines.length * lh));
      const score = px * (1 - 0.06 * (lines.length - 1));
      if (!best || score > best.score) best = { score, px, lines: lines.map(l => l.join(' ')) };
    };
    const n = words.length;
    for (let k = 1; k <= Math.min(maxLines, n); k++) {
      // alle Aufteilungen in k Zeilen (Titel sind kurz)
      const rec = (start, left, acc) => {
        if (left === 1) { tryLines(acc.concat([words.slice(start)])); return; }
        for (let e = start + 1; e <= n - left + 1; e++) rec(e, left - 1, acc.concat([words.slice(start, e)]));
      };
      if (n <= 12) rec(0, k, []);
      else tryLines([words]);
    }
    setFont(ctx, best.px, fam, o);
    return best;
  }

  // ---------- Bild ----------

  function drawImg(ctx, frame, x, y, w, h, look) {
    const c = S.cropBox(frame, w / h, look && look.zoom, look && look.focus);
    // Merken, wie das Hauptbild sitzt – der Editor rechnet damit das Verschieben per Finger um
    if (look && !S.lastMain) S.lastMain = { aspect: w / h, share: w / ctx.canvas.width };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame.canvas, c.x, c.y, c.w, c.h, x, y, w, h);
  }
  function cropCanvas(frame, w, h, look) {
    const cv = S.canvas(w, h);
    drawImg(cv.getContext('2d'), frame, 0, 0, cv.width, cv.height, look);
    return cv;
  }
  function levels(px) {
    const hist = new Uint32Array(256);
    for (let p = 0; p < px.length; p += 16) hist[(px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8]++;
    const total = hist.reduce((a, b) => a + b, 0);
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
    return [lo, Math.max(lo + 30, hi)];
  }
  function duotone(cv, dark, light) {
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const id = ctx.getImageData(0, 0, cv.width, cv.height), px = id.data;
    const [lo, hi] = levels(px);
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      let t = clamp((i - lo) / (hi - lo), 0, 1);
      t = t * t * (3 - 2 * t);
      for (let k = 0; k < 3; k++) lut[i * 3 + k] = dark[k] + (light[k] - dark[k]) * t;
    }
    for (let p = 0; p < px.length; p += 4) {
      const l = (px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8;
      px[p] = lut[l * 3]; px[p + 1] = lut[l * 3 + 1]; px[p + 2] = lut[l * 3 + 2];
    }
    ctx.putImageData(id, 0, 0);
    return cv;
  }
  // Siebdruck-Look: Tonwerte in wenige Druckfarben aufteilen (gleich große Flächen)
  function screenprint(cv, inks) {
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const id = ctx.getImageData(0, 0, cv.width, cv.height), px = id.data;
    const hist = new Uint32Array(256);
    for (let p = 0; p < px.length; p += 4) hist[(px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8]++;
    const total = px.length / 4, cuts = [];
    let acc = 0, k = 1;
    for (let i = 0; i < 256 && k < inks.length; i++) {
      acc += hist[i];
      while (k < inks.length && acc >= total * k / inks.length) { cuts.push(i); k++; }
    }
    const lut = new Uint8Array(256);
    for (let i = 0, c = 0; i < 256; i++) { while (c < cuts.length && i > cuts[c]) c++; lut[i] = c; }
    for (let p = 0; p < px.length; p += 4) {
      const ink = inks[lut[(px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8]];
      px[p] = ink[0]; px[p + 1] = ink[1]; px[p + 2] = ink[2];
    }
    ctx.putImageData(id, 0, 0);
    return cv;
  }
  let noiseTile = null;
  function grain(ctx, W, H, amount) {
    if (!noiseTile) {
      noiseTile = S.canvas(180, 180);
      const x = noiseTile.getContext('2d'), id = x.createImageData(180, 180), r = S.rng(42);
      for (let p = 0; p < id.data.length; p += 4) { const v = r() * 255; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; }
      x.putImageData(id, 0, 0);
    }
    const pat = ctx.createPattern(noiseTile, 'repeat');
    if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(W / 800, W / 800));
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  function vignette(ctx, W, H, amount) {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${amount})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function regionLuma(ctx, x, y, w, h) {
    try {
      const px = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
      let s = 0, s2 = 0, n = 0;
      for (let p = 0; p < px.length; p += 64) {
        const l = (px[p] * 0.2126 + px[p + 1] * 0.7152 + px[p + 2] * 0.0722) / 255;
        s += l; s2 += l * l; n++;
      }
      const mean = s / n;
      return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
    } catch (e) { return { mean: 0.4, std: 0.3 }; }
  }
  function rule(ctx, x0, y, x1, lw, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x0, y - lw / 2, x1 - x0, lw);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Bildnachweis-Block wie auf Filmplakaten: kleine Wörter, große Zahlen, schmal gesetzt
  function billing(ctx, d, y, color, maxW) {
    const { u, a, frame } = d;
    const lines = [
      [[String(a.checked), 1], ['Bilder geprüft', 0], [String(a.scenes.length), 1], [a.scenes.length === 1 ? 'Szene' : 'Szenen', 0], ['Standbild bei', 0], [tc(frame.t, true), 1]],
      [['Laufzeit', 0], [tc(a.duration), 1], [`${a.width}×${a.height}`, 1], ['Pixel', 0], ['Farben', 0], [d.pal.slice(0, 3).map(p => hex(p.rgb)).join(' '), 1]],
    ];
    ctx.fillStyle = color;
    lines.forEach((parts, li) => {
      const big = 2.3 * u, small = 1.35 * u;
      const measureAll = () => parts.reduce((w, [t, b]) => {
        setFont(ctx, b ? big : small, F.display, { spacing: 0.06 });
        return w + tw(ctx, t.toUpperCase()) + 1.1 * u;
      }, -1.1 * u);
      ctx.save();
      const total = measureAll(), sx = Math.min(1, maxW / total);
      ctx.translate(d.W / 2 - total * sx / 2, y + li * 3.1 * u);
      ctx.scale(sx, 1);
      let x = 0;
      for (const [t, b] of parts) {
        setFont(ctx, b ? big : small, F.display, { spacing: 0.06 });
        x += put(ctx, t.toUpperCase(), x, 0) + 1.1 * u;
      }
      ctx.restore();
    });
  }

  // ---------- Vorlagen ----------

  const T = {};

  T.kino = {
    name: 'Kino', about: 'Filmplakat mit großem Titel und Abspann-Block',
    render(ctx, d) {
      const { W, H, u } = d;
      drawImg(ctx, d.frame, 0, 0, W, H, d.look);
      const dark = mix(darkest(d.pal), [0, 0, 0], 0.6);
      let g = ctx.createLinearGradient(0, 0, 0, H * 0.24);
      g.addColorStop(0, css(dark, 0.7)); g.addColorStop(1, css(dark, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.24);
      g = ctx.createLinearGradient(0, H * 0.4, 0, H);
      g.addColorStop(0, css(dark, 0)); g.addColorStop(0.55, css(dark, 0.8)); g.addColorStop(1, css(dark, 0.97));
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.4, W, H * 0.6);
      vignette(ctx, W, H, 0.3);
      const light = mix(lightest(d.pal), [255, 255, 255], 0.8);
      const acc = lightAtLeast(d.accent, 0.62);

      if (d.line) {
        ctx.fillStyle = css(light, 0.92);
        fit(ctx, d.line, F.serif, W * 0.84, 4.4 * u, { italic: true });
        put(ctx, d.line, W / 2, 9 * u, 'center');
      }
      const bottom = H - 23 * u;
      const t = titleLayout(ctx, d.title.toUpperCase(), F.display, { spacing: 0.01 }, W * 0.88, H * 0.26, 3, 0.96, 30 * u);
      ctx.fillStyle = css(light);
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 2 * u;
      t.lines.forEach((l, i) => put(ctx, l, W / 2, bottom - (t.lines.length - 1 - i) * t.px * 0.96, 'center'));
      ctx.shadowColor = 'transparent';
      if (d.subtitle) {
        ctx.fillStyle = css(acc);
        fit(ctx, d.subtitle.toUpperCase(), F.sans, W * 0.84, 2.6 * u, { weight: 600, spacing: 0.3 });
        put(ctx, d.subtitle.toUpperCase(), W / 2, bottom + 6.2 * u, 'center');
      }
      billing(ctx, d, H - 10.5 * u, css(light, 0.72), W * 0.84);
    },
  };

  T.raster = {
    name: 'Raster', about: 'Schweizer Typografie: Raster, Linien, ein Farbpunkt',
    render(ctx, d) {
      const { W, H, u } = d, m = 6 * u;
      const paper = [237, 237, 233], ink = [17, 17, 17];
      ctx.fillStyle = css(paper); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = css(ink);
      setFont(ctx, 1.8 * u, F.mono, { weight: 600, spacing: 0.08 });
      put(ctx, 'STANDBILD', m, m + 1.6 * u);
      put(ctx, tc(d.frame.t, true), W / 2, m + 1.6 * u, 'center');
      put(ctx, `BILD ${pad(d.num)} / ${pad(d.total)}`, W - m, m + 1.6 * u, 'right');
      rule(ctx, m, m + 3.6 * u, W - m, 0.25 * u, css(ink));

      const iy = m + 6 * u, ih = H * 0.5;
      drawImg(ctx, d.frame, m, iy, W - m, ih, d.look);
      const r = 11 * u, cx = W - m - r, cy = iy + ih;
      ctx.fillStyle = css(d.accent);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = css(onColor(d.accent));
      setFont(ctx, 7 * u, F.heavy);
      put(ctx, pad(d.num), cx, cy + 2.5 * u, 'center');

      const infoY = H - m - 10 * u;
      const top = iy + ih + 5 * u;
      const t = titleLayout(ctx, d.title, F.heavy, { spacing: -0.02 }, W - 2 * m - 24 * u, infoY - top - 4 * u, 4, 0.98, 17 * u);
      ctx.fillStyle = css(ink);
      t.lines.forEach((l, i) => put(ctx, l, m - 0.4 * u, top + t.px * 0.78 + i * t.px * 0.98));

      rule(ctx, m, infoY, W - m, 0.25 * u, css(ink));
      const colW = (W - 2 * m) / 3;
      const cols = [
        ['Untertitel', d.subtitle || '–'],
        ['Laufzeit · Szenen', `${tc(d.a.duration)} · ${d.a.scenes.length}`],
        ['Farbe', `${hex(d.accent)} ${colorName(d.accent)}`],
      ];
      cols.forEach(([k, v], i) => {
        const x = m + i * colW;
        ctx.fillStyle = css(ink, 0.55);
        setFont(ctx, 1.5 * u, F.mono, { spacing: 0.06 });
        put(ctx, k.toUpperCase(), x, infoY + 3.4 * u);
        ctx.fillStyle = css(ink);
        setFont(ctx, 2.1 * u, F.sans, { weight: 600 });
        wrap(ctx, v, colW - 2 * u, 2).forEach((l, j) => put(ctx, l, x, infoY + 6.6 * u + j * 2.6 * u));
      });
    },
  };

  T.duotone = {
    name: 'Duotone', about: 'Zwei Farben aus dem Video, Titel senkrecht',
    render(ctx, d) {
      const { W, H, u } = d;
      // Dunkle Farbe aus dem Video; ist sie grau, die Gegenfarbe zum Akzent
      const dk = darkest(d.gpal), accH = toHsl(d.accent)[0];
      const dark = toHsl(dk)[1] > 0.15 ? withL(dk, 0.12, 0.35) : fromHsl(accH + 200, 0.5, 0.13);
      const light = withL(d.accent, 0.74, 0.5);
      ctx.drawImage(duotone(cropCanvas(d.frame, W, H, d.look), dark, light), 0, 0);
      grain(ctx, W, H, 0.22);
      const paper = [246, 242, 234];
      ctx.fillStyle = css(paper);
      const t = titleLayout(ctx, d.title.toUpperCase(), F.display, { spacing: 0.02 }, H - 12 * u, 30 * u, 2, 0.92, 30 * u);
      ctx.save();
      ctx.translate(5 * u, H - 6 * u);
      ctx.rotate(-Math.PI / 2);
      t.lines.forEach((l, i) => put(ctx, l, 0, t.px * 0.74 + i * t.px * 0.92));
      ctx.restore();

      const x = W - 6 * u;
      if (d.subtitle) {
        setFont(ctx, 2.3 * u, F.sans, { weight: 600, spacing: 0.22 });
        wrap(ctx, d.subtitle.toUpperCase(), W * 0.5, 2).forEach((l, i) => put(ctx, l, x, 8 * u + i * 3 * u, 'right'));
      }
      setFont(ctx, 1.7 * u, F.mono, { spacing: 0.05 });
      ctx.fillStyle = css(paper, 0.8);
      put(ctx, `${hex(dark)} / ${hex(light)}`, x, 15 * u, 'right');
      put(ctx, tc(d.frame.t, true), x, 17.6 * u, 'right');
      if (d.line) {
        ctx.fillStyle = css(paper);
        setFont(ctx, 4 * u, F.serif, { italic: true });
        const lines = wrap(ctx, d.line, W * 0.58, 3);
        lines.forEach((l, i) => put(ctx, l, x, H - 7 * u - (lines.length - 1 - i) * 4.4 * u, 'right'));
      }
    },
  };

  T.galerie = {
    name: 'Galerie', about: 'Kunstdruck mit breitem Rand und Bildlegende',
    render(ctx, d) {
      const { W, H, u } = d, m = 9 * u;
      const paper = [246, 245, 241], ink = [30, 29, 28];
      ctx.fillStyle = css(paper); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = css(ink, 0.6);
      setFont(ctx, 1.6 * u, F.mono, { spacing: 0.08 });
      put(ctx, `NR. ${pad(d.num)}`, m, m - 2 * u);
      put(ctx, 'VIDEOSTILL', W - m, m - 2 * u, 'right');

      const f = d.frame, ar = f.content.w / f.content.h;
      let bw = W - 2 * m, bh = bw / ar;
      if (bh > H * 0.56) { bh = H * 0.56; bw = bh * ar; }
      const bx = (W - bw) / 2, by = m + 2 * u;
      drawImg(ctx, f, bx, by, bw, bh, d.look);

      let y = by + bh + 9 * u;
      ctx.fillStyle = css(ink);
      const t = titleLayout(ctx, d.title, F.serif, {}, W - 2 * m, 18 * u, 2, 1, 9 * u);
      t.lines.forEach((l, i) => put(ctx, l, m, y + i * t.px));
      y += (t.lines.length - 1) * t.px + 5 * u;
      if (d.subtitle) {
        ctx.fillStyle = css(ink, 0.75);
        setFont(ctx, 3.8 * u, F.serif, { italic: true });
        put(ctx, wrap(ctx, d.subtitle, W - 2 * m, 1)[0], m, y);
        y += 3.4 * u;
      }
      rule(ctx, m, y, W - m, 0.15 * u, css(ink, 0.5));
      y += 3.6 * u;
      ctx.fillStyle = css(ink, 0.8);
      setFont(ctx, 1.75 * u, F.mono);
      const sceneNo = f.scene >= 0 ? `Szene ${f.scene + 1} von ${d.a.scenes.length}` : `${d.a.scenes.length} Szenen`;
      [`Standbild bei ${tc(f.t, true)}`, `${d.a.width} × ${d.a.height} Pixel`, sceneNo].forEach((l, i) => put(ctx, l, m, y + i * 2.7 * u));
      const sw = 4.6 * u, gap = 1 * u, pal = d.pal.slice(0, 6);
      pal.forEach((p, i) => {
        ctx.fillStyle = css(p.rgb);
        ctx.fillRect(W - m - (pal.length - i) * sw - (pal.length - 1 - i) * gap, y - 1.8 * u, sw, sw);
      });
      if (d.line) {
        ctx.fillStyle = css(ink, 0.7);
        setFont(ctx, 3 * u, F.serif, { italic: true });
        put(ctx, wrap(ctx, d.line, W - 2 * m, 1)[0], W / 2, H - m + 3 * u, 'center');
      }
    },
  };

  T.palette = {
    name: 'Farbpalette', about: 'Standbild mit den Farben, aus denen es besteht',
    render(ctx, d) {
      const { W, H, u } = d, m = 6 * u;
      const bg = mix(darkest(d.pal), [10, 10, 12], 0.75), fg = [244, 242, 238];
      ctx.fillStyle = css(bg); ctx.fillRect(0, 0, W, H);
      const ih = H * 0.5;
      drawImg(ctx, d.frame, m, m, W - 2 * m, ih, d.look);
      const pal = d.pal.slice(0, 6).slice().sort((a, b) => luma(a.rgb) - luma(b.rgb));
      const gap = 0.8 * u, bw = (W - 2 * m - gap * (pal.length - 1)) / pal.length;
      const by = m + ih + 2.4 * u, bh = H * 0.17;
      pal.forEach((p, i) => {
        const x = m + i * (bw + gap);
        ctx.fillStyle = css(p.rgb);
        ctx.fillRect(x, by, bw, bh);
        ctx.fillStyle = css(onColor(p.rgb), 0.85);
        setFont(ctx, Math.min(1.9 * u, bw / 5.2), F.mono, { weight: 600 });
        put(ctx, `${Math.round(p.share * 100)} %`, x + 1.2 * u, by + bh - 1.6 * u);
        ctx.fillStyle = css(fg, 0.9);
        setFont(ctx, Math.min(1.7 * u, bw / 5.6), F.mono);
        put(ctx, hex(p.rgb), x, by + bh + 3.2 * u);
        ctx.fillStyle = css(fg, 0.6);
        setFont(ctx, Math.min(1.7 * u, bw / 6), F.sans);
        put(ctx, wrap(ctx, colorName(p.rgb), bw, 1)[0], x, by + bh + 5.6 * u);
      });
      const ty = by + bh + 9 * u;
      ctx.fillStyle = css(fg);
      const t = titleLayout(ctx, d.title, F.serif, {}, W - 2 * m, H - ty - m - 3 * u, 2, 0.95, 12 * u);
      t.lines.forEach((l, i) => put(ctx, l, m, ty + t.px * 0.8 + i * t.px * 0.95));
      ctx.fillStyle = css(fg, 0.65);
      setFont(ctx, 1.7 * u, F.mono, { spacing: 0.04 });
      put(ctx, [d.subtitle, tc(d.frame.t, true)].filter(Boolean).join('  ·  '), m, H - m + 1.5 * u);
    },
  };

  T.film = {
    name: 'Filmstreifen', about: 'Drei Szenen als Negativstreifen auf dem Leuchttisch',
    frames: 3,
    render(ctx, d) {
      const { W, H, u } = d;
      const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, '#fbfbf9'); g.addColorStop(1, '#dcdee0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const x0 = 13 * u, sw = 74 * u, y0 = 6 * u, y1 = H - 25 * u;
      ctx.fillStyle = '#1a1714';
      ctx.fillRect(x0, y0, sw, y1 - y0);
      // Perforation
      ctx.fillStyle = '#f3f3f1';
      for (let y = y0 + 1.4 * u; y < y1 - 2.4 * u; y += 4.6 * u) {
        roundRect(ctx, x0 + 1.4 * u, y, 3 * u, 2.2 * u, 0.5 * u); ctx.fill();
        roundRect(ctx, x0 + sw - 4.4 * u, y, 3 * u, 2.2 * u, 0.5 * u); ctx.fill();
      }
      const fx = x0 + 7.4 * u, fw = sw - 14.8 * u, gap = 2.6 * u;
      const frames = d.frames.slice().sort((a, b) => a.t - b.t);
      const fh = (y1 - y0 - 2 * 2.2 * u - gap * (frames.length - 1)) / frames.length;
      frames.forEach((f, i) => {
        const fy = y0 + 2.2 * u + i * (fh + gap);
        drawImg(ctx, f, fx, fy, fw, fh, f === d.frame ? d.look : null);
        // Randbeschriftung wie auf Negativfilm
        ctx.save();
        ctx.fillStyle = '#e8a03a';
        setFont(ctx, 1.35 * u, F.mono, { weight: 600, spacing: 0.1 });
        ctx.translate(x0 + 6.4 * u, fy + fh / 2);
        ctx.rotate(-Math.PI / 2);
        put(ctx, `${i * 6 + 12}A  >  ${tc(f.t, true)}`, 0, 0, 'center');
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#e8a03a';
        setFont(ctx, 1.35 * u, F.mono, { weight: 600, spacing: 0.1 });
        ctx.translate(x0 + sw - 5.4 * u, fy + fh / 2);
        ctx.rotate(Math.PI / 2);
        put(ctx, 'STANDBILD 400', 0, 0, 'center');
        ctx.restore();
      });
      const ink = [24, 24, 24];
      ctx.fillStyle = css(ink);
      const t = titleLayout(ctx, d.title.toUpperCase(), F.display, { spacing: 0.02 }, sw, 11 * u, 1, 1, 10 * u);
      put(ctx, t.lines[0], W / 2, y1 + 6 * u + t.px * 0.78, 'center');
      ctx.fillStyle = css(ink, 0.7);
      setFont(ctx, 1.8 * u, F.mono, { spacing: 0.04 });
      put(ctx, [d.subtitle, frames.map(f => tc(f.t)).join(' / ')].filter(Boolean).join('  ·  '), W / 2, H - 6 * u, 'center');
    },
  };

  T.kontakt = {
    name: 'Kontaktabzug', about: 'Alle ausgewählten Bilder wie im Fotolabor, das beste markiert',
    frames: 'all',
    render(ctx, d) {
      const { W, H, u } = d, m = 6 * u;
      const paper = [243, 243, 240], ink = [22, 22, 22];
      ctx.fillStyle = css(paper); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = css(ink);
      const t = titleLayout(ctx, d.title, F.heavy, {}, W * 0.6, 7 * u, 1, 1, 6.4 * u);
      put(ctx, t.lines[0], m, m + t.px * 0.78);
      setFont(ctx, 1.7 * u, F.mono, { spacing: 0.06 });
      put(ctx, `ROLLE 01 · ${d.frames.length} BILDER`, W - m, m + 2 * u, 'right');
      put(ctx, `LAUFZEIT ${tc(d.a.duration)}`, W - m, m + 4.6 * u, 'right');
      rule(ctx, m, m + 8.5 * u, W - m, 0.25 * u, css(ink));

      const gx = 2.4 * u, lab = 3.4 * u;
      const top = m + 12 * u, bottom = H - m - 9 * u, aw = W - 2 * m, ah = bottom - top;
      const ar = d.frames[0].content.w / d.frames[0].content.h;
      const n = d.frames.length;
      let best = null;
      for (let c = 1; c <= 4; c++) {
        const r = Math.ceil(n / c);
        let cw = (aw - (c - 1) * gx) / c, ch = cw / ar;
        if (r * (ch + lab + gx) > ah) { ch = (ah - r * (lab + gx)) / r; cw = ch * ar; }
        if (!best || cw * ch > best.cw * best.ch) best = { c, r, cw, ch };
      }
      const { c, cw, ch } = best;
      const ox = m + (aw - (c * cw + (c - 1) * gx)) / 2;
      let mark = null;
      d.frames.forEach((f, i) => {
        const x = ox + (i % c) * (cw + gx), y = top + Math.floor(i / c) * (ch + lab + gx);
        ctx.fillStyle = '#121212';
        ctx.fillRect(x - 0.6 * u, y - 0.6 * u, cw + 1.2 * u, ch + 1.2 * u);
        drawImg(ctx, f, x, y, cw, ch, f === d.frame ? d.look : null);
        ctx.fillStyle = css(ink, 0.75);
        setFont(ctx, 1.45 * u, F.mono, { weight: 600 });
        put(ctx, `${pad(i + 1)}A`, x, y + ch + 2.6 * u);
        setFont(ctx, 1.45 * u, F.mono);
        put(ctx, tc(f.t, true), x + cw, y + ch + 2.6 * u, 'right');
        if (f.key && f.rank === 0) mark = { x, y, w: cw, h: ch };
      });
      if (mark) {
        // Fettstift-Kreis um das beste Bild
        const r = S.rng(9);
        ctx.strokeStyle = 'rgba(206,32,32,0.88)';
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = (0.7 - pass * 0.25) * u;
          ctx.beginPath();
          const cx = mark.x + mark.w / 2, cy = mark.y + mark.h / 2 + 0.8 * u, rx = mark.w * 0.62, ry = mark.h * 0.66 + 1.5 * u;
          for (let a = 0; a <= Math.PI * 2.15; a += 0.12) {
            const j = 1 + (r() - 0.5) * 0.04;
            const px = cx + Math.cos(a - 0.4) * rx * j, py = cy + Math.sin(a - 0.4) * ry * j;
            a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      rule(ctx, m, H - m - 5.5 * u, W - m, 0.25 * u, css(ink));
      ctx.fillStyle = css(ink);
      setFont(ctx, 2.2 * u, F.sans, { weight: 600 });
      put(ctx, wrap(ctx, d.subtitle || d.line || '', W * 0.5, 1)[0] || '', m, H - m);
      setFont(ctx, 1.6 * u, F.mono);
      ctx.fillStyle = css(ink, 0.7);
      put(ctx, `${d.a.scenes.length} SZENEN · ${d.a.checked} BILDER GEPRÜFT`, W - m, H - m, 'right');
    },
  };

  T.magazin = {
    name: 'Magazin', about: 'Titelseite mit Masthead, Schlagzeilen und Strichcode',
    render(ctx, d) {
      const { W, H, u } = d;
      drawImg(ctx, d.frame, 0, 0, W, H, d.look);
      let g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      const band = regionLuma(ctx, 0, 0, W, H * 0.2);
      // Dunkle Schrift nur auf ruhigem, hellem Himmel – sonst helle Schrift mit Schatten
      const darkHead = band.mean > 0.62 && band.std < 0.16;
      const head = darkHead ? [16, 16, 18] : [252, 250, 246];
      if (!darkHead) {
        const g0 = ctx.createLinearGradient(0, 0, 0, H * 0.24);
        g0.addColorStop(0, 'rgba(0,0,0,0.38)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H * 0.24);
      }
      const acc = lightAtLeast(d.accent, 0.6);

      ctx.fillStyle = css(head, 0.85);
      setFont(ctx, 1.6 * u, F.mono, { weight: 600, spacing: 0.1 });
      const now = new Date();
      put(ctx, `AUSGABE ${MONTHS[now.getMonth()].toUpperCase()} ${now.getFullYear()}`, 4 * u, 4.6 * u);
      put(ctx, `NR. ${pad(d.num)}`, W - 4 * u, 4.6 * u, 'right');
      ctx.fillStyle = css(head);
      if (!darkHead) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 1.5 * u; }
      const px = fit(ctx, d.title.toUpperCase(), F.serif, W - 8 * u, 24 * u, { spacing: -0.01 });
      put(ctx, d.title.toUpperCase(), W / 2, 6.5 * u + px * 0.72, 'center');
      ctx.shadowColor = 'transparent';

      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 1.4 * u;
      const items = [
        [String(d.a.scenes.length), 'Szenen', 'im Schnitt'],
        [String(d.a.keyframes.length), 'Standbilder', 'ausgewählt'],
        [String(d.pal.length), 'Farben', 'die bleiben'],
      ];
      let y = Math.max(6.5 * u + px + 14 * u, H * 0.36);
      for (const [n, a, b] of items) {
        ctx.fillStyle = css(acc);
        setFont(ctx, 8 * u, F.display);
        const w = put(ctx, n, 5 * u, y);
        ctx.fillStyle = '#fff';
        setFont(ctx, 2.3 * u, F.sans, { weight: 600, spacing: 0.08 });
        put(ctx, a.toUpperCase(), 6.5 * u + w, y - 3.4 * u);
        put(ctx, b.toUpperCase(), 6.5 * u + w, y - 0.4 * u);
        y += 11 * u;
      }
      const headline = (d.subtitle || d.line || '').toUpperCase();
      let hy = H - 9 * u;
      if (d.line && d.subtitle) {
        ctx.fillStyle = '#fff';
        setFont(ctx, 3.4 * u, F.serif, { italic: true });
        put(ctx, wrap(ctx, d.line, W * 0.62, 1)[0], 5 * u, hy);
        hy -= 5.6 * u;
      }
      if (headline) {
        const t = titleLayout(ctx, headline, F.display, { spacing: 0.01 }, W * 0.62, 20 * u, 2, 0.95, 9 * u);
        ctx.fillStyle = '#fff';
        t.lines.forEach((l, i) => put(ctx, l, 5 * u, hy - (t.lines.length - 1 - i) * t.px * 0.95));
      }
      ctx.shadowColor = 'transparent';
      // Strichcode aus den Helligkeiten des Videos
      const bw = 19 * u, bh = 11 * u, bx = W - 4 * u - bw, by = H - 4 * u - bh;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#111';
      const means = d.a.samples.map(s => s.mean || 0), med = means.slice().sort((a, b) => a - b)[means.length >> 1];
      let x = bx + 1.5 * u;
      const unit = 0.24 * u;
      for (let i = 0; x < bx + bw - 1.5 * u && i < means.length * 2; i++) {
        const wide = means[i % means.length] > med ? 2 : 1;
        if (i % 2 === 0) ctx.fillRect(x, by + 1.2 * u, wide * unit, bh - 4.2 * u);
        x += wide * unit + unit * (i % 3 === 0 ? 1.5 : 1);
      }
      setFont(ctx, 1.2 * u, F.mono);
      put(ctx, String(d.a.width * 1000 + d.a.height).padStart(10, '0').replace(/(\d{1})(\d{5})(\d+)/, '$1 $2 $3'), bx + bw / 2, by + bh - 1 * u, 'center');
    },
  };

  T.siebdruck = {
    name: 'Siebdruck', about: 'Retro-Plakat in vier Druckfarben unter einem Bogen',
    render(ctx, d) {
      const { W, H, u } = d;
      const paper = [238, 227, 205];
      // Druckfarben aus der Palette; graue Töne bekommen den Farbton des Akzents
      const accH = toHsl(d.accent)[0];
      const tint = (c, l, s) => toHsl(c)[1] < 0.12 ? fromHsl(accH, s * 0.8, l) : fromHsl(toHsl(c)[0], Math.max(toHsl(c)[1], s), l);
      const byL = d.pal.slice().sort((a, b) => luma(a.rgb) - luma(b.rgb)).map(p => p.rgb);
      const ink = toHsl(byL[0])[1] < 0.12 ? fromHsl(accH, 0.2, 0.12) : withL(byL[0], 0.13, 0.3);
      const mid1 = byL[Math.floor(byL.length / 3)] || d.accent;
      const mid2 = byL[Math.floor(byL.length * 2 / 3)] || d.accent;
      const inks = [ink, tint(mid1, 0.42, 0.5), tint(mid2, 0.7, 0.35), mix(paper, [255, 255, 255], 0.3)];
      ctx.fillStyle = css(paper); ctx.fillRect(0, 0, W, H);

      const x0 = 8 * u, x1 = W - 8 * u, top = 8 * u, bottom = H * 0.68, r = (x1 - x0) / 2;
      const arch = () => {
        ctx.beginPath();
        ctx.moveTo(x0, bottom);
        ctx.lineTo(x0, top + r);
        ctx.arc(W / 2, top + r, r, Math.PI, 0);
        ctx.lineTo(x1, bottom);
        ctx.closePath();
      };
      ctx.save();
      arch(); ctx.clip();
      ctx.drawImage(screenprint(cropCanvas(d.frame, x1 - x0, bottom - top, d.look), inks), x0, top);
      ctx.restore();
      ctx.strokeStyle = css(ink); ctx.lineWidth = 0.7 * u;
      arch(); ctx.stroke();

      ctx.fillStyle = css(ink);
      const t = titleLayout(ctx, d.title, F.retro, {}, x1 - x0, H - bottom - 20 * u, 2, 1.05, 15 * u);
      t.lines.forEach((l, i) => put(ctx, l, W / 2, bottom + 4 * u + t.px * 0.9 + i * t.px * 1.05, 'center'));
      const sy = bottom + 4 * u + t.px * 0.9 + (t.lines.length - 1) * t.px * 1.05 + 6 * u;
      if (d.subtitle) {
        ctx.fillStyle = css(darkAtMost(d.accent, 0.42));
        fit(ctx, d.subtitle.toUpperCase(), F.heavy, x1 - x0, 2.4 * u, { spacing: 0.24 });
        put(ctx, d.subtitle.toUpperCase(), W / 2, sy, 'center');
      }
      ctx.fillStyle = css(ink, 0.75);
      setFont(ctx, 1.7 * u, F.mono, { spacing: 0.08 });
      put(ctx, (d.line ? wrap(ctx, d.line.toUpperCase(), x1 - x0, 1)[0] : tc(d.frame.t, true)), W / 2, H - 5 * u, 'center');
      grain(ctx, W, H, 0.28);
    },
  };

  T.halbton = {
    name: 'Halbton', about: 'Pop-Art aus Rasterpunkten in einer Druckfarbe',
    render(ctx, d) {
      const { W, H, u } = d;
      const bg = withL(d.accent, 0.62, 0.55), ink = [24, 20, 26];
      ctx.fillStyle = css(bg); ctx.fillRect(0, 0, W, H);
      const cols = 96, rows = Math.round(cols * H / W);
      const src = cropCanvas(d.frame, cols, rows, d.look);
      const px = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cols, rows).data;
      const [lo, hi] = levels(px);
      const g = W / 84, ang = Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
      const R = Math.hypot(W, H);
      ctx.fillStyle = css(ink);
      ctx.beginPath();
      for (let i = -R / g; i < R / g; i++) {
        for (let j = -R / g; j < R / g; j++) {
          const x = W / 2 + (i * ca - j * sa) * g, y = H / 2 + (i * sa + j * ca) * g;
          if (x < -g || y < -g || x > W + g || y > H + g) continue;
          const sx = clamp(Math.floor(x / W * cols), 0, cols - 1), sy = clamp(Math.floor(y / H * rows), 0, rows - 1);
          const p = (sy * cols + sx) * 4;
          const l = clamp(((px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) / 256 - lo) / (hi - lo), 0, 1);
          const rad = g * 0.66 * Math.sqrt(1 - l);
          if (rad < g * 0.05) continue;
          ctx.moveTo(x + rad, y);
          ctx.arc(x, y, rad, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      if (d.subtitle) {
        setFont(ctx, 2.2 * u, F.sans, { weight: 600, spacing: 0.14 });
        const s = wrap(ctx, d.subtitle.toUpperCase(), W * 0.7, 1)[0];
        const w = tw(ctx, s);
        ctx.fillStyle = css(ink); ctx.fillRect(5 * u, 5 * u, w + 3 * u, 4.4 * u);
        ctx.fillStyle = css(bg); put(ctx, s, 6.5 * u, 8 * u);
      }
      const t = titleLayout(ctx, d.title.toUpperCase(), F.heavy, { spacing: -0.01 }, W - 12 * u, 34 * u, 3, 0.96, 16 * u);
      const base = H - 7 * u;
      t.lines.forEach((l, i) => {
        const y = base - (t.lines.length - 1 - i) * t.px * 0.96;
        ctx.fillStyle = css(ink); put(ctx, l, 6 * u + t.px * 0.07, y + t.px * 0.07);
        ctx.fillStyle = '#fffdf7'; put(ctx, l, 6 * u, y);
      });
    },
  };

  T.minimal = {
    name: 'Minimal', about: 'Eine Farbfläche, ein runder Ausschnitt, viel Ruhe',
    render(ctx, d) {
      const { W, H, u } = d;
      const [h, s, l] = toHsl(dominant(d.pal));
      const bg = fromHsl(h, Math.min(s, 0.5), clamp(l, 0.16, 0.86));
      const fg = onColor(bg);
      ctx.fillStyle = css(bg); ctx.fillRect(0, 0, W, H);
      const D = 62 * u, cx = W / 2, cy = Math.max(D / 2 + 12 * u, H * 0.38);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, Math.PI * 2); ctx.clip();
      drawImg(ctx, d.frame, cx - D / 2, cy - D / 2, D, D, d.look);
      ctx.restore();
      ctx.fillStyle = css(fg);
      const ty = cy + D / 2 + 11 * u;
      fit(ctx, d.title.toUpperCase(), F.sans, W - 20 * u, 3.6 * u, { weight: 600, spacing: 0.36 });
      put(ctx, d.title.toUpperCase(), W / 2, ty, 'center');
      if (d.subtitle) {
        ctx.fillStyle = css(fg, 0.75);
        fit(ctx, d.subtitle, F.serif, W - 20 * u, 3.2 * u, { italic: true });
        put(ctx, d.subtitle, W / 2, ty + 5.4 * u, 'center');
      }
      ctx.fillStyle = css(fg, 0.85);
      setFont(ctx, 9 * u, F.serif);
      put(ctx, tc(d.frame.t), W / 2, H - 9 * u, 'center');
      ctx.fillStyle = css(fg, 0.55);
      setFont(ctx, 1.5 * u, F.mono, { spacing: 0.2 });
      put(ctx, 'STANDBILD', W / 2, H - 9 * u - 9.5 * u, 'center');
    },
  };

  T.barcode = {
    name: 'Filmbarcode', about: 'Das ganze Video als Farbstreifen, Schnitte markiert',
    frames: 0,
    render(ctx, d) {
      const { W, H, u, a } = d, m = 7 * u;
      const bg = [15, 15, 17], fg = [240, 238, 234];
      ctx.fillStyle = css(bg); ctx.fillRect(0, 0, W, H);
      const n = a.samples.length, rows = a.samples[0].rows.length / 3;
      const tiny = S.canvas(n, rows), tx = tiny.getContext('2d'), id = tx.createImageData(n, rows);
      a.samples.forEach((s, i) => {
        for (let r = 0; r < rows; r++) {
          const p = (r * n + i) * 4;
          id.data[p] = s.rows[r * 3]; id.data[p + 1] = s.rows[r * 3 + 1]; id.data[p + 2] = s.rows[r * 3 + 2]; id.data[p + 3] = 255;
        }
      });
      tx.putImageData(id, 0, 0);
      const ax = m, ay = 13 * u, aw = W - 2 * m, ah = H * 0.6;
      const tall = S.canvas(n, Math.max(2, Math.round(ah / 2)));
      const tl = tall.getContext('2d');
      tl.imageSmoothingEnabled = true; tl.imageSmoothingQuality = 'high';
      tl.drawImage(tiny, 0, 0, n, tall.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tall, ax, ay, aw, ah);
      ctx.imageSmoothingEnabled = true;

      ctx.fillStyle = css(fg, 0.6);
      setFont(ctx, 1.6 * u, F.mono, { spacing: 0.08 });
      put(ctx, 'FILMBARCODE', m, ay - 3 * u);
      put(ctx, `1 STREIFEN = ${num(a.duration / n, 2)} S`, W - m, ay - 3 * u, 'right');
      // Szenenschnitte und Zeitachse
      ctx.fillStyle = css(fg, 0.75);
      for (const sc of a.scenes) {
        const x = ax + sc.start / a.duration * aw;
        ctx.fillRect(x - 0.1 * u, ay + ah + 0.8 * u, 0.2 * u, 1.6 * u);
      }
      setFont(ctx, 1.5 * u, F.mono);
      ctx.fillStyle = css(fg, 0.6);
      for (let k = 0; k <= 4; k++) put(ctx, tc(a.duration * k / 4), ax + aw * k / 4, ay + ah + 5 * u, k === 0 ? 'left' : k === 4 ? 'right' : 'center');

      const ty = ay + ah + 15 * u;
      ctx.fillStyle = css(fg);
      const t = titleLayout(ctx, d.title, F.heavy, { spacing: -0.01 }, aw, H - ty - 12 * u, 2, 1, 11 * u);
      t.lines.forEach((l, i) => put(ctx, l, m - 0.3 * u, ty + t.px * 0.78 + i * t.px));
      let y = ty + t.px * 0.78 + (t.lines.length - 1) * t.px + 5 * u;
      if (d.subtitle) {
        ctx.fillStyle = css(fg, 0.8);
        setFont(ctx, 3.2 * u, F.serif, { italic: true });
        put(ctx, wrap(ctx, d.subtitle, aw, 1)[0], m, y);
        y += 4.2 * u;
      }
      ctx.fillStyle = css(fg, 0.55);
      setFont(ctx, 1.6 * u, F.mono, { spacing: 0.04 });
      put(ctx, `${n} BILDER · ${a.scenes.length} SZENEN · ${a.blackCount} SCHWARZBILDER · ${tc(a.duration)}`, m, H - m + 2 * u);
    },
  };

  S.templates = T;
  S.templateOrder = ['kino', 'magazin', 'duotone', 'raster', 'galerie', 'palette', 'film', 'kontakt', 'siebdruck', 'halbton', 'minimal', 'barcode'];

  // ---------- Formate ----------

  S.formats = {
    poster: { name: 'Poster 2:3', ratio: 2 / 3, export: [2400, 3600] },
    din: { name: 'DIN A', ratio: 1 / Math.SQRT2, export: [2480, 3508] },
    insta: { name: 'Insta 4:5', ratio: 4 / 5, export: [2160, 2700] },
    story: { name: 'Story 9:16', ratio: 9 / 16, export: [2160, 3840] },
  };

  // Welche Bilder eine Vorlage nutzt
  S.framesFor = function (a, tpl, frameIdx) {
    const T0 = T[tpl], main = a.keyframes[frameIdx] || a.keyframes[0];
    if (T0.frames === 'all') return a.timeline.slice();
    if (T0.frames === 3) {
      const others = a.keyframes.filter(f => f !== main);
      // zwei weitere Bilder: zeitlich möglichst weit vom Hauptbild und voneinander entfernt
      const pick = [], gap = a.duration / 8;
      for (const f of others.slice().sort((x, y) => y.score - x.score)) {
        if (pick.length >= 2) break;
        if (Math.abs(f.t - main.t) > gap && pick.every(p => Math.abs(p.t - f.t) > gap)) pick.push(f);
      }
      for (const f of others) if (pick.length < 2 && !pick.includes(f)) pick.push(f);
      return [main].concat(pick);
    }
    return [main];
  };

  // Ein Poster rendern. poster = {tpl, frame, focus, zoom, title, subtitle, line, accent}
  S.render = function (cv, a, poster, text, format) {
    const fmt = S.formats[format] || S.formats.poster;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const frames = S.framesFor(a, poster.tpl, poster.frame);
    const frame = frames.find(f => f === a.keyframes[poster.frame]) || frames[0] || a.keyframes[0];
    const pal = frame.palette.length ? frame.palette : a.palette;
    const d = {
      W, H, u: W / 100, a, frames, frame, pal, gpal: a.palette,
      look: { focus: poster.focus || null, zoom: poster.zoom || 1 },
      title: (poster.title ?? text.title) || 'Ohne Titel',
      subtitle: poster.subtitle ?? text.subtitle ?? '',
      line: poster.line ?? text.line ?? '',
      accent: poster.accent || vivid(pal),
      num: (frame.rank ?? 0) + 1, total: a.keyframes.length, ratio: fmt.ratio,
    };
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    S.lastMain = null;
    T[poster.tpl].render(ctx, d);
    ctx.restore();
    d.main = S.lastMain;
    return d;
  };

  // Startauswahl: zu jeder Vorlage das passendste Bild
  S.suggest = function (a) {
    const K = a.keyframes, n = K.length;
    const used = new Map();
    const by = (fn, avoid) => {
      const order = K.map((f, i) => i).sort((x, y) => fn(K[y]) - fn(K[x]));
      return order.find(i => (used.get(i) || 0) < (avoid || 1)) ?? order[0];
    };
    const take = (tpl, i) => { used.set(i, (used.get(i) || 0) + 1); return { tpl, frame: i }; };
    const list = [];
    list.push(take('kino', 0));
    list.push(take('magazin', n > 1 ? 1 : 0));
    list.push(take('duotone', by(f => f.score + f.stats.std / 120)));
    list.push(take('galerie', by(f => f.stats.colorful)));
    list.push(take('raster', by(f => f.score)));
    list.push(take('palette', by(f => f.palette.length + f.stats.colorful / 100, 2)));
    list.push(take('film', 0));
    list.push(take('kontakt', 0));
    list.push(take('siebdruck', by(f => f.score + f.stats.warmth, 2)));
    list.push(take('halbton', by(f => f.score + f.stats.std / 80, 2)));
    list.push(take('minimal', by(f => -Math.abs(f.stats.mean - 120), 2)));
    list.push(take('barcode', 0));
    return list;
  };
})();

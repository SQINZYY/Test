// PNG lesen/schreiben und TGA lesen – ohne Canvas, damit es überall (auch in Tests mit Node) läuft.
import { unzlibSync, zlibSync } from 'fflate';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(b) {
  if (!b || b.length < 24) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) return false;
  return true;
}

/** Breite/Höhe direkt aus dem PNG-Kopf, ohne das Bild zu entpacken. */
export function pngSize(b) {
  if (!isPng(b)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20), colorType: b[25] };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Liefert { width, height, data: RGBA Uint8Array }. */
export function decodePng(bytes) {
  if (!isPng(bytes)) throw new Error('kein PNG');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= bytes.length) {
    const len = v.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = v.getUint32(pos + 8);
      height = v.getUint32(pos + 12);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height || width * height > 64 * 1024 * 1024) throw new Error('ungültige Bildgröße');
  let total = 0;
  for (const d of idat) total += d.length;
  const comp = new Uint8Array(total);
  let o = 0;
  for (const d of idat) {
    comp.set(d, o);
    o += d.length;
  }
  const raw = unzlibSync(comp);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error('unbekannter PNG-Farbtyp');
  const bitsPP = channels * depth;
  const bpp = Math.max(1, bitsPP >> 3);
  const out = new Uint8Array(width * height * 4);

  // tRNS für Grau/RGB: eine Farbe ist durchsichtig
  let trGray = -1, trR = -1, trG = -1, trB = -1;
  if (trns && ctype === 0 && trns.length >= 2) trGray = (trns[0] << 8) | trns[1];
  if (trns && ctype === 2 && trns.length >= 6) {
    trR = (trns[0] << 8) | trns[1];
    trG = (trns[2] << 8) | trns[3];
    trB = (trns[4] << 8) | trns[5];
  }
  const maxv = (1 << depth) - 1;

  let rp = 0;
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = width > x0 ? Math.ceil((width - x0) / dx) : 0;
    const ph = height > y0 ? Math.ceil((height - y0) / dy) : 0;
    if (!pw || !ph) continue;
    const rowBytes = Math.ceil((pw * bitsPP) / 8);
    let prev = new Uint8Array(rowBytes);
    let cur = new Uint8Array(rowBytes);
    for (let y = 0; y < ph; y++) {
      const ft = raw[rp++];
      for (let i = 0; i < rowBytes; i++) {
        const x = raw[rp + i];
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let val;
        switch (ft) {
          case 0: val = x; break;
          case 1: val = x + a; break;
          case 2: val = x + b; break;
          case 3: val = x + ((a + b) >> 1); break;
          case 4: val = x + paeth(a, b, c); break;
          default: throw new Error('ungültiger PNG-Filter');
        }
        cur[i] = val & 0xff;
      }
      rp += rowBytes;
      const oy = y0 + y * dy;
      for (let x = 0; x < pw; x++) {
        const ox = x0 + x * dx;
        const di = (oy * width + ox) * 4;
        // Kanalwerte lesen
        const sample = (ch) => {
          if (depth === 8) return cur[x * channels + ch];
          if (depth === 16) return cur[(x * channels + ch) * 2];
          const bit = (x * channels + ch) * depth;
          const byte = cur[bit >> 3];
          const shift = 8 - depth - (bit & 7);
          return (byte >> shift) & maxv;
        };
        const sample16 = (ch) => (depth === 16 ? (cur[(x * channels + ch) * 2] << 8) | cur[(x * channels + ch) * 2 + 1] : sample(ch));
        if (ctype === 3) {
          const idx = sample(0);
          out[di] = palette ? palette[idx * 3] : 0;
          out[di + 1] = palette ? palette[idx * 3 + 1] : 0;
          out[di + 2] = palette ? palette[idx * 3 + 2] : 0;
          out[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
        } else if (ctype === 0) {
          const g = depth < 8 ? Math.round((sample(0) * 255) / maxv) : sample(0);
          out[di] = out[di + 1] = out[di + 2] = g;
          out[di + 3] = trGray >= 0 && sample16(0) === trGray ? 0 : 255;
        } else if (ctype === 4) {
          out[di] = out[di + 1] = out[di + 2] = sample(0);
          out[di + 3] = sample(1);
        } else if (ctype === 2) {
          out[di] = sample(0);
          out[di + 1] = sample(1);
          out[di + 2] = sample(2);
          out[di + 3] = trR >= 0 && sample16(0) === trR && sample16(1) === trG && sample16(2) === trB ? 0 : 255;
        } else {
          out[di] = sample(0);
          out[di + 1] = sample(1);
          out[di + 2] = sample(2);
          out[di + 3] = sample(3);
        }
      }
      const t = prev;
      prev = cur;
      cur = t;
    }
  }
  return { width, height, data: out };
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** RGBA-Bild zu PNG (8 Bit RGBA, je Zeile der kleinste Filter). */
export function encodePng(img) {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = up ? up[i] : 0;
        const cc = up && i >= 4 ? up[i - 4] : 0;
        let val;
        if (f === 0) val = row[i];
        else if (f === 1) val = row[i] - a;
        else if (f === 2) val = row[i] - b;
        else if (f === 3) val = row[i] - ((a + b) >> 1);
        else val = row[i] - paeth(a, b, cc);
        val &= 0xff;
        c[i] = val;
        sum += val < 128 ? val : 256 - val;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))];
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** TGA (unkomprimiert oder RLE, Farbe/Grau/Palette) zu RGBA. Bedrock nutzt TGA für Texturen mit Alphakanal. */
export function decodeTga(bytes) {
  if (bytes.length < 18) throw new Error('TGA zu kurz');
  const idLen = bytes[0];
  const cmapType = bytes[1];
  const type = bytes[2];
  const cmapStart = bytes[3] | (bytes[4] << 8);
  const cmapLen = bytes[5] | (bytes[6] << 8);
  const cmapDepth = bytes[7];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const desc = bytes[17];
  if (![1, 2, 3, 9, 10, 11].includes(type)) throw new Error('TGA-Typ wird nicht unterstützt');
  if (!width || !height) throw new Error('ungültige Bildgröße');
  let p = 18 + idLen;
  let cmap = null;
  const cBytes = Math.ceil(cmapDepth / 8);
  if (cmapType === 1) {
    cmap = bytes.subarray(p, p + cmapLen * cBytes);
    p += cmapLen * cBytes;
  }
  const pxBytes = Math.ceil(depth / 8);
  const rle = type >= 9;
  const n = width * height;
  const out = new Uint8Array(n * 4);

  const readColor = (src, i, bpx, target, ti) => {
    if (bpx === 4) {
      target[ti] = src[i + 2];
      target[ti + 1] = src[i + 1];
      target[ti + 2] = src[i];
      target[ti + 3] = src[i + 3];
    } else if (bpx === 3) {
      target[ti] = src[i + 2];
      target[ti + 1] = src[i + 1];
      target[ti + 2] = src[i];
      target[ti + 3] = 255;
    } else if (bpx === 2) {
      const v = src[i] | (src[i + 1] << 8);
      target[ti] = (((v >> 10) & 31) * 255) / 31;
      target[ti + 1] = (((v >> 5) & 31) * 255) / 31;
      target[ti + 2] = ((v & 31) * 255) / 31;
      target[ti + 3] = 255;
    } else {
      target[ti] = target[ti + 1] = target[ti + 2] = src[i];
      target[ti + 3] = 255;
    }
  };
  const pixel = (i, ti) => {
    if (type === 1 || type === 9) {
      const idx = (pxBytes === 2 ? bytes[i] | (bytes[i + 1] << 8) : bytes[i]) - cmapStart;
      if (cmap && idx >= 0 && idx < cmapLen) readColor(cmap, idx * cBytes, cBytes, out, ti);
    } else readColor(bytes, i, pxBytes, out, ti);
  };

  let k = 0;
  if (!rle) {
    if (p + n * pxBytes > bytes.length) throw new Error('TGA unvollständig');
    for (; k < n; k++) pixel(p + k * pxBytes, k * 4);
  } else {
    while (k < n && p < bytes.length) {
      const h = bytes[p++];
      const count = (h & 0x7f) + 1;
      if (h & 0x80) {
        pixel(p, k * 4);
        for (let j = 1; j < count && k + j < n; j++) out.copyWithin((k + j) * 4, k * 4, k * 4 + 4);
        p += pxBytes;
      } else {
        for (let j = 0; j < count && k + j < n; j++) pixel(p + j * pxBytes, (k + j) * 4);
        p += count * pxBytes;
      }
      k += count;
    }
  }
  // Ursprung: Bit 5 = oben, sonst unten -> bei Bedarf spiegeln; Bit 4 = rechts
  const img = { width, height, data: out };
  if (!(desc & 0x20)) flipY(img);
  if (desc & 0x10) flipX(img);
  return img;
}

function flipY(img) {
  const { width, height, data } = img;
  const stride = width * 4;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < height >> 1; y++) {
    const a = y * stride;
    const b = (height - 1 - y) * stride;
    tmp.set(data.subarray(a, a + stride));
    data.copyWithin(a, b, b + stride);
    data.set(tmp, b);
  }
}

function flipX(img) {
  const { width, height, data } = img;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width >> 1; x++) {
      const a = (y * width + x) * 4;
      const b = (y * width + width - 1 - x) * 4;
      for (let c = 0; c < 4; c++) {
        const t = data[a + c];
        data[a + c] = data[b + c];
        data[b + c] = t;
      }
    }
  }
}

/** Liest PNG oder TGA. */
export function decodeImage(bytes, ext) {
  if (isPng(bytes)) return decodePng(bytes);
  if (ext === 'tga') return decodeTga(bytes);
  throw new Error('Bildformat wird nicht unterstützt');
}

export function createImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function crop(img, x, y, w, h) {
  const out = createImage(w, h);
  for (let r = 0; r < h; r++) {
    const sy = y + r;
    if (sy < 0 || sy >= img.height) continue;
    for (let c = 0; c < w; c++) {
      const sx = x + c;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (r * w + c) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** Kopiert einen Bereich (optional horizontal gespiegelt) in ein anderes Bild. */
export function blit(src, sx, sy, w, h, dst, dx, dy, mirror = false) {
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const si = ((sy + r) * src.width + (sx + (mirror ? w - 1 - c : c))) * 4;
      const di = ((dy + r) * dst.width + (dx + c)) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

/** Graues Bild einfärben (wie Minecraft Gras/Laub mit der Biomfarbe färbt). */
export function tint(img, [r, g, b]) {
  const out = createImage(img.width, img.height);
  const s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = (s[i] * r) / 255;
    d[i + 1] = (s[i + 1] * g) / 255;
    d[i + 2] = (s[i + 2] * b) / 255;
    d[i + 3] = s[i + 3];
  }
  return out;
}

/** Durchsichtige Pixel mit einer dunklen Farbe füllen (Laub bei "schnellen" Grafikeinstellungen). */
export function makeOpaque(img, fill = [48, 48, 48]) {
  const out = createImage(img.width, img.height);
  const s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    if (s[i + 3] < 128) {
      d[i] = fill[0];
      d[i + 1] = fill[1];
      d[i + 2] = fill[2];
    } else {
      d[i] = s[i];
      d[i + 1] = s[i + 1];
      d[i + 2] = s[i + 2];
    }
    d[i + 3] = 255;
  }
  return out;
}

/** 'opaque' | 'cutout' (nur ganz/gar nicht durchsichtig) | 'translucent' */
export function alphaKind(img) {
  let cut = false;
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a === 255) continue;
    if (a === 0) cut = true;
    else if (a > 8 && a < 247) return 'translucent';
    else cut = true;
  }
  return cut ? 'cutout' : 'opaque';
}

/** Verkleinert um einen ganzzahligen Faktor (Mittelwert der Pixel). */
export function downscale(img, factor) {
  const w = Math.floor(img.width / factor), h = Math.floor(img.height / factor);
  const out = createImage(w, h);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, wa = 0;
      for (let j = 0; j < factor; j++) {
        for (let i = 0; i < factor; i++) {
          const si = ((y * factor + j) * img.width + x * factor + i) * 4;
          const al = img.data[si + 3];
          r += img.data[si] * al;
          g += img.data[si + 1] * al;
          b += img.data[si + 2] * al;
          a += al;
          wa += al;
        }
      }
      const di = (y * w + x) * 4;
      if (wa) {
        out.data[di] = r / wa;
        out.data[di + 1] = g / wa;
        out.data[di + 2] = b / wa;
      }
      out.data[di + 3] = a / n;
    }
  }
  return out;
}

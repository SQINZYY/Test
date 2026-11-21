// Kleine Hilfsfunktionen, die überall gebraucht werden.

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function toText(bytes) {
  let s = decoder.decode(bytes);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export function toBytes(text) {
  return encoder.encode(text);
}

/** Entfernt // und /* *\/ Kommentare sowie Kommas vor } oder ] (Bedrock-JSON erlaubt beides). */
function relaxJson(src) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += src[i + 1] || '';
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** JSON lesen; verträgt Kommentare, BOM und überzählige Kommas. Gibt bei Fehlern null zurück. */
export function parseJson(input) {
  const text = typeof input === 'string' ? input : toText(input);
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(relaxJson(text));
    } catch {
      return null;
    }
  }
}

export function jsonBytes(obj) {
  return toBytes(JSON.stringify(obj, null, 2) + '\n');
}

export function uuid() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function basename(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

export function dirname(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
}

export function stripExt(p) {
  const i = p.lastIndexOf('.');
  const j = p.lastIndexOf('/');
  return i > j ? p.slice(0, i) : p;
}

/** "ruby_sword" -> "Ruby Sword" */
export function humanize(id) {
  return id
    .replace(/[_\-/.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

/** Bezeichner, wie Bedrock sie mag: klein, nur a-z 0-9 _ . - */
export function safeId(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'pack'
  );
}

/** Dateiname ohne Zeichen, die Windows oder Android nicht mögen. */
export function safeFileName(s) {
  return (
    String(s)
      .replace(/§./g, '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'BlockBridge'
  );
}

/** Text-Komponente (Java JSON-Text) zu einfachem Text mit §-Farbcodes. */
const COLOR_CODES = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
  dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f',
};

export function textComponentToString(c, keepColors = true) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'number' || typeof c === 'boolean') return String(c);
  if (Array.isArray(c)) return c.map((x) => textComponentToString(x, keepColors)).join('');
  let s = '';
  if (keepColors && c.color && COLOR_CODES[c.color]) s += '§' + COLOR_CODES[c.color];
  if (keepColors && c.bold) s += '§l';
  if (keepColors && c.italic) s += '§o';
  if (c.text != null) s += String(c.text);
  else if (c.translate) s += c.fallback || c.translate;
  if (c.extra) s += textComponentToString(c.extra, keepColors);
  return s;
}

export function stripFormatting(s) {
  return String(s || '').replace(/§./g, '');
}

export function concatBytes(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.', ',') + ' KB';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

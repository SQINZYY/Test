// ZIP lesen/schreiben (.zip, .jar, .mcpack, .mcaddon, .mcworld sind alles ZIP-Dateien).
import { unzipSync, zipSync } from 'fflate';
import { extname } from './util.js';

export function isZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5);
}

function cleanPath(p) {
  return p.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

function ignored(p) {
  return p.startsWith('__MACOSX/') || p.endsWith('/.DS_Store') || p === '.DS_Store' || p.endsWith('Thumbs.db');
}

/**
 * Liest ein ZIP in eine Map Pfad -> Bytes. Verschachtelte .mcpack/.zip-Dateien (typisch in .mcaddon)
 * werden als Ordner "<name>/" mit ausgepackt.
 */
export function readZip(bytes, { nested = true } = {}) {
  let raw;
  try {
    raw = unzipSync(bytes);
  } catch (e) {
    throw new Error('Die Datei ist kein lesbares ZIP-Archiv (' + (e && e.message ? e.message : e) + ').');
  }
  const files = new Map();
  for (const [name, data] of Object.entries(raw)) {
    const p = cleanPath(name);
    if (!p || p.endsWith('/') || ignored(p)) continue;
    const ext = extname(p);
    if (nested && (ext === 'mcpack' || (ext === 'zip' && !p.includes('/'))) && isZip(data)) {
      try {
        const inner = readZip(data, { nested: false });
        const prefix = p.replace(/\.(mcpack|zip)$/i, '') + '/';
        for (const [q, d] of inner) files.set(prefix + q, d);
        continue;
      } catch {
        /* kein gültiges ZIP – als normale Datei behalten */
      }
    }
    files.set(p, data);
  }
  return files;
}

const STORED = new Set(['png', 'ogg', 'jpg', 'jpeg', 'zip', 'mcpack', 'fsb']);

/** Map/Objekt Pfad -> Bytes zu ZIP. Bereits komprimierte Formate werden nur gespeichert. */
export function writeZip(entries) {
  const obj = {};
  const list = entries instanceof Map ? [...entries] : Object.entries(entries);
  list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [p, data] of list) {
    obj[p] = [data, { level: STORED.has(extname(p)) ? 0 : 6, mtime: new Date(2026, 0, 1) }];
  }
  return zipSync(obj);
}

/** Unterordner als eigene Map (Präfix wird entfernt). */
export function subTree(files, prefix) {
  if (!prefix) return files;
  const p = prefix.endsWith('/') ? prefix : prefix + '/';
  const out = new Map();
  for (const [k, v] of files) if (k.startsWith(p)) out.set(k.slice(p.length), v);
  return out;
}

/** Alle Ordner, in denen eine Datei mit diesem Namen liegt (flachste zuerst). */
export function findDirsWith(files, fileName) {
  const dirs = [];
  for (const k of files.keys()) {
    if (k === fileName) dirs.push('');
    else if (k.endsWith('/' + fileName)) dirs.push(k.slice(0, -fileName.length - 1));
  }
  dirs.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  return dirs;
}

// Verbindung zur Android-Hülle (window.Android). Im normalen Browser gibt es Ersatzwege,
// damit sich die Oberfläche auch am PC testen lässt.
import { h, uid, sleep } from './util.js';

const A = window.Android || null;
export const isNative = !!A;

const callbacks = new Map();
const importHandlers = new Map();
const pauseHandlers = new Set();
let sharedHandler = null;
let sharedPending = 0;

window.NativeBus = {
  callback(id, result) {
    const f = callbacks.get(id);
    callbacks.delete(id);
    if (f) f(result);
  },
  importEvent(id, type, data) {
    const f = importHandlers.get(id);
    if (f) f(type, data);
  },
  shared(count) {
    if (sharedHandler) sharedHandler(count);
    else sharedPending = count;
  },
  pause() {
    for (const f of pauseHandlers) f();
  },
};

export function onAppPause(f) {
  pauseHandlers.add(f);
  return () => pauseHandlers.delete(f);
}

export function onShared(f) {
  sharedHandler = f;
  if (sharedPending) {
    const n = sharedPending;
    sharedPending = 0;
    f(n);
  }
}

export function discardShared() {
  if (A) A.discardShared();
}

function call(fn) {
  return new Promise((resolve) => {
    const id = uid();
    callbacks.set(id, resolve);
    fn(id);
  });
}

export function nativeInfo() {
  try {
    return A ? JSON.parse(A.info()) : null;
  } catch {
    return null;
  }
}

export function keepScreenOn(on) {
  if (A) A.keepScreenOn(!!on);
}

export function exitApp() {
  if (A) A.exit();
}

// ---------- Bilder holen ----------

const MAX_SIDE = 2400;
const THUMB_SIDE = 400;

/**
 * Lässt Bilder auswählen. Liefert eine Liste von { blob, thumb, w, h, date, name }.
 * onProgress(done, total) meldet den Fortschritt beim Einlesen.
 */
export function pickImages({ multiple = true, onProgress } = {}) {
  if (A) return nativeImport((id) => A.pickImages(id, multiple), onProgress);
  return browserPick(multiple, onProgress);
}

/** Übernimmt die Bilder, die per „Teilen“ an die App geschickt wurden. */
export function takeSharedImages({ onProgress } = {}) {
  return nativeImport((id) => A.takeShared(id), onProgress);
}

function nativeImport(start, onProgress) {
  return new Promise((resolve) => {
    const id = uid();
    const items = [];
    const errors = [];
    let total = 0;
    let done = 0;
    const jobs = [];
    importHandlers.set(id, (type, data) => {
      if (type === 'start') {
        total = data.total;
        if (total && onProgress) onProgress(0, total);
      } else if (type === 'item') {
        if (data.error) {
          errors.push(data.error);
          done++;
          onProgress && onProgress(done, total);
          return;
        }
        jobs.push((async () => {
          try {
            const [blob, thumb] = await Promise.all([fetchBlob(data.url), fetchBlob(data.thumb)]);
            items[data.index] = { blob, thumb, w: data.w, h: data.h, date: data.date || 0, name: data.name || 'Bild' };
          } catch (e) {
            errors.push(String(e));
          }
          done++;
          onProgress && onProgress(done, total);
        })());
      } else if (type === 'done') {
        importHandlers.delete(id);
        Promise.all(jobs).then(() => {
          if (total) A.clearImports();
          const list = items.filter(Boolean);
          list.errors = errors;
          resolve(list);
        });
      }
    });
    start(id);
  });
}

async function fetchBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Bild nicht gefunden');
  return r.blob();
}

function browserPick(multiple, onProgress) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple, style: { display: 'none' } });
    let settled = false;
    input.addEventListener('change', async () => {
      settled = true;
      const files = [...input.files];
      input.remove();
      resolve(await importFiles(files, onProgress));
    });
    input.addEventListener('cancel', () => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve([]);
    });
    document.body.append(input);
    input.click();
  });
}

/** Bilder im Browser einlesen: verkleinern, Vorschaubild erzeugen. */
export async function importFiles(files, onProgress) {
  const list = [];
  const errors = [];
  onProgress && onProgress(0, files.length);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const bmp = await createImageBitmap(f);
      const full = await scaleToBlob(bmp, MAX_SIDE, 0.9);
      const thumb = await scaleToBlob(bmp, THUMB_SIDE, 0.82);
      list.push({ blob: full.blob, thumb: thumb.blob, w: full.w, h: full.h, date: f.lastModified || 0, name: f.name });
      bmp.close && bmp.close();
    } catch (e) {
      errors.push(f.name);
    }
    onProgress && onProgress(i + 1, files.length);
    await sleep(0);
  }
  list.errors = errors;
  return list;
}

async function scaleToBlob(src, max, quality) {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s));
  const hh = Math.max(1, Math.round(src.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(src, 0, 0, w, hh);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  return { blob, w, h: hh };
}

/** Eine Musikdatei auswählen (öffnet unter Android die Dateiauswahl für Audio). */
export function pickAudio() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
    let settled = false;
    input.addEventListener('change', () => {
      settled = true;
      const f = input.files[0] || null;
      input.remove();
      resolve(f);
    });
    input.addEventListener('cancel', () => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(null);
    });
    document.body.append(input);
    input.click();
  });
}

// ---------- Ausgabedateien ----------

function toBase64(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

const WRITE_CHUNK = 768 * 1024;

/**
 * Datei, in die stückweise geschrieben wird. Unter Android landet sie direkt auf dem Speicher
 * (kein großer Puffer im Arbeitsspeicher), im Browser wird sie im Speicher zusammengesetzt.
 */
export function createSink(name) {
  if (A) {
    const id = A.fileOpen(name);
    if (!id) throw new Error('Datei konnte nicht angelegt werden');
    let pos = 0;
    const write = (u8, at) => {
      for (let i = 0; i < u8.length; i += WRITE_CHUNK) {
        const part = u8.subarray(i, Math.min(u8.length, i + WRITE_CHUNK));
        if (!A.fileWrite(id, toBase64(part), at < 0 ? -1 : at + i)) throw new Error('Schreiben fehlgeschlagen (Speicher voll?)');
      }
    };
    return {
      name,
      nativeId: id,
      writeAt(u8, at) {
        write(u8, at);
        pos = Math.max(pos, at + u8.length);
      },
      append(u8) {
        write(u8, -1);
        pos += u8.length;
      },
      async close() {
        const size = A.fileClose(id);
        return { name, nativeId: id, size };
      },
      discard() {
        A.fileDelete(id);
      },
    };
  }
  const parts = [];
  let size = 0;
  let pos = 0;
  return {
    name,
    writeAt(u8, at) {
      parts.push({ at, data: u8.slice() });
      size = Math.max(size, at + u8.length);
    },
    append(u8) {
      parts.push({ at: pos, data: u8.slice() });
      pos += u8.length;
      size = Math.max(size, pos);
    },
    async close() {
      const all = new Uint8Array(size);
      for (const p of parts) all.set(p.data, p.at);
      parts.length = 0;
      return { name, blob: new Blob([all]), size };
    },
    discard() {
      parts.length = 0;
    },
  };
}

/** Fertige Datei (aus createSink().close() oder einem Blob) speichern, teilen, ansehen. */
export class Output {
  constructor(file, mime) {
    this.name = file.name;
    this.nativeId = file.nativeId || null;
    this.blob = file.blob ? new Blob([file.blob], { type: mime }) : null;
    this.size = file.size;
    this.mime = mime;
    this.url = this.nativeId ? '/out/' + encodeURIComponent(this.nativeId) : URL.createObjectURL(this.blob);
  }

  static async fromBlob(blob, name, mime) {
    if (!A) return new Output({ name, blob, size: blob.size }, mime);
    const sink = createSink(name);
    sink.append(new Uint8Array(await blob.arrayBuffer()));
    return new Output(await sink.close(), mime);
  }

  /** Speichert in der Galerie (Android) bzw. lädt herunter (Browser). Gibt den Ort zurück. */
  async save() {
    if (this.nativeId) {
      const r = await call((cb) => A.saveToGallery(this.nativeId, this.mime, this.name, cb));
      if (!r.ok) throw new Error(r.error || 'Speichern fehlgeschlagen');
      return r.where;
    }
    const a = h('a', { href: this.url, download: this.name });
    document.body.append(a);
    a.click();
    a.remove();
    return 'Downloads';
  }

  async share(text = '') {
    if (this.nativeId) {
      A.shareFile(this.nativeId, this.mime, text);
      return;
    }
    const file = new File([this.blob], this.name, { type: this.mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
    } else {
      await this.save();
    }
  }

  open() {
    if (this.nativeId) A.viewFile(this.nativeId, this.mime);
    else window.open(this.url, '_blank');
  }
}

/** Fügt eine AAC-Tonspur nativ an ein Video ohne Ton an (falls die WebView kein AAC kann). */
export function nativeMuxAudio(videoFile, pcmFile, sampleRate, channels, outFile) {
  return call((cb) => A.muxAudio(videoFile.nativeId, pcmFile.nativeId, sampleRate, channels, outFile.nativeId, cb));
}

export function deleteNativeFile(file) {
  if (A && file && file.nativeId) A.fileDelete(file.nativeId);
}

export const canMuxNatively = !!(A && A.muxAudio);

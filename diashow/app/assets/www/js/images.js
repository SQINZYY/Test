// Bildverwaltung: Blobs (in IndexedDB oder nur im Speicher), Vorschaubilder und ein kleiner
// Zwischenspeicher für dekodierte Bilder in voller Größe (nur wenige gleichzeitig, spart Speicher).
import { getBlob, putBlob } from './store.js';
import { uid } from './util.js';

const MAX_FULL = 5;

export class ImageStore {
  /** projectId = null: Bilder nur im Speicher (Collage, Editor, GIF). */
  constructor(projectId = null) {
    this.pid = projectId;
    this.mem = new Map();
    this.thumbs = new Map();
    this.full = new Map();
    this.lru = [];
    this.listeners = new Set();
  }

  key(kind, id) {
    return `${this.pid}/${kind}/${id}`;
  }

  /** Neues Bild aufnehmen ({ blob, thumb, w, h, date, name }). Gibt { id, meta } zurück. */
  async add(item) {
    const id = uid();
    if (this.pid) {
      await putBlob(this.key('img', id), item.blob);
      await putBlob(this.key('thumb', id), item.thumb);
    } else {
      this.mem.set(id, { blob: item.blob, thumb: item.thumb });
    }
    await this.setThumb(id, item.thumb);
    return { id, meta: { w: item.w, h: item.h, date: item.date || 0, name: item.name || '' } };
  }

  async setThumb(id, blob) {
    if (this.thumbs.has(id)) return;
    const bmp = await createImageBitmap(blob);
    this.thumbs.set(id, { bmp, url: URL.createObjectURL(blob) });
  }

  async loadThumbs(ids) {
    await Promise.all(ids.map(async (id) => {
      if (this.thumbs.has(id)) return;
      const blob = this.pid ? await getBlob(this.key('thumb', id)) : this.mem.get(id)?.thumb;
      if (blob) await this.setThumb(id, blob);
    }));
  }

  thumb(id) {
    return this.thumbs.get(id)?.bmp || null;
  }

  thumbUrl(id) {
    return this.thumbs.get(id)?.url || '';
  }

  async blob(id) {
    return this.pid ? getBlob(this.key('img', id)) : this.mem.get(id)?.blob;
  }

  /** Dekodiertes Bild in voller Größe: { bmp, blur }. */
  getFull(id) {
    let e = this.full.get(id);
    if (!e) {
      e = { value: null, promise: null };
      e.promise = (async () => {
        const blob = await this.blob(id);
        if (!blob) throw new Error('Bild fehlt');
        const bmp = await createImageBitmap(blob);
        e.value = { bmp, blur: makeBlur(bmp) };
        for (const f of this.listeners) f(id);
        return e.value;
      })();
      e.promise.catch(() => this.full.delete(id));
      this.full.set(id, e);
    }
    this.touch(id);
    return e.promise;
  }

  /** Sofort verfügbares Vollbild oder null (lädt dann im Hintergrund nach). */
  peekFull(id) {
    const e = this.full.get(id);
    if (e && e.value) {
      this.touch(id);
      return e.value;
    }
    this.getFull(id).catch(() => {});
    return null;
  }

  touch(id) {
    const i = this.lru.indexOf(id);
    if (i >= 0) this.lru.splice(i, 1);
    this.lru.push(id);
    while (this.lru.length > MAX_FULL) {
      const old = this.lru.shift();
      const e = this.full.get(old);
      this.full.delete(old);
      if (e && e.value) e.value.bmp.close && e.value.bmp.close();
      else if (e) e.promise.then((v) => v.bmp.close && v.bmp.close()).catch(() => {});
    }
  }

  onLoaded(f) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  remove(id) {
    const t = this.thumbs.get(id);
    if (t) {
      URL.revokeObjectURL(t.url);
      t.bmp.close && t.bmp.close();
      this.thumbs.delete(id);
    }
    this.mem.delete(id);
  }

  dispose() {
    for (const t of this.thumbs.values()) {
      URL.revokeObjectURL(t.url);
      t.bmp.close && t.bmp.close();
    }
    for (const e of this.full.values()) if (e.value) e.value.bmp.close && e.value.bmp.close();
    this.thumbs.clear();
    this.full.clear();
    this.mem.clear();
    this.lru = [];
    this.listeners.clear();
  }
}

/** Kleine, weichgezeichnete Fassung für den Hintergrund hinter hochkant/quer eingepassten Bildern. */
function makeBlur(bmp) {
  const s = 320 / Math.max(bmp.width, bmp.height);
  const w = Math.max(8, Math.round(bmp.width * s));
  const hh = Math.max(8, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(9px) saturate(1.2) brightness(0.78)';
  ctx.drawImage(bmp, -24, -24, w + 48, hh + 48);
  return c;
}

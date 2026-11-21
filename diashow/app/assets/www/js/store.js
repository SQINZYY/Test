// Speicher für Diashow-Projekte (IndexedDB): Projektdaten + Bilder/Musik als Blobs.
// Alles bleibt auf dem Gerät.

const DB_NAME = 'diashow-studio';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Speichern abgebrochen'));
  }));
}

export const putBlob = (key, blob) => tx('blobs', 'readwrite', (s) => s.put(blob, key));
export const getBlob = (key) => tx('blobs', 'readonly', (s) => s.get(key));
export const deleteBlob = (key) => tx('blobs', 'readwrite', (s) => s.delete(key));
export const deleteBlobs = (prefix) => tx('blobs', 'readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿')));

export const putProject = (p) => tx('projects', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(p))));
export const getProject = (id) => tx('projects', 'readonly', (s) => s.get(id));

export async function listProjects() {
  const all = (await tx('projects', 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function deleteProject(id) {
  await tx('projects', 'readwrite', (s) => s.delete(id));
  await deleteBlobs(id + '/');
}

/** Kopiert ein Projekt samt Bildern und Musik. */
export async function duplicateProject(p, newId, title) {
  const keys = [];
  for (const imgId of Object.keys(p.images || {})) keys.push(`img/${imgId}`, `thumb/${imgId}`);
  if (p.music) keys.push('music');
  for (const k of keys) {
    const b = await getBlob(`${p.id}/${k}`);
    if (b) await putBlob(`${newId}/${k}`, b);
  }
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = newId;
  copy.title = title;
  copy.created = copy.updated = Date.now();
  await putProject(copy);
  return copy;
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export function persist() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

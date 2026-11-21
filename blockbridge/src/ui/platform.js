// Speichern, Öffnen und Teilen – je nachdem, wo die Oberfläche läuft:
// Windows-App (WebView2, window.bbSave …), Android-App (WebView, window.Android) oder Browser.

const w = typeof window !== 'undefined' ? window : {};
const android = w.Android || null;
const windows = typeof w.bbSave === 'function';

export const platform = windows ? 'windows' : android ? 'android' : 'web';

export const can = {
  open: platform !== 'web',
  share: platform === 'android' || (platform === 'web' && typeof navigator !== 'undefined' && !!navigator.canShare),
};

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Antworten der App kommen über window.__bbDone(id, json)
const pending = new Map();
let seq = 0;
w.__bbDone = (id, json) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  try {
    p(JSON.parse(json));
  } catch {
    p({ ok: false, error: 'Unbekannte Antwort' });
  }
};

function nativeSend(action, name, bytes) {
  return new Promise((resolve) => {
    if (windows) {
      const id = 'w' + ++seq;
      pending.set(id, resolve);
      const fn = action === 'save' ? w.bbSave : w.bbOpen;
      Promise.resolve(fn(id, name, toBase64(bytes))).catch((e) => {
        pending.delete(id);
        resolve({ ok: false, error: String(e) });
      });
      return;
    }
    const id = android.outBegin(name, action);
    pending.set(id, resolve);
    const CH = 512 * 1024;
    for (let i = 0; i < bytes.length; i += CH) android.outChunk(id, toBase64(bytes.subarray(i, i + CH)));
    android.outFinish(id);
  });
}

/** -> { ok, path?, canceled?, error? } */
export async function saveFile(name, bytes, mime = 'application/octet-stream') {
  if (platform !== 'web') return nativeSend('save', name, bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { ok: true, path: null };
}

/** Datei mit Minecraft (bzw. dem zuständigen Programm) öffnen. */
export async function openFile(name, bytes) {
  if (platform !== 'web') return nativeSend('open', name, bytes);
  return { ok: false, error: 'Im Browser nicht möglich – bitte speichern und die Datei dann öffnen.' };
}

export async function shareFile(name, bytes, mime = 'application/octet-stream') {
  if (android) return nativeSend('share', name, bytes);
  try {
    const file = new File([bytes], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return { ok: true };
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, canceled: true };
  }
  return { ok: false, error: 'Teilen wird hier nicht unterstützt.' };
}

export function showInFolder(path) {
  if (windows && path) w.bbShowInFolder(path);
}

/** Dateien, die mit "Öffnen mit …" oder "Teilen" an die App geschickt wurden. cb([{ name, bytes }]) */
export function onIncomingFiles(cb) {
  if (windows) {
    Promise.resolve(w.bbStartupFiles())
      .then((files) => {
        if (files && files.length) cb(files.map((f) => ({ name: f.name, bytes: fromBase64(f.data) })));
      })
      .catch(() => {});
  }
  if (android) {
    const pull = () => {
      let list;
      try {
        list = JSON.parse(android.inInfo());
      } catch {
        return;
      }
      if (!list.length) return;
      const files = list.map((f, i) => {
        const bytes = new Uint8Array(f.size);
        const CH = 512 * 1024;
        for (let off = 0; off < f.size; off += CH) bytes.set(fromBase64(android.inChunk(i, off, CH)), off);
        return { name: f.name, bytes };
      });
      android.inClear();
      cb(files);
    };
    w.__bbIncoming = pull;
    pull();
  }
}

/** Version der App (falls in einer App) */
export async function appVersion() {
  try {
    if (windows) return await w.bbVersion();
    if (android && android.version) return android.version();
  } catch {
    /* egal */
  }
  return null;
}

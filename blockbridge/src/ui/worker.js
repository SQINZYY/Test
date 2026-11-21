// Läuft im Hintergrund-Thread, damit die Oberfläche bei großen Dateien nicht hängt.
import { analyze, convert } from '../core/index.js';

let current = null;

function publicInfo(a) {
  const { _ctx, ...rest } = a;
  return rest;
}

self.onmessage = (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'analyze') {
      current = analyze(payload.files);
      self.postMessage({ id, ok: true, result: publicInfo(current) });
    } else if (type === 'convert') {
      if (!current) throw new Error('Keine Datei geladen.');
      const r = convert(current, payload.target, payload.opts);
      self.postMessage({ id, ok: true, result: r }, [r.bytes.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};

// Führt Erkennen/Umwandeln im Web Worker aus; wenn Worker nicht gehen, direkt im Haupt-Thread.
import { analyze, convert } from '../core/index.js';

export function createEngine() {
  let worker = null;
  let seq = 0;
  const waiting = new Map();
  let inlineCurrent = null;
  let lastFiles = null;

  try {
    worker = new Worker('worker.js');
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.result);
      else w.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      // Worker lässt sich nicht laden -> ab jetzt ohne Worker arbeiten
      e.preventDefault && e.preventDefault();
      worker = null;
      for (const [, w] of waiting) w.fallback();
      waiting.clear();
    };
  } catch {
    worker = null;
  }

  const inline = (type, payload) => {
    if (type === 'analyze') {
      inlineCurrent = analyze(payload.files);
      const { _ctx, ...rest } = inlineCurrent;
      return rest;
    }
    if (!inlineCurrent && lastFiles) inlineCurrent = analyze(lastFiles);
    return convert(inlineCurrent, payload.target, payload.opts);
  };

  const call = (type, payload) =>
    new Promise((resolve, reject) => {
      const runInline = () => {
        // kurz warten, damit die Oberfläche "Bitte warten" zeichnen kann
        setTimeout(() => {
          try {
            resolve(inline(type, payload));
          } catch (err) {
            reject(err);
          }
        }, 30);
      };
      if (!worker) return runInline();
      const id = ++seq;
      waiting.set(id, { resolve, reject, fallback: runInline });
      worker.postMessage({ id, type, payload });
    });

  return {
    analyze(files) {
      lastFiles = files;
      inlineCurrent = null;
      // Kopien schicken, damit lastFiles für den Notfall erhalten bleibt
      return call('analyze', { files: files.map((f) => ({ name: f.name, bytes: f.bytes })) });
    },
    convert(target, opts) {
      return call('convert', { target, opts });
    },
  };
}

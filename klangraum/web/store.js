/* Zwischenspeicher für Bibliothek und Playlists (IndexedDB), damit die App sofort etwas anzeigt. */
(function (global) {
  'use strict';

  let dbPromise = null;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('klangraum', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function run(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  global.Store = {
    get: key => run('readonly', s => s.get(key)).catch(() => undefined),
    set: (key, value) => run('readwrite', s => s.put(value, key)).catch(() => undefined),
    del: key => run('readwrite', s => s.delete(key)).catch(() => undefined),
    clear: () => run('readwrite', s => s.clear()).catch(() => undefined),
  };
})(window);

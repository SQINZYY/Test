/* Deine Klangwelt-Bibliothek: Lieblingssongs, eigene Playlists, gespeicherte Alben, gefolgte Künstler,
 * zuletzt gehört und Einstellungen. Alles bleibt auf dem Gerät (localStorage) und lässt sich als Code übertragen. */
(function (global) {
  'use strict';

  const KEY = 'kw.library';
  const VERSION = 1;

  function blank() {
    return { v: VERSION, liked: [], playlists: [], albums: [], artists: [], recent: [], settings: { autoplay: true } };
  }

  function create(storage) {
    storage = storage || global.localStorage;
    let L = read();
    const listeners = new Set();

    function read() {
      try {
        const d = JSON.parse(storage.getItem(KEY) || 'null');
        if (d && d.v === VERSION) return Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings) });
      } catch (e) { /* kaputt oder leer */ }
      return blank();
    }

    function save(what) {
      try { storage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* Speicher voll */ }
      for (const fn of listeners) fn(what);
    }

    const now = () => Date.now();
    const newId = () => 'p' + now().toString(36) + Math.random().toString(36).slice(2, 6);

    const api = {
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      get data() { return L; },

      // Lieblingssongs (neueste zuerst)
      isLiked: id => L.liked.some(x => x.id === id),
      likedIds: () => L.liked.map(x => x.id),
      liked: () => L.liked,
      setLiked(id, on) {
        const has = L.liked.findIndex(x => x.id === id);
        if (on && has < 0) L.liked.unshift({ id, t: now() });
        if (!on && has >= 0) L.liked.splice(has, 1);
        save('liked');
        return on;
      },

      // Playlists
      playlists: () => L.playlists,
      playlist: id => L.playlists.find(p => p.id === id) || null,
      createPlaylist(name, ids) {
        const p = { id: newId(), name: String(name || '').trim() || 'Meine Playlist #' + (L.playlists.length + 1), desc: '', created: now(), tracks: (ids || []).map(id => ({ id, t: now() })) };
        L.playlists.unshift(p);
        save('playlists');
        return p;
      },
      renamePlaylist(id, name, desc) {
        const p = api.playlist(id);
        if (!p) return;
        if (name != null && String(name).trim()) p.name = String(name).trim();
        if (desc != null) p.desc = String(desc).trim();
        save('playlists');
      },
      deletePlaylist(id) {
        L.playlists = L.playlists.filter(p => p.id !== id);
        save('playlists');
      },
      /** Fügt Songs hinzu; Doppelte werden übersprungen. Gibt die Anzahl neuer Songs zurück. */
      addToPlaylist(id, ids) {
        const p = api.playlist(id);
        if (!p) return 0;
        const have = new Set(p.tracks.map(x => x.id));
        let added = 0;
        for (const tid of ids) if (!have.has(tid)) { p.tracks.push({ id: tid, t: now() }); have.add(tid); added++; }
        save('playlists');
        return added;
      },
      removeFromPlaylist(id, pos) {
        const p = api.playlist(id);
        if (!p || pos < 0 || pos >= p.tracks.length) return;
        p.tracks.splice(pos, 1);
        save('playlists');
      },
      movePlaylistTrack(id, from, to) {
        const p = api.playlist(id);
        if (!p || from === to || from < 0 || to < 0 || from >= p.tracks.length || to >= p.tracks.length) return;
        const [x] = p.tracks.splice(from, 1);
        p.tracks.splice(to, 0, x);
        save('playlists');
      },

      // Alben (Name + Hauptkünstler) und Künstler (Name)
      isAlbumSaved: (name, artist) => L.albums.some(a => a.name === name && a.artist === artist),
      toggleAlbum(name, artist) {
        const k = L.albums.findIndex(a => a.name === name && a.artist === artist);
        if (k >= 0) L.albums.splice(k, 1); else L.albums.unshift({ name, artist, t: now() });
        save('albums');
        return k < 0;
      },
      albums: () => L.albums,
      isFollowing: name => L.artists.some(a => a.name === name),
      toggleArtist(name) {
        const k = L.artists.findIndex(a => a.name === name);
        if (k >= 0) L.artists.splice(k, 1); else L.artists.unshift({ name, t: now() });
        save('artists');
        return k < 0;
      },
      artists: () => L.artists,

      // Zuletzt gehört: Songs und woher sie kamen (Playlist, Album, Mix …)
      addRecent(entry) {
        L.recent = [Object.assign({ t: now() }, entry)].concat(L.recent.filter(r => !(r.kind === entry.kind && r.id === entry.id))).slice(0, 40);
        save('recent');
      },
      recent: () => L.recent,

      setting: k => L.settings[k],
      set(k, v) { L.settings[k] = v; save('settings'); },

      /** Bibliothek als kurzer Text-Code (zum Übertragen zwischen PC und Handy). */
      exportCode() {
        const json = JSON.stringify(L);
        const bytes = new TextEncoder().encode(json);
        let bin = '';
        for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
        return 'KW1.' + global.btoa(bin);
      },
      /** Code einlesen: ersetzt (merge=false) oder ergänzt (merge=true) die Bibliothek. */
      importCode(code, merge) {
        const m = /^KW1\.([A-Za-z0-9+/=\s]+)$/.exec(String(code || '').trim());
        if (!m) throw new Error('Das ist kein Klangwelt-Code (er beginnt mit „KW1.“).');
        let d;
        try {
          const bin = global.atob(m[1].replace(/\s+/g, ''));
          d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
        } catch (e) {
          throw new Error('Der Code ist unvollständig oder beschädigt.');
        }
        if (!d || d.v !== VERSION || !Array.isArray(d.liked) || !Array.isArray(d.playlists)) throw new Error('Der Code passt nicht zu dieser Klangwelt-Version.');
        if (!merge) {
          L = Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings) });
        } else {
          const likedIds = new Set(L.liked.map(x => x.id));
          for (const x of d.liked) if (!likedIds.has(x.id)) L.liked.push(x);
          L.liked.sort((a, b) => b.t - a.t);
          const plIds = new Set(L.playlists.map(p => p.id));
          for (const p of d.playlists) if (!plIds.has(p.id)) L.playlists.push(p);
          for (const a of d.albums || []) if (!L.albums.some(x => x.name === a.name && x.artist === a.artist)) L.albums.push(a);
          for (const a of d.artists || []) if (!L.artists.some(x => x.name === a.name)) L.artists.push(a);
        }
        save('import');
        return { liked: d.liked.length, playlists: d.playlists.length };
      },
      reset() { L = blank(); save('import'); },
    };
    return api;
  }

  const Library = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = Library;
  else global.Library = Library;
})(typeof window !== 'undefined' ? window : globalThis);

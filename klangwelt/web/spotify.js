/* Spotify Web API: Anmeldung (Authorization Code mit PKCE), Token-Erneuerung, Seitenabruf und Player.
 * (Gleiche Datei wie in Klangraum; Klangwelt nutzt sie für die Suche im ganzen Spotify-Katalog.)
 *
 * Berücksichtigt die Änderungen vom Februar 2026 für Apps im Entwicklungsmodus:
 * - Playlist-Inhalte heißen jetzt "items" (statt "tracks") und ein Eintrag hat "item" (statt "track").
 * - GET /playlists/{id}/items liefert nur Inhalte eigener oder gemeinsamer Playlists (sonst 403).
 * - Speichern/Entfernen von Songs läuft über /me/library (mit Rückfall auf /me/tracks).
 * - Die "next"-Links von /me/playlists zeigen auf entfernte Endpunkte, deshalb wird mit offset geblättert.
 * - Die Suche liefert höchstens 10 Treffer pro Typ.
 */
(function (global) {
  'use strict';

  const ACCOUNTS = 'https://accounts.spotify.com';
  const API = 'https://api.spotify.com/v1';
  const SCOPES = [
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
    'user-top-read',
    'user-read-recently-played',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
  ];
  const PAGE = 50;
  const SEARCH_LIMIT = 10;
  const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  class ApiError extends Error {
    constructor(status, message, reason) {
      super(message || ('Fehler ' + status));
      this.status = status;
      this.reason = reason || '';
    }
  }

  function randomString(n) {
    const bytes = global.crypto.getRandomValues(new Uint8Array(n));
    let s = '';
    for (const b of bytes) s += VERIFIER_CHARS[b % VERIFIER_CHARS.length];
    return s;
  }

  function base64url(buf) {
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return global.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function challengeOf(verifier) {
    return base64url(await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  }

  function qs(query) {
    if (!query) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  }

  // ---------- Normalisieren: nur die Felder, die die Oberfläche braucht ----------

  /** Bild passend zur Größe (Spotify liefert meist 640/300/64 px, Mosaike ohne Breite). */
  function image(images, size) {
    if (!Array.isArray(images) || !images.length) return null;
    const sized = images.filter(i => i && i.url && i.width);
    if (!sized.length) return images[0] && images[0].url || null;
    sized.sort((a, b) => a.width - b.width);
    const pick = sized.find(i => i.width >= size) || sized[sized.length - 1];
    return pick.url;
  }

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function plainText(html) {
    if (!html) return '';
    return String(html)
      .replace(/<[^>]*>/g, '')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
          const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
      })
      .trim();
  }

  function track(t, addedAt) {
    if (!t || typeof t !== 'object' || !t.uri) return null;
    const episode = t.type === 'episode';
    const show = t.show || {};
    const album = t.album;
    return {
      id: t.id || null,
      uri: t.uri,
      name: t.name || '',
      artists: episode
        ? [{ id: show.id || null, name: show.name || 'Podcast', uri: show.uri || null, show: true }]
        : (t.artists || []).map(a => ({ id: a.id || null, name: a.name || '', uri: a.uri || null })),
      album: episode
        ? { id: null, name: show.name || '', uri: show.uri || null, img: image(t.images || show.images, 64), imgL: image(t.images || show.images, 300) }
        : album ? { id: album.id || null, name: album.name || '', uri: album.uri || null, img: image(album.images, 64), imgL: image(album.images, 300) } : null,
      ms: t.duration_ms || 0,
      explicit: !!t.explicit,
      local: !!t.is_local || String(t.uri).startsWith('spotify:local:'),
      playable: t.is_playable !== false,
      episode,
      added: addedAt || null,
    };
  }

  /** Playlist-Eintrag: neu {item: {...}}, alt {track: {...}}; "track" kann jetzt auch ein Boolean sein. */
  function playlistEntry(entry) {
    if (!entry) return null;
    const obj = entry.item && typeof entry.item === 'object' ? entry.item
      : entry.track && typeof entry.track === 'object' ? entry.track : null;
    return track(obj, entry.added_at);
  }

  function itemsBox(p) {
    if (p.items && typeof p.items === 'object' && !Array.isArray(p.items)) return p.items;
    return p.tracks && typeof p.tracks === 'object' ? p.tracks : null;
  }

  function playlist(p) {
    if (!p || !p.id) return null;
    const box = itemsBox(p);
    return {
      id: p.id,
      uri: p.uri || 'spotify:playlist:' + p.id,
      name: p.name || '',
      desc: plainText(p.description),
      img: image(p.images, 300),
      imgS: image(p.images, 64),
      owner: { id: p.owner && p.owner.id || '', name: p.owner && (p.owner.display_name || p.owner.id) || '' },
      total: box && typeof box.total === 'number' ? box.total : null,
      collaborative: !!p.collaborative,
      public: p.public,
      snapshot: p.snapshot_id || null,
    };
  }

  function album(a, addedAt) {
    if (!a || !a.id) return null;
    return {
      id: a.id,
      uri: a.uri || 'spotify:album:' + a.id,
      name: a.name || '',
      type: a.album_type || 'album',
      artists: (a.artists || []).map(x => ({ id: x.id || null, name: x.name || '', uri: x.uri || null })),
      img: image(a.images, 300),
      imgS: image(a.images, 64),
      year: (a.release_date || '').slice(0, 4),
      total: a.total_tracks || (a.tracks && a.tracks.total) || null,
      added: addedAt || null,
    };
  }

  function artist(a) {
    if (!a || !a.id) return null;
    return {
      id: a.id,
      uri: a.uri || 'spotify:artist:' + a.id,
      name: a.name || '',
      img: image(a.images, 300),
      imgS: image(a.images, 64),
      genres: a.genres || [],
    };
  }

  function playerState(s) {
    if (!s) return null;
    return {
      playing: !!s.is_playing,
      progress: s.progress_ms || 0,
      at: Date.now(),
      track: track(s.item),
      device: s.device ? {
        id: s.device.id, name: s.device.name, type: s.device.type,
        volume: s.device.volume_percent, canVolume: s.device.supports_volume !== false,
      } : null,
      shuffle: !!s.shuffle_state,
      repeat: s.repeat_state || 'off',
      context: s.context && s.context.uri || null,
      disallows: s.actions && s.actions.disallows || {},
    };
  }

  // ---------- Client ----------

  function create(opts) {
    const platform = opts.platform;
    const storage = opts.storage || global.localStorage;
    const fetchFn = opts.fetch || ((...a) => global.fetch(...a));
    const sleep = opts.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const prefix = opts.prefix || 'kr';
    const KEY = prefix + '.auth';
    const PKCE = prefix + '.pkce';
    const scopes = opts.scopes || SCOPES;
    let auth = read(KEY) || {};
    let refreshing = null;
    const listeners = new Set();

    function read(k) {
      try { return JSON.parse(storage.getItem(k) || 'null'); } catch (e) { return null; }
    }
    function write(k, v) {
      if (v === null) storage.removeItem(k); else storage.setItem(k, JSON.stringify(v));
    }
    function saveAuth() { write(KEY, auth); }
    function emit(what) { for (const l of listeners) l(what); }

    function saveTokens(tok) {
      if (!tok || !tok.access_token) throw new Error('Spotify hat kein Zugriffstoken geschickt');
      auth.access = tok.access_token;
      if (tok.refresh_token) auth.refresh = tok.refresh_token;
      auth.expires = Date.now() + ((tok.expires_in || 3600) - 60) * 1000;
      auth.scope = tok.scope || auth.scope;
      saveAuth();
    }

    async function tokenCall(params) {
      const res = await platform.tokenRequest(new URLSearchParams(params).toString());
      let data = null;
      try { data = JSON.parse(res.text); } catch (e) { /* kein JSON */ }
      if (res.status !== 200) {
        const code = data && data.error || '';
        const msg = data && (data.error_description || data.error) || ('Fehler ' + res.status);
        const err = new ApiError(res.status, msg, code);
        err.auth = true;
        throw err;
      }
      return data;
    }

    async function login() {
      if (!auth.clientId) throw new Error('Bitte zuerst die Client-ID eintragen.');
      const verifier = randomString(64);
      const state = randomString(16);
      write(PKCE, { verifier, state, redirect: platform.redirectUri });
      const url = ACCOUNTS + '/authorize' + qs({
        client_id: auth.clientId,
        response_type: 'code',
        redirect_uri: platform.redirectUri,
        code_challenge_method: 'S256',
        code_challenge: await challengeOf(verifier),
        state,
        scope: scopes.join(' '),
      });
      const callback = await platform.login(url);
      return finishLogin(callback);
    }

    /** Antwort von Spotify (Weiterleitungs-URL mit code/state oder error) einlösen. */
    async function finishLogin(callbackUrl) {
      const q = new URL(callbackUrl).searchParams;
      const pk = read(PKCE);
      if (q.get('error')) {
        write(PKCE, null);
        throw new Error(q.get('error') === 'access_denied' ? 'Die Anmeldung wurde bei Spotify abgelehnt.' : 'Spotify meldet: ' + q.get('error'));
      }
      if (!pk || !q.get('code') || q.get('state') !== pk.state) throw new Error('Ungültige Antwort von Spotify – bitte erneut verbinden.');
      const tok = await tokenCall({
        grant_type: 'authorization_code',
        code: q.get('code'),
        redirect_uri: pk.redirect,
        client_id: auth.clientId,
        code_verifier: pk.verifier,
      });
      write(PKCE, null);
      saveTokens(tok);
      emit('login');
      return true;
    }

    function refresh() {
      if (!refreshing) {
        refreshing = (async () => {
          if (!auth.refresh) throw Object.assign(new ApiError(401, 'Nicht angemeldet'), { auth: true });
          try {
            saveTokens(await tokenCall({ grant_type: 'refresh_token', refresh_token: auth.refresh, client_id: auth.clientId }));
          } catch (e) {
            // Abgelaufene oder widerrufene Anmeldung: neu verbinden
            if (e.status === 400 || e.status === 401) { logout(); }
            throw e;
          }
        })().finally(() => { refreshing = null; });
      }
      return refreshing;
    }

    async function accessToken() {
      if (!auth.access || !auth.refresh) throw Object.assign(new ApiError(401, 'Nicht angemeldet'), { auth: true });
      if (Date.now() >= (auth.expires || 0)) await refresh();
      return auth.access;
    }

    function logout() {
      const clientId = auth.clientId;
      auth = { clientId };
      saveAuth();
      emit('logout');
    }

    /** Ein API-Aufruf; erneuert das Token bei 401 und wartet bei 429 (Rate-Limit). */
    async function api(path, o) {
      o = o || {};
      const method = o.method || 'GET';
      const url = (path.startsWith('https://') ? path : API + path) + qs(o.query);
      for (let attempt = 0; ; attempt++) {
        const token = await accessToken();
        const headers = { Authorization: 'Bearer ' + token };
        if (o.body !== undefined) headers['Content-Type'] = 'application/json';
        let res;
        try {
          res = await fetchFn(url, { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
        } catch (e) {
          if (method === 'GET' && attempt < 2) { await sleep(700 * (attempt + 1)); continue; }
          throw new ApiError(0, 'Keine Verbindung zu Spotify', 'NETWORK');
        }
        if (res.status === 401 && attempt === 0) { await refresh(); continue; }
        if (res.status === 429 && attempt < 5) {
          const wait = Number(res.headers.get('Retry-After')) || 2;
          await sleep(Math.min(wait, 30) * 1000);
          continue;
        }
        if (res.status >= 500 && method === 'GET' && attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
        if (res.status === 204) return null;
        const text = await res.text();
        let data = text;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* manche Player-Antworten sind kein JSON */ }
        if (!res.ok) {
          const err = data && data.error;
          const message = err && (err.message || (typeof err === 'string' ? err : '')) || (typeof data === 'string' && data) || ('Fehler ' + res.status);
          throw new ApiError(res.status, message, err && err.reason);
        }
        return data;
      }
    }

    /** Alle Seiten eines Paging-Endpunkts (parallel, mit offset statt "next"). */
    async function pages(path, o) {
      o = o || {};
      const limit = o.limit || PAGE;
      const pick = o.pick || (x => x);
      const first = pick(await api(path, { query: Object.assign({}, o.query, { limit, offset: 0 }) })) || { items: [] };
      const firstItems = first.items || [];
      const total = typeof first.total === 'number' ? first.total : firstItems.length;
      const max = Math.min(total, o.max || Infinity);
      // Liefert Spotify weniger als angefragt (kleineres Seitenlimit), in dieser Schrittweite weiterblättern
      const step = firstItems.length > 0 && firstItems.length < limit ? firstItems.length : limit;
      const offsets = [];
      for (let off = step; off < max; off += step) offsets.push(off);
      const results = new Array(offsets.length);
      let done = firstItems.length;
      if (o.onProgress) o.onProgress(done, total);
      let next = 0;
      async function worker() {
        while (next < offsets.length) {
          const i = next++;
          const page = pick(await api(path, { query: Object.assign({}, o.query, { limit, offset: offsets[i] }) })) || {};
          results[i] = page.items || [];
          done += results[i].length;
          if (o.onProgress) o.onProgress(Math.min(done, total), total);
        }
      }
      await Promise.all(Array.from({ length: Math.min(o.concurrency || 4, offsets.length) }, worker));
      const items = firstItems.slice();
      for (const r of results) for (const x of r) items.push(x);
      return { total, items };
    }

    // ---------- Bibliothek ----------

    const me = () => api('/me');

    async function myPlaylists() {
      const r = await pages('/me/playlists');
      return r.items.map(playlist).filter(Boolean);
    }

    async function likedTracks(onProgress) {
      const r = await pages('/me/tracks', { onProgress });
      return { total: r.total, tracks: r.items.map(x => track(x && (x.track || x.item), x && x.added_at)).filter(Boolean) };
    }

    async function savedAlbums() {
      const r = await pages('/me/albums');
      return r.items.map(x => album(x && x.album, x && x.added_at)).filter(Boolean);
    }

    async function followedArtists() {
      const out = [];
      let after = null;
      for (let i = 0; i < 40; i++) {
        const r = await api('/me/following', { query: { type: 'artist', limit: PAGE, after } });
        const box = r && r.artists || {};
        for (const a of box.items || []) { const n = artist(a); if (n) out.push(n); }
        after = box.cursors && box.cursors.after;
        if (!after || !(box.items || []).length) break;
      }
      return out;
    }

    async function getPlaylist(id) {
      const p = await api('/playlists/' + encodeURIComponent(id), { query: { additional_types: 'track,episode' } });
      const box = itemsBox(p);
      return {
        meta: playlist(p),
        // Nur bei eigenen Playlists liefert Spotify die erste Seite gleich mit
        firstItems: box && Array.isArray(box.items) ? box.items.map(playlistEntry).filter(Boolean) : null,
      };
    }

    /** Songs einer Playlist; 403 bei fremden Playlists (Regel für Entwickler-Apps seit Feb. 2026). */
    async function playlistTracks(id, onProgress) {
      const r = await pages('/playlists/' + encodeURIComponent(id) + '/items', { query: { additional_types: 'track,episode' }, onProgress });
      return r.items.map(playlistEntry).filter(Boolean);
    }

    async function getAlbum(id) {
      const a = await api('/albums/' + encodeURIComponent(id));
      const meta = album(a);
      const box = a.tracks || { items: [], total: 0 };
      let raw = box.items || [];
      if (box.total > raw.length) {
        const rest = await pages('/albums/' + encodeURIComponent(id) + '/tracks', { max: box.total });
        raw = rest.items;
      }
      const albumRef = { id: a.id, name: a.name, uri: a.uri, images: a.images };
      meta.label = a.label || '';
      meta.copyright = a.copyrights && a.copyrights[0] && a.copyrights[0].text || '';
      return { meta, tracks: raw.map(t => Object.assign(track(Object.assign({}, t, { album: albumRef })) || {}, { no: t.track_number, disc: t.disc_number })).filter(t => t.uri) };
    }

    const getArtist = id => api('/artists/' + encodeURIComponent(id)).then(artist);

    async function artistAlbums(id) {
      const r = await api('/artists/' + encodeURIComponent(id) + '/albums', { query: { include_groups: 'album,single', limit: 20 } });
      return (r && r.items || []).map(a => album(a)).filter(Boolean);
    }

    async function search(q, types, offset) {
      const r = await api('/search', { query: { q, type: (types || ['track', 'artist', 'album', 'playlist']).join(','), limit: SEARCH_LIMIT, offset: offset || undefined } });
      const items = box => (r && r[box] && r[box].items || []).filter(Boolean);
      return {
        tracks: items('tracks').map(t => track(t)).filter(Boolean),
        artists: items('artists').map(artist).filter(Boolean),
        albums: items('albums').map(a => album(a)).filter(Boolean),
        playlists: items('playlists').map(playlist).filter(Boolean),
        totals: { tracks: r && r.tracks && r.tracks.total || 0, albums: r && r.albums && r.albums.total || 0, artists: r && r.artists && r.artists.total || 0 },
      };
    }

    async function recentlyPlayed() {
      const r = await api('/me/player/recently-played', { query: { limit: 50 } });
      return (r && r.items || []).map(x => {
        const t = track(x.track);
        if (t) { t.playedAt = x.played_at; t.context = x.context && x.context.uri || null; }
        return t;
      }).filter(Boolean);
    }

    async function top(type, range) {
      const r = await api('/me/top/' + type, { query: { limit: 20, time_range: range || 'short_term' } });
      return (r && r.items || []).map(x => type === 'artists' ? artist(x) : track(x)).filter(Boolean);
    }

    /** Songs speichern/entfernen: neuer Endpunkt /me/library (URIs), sonst der alte /me/tracks (IDs). */
    async function setSaved(tracks, saved) {
      const method = saved ? 'PUT' : 'DELETE';
      try {
        await api('/me/library', { method, query: { uris: tracks.map(t => t.uri).join(',') } });
      } catch (e) {
        if (![400, 404, 405].includes(e.status)) throw e;
        await api('/me/tracks', { method, query: { ids: tracks.map(t => t.id).filter(Boolean).join(',') } });
      }
    }

    // ---------- Player (Spotify Connect, benötigt Premium) ----------

    const dev = device => (device ? { device_id: device } : undefined);
    const player = {
      state: () => api('/me/player', { query: { additional_types: 'track,episode' } }).then(playerState),
      devices: () => api('/me/player/devices').then(r => (r && r.devices || []).filter(d => d && d.id)),
      play: (body, device) => api('/me/player/play', { method: 'PUT', query: dev(device), body: body || {} }),
      resume: device => api('/me/player/play', { method: 'PUT', query: dev(device) }),
      pause: device => api('/me/player/pause', { method: 'PUT', query: dev(device) }),
      next: device => api('/me/player/next', { method: 'POST', query: dev(device) }),
      previous: device => api('/me/player/previous', { method: 'POST', query: dev(device) }),
      seek: (ms, device) => api('/me/player/seek', { method: 'PUT', query: Object.assign({ position_ms: Math.max(0, Math.round(ms)) }, dev(device)) }),
      volume: (p, device) => api('/me/player/volume', { method: 'PUT', query: Object.assign({ volume_percent: Math.max(0, Math.min(100, Math.round(p))) }, dev(device)) }),
      shuffle: (on, device) => api('/me/player/shuffle', { method: 'PUT', query: Object.assign({ state: on ? 'true' : 'false' }, dev(device)) }),
      repeat: (mode, device) => api('/me/player/repeat', { method: 'PUT', query: Object.assign({ state: mode }, dev(device)) }),
      transfer: (device, play) => api('/me/player', { method: 'PUT', body: { device_ids: [device], play: !!play } }),
      queue: (uri, device) => api('/me/player/queue', { method: 'POST', query: Object.assign({ uri }, dev(device)) }),
    };

    return {
      ApiError,
      get clientId() { return auth.clientId || ''; },
      setClientId(id) { auth = { clientId: String(id || '').trim() }; saveAuth(); },
      isLoggedIn: () => !!(auth.access && auth.refresh),
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      login, finishLogin, logout, api, pages,
      me, myPlaylists, likedTracks, savedAlbums, followedArtists,
      getPlaylist, playlistTracks, getAlbum, getArtist, artistAlbums,
      search, recentlyPlayed, top, setSaved, player,
    };
  }

  const Spotify = {
    create, ApiError, SCOPES,
    norm: { track, playlist, album, artist, playlistEntry, playerState, image, plainText },
    webUrl(uri) {
      const m = /^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]+)$/.exec(uri || '');
      if (m) return 'https://open.spotify.com/' + m[1] + '/' + m[2];
      if (/^spotify:(user:[^:]+:)?collection(:tracks)?$/.test(uri || '')) return 'https://open.spotify.com/collection/tracks';
      return 'https://open.spotify.com/';
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Spotify;
  else global.Spotify = Spotify;
})(typeof window !== 'undefined' ? window : globalThis);

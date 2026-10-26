// Tests für web/spotify.js mit nachgebauter Spotify-API: node klangraum/tools/test-spotify.js
'use strict';
const assert = require('assert');
const Spotify = require('../web/spotify.js');

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function memoryStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}

function response(status, body, headers) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: k => (headers || {})[k] || (headers || {})[k.toLowerCase()] || null },
    text: async () => text,
  };
}

/** Baut einen Client mit gültigem Token und einer fetch-Funktion, die alle Aufrufe mitschreibt. */
function client(handler, opts) {
  const calls = [];
  const storage = memoryStorage({ 'kr.auth': JSON.stringify(Object.assign({ clientId: 'c'.repeat(32), access: 'A1', refresh: 'R1', expires: Date.now() + 3600e3 }, opts && opts.auth)) });
  const tokenCalls = [];
  const platform = {
    redirectUri: 'http://127.0.0.1:43821/callback',
    tokenRequest: async body => {
      tokenCalls.push(Object.fromEntries(new URLSearchParams(body)));
      return (opts && opts.token) ? opts.token(tokenCalls.length) : { status: 200, text: JSON.stringify({ access_token: 'A' + (tokenCalls.length + 1), expires_in: 3600 }) };
    },
    login: opts && opts.login,
  };
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method, auth: init.headers.Authorization, body: init.body });
    return handler(u, init, calls.length);
  };
  const sp = Spotify.create({ platform, storage, fetch, sleep: async () => {} });
  return { sp, calls, storage, tokenCalls };
}

const img = (w, n) => ({ url: 'https://i.scdn.co/image/' + n + w, width: w, height: w });
const trackObj = (i, extra) => Object.assign({
  id: 't' + i, uri: 'spotify:track:t' + i, name: 'Song ' + i, type: 'track', duration_ms: 180000 + i,
  artists: [{ id: 'a' + (i % 3), name: 'Artist ' + (i % 3), uri: 'spotify:artist:a' + (i % 3) }],
  album: { id: 'al' + i, name: 'Album ' + i, uri: 'spotify:album:al' + i, images: [img(640, 'x'), img(300, 'x'), img(64, 'x')] },
}, extra);

function paged(total, make, maxLimit) {
  return u => {
    const limit = Math.min(Number(u.searchParams.get('limit')), maxLimit || 50);
    const offset = Number(u.searchParams.get('offset'));
    const items = [];
    for (let i = offset; i < Math.min(total, offset + limit); i++) items.push(make(i));
    // "next" zeigt absichtlich auf einen entfernten Endpunkt (wie bei /me/playlists seit Feb. 2026)
    return response(200, { items, total, limit, offset, next: offset + limit < total ? 'https://api.spotify.com/v1/users/x/playlists?offset=' + (offset + limit) : null });
  };
}

test('Lieblingssongs: alle Seiten über offset, Felder normalisiert', async () => {
  const { sp, calls } = client(paged(237, i => ({ added_at: '2026-01-0' + (1 + (i % 9)) + 'T00:00:00Z', track: trackObj(i) })));
  const progress = [];
  const r = await sp.likedTracks((n, total) => progress.push([n, total]));
  assert.strictEqual(r.total, 237);
  assert.strictEqual(r.tracks.length, 237);
  assert.deepStrictEqual(r.tracks.map(t => t.id), Array.from({ length: 237 }, (_, i) => 't' + i), 'Reihenfolge bleibt erhalten');
  assert.strictEqual(r.tracks[5].album.img, 'https://i.scdn.co/image/x64');
  assert.strictEqual(r.tracks[5].album.imgL, 'https://i.scdn.co/image/x300');
  assert.strictEqual(r.tracks[5].added, '2026-01-06T00:00:00Z');
  assert.ok(calls.every(c => c.url.pathname === '/v1/me/tracks'), 'nur /me/tracks, nie den "next"-Link');
  assert.strictEqual(calls.length, 5);
  assert.deepStrictEqual(progress[progress.length - 1], [237, 237]);
});

test('Seitenlimit kleiner als angefragt: lückenlos weiterblättern', async () => {
  const { sp } = client(paged(95, i => ({ added_at: null, track: trackObj(i) }), 20));
  const r = await sp.likedTracks();
  assert.strictEqual(r.tracks.length, 95);
  assert.strictEqual(new Set(r.tracks.map(t => t.id)).size, 95);
});

test('Playlists: neues Format (items statt tracks), eigene und fremde', async () => {
  const { sp, calls } = client(paged(3, i => ({
    id: 'p' + i, uri: 'spotify:playlist:p' + i, name: 'Liste ' + i, description: 'Mit &amp; ohne <a href="x">Link</a> &#x27;hi&#x27;',
    images: i === 2 ? [{ url: 'https://mosaic.scdn.co/m', width: null, height: null }] : [img(300, 'p')],
    owner: { id: i === 1 ? 'friend' : 'me', display_name: i === 1 ? 'Freundin' : 'Ich' },
    items: { href: 'x', total: 10 + i }, snapshot_id: 's' + i, collaborative: false, public: true,
  })));
  const pls = await sp.myPlaylists();
  assert.strictEqual(pls.length, 3);
  assert.strictEqual(pls[0].total, 10);
  assert.strictEqual(pls[1].owner.name, 'Freundin');
  assert.strictEqual(pls[0].desc, "Mit & ohne Link 'hi'");
  assert.strictEqual(pls[2].img, 'https://mosaic.scdn.co/m', 'Mosaik ohne Breite');
  assert.strictEqual(calls[0].url.pathname, '/v1/me/playlists');
});

test('Playlists: altes Format (tracks) funktioniert weiter', async () => {
  const { sp } = client(paged(1, () => ({ id: 'p', name: 'Alt', owner: { id: 'me' }, tracks: { total: 7 } })));
  const pls = await sp.myPlaylists();
  assert.strictEqual(pls[0].total, 7);
  assert.strictEqual(pls[0].uri, 'spotify:playlist:p');
});

test('Playlist-Einträge: "item" (neu), "track" als Objekt (alt), "track" als Boolean, entfernte Songs', async () => {
  const entries = [
    { added_at: 'a', item: trackObj(1), track: true },
    { added_at: 'b', track: trackObj(2) },
    { added_at: 'c', item: null, track: true },
    { added_at: 'd', item: { type: 'episode', id: 'e1', uri: 'spotify:episode:e1', name: 'Folge', duration_ms: 1000, show: { id: 's1', name: 'Podcast X', uri: 'spotify:show:s1' }, images: [img(64, 'e')] } },
    { added_at: 'e', item: { id: null, uri: 'spotify:local:a:b:c:1', name: 'Lokal', is_local: true, artists: [{ name: 'Ich' }], album: { name: 'Lokal' } } },
  ];
  const { sp, calls } = client(u => response(200, { items: entries, total: entries.length }));
  const ts = await sp.playlistTracks('p1');
  assert.deepStrictEqual(ts.map(t => t.name), ['Song 1', 'Song 2', 'Folge', 'Lokal']);
  assert.strictEqual(ts[2].episode, true);
  assert.strictEqual(ts[2].artists[0].name, 'Podcast X');
  assert.strictEqual(ts[3].local, true);
  assert.strictEqual(calls[0].url.pathname, '/v1/playlists/p1/items');
});

test('Fremde Playlist: 403 kommt als ApiError mit Status an', async () => {
  const { sp } = client(() => response(403, { error: { status: 403, message: 'Forbidden' } }));
  await assert.rejects(sp.playlistTracks('fremd'), e => e instanceof Spotify.ApiError && e.status === 403);
});

test('GET /playlists/{id}: erste Seite nur, wenn mitgeliefert', async () => {
  const { sp } = client(u => response(200, u.pathname.endsWith('/own')
    ? { id: 'own', name: 'Meine', owner: { id: 'me' }, items: { total: 1, items: [{ added_at: 'x', item: trackObj(9) }] }, snapshot_id: 'S' }
    : { id: 'other', name: 'Fremd', owner: { id: 'x' }, items: { total: 40 } }));
  const own = await sp.getPlaylist('own');
  assert.strictEqual(own.firstItems.length, 1);
  assert.strictEqual(own.meta.snapshot, 'S');
  const other = await sp.getPlaylist('other');
  assert.strictEqual(other.firstItems, null);
  assert.strictEqual(other.meta.total, 40);
});

test('401: Token wird erneuert und der Aufruf wiederholt', async () => {
  const { sp, calls, tokenCalls, storage } = client((u, init, n) => (n === 1 ? response(401, { error: { status: 401, message: 'The access token expired' } }) : response(200, { id: 'me' })));
  const me = await sp.me();
  assert.strictEqual(me.id, 'me');
  assert.strictEqual(tokenCalls.length, 1);
  assert.strictEqual(tokenCalls[0].grant_type, 'refresh_token');
  assert.strictEqual(tokenCalls[0].refresh_token, 'R1');
  assert.strictEqual(calls[1].auth, 'Bearer A2');
  assert.strictEqual(JSON.parse(storage.getItem('kr.auth')).refresh, 'R1', 'ohne neues Refresh-Token bleibt das alte');
});

test('Abgelaufenes Token: vorher erneuern, parallel nur einmal', async () => {
  const { sp, tokenCalls, calls } = client(() => response(200, { ok: 1 }), { auth: { expires: Date.now() - 1000 } });
  await Promise.all([sp.api('/a'), sp.api('/b'), sp.api('/c')]);
  assert.strictEqual(tokenCalls.length, 1);
  assert.ok(calls.every(c => c.auth === 'Bearer A2'));
});

test('Widerrufenes Refresh-Token: Abmeldung', async () => {
  let loggedOut = false;
  const { sp, storage } = client(() => response(200, {}), {
    auth: { expires: 0 },
    token: () => ({ status: 400, text: JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token revoked' }) }),
  });
  sp.onChange(w => { if (w === 'logout') loggedOut = true; });
  await assert.rejects(sp.me(), e => e.auth && e.status === 400);
  assert.ok(loggedOut);
  assert.strictEqual(sp.isLoggedIn(), false);
  assert.strictEqual(JSON.parse(storage.getItem('kr.auth')).clientId, 'c'.repeat(32), 'Client-ID bleibt');
});

test('429: wartet und versucht es erneut', async () => {
  const { sp, calls } = client((u, init, n) => (n < 3 ? response(429, '', { 'Retry-After': '1' }) : response(200, { id: 'ok' })));
  const r = await sp.me();
  assert.strictEqual(r.id, 'ok');
  assert.strictEqual(calls.length, 3);
});

test('Player: 204 ergibt null, Fehlergrund wird übernommen', async () => {
  const { sp } = client(u => (u.pathname === '/v1/me/player' ? response(204) : response(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } })));
  assert.strictEqual(await sp.player.state(), null);
  await assert.rejects(sp.player.play({ context_uri: 'spotify:playlist:x' }), e => e.status === 404 && e.reason === 'NO_ACTIVE_DEVICE');
});

test('Player: Befehle mit Gerät, Body und Abfrage', async () => {
  const { sp, calls } = client(() => response(204));
  await sp.player.play({ context_uri: 'spotify:playlist:x', offset: { uri: 'spotify:track:t1' } }, 'dev1');
  await sp.player.volume(140);
  await sp.player.seek(1234.6, 'dev1');
  await sp.player.transfer('dev2', true);
  assert.strictEqual(calls[0].method, 'PUT');
  assert.strictEqual(calls[0].url.searchParams.get('device_id'), 'dev1');
  assert.deepStrictEqual(JSON.parse(calls[0].body), { context_uri: 'spotify:playlist:x', offset: { uri: 'spotify:track:t1' } });
  assert.strictEqual(calls[1].url.searchParams.get('volume_percent'), '100');
  assert.strictEqual(calls[1].url.searchParams.has('device_id'), false);
  assert.strictEqual(calls[2].url.searchParams.get('position_ms'), '1235');
  assert.deepStrictEqual(JSON.parse(calls[3].body), { device_ids: ['dev2'], play: true });
});

test('Player-Status wird normalisiert', async () => {
  const { sp } = client(() => response(200, {
    is_playing: true, progress_ms: 5000, shuffle_state: true, repeat_state: 'context',
    item: trackObj(3), context: { uri: 'spotify:playlist:p1' },
    device: { id: 'd', name: 'PC', type: 'Computer', volume_percent: 40, supports_volume: true },
    actions: { disallows: { skipping_prev: true } },
  }));
  const s = await sp.player.state();
  assert.strictEqual(s.track.name, 'Song 3');
  assert.strictEqual(s.device.volume, 40);
  assert.strictEqual(s.context, 'spotify:playlist:p1');
  assert.strictEqual(s.disallows.skipping_prev, true);
});

test('Song speichern: /me/library mit URIs, Rückfall auf /me/tracks', async () => {
  const a = client(() => response(200, ''));
  await a.sp.setSaved([{ id: 't1', uri: 'spotify:track:t1' }, { id: 't2', uri: 'spotify:track:t2' }], true);
  assert.strictEqual(a.calls[0].method, 'PUT');
  assert.strictEqual(a.calls[0].url.pathname, '/v1/me/library');
  assert.strictEqual(a.calls[0].url.searchParams.get('uris'), 'spotify:track:t1,spotify:track:t2');

  const b = client(u => (u.pathname === '/v1/me/library' ? response(404, { error: { status: 404, message: 'Service not found' } }) : response(200, '')));
  await b.sp.setSaved([{ id: 't1', uri: 'spotify:track:t1' }], false);
  assert.strictEqual(b.calls[1].method, 'DELETE');
  assert.strictEqual(b.calls[1].url.pathname, '/v1/me/tracks');
  assert.strictEqual(b.calls[1].url.searchParams.get('ids'), 't1');

  const c = client(() => response(403, { error: { status: 403, message: 'Insufficient client scope' } }));
  await assert.rejects(c.sp.setSaved([{ id: 't1', uri: 'spotify:track:t1' }], true), e => e.status === 403);
  assert.strictEqual(c.calls.length, 1, 'bei 403 kein Rückfall');
});

test('Suche: höchstens 10 pro Typ, null-Einträge werden übersprungen', async () => {
  const { sp, calls } = client(() => response(200, {
    tracks: { items: [trackObj(1), null] }, artists: { items: [{ id: 'a', name: 'A', images: [] }] },
    albums: { items: [{ id: 'al', name: 'Al', artists: [], images: [], release_date: '2019-05-01' }] }, playlists: { items: [null, { id: 'p', name: 'P', owner: { id: 'o' } }] },
  }));
  const r = await sp.search('abc');
  assert.strictEqual(calls[0].url.searchParams.get('limit'), '10');
  assert.strictEqual(calls[0].url.searchParams.get('type'), 'track,artist,album,playlist');
  assert.strictEqual(r.tracks.length, 1);
  assert.strictEqual(r.playlists.length, 1);
  assert.strictEqual(r.albums[0].year, '2019');
});

test('Gefolgte Künstler: Blättern mit Cursor', async () => {
  const { sp, calls } = client(u => {
    const after = u.searchParams.get('after');
    return response(200, { artists: { items: after ? [{ id: 'b', name: 'B' }] : [{ id: 'a', name: 'A' }], cursors: { after: after ? null : 'a' } } });
  });
  const r = await sp.followedArtists();
  assert.deepStrictEqual(r.map(a => a.id), ['a', 'b']);
  assert.strictEqual(calls.length, 2);
});

test('Album: mehr als eine Seite Songs', async () => {
  const { sp } = client(u => {
    if (u.pathname === '/v1/albums/al') {
      return response(200, { id: 'al', name: 'Groß', uri: 'spotify:album:al', album_type: 'album', images: [img(300, 'a')], artists: [{ id: 'x', name: 'X' }], release_date: '2020', tracks: { total: 60, items: Array.from({ length: 50 }, (_, i) => trackObj(i, { album: undefined, track_number: i + 1 })) } });
    }
    return paged(60, i => trackObj(i, { album: undefined, track_number: i + 1 }))(u);
  });
  const r = await sp.getAlbum('al');
  assert.strictEqual(r.tracks.length, 60);
  assert.strictEqual(r.tracks[59].no, 60);
  assert.strictEqual(r.tracks[0].album.name, 'Groß');
  assert.strictEqual(r.tracks[0].album.img, 'https://i.scdn.co/image/a300');
});

test('Anmeldung mit PKCE: URL, state-Prüfung und Token-Tausch', async () => {
  let authUrl = null;
  const { sp, tokenCalls, storage } = client(() => response(200, {}), {
    auth: { access: null, refresh: null },
    login: async url => { authUrl = new URL(url); return 'http://127.0.0.1:43821/callback?code=CODE&state=' + authUrl.searchParams.get('state'); },
    token: () => ({ status: 200, text: JSON.stringify({ access_token: 'NEW', refresh_token: 'RNEW', expires_in: 3600, scope: 'x' }) }),
  });
  assert.strictEqual(sp.isLoggedIn(), false);
  await sp.login();
  assert.strictEqual(authUrl.origin + authUrl.pathname, 'https://accounts.spotify.com/authorize');
  assert.strictEqual(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.strictEqual(authUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:43821/callback');
  assert.ok(authUrl.searchParams.get('scope').includes('user-library-read'));
  assert.ok(authUrl.searchParams.get('scope').includes('playlist-read-private'));
  // Challenge = base64url(sha256(verifier))
  const verifier = tokenCalls[0].code_verifier;
  const expected = require('crypto').createHash('sha256').update(verifier).digest('base64url');
  assert.strictEqual(authUrl.searchParams.get('code_challenge'), expected);
  assert.ok(/^[A-Za-z0-9\-._~]{64}$/.test(verifier));
  assert.strictEqual(tokenCalls[0].grant_type, 'authorization_code');
  assert.strictEqual(tokenCalls[0].code, 'CODE');
  assert.strictEqual(sp.isLoggedIn(), true);
  assert.strictEqual(storage.getItem('kr.pkce'), null, 'Verifier wird danach gelöscht');
});

test('Anmeldung: falscher state und Ablehnung werden erkannt', async () => {
  const a = client(() => response(200, {}), { auth: { access: null, refresh: null }, login: async () => 'klangraum://callback?code=C&state=falsch' });
  await assert.rejects(a.sp.login(), /Ungültige Antwort/);
  assert.strictEqual(a.tokenCalls.length, 0);
  const b = client(() => response(200, {}), { auth: { access: null, refresh: null }, login: async () => 'klangraum://callback?error=access_denied&state=x' });
  await assert.rejects(b.sp.login(), /abgelehnt/);
});

test('webUrl für Links nach open.spotify.com', () => {
  assert.strictEqual(Spotify.webUrl('spotify:playlist:abc'), 'https://open.spotify.com/playlist/abc');
  assert.strictEqual(Spotify.webUrl('spotify:user:me:collection'), 'https://open.spotify.com/collection/tracks');
  assert.strictEqual(Spotify.webUrl(''), 'https://open.spotify.com/');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log(failed ? '\n' + failed + ' von ' + tests.length + ' Tests fehlgeschlagen' : '\nAlle ' + tests.length + ' Tests bestanden');
  process.exit(failed ? 1 : 0);
})();

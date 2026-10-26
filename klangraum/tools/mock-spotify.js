// Nachgebaute Spotify-Web-API (Stand Februar 2026) mit Testdaten – für ui-test.js und electron-test.js.
'use strict';

const HUES = [140, 200, 260, 320, 20, 45, 90, 180, 230, 300, 0, 160];
let BASE = process.env.MOCK_BASE || ''; // Adresse der Test-Cover (leer = gleicher Server wie die Seite)
const setBase = b => { BASE = b; };
const cover = seed => BASE + '/mock/cover/' + encodeURIComponent(seed) + '.svg';
const images = seed => [{ url: cover(seed), width: 640, height: 640 }, { url: cover(seed), width: 300, height: 300 }, { url: cover(seed), width: 64, height: 64 }];

const WORDS = ['Neon', 'Nacht', 'Golden', 'Echo', 'Sommer', 'Regen', 'Stadt', 'Herz', 'Blau', 'Feuer', 'Wellen', 'Sterne', 'Mond', 'Wild', 'Leise', 'Morgen', 'Gravity', 'Paper', 'Velvet', 'Lights'];
const WORDS2 = ['Avenue', 'Gedanken', 'Horizont', 'Signals', 'Träume', 'Motion', 'Rausch', 'Hearts', 'Kreise', 'Paradies', 'Fieber', 'Highway', 'Lagune', 'Story', 'Zeit', 'Glow'];
const ARTISTS = ['Lina Kaya', 'The Paper Moons', 'Jonas Hale', 'NOVA', 'Kollektiv Nord', 'Mira & die Wellen', 'Ayla Sun', 'Frost Avenue', 'Elias Brandt', 'Velvet Static', 'Rina Moré', 'Odd Harbor'];
const artistObj = i => ({ id: 'ar' + (i % ARTISTS.length), name: ARTISTS[i % ARTISTS.length], uri: 'spotify:artist:ar' + (i % ARTISTS.length), type: 'artist' });
const albumObj = i => ({ id: 'al' + (i % 40), name: WORDS2[i % WORDS2.length] + ' ' + (i % 3 ? 'EP' : ''), uri: 'spotify:album:al' + (i % 40), images: images('al' + (i % 40)), album_type: i % 5 ? 'album' : 'single', release_date: String(2010 + (i % 16)), artists: [artistObj(i)], total_tracks: 12 });
const trackObj = i => ({
  id: 'tr' + i, uri: 'spotify:track:tr' + i, type: 'track', name: WORDS[i % WORDS.length] + ' ' + WORDS2[(i * 7) % WORDS2.length] + (i % 9 === 0 ? ' (feat. ' + ARTISTS[(i + 3) % ARTISTS.length] + ')' : ''),
  duration_ms: 140000 + (i * 7919) % 150000, explicit: i % 7 === 0, is_playable: i % 53 !== 17,
  artists: [artistObj(i)].concat(i % 4 === 0 ? [artistObj(i + 5)] : []), album: albumObj(i),
});

const ME = { id: 'maxl', display_name: 'Max', images: [] };
const OWN = ['Autofahrt', 'Workout 2026', 'Chill am Abend', 'Lernmusik', 'Party', 'Deutschrap', 'Throwbacks', 'Sonntagmorgen', 'Gym Hardcore', 'Roadtrip Italien', 'Indie-Perlen', 'Kochen', 'Einschlafen', 'Mit Lena'];
const OTHERS = [['Lofi Beats zum Lernen', 'Lena'], ['Sommerhits 2026', 'Jonas'], ['Today’s Top Hits', 'Spotify'], ['Deutschpop Klassiker', 'Musikfan93'], ['Hochzeit Tanzfläche', 'Sarah & Tim'], ['Techno Bunker', 'berlin.nights'], ['Acoustic Covers', 'Paul'], ['90er Eurodance', 'retroradio'], ['Running 170 BPM', 'Coach Mia']];
const PLAYLISTS = OWN.map((n, i) => ({ id: 'own' + i, name: n, owner: ME, total: 8 + (i * 13) % 70, collaborative: i === 13 }))
  .concat(OTHERS.map(([n, o], i) => ({ id: 'oth' + i, name: n, owner: { id: 'u' + i, display_name: o }, total: 30 + i * 11, collaborative: false })))
  .map((p, k) => Object.assign(p, { uri: 'spotify:playlist:' + p.id, description: p.id === 'own1' ? 'Pump it up – <b>für jeden Tag</b> &amp; jede Session' : '', snapshot_id: 'snap-' + p.id, public: k % 3 !== 0, images: images(p.id) }));
const plTracks = id => {
  const p = PLAYLISTS.find(x => x.id === id);
  const seed = Number(id.replace(/\D/g, '')) * 17;
  return Array.from({ length: p.total }, (_, i) => ({ added_at: new Date(Date.now() - (i * 3 + 1) * 864e5).toISOString(), item: trackObj(seed + i), track: true }));
};
const LIKED = Array.from({ length: 263 }, (_, i) => ({ added_at: new Date(Date.now() - i * 2.3 * 36e5).toISOString(), track: trackObj(i * 3 + 1) }));
const DEVICES = [
  { id: 'dev-pc', name: 'MAX-PC', type: 'Computer', is_active: true, volume_percent: 62, supports_volume: true },
  { id: 'dev-phone', name: 'Pixel 9', type: 'Smartphone', is_active: false, volume_percent: 100, supports_volume: false },
];
const ALBUMS = Array.from({ length: 6 }, (_, i) => ({ added_at: '2026-03-01T00:00:00Z', album: Object.assign(albumObj(i * 3), { tracks: { total: 12 } }) }));

function state() {
  return {
    is_playing: true, progress_ms: 72000, shuffle_state: false, repeat_state: 'context', item: trackObj(4),
    context: { uri: 'spotify:playlist:own0', type: 'playlist' }, device: DEVICES[0], actions: { disallows: {} },
  };
}

function page(all, u) {
  const limit = Number(u.searchParams.get('limit') || 20), offset = Number(u.searchParams.get('offset') || 0);
  return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
}

const log = [];
// mode.noDevice: kein Spotify-Gerät aktiv (Wiedergabe-Befehle ohne device_id liefern 404 NO_ACTIVE_DEVICE)
const mode = { noDevice: false, devices: null };

function api(u, method, body) {
  const p = u.pathname.replace(/^\/v1/, '');
  log.push(method + ' ' + p + u.search);
  if (p === '/me') return ME;
  if (p === '/me/playlists') return page(PLAYLISTS.map(x => Object.assign({}, x, { items: { href: 'x', total: x.total }, total: undefined })), u);
  if (p === '/me/tracks') return page(LIKED, u);
  if (p === '/me/albums') return page(ALBUMS, u);
  if (p === '/me/following') return { artists: { items: [0, 1, 2, 3].map(i => Object.assign(artistObj(i), { images: images('ar' + i), genres: ['indie pop'] })), cursors: { after: null } } };
  if (p === '/me/player' && method === 'GET') return mode.noDevice ? [204, null] : state();
  if (p === '/me/player/devices') return { devices: mode.devices || (mode.noDevice ? [] : DEVICES) };
  if (mode.noDevice && p.startsWith('/me/player') && !u.searchParams.get('device_id')) {
    return [404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }];
  }
  if (p === '/me/player/recently-played') return { items: [0, 1, 2, 3, 4, 5].map(i => ({ track: trackObj(i * 11), played_at: '2026-10-25T10:00:00Z', context: i === 0 ? { uri: 'spotify:playlist:own2' } : i === 1 ? { uri: 'spotify:playlist:oth1' } : null })) };
  if (p === '/me/top/tracks') return { items: Array.from({ length: 10 }, (_, i) => trackObj(i * 5 + 2)) };
  if (p === '/me/top/artists') return { items: [4, 5, 6, 7, 8].map(i => Object.assign(artistObj(i), { images: images('ar' + i), genres: [] })) };
  if (p === '/search') {
    const q = u.searchParams.get('q');
    return { tracks: { items: Array.from({ length: 10 }, (_, i) => trackObj(i + 100)) }, artists: { items: [Object.assign(artistObj(1), { images: images('ar1') })] }, albums: { items: [albumObj(3), albumObj(4)] }, playlists: { items: [null, Object.assign({}, PLAYLISTS[16], { name: q + ' Mix', items: { total: 50 } })] } };
  }
  let m = /^\/playlists\/([^/]+)$/.exec(p);
  if (m) {
    const pl = PLAYLISTS.find(x => x.id === m[1]);
    if (!pl) return [404, { error: { status: 404, message: 'Not found' } }];
    const own = pl.owner.id === ME.id;
    const items = own ? Object.assign(page(plTracks(pl.id), new URL('http://x/?limit=100')), { href: 'x' }) : { href: 'x', total: pl.total };
    return Object.assign({}, pl, { items });
  }
  m = /^\/playlists\/([^/]+)\/items$/.exec(p);
  if (m) {
    const pl = PLAYLISTS.find(x => x.id === m[1]);
    if (pl.owner.id !== ME.id && !pl.collaborative) return [403, { error: { status: 403, message: 'Forbidden' } }];
    return page(plTracks(pl.id), u);
  }
  m = /^\/albums\/([^/]+)$/.exec(p);
  if (m) {
    const i = Number(m[1].replace(/\D/g, ''));
    return Object.assign(albumObj(i), { copyrights: [{ text: '℗ 2026 Klangraum Testlabel' }], tracks: { total: 11, items: Array.from({ length: 11 }, (_, k) => Object.assign(trackObj(i * 50 + k), { album: undefined, track_number: k + 1 })) } });
  }
  m = /^\/artists\/([^/]+)$/.exec(p);
  if (m) { const i = Number(m[1].replace(/\D/g, '')); return Object.assign(artistObj(i), { images: images('ar' + i), genres: ['german pop', 'indie'] }); }
  m = /^\/artists\/([^/]+)\/albums$/.exec(p);
  if (m) return [403, { error: { status: 403, message: 'Forbidden' } }]; // wie bei Entwickler-Apps seit Feb. 2026: Rückfall auf die Suche
  if (p === '/me/library') return [200, ''];
  if (p.startsWith('/me/player')) return [204, null];
  return [404, { error: { status: 404, message: 'Service not found' } }];
}

function coverSvg(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = HUES[h % HUES.length], b = (a + 40 + (h % 80)) % 360;
  const shapes = ['<circle cx="70%" cy="35%" r="28%" fill="hsla(' + b + ',80%,70%,.55)"/>', '<rect x="10%" y="55%" width="80%" height="12%" rx="6%" fill="hsla(' + b + ',90%,85%,.35)"/>', '<path d="M0 100 L50 30 L100 100Z" transform="scale(6.4)" fill="hsla(' + b + ',70%,60%,.45)"/>'];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + a + ',65%,45%)"/><stop offset="1" stop-color="hsl(' + b + ',60%,22%)"/></linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#g)"/>' + shapes[h % 3] + '</svg>';
}

module.exports = { api, coverSvg, setBase, log, mode, trackObj, PLAYLISTS, OTHERS, LIKED, ME, DEVICES };

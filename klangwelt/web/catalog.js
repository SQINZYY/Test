/* Klangwelt-Katalog: lädt data/catalog.json (Spotify Tracks Dataset, ~81.000 Songs) und bietet
 * Suche, Listen nach Künstler/Album/Genre, ähnliche Songs (über die Audio-Merkmale) und Mixe. */
(function (global) {
  'use strict';

  let C = null;
  let VAL = null;      // Zeichen -> Wert 0..90
  let byId = null;     // Track-ID -> Index
  let idx = null;      // Listen je Künstler/Album/Genre (nach Beliebtheit sortiert, weil der Katalog es ist)
  let hay = null;      // Suchtexte
  let artistHay = null, albumHay = null;

  const F = { pop: 0, dance: 1, energy: 2, valence: 3, acoustic: 4, instr: 5, speech: 6, live: 7 };
  const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];

  const GENRE_NAMES = {
    'acoustic': 'Acoustic', 'afrobeat': 'Afrobeat', 'alt-rock': 'Alt-Rock', 'alternative': 'Alternative', 'ambient': 'Ambient',
    'anime': 'Anime', 'black-metal': 'Black Metal', 'bluegrass': 'Bluegrass', 'blues': 'Blues', 'brazil': 'Brasilien',
    'breakbeat': 'Breakbeat', 'british': 'Britisch', 'cantopop': 'Cantopop', 'chicago-house': 'Chicago House',
    'children': 'Kinder', 'chill': 'Chill', 'classical': 'Klassik', 'club': 'Club', 'comedy': 'Comedy', 'country': 'Country',
    'dance': 'Dance', 'dancehall': 'Dancehall', 'death-metal': 'Death Metal', 'deep-house': 'Deep House',
    'detroit-techno': 'Detroit Techno', 'disco': 'Disco', 'disney': 'Disney', 'drum-and-bass': 'Drum & Bass', 'dub': 'Dub',
    'dubstep': 'Dubstep', 'edm': 'EDM', 'electro': 'Electro', 'electronic': 'Elektronisch', 'emo': 'Emo', 'folk': 'Folk',
    'forro': 'Forró', 'french': 'Französisch', 'funk': 'Funk', 'garage': 'Garage', 'german': 'Deutsch', 'gospel': 'Gospel',
    'goth': 'Goth', 'grindcore': 'Grindcore', 'groove': 'Groove', 'grunge': 'Grunge', 'guitar': 'Gitarre', 'happy': 'Happy',
    'hard-rock': 'Hard Rock', 'hardcore': 'Hardcore', 'hardstyle': 'Hardstyle', 'heavy-metal': 'Heavy Metal', 'hip-hop': 'Hip-Hop',
    'honky-tonk': 'Honky Tonk', 'house': 'House', 'idm': 'IDM', 'indian': 'Indisch', 'indie': 'Indie', 'indie-pop': 'Indie-Pop',
    'industrial': 'Industrial', 'iranian': 'Iranisch', 'j-dance': 'J-Dance', 'j-idol': 'J-Idol', 'j-pop': 'J-Pop', 'j-rock': 'J-Rock',
    'jazz': 'Jazz', 'k-pop': 'K-Pop', 'kids': 'Kids', 'latin': 'Latin', 'latino': 'Latino', 'malay': 'Malaiisch', 'mandopop': 'Mandopop',
    'metal': 'Metal', 'metalcore': 'Metalcore', 'minimal-techno': 'Minimal Techno', 'mpb': 'MPB', 'new-age': 'New Age',
    'opera': 'Oper', 'pagode': 'Pagode', 'party': 'Party', 'piano': 'Piano', 'pop': 'Pop', 'pop-film': 'Filmmusik (Pop)',
    'power-pop': 'Power-Pop', 'progressive-house': 'Progressive House', 'psych-rock': 'Psych-Rock', 'punk': 'Punk',
    'punk-rock': 'Punkrock', 'r-n-b': 'R&B', 'reggae': 'Reggae', 'reggaeton': 'Reggaeton', 'rock': 'Rock', 'rock-n-roll': "Rock 'n' Roll",
    'rockabilly': 'Rockabilly', 'romance': 'Romantik', 'sad': 'Sad', 'salsa': 'Salsa', 'samba': 'Samba', 'sertanejo': 'Sertanejo',
    'show-tunes': 'Musical', 'singer-songwriter': 'Singer-Songwriter', 'ska': 'Ska', 'sleep': 'Schlafen', 'songwriter': 'Songwriter',
    'soul': 'Soul', 'spanish': 'Spanisch', 'study': 'Lernen', 'swedish': 'Schwedisch', 'synth-pop': 'Synthpop', 'tango': 'Tango',
    'techno': 'Techno', 'trance': 'Trance', 'trip-hop': 'Trip-Hop', 'turkish': 'Türkisch', 'world-music': 'Weltmusik',
  };

  const MOODS = [
    { id: 'gute-laune', name: 'Gute Laune', desc: 'Fröhlich, hell und mit Schwung', color: '#e8731c', test: i => f(i, 'valence') > 0.72 && f(i, 'energy') > 0.55 },
    { id: 'chillen', name: 'Chillen', desc: 'Entspannt zurücklehnen', color: '#148a7b', test: i => f(i, 'energy') < 0.45 && f(i, 'valence') > 0.25 && f(i, 'speech') < 0.2 && f(i, 'instr') < 0.5 },
    { id: 'workout', name: 'Workout', desc: 'Schnell, laut, voller Energie', color: '#d6281c', test: i => f(i, 'energy') > 0.8 && C.tempo[i] >= 118 && f(i, 'dance') > 0.5 },
    { id: 'party', name: 'Party', desc: 'Zum Tanzen bis spät', color: '#af2896', test: i => f(i, 'dance') > 0.75 && f(i, 'energy') > 0.65 },
    { id: 'fokus', name: 'Fokus', desc: 'Instrumental, ruhig, ohne Ablenkung', color: '#477d95', test: i => f(i, 'instr') > 0.6 && f(i, 'speech') < 0.08 && f(i, 'energy') < 0.6 },
    { id: 'akustisch', name: 'Akustisch', desc: 'Handgemacht und unplugged', color: '#8d67ab', test: i => f(i, 'acoustic') > 0.8 && f(i, 'instr') < 0.5 && f(i, 'speech') < 0.15 },
    { id: 'traurig', name: 'Traurig & schön', desc: 'Für nachdenkliche Momente', color: '#2d46b9', test: i => f(i, 'valence') < 0.25 && f(i, 'energy') < 0.5 && f(i, 'instr') < 0.5 },
    { id: 'schlafen', name: 'Zum Einschlafen', desc: 'Ganz leise und sanft', color: '#1e3264', test: i => f(i, 'energy') < 0.2 && f(i, 'speech') < 0.1 },
  ];

  function f(i, name) { return VAL[C.q.charCodeAt(i * 8 + F[name])] / 90; }

  async function load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Katalog nicht gefunden (' + res.status + ')');
    return use(await res.json());
  }

  function use(data) {
    C = data;
    VAL = new Int8Array(128);
    for (let k = 0; k < C.alphabet.length; k++) VAL[C.alphabet.charCodeAt(k)] = k;
    byId = new Map();
    for (let i = 0; i < C.count; i++) byId.set(C.ids.substr(i * 22, 22), i);
    idx = null; hay = null; artistHay = null; albumHay = null;
    return C.count;
  }

  function ensureIndex() {
    if (idx) return idx;
    const artists = Array.from({ length: C.artists.length }, () => []);
    const albums = Array.from({ length: C.albums.length }, () => []);
    const genres = Array.from({ length: C.genres.length }, () => []);
    for (let i = 0; i < C.count; i++) {
      for (const a of artistsOf(i)) artists[a].push(i);
      albums[C.al[i]].push(i);
      for (const g of genresOf(i)) genres[g].push(i);
    }
    const artistAlbums = Array.from({ length: C.artists.length }, () => []);
    // Alben in der Reihenfolge ihres beliebtesten Songs
    const seen = new Uint8Array(C.albums.length);
    for (let i = 0; i < C.count; i++) {
      const al = C.al[i];
      if (seen[al]) continue;
      seen[al] = 1;
      artistAlbums[C.albumArtist[al]].push(al);
    }
    idx = { artists, albums, genres, artistAlbums };
    return idx;
  }

  const artistsOf = i => { const a = C.ta[i]; return typeof a === 'number' ? [a] : a; };
  const genresOf = i => { const g = C.tg[i]; return typeof g === 'number' ? [g] : g; };
  const id = i => C.ids.substr(i * 22, 22);
  const pop = i => Math.round(VAL[C.q.charCodeAt(i * 8)] / 0.9);

  /** Song als Objekt für die Oberfläche. */
  function track(i) {
    const x = VAL[C.x.charCodeAt(i)];
    const tid = id(i);
    return {
      i, id: tid, uri: 'spotify:track:' + tid, name: C.names[i],
      artists: artistsOf(i).map(a => ({ i: a, name: C.artists[a] })),
      album: { i: C.al[i], name: C.albums[C.al[i]] },
      sec: C.dur[i], tempo: C.tempo[i], pop: pop(i),
      explicit: x >= 24, key: KEYS[(x % 24) >> 1], major: (x % 2) === 1,
      genres: genresOf(i).map(g => C.genres[g]),
    };
  }

  function features(i) {
    const o = {};
    for (const k of Object.keys(F)) o[k] = f(i, k);
    o.tempo = C.tempo[i];
    return o;
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`´]/g, '').replace(/ß/g, 'ss');
  }

  function ensureHay() {
    if (hay) return;
    hay = new Array(C.count);
    for (let i = 0; i < C.count; i++) {
      hay[i] = norm(C.names[i]) + '\u0001' + artistsOf(i).map(a => norm(C.artists[a])).join(' ') + '\u0001' + norm(C.albums[C.al[i]]);
    }
    artistHay = C.artists.map(norm);
    albumHay = C.albums.map(norm);
  }

  /** Suche in Songs, Künstlern, Alben und Genres; Treffer im Titel/Namen zuerst, sonst nach Beliebtheit. */
  function search(q, limit) {
    limit = limit || 50;
    const nq = norm(q).trim();
    if (!nq) return { tracks: [], artists: [], albums: [], genres: [] };
    ensureHay();
    ensureIndex();
    const words = nq.split(/\s+/);
    const tracks = [];
    for (let i = 0; i < C.count && tracks.length < 400; i++) {
      const h = hay[i];
      if (words.every(w => h.includes(w))) tracks.push(i);
    }
    const nameScore = i => {
      const n = hay[i].slice(0, hay[i].indexOf('\u0001'));
      return n === nq ? 0 : n.startsWith(nq) ? 1 : n.includes(nq) ? 2 : 3;
    };
    tracks.sort((a, b) => nameScore(a) - nameScore(b) || a - b);
    const rank = (list, h, best) => list.filter(k => words.every(w => h[k].includes(w)))
      .sort((a, b) => ((h[a] === nq ? 0 : h[a].startsWith(nq) ? 1 : 2) - (h[b] === nq ? 0 : h[b].startsWith(nq) ? 1 : 2)) || best(a) - best(b));
    const artistBest = a => (idx.artists[a][0] ?? 1e9);
    const albumBest = a => (idx.albums[a][0] ?? 1e9);
    const artistCand = [];
    for (let a = 0; a < artistHay.length; a++) if (artistHay[a].includes(words[0])) artistCand.push(a);
    const albumCand = [];
    for (let a = 0; a < albumHay.length && albumCand.length < 2000; a++) if (albumHay[a].includes(words[0])) albumCand.push(a);
    const genres = C.genres.map((g, k) => k).filter(k => norm(C.genres[k] + ' ' + genreName(k)).includes(nq));
    return {
      tracks: tracks.slice(0, limit),
      artists: rank(artistCand, artistHay, artistBest).slice(0, 12),
      albums: rank(albumCand, albumHay, albumBest).slice(0, 12),
      genres,
    };
  }

  function genreName(g) { return GENRE_NAMES[C.genres[g]] || C.genres[g]; }

  // ---------- Zufall mit Startwert (Mixe bleiben eine Woche gleich) ----------

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const week = () => Math.floor((Date.now() / 864e5 + 3) / 7); // Woche ab Montag

  function shuffled(list, rand) {
    const a = list.slice();
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  }

  // ---------- Ähnliche Songs ----------

  // Gewichte der Merkmale für den Abstand zweier Songs
  const W = { dance: 1.2, energy: 1.6, valence: 1.2, acoustic: 1.0, instr: 0.9, speech: 0.8 };

  function vec(i) {
    return [f(i, 'dance'), f(i, 'energy'), f(i, 'valence'), f(i, 'acoustic'), f(i, 'instr'), f(i, 'speech'), Math.min(C.tempo[i], 220) / 220];
  }

  /**
   * Songs, die zu den Start-Songs passen: ähnlicher Klang (Merkmale + Tempo), gleiche Genres bevorzugt,
   * beliebte Songs leicht bevorzugt, höchstens zwei Songs pro Künstler.
   */
  function similar(seeds, n, opts) {
    opts = opts || {};
    if (!seeds.length) return [];
    const exclude = new Set(opts.exclude || []);
    for (const s of seeds) exclude.add(s);
    const c = [0, 0, 0, 0, 0, 0, 0];
    const gcount = new Map();
    const seedArtists = new Set();
    for (const s of seeds) {
      const v = vec(s);
      for (let k = 0; k < 7; k++) c[k] += v[k] / seeds.length;
      for (const g of genresOf(s)) gcount.set(g, (gcount.get(g) || 0) + 1);
      for (const a of artistsOf(s)) seedArtists.add(a);
    }
    const wts = [W.dance, W.energy, W.valence, W.acoustic, W.instr, W.speech, 1.4];
    const rand = rng(opts.seed == null ? Date.now() : opts.seed);
    const onlyGenre = opts.genre == null ? null : opts.genre;
    const jitter = opts.jitter ?? 0.06;
    const gshare = new Float32Array(C.genres.length);
    for (const [g, k] of gcount) gshare[g] = k / seeds.length;
    // Nur die besten Kandidaten behalten (Max-Heap), statt alle ~80.000 zu sortieren
    const cap = Math.max(n * 10, 200);
    const hs = new Float64Array(cap), hi = new Int32Array(cap);
    let size = 0;
    const q = C.q, tempo = C.tempo, tg = C.tg, ta = C.ta;
    for (let i = 0; i < C.count; i++) {
      const g0 = tg[i];
      if (onlyGenre != null && (typeof g0 === 'number' ? g0 !== onlyGenre : !g0.includes(onlyGenre))) continue;
      if (exclude.has(i)) continue;
      const base = i * 8;
      const v0 = VAL[q.charCodeAt(base + 1)] / 90 - c[0];
      const v1 = VAL[q.charCodeAt(base + 2)] / 90 - c[1];
      const v2 = VAL[q.charCodeAt(base + 3)] / 90 - c[2];
      const v3 = VAL[q.charCodeAt(base + 4)] / 90 - c[3];
      const v4 = VAL[q.charCodeAt(base + 5)] / 90 - c[4];
      const v5 = VAL[q.charCodeAt(base + 6)] / 90 - c[5];
      const v6 = (tempo[i] > 220 ? 220 : tempo[i]) / 220 - c[6];
      const d = wts[0] * v0 * v0 + wts[1] * v1 * v1 + wts[2] * v2 * v2 + wts[3] * v3 * v3 + wts[4] * v4 * v4 + wts[5] * v5 * v5 + wts[6] * v6 * v6;
      let g = 0;
      if (typeof g0 === 'number') g = gshare[g0]; else for (let k = 0; k < g0.length; k++) if (gshare[g0[k]] > g) g = gshare[g0[k]];
      let sameArtist = false;
      if (opts.sameArtist) { const a0 = ta[i]; sameArtist = typeof a0 === 'number' ? seedArtists.has(a0) : a0.some(x => seedArtists.has(x)); }
      const score = Math.sqrt(d) - 0.35 * g - 0.12 * (VAL[q.charCodeAt(base)] / 90) - (sameArtist ? 0.08 : 0) + rand() * jitter;
      if (size < cap) {
        let k = size++;
        while (k > 0) { const p = (k - 1) >> 1; if (hs[p] >= score) break; hs[k] = hs[p]; hi[k] = hi[p]; k = p; }
        hs[k] = score; hi[k] = i;
      } else if (score < hs[0]) {
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k, ms = score;
          if (l < size && hs[l] > ms) { m = l; ms = hs[l]; }
          if (r < size && hs[r] > ms) { m = r; }
          if (m === k) break;
          hs[k] = hs[m]; hi[k] = hi[m]; k = m;
        }
        hs[k] = score; hi[k] = i;
      }
    }
    const scores = [];
    for (let k = 0; k < size; k++) scores.push([hs[k], hi[k]]);
    scores.sort((x, y) => x[0] - y[0]);
    const perArtist = new Map();
    const out = [];
    const maxPer = opts.maxPerArtist || 2;
    for (const [, i] of scores) {
      const a = artistsOf(i)[0];
      const k = perArtist.get(a) || 0;
      if (k >= maxPer) continue;
      perArtist.set(a, k + 1);
      out.push(i);
      if (out.length >= n) break;
    }
    return out;
  }

  /** Radio: Start-Songs zuerst, dann passende Songs. */
  function radio(seeds, n, opts) {
    return seeds.slice(0, 1).concat(similar(seeds, (n || 50) - 1, Object.assign({ sameArtist: true }, opts)));
  }

  // ---------- Mixe ----------

  function moodMix(id, n) {
    const m = MOODS.find(x => x.id === id);
    if (!m) return [];
    const hits = [];
    for (let i = 0; i < C.count && hits.length < 600; i++) if (m.test(i)) hits.push(i);
    // Die beliebtesten Treffer, jede Woche neu gemischt (beliebte etwas häufiger vorn)
    const rand = rng(hash(id) + week());
    const top = hits.slice(0, 300).map((i, k) => [k / 300 + rand() * 0.9, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return diverse(top, n || 50, 2);
  }

  function diverse(list, n, maxPer) {
    const per = new Map();
    const out = [];
    for (const i of list) {
      const a = artistsOf(i)[0];
      const k = per.get(a) || 0;
      if (k >= maxPer) continue;
      per.set(a, k + 1);
      out.push(i);
      if (out.length >= n) break;
    }
    return out;
  }

  function top(n, genre) {
    if (genre == null) return Array.from({ length: Math.min(n, C.count) }, (_, i) => i);
    return ensureIndex().genres[genre].slice(0, n);
  }

  /**
   * "Daily Mixe" aus den Lieblingssongs: nach Hauptgenre gruppiert, je Mix ein Teil der eigenen Songs
   * plus passende neue Songs. Ohne Lieblingssongs: Start-Mixe aus beliebten Genres.
   */
  function dailyMixes(liked, count) {
    count = count || 6;
    liked = [...new Set(liked)];
    const day = Math.floor(Date.now() / 864e5);
    const groups = new Map();
    for (const i of liked) {
      const g = genresOf(i)[0];
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(i);
    }
    const ranked = [...groups.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, count);
    return ranked.map(([g, list], k) => {
      const rand = rng(hash('daily' + g) + day);
      const seeds = shuffled(list, rand).slice(0, 25);
      const fresh = similar(seeds, 34, { exclude: liked, seed: hash('d' + g) + day, jitter: 0.1 });
      const own = seeds.slice(0, 16);
      const tracks = [];
      for (let a = 0, b = 0; tracks.length < own.length + fresh.length;) {
        if (b < fresh.length && (tracks.length % 3 !== 0 || a >= own.length)) tracks.push(fresh[b++]); else tracks.push(own[a++]);
      }
      const names = [...new Set(tracks.map(i => C.artists[artistsOf(i)[0]]))].slice(0, 3);
      return { id: 'daily-' + (k + 1), name: 'Mix ' + (k + 1), genre: g, desc: names.join(', ') + ' und mehr', tracks };
    });
  }

  /** "Mix der Woche": neue Songs, die zu allen Lieblingssongs passen (jede Woche andere). */
  function weekly(liked, n) {
    liked = [...new Set(liked)];
    if (!liked.length) return [];
    const rand = rng(hash('weekly') + week());
    const seeds = shuffled(liked, rand).slice(0, 30);
    return similar(seeds, n || 30, { exclude: liked, seed: week(), jitter: 0.12, maxPerArtist: 1 });
  }

  function genreStats() {
    const g = ensureIndex().genres;
    return C.genres.map((name, k) => ({ i: k, id: name, name: genreName(k), count: g[k].length }));
  }

  const Catalog = {
    load, use, track, features, search, similar, radio, moodMix, top, dailyMixes, weekly, genreStats, genreName, shuffled, rng, hash,
    MOODS,
    get count() { return C ? C.count : 0; },
    get source() { return C ? C.source : ''; },
    indexOf: tid => (byId && byId.has(tid) ? byId.get(tid) : -1),
    artistName: a => C.artists[a],
    albumName: al => C.albums[al],
    albumArtist: al => C.albumArtist[al],
    artistTracks: a => ensureIndex().artists[a] || [],
    albumTracks: al => ensureIndex().albums[al] || [],
    genreTracks: g => ensureIndex().genres[g] || [],
    artistAlbums: a => ensureIndex().artistAlbums[a] || [],
    artistGenres(a) {
      const count = new Map();
      for (const i of this.artistTracks(a).slice(0, 60)) for (const g of genresOf(i)) count.set(g, (count.get(g) || 0) + 1);
      return [...count.entries()].sort((x, y) => y[1] - x[1]).map(([g]) => g);
    },
    artistIndex(name) { const k = C.artists.indexOf(name); return k; },
    albumIndex(name, artistName) {
      const a = C.artists.indexOf(artistName);
      for (let k = 0; k < C.albums.length; k++) if (C.albums[k] === name && C.albumArtist[k] === a) return k;
      return -1;
    },
    genreIndex: id => C.genres.indexOf(id),
    genreId: g => C.genres[g],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Catalog;
  else global.Catalog = Catalog;
})(typeof window !== 'undefined' ? window : globalThis);

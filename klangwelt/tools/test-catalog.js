// Tests für web/catalog.js und web/library.js mit dem echten Katalog: node klangwelt/tools/test-catalog.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Catalog = require('../web/catalog.js');
const Library = require('../web/library.js');

Catalog.use(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'data', 'catalog.json'), 'utf8')));

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const T = i => Catalog.track(i);

test('Katalog: über 80.000 Songs, sortiert nach Beliebtheit, gültige IDs', () => {
  assert.ok(Catalog.count > 80000);
  for (let i = 1; i < Catalog.count; i += 997) assert.ok(T(i - 1).pop >= T(i).pop, 'Reihenfolge bei ' + i);
  for (let i = 0; i < Catalog.count; i += 4999) {
    const t = T(i);
    assert.ok(/^[0-9A-Za-z]{22}$/.test(t.id), t.id);
    assert.strictEqual(Catalog.indexOf(t.id), i);
    assert.ok(t.name && t.artists.length && t.album.name && t.sec > 0 && t.genres.length, JSON.stringify(t));
  }
});

test('Merkmale liegen zwischen 0 und 1, Tonart und Tempo sind plausibel', () => {
  for (let i = 0; i < Catalog.count; i += 811) {
    const f = Catalog.features(i);
    for (const k of ['dance', 'energy', 'valence', 'acoustic', 'instr', 'speech', 'live']) assert.ok(f[k] >= 0 && f[k] <= 1, k + '=' + f[k]);
    const t = T(i);
    assert.ok(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'].includes(t.key));
    assert.ok(t.tempo >= 0 && t.tempo < 260);
  }
});

test('Suche: Titel, Künstler, Umlaute/Akzente egal, Genres', () => {
  const r = Catalog.search('rammstein');
  assert.strictEqual(Catalog.artistName(r.artists[0]), 'Rammstein');
  assert.ok(r.tracks.length > 10 && r.tracks.every(i => T(i).artists.some(a => a.name === 'Rammstein') || /rammstein/i.test(T(i).name + T(i).album.name)));
  const ti = Catalog.search('titi me pregunto');
  assert.ok(ti.tracks.some(i => T(i).name === 'Tití Me Preguntó'), 'Akzente');
  assert.ok(Catalog.search('deutsch').genres.map(Catalog.genreId).includes('german'));
  assert.deepStrictEqual(Catalog.search('   ').tracks, []);
});

test('Künstler, Alben und Genres verweisen auf die richtigen Songs', () => {
  const a = Catalog.artistIndex('Rammstein');
  const songs = Catalog.artistTracks(a);
  assert.ok(songs.length > 20 && songs.every(i => T(i).artists.some(x => x.i === a)));
  const albums = Catalog.artistAlbums(a);
  assert.ok(albums.length > 3 && albums.every(al => Catalog.albumArtist(al) === a));
  for (const al of albums) assert.ok(Catalog.albumTracks(al).every(i => T(i).album.i === al));
  const g = Catalog.genreIndex('german');
  assert.ok(Catalog.genreTracks(g).every(i => T(i).genres.includes('german')));
});

test('Ähnliche Songs: ohne Startsongs, ohne Ausgeschlossene, höchstens 2 pro Künstler, Genre-Filter', () => {
  const seeds = [0, 1, 2];
  const ex = Catalog.similar(seeds, 50, { exclude: [3, 4, 5], seed: 1 });
  assert.strictEqual(ex.length, 50);
  assert.ok(ex.every(i => !seeds.includes(i) && ![3, 4, 5].includes(i)));
  const per = {};
  for (const i of ex) { const a = T(i).artists[0].i; per[a] = (per[a] || 0) + 1; }
  assert.ok(Object.values(per).every(n => n <= 2));
  const g = Catalog.genreIndex('jazz');
  assert.ok(Catalog.similar([Catalog.genreTracks(g)[0]], 20, { genre: g, seed: 2 }).every(i => T(i).genres.includes('jazz')));
  assert.deepStrictEqual(Catalog.similar([0, 1], 10, { seed: 7 }), Catalog.similar([0, 1], 10, { seed: 7 }), 'gleicher Startwert, gleiches Ergebnis');
});

test('Stimmungen: Songs erfüllen die Regeln, 50 Stück, gleiche Woche gleiche Liste', () => {
  for (const m of Catalog.MOODS) {
    const list = Catalog.moodMix(m.id, 50);
    assert.strictEqual(list.length, 50, m.id);
    assert.ok(list.every(m.test), m.id);
    assert.deepStrictEqual(list, Catalog.moodMix(m.id, 50));
  }
});

test('Daily Mixe: nach Genre, mit eigenen und neuen Songs; Mix der Woche ohne Lieblingssongs', () => {
  const liked = [];
  for (const g of ['pop', 'rock', 'jazz']) liked.push(...Catalog.genreTracks(Catalog.genreIndex(g)).slice(0, 8));
  const mixes = Catalog.dailyMixes(liked, 6);
  assert.ok(mixes.length >= 3);
  for (const m of mixes) {
    assert.ok(m.tracks.length >= 30, m.id);
    assert.ok(m.tracks.some(i => liked.includes(i)) && m.tracks.some(i => !liked.includes(i)), m.id);
    assert.strictEqual(new Set(m.tracks).size, m.tracks.length, 'keine Doppelten in ' + m.id);
  }
  const weekly = Catalog.weekly(liked, 30);
  assert.strictEqual(weekly.length, 30);
  assert.ok(weekly.every(i => !liked.includes(i)));
  assert.deepStrictEqual(Catalog.dailyMixes([], 6), []);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('Bibliothek: Lieblingssongs, Playlists, Alben, Künstler, Verlauf', () => {
  const L = Library.create(memoryStorage());
  const changes = [];
  L.onChange(w => changes.push(w));
  L.setLiked('a', true); L.setLiked('b', true); L.setLiked('a', true);
  assert.deepStrictEqual(L.likedIds(), ['b', 'a']);
  L.setLiked('b', false);
  assert.deepStrictEqual(L.likedIds(), ['a']);
  const p = L.createPlaylist('', ['x']);
  assert.strictEqual(p.name, 'Meine Playlist #1');
  assert.strictEqual(L.addToPlaylist(p.id, ['x', 'y', 'z']), 2, 'Doppelte übersprungen');
  L.movePlaylistTrack(p.id, 2, 0);
  assert.deepStrictEqual(L.playlist(p.id).tracks.map(t => t.id), ['z', 'x', 'y']);
  L.removeFromPlaylist(p.id, 1);
  assert.deepStrictEqual(L.playlist(p.id).tracks.map(t => t.id), ['z', 'y']);
  L.renamePlaylist(p.id, '  Sommer  ', 'Beschreibung');
  assert.strictEqual(L.playlist(p.id).name, 'Sommer');
  assert.strictEqual(L.toggleAlbum('Mutter', 'Rammstein'), true);
  assert.ok(L.isAlbumSaved('Mutter', 'Rammstein'));
  assert.strictEqual(L.toggleArtist('Rammstein'), true);
  for (let k = 0; k < 50; k++) L.addRecent({ kind: 'mix', id: 'm' + k, name: 'M' });
  L.addRecent({ kind: 'mix', id: 'm3', name: 'M' });
  assert.strictEqual(L.recent().length, 40);
  assert.strictEqual(L.recent()[0].id, 'm3');
  assert.strictEqual(L.recent().filter(r => r.id === 'm3').length, 1);
  assert.ok(changes.includes('liked') && changes.includes('playlists'));
  // überlebt einen Neustart
  L.deletePlaylist(p.id);
  assert.strictEqual(L.playlists().length, 0);
});

test('Bibliotheks-Code: exportieren, ersetzen, zusammenführen, Fehler verständlich', () => {
  const A = Library.create(memoryStorage());
  A.setLiked('s1', true); A.setLiked('s2', true);
  A.createPlaylist('Ä-Playlist ✓', ['s1']);
  A.toggleArtist('Björk');
  const code = A.exportCode();
  assert.ok(code.startsWith('KW1.'));
  const B = Library.create(memoryStorage());
  B.setLiked('s9', true);
  const r = B.importCode(code, true);
  assert.deepStrictEqual(r, { liked: 2, playlists: 1 });
  assert.deepStrictEqual(new Set(B.likedIds()), new Set(['s1', 's2', 's9']));
  assert.strictEqual(B.playlists()[0].name, 'Ä-Playlist ✓');
  assert.ok(B.isFollowing('Björk'));
  const C = Library.create(memoryStorage());
  C.setLiked('s9', true);
  C.importCode(code, false);
  assert.deepStrictEqual(new Set(C.likedIds()), new Set(['s1', 's2']));
  assert.throws(() => C.importCode('hallo'), /kein Klangwelt-Code/);
  assert.throws(() => C.importCode('KW1.abc'), /beschädigt/);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log(failed ? '\n' + failed + ' von ' + tests.length + ' Tests fehlgeschlagen' : '\nAlle ' + tests.length + ' Tests bestanden');
  process.exit(failed ? 1 : 0);
})();

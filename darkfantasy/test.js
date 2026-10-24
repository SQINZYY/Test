// Tests für den Generator: node darkfantasy/test.js
var assert = require('assert');
var D = require('./assets/www/data.js');
var G = require('./assets/www/generator.js');
var S = require('./assets/www/game.js');

// Gleicher Code → gleicher Charakter
var opts = G.randomOptions('dark', 'f', 'chaos');
var a = G.generate(opts);
assert.deepStrictEqual(G.generate(G.decode(a.code)), a, 'Code muss den Charakter exakt wiederherstellen');
assert.strictEqual(G.decode('Schau mal: ' + a.code + ' 🔥').seeds.lore, opts.seeds.lore, 'Code in geteilter Nachricht finden');
assert.strictEqual(G.decode('DF2.nichts'), null);

// Neu würfeln eines Teils ändert nur diesen Teil
var b = G.generate(Object.assign({}, opts, { seeds: Object.assign({}, opts.seeds, { lore: opts.seeds.lore + 1 }) }));
assert.strictEqual(b.name, a.name);
assert.deepStrictEqual(b.abilities, a.abilities);
assert.deepStrictEqual(b.stats, a.stats);

var counts = {};
for (var i = 0; i < 30000; i++) {
  var o = G.randomOptions(D.STYLE_IDS[i % 4], ['r', 'm', 'f'][i % 3], i % 4 ? 'balanced' : 'chaos');
  var c = G.generate(o);
  var r = D.RARITIES[c.tier];
  counts[c.rarity] = (counts[c.rarity] || 0) + 1;
  var text = G.toText(c);
  assert(!/[{}]|undefined|NaN/.test(text), 'Unaufgelöster Platzhalter:\n' + text);
  var sum = Object.keys(c.stats).reduce(function (s, k) { return s + c.stats[k]; }, 0);
  assert.strictEqual(sum, r.points, 'Attributpunkte passen zur Seltenheit');
  Object.keys(c.stats).forEach(function (k) { assert(c.stats[k] >= 3 && c.stats[k] <= r.maxStat); });
  assert(c.level >= r.level[0] && c.level <= r.level[1]);
  assert.strictEqual(c.abilities.length, r.abilities + (r.gift ? 1 : 0));
  assert.strictEqual(c.abilities.some(function (x) { return x.type === 'Ultimativ'; }), !!r.ultimate);
  assert.strictEqual(new Set(c.abilities.map(function (x) { return x.name; })).size, c.abilities.length, 'Keine doppelten Fähigkeiten');
  if (o.gender !== 'r') assert.strictEqual(c.gender, o.gender);
}
D.RARITIES.forEach(function (r) {
  var share = counts[r.id] / 30000 * 100;
  assert(Math.abs(share - r.chance) < 1.5, r.name + ': ' + share.toFixed(1) + ' % statt ' + r.chance + ' %');
});
// Eigene Charaktere: Bearbeiten eines generierten Charakters ändert nichts, Code stellt ihn wieder her
for (var j = 0; j < 500; j++) {
  var gen = G.generate(G.randomOptions(D.STYLE_IDS[j % 4], 'r', 'balanced'));
  var st = G.toState(gen);
  var cc = G.buildCustom(st);
  ['name', 'epithet', 'race', 'cls', 'rarity', 'level', 'weapon', 'quote'].forEach(function (k) { assert.strictEqual(cc[k], gen[k], k); });
  assert.deepStrictEqual(cc.stats, gen.stats);
  assert.deepStrictEqual(cc.abilities.map(function (x) { return x.name; }), gen.abilities.map(function (x) { return x.name; }));
  assert.deepStrictEqual(G.fromCode('Nachricht ' + cc.code + ' Ende'), cc);
}

// Manipulierte Codes werden auf die Grenzen der Seltenheit gekürzt
var cheat = G.sanitize({ style: 'dark', gender: 'f', name: 'X', race: 'dark:1', cls: 'dark:0', rarity: 'common', level: 99,
  stats: { str: 99, dex: 99, con: 99, int: 99, wis: 99, cha: 99 }, abilities: ['blood:4', 'blood:5', 'blood:2', 'nope:1'],
  ultimate: 'blood', gift: 0, seed: 5 });
var common = D.RARITIES[0];
assert.strictEqual(cheat.level, common.level[1]);
assert.strictEqual(cheat.abilities.length, G.slots(common));
assert.strictEqual(cheat.ultimate, null);
assert.strictEqual(cheat.gift, null);
assert.strictEqual(Object.keys(cheat.stats).reduce(function (s, k) { return s + cheat.stats[k]; }, 0), common.points);

// "Beste" Verteilung nutzt alle Punkte und bevorzugt die Hauptattribute
D.RARITIES.forEach(function (r) {
  Object.keys(D.ARCHETYPES).forEach(function (a) {
    var bs = G.bestStats(r.id, a);
    assert.strictEqual(Object.keys(bs).reduce(function (s, k) { return s + bs[k]; }, 0), r.points);
    assert.strictEqual(bs[D.ARCHETYPES[a].stats[0]], r.maxStat);
  });
});
// Jede Liste hat mindestens eine Wahl der Stufe Legendär (= ★ Beste)
Object.keys(D.ABILITIES).forEach(function (k) { assert(D.ABILITIES[k].some(function (x) { return x[2] === 3; }), k); });
D.STYLE_IDS.forEach(function (id) {
  var st = D.STYLES[id];
  assert.strictEqual(st.weaponTiers.length, st.weapons.length, id);
  assert(st.weaponTiers.indexOf(3) >= 0, id);
});

// Arena: jeder Lauf endet, Werte bleiben gültig, gleicher Seed = gleicher Verlauf; stärkere Charaktere kommen weiter
function runFloor(c, seed) {
  var s = S.newRun(c, seed), guard = 0;
  while (!s.over && guard++ < 5000) {
    if (s.phase === 'reward') { S.bless(s, s.choices[0].id); continue; }
    S.act(s, S.autoAction(s));
    assert(!isNaN(s.player.hp) && !isNaN(s.enemy.hp), 'NaN im Kampf');
    assert(s.player.hp <= s.player.maxHp && s.enemy.hp <= s.enemy.maxHp);
  }
  assert(s.over, 'Lauf endet nie');
  return s.floor;
}
var floors = {};
for (var k = 0; k < 1500; k++) {
  var ch = G.generate(G.randomOptions(D.STYLE_IDS[k % 4], 'r', 'balanced'));
  assert.strictEqual(runFloor(ch, k + 1), runFloor(ch, k + 1));
  (floors[ch.rarity] = floors[ch.rarity] || []).push(runFloor(ch, k + 1));
}
var median = function (a) { a.sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
assert(median(floors.common) < median(floors.legendary), 'Legendär muss weiter kommen als Gewöhnlich');
assert(median(floors.mythic) < 60, 'Turm muss irgendwann zu schwer werden');

console.log('Alle Tests bestanden', counts, 'Arena-Median', Object.keys(floors).map(function (r) { return r + ' ' + median(floors[r]); }).join(', '));

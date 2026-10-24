// Tests für den Generator: node darkfantasy/test.js
var assert = require('assert');
var D = require('./assets/www/data.js');
var G = require('./assets/www/generator.js');

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
console.log('Alle Tests bestanden', counts);

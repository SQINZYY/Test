// Erzeugt Charaktere aus DF_DATA. Alles hängt nur von den Optionen und vier Seeds ab
// (Kern, Name, Fähigkeiten, Lore), deshalb lässt sich ein Charakter als kurzer Code teilen
// und einzelne Teile können neu gewürfelt werden, ohne den Rest zu verändern.
var DF_GEN = (function () {
  var D = typeof DF_DATA !== 'undefined' ? DF_DATA : require('./data.js');
  var CODE_PREFIX = 'DF1';

  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    var r = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
    r.pick = function (list) { return list[Math.floor(r() * list.length)]; };
    r.shuffle = function (list) {
      var out = list.slice();
      for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t; }
      return out;
    };
    return r;
  }

  function newSeed() { return Math.floor(Math.random() * 0x7fffffff) + 1; }

  function form(value, g) { return Array.isArray(value) ? value[g === 'f' ? 1 : 0] : value; }

  function fill(text, ctx) {
    return text.replace(/\{(\w+)\}/g, function (m, key) {
      if (ctx[key] !== undefined) return ctx[key];
      var p = D.PRONOUNS[ctx.g][key];
      return p !== undefined ? p : m;
    });
  }

  // Im Chaos-Modus kommt jeder Baustein aus einem zufälligen Stil
  function styleFor(r, opts) {
    return opts.mode === 'chaos' ? D.STYLES[r.pick(D.STYLE_IDS)] : D.STYLES[opts.style];
  }

  function makeName(r, st, g) {
    var first;
    if (st.first) {
      first = r.pick(st.first[g === 'f' ? 1 : 0]);
    } else {
      var n = st.names;
      first = r.pick(n.pre) + (r() < 0.55 ? r.pick(n.mid) : '') + r.pick(n.end[g === 'f' ? 1 : 0]);
      first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
    var epithet = r.pick(st.epithets).split('|');
    epithet = epithet[g === 'f' && epithet.length > 1 ? 1 : 0];
    var house = st.houses && r() < 0.7 ? r.pick(st.houses) : '';
    return { first: first, house: house, epithetRaw: epithet };
  }

  function pickRarity(r) {
    var total = D.RARITIES.reduce(function (s, x) { return s + x.chance; }, 0);
    var roll = r() * total;
    for (var i = 0; i < D.RARITIES.length; i++) {
      roll -= D.RARITIES[i].chance;
      if (roll < 0) return D.RARITIES[i];
    }
    return D.RARITIES[0];
  }

  function rollStats(r, rarity, arche) {
    var stats = {};
    D.STATS.forEach(function (s) { stats[s.id] = 3; });
    var left = rarity.points - 3 * D.STATS.length;
    var weights = D.STATS.map(function (s) {
      var i = arche.stats.indexOf(s.id);
      return i < 0 ? 1 : 4 - i;
    });
    var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    var guard = 0;
    while (left > 0 && guard++ < 2000) {
      var roll = r() * wsum, k = 0;
      while ((roll -= weights[k]) >= 0) k++;
      var id = D.STATS[k].id;
      if (stats[id] >= rarity.maxStat) continue;
      stats[id]++;
      left--;
    }
    return stats;
  }

  // {n} je nach Einheit dahinter skalieren
  function number(r, text, tier) {
    var after = text.slice(text.indexOf('{n}') + 3);
    var mult = 1 + tier * 0.45;
    if (/^ Sekunden/.test(after)) return r.int(2, 4) + tier;
    if (/^ ?%/.test(after)) return Math.min(95, Math.round(r.int(10, 25) * mult));
    if (/^ (Schritt|Meilen)/.test(after)) return r.int(10, 30) * (tier + 1);
    if (/^ (Trugbilder|Skelette|Kreaturen)/.test(after)) return r.int(1, 2) + Math.ceil(tier / 2);
    return Math.round(r.int(40, 120) * mult * mult / 5) * 5;
  }

  function ability(r, entry, kind, tier, ctx) {
    var desc = entry[1];
    if (desc.indexOf('{n}') >= 0) desc = desc.replace('{n}', number(r, desc, tier));
    var type = kind || (/^Passiv: /.test(desc) ? 'Passiv' : 'Aktiv');
    return { name: entry[0], type: type, desc: fill(desc.replace(/^Passiv: /, ''), ctx) };
  }

  /**
   * opts: { style: 'high'|'dark'|'mythic'|'medieval', gender: 'r'|'m'|'f', mode: 'balanced'|'chaos',
   *         seeds: { core, name, abil, lore } }
   */
  function generate(opts) {
    var seeds = opts.seeds;
    var core = rng(seeds.core);
    var g = opts.gender === 'm' || opts.gender === 'f' ? opts.gender : (core() < 0.5 ? 'm' : 'f');
    var raceStyle = styleFor(core, opts);
    var race = form(core.pick(raceStyle.races), g);
    var clsStyle = styleFor(core, opts);
    var clsEntry = core.pick(clsStyle.classes);
    var cls = form(clsEntry[0], g);
    var archeId = clsEntry[1];
    var arche = D.ARCHETYPES[archeId];
    var rarity = pickRarity(core);
    var tier = D.RARITIES.indexOf(rarity);
    var level = core.int(rarity.level[0], rarity.level[1]);
    var alignment = core.pick(D.ALIGNMENTS);
    var stats = rollStats(core, rarity, arche);
    var weapon = core.pick(styleFor(core, opts).weapons);
    var accent = core();

    var nr = rng(seeds.name);
    var nameStyle = styleFor(nr, opts);
    var nm = makeName(nr, nameStyle, g);
    var baseCtx = { g: g, klasse: cls, volk: race };
    var epithet = fill(nm.epithetRaw, baseCtx);
    var fullName = nm.first + (nm.house ? ' ' + nm.house : '');
    var quote = nr.pick(nameStyle.quotes);

    var ar = rng(seeds.abil);
    var ctx = Object.assign({ name: nm.first }, baseCtx);
    var pool = D.ABILITIES[archeId].slice();
    // Ab Selten kann eine Fähigkeit aus einem verwandten Archetyp stammen
    if (tier >= 1) {
      var other = ar.pick(Object.keys(D.ABILITIES).filter(function (k) { return k !== archeId; }));
      pool = ar.shuffle(pool).slice(0, 6).concat(ar.shuffle(D.ABILITIES[other]).slice(0, 2));
    }
    var picks = ar.shuffle(pool).slice(0, rarity.abilities - (rarity.ultimate ? 1 : 0));
    var abilities = picks.map(function (e) { return ability(ar, e, null, tier, ctx); });
    if (rarity.ultimate) abilities.push(ability(ar, D.ULTIMATES[archeId], 'Ultimativ', tier, ctx));
    if (rarity.gift) abilities.push(ability(ar, ar.pick(D.GIFTS), 'Mythisch', tier, ctx));

    var lr = rng(seeds.lore);
    var loreStyle = styleFor(lr, opts);
    var lctx = Object.assign({}, ctx, {
      ort: lr.pick(loreStyle.places), feind: lr.pick(loreStyle.foes), artefakt: lr.pick(loreStyle.artifacts)
    });
    var parts = [lr.pick(D.LORE.origin), lr.pick(D.LORE.turn), lr.pick(D.LORE.goal)];
    if (tier >= 2 || lr() < 0.35) parts.push(lr.pick(D.LORE.secret));
    // Feind und Artefakt nur beim ersten Mal ausschreiben, danach verweisen
    var seen = {};
    var lore = parts.map(function (p) {
      var c = Object.assign({}, lctx);
      if (seen.feind) c.feind = 'diesen Feind';
      if (seen.artefakt) c.artefakt = 'jenes Relikt';
      if (p.indexOf('{feind}') >= 0) seen.feind = true;
      if (p.indexOf('{artefakt}') >= 0) seen.artefakt = true;
      var s = fill(p, c);
      return s.charAt(0).toUpperCase() + s.slice(1);
    });

    var power = Object.keys(stats).reduce(function (s, k) { return s + stats[k]; }, 0) * 10 + level * 25 + tier * 150;

    return {
      code: encode(opts),
      style: opts.style, mode: opts.mode, gender: g,
      name: fullName, first: nm.first, epithet: epithet,
      race: race, cls: cls, archetype: archeId, icon: arche.icon,
      rarity: rarity.id, rarityName: rarity.name, rarityColor: rarity.color, tier: tier,
      level: level, alignment: alignment, stats: stats, power: power,
      weapon: weapon, abilities: abilities, lore: lore, quote: quote, accent: accent
    };
  }

  function randomOptions(style, gender, mode) {
    return { style: style, gender: gender, mode: mode, seeds: { core: newSeed(), name: newSeed(), abil: newSeed(), lore: newSeed() } };
  }

  // Code: DF1.<stil>.<geschlecht><modus>.<core>.<name>.<abil>.<lore> (Seeds in Basis 36)
  function encode(opts) {
    var s = opts.seeds;
    return [CODE_PREFIX, opts.style, (opts.gender || 'r') + (opts.mode === 'chaos' ? 'c' : 'b'),
      s.core.toString(36), s.name.toString(36), s.abil.toString(36), s.lore.toString(36)].join('.');
  }

  function decode(text) {
    var m = /DF1\.(high|dark|mythic|medieval)\.([rmf])([bc])\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)/i.exec(text || '');
    if (!m) return null;
    var n = function (x) { return parseInt(x, 36) || 1; };
    return {
      style: m[1].toLowerCase(), gender: m[2].toLowerCase(), mode: m[3].toLowerCase() === 'c' ? 'chaos' : 'balanced',
      seeds: { core: n(m[4]), name: n(m[5]), abil: n(m[6]), lore: n(m[7]) }
    };
  }

  function toText(c) {
    var lines = [];
    lines.push('⚔ ' + c.name + ', ' + c.epithet);
    lines.push(c.rarityName + ' · ' + c.race + ' · ' + c.cls + ' · Stufe ' + c.level);
    lines.push(c.alignment + ' · Macht ' + c.power);
    lines.push('');
    lines.push(D.STATS.map(function (s) { return s.short + ' ' + c.stats[s.id]; }).join(' | '));
    lines.push('Waffe: ' + c.weapon);
    lines.push('');
    lines.push('Fähigkeiten:');
    c.abilities.forEach(function (a) { lines.push('• ' + a.name + ' (' + a.type + '): ' + a.desc); });
    lines.push('');
    lines.push(c.lore.join(' '));
    lines.push(c.quote);
    lines.push('');
    lines.push('Charakter-Code: ' + c.code);
    return lines.join('\n');
  }

  return { rng: rng, generate: generate, randomOptions: randomOptions, encode: encode, decode: decode, toText: toText, newSeed: newSeed };
})();

if (typeof module !== 'undefined') module.exports = DF_GEN;

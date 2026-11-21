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

  // rank = Stufe der Fähigkeit (Index in RARITIES): normale 1–3, Ultimativ 3, Mythische Gabe 4
  function ability(r, entry, kind, tier, ctx) {
    var desc = entry[1];
    if (desc.indexOf('{n}') >= 0) desc = desc.replace('{n}', number(r, desc, tier));
    var type = kind || (/^Passiv: /.test(desc) ? 'Passiv' : 'Aktiv');
    var rank = kind === 'Mythisch' ? 4 : kind === 'Ultimativ' ? 3 : entry[2] || 1;
    return { name: entry[0], type: type, rank: rank, desc: fill(desc.replace(/^Passiv: /, ''), ctx) };
  }

  function makeLore(lr, loreStyle, ctx, tier) {
    var lctx = Object.assign({}, ctx, {
      ort: lr.pick(loreStyle.places), feind: lr.pick(loreStyle.foes), artefakt: lr.pick(loreStyle.artifacts)
    });
    var parts = [lr.pick(D.LORE.origin), lr.pick(D.LORE.turn), lr.pick(D.LORE.goal)];
    if (tier >= 2 || lr() < 0.35) parts.push(lr.pick(D.LORE.secret));
    // Feind und Artefakt nur beim ersten Mal ausschreiben, danach verweisen
    var seen = {};
    return parts.map(function (p) {
      var c = Object.assign({}, lctx);
      if (seen.feind) c.feind = 'diesen Feind';
      if (seen.artefakt) c.artefakt = 'jenes Relikt';
      if (p.indexOf('{feind}') >= 0) seen.feind = true;
      if (p.indexOf('{artefakt}') >= 0) seen.artefakt = true;
      var s = fill(p, c);
      return s.charAt(0).toUpperCase() + s.slice(1);
    });
  }

  function power(stats, level, tier) {
    return Object.keys(stats).reduce(function (s, k) { return s + stats[k]; }, 0) * 10 + level * 25 + tier * 150;
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
    var lore = makeLore(lr, styleFor(lr, opts), ctx, tier);

    return {
      code: encode(opts),
      style: opts.style, mode: opts.mode, gender: g,
      name: fullName, first: nm.first, epithet: epithet,
      race: race, cls: cls, archetype: archeId, icon: arche.icon,
      rarity: rarity.id, rarityName: rarity.name, rarityColor: rarity.color, tier: tier,
      level: level, alignment: alignment, stats: stats, power: power(stats, level, tier),
      weapon: weapon, weaponRank: weaponRank(weapon), abilities: abilities, lore: lore, quote: quote, accent: accent
    };
  }

  // ---- Eigene Charaktere (Editor) ----
  // Zustand: { style, gender, name, epithet, race: 'stil:i', cls: 'stil:i', rarity, level, alignment, stats,
  //            abilities: ['archetyp:i', …], ultimate: archetyp|null, gift: i|null, weapon, lore, quote, seed }

  function weaponRank(name) {
    for (var i = 0; i < D.STYLE_IDS.length; i++) {
      var st = D.STYLES[D.STYLE_IDS[i]], k = st.weapons.indexOf(name);
      if (k >= 0) return st.weaponTiers[k];
    }
    return 0; // eigene Waffe
  }

  function rarityById(id) {
    return D.RARITIES.filter(function (r) { return r.id === id; })[0] || D.RARITIES[0];
  }

  function slots(rarity) { return rarity.abilities - (rarity.ultimate ? 1 : 0); }

  function entryAt(list, key) {
    var p = String(key || '').split(':');
    var st = D.STYLES[p[0]];
    return st && st[list][+p[1]] ? st[list][+p[1]] : null;
  }

  function abilityAt(key) {
    var p = String(key || '').split(':');
    return D.ABILITIES[p[0]] && D.ABILITIES[p[0]][+p[1]] ? D.ABILITIES[p[0]][+p[1]] : null;
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Bestmögliche Verteilung: Hauptattribute der Klasse zuerst bis zum Maximum
  function bestStats(rarityId, archeId) {
    var r = rarityById(rarityId), order = D.ARCHETYPES[archeId].stats.slice();
    D.STATS.forEach(function (s) { if (order.indexOf(s.id) < 0) order.push(s.id); });
    var stats = {}, left = r.points - 3 * D.STATS.length;
    order.forEach(function (id) { var add = Math.min(r.maxStat - 3, left); stats[id] = 3 + add; left -= add; });
    return stats;
  }

  // Bereinigt einen (evtl. importierten) Zustand: Grenzen der Seltenheit, gültige Einträge
  function sanitize(e) {
    var str = function (v, max) { return String(v == null ? '' : v).slice(0, max); };
    var out = {
      style: D.STYLES[e.style] ? e.style : 'dark', gender: e.gender === 'f' ? 'f' : 'm',
      name: str(e.name, 60).trim() || 'Namenlos', epithet: str(e.epithet, 60).trim(),
      race: entryAt('races', e.race) ? e.race : 'dark:0', cls: entryAt('classes', e.cls) ? e.cls : 'dark:0',
      rarity: rarityById(e.rarity).id, alignment: D.ALIGNMENTS.indexOf(e.alignment) >= 0 ? e.alignment : D.ALIGNMENTS[4],
      weapon: str(e.weapon, 60).trim() || D.STYLES.dark.weapons[0], lore: str(e.lore, 1500).trim(), quote: str(e.quote, 200).trim(),
      seed: (e.seed >>> 0) || 1
    };
    var r = rarityById(out.rarity);
    out.level = Math.max(r.level[0], Math.min(r.level[1], Math.round(+e.level) || r.level[0]));
    var stats = {}, sum = 0;
    D.STATS.forEach(function (s) { stats[s.id] = Math.max(3, Math.min(r.maxStat, Math.round(+(e.stats || {})[s.id]) || 3)); sum += stats[s.id]; });
    while (sum > r.points) { // zu viele Punkte: beim höchsten Wert abziehen
      var top = D.STATS.reduce(function (a, s) { return stats[s.id] > stats[a] ? s.id : a; }, 'str');
      stats[top]--; sum--;
    }
    out.stats = stats;
    var seen = {};
    out.abilities = (e.abilities || []).filter(function (k) {
      if (!abilityAt(k) || seen[k]) return false;
      return (seen[k] = true);
    }).slice(0, slots(r));
    out.ultimate = r.ultimate && D.ULTIMATES[e.ultimate] ? e.ultimate : null;
    out.gift = r.gift && D.GIFTS[e.gift] ? +e.gift : null;
    return out;
  }

  function buildCustom(state) {
    var e = sanitize(state), g = e.gender;
    var clsEntry = entryAt('classes', e.cls), archeId = clsEntry[1];
    var rarity = rarityById(e.rarity), tier = D.RARITIES.indexOf(rarity);
    var cls = form(clsEntry[0], g), race = form(entryAt('races', e.race), g);
    var first = e.name.split(' ')[0];
    var ctx = { g: g, klasse: cls, volk: race, name: first };
    var abilities = e.abilities.map(function (k) {
      return ability(rng(e.seed ^ hash(k)), abilityAt(k), null, tier, ctx);
    });
    if (e.ultimate) abilities.push(ability(rng(e.seed ^ hash('u' + e.ultimate)), D.ULTIMATES[e.ultimate], 'Ultimativ', tier, ctx));
    if (e.gift !== null) abilities.push(ability(rng(e.seed ^ hash('g' + e.gift)), D.GIFTS[e.gift], 'Mythisch', tier, ctx));
    return {
      code: encodeCustom(e), custom: true, seed: e.seed,
      style: e.style, mode: 'custom', gender: g,
      name: e.name, first: first, epithet: e.epithet,
      race: race, cls: cls, archetype: archeId, icon: D.ARCHETYPES[archeId].icon,
      rarity: rarity.id, rarityName: rarity.name, rarityColor: rarity.color, tier: tier,
      level: e.level, alignment: e.alignment, stats: e.stats, power: power(e.stats, e.level, tier),
      weapon: e.weapon, weaponRank: weaponRank(e.weapon), abilities: abilities,
      lore: e.lore ? [e.lore] : [], quote: e.quote, accent: 0
    };
  }

  function b64(str) {
    var b = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, 'utf8').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unb64(b) {
    b = b.replace(/-/g, '+').replace(/_/g, '/');
    return typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
  }

  // Code eigener Charaktere: DFC1.<Zustand als JSON, Base64url>
  function encodeCustom(e) { return 'DFC1.' + b64(JSON.stringify(e)); }

  function decodeCustom(text) {
    var m = /DFC1\.([A-Za-z0-9_-]+)/.exec(text || '');
    if (!m) return null;
    try { return sanitize(JSON.parse(unb64(m[1]))); } catch (err) { return null; }
  }

  // Liefert für beide Code-Arten den Charakter (oder null)
  function fromCode(text) {
    var e = decodeCustom(text);
    if (e) return buildCustom(e);
    var opts = decode(text);
    return opts ? generate(opts) : null;
  }

  function findKey(list, name, g) {
    for (var i = 0; i < D.STYLE_IDS.length; i++) {
      var items = D.STYLES[D.STYLE_IDS[i]][list];
      for (var k = 0; k < items.length; k++) {
        var v = list === 'classes' ? items[k][0] : items[k];
        if (form(v, g) === name) return D.STYLE_IDS[i] + ':' + k;
      }
    }
    return null;
  }

  // Editor-Zustand aus einem fertigen Charakter (zum Bearbeiten)
  function toState(c) {
    if (c.custom) return decodeCustom(c.code);
    var g = c.gender, abilities = [], ultimate = null, gift = null;
    c.abilities.forEach(function (a) {
      if (a.type === 'Ultimativ') {
        ultimate = Object.keys(D.ULTIMATES).filter(function (k) { return D.ULTIMATES[k][0] === a.name; })[0] || null;
      } else if (a.type === 'Mythisch') {
        D.GIFTS.forEach(function (x, i) { if (x[0] === a.name) gift = i; });
      } else {
        Object.keys(D.ABILITIES).forEach(function (k) {
          D.ABILITIES[k].forEach(function (x, i) { if (x[0] === a.name) abilities.push(k + ':' + i); });
        });
      }
    });
    var opts = decode(c.code);
    return sanitize({
      style: c.style, gender: g, name: c.name, epithet: c.epithet,
      race: findKey('races', c.race, g), cls: findKey('classes', c.cls, g), rarity: c.rarity, level: c.level,
      alignment: c.alignment, stats: c.stats, abilities: abilities, ultimate: ultimate, gift: gift,
      weapon: c.weapon, lore: c.lore.join(' '), quote: c.quote, seed: opts ? opts.seeds.core : newSeed()
    });
  }

  // Vorschau einer Fähigkeit mit den Werten, die sie im Charakter hätte
  function describe(kind, key, state) {
    var e = sanitize(state), g = e.gender, tier = D.RARITIES.indexOf(rarityById(e.rarity));
    var ctx = { g: g, klasse: '', volk: '', name: e.name.split(' ')[0] };
    if (kind === 'u') return ability(rng(e.seed ^ hash('u' + key)), D.ULTIMATES[key], 'Ultimativ', tier, ctx);
    if (kind === 'g') return ability(rng(e.seed ^ hash('g' + key)), D.GIFTS[key], 'Mythisch', tier, ctx);
    return ability(rng(e.seed ^ hash(key)), abilityAt(key), null, tier, ctx);
  }

  function randomName(style, g) {
    var nr = rng(newSeed()), st = D.STYLES[style];
    var nm = makeName(nr, st, g);
    return { name: nm.first + (nm.house ? ' ' + nm.house : ''), epithet: fill(nm.epithetRaw, { g: g }), quote: nr.pick(st.quotes) };
  }

  function randomLore(state) {
    var e = sanitize(state);
    var ctx = { g: e.gender, klasse: form(entryAt('classes', e.cls)[0], e.gender), volk: form(entryAt('races', e.race), e.gender),
      name: e.name.split(' ')[0] };
    return makeLore(rng(newSeed()), D.STYLES[e.style], ctx, D.RARITIES.indexOf(rarityById(e.rarity))).join(' ');
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
    lines.push('⚔ ' + c.name + (c.epithet ? ', ' + c.epithet : ''));
    lines.push(c.rarityName + ' · ' + c.race + ' · ' + c.cls + ' · Stufe ' + c.level);
    lines.push(c.alignment + ' · Macht ' + c.power);
    lines.push('');
    lines.push(D.STATS.map(function (s) { return s.short + ' ' + c.stats[s.id]; }).join(' | '));
    lines.push('Waffe: ' + c.weapon);
    lines.push('');
    lines.push('Fähigkeiten:');
    c.abilities.forEach(function (a) { lines.push('• ' + a.name + ' (' + a.type + (a.rank && a.type !== 'Mythisch' ? ' · ' + D.RARITIES[a.rank].name : '') + '): ' + a.desc); });
    lines.push('');
    if (c.lore.length) lines.push(c.lore.join(' '));
    if (c.quote) lines.push(c.quote);
    lines.push('');
    lines.push('Charakter-Code: ' + c.code);
    return lines.join('\n');
  }

  return {
    rng: rng, generate: generate, randomOptions: randomOptions, encode: encode, decode: decode, toText: toText, newSeed: newSeed,
    form: form, slots: slots, rarityById: rarityById, weaponRank: weaponRank, bestStats: bestStats, sanitize: sanitize,
    buildCustom: buildCustom, describe: describe, decodeCustom: decodeCustom, fromCode: fromCode, toState: toState, randomName: randomName, randomLore: randomLore
  };
})();

if (typeof module !== 'undefined') module.exports = DF_GEN;

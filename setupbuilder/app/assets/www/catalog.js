// Großer Teile-Katalog (rund 51.000 Teile aus dem PC-Part-Dataset / PCPartPicker).
// Ergänzt die eigene Datenbank: Was im Katalog fehlt (z. B. max. GPU-Länge eines Gehäuses),
// ist null und wird bei der Kompatibilitätsprüfung als "nicht prüfbar" gemeldet.
'use strict';

const CATALOG = {};
let catalogInfo = null;
const catIndex = {}; // Kategorie -> Map(Token -> [Teile])
const UNIT_WORDS = new Set(['gb', 'tb', 'mb', 'mhz', 'ghz', 'hz', 'mm', 'w']);

function catTokens(s) { return normText(s).split(' ').filter(t => t.length >= 2 || /\d/.test(t)); }

function registerCatalog(data) {
  catalogInfo = { source: data.source, count: 0 };
  for (const cat of Object.keys(data.data)) {
    const fields = data.fields[cat];
    const list = data.data[cat].map(row => {
      const p = { src: 'katalog' };
      fields.forEach((f, i) => { p[f] = row[i]; });
      if (cat === 'cpu') { p.igpu = !!p.igpu; p.boxCooler = null; p.unlocked = null; p.threads = null; }
      if (cat === 'mb') p.memOC = p.memOC !== 0;
      if (cat === 'psu') p.modular = !!p.modular;
      if (cat === 'keyboard' || cat === 'mouse' || cat === 'headset') p.wireless = !!p.wireless;
      p.price = typeof p.price === 'number' ? p.price : null;
      p.tokens = catTokens(p.name + (cat === 'gpu' && p.chip ? ' ' + p.chip : ''));
      return p;
    });
    CATALOG[cat] = list;
    const idx = new Map();
    for (const p of list) {
      BYID[cat + ':' + p.id] = p;
      for (const t of new Set(p.tokens)) {
        if (!idx.has(t)) idx.set(t, []);
        idx.get(t).push(p);
      }
    }
    catIndex[cat] = idx;
    catalogInfo.count += list.length;
  }
}

let catalogPromise = null;
function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch('catalog.json').then(r => r.json()).then(registerCatalog)
      .catch(() => { catalogInfo = null; });
  }
  return catalogPromise;
}

// Suche im Katalog: alle Wörter der Suche müssen vorkommen (auch als Wortanfang)
function searchCatalog(cat, query, limit = 40) {
  const list = CATALOG[cat];
  const q = catTokens(query);
  if (!list || !q.length) return [];
  const out = [];
  for (const p of list) {
    if (q.every(t => p.tokens.some(x => x === t || x.startsWith(t)))) {
      out.push(p);
      if (out.length >= limit * 4) break;
    }
  }
  // Teile mit Preis und kurzem Namen zuerst
  return out.sort((a, b) => (a.price == null) - (b.price == null) || a.name.length - b.name.length).slice(0, limit);
}

// Erkennung im Import: Ein Katalogteil passt, wenn fast alle seine Wörter und alle seine Modellnummern im Text stehen.
function matchCatalog(text, hint) {
  const t = normText(text);
  const words = new Set(t.split(' '));
  const a = attrsOf(t);
  let best = null;
  for (const cat of hint ? [hint] : Object.keys(catIndex)) {
    const idx = catIndex[cat];
    if (!idx) continue;
    const cands = new Set();
    for (const w of words) if (/\d/.test(w) && idx.has(w)) for (const p of idx.get(w)) cands.add(p);
    for (const p of cands) {
      // Wichtige Wörter: alles außer Einheiten und kurzen Zahlen (Größenangaben wie 16 oder 32)
      const toks = [...new Set(p.tokens)].filter(x => !UNIT_WORDS.has(x) && !/^\d{1,2}$/.test(x));
      if (!toks.length) continue;
      if (toks.some(x => /\d/.test(x) && !words.has(x))) continue; // Modellnummer fehlt
      const hit = toks.filter(x => words.has(x)).length;
      const cover = hit / toks.length;
      if (cover < 0.75 || hit < 2) continue;
      const s = attrScore(cat, p, a);
      const score = hit * 10 + cover * 5 + s.ok * 6 - s.bad * 12;
      if (!best || score > best.score) best = { cat, p, score, exact: cover === 1 && !s.bad };
    }
  }
  return best ? { cat: best.cat, id: best.p.id, quality: best.exact ? 'exact' : 'similar' } : null;
}

// Passt ein (fremd geschriebener) Produktname zu diesem Katalogteil? Für Preisabfragen auf Geizhals.
function catalogCovers(text, p) {
  const words = new Set(normText(text).split(' '));
  const toks = [...new Set(p.tokens)].filter(x => !UNIT_WORDS.has(x) && !/^\d{1,2}$/.test(x));
  if (!toks.length || toks.some(x => /\d/.test(x) && !words.has(x))) return false;
  return toks.filter(x => words.has(x)).length / toks.length >= 0.75;
}

// Erkennt PC-Teile in fremden Listen: Geizhals-Wunschlisten (HTML), kopiertem Text und Screenshot-Text.
'use strict';

// Endungen, die ein anderes Modell bedeuten ("RTX 5070" ist nicht "RTX 5070 Ti")
const MODEL_SUFFIX = {
  cpu: '(?:x3d|x|xt|k|kf|ks|f|g|t|s)',
  gpu: '(?:ti|super|xt|xtx|gre)',
};

function normText(s) {
  return String(s || '').toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/(\d)[o](?=\d)/g, '$10') // OCR: "5O70" -> "5070"
    .replace(/(\d)[il|](?=\d)/g, '$11')
    .replace(/(\d)(gb|tb|mb|mhz|ghz|hz|mm|w)\b/g, '$1 $2') // "16GB" -> "16 gb"
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "rtx 5070" -> passt auf "rtx 5070", "rtx5070", aber nicht auf "rtx 5070 ti" / "rtx 50700"
function keyRegex(key, cat) {
  const body = key.split(' ').map(escRe).join('\\s*');
  const suffix = MODEL_SUFFIX[cat] ? `(?!\\s+${MODEL_SUFFIX[cat]}(?![a-z0-9]))` : '';
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])${suffix}`);
}

const KEYS = [];
for (const cat of Object.keys(DB)) {
  for (const p of DB[cat]) for (const k of p.k || []) KEYS.push({ cat, p, key: k, re: keyRegex(k, cat) });
}

// Merkmale aus dem Text, um z. B. 16 GB von 32 GB zu unterscheiden
function attrsOf(t) {
  const a = {};
  let m = /(\d+)\s*x\s*(\d+)\s*gb/.exec(t);
  if (m) { a.modules = +m[1]; a.gb = +m[1] * +m[2]; }
  m = /(?<![a-z0-9])(\d+(?:\s\d)?)\s*(tb|gb)(?![a-z0-9])/.exec(t);
  if (m && !a.gb) a.gb = parseFloat(m[1].replace(' ', '.')) * (m[2] === 'tb' ? 1000 : 1);
  if (m && m[2] === 'tb') a.tb = true;
  m = /ddr([45])/.exec(t);
  if (m) a.ddr = 'DDR' + m[1];
  m = /ddr[45]\s*(\d{4})|(\d{4})\s*(?:mhz|mt s)/.exec(t);
  if (m) a.speed = +(m[1] || m[2]);
  m = /(?<![a-z0-9])(\d{3,4})\s*(?:w|watt)(?![a-z0-9])/.exec(t);
  if (m) a.watt = +m[1];
  return a;
}

function attrScore(cat, p, a) {
  let ok = 0, bad = 0;
  const cmp = (x, y) => { if (x == null || y == null) return; if (x === y) ok++; else bad++; };
  if (cat === 'ram') { cmp(a.ddr, p.type); cmp(a.gb, p.size); cmp(a.speed, p.speed); cmp(a.modules, p.modules); }
  if (cat === 'storage') cmp(a.gb, p.size);
  if (cat === 'gpu' && a.gb && a.gb <= 32) cmp(a.gb, p.vram);
  if (cat === 'psu') cmp(a.watt, p.watt);
  if (cat === 'mb') cmp(a.ddr, p.mem);
  return { ok, bad };
}

function guessCategory(t) {
  if (/k(ü|ue)hler|cooler|liquid freezer|wasserk(ü|ue)hlung|\baio\b/.test(t)) return 'cooler';
  if (/geforce|radeon|\brtx\b|\bgtx\b|\barc [ab]\d|grafikkarte/.test(t)) return 'gpu';
  if (/ryzen|core i[3579]|core ultra|prozessor|\bcpu\b/.test(t)) return 'cpu';
  if (/mainboard|motherboard|\b[abhxz][3-9][0-9]0[em]?\b/.test(t)) return 'mb';
  if (/\bddr[345]\b|arbeitsspeicher|\bdimm\b/.test(t)) return 'ram';
  if (/\bssd\b|nvme|\bm 2\b|festplatte|\bhdd\b/.test(t)) return 'storage';
  if (/netzteil|power supply|\bpsu\b|80 plus/.test(t)) return 'psu';
  if (/geh(ä|ae)use|\bcase\b|midi tower|mini tower|big tower|glasfenster|tempered glass/.test(t)) return 'case';
  if (/monitor|bildschirm|\bzoll\b|\d\d \d? ?hz\b/.test(t)) return 'monitor';
  if (/tastatur|keyboard/.test(t)) return 'keyboard';
  if (/\bmaus\b|mouse/.test(t)) return 'mouse';
  if (/headset|kopfh(ö|oe)rer/.test(t)) return 'headset';
  if (/stuhl|chair/.test(t)) return 'chair';
  if (/schreibtisch|\bdesk\b/.test(t)) return 'desk';
  return null;
}

// Ein Text (eine Zeile / ein Produktname) -> bestes Teil aus der Datenbank
// Erst die eigene Datenbank (vollständige Daten), dann der große Katalog. Ein genau passendes
// Katalogteil schlägt ein nur ähnliches Datenbankteil (z. B. andere Herstellerversion derselben Grafikkarte).
function matchLine(raw, hint) {
  const own = matchCurated(raw, hint);
  if (own && own.id && own.quality === 'exact') return own;
  if (typeof matchCatalog !== 'function') return own;
  const cat = matchCatalog(raw, (own && own.cat) || hint);
  if (cat && (cat.quality === 'exact' || !own || !own.id)) return cat;
  return own;
}

function matchCurated(raw, hint) {
  const t = normText(raw);
  if (t.length < 3) return null;
  const a = attrsOf(t);
  let best = null;
  for (const k of KEYS) {
    if (!k.re.test(t)) continue;
    const s = attrScore(k.cat, k.p, a);
    const score = k.key.length + s.ok * 6 - s.bad * 12;
    if (best && score === best.score && k.p !== best.p) best.tie = true;
    if (!best || score > best.score) best = { cat: k.cat, p: k.p, score, bad: s.bad, tie: false };
  }
  if (best) {
    let quality = best.bad || best.tie ? 'similar' : 'exact';
    if (best.cat === 'gpu' && best.p.brand && !best.p.brand.split(' ').every(w => t.includes(w))) quality = 'similar';
    return { cat: best.cat, id: best.p.id, quality };
  }
  // Kein Modell erkannt: über Merkmale das ähnlichste Teil suchen
  const cat = guessCategory(t) || hint || null;
  if (cat === 'ram' && a.ddr && a.gb) {
    const c = DB.ram.filter(r => r.type === a.ddr && r.size === a.gb)
      .sort((x, y) => Math.abs(x.speed - (a.speed || x.speed)) - Math.abs(y.speed - (a.speed || y.speed)))[0];
    if (c) return { cat, id: c.id, quality: 'similar' };
  }
  if (cat === 'storage' && a.gb) {
    const type = /\bhdd\b|festplatte/.test(t) ? 'HDD' : /sata/.test(t) && !/nvme/.test(t) ? 'SATA-SSD' : 'NVMe';
    const c = DB.storage.filter(s => s.type === type && s.size === a.gb).sort((x, y) => x.price - y.price)[0];
    if (c) return { cat, id: c.id, quality: 'similar' };
  }
  if (cat === 'cooler' && /\baio\b|wasserk|liquid|hyperflow|kraken|galahad/.test(t)) {
    const m = /(?<![0-9])(240|280|360)(?![0-9])/.exec(t);
    const c = m && DB.cooler.find(x => x.type === 'AIO' && x.rad === +m[1]);
    if (c) return { cat, id: c.id, quality: 'similar' };
  }
  return cat ? { cat, id: null, quality: 'custom' } : null;
}

// Preis und Anzahl aus einer Zeile wie "2x Samsung … € 129,90"
function parsePrice(s) {
  // Tausender nur mit Trennzeichen ("1.307,35"), sonst ganze Zahl ("1307,35")
  const m = /(?:€\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{2}|-{1,2}))?)|(?:(\d{1,3}(?:[.\s]\d{3})+|\d+),(\d{2}|-{1,2})\s*€)/.exec(s);
  if (!m) return null;
  const whole = (m[1] || m[3]).replace(/[.\s]/g, '');
  const cents = /^\d+$/.test(m[2] || m[4] || '') ? +(m[2] || m[4]) : 0;
  const v = +whole + cents / 100;
  return v > 0 && v < 100000 ? Math.round(v) : null;
}

function parseQty(s) {
  const m = /^\s*(\d{1,2})\s*[x×]\s+/i.exec(s) || /^\s*(\d)\s*[x×]\s*$/i.exec(s);
  return m ? Math.min(+m[1], 4) : 1;
}

function cleanName(s) {
  return String(s).replace(/^\s*\d{1,2}\s*[x×]\s+/i, '')
    .replace(/\bab\s*[€£]\s*[\d.,\-]+\S*/gi, ' ')          // "ab € 310,00"
    .replace(/[€£]\s*[+\-]\s*[\d.,]+\S*/g, ' ')               // Preisänderungen "€ +191,11"
    .replace(/\d+\s*Angebote?\b/gi, ' ').replace(/\(\d+\)/g, ' ').replace(/[®©@]/g, ' ')
    .replace(/(?:€\s*[\d.,]+|[\d.,]+\s*€).*$/, '')
    .replace(/\s+/g, ' ').replace(/[\s,;/-]+$/, '').trim().slice(0, 120);
}

// Preisangaben und Bewertungen aus einer Zeile entfernen (stehen in Screenshots oft mitten im Namen)
function stripPriceNoise(s) {
  return String(s).replace(/\bab\s*[€£]\s*[\d.,\-]+\S*/gi, ' ').replace(/[€£]\s*[+\-]?\s*[\d.,]+\S*/g, ' ')
    .replace(/\d+\s*Angebote?\b/gi, ' ').replace(/\(\d+\)/g, ' ').replace(/[®©@]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Geizhals-Kategoriezeile wie "Hardware / Netzteile & USV / Netzteile"
function categoryLine(text) {
  if ((text.match(/\//g) || []).length < 2 || /\d{3}/.test(text)) return null;
  const t = normText(text);
  if (/wasserk(ü|ue|ii|u)hlung|k(ü|ue|ii|u)hler/.test(t)) return 'cooler';
  if (/geh(ä|ae|a)use/.test(t)) return 'case';
  if (/netzteil/.test(t)) return 'psu';
  if (/mainboard/.test(t)) return 'mb';
  if (/arbeitsspeicher/.test(t)) return 'ram';
  if (/festplatten|ssd/.test(t)) return 'storage';
  if (/grafikkarte/.test(t)) return 'gpu';
  if (/prozessor/.test(t)) return 'cpu';
  if (/monitor/.test(t)) return 'monitor';
  if (/tastatur/.test(t)) return 'keyboard';
  if (/m(ä|a)use|maus/.test(t)) return 'mouse';
  if (/headset|kopfh/.test(t)) return 'headset';
  return guessCategory(t);
}

// Zeilen (Text oder OCR) -> Kandidaten. Zeilen ohne Treffer werden mit der nächsten Zeile kombiniert,
// weil Produktnamen in Shops oft umbrechen.
function itemsFromLines(lines, source) {
  const out = [];
  let hint = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = typeof line === 'string' ? line : line.text;
    if (!text || text.trim().length < 3) continue;
    const cl = categoryLine(text);
    if (cl) { hint = cl; continue; }
    let m = matchLine(text, hint);
    let used = 1;
    if ((!m || !m.id) && i + 1 < lines.length) {
      const next = typeof lines[i + 1] === 'string' ? lines[i + 1] : lines[i + 1].text;
      const m2 = matchLine(text + ' ' + next, hint);
      const alone = matchLine(next);
      if (m2 && m2.id && !(alone && alone.id === m2.id)) { m = m2; used = 2; }
    }
    if (!m) continue;
    // Preis in derselben oder einer der nächsten Zeilen (bis zum nächsten Produkt bzw. zur nächsten Kategorie)
    let price = parsePrice(text);
    for (let j = i + 1; price == null && j < Math.min(lines.length, i + used + 5); j++) {
      const nt = typeof lines[j] === 'string' ? lines[j] : lines[j].text;
      if (categoryLine(nt) || (matchLine(nt) && matchLine(nt).id)) break;
      price = parsePrice(nt);
    }
    let full = used === 2 ? text + ' ' + (typeof lines[i + 1] === 'string' ? lines[i + 1] : lines[i + 1].text) : text;
    // Umgebrochener Name ("…, 4.70-" / "5.20GHz, boxed") für die Anzeige zusammensetzen
    if (used === 1 && i + 1 < lines.length && /[,\-–/(]$/.test(text.trim())) {
      const nt = typeof lines[i + 1] === 'string' ? lines[i + 1] : lines[i + 1].text;
      const nm = matchLine(nt);
      if (!(nm && nm.id) && parsePrice(nt) == null) full = text + ' ' + nt;
    }
    const name = cleanName(full);
    if (m.quality === 'custom' && (name.length < 10 || !/\d/.test(name))) continue;
    const prev = out[out.length - 1];
    // Gleiches Teil direkt hintereinander (z. B. Name über zwei Zeilen) nur einmal
    if (prev && m.id && prev.id === m.id && prev.lineIndex >= i - 1) { prev.lineIndex = i; continue; }
    out.push({ ...m, name, price, qty: parseQty(text), source, line: typeof line === 'string' ? null : line, lineIndex: i + used - 1,
      checked: m.quality !== 'custom' || source === 'link' || !!hint, hinted: !!hint });
    hint = null;
    i += used - 1;
  }
  return out;
}

// Screenshot-Zeilen (mit Position) zu Produktkarten gruppieren: Zeilen mit kleinem Abstand gehören zusammen.
// Ein Block = normalerweise ein Produkt (Name über mehrere Zeilen, Preis, Artikelnummer …).
function itemsFromBlocks(lines) {
  const hs = lines.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
  const lh = hs[Math.floor(hs.length / 2)] || 20;
  const blocks = [];
  let curBlock = null;
  for (const l of lines) {
    const isCat = !!categoryLine(l.text);
    if (curBlock && !isCat && !curBlock.isCat && l.bbox.y0 - curBlock.y1 < lh * 1.0) {
      curBlock.lines.push(l);
      curBlock.y1 = Math.max(curBlock.y1, l.bbox.y1);
    } else {
      curBlock = { lines: [l], y1: l.bbox.y1, isCat };
      blocks.push(curBlock);
    }
  }
  const out = [];
  let hint = null;
  for (const bl of blocks) {
    if (bl.isCat) { hint = categoryLine(bl.lines[0].text); continue; }
    // Mehrere Produkte in einem Block (dichte Liste)? Dann zeilenweise.
    const perLine = itemsFromLines(bl.lines, 'screenshot').filter(i => i.id);
    const exactIds = new Set(perLine.filter(i => i.quality === 'exact').map(i => i.id));
    if (new Set(perLine.map(i => i.cat)).size >= 2 || exactIds.size >= 2) { out.push(...perLine); hint = null; continue; }
    const text = bl.lines.map(l => stripPriceNoise(l.text)).join(' ');
    const m = matchLine(text, hint);
    if (!m) continue;
    const name = cleanName(bl.lines.slice(0, 2).map(l => stripPriceNoise(l.text)).join(' '));
    if (!m.id && (name.length < 10 || !/\d/.test(name))) continue;
    let price = null;
    for (const l of bl.lines) if (price == null) price = parsePrice(l.text);
    const q = bl.lines.map(l => parseQty(l.text)).find(n => n > 1) || 1;
    out.push({ ...m, name, price, qty: q, source: 'screenshot', line: bl.lines[0], checked: !!m.id || !!hint });
    hint = null;
  }
  return out;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&euro;/g, '€')
    .replace(/&([aouAOU])uml;/g, (_, c) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' }[c])).replace(/&szlig;/g, 'ß')
    .replace(/&times;/g, '×').replace(/&ndash;|&mdash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
const stripTags = s => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// HTML einer Geizhals-Wunschliste (oder einer anderen Shop-Seite) -> Kandidaten
function itemsFromHtml(html) {
  html = String(html || '');
  // Aus dem eingebauten Browser kommt zusätzlich der sichtbare Text der Seite
  let visibleText = null;
  const cut = html.indexOf('<!--SB-TEXT-->');
  if (cut >= 0) { visibleText = html.slice(cut + 14); html = html.slice(0, cut); }
  // 1) Geizhals-Produktlinks: …/name-a1234567.html
  const re = /<a\b[^>]*href="([^"]*?-a(\d{4,})\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const found = new Map();
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    let name = stripTags(m[3]);
    if (!name || name.length < 6) {
      const t = /title="([^"]+)"/.exec(m[0]);
      name = t ? decodeEntities(t[1]) : name;
    }
    if (!name || name.length < 6) continue;
    const prev = found.get(id);
    if (!prev) found.set(id, { name, pos: m.index });
    else if (name.length > prev.name.length) prev.name = name;
  }
  if (found.size) {
    const list = [...found.values()].sort((x, y) => x.pos - y.pos);
    const out = [];
    list.forEach((it, i) => {
      const chunk = html.slice(it.pos, i + 1 < list.length ? list[i + 1].pos : it.pos + 4000);
      const text = stripTags(chunk);
      const qm = /(?:anzahl|menge)[^0-9]{0,40}(\d{1,2})|value="(\d{1,2})"[^>]*(?:name|class)="[^"]*(?:count|qty|anzahl|amount)/i.exec(chunk);
      const m2 = matchLine(it.name) || { cat: 'extras', id: null, quality: 'custom' };
      out.push({ ...m2, name: cleanName(it.name), price: parsePrice(text), qty: qm ? Math.min(+(qm[1] || qm[2]) || 1, 4) : 1, source: 'link', checked: true });
    });
    return out;
  }
  // 2) Strukturierte Produktdaten (viele Shops)
  const names = [];
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of ld) {
    const r = /"name"\s*:\s*"([^"]{6,200})"/g;
    let x;
    while ((x = r.exec(block))) names.push(decodeEntities(x[1]));
  }
  const fromLd = itemsFromLines(names, 'link').filter(i => i.id);
  if (fromLd.length) return fromLd;
  // 3) Notlösung: sichtbarer Text der Seite, Zeile für Zeile
  const text = visibleText != null ? visibleText : decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/a)[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' '));
  return itemsFromLines(text.split('\n').map(s => s.trim()).filter(Boolean), 'text').filter(i => i.id || i.hinted);
}

function itemsFromText(text) {
  return itemsFromLines(String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean), 'text');
}

// Geizhals-Links erkennen und normalisieren (auch alte "?cat=WL-…"-Links)
function parseListUrl(s) {
  const m = /https?:\/\/[^\s"'<>]+/i.exec(String(s || '').trim());
  if (!m) return null;
  let url = m[0].replace(/[).,;]+$/, '');
  const wl = /geizhals\.(de|at|eu)\/.*?(?:wishlists\/|cat=WL-)(\d+)/i.exec(url);
  if (wl) url = `https://geizhals.${wl[1]}/wishlists/${wl[2]}`;
  return { url, geizhals: !!wl || /geizhals\./i.test(url) };
}

// Kandidaten -> Build-Teile. Spätere Treffer ersetzen frühere bei Einzel-Slots.
function applyImport(b, items, usePrices) {
  const v = JSON.parse(JSON.stringify(b));
  v.customs = v.customs || [];
  v.images = v.images || {};
  v.prices = v.prices || {};
  for (const it of items) {
    if (!it.checked || !CAT[it.cat]) continue;
    const qty = CAT[it.cat].multi ? Math.max(1, it.qty || 1) : 1;
    if (it.id) {
      for (let n = 0; n < qty; n++) {
        if (CAT[it.cat].multi) {
          const arr = v.parts[it.cat] || [];
          if (arr.length < CAT[it.cat].max) arr.push(it.id);
          v.parts[it.cat] = arr;
        } else v.parts[it.cat] = it.id;
      }
      if (usePrices && it.price) v.prices[it.cat + ':' + it.id] = it.price;
      if (it.img) v.images[it.cat + ':' + it.id] = it.img;
      if (!CAT[it.cat].multi) v.customs = v.customs.filter(c => c.cat !== it.cat);
    } else {
      if (!CAT[it.cat].multi) {
        delete v.parts[it.cat];
        v.customs = v.customs.filter(c => c.cat !== it.cat);
      }
      v.customs.push({ id: 'c' + Math.random().toString(36).slice(2, 9), cat: it.cat, name: it.name, price: it.price || 0, img: it.img || null });
    }
  }
  return v;
}

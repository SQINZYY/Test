// Baut app/assets/www/catalog.json aus offenen Datenquellen:
//  - PC-Part-Dataset (https://github.com/docyx/pc-part-dataset, MIT, Daten von PCPartPicker) – Pflicht
//  - The Keyboard Catalogue (https://github.com/patrickgil/The-Keyboard-Catalogue, MIT) – optional, Custom-Tastaturen
//  - AutoEq (https://github.com/jaakkopasanen/AutoEq, MIT) – optional, Kopfhörer-Modelle
// Aufruf: node tools/build-catalog.js <pc-part-dataset> [--keyboards <keyboard-catalogue>] [--autoeq <autoeq-git-repo>]
// Teile, die schon in der eigenen Datenbank (data.js) stehen, werden übersprungen.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const src = process.argv[2];
const opt = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (!src) { console.error('Aufruf: node tools/build-catalog.js <pc-part-dataset> [--keyboards <dir>] [--autoeq <dir>]'); process.exit(1); }
const www = path.join(__dirname, '..', 'app', 'assets', 'www');
const ctx = vm.createContext({ console, TextEncoder, TextDecoder, btoa, atob });
for (const f of ['data.js', 'engine.js', 'import.js']) vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), ctx, { filename: f });
const { DB, matchLine, normText, keyRegex } = vm.runInContext('({ DB, matchLine, normText, keyRegex })', ctx);

const read = f => JSON.parse(fs.readFileSync(path.join(src, 'data', 'json', f + '.json'), 'utf8'));
const USD_EUR = 1.1; // US-Preise ohne Steuer -> grober Euro-Preis inkl. MwSt.
const eur = p => (typeof p === 'number' && p > 0 ? Math.round(p * USD_EUR) : null);

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const idOf = (cat, key) => 'pp' + hash(cat + '|' + key);

// Schon in data.js vorhanden (gleiches Modell)?
const known = (cat, text) => { const m = matchLine(text); return m && m.cat === cat && m.id && m.quality === 'exact'; };

// ---------- CPU ----------
const ARCH = {
  'Zen 5': 14.5, 'Zen 4': 13.7, 'Zen 3': 12.5, 'Zen 2': 10.8, 'Zen+': 9.5, 'Zen': 9,
  'Arrow Lake': 14.2, 'Raptor Lake Refresh': 14.6, 'Raptor Lake': 14.6, 'Alder Lake': 13.2, 'Rocket Lake': 11.8,
  'Comet Lake': 10.8, 'Coffee Lake Refresh': 10.6, 'Coffee Lake': 10.4, 'Kaby Lake': 9.6, 'Skylake': 9.3,
  'Broadwell': 8.5, 'Haswell Refresh': 8.3, 'Haswell': 8.2, 'Ivy Bridge': 7.4, 'Sandy Bridge': 7.0,
};
function cpuSocket(name, arch) {
  const n = name;
  if (/Threadripper/i.test(n)) return { 'Zen': 'sTR4', 'Zen+': 'sTR4', 'Zen 2': 'sTRX4', 'Zen 4': 'sTR5' }[arch] || null;
  if (/Xeon/i.test(n)) return null;
  let m = /Ryzen \d (\d)\d{3}/i.exec(n);
  if (m) return +m[1] >= 7 ? 'AM5' : 'AM4';
  if (/^Zen/.test(arch)) return /Zen [45]/.test(arch) ? 'AM5' : 'AM4';
  if (arch === 'Excavator') return /\b(A\d{1,2}-9\d{3}|Athlon X4 9\d{2})/i.test(n) ? 'AM4' : 'FM2+';
  if (arch === 'Steamroller') return 'FM2+';
  if (arch === 'Piledriver' || arch === 'Bulldozer') return /\bFX\b/.test(n) ? 'AM3+' : (arch === 'Piledriver' ? 'FM2' : 'FM1');
  if (arch === 'K10') return /\bA\d-3\d{3}|\bA\d{1,2}-\d{4}/.test(n) ? 'FM1' : 'AM3';
  if (arch === 'Jaguar' || arch === 'Puma+') return 'AM1';
  if (arch === 'Arrow Lake' || /Core Ultra/i.test(n)) return 'LGA1851';
  if (/Raptor Lake|Alder Lake/.test(arch)) return 'LGA1700';
  if (arch === 'Rocket Lake' || arch === 'Comet Lake') return /i[79]-10[89]\d0X/i.test(n) ? 'LGA2066' : 'LGA1200';
  if (arch === 'Cascade Lake') return 'LGA2066';
  if (/Coffee Lake|Kaby Lake|Skylake/.test(arch)) return /i[79]-[79]\d{3}X/i.test(n) ? 'LGA2066' : 'LGA1151';
  if (/Haswell|Broadwell/.test(arch)) return /i7-[56]\d{3}K?\b(?!.*[GR]\b)/i.test(n) && /-(58|59|68|69)\d\d/.test(n) ? 'LGA2011-3' : 'LGA1150';
  if (arch === 'Sandy Bridge' || arch === 'Ivy Bridge') return /-(38|39|48|49)\d\d/.test(n) ? 'LGA2011' : 'LGA1155';
  if (arch === 'Core' || arch === 'Wolfdale' || arch === 'Yorkfield') return 'LGA775';
  return null;
}

// ---------- Grafikkarten: Leistung über den Chip ----------
// [Gaming-Leistung (RTX 5090 = 100), Verbrauch W, empfohlenes Netzteil W]
const OLD_CHIPS = {
  'rtx 3050': [17, 130, 550], 'rtx 3060 ti': [32, 200, 600], 'rtx 3070': [36, 220, 650], 'rtx 3070 ti': [39, 290, 750],
  'rtx 3080': [45, 320, 750], 'rtx 3080 ti': [50, 350, 750], 'rtx 3090': [52, 350, 750], 'rtx 3090 ti': [56, 450, 850],
  'rtx 4070 ti': [56, 285, 700], 'rtx 4080': [70, 320, 750], 'rtx 2060': [19, 160, 500], 'rtx 2060 super': [22, 175, 550],
  'rtx 2070': [23, 175, 550], 'rtx 2070 super': [26, 215, 650], 'rtx 2080': [28, 215, 650], 'rtx 2080 super': [30, 250, 650],
  'rtx 2080 ti': [36, 250, 650], 'gtx 1630': [5, 75, 300], 'gtx 1650': [10, 75, 300], 'gtx 1650 super': [12, 100, 350],
  'gtx 1660': [13, 120, 450], 'gtx 1660 super': [15, 125, 450], 'gtx 1660 ti': [15, 120, 450], 'gtx 1050': [6, 75, 300],
  'gtx 1050 ti': [7, 75, 300], 'gtx 1060': [11, 120, 400], 'gtx 1070': [15, 150, 500], 'gtx 1070 ti': [17, 180, 500],
  'gtx 1080': [19, 180, 500], 'gtx 1080 ti': [24, 250, 600], 'gtx 970': [10, 145, 500], 'gtx 980': [12, 165, 500],
  'gtx 980 ti': [15, 250, 600], 'gt 1030': [3, 30, 300], 'rx 570': [10, 150, 450], 'rx 580': [12, 185, 500],
  'rx 590': [13, 225, 500], 'rx 5500 xt': [12, 130, 450], 'rx 5600 xt': [19, 150, 550], 'rx 5700': [21, 180, 600],
  'rx 5700 xt': [24, 225, 600], 'rx 6400': [7, 53, 350], 'rx 6500 xt': [8, 107, 400], 'rx 6600 xt': [25, 160, 500],
  'rx 6650 xt': [26, 180, 500], 'rx 6700 xt': [31, 230, 650], 'rx 6750 xt': [33, 250, 650], 'rx 6800': [39, 250, 650],
  'rx 6800 xt': [45, 300, 750], 'rx 6900 xt': [48, 300, 850], 'rx 6950 xt': [51, 335, 850], 'rx vega 56': [17, 210, 650],
  'rx vega 64': [19, 295, 750], 'arc a380': [6, 75, 400], 'arc a580': [17, 185, 550], 'arc a750': [20, 225, 600], 'arc a770': [22, 225, 600],
};
const CHIPS = [];
for (const g of DB.gpu) for (const k of g.k) if (!CHIPS.some(c => c.key === k)) CHIPS.push({ key: k, score: g.score, tdp: g.tdp, psuRec: g.psuRec });
for (const [k, [score, tdp, psuRec]] of Object.entries(OLD_CHIPS)) CHIPS.push({ key: k, score, tdp, psuRec });
for (const c of CHIPS) c.re = keyRegex(c.key, 'gpu');
CHIPS.sort((a, b) => b.key.length - a.key.length);
const chipOf = s => { const t = normText(s); return CHIPS.find(c => c.re.test(t)) || null; };

// ---------- Umwandeln ----------
const out = { v: 1, source: 'docyx/pc-part-dataset (PCPartPicker, Juli 2025), The Keyboard Catalogue, AutoEq', fields: {}, data: {} };
const stats = {};
function emit(cat, fields, rows) {
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    if (!r || seen.has(r[0])) continue;
    seen.add(r[0]);
    list.push(r);
  }
  out.fields[cat] = fields;
  out.data[cat] = list;
  stats[cat] = list.length;
}

const lower = s => (s == null ? null : String(s));

emit('cpu', ['id', 'name', 'price', 'socket', 'cores', 'boost', 'power', 'igpu', 'score', 'arch'], read('cpu').map(c => {
  if (known('cpu', c.name)) return null;
  const socket = cpuSocket(c.name, c.microarchitecture);
  const clock = c.boost_clock || c.core_clock;
  const f = ARCH[c.microarchitecture] || 5;
  const cores = c.core_count || 2;
  const adj = cores <= 2 ? 0.6 : cores < 6 ? 0.85 : 1;
  const score = clock ? Math.max(3, Math.min(100, Math.round(f * clock * adj * (/X3D/i.test(c.name) ? 1.25 : 1)))) : null;
  return [idOf('cpu', c.name), c.name, eur(c.price), socket, c.core_count || null, clock || null, c.tdp || null, c.graphics ? 1 : 0, score, c.microarchitecture || null];
}));

const MB_FF = { 'ATX': 'ATX', 'Micro ATX': 'mATX', 'Mini ITX': 'ITX', 'Thin Mini ITX': 'ITX', 'Mini DTX': 'ITX', 'Flex ATX': 'mATX',
  'EATX': 'EATX', 'XL ATX': 'EATX', 'SSI EEB': 'EATX', 'SSI CEB': 'EATX', 'HPTX': 'EATX' };
function mbMem(socket, name) {
  if (/^(AM5|LGA1851|sTR5)$/.test(socket)) return 'DDR5';
  if (socket === 'LGA1700') return /DDR4|\bD4\b/i.test(name) ? 'DDR4' : 'DDR5';
  if (/^(AM4|LGA1200|LGA1151|LGA2066|LGA2011-3|sTR4|sTRX4)/.test(socket)) return 'DDR4';
  if (/^(LGA1150|LGA1155|LGA1156|LGA1366|LGA2011$|AM3|FM1|FM2|AM1)/.test(socket)) return 'DDR3';
  return null;
}
emit('mb', ['id', 'name', 'price', 'socket', 'chipset', 'ff', 'mem', 'ramSlots', 'maxRam', 'memOC'], read('motherboard').map(m => {
  if (known('mb', m.name)) return null;
  const chip = (/\b([ABHQXZ]\d{3})[EM]?\b/i.exec(m.name.replace(/-/g, ' ')) || [])[1];
  const chipset = chip ? chip.toUpperCase() : null;
  const memOC = chipset && /^(H610|H510|H410|H310|B460|H470|B365|B360|H370)$/.test(chipset) ? 0 : 1;
  return [idOf('mb', m.name), m.name, eur(m.price), m.socket || null, chipset, MB_FF[m.form_factor] || null, mbMem(m.socket || '', m.name),
    m.memory_slots || null, m.max_memory || null, memOC];
}));

emit('ram', ['id', 'name', 'price', 'type', 'size', 'modules', 'speed', 'cl'], read('memory').map(r => {
  if (!Array.isArray(r.speed) || !Array.isArray(r.modules)) return null;
  const [gen, mhz] = r.speed;
  const [n, sz] = r.modules;
  const name = `${r.name} (${n}×${sz} GB) DDR${gen}-${mhz}${r.cas_latency ? ' CL' + r.cas_latency : ''}`;
  if (known('ram', name)) return null;
  return [idOf('ram', name), name, eur(r.price), 'DDR' + gen, n * sz, n, mhz, r.cas_latency || null];
}));

emit('gpu', ['id', 'name', 'price', 'chip', 'vram', 'len', 'score', 'tdp', 'psuRec'], read('video-card').map(g => {
  const chipName = String(g.chipset || '').replace(/\s*LHR\b/i, '');
  let name = g.name;
  if (!normText(name).includes(normText(chipName).replace(/^(geforce|radeon) /, ''))) name += ' ' + chipName;
  if (g.memory && !/\d+\s*G/i.test(name)) name += ` ${g.memory} GB`;
  if (known('gpu', name)) return null;
  const c = chipOf(chipName);
  return [idOf('gpu', name + '|' + (g.length || '')), name, eur(g.price), chipName || null, g.memory || null, g.length || null,
    c ? c.score : null, c ? c.tdp : null, c ? c.psuRec : null];
}));

function caseFf(type) {
  if (/Full Tower/.test(type)) return ['EATX', 'ATX', 'mATX', 'ITX'];
  if (/^ATX/.test(type)) return ['ATX', 'mATX', 'ITX'];
  if (/^MicroATX/.test(type)) return ['mATX', 'ITX'];
  if (/^Mini ITX/.test(type)) return ['ITX'];
  return null;
}
emit('case', ['id', 'name', 'price', 'ff', 'type', 'bays35', 'color'], read('case').map(c => {
  if (known('case', c.name)) return null;
  return [idOf('case', c.name + '|' + (c.color || '')), c.name + (c.color ? ` (${c.color})` : ''), eur(c.price), caseFf(c.type || ''), c.type || null,
    typeof c.internal_35_bays === 'number' ? c.internal_35_bays : null, c.color || null];
}));

const EFF = { plus: '80 PLUS', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', titanium: 'Titanium' };
emit('psu', ['id', 'name', 'price', 'watt', 'eff', 'ff', 'modular'], read('power-supply').map(p => {
  if (!p.wattage) return null;
  const name = /\d{3,4}\s*W/i.test(p.name) ? p.name : `${p.name} ${p.wattage}W`;
  if (known('psu', name)) return null;
  const ff = p.type === 'ATX' ? 'ATX' : p.type === 'SFX' ? 'SFX' : p.type || null;
  return [idOf('psu', name), name, eur(p.price), p.wattage, EFF[p.efficiency] || null, ff, p.modular ? 1 : 0];
}));

emit('cooler', ['id', 'name', 'price', 'type', 'rad'], read('cpu-cooler').map(c => {
  const name = c.size && !new RegExp(String(c.size)).test(c.name) ? `${c.name} ${c.size}` : c.name;
  if (known('cooler', name)) return null;
  return [idOf('cooler', name + '|' + (c.color || '')), name + (c.color && /white|weiß/i.test(c.color) && !/white/i.test(name) ? ' (Weiß)' : ''),
    eur(c.price), c.size ? 'AIO' : 'Luft', c.size || 0];
}));

emit('storage', ['id', 'name', 'price', 'type', 'iface', 'size'], read('internal-hard-drive').map(d => {
  if (!d.capacity) return null;
  const ssd = d.type === 'SSD';
  const m2 = /^M\.2/.test(d.form_factor || '');
  const type = ssd ? (/PCIe/i.test(d.interface || '') ? 'NVMe' : 'SATA-SSD') : 'HDD';
  const iface = m2 ? 'M.2' : /3\.5/.test(d.form_factor || '') ? '3,5"' : '2,5"';
  const size = d.capacity;
  const name = `${d.name} ${size >= 1000 ? (size / 1000) + ' TB' : size + ' GB'}`;
  if (known('storage', name)) return null;
  return [idOf('storage', name + '|' + type), name + (type === 'HDD' ? ' HDD' : type === 'NVMe' ? ' NVMe' : ' SATA-SSD'), eur(d.price), type, iface, size];
}));

function resClass(w, h) {
  if (!w || !h) return null;
  if (h >= 2000 || w >= 3800) return '4K';
  if (h >= 1400) return '1440p';
  return '1080p';
}
emit('monitor', ['id', 'name', 'price', 'res', 'resText', 'hz', 'size', 'panel'], read('monitor').map(m => {
  const [w, h] = m.resolution || [];
  const name = m.screen_size ? `${m.name} ${m.screen_size}"` : m.name;
  if (known('monitor', name)) return null;
  return [idOf('monitor', name), name, eur(m.price), resClass(w, h), w && h ? `${w}×${h}` : null, m.refresh_rate || null, m.screen_size || null, m.panel_type || null];
}));

const keyboards = read('keyboard').map(k => {
  if (known('keyboard', k.name)) return null;
  return [idOf('keyboard', k.name + '|' + (k.color || '')), k.name, eur(k.price), lower(k.switches || k.style), k.tenkeyless ? 'TKL' : 'Fullsize',
    /wireless/i.test(k.connection_type || '') ? 1 : 0];
});
// Custom-Tastaturen aus The Keyboard Catalogue (Markdown-Seiten mit Spezifikationstabelle)
const kbDir = opt('--keyboards');
if (kbDir) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(kbDir, '_posts')).filter(f => f.endsWith('.md'))) {
    const md = fs.readFileSync(f, 'utf8');
    const title = (/^title:\s*"([^"]+)"/m.exec(md) || [])[1];
    if (!title) continue;
    const spec = k => ((new RegExp('\\|\\s*' + k + '\\s*\\|\\s*([^|]+)\\|', 'i').exec(md) || [])[1] || '').trim();
    const size = spec('Size');
    const mount = spec('Mount');
    const cost = /\$\s*([\d,]+)/.exec(spec('Cost'));
    const layout = /^\d+$/.test(size) ? size + ' %' : size || null;
    keyboards.push([idOf('keyboard', 'kbc|' + title), title, cost ? eur(+cost[1].replace(/,/g, '')) : null,
      'Custom' + (mount && mount !== '???' ? ` (${/mount/i.test(mount) ? mount : mount + '-Mount'})` : ''), layout, 0]);
  }
}
emit('keyboard', ['id', 'name', 'price', 'kind', 'layout', 'wireless'], keyboards);
emit('mouse', ['id', 'name', 'price', 'wireless', 'dpi'], read('mouse').map(m => {
  if (known('mouse', m.name)) return null;
  return [idOf('mouse', m.name + '|' + (m.color || '')), m.name, eur(m.price), /wireless/i.test(m.connection_type || '') ? 1 : 0, m.max_dpi || null];
}));
const HP_KIND = { Circumaural: 'Over-Ear', Supraaural: 'On-Ear', 'In Ear': 'In-Ear', Earbud: 'Earbuds' };
const headsets = read('headphones').map(h => {
  if (known('headset', h.name)) return null;
  return [idOf('headset', h.name + '|' + (h.color || '')), h.name, eur(h.price), h.wireless ? 1 : 0, h.microphone ? 1 : 0, HP_KIND[h.type] || h.type || null];
});
// Kopfhörer-Modelle aus AutoEq (Messdatenbank; nur Name und Bauart, keine Preise)
const aeDir = opt('--autoeq');
if (aeDir) {
  const have = new Set(headsets.filter(Boolean).map(r => normText(r[1])));
  const files = execFileSync('git', ['-C', aeDir, 'ls-tree', '-r', '--name-only', 'HEAD', 'results'], { maxBuffer: 64 << 20 }).toString().split('\n');
  const seen = new Set();
  for (const f of files) {
    const p = f.split('/');
    if (p.length < 5) continue;
    const name = p[p.length - 2].replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const n = normText(name);
    if (!name || seen.has(n) || have.has(n) || known('headset', name)) continue;
    seen.add(n);
    const kind = /in-ear/.test(p[2]) ? 'In-Ear' : /earbud/.test(p[2]) ? 'Earbuds' : 'Over-Ear';
    headsets.push([idOf('headset', 'autoeq|' + name), name, null, null, null, kind]);
  }
}
emit('headset', ['id', 'name', 'price', 'wireless', 'mic', 'kind'], headsets);

// Extras: weitere Kategorien aus dem PC-Part-Dataset
const EXTRA_SOURCES = {
  speakers: 'Lautsprecher', webcam: 'Webcam', 'case-fan': 'Gehäuselüfter', 'thermal-paste': 'Wärmeleitpaste',
  'external-hard-drive': 'Externe Festplatte', 'wireless-network-card': 'WLAN-Karte', 'sound-card': 'Soundkarte',
  'case-accessory': 'Gehäuse-Zubehör', 'fan-controller': 'Lüftersteuerung', ups: 'USV', 'wired-network-card': 'Netzwerkkarte',
};
const extras = [];
for (const [file, kind] of Object.entries(EXTRA_SOURCES)) {
  for (const x of read(file)) {
    let name = x.name;
    if (file === 'case-fan' && x.size && !new RegExp(String(x.size)).test(name)) name += ` ${x.size} mm`;
    if (file === 'external-hard-drive' && x.capacity) name += ` ${x.capacity >= 1000 ? x.capacity / 1000 + ' TB' : x.capacity + ' GB'}`;
    if (known('extras', name)) continue;
    extras.push([idOf('extras', file + '|' + name + '|' + (x.color || '')), name + (x.color && file === 'case-fan' ? ` (${x.color})` : ''), eur(x.price), kind]);
  }
}
emit('extras', ['id', 'name', 'price', 'kind'], extras);

const file = path.join(www, 'catalog.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log('Katalog:', JSON.stringify(stats), 'Gesamt', Object.values(stats).reduce((a, b) => a + b, 0), '·', (fs.statSync(file).size / 1e6).toFixed(1), 'MB');
console.log('CPUs ohne Sockel:', out.data.cpu.filter(r => !r[3]).length, '· GPUs ohne Leistungsdaten:', out.data.gpu.filter(r => r[6] == null).length);

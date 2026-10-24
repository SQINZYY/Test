// Logik: Kompatibilität, Leistung, Budget, Upgrade-Berater, Auto-Build und Teilen.
'use strict';

const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));
const BYID = {};
for (const cat of Object.keys(DB)) for (const p of DB[cat]) BYID[cat + ':' + p.id] = p;

function findPart(cat, id) { return BYID[cat + ':' + id] || null; }

function one(b, cat) {
  const id = b.parts[cat];
  return id ? findPart(cat, id) : null;
}

function many(b, cat) {
  return (b.parts[cat] || []).map(id => findPart(cat, id)).filter(Boolean);
}

function partsOf(b, cat) { return CAT[cat].multi ? many(b, cat) : (one(b, cat) ? [one(b, cat)] : []); }

function priceOf(b, cat, p) {
  const o = b.prices && b.prices[cat + ':' + p.id];
  return typeof o === 'number' ? o : p.price;
}

function cloneBuild(b) { return JSON.parse(JSON.stringify(b)); }

// Baut eine Kopie mit ersetztem (oder bei Mehrfach-Slots hinzugefügtem) Teil.
function withPart(b, cat, id) {
  const v = cloneBuild(b);
  if (CAT[cat].multi) v.parts[cat] = (v.parts[cat] || []).concat(id);
  else v.parts[cat] = id;
  return v;
}

function totals(b) {
  const byCat = {};
  let pc = 0, setup = 0;
  for (const c of CATS) {
    const sum = partsOf(b, c.key).reduce((s, p) => s + priceOf(b, c.key, p), 0);
    byCat[c.key] = sum;
    if (c.group === 'pc') pc += sum; else setup += sum;
  }
  return { pc, setup, all: pc + setup, byCat };
}

function roundUp50(x) { return Math.ceil(x / 50) * 50; }

function power(b) {
  const cpu = one(b, 'cpu'), gpu = one(b, 'gpu'), cooler = one(b, 'cooler');
  const draw = (cpu ? cpu.power : 0) + (gpu ? gpu.tdp : 0) + 50 + many(b, 'storage').length * 5 + (cooler && cooler.type === 'AIO' ? 10 : 0);
  const recommended = Math.max(gpu ? gpu.psuRec : 0, roundUp50(draw * 1.25), 450);
  return { draw, recommended };
}

// ---------- Kompatibilität ----------
// Jedes Problem nennt die beteiligten Kategorien (cats), damit die Teileauswahl filtern kann.
// missing = "etwas fehlt noch" – das blockiert keine Auswahl.
function checkBuild(b) {
  const out = [];
  const add = (level, cats, msg, missing) => out.push({ level, cats, msg, missing: !!missing });
  const cpu = one(b, 'cpu'), mb = one(b, 'mb'), ram = one(b, 'ram'), gpu = one(b, 'gpu');
  const psu = one(b, 'psu'), cs = one(b, 'case'), cooler = one(b, 'cooler');
  const st = many(b, 'storage'), mons = many(b, 'monitor');

  if (cpu && mb && cpu.socket !== mb.socket)
    add('error', ['cpu', 'mb'], `Sockel passt nicht: ${cpu.name} braucht ${cpu.socket}, das Mainboard hat ${mb.socket}.`);
  if (cpu && mb && cpu.socket === mb.socket && cpu.newGen && mb.oldChipset)
    add('info', ['cpu', 'mb'], `${mb.name} braucht für den ${cpu.name} evtl. ein BIOS-Update (neue Boards haben es meist schon).`);
  if (cpu && mb && cpu.unlocked && cpu.socket.startsWith('LGA') && !mb.chipset.startsWith('Z'))
    add('info', ['cpu', 'mb'], `Übertakten des ${cpu.name} geht nur mit Z-Chipsatz – ansonsten läuft er normal.`);

  if (ram && mb) {
    if (ram.type !== mb.mem)
      add('error', ['ram', 'mb'], `RAM-Typ passt nicht: Mainboard braucht ${mb.mem}, der RAM ist ${ram.type}.`);
    else {
      if (ram.modules > mb.ramSlots)
        add('error', ['ram', 'mb'], `${ram.modules} RAM-Riegel, aber das Mainboard hat nur ${mb.ramSlots} Steckplätze.`);
      if (ram.size > mb.maxRam)
        add('error', ['ram', 'mb'], `Zu viel RAM: Mainboard unterstützt max. ${mb.maxRam} GB.`);
    }
  }

  if (mb && cs && !cs.ff.includes(mb.ff))
    add('error', ['mb', 'case'], `${mb.ff}-Mainboard passt nicht ins ${cs.name} (unterstützt ${cs.ff.join(', ')}).`);

  if (gpu && cs) {
    if (gpu.len > cs.gpuLen)
      add('error', ['gpu', 'case'], `Grafikkarte zu lang: ${gpu.len} mm, ins Gehäuse passen max. ${cs.gpuLen} mm.`);
    if (gpu.slots > cs.gpuSlots)
      add('error', ['gpu', 'case'], `Grafikkarte zu dick: ${fmtNum(gpu.slots)} Slots, das Gehäuse schafft max. ${fmtNum(cs.gpuSlots)}.`);
  }
  if (gpu && mb && gpu.pcie > mb.pcie)
    add('info', ['gpu', 'mb'], `Die Karte läuft im PCIe-${mb.pcie}.0-x16-Slot (abwärtskompatibel, praktisch kein Leistungsverlust).`);

  if (psu) {
    const pw = power(b);
    // 10 % Reserve für kurze Lastspitzen der Grafikkarte
    if (psu.watt < pw.draw * 1.1)
      add('error', ['psu', 'gpu', 'cpu'], `Netzteil zu schwach: ${psu.watt} W bei ca. ${pw.draw} W Verbrauch (plus Lastspitzen).`);
    else if (psu.watt < pw.recommended)
      add('warn', ['psu', 'gpu', 'cpu'], `Netzteil knapp: empfohlen sind mind. ${pw.recommended} W, du hast ${psu.watt} W.`);
    if (gpu && gpu.conn === '12V-2×6' && !psu.native12v)
      add('info', ['psu', 'gpu'], 'Die Grafikkarte nutzt 12V-2×6 – das Netzteil braucht den beiliegenden Adapter (natives Kabel ist besser).');
    if (cs && cs.psu === 'SFX' && psu.ff !== 'SFX')
      add('error', ['psu', 'case'], `ATX-Netzteil passt nicht ins ${cs.name} – nur SFX-Netzteile.`);
    if (cs && cs.psu === 'ATX' && psu.ff === 'SFX')
      add('info', ['psu', 'case'], 'SFX-Netzteil im ATX-Gehäuse braucht eine SFX-auf-ATX-Halterung.');
  }

  if (cooler && cpu && !cooler.sockets.includes(cpu.socket))
    add('error', ['cooler', 'cpu'], `Kühler unterstützt den Sockel ${cpu.socket} nicht.`);
  if (cooler && cs) {
    if (cooler.type === 'Luft' && cooler.height > cs.coolerH)
      add('error', ['cooler', 'case'], `Kühler zu hoch: ${cooler.height} mm, das Gehäuse erlaubt max. ${cs.coolerH} mm.`);
    if (cooler.type === 'AIO' && cooler.rad > cs.rad)
      add('error', ['cooler', 'case'], cs.rad ? `Radiator zu groß: ${cooler.rad} mm, das Gehäuse schafft max. ${cs.rad} mm.` : 'Das Gehäuse hat keinen Platz für eine Wasserkühlung.');
  }
  if (cooler && cpu && cooler.tdp < cpu.power)
    add('warn', ['cooler', 'cpu'], `Kühler knapp bemessen: ${cpu.name} zieht bis ca. ${cpu.power} W, der Kühler schafft ca. ${cooler.tdp} W.`);
  if (!cooler && cpu && !cpu.boxCooler)
    add('error', ['cooler', 'cpu'], `Kein Kühler: ${cpu.name} wird ohne Kühler geliefert.`, true);

  if (cpu && !gpu && !cpu.igpu)
    add('error', ['gpu', 'cpu'], `Keine Bildausgabe: ${cpu.name} hat keine integrierte Grafik – du brauchst eine Grafikkarte.`, true);

  if (mb) {
    const m2 = st.filter(s => s.iface === 'M.2').length;
    const sata = st.length - m2;
    if (m2 > mb.m2) add('error', ['storage', 'mb'], `Zu viele M.2-SSDs: das Mainboard hat ${mb.m2} M.2-Slot${mb.m2 > 1 ? 's' : ''}.`);
    if (sata > mb.sata) add('error', ['storage', 'mb'], `Zu viele SATA-Laufwerke: das Mainboard hat ${mb.sata} SATA-Anschlüsse.`);
  }
  if (cs) {
    const hdd = st.filter(s => s.iface === '3,5"').length;
    if (hdd > cs.bays35) add('error', ['storage', 'case'], cs.bays35 ? `Nur ${cs.bays35} Platz für 3,5"-Festplatten im Gehäuse.` : 'Das Gehäuse hat keinen Platz für 3,5"-Festplatten.');
  }

  if (gpu && mons.some(m => m.res === '4K') && gpu.score < 45)
    add('info', ['gpu', 'monitor'], 'Für 4K ist die Grafikkarte eher schwach – nutze DLSS/FSR oder spiele in 1440p.');

  for (const c of CATS)
    if (c.required && !partsOf(b, c.key).length)
      add('todo', [c.key], `${c.name} fehlt noch.`, true);

  return out;
}

// Probleme, die ein Kandidat im aktuellen Build verursachen würde.
function checkCandidate(b, cat, id) {
  const v = withPart(b, cat, id);
  return checkBuild(v).filter(i => !i.missing && i.cats.includes(cat));
}

function isCompatible(b, cat, id) {
  return !checkCandidate(b, cat, id).some(i => i.level === 'error');
}

function buildStatus(b) {
  const issues = checkBuild(b);
  const errors = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');
  const todo = issues.filter(i => i.level === 'todo');
  return { issues, errors, warns, todo, ok: !errors.length && !todo.length };
}

// ---------- Leistung ----------
const RES = { '1080p': 3.0, '1440p': 2.15, '4K': 1.2 };

function softMin(a, b) { return Math.pow(Math.pow(a, -4) + Math.pow(b, -4), -0.25); }

function fpsAt(b, res) {
  const cpu = one(b, 'cpu'), gpu = one(b, 'gpu'), ram = one(b, 'ram');
  if (!cpu) return 0;
  const gScore = gpu ? gpu.score : (cpu.igpu ? 4 : 0);
  if (!gScore) return 0;
  let vramF = 1;
  if (gpu && gpu.vram <= 8) vramF = res === '4K' ? 0.75 : res === '1440p' ? 0.93 : 1;
  else if (gpu && gpu.vram <= 12 && res === '4K') vramF = 0.92;
  const ramF = !ram ? 0.9 : ram.size <= 8 ? 0.8 : ram.size <= 16 ? 0.95 : 1;
  return Math.round(softMin(gScore * RES[res] * vramF, cpu.score * 2) * ramF);
}

function perf(b) {
  const cpu = one(b, 'cpu'), gpu = one(b, 'gpu');
  if (!cpu) return null;
  const fps = {};
  for (const r of Object.keys(RES)) fps[r] = fpsAt(b, r);
  let bottleneck = 'none';
  if (gpu) {
    const ratio = (cpu.score * 2) / (gpu.score * RES['1440p']);
    bottleneck = ratio < 0.9 ? 'cpu' : ratio > 1.8 ? 'gpu' : 'balanced';
  } else bottleneck = 'nogpu';
  return { fps, bottleneck };
}

function targetRes(b) {
  const m = many(b, 'monitor')[0];
  return m ? m.res : '1440p';
}

// ---------- Upgrade-Berater ----------
function cheapest(list) { return list.slice().sort((a, b) => a.price - b.price)[0] || null; }

function noErrors(b, cats) {
  return !checkBuild(b).some(i => i.level === 'error' && !i.missing && (!cats || i.cats.some(c => cats.includes(c))));
}

// Fügt bei Bedarf ein passendes Netzteil hinzu, damit der Build funktioniert.
function fixPsu(v) {
  if (noErrors(v, ['psu'])) return { build: v, psu: null };
  const pw = power(v);
  const cs = one(v, 'case');
  const cands = DB.psu.filter(p => p.watt >= pw.recommended && (!cs || cs.psu === 'ATX' ? p.ff === 'ATX' : p.ff === 'SFX'));
  const p = cheapest(cands.filter(p => noErrors(withPart(v, 'psu', p.id), ['psu'])));
  if (!p) return null;
  return { build: withPart(v, 'psu', p.id), psu: p };
}

function upgrades(b) {
  const res = targetRes(b);
  const base = fpsAt(b, res) || 1;
  const cpu = one(b, 'cpu'), gpu = one(b, 'gpu'), mb = one(b, 'mb'), ram = one(b, 'ram');
  const psu = one(b, 'psu'), cooler = one(b, 'cooler'), cs = one(b, 'case');
  const list = [];
  const cost = (v, changes) => changes.reduce((s, [cat, p]) => s + priceOf(v, cat, p), 0);
  const gainOf = v => Math.round((fpsAt(v, res) / base - 1) * 100);

  if (!cpu || !mb) return { res, base: 0, items: [] };

  // Dringende Dinge zuerst
  if (psu) {
    const pw = power(b);
    if (psu.watt < pw.recommended) {
      const p = cheapest(DB.psu.filter(x => x.watt >= pw.recommended && noErrors(withPart(b, 'psu', x.id), ['psu'])));
      if (p) list.push({ kind: 'fix', title: `Netzteil: ${p.name}`, changes: [['psu', p]], cost: priceOf(b, 'psu', p), gain: 0,
        reason: `Dein Netzteil (${psu.watt} W) ist für ca. ${pw.draw} W Verbrauch zu knapp. Empfohlen: mind. ${pw.recommended} W.` });
    }
  }
  if (cpu && ((cooler && cooler.tdp < cpu.power) || (!cooler && cpu.boxCooler && cpu.power > 85))) {
    const c = cheapest(DB.cooler.filter(x => x.tdp >= cpu.power && noErrors(withPart(b, 'cooler', x.id), ['cooler'])));
    if (c) list.push({ kind: 'fix', title: `Kühler: ${c.name}`, changes: [['cooler', c]], cost: priceOf(b, 'cooler', c), gain: 0,
      reason: 'Der aktuelle Kühler ist knapp – ein besserer hält die CPU kühler, leiser und im vollen Boost-Takt.' });
  }

  // Grafikkarte (passend zu Mainboard, Gehäuse, ggf. mit neuem Netzteil)
  const gpuCands = [];
  for (const g of DB.gpu) {
    if (gpu && g.score < gpu.score * 1.12) continue;
    let v = withPart(b, 'gpu', g.id);
    if (!noErrors(v, ['gpu', 'case', 'mb'])) continue;
    const f = fixPsu(v);
    if (!f) continue;
    v = f.build;
    const changes = [['gpu', g]];
    if (f.psu) changes.push(['psu', f.psu]);
    const gain = gainOf(v);
    if (gain < 8) continue;
    gpuCands.push({ kind: 'perf', title: `Grafikkarte: ${g.name}`, changes, cost: cost(v, changes), gain,
      reason: (gpu ? `Ersetzt deine ${gpu.name}.` : 'Eine eigene Grafikkarte statt der integrierten Grafik.') +
        ` Passt auf dein Mainboard (PCIe x16)${cs ? ' und ins Gehäuse (' + g.len + ' / ' + cs.gpuLen + ' mm)' : ''}.` +
        (f.psu ? ` Inklusive neuem Netzteil (${f.psu.watt} W), weil deins nicht reicht.` : '') });
  }
  list.push(...pickSpread(gpuCands));

  // CPU auf gleichem Sockel (kein neues Mainboard nötig)
  const cpuCands = [];
  for (const c of DB.cpu) {
    if (c.socket !== cpu.socket || c.score < cpu.score * 1.08) continue;
    const v = withPart(b, 'cpu', c.id);
    if (!noErrors(v, ['cpu', 'mb', 'gpu'])) continue;
    const gain = gainOf(v);
    if (gain < 5) continue;
    cpuCands.push({ kind: 'perf', title: `CPU: ${c.name}`, changes: [['cpu', c]], cost: priceOf(v, 'cpu', c), gain,
      reason: `Passt auf dein Mainboard (Sockel ${c.socket}) – nur die CPU tauschen.` +
        (!one(v, 'cooler') && !c.boxCooler ? ' Achtung: Diese CPU braucht einen eigenen Kühler.' : '') });
  }
  list.push(...pickSpread(cpuCands, 2));

  // Plattform-Wechsel bei älteren Sockeln
  if (['AM4', 'LGA1700'].includes(cpu.socket)) {
    const plat = [];
    for (const c of DB.cpu.filter(x => ['AM5', 'LGA1851'].includes(x.socket) && x.score > cpu.score * 1.15)) {
      const boards = DB.mb.filter(m => m.socket === c.socket && (!cs || cs.ff.includes(m.ff)));
      const m = cheapest(boards);
      if (!m) continue;
      let v = withPart(withPart(b, 'cpu', c.id), 'mb', m.id);
      const changes = [['cpu', c], ['mb', m]];
      if (!ram || ram.type !== m.mem) {
        const r = cheapest(DB.ram.filter(x => x.type === m.mem && x.size >= Math.max(32, ram ? ram.size : 0) && x.modules <= m.ramSlots));
        if (!r) continue;
        v = withPart(v, 'ram', r.id); changes.push(['ram', r]);
      }
      if (!one(v, 'cooler') && !c.boxCooler) {
        const k = cheapest(DB.cooler.filter(x => x.tdp >= c.power && noErrors(withPart(v, 'cooler', x.id), ['cooler'])));
        if (!k) continue;
        v = withPart(v, 'cooler', k.id); changes.push(['cooler', k]);
      }
      const f = fixPsu(v);
      if (!f) continue;
      v = f.build;
      if (f.psu) changes.push(['psu', f.psu]);
      if (!noErrors(v)) continue;
      const gain = gainOf(v);
      if (gain < 10) continue;
      plat.push({ kind: 'perf', title: `Plattform: ${c.name} + ${m.name}`, changes, cost: cost(v, changes), gain,
        reason: `Neuer Sockel ${c.socket} mit Zukunft – ${changes.map(x => CAT[x[0]].short).join(', ')} werden getauscht.` });
    }
    list.push(...pickSpread(plat, 1));
  }

  // RAM
  if (ram && ram.size < 32) {
    const r = cheapest(DB.ram.filter(x => x.type === mb.mem && x.size >= 32 && x.modules <= mb.ramSlots && x.size <= mb.maxRam));
    if (r) {
      const v = withPart(b, 'ram', r.id);
      list.push({ kind: 'comfort', title: `RAM: ${r.name}`, changes: [['ram', r]], cost: priceOf(v, 'ram', r), gain: gainOf(v),
        reason: `${ram.size} GB werden bei neuen Spielen knapp. 32 GB sorgen für weniger Ruckler – passend zum Mainboard (${mb.mem}).` });
    }
  }

  // Speicher
  const st = many(b, 'storage');
  const total = st.reduce((s, x) => s + x.size, 0);
  const m2Used = st.filter(s => s.iface === 'M.2').length;
  if ((total < 2000 || !st.some(s => s.type === 'NVMe')) && m2Used < mb.m2) {
    const s = findPart('storage', '990evo-2tb');
    list.push({ kind: 'comfort', title: `SSD dazu: ${s.name}`, changes: [['storage', s]], cost: priceOf(b, 'storage', s), gain: 0,
      reason: `${total ? 'Nur ' + fmtSize(total) + ' Speicher' : 'Kein Speicher'}${st.some(x => x.type === 'NVMe') ? '' : ' und keine schnelle NVMe-SSD'}. Moderne Spiele brauchen oft 100 GB+. Freier M.2-Slot vorhanden.` });
  }

  // Monitor
  const mon = many(b, 'monitor')[0];
  if (mon && mon.res === '1080p' && fpsAt(b, '1440p') >= 100) {
    const nm = findPart('monitor', 'g5-27');
    list.push({ kind: 'comfort', title: `Monitor: ${nm.name}`, changes: [['monitor', nm]], cost: priceOf(b, 'monitor', nm), gain: 0, replaceMonitor: true,
      reason: `Deine Grafikkarte schafft ca. ${fpsAt(b, '1440p')} FPS in 1440p – ein schärferer 1440p-Monitor lohnt sich.` });
  }

  for (const it of list) it.value = it.cost ? it.gain / (it.cost / 100) : 0;
  return { res, base, items: list };
}

// Aus vielen Kandidaten: bestes Preis-Leistungs-Verhältnis, größter Sprung und ein Mittelweg.
function pickSpread(cands, n = 3) {
  if (!cands.length) return [];
  const byValue = cands.slice().sort((a, b) => b.gain / b.cost - a.gain / a.cost);
  const byGain = cands.slice().sort((a, b) => b.gain - a.gain || a.cost - b.cost);
  const picks = [byValue[0]];
  if (n > 1 && !picks.includes(byGain[0])) picks.push(byGain[0]);
  if (n > 2) {
    const mid = byValue.find(c => !picks.includes(c) && c.cost < byGain[0].cost);
    if (mid) picks.push(mid);
  }
  picks.forEach(p => {
    if (p === byValue[0]) p.badge = 'Bestes Preis-Leistungs-Verhältnis';
    else if (p === byGain[0]) p.badge = 'Größter Leistungssprung';
  });
  return picks;
}

function applyUpgrade(b, item) {
  const v = cloneBuild(b);
  for (const [cat, p] of item.changes) {
    if (cat === 'monitor' && item.replaceMonitor) v.parts.monitor = [p.id].concat((v.parts.monitor || []).slice(1));
    else if (CAT[cat].multi) v.parts[cat] = (v.parts[cat] || []).concat(p.id);
    else v.parts[cat] = p.id;
  }
  return v;
}

// ---------- Auto-Build nach Budget ----------
function autoBuild(budget, res = '1440p') {
  let best = null;
  const ramSize = budget >= 700 ? 32 : 16;
  const disk = budget >= 1300 ? '990evo-2tb' : 'p3plus-1tb';
  for (const cpu of DB.cpu) {
    for (const gpu of DB.gpu) {
      if (cpu.price + gpu.price > budget * 0.8) continue;
      // Keine schwache CPU zu einer starken Grafikkarte kombinieren
      if (cpu.score < 40 + gpu.score * 0.4) continue;
      const boards = DB.mb.filter(m => m.socket === cpu.socket && m.ff !== 'ITX');
      const mb = cheapest(boards.filter(m => !(cpu.newGen && m.oldChipset))) || cheapest(boards);
      if (!mb) continue;
      const ram = cheapest(DB.ram.filter(r => r.type === mb.mem && r.size === ramSize && r.modules <= mb.ramSlots));
      const cs = cheapest(DB.case.filter(c => c.ff.includes(mb.ff) && c.gpuLen >= gpu.len && c.gpuSlots >= gpu.slots && c.psu === 'ATX'));
      if (!ram || !cs) continue;
      const b = { parts: { cpu: cpu.id, mb: mb.id, ram: ram.id, gpu: gpu.id, storage: [disk], case: cs.id }, prices: {} };
      if (!(cpu.boxCooler && cpu.power <= 90)) {
        const k = cheapest(DB.cooler.filter(x => x.type === 'Luft' && x.tdp >= cpu.power && x.height <= cs.coolerH));
        if (!k) continue;
        b.parts.cooler = k.id;
      }
      const pw = power(b);
      const psu = cheapest(DB.psu.filter(p => p.ff === 'ATX' && p.watt >= pw.recommended && (gpu.conn !== '12V-2×6' || p.native12v)));
      if (!psu) continue;
      b.parts.psu = psu.id;
      const t = totals(b).pc;
      if (t > budget || !noErrors(b)) continue;
      const fps = fpsAt(b, res);
      if (!best || fps > best.fps * 1.01 || (fps >= best.fps * 0.99 && t < best.total)) best = { parts: b.parts, fps, total: t };
    }
  }
  return best;
}

// ---------- Teilen ----------
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBuild(b, author) {
  const prices = {};
  for (const [k, v] of Object.entries(b.prices || {})) {
    const [cat, id] = k.split(':');
    const p = findPart(cat, id);
    if (p && p.price !== v) prices[k] = v;
  }
  const data = { v: 1, n: b.name, p: b.parts };
  if (author) data.a = author;
  if (b.kind === 'mine') data.m = 1;
  if (Object.keys(prices).length) data.pr = prices;
  if (b.budget) data.b = b.budget;
  return 'SB1.' + b64urlEncode(JSON.stringify(data));
}

// Liest einen Build-Code aus beliebigem Text (z. B. einer WhatsApp-Nachricht).
function decodeBuild(text) {
  const m = /SB1\.([A-Za-z0-9_-]+)/.exec(text || '');
  if (!m) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(m[1])); } catch (e) { return null; }
  if (!data || typeof data !== 'object' || typeof data.p !== 'object' || !data.p) return null;
  const parts = {};
  let unknown = 0;
  for (const c of CATS) {
    const val = data.p[c.key];
    if (val == null) continue;
    if (c.multi) {
      const ids = (Array.isArray(val) ? val : []).slice(0, c.max).filter(id => typeof id === 'string');
      const ok = ids.filter(id => findPart(c.key, id));
      unknown += ids.length - ok.length;
      if (ok.length) parts[c.key] = ok;
    } else if (typeof val === 'string' && findPart(c.key, val)) parts[c.key] = val;
    else unknown++;
  }
  const prices = {};
  if (data.pr && typeof data.pr === 'object') {
    for (const [k, v] of Object.entries(data.pr)) {
      const [cat, id] = String(k).split(':');
      if (CAT[cat] && findPart(cat, id) && typeof v === 'number' && v >= 0 && v <= 100000) prices[cat + ':' + id] = Math.round(v);
    }
  }
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
  return {
    build: { name: str(data.n, 60) || 'Geteilter PC', parts, prices, budget: typeof data.b === 'number' && data.b > 0 && data.b < 1e6 ? Math.round(data.b) : 0 },
    author: str(data.a, 40), wasMine: data.m === 1, unknown,
  };
}

function shareText(b, author) {
  const t = totals(b);
  const lines = [`🖥️ ${b.kind === 'mine' ? 'Mein PC' : 'PC-Build'} „${b.name}“${author ? ' von ' + author : ''} – erstellt mit SetupBuilder`, ''];
  for (const c of CATS) {
    const ps = partsOf(b, c.key);
    if (ps.length) lines.push(`${c.short}: ${ps.map(p => p.name).join(' + ')}`);
  }
  lines.push('');
  lines.push(`Gesamt: ca. ${fmtEur(t.all)}${t.setup ? ` (PC ${fmtEur(t.pc)})` : ''}`);
  const pf = perf(b);
  if (pf && pf.fps['1440p']) lines.push(`Geschätzt: ~${pf.fps['1080p']} FPS (1080p) · ~${pf.fps['1440p']} FPS (1440p)`);
  lines.push('', 'In SetupBuilder öffnen: Code kopieren → „Meine PCs“ → „Code importieren“', encodeBuild(b, author));
  return lines.join('\n');
}

// ---------- Format ----------
function fmtNum(n) { return String(n).replace('.', ','); }
function fmtEur(n) { return Math.round(n).toLocaleString('de-DE') + ' €'; }
function fmtSize(gb) { return gb >= 1000 ? fmtNum(+(gb / 1000).toFixed(1)) + ' TB' : gb + ' GB'; }

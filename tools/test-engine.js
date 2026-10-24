// Prüft Datenbank, Vorlagen und Logik ohne Browser: node tools/test-engine.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const www = path.join(__dirname, '..', 'app', 'assets', 'www');
const ctx = vm.createContext({ console, TextEncoder, TextDecoder, btoa, atob });
for (const f of ['data.js', 'engine.js', 'import.js']) vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), ctx, { filename: f });
const E = vm.runInContext('({ matchLine, itemsFromHtml, itemsFromText, parseListUrl, applyImport, parsePrice, DB, CATS, PRESETS, checkBuild, checkCandidate, buildStatus, perf, upgrades, autoBuild, encodeBuild, decodeBuild, shareText, totals, power, fpsAt })', ctx);

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.log('FAIL', msg); } };

// IDs eindeutig
for (const [cat, list] of Object.entries(E.DB)) {
  const ids = list.map(p => p.id);
  ok(new Set(ids).size === ids.length, `doppelte IDs in ${cat}`);
}

// Vorlagen sind vollständig und kompatibel
for (const p of E.PRESETS) {
  const b = { name: p.name, parts: p.parts, prices: {} };
  const st = E.buildStatus(b);
  ok(st.ok, `Vorlage ${p.id}: ${st.issues.filter(i => i.level === 'error' || i.level === 'todo').map(i => i.msg).join(' | ')}`);
  const pf = E.perf(b);
  console.log(`${p.id.padEnd(12)} PC ${E.totals(b).pc} € / gesamt ${E.totals(b).all} € · FPS ${JSON.stringify(pf.fps)} · ${pf.bottleneck} · ${E.power(b).draw} W, Warnungen: ${st.warns.length}`);
}

// Sockel-Filter: AM5-Mainboard -> nur AM5-CPUs
const am5 = { parts: { mb: 'b650m-a' }, prices: {} };
const cpus = E.DB.cpu.filter(c => !E.checkCandidate(am5, 'cpu', c.id).some(i => i.level === 'error'));
ok(cpus.every(c => c.socket === 'AM5') && cpus.length === E.DB.cpu.filter(c => c.socket === 'AM5').length, 'CPU-Filter nach Sockel');

// GPU-Filter: kleines Gehäuse + schwaches Netzteil
const small = { parts: { mb: 'b650i-lightning', case: 'terra', psu: 'sf750', cpu: 'r7-9800x3d' }, prices: {} };
const gpus = E.DB.gpu.filter(g => !E.checkCandidate(small, 'gpu', g.id).some(i => i.level === 'error')).map(g => g.id);
ok(!gpus.includes('rtx5080') && !gpus.includes('rtx5090') && !gpus.includes('rtx4080s'), 'GPU-Filter Gehäuse/Netzteil: ' + gpus);
ok(gpus.includes('rtx5070'), 'RTX 5070 passt ins Terra');

// RAM: 4 Riegel passen nicht auf ITX
ok(E.checkCandidate(small, 'ram', 'ddr5-64-4x16').some(i => i.level === 'error'), '4 Riegel auf ITX');
ok(E.checkCandidate(small, 'ram', 'ddr4-32-3600').some(i => i.level === 'error'), 'DDR4 auf DDR5-Board');

// Teilen hin und zurück
const b = { name: 'Mein „Test“ PC äöü', kind: 'mine', parts: E.PRESETS[0].parts, prices: { 'gpu:rx9070xt': 640 }, budget: 2000 };
const code = E.encodeBuild(b, 'Max');
const back = E.decodeBuild('Schau mal: ' + code + ' cool oder?');
ok(back && back.build.name === b.name && back.author === 'Max' && back.build.prices['gpu:rx9070xt'] === 640 && JSON.stringify(back.build.parts) === JSON.stringify(b.parts), 'Code round-trip');
ok(E.decodeBuild('SB1.kaputt!!') === null, 'kaputter Code');
ok(E.decodeBuild('SB1.' + Buffer.from(JSON.stringify({ v: 1, n: '<img src=x>', p: { cpu: 'nope', gpu: 'rtx5070' } })).toString('base64url')).unknown === 1, 'unbekannte Teile');

// Upgrades für einen älteren PC
const old = { name: 'Alt', parts: { cpu: 'i5-12400f', mb: 'b760m-d4', ram: 'ddr4-16-3200', gpu: 'rx6600', storage: ['870evo-1tb'], psu: 'sp10-550', case: 'citadel', monitor: ['aoc-24g2'] }, prices: {} };
const up = E.upgrades(old);
console.log('Upgrades (' + up.res + ', Basis ' + up.base + ' FPS):');
for (const it of up.items) console.log(`  [${it.kind}] ${it.title} · ${it.cost} € · +${it.gain} % ${it.badge ? '· ' + it.badge : ''}`);
ok(up.items.length >= 4, 'genug Upgrade-Vorschläge');
for (const it of up.items) {
  const v = vm.runInContext('applyUpgrade', ctx)(old, it);
  const errs = E.checkBuild(v).filter(i => i.level === 'error' && !i.missing);
  ok(!errs.length, `Upgrade ${it.title} erzeugt Fehler: ${errs.map(e => e.msg)}`);
}

// Auto-Build
for (const budget of [600, 800, 1000, 1500, 2500, 4000]) {
  const a = E.autoBuild(budget);
  ok(a && a.total <= budget, 'Auto-Build ' + budget);
  if (a) console.log(`Auto ${budget} €: ${a.total} € · ${a.fps} FPS · ${a.parts.cpu} + ${a.parts.gpu} + ${a.parts.mb} + ${a.parts.psu} + ${a.parts.case}`);
}


// Neue Regeln: Stromstecker, PCIe 3.0 x8, RAM-Takt auf H610
const errOf = (parts, re) => E.checkBuild({ parts, prices: {} }).some(i => re.test(i.msg));
ok(errOf({ gpu: 'rtx5070ti', psu: 'mwe650' }, /Adapter benötigt 3/), '12V-2x6-Adapter braucht 3 Stecker');
ok(!errOf({ gpu: 'rtx5070ti', psu: 'rm850x' }, /Stecker|Adapter benötigt/), 'natives 12V-2x6');
ok(errOf({ gpu: 'rtx4060', mb: 'b450-tomahawk' }, /8 PCIe-Lanes/), 'PCIe 3.0 x8 Warnung');
ok(errOf({ ram: 'ddr4-32-3600', mb: 'h610m-d4' }, /kein XMP/), 'H610 ohne XMP');

// Erkennung von Produktnamen (Geizhals-Schreibweise, Shop-Text, OCR)
const cases = [
  ['AMD Ryzen 7 9800X3D, 8C/16T, 4.70-5.20GHz, boxed ohne Kühler', 'cpu', 'r7-9800x3d', 'exact'],
  ['AMD Ryzen 5 7600, 6C/12T, 3.80-5.10GHz, boxed', 'cpu', 'r5-7600', 'exact'],
  ['AMD Ryzen 5 7600X, 6C/12T', 'cpu', 'r5-7600x', 'exact'],
  ['Intel Core i5-14600K, 6C+8c/20T', 'cpu', 'i5-14600k', 'exact'],
  ['Intel Core i5-14600KF', 'cpu', null, null],
  ['Sapphire Pulse Radeon RX 9070 XT, 16GB GDDR6', 'gpu', 'rx9070xt', 'exact'],
  ['PowerColor Hellhound Radeon RX 9070 XT, 16GB', 'gpu', 'rx9070xt', 'similar'],
  ['PowerColor Reaper Radeon RX 9070, 16GB GDDR6', 'gpu', 'rx9070', 'exact'],
  ['ASUS TUF Gaming GeForce RTX 5070 Ti OC, 16GB GDDR7', 'gpu', 'rtx5070ti', 'similar'],
  ['Gigabyte GeForce RTX 5070 Windforce OC SFF 12G', 'gpu', 'rtx5070', 'exact'],
  ['GeForce RTX5070Ti', 'gpu', 'rtx5070ti', 'similar'],
  ['MSI GeForce RTX 4070 Ti SUPER Ventus 2X', 'gpu', 'rtx4070tis', 'similar'],
  ['MSI PRO B650M-A WIFI', 'mb', 'b650m-a', 'exact'],
  ['ASUS TUF Gaming B650-PLUS WIFI', 'mb', 'b650-tuf', 'exact'],
  ['Kingston FURY Beast DIMM Kit 32GB, DDR5-6000, CL30-36-36', 'ram', 'ddr5-32-6000k', 'exact'],
  ['Kingston FURY Beast DIMM Kit 32GB, DDR4-3600, CL18', 'ram', 'ddr4-32-3600', 'exact'],
  ['Corsair Vengeance LPX schwarz DIMM Kit 16GB, DDR4-3200', 'ram', 'ddr4-16-3200', 'exact'],
  ['G.Skill Aegis DIMM Kit 32GB, DDR5-6000', 'ram', 'ddr5-32-6000k', 'similar'],
  ['Samsung SSD 990 EVO Plus 2TB, M.2', 'storage', '990evo-2tb', 'exact'],
  ['Crucial P3 Plus SSD 2TB, M.2', 'storage', 'p3plus-2tb', 'exact'],
  ['Thermalright Peerless Assassin 120 SE', 'cooler', 'pa120se', 'exact'],
  ['Arctic Liquid Freezer III Pro 360 A-RGB schwarz', 'cooler', 'lf3-360', 'exact'],
  ['be quiet! Pure Power 12 M 850W ATX 3.0', 'psu', 'pp12m-850', 'exact'],
  ['be quiet! Pure Power 12 M 650W', 'psu', 'pp12m-650', 'exact'],
  ['Corsair RM850x (2024), 850W ATX 3.1', 'psu', 'rm850x', 'exact'],
  ['Lian Li Lancool 216 RGB schwarz', 'case', 'lancool216', 'exact'],
  ['Fractal Design North Charcoal Black TG Dark', 'case', 'north', 'exact'],
  ['Samsung Odyssey G5 G55C, 27"', 'monitor', 'g5-27', 'exact'],
  ['Montech XR schwarz, Glasfenster', 'case', null, 'custom'],
  ['Montech HyperFlow 360 ARGB, Wasserkühlung', 'cooler', 'lf3-360', 'similar'],
];
for (const [text, cat, id, q] of cases) {
  const m = E.matchLine(text);
  const got = m ? `${m.cat}/${m.id}/${m.quality}` : 'nichts';
  ok(id === null && q === null ? !m || m.id !== 'i5-14600k' : m && m.cat === cat && m.id === id && m.quality === q, `Erkennung "${text}" -> ${got}`);
}

// Geizhals-Wunschliste (vereinfachtes HTML)
const html = `<html><body><div class="wishlist">
  <div class="row"><a href="/amd-ryzen-7-9800x3d-100-100001084wof-a3330000.html"><img alt=""></a>
    <a href="/amd-ryzen-7-9800x3d-100-100001084wof-a3330000.html">AMD Ryzen 7 9800X3D, 8C/16T, 4.70-5.20GHz, boxed ohne K&uuml;hler</a>
    <span class="price">&euro; 459,00</span></div>
  <div class="row"><a href="https://geizhals.de/msi-mag-b650-tomahawk-wifi-a2823000.html" title="MSI MAG B650 Tomahawk WIFI">MSI MAG B650 Tomahawk WIFI</a> <span>€ 189,90</span></div>
  <div class="row"><a href="/sapphire-pulse-radeon-rx-9070-xt-a3400000.html">Sapphire Pulse Radeon RX 9070 XT, 16GB GDDR6, HDMI, 2x DP</a> <span>ab € 649,-</span></div>
  <div class="row"><a href="/montech-xr-a3000000.html">Montech XR schwarz, Glasfenster</a> <span>€ 79,90</span></div>
</div></body></html>`;
const hi = E.itemsFromHtml(html);
ok(hi.length === 4 && hi[0].id === 'r7-9800x3d' && hi[0].price === 459 && hi[1].id === 'b650-tomahawk' && hi[1].price === 190 && hi[2].id === 'rx9070xt' && hi[2].price === 649 && hi[3].quality === 'custom' && hi[3].cat === 'case',
  'Geizhals-HTML: ' + JSON.stringify(hi.map(i => [i.cat, i.id, i.price, i.quality])));
ok(E.parseListUrl('Schau: https://geizhals.de/?cat=WL-2970563 danke').url === 'https://geizhals.de/wishlists/2970563', 'alter Wunschlisten-Link');
ok(E.parsePrice('€ 1.149,00') === 1149 && E.parsePrice('129,90 €') === 130 && E.parsePrice('ab € 649,-') === 649, 'Preise');

// Kopierter Text mit umbrochenen Namen
const txt = `Meine Liste
2x Samsung Odyssey G5
27" 1440p   219,00 €
Gigabyte GeForce RTX 5070
Windforce OC 12G   579,00 €
Irgendein Text ohne Bedeutung`;
const ti = E.itemsFromText(txt);
ok(ti.length === 2 && ti[0].id === 'g5-27' && ti[0].qty === 2 && ti[0].price === 219 && ti[1].id === 'rtx5070' && ti[1].price === 579, 'Text-Import: ' + JSON.stringify(ti.map(i => [i.id, i.qty, i.price])));
const applied = E.applyImport({ parts: {}, prices: {} }, hi, true);
ok(applied.parts.cpu === 'r7-9800x3d' && applied.prices['gpu:rx9070xt'] === 649 && applied.customs.length === 1, 'Import anwenden');
const st2 = E.buildStatus(applied);
ok(!st2.todo.some(t => t.cats[0] === 'case'), 'eigenes Gehäuse zählt als vorhanden');
const rt = E.decodeBuild(E.encodeBuild(applied));
ok(rt.build.customs.length === 1 && rt.build.customs[0].name.startsWith('Montech XR'), 'eigene Teile im Code');

console.log(E.shareText(b, 'Max').split('\n').slice(0, 3).join('\n'));
console.log(failed ? `${failed} Test(s) fehlgeschlagen` : 'Alle Tests bestanden');
process.exit(failed ? 1 : 0);

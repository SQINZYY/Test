// Prüft Datenbank, Vorlagen und Logik ohne Browser: node tools/test-engine.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const www = path.join(__dirname, '..', 'app', 'assets', 'www');
const ctx = vm.createContext({ console, TextEncoder, TextDecoder, btoa, atob });
for (const f of ['data.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), ctx, { filename: f });
const E = vm.runInContext('({ DB, CATS, PRESETS, checkBuild, checkCandidate, buildStatus, perf, upgrades, autoBuild, encodeBuild, decodeBuild, shareText, totals, power, fpsAt })', ctx);

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
ok(cpus.every(c => c.socket === 'AM5') && cpus.length === 5, 'CPU-Filter nach Sockel');

// GPU-Filter: kleines Gehäuse + schwaches Netzteil
const small = { parts: { mb: 'b650i-lightning', case: 'terra', psu: 'sf750', cpu: 'r7-9800x3d' }, prices: {} };
const gpus = E.DB.gpu.filter(g => !E.checkCandidate(small, 'gpu', g.id).some(i => i.level === 'error')).map(g => g.id);
ok(!gpus.includes('rx9070xt') && !gpus.includes('rtx5080') && !gpus.includes('rtx5090'), 'GPU-Filter Gehäuse/Netzteil: ' + gpus);
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

console.log(E.shareText(b, 'Max'));
console.log(failed ? `${failed} Test(s) fehlgeschlagen` : 'Alle Tests bestanden');
process.exit(failed ? 1 : 0);

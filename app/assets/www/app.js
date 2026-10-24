// Oberfläche von SetupBuilder.
'use strict';

const Native = window.Android || null;
const $ = sel => document.querySelector(sel);

// ---------- Icons ----------
const P = {
  home: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  build: '<rect x="4" y="3" width="10" height="18" rx="2"/><path d="M7 7h4M7 10h4"/><circle cx="9" cy="16" r="1.5"/><path d="M17 8h3M17 12h3M17 16h3"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.2"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/><path d="M5 20h14"/>',
  list: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h1M7 17h1"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  mb: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5"/><path d="M15 7h2M15 10h2M7 16h10"/>',
  ram: '<rect x="2" y="7" width="20" height="9" rx="1"/><path d="M6 10v3M10 10v3M14 10v3M18 10v3M5 16v2M19 16v2"/>',
  gpu: '<rect x="2" y="6" width="20" height="11" rx="2"/><circle cx="8" cy="11.5" r="3"/><circle cx="16" cy="11.5" r="3"/><path d="M4 17v2h7"/>',
  storage: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h6"/><circle cx="17" cy="12" r="1"/>',
  cooler: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 10c-1-3 0-5 2-6M14 12c3-1 5 0 6 2M12 14c1 3 0 5-2 6M10 12c-3 1-5 0-6-2"/>',
  psu: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="10" cy="12" r="4"/><path d="M17 9v2M17 14l-1.5 2h3L17 18"/>',
  case: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 6h6"/><circle cx="12" cy="14" r="3"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M9 21h6M12 17v4"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  chair: '<path d="M7 3h10v9H7z"/><path d="M5 12h14v3H5zM12 15v4M7 21l5-2 5 2"/>',
  desk: '<path d="M2 8h20M4 8v12M20 8v12M14 8v7h6"/>',
  extras: '<path d="M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- Hilfen ----------
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Speicher ----------
const KEY = 'setupbuilder.state.v1';
function loadState() {
  let raw = null;
  try { raw = Native ? Native.load(KEY) : localStorage.getItem(KEY); } catch (e) { raw = null; }
  try { if (raw) return JSON.parse(raw); } catch (e) { /* kaputter Speicher -> neu anfangen */ }
  return null;
}
function persist() {
  const raw = JSON.stringify(S);
  try { if (Native) Native.save(KEY, raw); else localStorage.setItem(KEY, raw); } catch (e) { /* ignorieren */ }
}

function newBuild(name, kind = 'plan', parts = {}) {
  return { id: uid(), name, kind, parts: JSON.parse(JSON.stringify(parts)), prices: {}, budget: 1200, created: Date.now(), updated: Date.now() };
}

let S = loadState();
if (!S || !Array.isArray(S.builds)) {
  const first = newBuild('Mein erster Build');
  S = { v: 1, builds: [first], currentId: first.id, author: '', budgetScope: 'pc', upgradeBudget: 500, upgradeId: null };
}
if (!S.builds.length) { const f = newBuild('Mein erster Build'); S.builds.push(f); S.currentId = f.id; }

function cur() {
  let b = S.builds.find(x => x.id === S.currentId);
  if (!b) { b = S.builds[0]; S.currentId = b.id; }
  return b;
}
function touch(b) { b.updated = Date.now(); persist(); refresh(); }
function addBuild(b, open = true) {
  S.builds.unshift(b);
  if (open) S.currentId = b.id;
  persist();
}

// ---------- Spezifikationen ----------
const yesNo = v => (v ? 'Ja' : 'Nein');
const SPECS = {
  cpu: [
    { l: 'Sockel', g: p => p.socket },
    { l: 'Kerne / Threads', g: p => `${p.cores} / ${p.threads}`, v: p => p.cores, better: 'high' },
    { l: 'Boost-Takt', g: p => fmtNum(p.boost) + ' GHz', v: p => p.boost, better: 'high' },
    { l: 'Verbrauch (max.)', g: p => p.power + ' W', v: p => p.power, better: 'low' },
    { l: 'Gaming-Leistung', g: p => p.score + ' / 100', v: p => p.score, better: 'high' },
    { l: 'Integrierte Grafik', g: p => yesNo(p.igpu) },
    { l: 'Kühler dabei', g: p => yesNo(p.boxCooler) },
  ],
  mb: [
    { l: 'Sockel', g: p => p.socket }, { l: 'Chipsatz', g: p => p.chipset }, { l: 'Formfaktor', g: p => p.ff },
    { l: 'RAM', g: p => `${p.mem}, ${p.ramSlots} Slots, max. ${p.maxRam} GB`, v: p => p.maxRam, better: 'high' },
    { l: 'Grafikkarten-Slot', g: p => `PCIe ${p.pcie}.0 x16`, v: p => p.pcie, better: 'high' },
    { l: 'M.2-Slots', g: p => p.m2, v: p => p.m2, better: 'high' },
    { l: 'SATA', g: p => p.sata, v: p => p.sata, better: 'high' },
    { l: 'WLAN', g: p => yesNo(p.wifi) },
  ],
  ram: [
    { l: 'Typ', g: p => p.type }, { l: 'Kapazität', g: p => p.size + ' GB', v: p => p.size, better: 'high' },
    { l: 'Riegel', g: p => `${p.modules}× ${p.size / p.modules} GB` },
    { l: 'Takt', g: p => p.speed + ' MT/s', v: p => p.speed, better: 'high' },
    { l: 'Latenz', g: p => 'CL' + p.cl, v: p => p.cl, better: 'low' },
  ],
  gpu: [
    { l: 'Grafikspeicher', g: p => p.vram + ' GB', v: p => p.vram, better: 'high' },
    { l: 'Gaming-Leistung', g: p => p.score + ' / 100', v: p => p.score, better: 'high' },
    { l: 'Länge', g: p => p.len + ' mm', v: p => p.len, better: 'low' },
    { l: 'Dicke', g: p => fmtNum(p.slots) + ' Slots', v: p => p.slots, better: 'low' },
    { l: 'Verbrauch', g: p => p.tdp + ' W', v: p => p.tdp, better: 'low' },
    { l: 'Netzteil empfohlen', g: p => p.psuRec + ' W' },
    { l: 'Stromanschluss', g: p => p.conn },
    { l: 'Anbindung', g: p => `PCIe ${p.pcie}.0 x${p.lanes}` },
  ],
  storage: [
    { l: 'Typ', g: p => p.type }, { l: 'Bauform', g: p => p.iface },
    { l: 'Kapazität', g: p => fmtSize(p.size), v: p => p.size, better: 'high' },
    { l: 'Lesen', g: p => p.read.toLocaleString('de-DE') + ' MB/s', v: p => p.read, better: 'high' },
  ],
  cooler: [
    { l: 'Art', g: p => (p.type === 'AIO' ? 'Wasserkühlung (AIO)' : 'Luftkühler') },
    { l: 'Größe', g: p => (p.type === 'AIO' ? p.rad + ' mm Radiator' : p.height + ' mm hoch') },
    { l: 'Kühlleistung', g: p => 'ca. ' + p.tdp + ' W', v: p => p.tdp, better: 'high' },
    { l: 'Sockel', g: p => p.sockets.join(', ') },
  ],
  psu: [
    { l: 'Leistung', g: p => p.watt + ' W', v: p => p.watt, better: 'high' },
    { l: 'Effizienz', g: p => '80 PLUS ' + p.eff }, { l: 'Bauform', g: p => p.ff },
    { l: '12V-2×6-Kabel', g: p => yesNo(p.native12v) }, { l: 'Modular', g: p => yesNo(p.modular) },
  ],
  case: [
    { l: 'Mainboards', g: p => p.ff.join(', ') },
    { l: 'Grafikkarte max.', g: p => `${p.gpuLen} mm, ${fmtNum(p.gpuSlots)} Slots`, v: p => p.gpuLen, better: 'high' },
    { l: 'CPU-Kühler max.', g: p => p.coolerH + ' mm', v: p => p.coolerH, better: 'high' },
    { l: 'Radiator max.', g: p => (p.rad ? p.rad + ' mm' : '–'), v: p => p.rad, better: 'high' },
    { l: 'Netzteil', g: p => p.psu }, { l: '3,5"-Plätze', g: p => p.bays35 }, { l: 'Farbe', g: p => p.color },
  ],
  monitor: [
    { l: 'Auflösung', g: p => p.res }, { l: 'Bildrate', g: p => p.hz + ' Hz', v: p => p.hz, better: 'high' },
    { l: 'Größe', g: p => p.size + '"' }, { l: 'Panel', g: p => p.panel },
  ],
  keyboard: [{ l: 'Schalter', g: p => p.kind }, { l: 'Layout', g: p => p.layout }],
  mouse: [{ l: 'Gewicht', g: p => p.weight + ' g', v: p => p.weight, better: 'low' }, { l: 'Kabellos', g: p => yesNo(p.wireless) }],
  headset: [{ l: 'Kabellos', g: p => yesNo(p.wireless) }],
  chair: [{ l: 'Art', g: p => p.kind }],
  desk: [{ l: 'Größe', g: p => p.size }, { l: 'Höhenverstellbar', g: p => yesNo(p.adjustable) }],
  extras: [{ l: 'Art', g: p => p.kind }],
};
// Kurze Infos in der Liste
const CHIPS = {
  cpu: p => [p.socket, `${p.cores} Kerne`, fmtNum(p.boost) + ' GHz', p.power + ' W', p.igpu ? 'iGPU' : 'ohne iGPU'],
  mb: p => [p.socket, p.ff, p.mem, `PCIe ${p.pcie}.0`, `${p.m2}× M.2`],
  ram: p => [p.type, p.size + ' GB', p.speed + ' MT/s', `${p.modules} Riegel`],
  gpu: p => [p.vram + ' GB', p.len + ' mm', fmtNum(p.slots) + ' Slots', p.tdp + ' W'],
  storage: p => [p.type, fmtSize(p.size), p.iface],
  cooler: p => [p.type, p.type === 'AIO' ? p.rad + ' mm' : p.height + ' mm', p.tdp + ' W'],
  psu: p => [p.watt + ' W', p.eff, p.ff],
  case: p => [p.ff.join('/'), 'GPU ≤ ' + p.gpuLen + ' mm', 'Kühler ≤ ' + p.coolerH + ' mm', p.psu],
  monitor: p => [p.res, p.hz + ' Hz', p.size + '"', p.panel],
  keyboard: p => [p.kind, p.layout],
  mouse: p => [p.weight + ' g', p.wireless ? 'kabellos' : 'Kabel'],
  headset: p => [p.wireless ? 'kabellos' : 'Kabel'],
  chair: p => [p.kind],
  desk: p => [p.size, p.adjustable ? 'höhenverstellbar' : 'fest'],
  extras: p => [p.kind],
};

// ---------- Szene (Setup-Illustration) ----------
function scene(t, monitors = 2, tall = false) {
  const id = 's' + Math.random().toString(36).slice(2, 8);
  const h = tall ? 220 : 180;
  const mons = [];
  const n = clamp(monitors, 1, 3);
  const w = n === 1 ? 110 : n === 2 ? 92 : 72;
  const gap = 8;
  const total = n * w + (n - 1) * gap;
  const x0 = 150 - total / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w + gap);
    const y = h - 120;
    const mh = w * 0.58;
    mons.push(`<rect x="${x}" y="${y}" width="${w}" height="${mh}" rx="3" fill="#05090b"/>
      <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${mh - 6}" rx="1.5" fill="url(#${id}sc)"/>
      <path d="M${x + 3} ${y + mh - 12} l${w * 0.22} -${mh * 0.32} l${w * 0.16} ${mh * 0.18} l${w * 0.2} -${mh * 0.28} l${w * 0.36 - 6} ${mh * 0.42} z" fill="${t.light}" opacity=".35"/>
      <rect x="${x + w / 2 - 2.5}" y="${y + mh}" width="5" height="${116 - mh - 4}" fill="#0b1013"/>
      <rect x="${x + w / 2 - 12}" y="${h - 50}" width="24" height="3" rx="1.5" fill="#0b1013"/>`);
  }
  return `<svg class="scene" viewBox="0 0 300 ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.wall}"/><stop offset="1" stop-color="${t.wall2}"/></linearGradient>
      <radialGradient id="${id}g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${t.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}sc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.screen}"/><stop offset="1" stop-color="${t.wall2}"/></linearGradient>
      <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.wall2}"/><stop offset="1" stop-color="#000"/></linearGradient>
    </defs>
    <rect width="300" height="${h}" fill="url(#${id}w)"/>
    <rect x="18" y="16" width="264" height="2" rx="1" fill="${t.light}" opacity=".8"/>
    <rect x="18" y="14" width="264" height="10" fill="${t.glow}" opacity=".12"/>
    <ellipse cx="150" cy="${h - 90}" rx="160" ry="85" fill="url(#${id}g)"/>
    <rect y="${h - 26}" width="300" height="26" fill="url(#${id}f)"/>
    ${mons.join('')}
    <rect x="248" y="${h - 96}" width="34" height="50" rx="3" fill="#06090b" stroke="${t.light}" stroke-opacity=".35"/>
    <circle cx="265" cy="${h - 82}" r="7" fill="none" stroke="${t.glow}" stroke-width="2.5"/>
    <circle cx="265" cy="${h - 62}" r="7" fill="none" stroke="${t.glow}" stroke-width="2.5"/>
    <rect x="12" y="${h - 47}" width="276" height="6" rx="1.5" fill="${t.desk}"/>
    <rect x="22" y="${h - 41}" width="5" height="41" fill="${t.desk}" opacity=".8"/>
    <rect x="273" y="${h - 41}" width="5" height="41" fill="${t.desk}" opacity=".8"/>
    <rect x="112" y="${h - 51}" width="62" height="4" rx="1" fill="#0b1013"/>
    <rect x="114" y="${h - 50}" width="58" height="1" fill="${t.light}" opacity=".5"/>
    <ellipse cx="190" cy="${h - 49}" rx="4" ry="2.5" fill="#0b1013"/>
    <path d="M118 ${h} v-46 q0 -14 14 -14 h36 q14 0 14 14 v46 z" fill="#020405" opacity=".85"/>
    <path d="M126 ${h - 52} q24 -8 48 0" stroke="${t.glow}" stroke-opacity=".5" fill="none"/>
  </svg>`;
}
const DEFAULT_THEME = PRESETS[0].theme;

// ---------- Navigation ----------
const TABS = [
  { key: 'home', label: 'Entdecken', icon: 'home' },
  { key: 'builder', label: 'Builder', icon: 'build' },
  { key: 'budget', label: 'Budget', icon: 'wallet' },
  { key: 'upgrades', label: 'Upgrades', icon: 'up' },
  { key: 'mine', label: 'Meine PCs', icon: 'list' },
];
let tab = 'home';
const sheets = [];

function setTab(t) {
  tab = t;
  sheets.length = 0;
  renderSheets();
  refresh();
  $('#view').scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderNav() {
  $('#nav').innerHTML = TABS.map(t => `<button class="${t.key === tab ? 'on' : ''}" data-a="tab" data-t="${t.key}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
}

function refresh() {
  renderNav();
  $('#view').innerHTML = VIEWS[tab]();
  if (sheets.length) renderSheets();
}

// Sheets = Vollbild-Seiten über dem Tab (Teileauswahl, Details, Vergleich …)
function openSheet(s) { sheets.push(s); renderSheets(); }
function closeSheet() { sheets.pop(); renderSheets(); refresh(); }
function renderSheets() {
  const box = $('#sheets');
  const keep = box.children.length;
  box.innerHTML = sheets.map((s, i) => `<section class="sheet ${i === sheets.length - 1 ? 'top' : ''} ${i >= keep ? 'enter' : ''}" data-i="${i}">
      <header class="sheet-head"><button class="icon-btn" data-a="close-sheet" aria-label="Zurück">${icon('back')}</button>
        <h2>${esc(s.title)}</h2>${s.action ? s.action() : ''}</header>
      <div class="sheet-body">${s.render()}</div>${s.footer ? `<div class="sheet-foot">${s.footer()}</div>` : ''}</section>`).join('');
  const top = sheets[sheets.length - 1];
  if (top && top.mount) top.mount(box.lastElementChild);
  document.body.classList.toggle('has-sheet', sheets.length > 0);
}
function rerenderTop() {
  const top = sheets[sheets.length - 1];
  if (!top) return;
  const el = $('#sheets').lastElementChild;
  const body = el.querySelector('.sheet-body');
  const y = body.scrollTop;
  el.querySelector('.sheet-body').innerHTML = top.render();
  const foot = el.querySelector('.sheet-foot');
  if (top.footer) {
    if (foot) foot.innerHTML = top.footer();
    else el.insertAdjacentHTML('beforeend', `<div class="sheet-foot">${top.footer()}</div>`);
  } else if (foot) foot.remove();
  body.scrollTop = y;
  if (top.mount) top.mount(el);
}

// ---------- Dialoge ----------
let modalResolve = null;
function ask({ title, text = '', input = null, value = '', placeholder = '', ok = 'OK', cancel = 'Abbrechen', danger = false, multiline = false, numeric = false }) {
  return new Promise(resolve => {
    modalResolve = resolve;
    const field = input === null ? '' : multiline
      ? `<textarea id="m-in" rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input id="m-in" ${numeric ? 'inputmode="numeric" type="number"' : 'type="text"'} value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="60">`;
    $('#modal').innerHTML = `<div class="modal-bg" data-a="modal-cancel"></div><div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${field}
      <div class="modal-actions">${cancel ? `<button class="btn ghost" data-a="modal-cancel">${esc(cancel)}</button>` : ''}
      <button class="btn ${danger ? 'danger' : 'primary'}" data-a="modal-ok">${esc(ok)}</button></div></div>`;
    $('#modal').classList.add('open');
    const f = $('#m-in');
    if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 50);
  });
}
function closeModal(result) {
  $('#modal').classList.remove('open');
  $('#modal').innerHTML = '';
  const r = modalResolve;
  modalResolve = null;
  if (r) r(result);
}

function menu(title, items) {
  return new Promise(resolve => {
    modalResolve = resolve;
    $('#modal').innerHTML = `<div class="modal-bg" data-a="modal-cancel"></div><div class="modal menu" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${items.map((it, i) => `<button class="menu-item ${it.danger ? 'danger' : ''}" data-a="modal-pick" data-i="${i}">${icon(it.icon || 'info')}${esc(it.label)}</button>`).join('')}
      <div class="modal-actions"><button class="btn ghost" data-a="modal-cancel">Abbrechen</button></div></div>`;
    $('#modal').classList.add('open');
  }).then(i => (i == null ? null : items[i].value));
}

// ---------- Bausteine ----------
function statusPill(b) {
  const st = buildStatus(b);
  if (st.errors.filter(i => !i.missing).length) return `<span class="pill err">${icon('x')}${st.errors.filter(i => !i.missing).length} Problem${st.errors.length > 1 ? 'e' : ''}</span>`;
  if (st.todo.length || st.errors.length) return `<span class="pill todo">${st.todo.length + st.errors.length} offen</span>`;
  if (st.warns.length) return `<span class="pill warn">${icon('warn')}${st.warns.length} Hinweis${st.warns.length > 1 ? 'e' : ''}</span>`;
  return `<span class="pill ok">${icon('check')}Kompatibel</span>`;
}

function fpsBlock(b) {
  const pf = perf(b);
  if (!pf || !pf.fps['1080p']) return '<p class="muted small">Wähle CPU und Grafikkarte, um eine FPS-Schätzung zu sehen.</p>';
  const max = 240;
  const rows = Object.entries(pf.fps).map(([r, f]) => `<div class="fps-row"><span>${r}</span>
      <div class="bar"><i style="width:${clamp(f / max * 100, 3, 100)}%"></i></div><b>~${f} FPS</b></div>`).join('');
  const txt = {
    cpu: 'Die CPU bremst die Grafikkarte etwas aus – ein CPU-Upgrade bringt mehr.',
    gpu: 'Die Grafikkarte ist das Limit – die CPU hätte noch Reserven.',
    balanced: 'CPU und Grafikkarte passen gut zusammen.',
    nogpu: 'Ohne Grafikkarte: nur für leichte Spiele geeignet.',
  }[pf.bottleneck] || '';
  return `${rows}<p class="muted small">${txt} Schätzung für aktuelle Spiele auf hohen Details.</p>`;
}

function priceTag(n) { return `<span class="price">${fmtEur(n)}</span>`; }

// ---------- Ansicht: Entdecken ----------
function viewHome() {
  const b = cur();
  const t = totals(b);
  return `
  <section class="hero">${scene(DEFAULT_THEME, 2, true)}
    <div class="hero-text"><h1>Lass dich inspirieren</h1><p>Plane deinen Gaming-PC und dein Setup, vergleiche Komponenten und behalte dein Budget im Blick.</p></div>
  </section>
  <div class="quick">
    <button data-a="new-build">${icon('plus')}<b>Neuer Build</b><span>Von Null planen</span></button>
    <button data-a="new-mine">${icon('user')}<b>Mein PC</b><span>Eintragen & teilen</span></button>
    <button data-a="tab" data-t="budget">${icon('spark')}<b>Auto-Build</b><span>Bester PC fürs Budget</span></button>
    <button data-a="import">${icon('import')}<b>Code importieren</b><span>PC von Freunden</span></button>
  </div>
  <button class="card continue" data-a="tab" data-t="builder">
    <div><small class="muted">Weiter planen</small><h3>${esc(b.name)}</h3><p class="muted small">${t.all ? fmtEur(t.all) : 'Noch leer'}</p></div>${statusPill(b)}
  </button>
  <h2 class="section">Setup-Stile</h2>
  <div class="presets">${PRESETS.map(p => {
    const pb = { parts: p.parts, prices: {} };
    const pf = perf(pb);
    return `<button class="preset" data-a="preset" data-id="${p.id}">${scene(p.theme, (p.parts.monitor || []).length || 1)}
      <div class="preset-info"><b>${esc(p.name)}</b><span>${esc(p.tag)}</span>
      <span class="preset-meta">PC ${fmtEur(totals(pb).pc)} · ~${pf.fps[(p.parts.monitor && findPart('monitor', p.parts.monitor[0]).res) || '1440p']} FPS</span></div></button>`;
  }).join('')}</div>`;
}

function openPreset(id) {
  const p = PRESETS.find(x => x.id === id);
  const pb = { name: p.name, parts: p.parts, prices: {} };
  openSheet({
    title: p.name,
    render: () => {
      const t = totals(pb);
      return `<div class="preset-hero">${scene(p.theme, (p.parts.monitor || []).length || 1, true)}</div>
      <p>${esc(p.desc)}</p>
      <div class="stats"><div><small>PC</small><b>${fmtEur(t.pc)}</b></div><div><small>Setup</small><b>${fmtEur(t.setup)}</b></div><div><small>Gesamt</small><b>${fmtEur(t.all)}</b></div></div>
      <div class="card">${fpsBlock(pb)}</div>
      <div class="card list">${CATS.map(c => partsOf(pb, c.key).map(x => `<div class="li"><span class="li-ic">${icon(c.key)}</span><div><small>${c.short}</small><b>${esc(x.name)}</b></div>${priceTag(x.price)}</div>`).join('')).join('')}</div>`;
    },
    footer: () => `<button class="btn primary wide" data-a="use-preset" data-id="${p.id}">${icon('plus')}Als neuen Build übernehmen</button>`,
  });
}

// ---------- Ansicht: Builder ----------
function issueMap(b) {
  const m = {};
  for (const i of checkBuild(b)) {
    if (i.missing || i.level === 'todo') continue;
    for (const c of i.cats) {
      const lv = m[c];
      if (!lv || i.level === 'error' || (i.level === 'warn' && lv === 'info')) m[c] = i.level;
    }
  }
  return m;
}

function slotRows(b, group) {
  const im = issueMap(b);
  return CATS.filter(c => c.group === group).map(c => {
    const ps = partsOf(b, c.key);
    const flag = im[c.key] && im[c.key] !== 'info' ? `<span class="dot ${im[c.key]}"></span>` : '';
    const rows = ps.map((p, idx) => `<button class="slot filled" data-a="detail" data-cat="${c.key}" data-idx="${idx}">
        <span class="slot-ic">${icon(c.key)}</span>
        <span class="slot-main"><small>${c.name}${flag}</small><b>${esc(p.name)}</b><span class="chips">${CHIPS[c.key](p).slice(0, 4).map(x => `<i>${esc(x)}</i>`).join('')}</span></span>
        ${priceTag(priceOf(b, c.key, p))}</button>`);
    const canAdd = c.multi ? ps.length < c.max : !ps.length;
    if (canAdd) rows.push(`<button class="slot empty" data-a="pick" data-cat="${c.key}">
        <span class="slot-ic">${icon(c.key)}</span><span class="slot-main"><small>${c.name}${!ps.length && c.required ? ' · fehlt' : ''}</small>
        <b class="accent">${ps.length ? '+ weitere hinzufügen' : 'Auswählen'}</b></span>${icon('plus', 'add')}</button>`);
    return rows.join('');
  }).join('');
}

function issuesCard(b) {
  const st = buildStatus(b);
  const real = st.issues.filter(i => i.level !== 'todo');
  const errs = real.filter(i => i.level === 'error');
  const warns = real.filter(i => i.level === 'warn');
  const infos = real.filter(i => i.level === 'info');
  let head;
  if (errs.length) head = `<div class="banner err">${icon('x')}<b>${errs.length} Problem${errs.length > 1 ? 'e' : ''} im Build</b></div>`;
  else if (st.todo.length) head = `<div class="banner todo">${icon('info')}<b>Noch offen: ${st.todo.map(i => CAT[i.cats[0]].short).join(', ')}</b></div>`;
  else head = `<div class="banner ok">${icon('check')}<b>Alles passt zusammen</b></div>`;
  const li = (i, cls) => `<li class="${cls}">${icon(cls === 'err' ? 'x' : cls === 'warn' ? 'warn' : 'info')}<span>${esc(i.msg)}</span></li>`;
  const items = [...errs.map(i => li(i, 'err')), ...warns.map(i => li(i, 'warn')), ...infos.map(i => li(i, 'info'))];
  return `<div class="card issues">${head}${items.length ? `<ul>${items.join('')}</ul>` : ''}</div>`;
}

function viewBuilder() {
  const b = cur();
  const t = totals(b);
  const pw = power(b);
  const budget = b.budget || 0;
  const spent = S.budgetScope === 'all' ? t.all : t.pc;
  return `
  <div class="build-head">
    <div><small class="muted">${b.kind === 'mine' ? 'Mein PC' : b.kind === 'shared' ? 'Von ' + esc(b.author || 'Freunden') : 'Planung'}</small>
      <h1 class="build-name" data-a="rename" data-id="${b.id}">${esc(b.name)} ${icon('edit', 'sm')}</h1></div>
    <button class="btn small" data-a="share">${icon('share')}Teilen</button>
  </div>
  <div class="stats">
    <div><small>PC</small><b>${fmtEur(t.pc)}</b></div>
    <div><small>Verbrauch</small><b>~${pw.draw} W</b></div>
    <div data-a="tab" data-t="budget"><small>Budget</small><b class="${budget && spent > budget ? 'neg' : ''}">${budget ? fmtEur(budget - spent) : '–'}</b></div>
  </div>
  ${issuesCard(b)}
  <h2 class="section">PC-Komponenten</h2>
  <div class="slots">${slotRows(b, 'pc')}</div>
  <div class="card"><h3 class="card-title">Leistung (geschätzt)</h3>${fpsBlock(b)}</div>
  <h2 class="section">Setup & Peripherie</h2>
  <div class="slots">${slotRows(b, 'setup')}</div>
  <p class="muted small center">Preise sind Richtpreise – tippe auf ein Teil, um deinen echten Preis einzutragen.</p>`;
}

// ---------- Teileauswahl ----------
function constraintText(b, cat) {
  const cpu = one(b, 'cpu'), mb = one(b, 'mb'), cs = one(b, 'case'), psu = one(b, 'psu'), gpu = one(b, 'gpu'), cooler = one(b, 'cooler');
  const out = [];
  const st = many(b, 'storage');
  if (cat === 'cpu' && mb) out.push(`Mainboard-Sockel ${mb.socket}`);
  if (cat === 'mb') {
    if (cpu) out.push(`CPU-Sockel ${cpu.socket}`);
    if (one(b, 'ram')) out.push(`RAM ${one(b, 'ram').type}`);
    if (cs) out.push(`Gehäuse ${cs.ff.join('/')}`);
  }
  if (cat === 'ram' && mb) out.push(`${mb.mem}, ${mb.ramSlots} Slots, max. ${mb.maxRam} GB`);
  if (cat === 'gpu') {
    if (mb) out.push(`Mainboard PCIe ${mb.pcie}.0 x16 ✓`);
    if (cs) out.push(`Gehäuse max. ${cs.gpuLen} mm / ${fmtNum(cs.gpuSlots)} Slots`);
    if (psu) out.push(`Netzteil ${psu.watt} W`);
  }
  if (cat === 'cooler') {
    if (cpu) out.push(`Sockel ${cpu.socket}, ${cpu.power} W`);
    if (cs) out.push(`Gehäuse: Kühler ≤ ${cs.coolerH} mm${cs.rad ? `, Radiator ≤ ${cs.rad} mm` : ', keine AIO'}`);
  }
  if (cat === 'psu') {
    out.push(`Empfohlen ≥ ${power(b).recommended} W`);
    if (cs) out.push(`Gehäuse ${cs.psu}`);
  }
  if (cat === 'case') {
    if (mb) out.push(`Mainboard ${mb.ff}`);
    if (gpu) out.push(`GPU ${gpu.len} mm`);
    if (cooler && cooler.type === 'Luft') out.push(`Kühler ${cooler.height} mm`);
    if (cooler && cooler.type === 'AIO') out.push(`Radiator ${cooler.rad} mm`);
    if (psu) out.push(`Netzteil ${psu.ff}`);
  }
  if (cat === 'storage' && mb) {
    const m2 = st.filter(s => s.iface === 'M.2').length;
    out.push(`${mb.m2 - m2} von ${mb.m2} M.2-Slots frei`);
  }
  return out;
}

const pickerState = { q: '', sort: 'price', showAll: false, compare: [] };

function pickerItems(b, cat, idx) {
  // Beim Tauschen eines Mehrfach-Teils (z. B. 2. SSD) das alte Teil vorher herausnehmen
  const base = JSON.parse(JSON.stringify(b));
  if (CAT[cat].multi && idx != null) base.parts[cat].splice(idx, 1);
  else if (!CAT[cat].multi) delete base.parts[cat];
  const res = targetRes(b);
  let items = DB[cat].map(p => {
    const issues = checkCandidate(base, cat, p.id);
    const errors = issues.filter(i => i.level === 'error');
    const warns = issues.filter(i => i.level === 'warn');
    const fps = (cat === 'cpu' || cat === 'gpu') && one(base, cat === 'cpu' ? 'gpu' : 'cpu') ? fpsAt(withPart(base, cat, p.id), res) : 0;
    return { p, errors, warns, ok: !errors.length, fps, price: priceOf(b, cat, p) };
  });
  const q = pickerState.q.trim().toLowerCase();
  if (q) items = items.filter(x => x.p.name.toLowerCase().includes(q));
  const s = pickerState.sort;
  items.sort((a, c) => {
    if (s === 'perf') return (c.fps || c.p.score || 0) - (a.fps || a.p.score || 0) || a.price - c.price;
    if (s === 'value') return ((c.fps || c.p.score || 0) / c.price) - ((a.fps || a.p.score || 0) / a.price);
    if (s === 'desc') return c.price - a.price;
    return a.price - c.price;
  });
  return { items, res, base };
}

function openPicker(cat, idx = null) {
  pickerState.q = '';
  pickerState.sort = 'price';
  pickerState.showAll = false;
  pickerState.compare = [];
  const c = CAT[cat];
  openSheet({
    title: c.name + ' wählen',
    cat, idx,
    render() {
      const b = cur();
      const { items, res } = pickerItems(b, cat, idx);
      const ok = items.filter(x => x.ok);
      const bad = items.filter(x => !x.ok);
      const cons = constraintText(b, cat);
      const perfSort = cat === 'cpu' || cat === 'gpu';
      const sorts = [['price', 'Preis ↑'], ['desc', 'Preis ↓']].concat(perfSort ? [['perf', 'Leistung'], ['value', 'Preis/Leistung']] : []);
      const selId = idx != null ? (b.parts[cat] || [])[idx] : (c.multi ? null : b.parts[cat]);
      const row = x => {
        const sel = x.p.id === selId;
        const cmp = pickerState.compare.includes(x.p.id);
        const reason = x.errors.length ? `<span class="why err">${icon('x')}${esc(x.errors[0].msg)}</span>`
          : x.warns.length ? `<span class="why warn">${icon('warn')}${esc(x.warns[0].msg)}</span>`
            : cons.length ? `<span class="why ok">${icon('check')}Passt zu deinem Build</span>` : '';
        return `<div class="item ${x.ok ? '' : 'bad'} ${sel ? 'sel' : ''}">
          <button class="item-main" data-a="choose" data-cat="${cat}" data-id="${x.p.id}">
            <b>${esc(x.p.name)}</b><span class="chips">${CHIPS[cat](x.p).map(v => `<i>${esc(v)}</i>`).join('')}</span>
            ${x.fps ? `<span class="fps">≈ ${x.fps} FPS in ${res}</span>` : ''}${reason}
          </button>
          <div class="item-side">${priceTag(x.price)}${sel ? '<span class="pill ok">Gewählt</span>' : ''}
            <label class="cmp"><input type="checkbox" data-a="cmp" data-id="${x.p.id}" ${cmp ? 'checked' : ''}><span>Vergleich</span></label></div>
        </div>`;
      };
      return `
        ${cons.length ? `<div class="constraints">${icon('info')}<span><b>Gefiltert passend zu:</b> ${cons.map(esc).join(' · ')}</span></div>` : ''}
        <input class="search" type="search" placeholder="Suchen …" value="${esc(pickerState.q)}" data-input="pick-q">
        <div class="seg">${sorts.map(([k, l]) => `<button class="${pickerState.sort === k ? 'on' : ''}" data-a="pick-sort" data-k="${k}">${l}</button>`).join('')}</div>
        <div class="items">${ok.map(row).join('') || '<p class="muted center">Keine passenden Teile gefunden.</p>'}</div>
        ${bad.length ? `<button class="btn ghost wide" data-a="pick-all">${pickerState.showAll ? 'Unpassende ausblenden' : `${bad.length} unpassende Teile anzeigen`}</button>
          ${pickerState.showAll ? `<p class="muted small">Diese Teile passen nicht zu deinem Build. Ändere zuerst das blockierende Teil, um sie zu wählen.</p><div class="items">${bad.map(row).join('')}</div>` : ''}` : ''}`;
    },
    footer() {
      const n = pickerState.compare.length;
      return n >= 2 ? `<button class="btn primary wide" data-a="compare" data-cat="${cat}">Vergleichen (${n})</button>`
        : n === 1 ? '<p class="muted small center">Wähle noch ein Teil zum Vergleichen.</p>' : '';
    },
    mount(el) {
      const inp = el.querySelector('[data-input="pick-q"]');
      if (inp && pickerState.focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    },
  });
}

function choosePart(cat, id) {
  const top = sheets[sheets.length - 1];
  const b = cur();
  const idx = top && top.cat === cat ? top.idx : null;
  const base = JSON.parse(JSON.stringify(b));
  if (CAT[cat].multi && idx != null) base.parts[cat].splice(idx, 1);
  else if (!CAT[cat].multi) delete base.parts[cat];
  const errs = checkCandidate(base, cat, id).filter(i => i.level === 'error');
  if (errs.length) { toast(errs[0].msg); return; }
  if (CAT[cat].multi) {
    const arr = b.parts[cat] || [];
    if (idx != null) arr[idx] = id; else arr.push(id);
    b.parts[cat] = arr;
  } else b.parts[cat] = id;
  while (sheets.length) sheets.pop();
  renderSheets();
  touch(b);
  toast(findPart(cat, id).name + ' gewählt');
}

function openCompare(cat) {
  const ids = pickerState.compare.slice(0, 3);
  openSheet({
    title: 'Vergleich',
    render() {
      const b = cur();
      const top = sheets.find(s => s.cat === cat);
      const { items, res } = pickerItems(b, cat, top ? top.idx : null);
      const cols = ids.map(id => items.find(x => x.p.id === id)).filter(Boolean);
      const specs = SPECS[cat].concat([{ l: 'Preis', g: (p, x) => fmtEur(x.price), v: (p, x) => x.price, better: 'low' }]);
      if (cols.some(x => x.fps)) specs.push({ l: `FPS ${res} (dein Build)`, g: (p, x) => (x.fps ? '≈ ' + x.fps : '–'), v: (p, x) => x.fps, better: 'high' });
      const rows = specs.map(s => {
        let best = null;
        if (s.better && s.v) {
          const vals = cols.map(x => s.v(x.p, x));
          const target = s.better === 'high' ? Math.max(...vals) : Math.min(...vals);
          if (vals.filter(v => v === target).length < vals.length) best = target;
        }
        return `<tr><th>${s.l}</th>${cols.map(x => `<td class="${best !== null && s.v(x.p, x) === best ? 'best' : ''}">${esc(s.g(x.p, x))}</td>`).join('')}</tr>`;
      }).join('');
      return `<div class="cmp-wrap"><table class="cmp-table">
        <thead><tr><th></th>${cols.map(x => `<th>${esc(x.p.name)}</th>`).join('')}</tr></thead>
        <tbody>${rows}<tr><th>Passt</th>${cols.map(x => `<td class="${x.ok ? 'best' : 'neg'}">${x.ok ? 'Ja' : esc(x.errors[0].msg)}</td>`).join('')}</tr>
        <tr><th></th>${cols.map(x => `<td>${x.ok ? `<button class="btn primary small" data-a="choose" data-cat="${cat}" data-id="${x.p.id}">Wählen</button>` : ''}</td>`).join('')}</tr></tbody>
      </table></div><p class="muted small">Grün = bester Wert im Vergleich.</p>`;
    },
  });
}

function openDetail(cat, idx) {
  const b0 = cur();
  const p = partsOf(b0, cat)[idx];
  if (!p) return;
  openSheet({
    title: CAT[cat].name,
    render() {
      const b = cur();
      const issues = checkBuild(b).filter(i => !i.missing && i.cats.includes(cat) && i.level !== 'todo');
      const price = priceOf(b, cat, p);
      return `<div class="detail-head"><span class="slot-ic big">${icon(cat)}</span><h2>${esc(p.name)}</h2></div>
        <div class="card"><label class="field"><span>Dein Preis (€)</span>
          <input type="number" inputmode="decimal" min="0" value="${price}" data-input="price" data-cat="${cat}" data-id="${p.id}"></label>
          <p class="muted small">Richtpreis: ${fmtEur(p.price)}${price !== p.price ? ` · <button class="link" data-a="reset-price" data-cat="${cat}" data-id="${p.id}">zurücksetzen</button>` : ''}</p></div>
        <div class="card"><table class="spec">${SPECS[cat].map(s => `<tr><th>${s.l}</th><td>${esc(s.g(p))}</td></tr>`).join('')}</table></div>
        ${issues.length ? `<div class="card issues"><ul>${issues.map(i => `<li class="${i.level === 'error' ? 'err' : i.level}">${icon(i.level === 'error' ? 'x' : i.level === 'warn' ? 'warn' : 'info')}<span>${esc(i.msg)}</span></li>`).join('')}</ul></div>`
          : `<div class="banner ok">${icon('check')}<b>Passt zu deinem Build</b></div>`}`;
    },
    footer: () => `<div class="row"><button class="btn ghost" data-a="remove" data-cat="${cat}" data-idx="${idx}">${icon('trash')}Entfernen</button>
      <button class="btn primary" data-a="swap" data-cat="${cat}" data-idx="${idx}">Anderes Teil wählen</button></div>`,
  });
}

// ---------- Ansicht: Budget ----------
const SHARE_HINT = { gpu: [30, 45], cpu: [12, 22] };

function savings(b) {
  const out = [];
  for (const c of CATS.filter(x => x.group === 'pc' && !x.multi)) {
    const p = one(b, c.key);
    if (!p) continue;
    const base = JSON.parse(JSON.stringify(b));
    delete base.parts[c.key];
    const res = targetRes(b);
    const curFps = fpsAt(b, res);
    const alt = DB[c.key].filter(x => x.price < priceOf(b, c.key, p) - 15 && isCompatible(base, c.key, x.id))
      .map(x => ({ x, loss: curFps ? Math.round((1 - fpsAt(withPart(base, c.key, x.id), res) / curFps) * 100) : 0, save: priceOf(b, c.key, p) - x.price }))
      .filter(a => a.loss <= 15 && noErrors(withPart(base, c.key, a.x.id)))
      .sort((a, z) => (z.save - z.loss * 15) - (a.save - a.loss * 15))[0];
    if (alt) out.push({ cat: c.key, from: p, ...alt });
  }
  return out.sort((a, z) => z.save - a.save).slice(0, 4);
}

function viewBudget() {
  const b = cur();
  const t = totals(b);
  const budget = b.budget || 0;
  const scopeAll = S.budgetScope === 'all';
  const spent = scopeAll ? t.all : t.pc;
  const pct = budget ? spent / budget * 100 : 0;
  const cats = CATS.filter(c => scopeAll || c.group === 'pc').filter(c => t.byCat[c.key] > 0).sort((a, z) => t.byCat[z.key] - t.byCat[a.key]);
  const tips = [];
  if (t.pc && one(b, 'gpu')) {
    for (const [k, [lo, hi]] of Object.entries(SHARE_HINT)) {
      const share = t.byCat[k] / t.pc * 100;
      if (share < lo) tips.push(`${CAT[k].short} macht nur ${Math.round(share)} % vom PC aus – für Gaming sind ${lo}–${hi} % üblich.`);
      if (share > hi + 10) tips.push(`${CAT[k].short} macht ${Math.round(share)} % vom PC aus – evtl. woanders sinnvoller investieren.`);
    }
  }
  const sv = budget && spent > budget * 0.9 ? savings(b) : [];
  return `
  <h1 class="page-title">Budget</h1>
  <div class="card budget-card">
    <label class="field"><span>Dein Budget für „${esc(b.name)}“</span>
      <div class="money"><input type="number" inputmode="numeric" min="0" step="50" value="${budget || ''}" placeholder="z. B. 1200" data-input="budget"><b>€</b></div></label>
    <input type="range" min="300" max="6000" step="50" value="${clamp(budget || 1200, 300, 6000)}" data-input="budget-range">
    <div class="seg"><button class="${scopeAll ? '' : 'on'}" data-a="scope" data-k="pc">Nur PC</button><button class="${scopeAll ? 'on' : ''}" data-a="scope" data-k="all">PC + Setup</button></div>
    <div class="meter ${pct > 100 ? 'over' : ''}"><i style="width:${clamp(pct, 0, 100)}%"></i></div>
    <div class="meter-text"><span>${fmtEur(spent)} ausgegeben</span><b class="${pct > 100 ? 'neg' : 'pos'}">${budget ? (spent > budget ? fmtEur(spent - budget) + ' drüber' : fmtEur(budget - spent) + ' übrig') : 'kein Budget'}</b></div>
  </div>
  ${cats.length ? `<h2 class="section">Aufteilung</h2><div class="card">${cats.map(c => {
    const share = t.byCat[c.key] / spent * 100;
    return `<div class="split"><span class="li-ic">${icon(c.key)}</span><div class="split-main"><div class="split-top"><span>${c.short}</span><b>${fmtEur(t.byCat[c.key])}</b></div>
      <div class="bar"><i style="width:${clamp(share, 1, 100)}%"></i></div></div><small>${Math.round(share)} %</small></div>`;
  }).join('')}</div>` : '<p class="muted center">Noch keine Teile im Build.</p>'}
  ${tips.length ? `<div class="card tips">${tips.map(x => `<p>${icon('info')}${esc(x)}</p>`).join('')}</div>` : ''}
  ${sv.length ? `<h2 class="section">Spar-Tipps</h2><div class="card list">${sv.map(s => `<div class="li"><span class="li-ic">${icon(s.cat)}</span>
      <div><small>${CAT[s.cat].short}: statt ${esc(s.from.name)}</small><b>${esc(s.x.name)}</b>
      <span class="muted small">spart ${fmtEur(s.save)}${s.loss > 0 ? ` · ca. ${s.loss} % weniger FPS` : ''}</span></div>
      <button class="btn small" data-a="apply-save" data-cat="${s.cat}" data-id="${s.x.id}">Tauschen</button></div>`).join('')}</div>` : ''}
  <h2 class="section">Auto-Build</h2>
  <div class="card">
    <p>Lass die App den schnellsten kompatiblen Gaming-PC für dein Budget zusammenstellen.</p>
    <button class="btn primary wide" data-a="autobuild">${icon('spark')}Besten PC für ${budget ? fmtEur(budget) : '1.200 €'} finden</button>
  </div>`;
}

function openAutoBuild() {
  const b = cur();
  const budget = b.budget || 1200;
  const scopeAll = S.budgetScope === 'all';
  const setupCost = scopeAll ? totals(b).setup : 0;
  const pcBudget = budget - setupCost;
  const res = targetRes(b);
  const a = autoBuild(pcBudget, res);
  if (!a) { toast(`Für ${fmtEur(pcBudget)} lässt sich kein kompletter PC bauen.`); return; }
  const pb = { name: 'Auto-Build ' + fmtEur(budget), parts: a.parts, prices: {} };
  openSheet({
    title: 'Auto-Build',
    render: () => `<div class="banner ok">${icon('spark')}<b>Bester PC für ${fmtEur(pcBudget)}: ${fmtEur(a.total)}</b></div>
      <div class="card">${fpsBlock(pb)}</div>
      <div class="card list">${CATS.filter(c => c.group === 'pc').map(c => partsOf(pb, c.key).map(x => `<div class="li"><span class="li-ic">${icon(c.key)}</span><div><small>${c.short}</small><b>${esc(x.name)}</b></div>${priceTag(x.price)}</div>`).join('')).join('')}</div>
      <p class="muted small">Optimiert auf FPS in ${res}. Alle Teile sind geprüft kompatibel.${scopeAll && setupCost ? ` Setup-Teile (${fmtEur(setupCost)}) sind bereits abgezogen.` : ''}</p>`,
    footer: () => `<div class="row"><button class="btn ghost" data-a="auto-new">Als neuen Build</button><button class="btn primary" data-a="auto-apply">In „${esc(b.name)}“ übernehmen</button></div>`,
    auto: a,
  });
}

// ---------- Ansicht: Upgrades ----------
function viewUpgrades() {
  const b = S.builds.find(x => x.id === S.upgradeId) || S.builds.find(x => x.kind === 'mine') || cur();
  const opts = S.builds.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}${x.kind === 'mine' ? ' (Mein PC)' : ''}</option>`).join('');
  const head = `<h1 class="page-title">Upgrade-Berater</h1>
    <div class="card"><label class="field"><span>Welchen PC aufrüsten?</span><select data-input="upgrade-build">${opts}</select></label>
    ${!S.builds.some(x => x.kind === 'mine') ? `<p class="muted small">Tipp: Trag deinen echten PC als „Mein PC“ ein, dann passen die Vorschläge genau. <button class="link" data-a="new-mine">Jetzt eintragen</button></p>` : ''}
    <label class="field"><span>Wie viel willst du ausgeben?</span><div class="money"><input type="number" inputmode="numeric" min="0" step="50" value="${S.upgradeBudget || ''}" placeholder="egal" data-input="upgrade-budget"><b>€</b></div></label></div>`;
  if (!one(b, 'cpu') || !one(b, 'mb')) return head + `<div class="card center"><p>Für Upgrade-Tipps braucht der Build mindestens eine CPU und ein Mainboard.</p><button class="btn primary" data-a="open-build" data-id="${b.id}">Build bearbeiten</button></div>`;
  const up = upgrades(b);
  const limit = S.upgradeBudget || Infinity;
  const fit = up.items.filter(i => i.cost <= limit);
  const over = up.items.length - fit.length;
  const kindLabel = { fix: ['Wichtig', 'err'], perf: ['Mehr FPS', 'ok'], comfort: ['Komfort', 'info'] };
  const card = it => {
    const i = up.items.indexOf(it);
    return `<div class="card upgrade">
      <div class="up-top"><span class="pill ${kindLabel[it.kind][1]}">${kindLabel[it.kind][0]}</span>${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ''}</div>
      <h3>${esc(it.title)}</h3>
      <div class="up-nums">${it.gain > 0 ? `<b class="pos">+${it.gain} % FPS</b><small>in ${up.res}</small>` : ''}<b>${fmtEur(it.cost)}</b></div>
      <p class="muted small">${esc(it.reason)}</p>
      ${it.changes.length > 1 ? `<div class="chips">${it.changes.map(([c, p]) => `<i>${CAT[c].short}: ${esc(p.name)}</i>`).join('')}</div>` : ''}
      <button class="btn small" data-a="apply-upgrade" data-i="${i}" data-id="${b.id}">${icon('plus')}Als Upgrade-Plan speichern</button></div>`;
  };
  return head + `
    <div class="card"><h3 class="card-title">${esc(b.name)} heute</h3>${fpsBlock(b)}</div>
    ${fit.length ? fit.map(card).join('') : '<div class="card center"><p>Keine sinnvollen Upgrades in diesem Budget gefunden – dein PC ist gut aufgestellt!</p></div>'}
    ${over ? `<p class="muted small center">${over} weitere${over > 1 ? '' : 's'} Upgrade${over > 1 ? 's' : ''} über deinem Budget.</p>` : ''}`;
}

// ---------- Ansicht: Meine PCs ----------
function viewMine() {
  const groups = [['mine', 'Mein PC'], ['plan', 'Planungen'], ['shared', 'Von Freunden']];
  const card = b => {
    const t = totals(b);
    const cpu = one(b, 'cpu'), gpu = one(b, 'gpu');
    return `<div class="card build ${b.id === S.currentId ? 'current' : ''}">
      <button class="build-main" data-a="open-build" data-id="${b.id}">
        <div class="build-title"><b>${esc(b.name)}</b>${statusPill(b)}</div>
        <span class="muted small">${[cpu && cpu.name, gpu && gpu.name].filter(Boolean).map(esc).join(' · ') || 'Noch keine Teile'}</span>
        <span class="small">${fmtEur(t.all)}${b.author ? ` · von ${esc(b.author)}` : ''}${b.id === S.currentId ? ' · <b class="accent">geöffnet</b>' : ''}</span>
      </button>
      <div class="build-actions"><button class="icon-btn" data-a="share-build" data-id="${b.id}" aria-label="Teilen">${icon('share')}</button>
        <button class="icon-btn" data-a="build-menu" data-id="${b.id}" aria-label="Mehr">${icon('dots')}</button></div></div>`;
  };
  return `<h1 class="page-title">Meine PCs</h1>
    <div class="row"><button class="btn primary" data-a="new-build">${icon('plus')}Neuer Build</button><button class="btn" data-a="import">${icon('import')}Code importieren</button></div>
    ${groups.map(([k, l]) => {
      const list = S.builds.filter(b => (b.kind || 'plan') === k);
      if (!list.length && k !== 'mine') return '';
      return `<h2 class="section">${l}</h2>${list.length ? list.map(card).join('') : `<button class="card empty-card" data-a="new-mine">${icon('user')}<span><b>Deinen PC eintragen</b><br><small class="muted">Teile ihn mit Freunden und bekomm passende Upgrade-Tipps.</small></span></button>`}`;
    }).join('')}
    <div class="card"><label class="field"><span>Dein Name beim Teilen (optional)</span>
      <input type="text" maxlength="40" value="${esc(S.author)}" placeholder="z. B. Max" data-input="author"></label></div>`;
}

const VIEWS = { home: viewHome, builder: viewBuilder, budget: viewBudget, upgrades: viewUpgrades, mine: viewMine };

// ---------- Teilen & Importieren ----------
function openShare(id) {
  const b = S.builds.find(x => x.id === id) || cur();
  const pc = partsOf(b, 'cpu').length || partsOf(b, 'gpu').length;
  openSheet({
    title: 'Build teilen',
    render() {
      const text = shareText(b, S.author);
      const pf = perf(b);
      return `<div class="share-card">${scene(DEFAULT_THEME, Math.max(1, partsOf(b, 'monitor').length))}
          <div class="share-info"><small>${b.kind === 'mine' ? 'Mein PC' : 'PC-Build'}${S.author ? ' von ' + esc(S.author) : ''}</small><b>${esc(b.name)}</b>
          <span>${fmtEur(totals(b).all)}${pf && pf.fps['1440p'] ? ` · ~${pf.fps['1440p']} FPS 1440p` : ''}</span></div></div>
        ${!pc ? '<div class="banner todo">' + icon('info') + '<b>Der Build ist noch leer.</b></div>' : ''}
        <label class="field"><span>Dein Name (optional)</span><input type="text" maxlength="40" value="${esc(S.author)}" placeholder="z. B. Max" data-input="author"></label>
        <p class="muted small">So sieht die Nachricht aus. Freunde mit SetupBuilder können den Code unten importieren – oder die Nachricht direkt mit SetupBuilder teilen.</p>
        <pre class="share-text">${esc(text)}</pre>`;
    },
    footer: () => `<div class="row"><button class="btn ghost" data-a="copy-code" data-id="${b.id}">${icon('copy')}Code kopieren</button>
      <button class="btn primary" data-a="do-share" data-id="${b.id}">${icon('share')}Teilen</button></div>`,
  });
}

async function openImport(prefill = '') {
  if (!prefill && Native && Native.getClipboard) {
    try { const clip = Native.getClipboard(); if (clip && /SB1\.[A-Za-z0-9_-]+/.test(clip)) prefill = clip; } catch (e) { /* kein Zugriff */ }
  }
  const text = await ask({ title: 'Build-Code importieren', text: 'Füge den Code oder die ganze Nachricht ein, die du bekommen hast.', input: true, multiline: true, value: prefill, placeholder: 'SB1.…', ok: 'Importieren' });
  if (text == null) return;
  importText(text);
}

function importText(text) {
  const r = decodeBuild(text);
  if (!r) { toast('Kein gültiger SetupBuilder-Code gefunden.'); return; }
  const b = newBuild(r.build.name, 'shared', r.build.parts);
  b.prices = r.build.prices;
  b.budget = r.build.budget || 0;
  b.author = r.author;
  addBuild(b);
  sheets.length = 0;
  renderSheets();
  tab = 'builder';
  refresh();
  toast(`„${r.build.name}“ importiert${r.unknown ? ` (${r.unknown} unbekannte Teile übersprungen)` : ''}`);
}

function doShare(b) {
  const text = shareText(b, S.author);
  if (Native) Native.share(text, b.name);
  else if (navigator.share) navigator.share({ title: b.name, text }).catch(() => {});
  else copyText(text, 'Text kopiert');
}

function copyText(text, msg) {
  if (Native) { Native.copy(text); toast(msg); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Kopieren nicht möglich'));
}

// ---------- Aktionen ----------
const A = {
  tab: d => setTab(d.t),
  'close-sheet': () => closeSheet(),
  share: () => openShare(cur().id),
  'share-build': d => openShare(d.id),
  'do-share': d => doShare(S.builds.find(x => x.id === d.id)),
  'copy-code': d => copyText(encodeBuild(S.builds.find(x => x.id === d.id), S.author), 'Code kopiert – schick ihn deinen Freunden!'),
  import: () => openImport(),
  preset: d => openPreset(d.id),
  'use-preset': d => {
    const p = PRESETS.find(x => x.id === d.id);
    const b = newBuild(p.name, 'plan', p.parts);
    b.budget = Math.ceil(totals(b).pc / 100) * 100;
    addBuild(b);
    sheets.length = 0; renderSheets();
    setTab('builder');
    toast(`„${p.name}“ übernommen – jetzt anpassen!`);
  },
  'new-build': async () => {
    const name = await ask({ title: 'Neuer Build', input: true, value: 'Neuer Gaming-PC', ok: 'Erstellen' });
    if (!name) return;
    addBuild(newBuild(name.trim().slice(0, 60) || 'Neuer Gaming-PC'));
    setTab('builder');
  },
  'new-mine': async () => {
    const name = await ask({ title: 'Deinen PC eintragen', text: 'Trag die Teile deines aktuellen PCs ein – dann kannst du ihn teilen und bekommst passende Upgrade-Tipps.', input: true, value: 'Mein Gaming-PC', ok: 'Los geht\'s' });
    if (!name) return;
    const b = newBuild(name.trim().slice(0, 60) || 'Mein Gaming-PC', 'mine');
    b.budget = 0;
    addBuild(b);
    S.upgradeId = b.id;
    persist();
    setTab('builder');
  },
  pick: d => openPicker(d.cat),
  detail: d => openDetail(d.cat, +d.idx),
  swap: d => { sheets.pop(); renderSheets(); openPicker(d.cat, CAT[d.cat].multi ? +d.idx : null); },
  remove: d => {
    const b = cur();
    if (CAT[d.cat].multi) b.parts[d.cat].splice(+d.idx, 1); else delete b.parts[d.cat];
    sheets.length = 0; renderSheets();
    touch(b);
  },
  choose: d => choosePart(d.cat, d.id),
  'pick-sort': d => { pickerState.sort = d.k; rerenderTop(); },
  'pick-all': () => { pickerState.showAll = !pickerState.showAll; rerenderTop(); },
  compare: d => openCompare(d.cat),
  'reset-price': d => { const b = cur(); delete b.prices[d.cat + ':' + d.id]; b.updated = Date.now(); persist(); rerenderTop(); refreshBehind(); },
  rename: async d => {
    const b = S.builds.find(x => x.id === d.id);
    const name = await ask({ title: 'Umbenennen', input: true, value: b.name, ok: 'Speichern' });
    if (name && name.trim()) { b.name = name.trim().slice(0, 60); touch(b); }
  },
  scope: d => { S.budgetScope = d.k; persist(); refresh(); },
  autobuild: () => openAutoBuild(),
  'auto-new': () => {
    const top = sheets[sheets.length - 1];
    const b = newBuild('Auto-Build ' + fmtEur(cur().budget || 1200), 'plan', top.auto.parts);
    b.budget = cur().budget || 1200;
    const setup = CATS.filter(c => c.group === 'setup');
    if (S.budgetScope === 'all') for (const c of setup) if (cur().parts[c.key]) b.parts[c.key] = JSON.parse(JSON.stringify(cur().parts[c.key]));
    addBuild(b);
    sheets.length = 0; renderSheets();
    setTab('builder');
  },
  'auto-apply': () => {
    const top = sheets[sheets.length - 1];
    const b = cur();
    for (const c of CATS.filter(x => x.group === 'pc')) delete b.parts[c.key];
    Object.assign(b.parts, JSON.parse(JSON.stringify(top.auto.parts)));
    sheets.length = 0; renderSheets();
    touch(b);
    setTab('builder');
    toast('Auto-Build übernommen');
  },
  'apply-save': d => { const b = cur(); b.parts[d.cat] = d.id; touch(b); toast('Getauscht – ' + findPart(d.cat, d.id).name); },
  'apply-upgrade': d => {
    const src = S.builds.find(x => x.id === d.id);
    const it = upgrades(src).items[+d.i];
    if (!it) return;
    const v = applyUpgrade(src, it);
    const b = newBuild(src.name + ' – Upgrade', 'plan', v.parts);
    b.prices = JSON.parse(JSON.stringify(src.prices || {}));
    b.budget = 0;
    addBuild(b);
    setTab('builder');
    toast('Upgrade-Plan erstellt – vergleiche ihn mit deinem PC');
  },
  'open-build': d => { S.currentId = d.id; persist(); setTab('builder'); },
  'build-menu': async d => {
    const b = S.builds.find(x => x.id === d.id);
    const choice = await menu(b.name, [
      { label: 'Umbenennen', icon: 'edit', value: 'rename' },
      { label: 'Duplizieren', icon: 'copy', value: 'dup' },
      b.kind === 'mine' ? { label: 'Als Planung markieren', icon: 'build', value: 'plan' } : { label: 'Als „Mein PC“ markieren', icon: 'user', value: 'mine' },
      { label: 'Löschen', icon: 'trash', value: 'del', danger: true },
    ]);
    if (choice === 'rename') A.rename(d);
    if (choice === 'dup') {
      const c = JSON.parse(JSON.stringify(b));
      c.id = uid(); c.name = (b.name + ' (Kopie)').slice(0, 60); c.kind = b.kind === 'shared' ? 'plan' : b.kind; c.created = c.updated = Date.now();
      addBuild(c, false); refresh(); toast('Dupliziert');
    }
    if (choice === 'plan' || choice === 'mine') { b.kind = choice; if (choice === 'mine') S.upgradeId = b.id; touch(b); }
    if (choice === 'del') {
      const ok = await ask({ title: 'Löschen?', text: `„${b.name}“ wird endgültig gelöscht.`, ok: 'Löschen', danger: true });
      if (ok == null) return;
      S.builds = S.builds.filter(x => x.id !== b.id);
      if (!S.builds.length) S.builds.push(newBuild('Mein erster Build'));
      if (S.currentId === b.id) S.currentId = S.builds[0].id;
      persist(); refresh();
    }
  },
  'modal-ok': () => { const f = $('#m-in'); closeModal(f ? f.value : true); },
  'modal-cancel': () => closeModal(null),
  'modal-pick': d => closeModal(+d.i),
};

function refreshBehind() {
  $('#view').innerHTML = VIEWS[tab]();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = A[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.a === 'cmp') {
    const id = el.dataset.id;
    const list = pickerState.compare;
    if (el.checked) {
      if (list.length >= 3) { el.checked = false; toast('Maximal 3 Teile vergleichen'); return; }
      list.push(id);
    } else list.splice(list.indexOf(id), 1);
    rerenderTop();
    return;
  }
  const k = el.dataset.input;
  if (k === 'upgrade-build') { S.upgradeId = el.value; persist(); refresh(); }
  if (k === 'upgrade-budget') { S.upgradeBudget = Math.max(0, Math.round(+el.value || 0)); persist(); refresh(); }
  if (k === 'budget' || k === 'budget-range') { const b = cur(); b.budget = Math.max(0, Math.round(+el.value || 0)); touch(b); }
  if (k === 'price') {
    const b = cur();
    const v = Math.max(0, Math.round(+el.value || 0));
    b.prices[el.dataset.cat + ':' + el.dataset.id] = v;
    b.updated = Date.now(); persist(); rerenderTop(); refreshBehind();
  }
  if (k === 'author') { S.author = el.value.trim().slice(0, 40); persist(); if (sheets.length) rerenderTop(); }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'pick-q') {
    pickerState.q = el.value;
    pickerState.focus = true;
    rerenderTop();
    pickerState.focus = false;
  }
  if (el.dataset.input === 'budget-range') {
    const box = el.closest('.budget-card').querySelector('[data-input="budget"]');
    if (box) box.value = el.value;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && $('#modal').classList.contains('open') && e.target.tagName === 'INPUT') A['modal-ok']();
});

// ---------- Schnittstelle für die Android-App ----------
window.SB = {
  // Zurück-Taste: true = in der App behandelt
  back() {
    if ($('#modal').classList.contains('open')) { closeModal(null); return true; }
    if (sheets.length) { closeSheet(); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    return false;
  },
  receiveImport(text) {
    if (decodeBuild(text)) openImport(text);
    else toast('Kein SetupBuilder-Code in der geteilten Nachricht gefunden.');
  },
};

$('.topbar .icon-btn').innerHTML = icon('share');
refresh();

// Oberfläche: Datei wählen -> Erkennen -> Ziel wählen -> Umwandeln -> Speichern/Öffnen
import { JAVA_VERSIONS, LATEST_JAVA, formatBytes } from '../core/index.js';
import { createEngine } from './engine.js';
import { appVersion, can, onIncomingFiles, openFile, platform, saveFile, shareFile, showInFolder } from './platform.js';

const $ = (id) => document.getElementById(id);
const engine = createEngine();
let info = null; // Analyse der aktuellen Datei
let edition = null; // gewähltes Ziel
let result = null; // letztes Ergebnis
let iconUrl = null;

const store = {
  get(k) {
    try {
      return localStorage.getItem('bb.' + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('bb.' + k, v);
    } catch {
      /* egal */
    }
  },
};

function show(...ids) {
  for (const id of ['pick', 'busy', 'error', 'info', 'target', 'result']) $(id).hidden = !ids.includes(id);
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function busy(text) {
  $('busy-text').textContent = text;
  show(...(info ? ['info', 'busy'] : ['busy']));
  $('busy').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function fail(err) {
  $('error-text').textContent = (err && err.message) || String(err);
  show('error');
}

function reset() {
  info = null;
  edition = null;
  result = null;
  $('file').value = '';
  show('pick');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Datei laden ----------
async function loadFiles(list) {
  const files = [];
  for (const f of list) files.push(f.bytes instanceof Uint8Array ? f : { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  if (!files.length) return;
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  info = null;
  busy(`„${files[0].name}“${files.length > 1 ? ` und ${files.length - 1} weitere` : ''} wird gelesen (${formatBytes(total)}) …`);
  try {
    info = await engine.analyze(files);
    renderInfo();
  } catch (e) {
    fail(e);
  }
}

const GENERIC_ICON = '<svg viewBox="0 0 24 24"><path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4z M3.5 7.4 12 12l8.5-4.6M12 12v9.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

function setIcon(bytes, isSkin) {
  const box = $('info-icon');
  box.textContent = '';
  if (iconUrl) URL.revokeObjectURL(iconUrl);
  iconUrl = null;
  if (!bytes) {
    box.innerHTML = GENERIC_ICON;
    return;
  }
  iconUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const img = new Image();
  img.alt = '';
  if (isSkin) {
    // Kopf des Skins zeigen (Gesicht + Hut-Ebene)
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d');
      const k = img.width / 64;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 8 * k, 8 * k, 8 * k, 8 * k, 0, 0, 8, 8);
      g.drawImage(img, 40 * k, 8 * k, 8 * k, 8 * k, 0, 0, 8, 8);
      box.textContent = '';
      box.append(c);
    };
  } else box.append(img);
  img.src = iconUrl;
}

function renderInfo() {
  const a = info;
  $('info-kind').textContent = a.title;
  $('info-kind').className = 'kind ' + (a.edition || '');
  $('info-name').textContent = a.name || '';
  $('info-desc').textContent = (a.description || '').replace(/§./g, '');
  $('info-desc').hidden = !a.description;
  setIcon(a.icon || a.preview || null, a.kind === 'skins' || a.kind === 'bedrock-skinpack' ? !a.icon : false);

  const facts = $('info-facts');
  facts.textContent = '';
  for (const f of a.facts || []) facts.append(el('div', {}, el('dt', { text: f.label }), el('dd', { text: f.value })));
  facts.hidden = !(a.facts && a.facts.length);

  const notes = $('info-notes');
  notes.textContent = '';
  if (!a.supported) {
    notes.append(el('p', { class: 'note warn', text: a.reason || 'Diese Datei lässt sich nicht umwandeln.' }));
    if (a.tip) notes.append(el('p', { class: 'note tip', text: a.tip }));
  }
  for (const n of a.notes || []) notes.append(el('p', { class: 'note', text: n }));

  if (!a.supported) {
    show('info');
    return;
  }
  // Ziel-Karten
  for (const btn of document.querySelectorAll('.edition')) {
    const t = a.targets[btn.dataset.edition];
    btn.disabled = !t || !t.available;
    btn.classList.remove('selected');
    btn.querySelector('.ed-out').textContent = t && t.available ? `→ ${t.label} (.${t.ext})` : 'nicht möglich';
  }
  const avail = ['bedrock', 'java'].filter((e) => a.targets[e] && a.targets[e].available);
  edition = null;
  $('options').hidden = true;
  const reasons = ['bedrock', 'java'].filter((e) => a.targets[e] && !a.targets[e].available && a.targets[e].reason).map((e) => a.targets[e].reason);
  $('target-reason').textContent = reasons.join(' ');
  $('target-reason').hidden = !reasons.length;
  $('name').value = a.name || '';
  $('desc').value = (a.description || '').slice(0, 200);
  show('info', 'target');
  // Gegenseite vorschlagen (Java-Datei -> Bedrock und umgekehrt)
  const preferred = avail.find((e) => e !== a.edition) || (avail.length === 1 ? avail[0] : null);
  if (preferred) selectEdition(preferred);
}

function selectEdition(ed) {
  edition = ed;
  for (const btn of document.querySelectorAll('.edition')) btn.classList.toggle('selected', btn.dataset.edition === ed);
  const t = info.targets[ed];
  $('options').hidden = false;
  $('opt-version').hidden = !(ed === 'java' && t.versions);
  $('opt-model').hidden = !(ed === 'bedrock' && info.options && info.options.skinModel);
  $('opt-mod').hidden = !(ed === 'bedrock' && info.options && info.options.modParts);
  const isSkin = info.kind === 'skins' || info.kind === 'bedrock-skinpack';
  $('opt-name').hidden = isSkin && ed === 'java';
  $('opt-desc').hidden = isSkin;
  if (ed === 'java' && t.versions) fillVersions(t);
}

function fillVersions(t) {
  const sel = $('version');
  const prev = sel.value || store.get('javaVersion') || LATEST_JAVA.id;
  sel.textContent = '';
  for (const v of JAVA_VERSIONS) {
    if (t.needsDp && !v.dp) continue;
    const same = info.edition === 'java' && info.format && v.rp === info.format && !t.needsDp;
    sel.append(el('option', { value: v.id, text: `Java ${v.label}${v.id === LATEST_JAVA.id ? ' (neueste)' : ''}${same ? ' – wie jetzt' : ''}` }));
  }
  sel.append(el('option', { value: 'custom', text: 'Andere Version (pack_format eingeben)' }));
  sel.value = [...sel.options].some((o) => o.value === prev) ? prev : LATEST_JAVA.id;
  $('custom-rp').hidden = sel.value !== 'custom';
}

// ---------- Umwandeln ----------
async function runConvert() {
  if (!info || !edition) return;
  const target = { edition };
  if (edition === 'java' && info.targets.java.versions) {
    const v = $('version').value;
    if (v === 'custom') {
      const n = Number($('custom-rp').value);
      if (!n || n < 1) {
        $('custom-rp').focus();
        return;
      }
      target.customRp = n;
    } else {
      target.javaVersion = v;
      store.set('javaVersion', v);
    }
  }
  const opts = {
    name: $('name').value.trim() || info.name,
    description: $('desc').value.trim(),
    model: $('model').value,
    items: $('mod-items').checked,
    blocks: $('mod-blocks').checked,
    recipes: $('mod-recipes').checked,
  };
  $('convert').disabled = true;
  busy('Wird umgewandelt …');
  try {
    result = await engine.convert(target, opts);
    renderResult();
  } catch (e) {
    fail(e);
  } finally {
    $('convert').disabled = false;
  }
}

const LEVEL_PILL = { ok: 'übernommen', warn: 'Hinweise', skip: 'nicht übertragbar' };

function renderResult() {
  const r = result;
  $('result-file').textContent = `${r.fileName} · ${formatBytes(r.bytes.length)}`;
  $('btn-open').hidden = !(r.openable && can.open);
  $('btn-share').hidden = !can.share;
  $('result-status').hidden = true;
  let hint = r.instructions || '';
  if (!can.open) hint = hint.replace(/Tippe auf „In Minecraft öffnen“( \(oder öffne die Datei mit Minecraft\))?/, 'Speichere die Datei und öffne sie mit Minecraft');
  else if (platform === 'windows') hint = hint.replace('Tippe auf', 'Klicke auf');
  $('result-hint').textContent = hint;
  $('result-hint').hidden = !r.instructions;

  const counts = { ok: 0, warn: 0, skip: 0 };
  for (const g of r.report) if (counts[g.level] != null) counts[g.level] += g.count;
  const sum = $('summary');
  sum.textContent = '';
  for (const lvl of ['ok', 'warn', 'skip']) if (counts[lvl]) sum.append(el('span', { class: 'pill ' + lvl, text: `${counts[lvl]} ${LEVEL_PILL[lvl]}` }));

  const rep = $('report');
  rep.textContent = '';
  for (const g of r.report) {
    const d = el('details', { class: g.level });
    d.append(el('summary', {}, el('span', { class: 'dot' }), el('span', { class: 't', text: g.title }), g.count > 1 || g.details.length > 1 ? el('span', { class: 'n', text: String(g.count) }) : null));
    if (g.details.length) {
      const ul = el('ul');
      for (const x of g.details) ul.append(el('li', { text: x }));
      if (g.count > g.details.length) ul.append(el('li', { text: `… und ${g.count - g.details.length} weitere` }));
      d.append(ul);
    }
    rep.append(d);
  }
  show('info', 'result');
  $('result').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function status(text, bad = false) {
  const s = $('result-status');
  s.textContent = text;
  s.className = 'status' + (bad ? ' bad' : '');
  s.hidden = false;
}

async function doSave() {
  if (!result) return;
  const r = await saveFile(result.fileName, result.bytes, result.mime);
  if (r.canceled) return;
  if (!r.ok) return status('Speichern fehlgeschlagen: ' + (r.error || 'unbekannter Fehler'), true);
  if (r.path) {
    status('Gespeichert: ' + r.path);
    if (platform === 'windows') {
      const s = $('result-status');
      const b = el('button', { class: 'link', type: 'button', text: ' Im Ordner zeigen' });
      b.onclick = () => showInFolder(r.path);
      s.append(b);
    }
  } else status(platform === 'web' ? 'Download gestartet.' : 'Gespeichert.');
}

async function doOpen() {
  if (!result) return;
  status('Wird an Minecraft übergeben …');
  const r = await openFile(result.fileName, result.bytes);
  if (r.ok) status(platform === 'android' ? 'An Minecraft übergeben – Minecraft zeigt den Import an.' : 'Geöffnet – Minecraft startet den Import.');
  else status((r.error || 'Öffnen nicht möglich.') + ' Tipp: Datei speichern und mit Minecraft öffnen.', true);
}

async function doShare() {
  if (!result) return;
  const r = await shareFile(result.fileName, result.bytes, result.mime);
  if (!r.ok && !r.canceled) status(r.error || 'Teilen nicht möglich.', true);
}

// ---------- Ereignisse ----------
function init() {
  appVersion().then((v) => {
    if (v) $('app-version').textContent = v;
  });
  document.body.classList.add('platform-' + platform);

  $('file').addEventListener('change', (e) => {
    if (e.target.files.length) loadFiles([...e.target.files]);
  });
  const drop = $('drop');
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('file').click();
    }
  });
  // Ziehen & Ablegen überall im Fenster
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    drop.classList.add('over');
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      drop.classList.remove('over');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    drop.classList.remove('over');
    const files = [...(e.dataTransfer ? e.dataTransfer.files : [])];
    if (files.length) loadFiles(files);
  });

  for (const btn of document.querySelectorAll('.edition')) btn.addEventListener('click', () => !btn.disabled && selectEdition(btn.dataset.edition));
  $('version').addEventListener('change', () => {
    $('custom-rp').hidden = $('version').value !== 'custom';
    if (!$('custom-rp').hidden) $('custom-rp').focus();
  });
  $('convert').addEventListener('click', runConvert);
  $('btn-save').addEventListener('click', doSave);
  $('btn-open').addEventListener('click', doOpen);
  $('btn-share').addEventListener('click', doShare);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action="reset"]');
    if (a) reset();
  });

  onIncomingFiles((files) => loadFiles(files));

  // Zurück-Taste auf Android
  window.BB = {
    back() {
      if (!$('pick').hidden) return false;
      if (!$('result').hidden) {
        show('info', 'target');
        return true;
      }
      reset();
      return true;
    },
  };
}

init();

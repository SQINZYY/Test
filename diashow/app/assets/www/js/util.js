// Kleine Helfer für DOM, Zeit, Zufall und Dialoge.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** Deterministischer Zufall (gleiche Diashow = gleiche Bewegungen). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtSec(sec) {
  return (Math.round(sec * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' s';
}

export function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

// ---------- Symbole (eigene, schlichte Linien-Icons, 24er Raster) ----------

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke-linejoin="round"/>',
  pause: '<path d="M7 5v14M17 5v14" stroke-width="3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  images: '<rect x="6" y="3" width="15" height="13" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><path d="M21 13l-4-4-6 6"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  frame: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 3v3M17 3v3M7 18v3M17 18v3"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  wand: '<path d="M4 20L15 9"/><path d="M14 4v3M19 9h-3M17.5 5.5l-2 2M12.5 2.5"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c2 0 3.2-1.5 4.2-3.3M13.3 10.3C14.3 8.5 15.5 7 17.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  rotate: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  flip: '<path d="M12 3v18M8 7l-5 5 5 5V7zM16 7l5 5-5 5V7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.3-1-1.7-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

// ---------- Hinweise, Dialoge, Bottom-Sheets ----------

let toastTimer = 0;
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const overlays = [];

/** Offene Overlays (Sheets, Dialoge) schließen sich mit der Zurück-Taste zuerst. */
export function closeTopOverlay() {
  const o = overlays[overlays.length - 1];
  if (!o) return false;
  if (o.blocking) return true;
  o.close();
  return true;
}

export function overlayOpen() {
  return overlays.length > 0;
}

export function sheet(title, body, { onClose, wide } = {}) {
  const panel = h('div', { class: 'sheet' + (wide ? ' wide' : '') },
    h('div', { class: 'sheet-grip' }),
    title ? h('div', { class: 'sheet-title' }, title) : null,
    body);
  const back = h('div', { class: 'sheet-back' }, panel);
  const entry = {
    close() {
      const i = overlays.indexOf(entry);
      if (i >= 0) overlays.splice(i, 1);
      back.classList.remove('show');
      setTimeout(() => back.remove(), 220);
      onClose && onClose();
    },
  };
  back.addEventListener('click', (e) => {
    if (e.target === back) entry.close();
  });
  overlays.push(entry);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('show'));
  return entry;
}

export function confirmDialog(text, { ok = 'OK', cancel = 'Abbrechen', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      s.close();
      resolve(v);
    };
    const s = sheet(null, h('div', { class: 'dialog' },
      h('p', null, text),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, cancel),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, ok))),
    { onClose: () => finish(false) });
  });
}

export function promptText(title, value = '', { placeholder = '', ok = 'Übernehmen' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'input', type: 'text', value, placeholder, maxlength: 80 });
    const finish = (v) => {
      if (done) return;
      done = true;
      s.close();
      resolve(v);
    };
    const s = sheet(title, h('div', { class: 'dialog' },
      input,
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => finish(null) }, 'Abbrechen'),
        h('button', { class: 'btn primary', onclick: () => finish(input.value.trim()) }, ok))),
    { onClose: () => finish(null) });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value.trim());
    });
    setTimeout(() => input.focus(), 250);
  });
}

/** Ganzflächiges Fortschritts-Overlay (blockiert die Zurück-Taste, außer es gibt „Abbrechen“). */
export function progressOverlay(title, { onCancel } = {}) {
  const bar = h('div', { class: 'pbar-fill' });
  const pct = h('div', { class: 'p-pct' }, '0 %');
  const sub = h('div', { class: 'p-sub' }, '');
  const cancelBtn = onCancel ? h('button', { class: 'btn ghost', onclick: () => onCancel() }, 'Abbrechen') : null;
  const titleEl = h('div', { class: 'p-title' }, title);
  const el = h('div', { class: 'progress-overlay' },
    h('div', { class: 'p-card' }, titleEl, pct, h('div', { class: 'pbar' }, bar), sub, cancelBtn));
  const entry = {
    blocking: !onCancel,
    close() {
      const i = overlays.indexOf(entry);
      if (i >= 0) overlays.splice(i, 1);
      el.remove();
    },
  };
  if (onCancel) entry.close = ((orig) => () => onCancel())(entry.close);
  overlays.push(entry);
  document.body.append(el);
  return {
    set(frac, text) {
      const p = clamp(frac, 0, 1);
      bar.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.floor(p * 100) + ' %';
      if (text != null) sub.textContent = text;
    },
    title(t) {
      titleEl.textContent = t;
    },
    done() {
      const i = overlays.indexOf(entry);
      if (i >= 0) overlays.splice(i, 1);
      el.remove();
    },
  };
}

// ---------- Eingabe-Bausteine ----------

export function chips(options, value, onChange, { cls = '' } = {}) {
  const wrap = h('div', { class: 'chips ' + cls });
  const render = (val) => {
    wrap.textContent = '';
    for (const o of options) {
      const b = h('button', { class: 'chip' + (o.id === val ? ' on' : ''), type: 'button', style: o.style },
        o.icon ? icon(o.icon, 16) : null, o.swatch ? h('i', { class: 'sw', style: { background: o.swatch } }) : null, o.name);
      b.addEventListener('click', () => {
        render(o.id);
        onChange(o.id);
      });
      wrap.append(b);
    }
  };
  render(value);
  wrap.set = render;
  return wrap;
}

export function slider(label, { min, max, step = 1, value, fmt = (v) => v, onInput, onChange }) {
  const out = h('span', { class: 'sl-val' }, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value });
  const fill = () => {
    const p = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--p', p + '%');
  };
  fill();
  input.addEventListener('input', () => {
    out.textContent = fmt(+input.value);
    fill();
    onInput && onInput(+input.value);
  });
  input.addEventListener('change', () => onChange && onChange(+input.value));
  const el = h('label', { class: 'slider' }, h('span', { class: 'sl-head' }, h('span', null, label), out), input);
  el.set = (v) => {
    input.value = v;
    out.textContent = fmt(v);
    fill();
  };
  return el;
}

export function toggle(label, value, onChange, hint) {
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'toggle' },
    h('span', { class: 'tg-text' }, label, hint ? h('small', null, hint) : null),
    input, h('span', { class: 'tg-ui' }));
}

export function section(title, ...kids) {
  return h('div', { class: 'section' }, title ? h('div', { class: 'section-title' }, title) : null, ...kids);
}

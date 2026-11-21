// Bildschirm-Stapel, Zurück-Taste und gemeinsame Abläufe (Bilder einlesen).
import { h, icon, toast, progressOverlay, closeTopOverlay } from './util.js';
import { pickImages, takeSharedImages } from './native.js';

const stack = [];
const root = () => document.getElementById('app');

/** Neuen Bildschirm öffnen: { el, onBack?() → true wenn erledigt, destroy?(), onShow?() } */
export function push(screen) {
  const top = stack[stack.length - 1];
  if (top) top.el.classList.add('hidden');
  stack.push(screen);
  root().append(screen.el);
  window.scrollTo(0, 0);
}

export function pop() {
  const s = stack.pop();
  if (!s) return;
  s.destroy && s.destroy();
  s.el.remove();
  const top = stack[stack.length - 1];
  if (top) {
    top.el.classList.remove('hidden');
    top.onShow && top.onShow();
  }
}

export function popToRoot() {
  while (stack.length > 1) pop();
}

window.DS = {
  back() {
    if (closeTopOverlay()) return true;
    const top = stack[stack.length - 1];
    if (top && top.onBack && top.onBack()) return true;
    if (stack.length > 1) {
      pop();
      return true;
    }
    return false;
  },
};

// Im Browser: Escape wie die Zurück-Taste
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.DS.back();
});

/** Bilder auswählen (oder geteilte übernehmen) und mit Fortschrittsanzeige einlesen. */
export async function importImages({ multiple = true, shared = false } = {}) {
  let ov = null;
  const onProgress = (done, total) => {
    if (!ov && total > 0) ov = progressOverlay(total === 1 ? 'Bild wird geladen' : 'Bilder werden geladen');
    if (ov) ov.set(total ? done / total : 0, `${done} von ${total}`);
  };
  const items = shared ? await takeSharedImages({ onProgress }) : await pickImages({ multiple, onProgress });
  if (ov) ov.done();
  if (items.errors && items.errors.length) {
    toast(`${items.errors.length} ${items.errors.length === 1 ? 'Bild konnte' : 'Bilder konnten'} nicht gelesen werden`);
  }
  return items;
}

export function menuItem(ic, label, onclick, cls = '') {
  return h('button', { class: 'menu-item ' + cls, onclick }, icon(ic, 20), h('span', null, label));
}

/** Kopfzeile eines Bildschirms mit Zurück-Knopf. */
export function header(title, ...right) {
  const t = typeof title === 'string' ? h('div', { class: 'h-title' }, title) : title;
  return h('header', { class: 'bar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onclick: () => window.DS.back() }, icon('back')),
    t, h('div', { class: 'bar-right' }, ...right));
}

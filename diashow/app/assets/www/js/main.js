// Einstieg: Bildschirm-Stapel, Zurück-Taste, Startseite.
import { h, icon, toast, sheet, confirmDialog, promptText, progressOverlay, fmtTime, fmtDate, uid } from './util.js';
import { onShared, discardShared, isNative, nativeInfo } from './native.js';
import { push, popToRoot, importImages, menuItem } from './nav.js';
import { listProjects, deleteProject, duplicateProject, getBlob, putProject, persist } from './store.js';
import { loadFonts } from './draw.js';
import { ImageStore } from './images.js';
import { newProject, addSlide, timeline } from './slideshow.js';
import { openEditor } from './editor.js';
import { openCollage } from './collage.js';
import { openPhotoEditor } from './photoedit.js';
import { openGif } from './gif.js';

/** Neue Diashow aus eingelesenen Bildern anlegen und öffnen. */
export async function createSlideshow(items) {
  if (!items.length) return;
  const p = newProject([]);
  const store = new ImageStore(p.id);
  const ov = items.length > 3 ? progressOverlay('Diashow wird vorbereitet') : null;
  for (let i = 0; i < items.length; i++) {
    const { id, meta } = await store.add(items[i]);
    addSlide(p, id, meta);
    if (ov) ov.set((i + 1) / items.length, `${i + 1} von ${items.length}`);
  }
  if (p.slides.length > 30) p.duration = 2.5;
  await putProject(p);
  if (ov) ov.done();
  openEditor(p, store, { fresh: true });
}

async function newSlideshow() {
  const items = await importImages();
  await createSlideshow(items);
}

async function memoryTool(open, { min = 1, max = 100, multiple = true } = {}) {
  const items = await importImages({ multiple });
  if (!items.length) return;
  if (items.length < min) {
    toast(`Bitte mindestens ${min} Bilder auswählen`);
    return;
  }
  const store = new ImageStore(null);
  const ids = [];
  for (const it of items.slice(0, max)) ids.push(await store.add(it));
  if (items.length > max) toast(`Es werden die ersten ${max} Bilder verwendet`);
  open(store, ids);
}

export const tools = {
  slideshow: newSlideshow,
  collage: () => memoryTool(openCollage, { min: 2, max: 9 }),
  edit: () => memoryTool(openPhotoEditor, { min: 1, max: 30 }),
  gif: () => memoryTool(openGif, { min: 2, max: 60 }),
};

// ---------- Startseite ----------

function homeScreen() {
  const list = h('div', { class: 'projects' });
  const el = h('div', { class: 'screen home' },
    h('header', { class: 'home-head' },
      h('div', { class: 'logo' }, h('img', { src: 'icon.svg', alt: '' })),
      h('div', null, h('h1', null, 'Diashow Studio'), h('p', { class: 'muted' }, 'Aus deinen Fotos wird ein Video'))),
    h('div', { class: 'content' },
      h('button', { class: 'hero', onclick: tools.slideshow },
        h('div', { class: 'hero-art' }, h('span'), h('span'), h('span')),
        h('div', { class: 'hero-text' },
          h('strong', null, 'Neue Diashow'),
          h('span', null, 'Bilder auswählen – Übergänge, Effekte und Musik macht die App')),
        h('span', { class: 'hero-btn' }, icon('plus', 26))),
      h('div', { class: 'tools' },
        toolCard('grid', 'Collage', 'Mehrere Fotos in einem Bild', tools.collage),
        toolCard('wand', 'Foto bearbeiten', 'Filter, Zuschnitt, Text', tools.edit),
        toolCard('film', 'GIF', 'Animiertes Bild', tools.gif)),
      h('div', { class: 'section-title' }, 'Meine Diashows'),
      list,
      h('p', { class: 'privacy' }, icon('lock', 16), 'Alles bleibt auf deinem Handy – die App braucht kein Internet.'),
      h('button', { class: 'link', onclick: showInfo }, 'Info & Lizenzen')));

  async function refresh() {
    const projects = (await listProjects()).filter((p) => p.kind === 'slideshow');
    list.textContent = '';
    if (!projects.length) {
      list.append(h('div', { class: 'empty' }, 'Noch keine Diashows. Tippe oben auf „Neue Diashow“.'));
      return;
    }
    for (const p of projects) list.append(projectCard(p, refresh));
  }
  refresh();
  return { el, onShow: refresh, onBack: () => false };
}

function toolCard(ic, title, text, onclick) {
  return h('button', { class: 'tool', onclick }, h('span', { class: 'tool-ic' }, icon(ic, 24)), h('strong', null, title), h('span', null, text));
}

function projectCard(p, refresh) {
  const img = h('img', { alt: '' });
  const first = p.slides[0];
  if (first) {
    getBlob(`${p.id}/thumb/${first.img}`).then((b) => {
      if (b) img.src = URL.createObjectURL(b);
    });
  }
  const tl = timeline(p);
  const open = async () => {
    const store = new ImageStore(p.id);
    openEditor(p, store);
  };
  const more = (e) => {
    e.stopPropagation();
    const s = sheet(p.title, h('div', { class: 'menu' },
      menuItem('edit', 'Umbenennen', async () => {
        s.close();
        const t = await promptText('Diashow umbenennen', p.title);
        if (t) {
          p.title = t;
          await putProject(p);
          refresh();
        }
      }),
      menuItem('copy', 'Kopie erstellen', async () => {
        s.close();
        await duplicateProject(p, uid(), p.title + ' (Kopie)');
        refresh();
        toast('Kopie erstellt');
      }),
      menuItem('trash', 'Löschen', async () => {
        s.close();
        if (await confirmDialog(`„${p.title}“ wirklich löschen? Die Fotos in deiner Galerie bleiben erhalten.`, { ok: 'Löschen', danger: true })) {
          await deleteProject(p.id);
          refresh();
        }
      }, 'danger')));
  };
  return h('div', { class: 'project', onclick: open },
    h('div', { class: 'p-thumb' }, img),
    h('div', { class: 'p-info' },
      h('strong', null, p.title),
      h('span', { class: 'muted' }, `${p.slides.length} ${p.slides.length === 1 ? 'Bild' : 'Bilder'} · ${fmtTime(tl.total)} · ${fmtDate(p.updated)}`)),
    h('button', { class: 'icon-btn', onclick: more, 'aria-label': 'Mehr' }, icon('more')));
}

function showInfo() {
  const info = nativeInfo();
  sheet('Diashow Studio', h('div', { class: 'info' },
    h('p', null, 'Macht aus deinen Fotos Diashow-Videos (MP4) mit Übergängen, Zoom-Effekten, Farb-Looks, Text und Musik – außerdem Collagen, bearbeitete Fotos und GIFs.'),
    h('p', null, 'Alle Bilder werden nur auf dem Handy verarbeitet. Fertige Videos und Bilder landen in der Galerie im Album „Diashow Studio“.'),
    info ? h('p', { class: 'muted' }, `Version ${info.version} · Android-API ${info.sdk}`) : null,
    h('p', { class: 'muted' }, 'Verwendete Bausteine: mp4-muxer (MIT), gifenc (MIT), Schriften Playfair Display, Montserrat, Dancing Script und Bebas Neue (SIL Open Font License 1.1).')));
}

// ---------- Bilder, die per „Teilen“ ankommen ----------

function handleShared(count) {
  const s = sheet(`${count} ${count === 1 ? 'Bild' : 'Bilder'} empfangen`, h('div', { class: 'menu' },
    h('p', { class: 'muted' }, 'Was möchtest du daraus machen?'),
    menuItem('film', 'Diashow erstellen', () => go(async (items) => createSlideshow(items))),
    count >= 2 ? menuItem('grid', 'Collage', () => go((items) => toStore(items, openCollage, 9))) : null,
    menuItem('wand', 'Foto bearbeiten', () => go((items) => toStore(items, openPhotoEditor, 30))),
    count >= 2 ? menuItem('images', 'GIF erstellen', () => go((items) => toStore(items, openGif, 60))) : null),
  { onClose: () => !taken && discardShared() });
  let taken = false;
  async function go(fn) {
    taken = true;
    s.close();
    popToRoot();
    const items = await importImages({ shared: true });
    if (items.length) await fn(items);
  }
}

async function toStore(items, open, max) {
  const store = new ImageStore(null);
  const ids = [];
  for (const it of items.slice(0, max)) ids.push(await store.add(it));
  open(store, ids);
}

// ---------- Start ----------

async function start() {
  persist();
  loadFonts();
  push(homeScreen());
  onShared(handleShared);
  if (!isNative) document.body.classList.add('browser');
}

start();


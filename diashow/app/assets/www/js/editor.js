// Diashow-Editor: Vorschau, Bildleiste (antippen, lange drücken + ziehen zum Umsortieren),
// Einstellungen in Tabs und der Export als Video.
import { h, icon, toast, sheet, confirmDialog, promptText, progressOverlay, chips, slider, toggle, section,
  fmtTime, fmtSec, fmtSize, clamp, debounce, uid } from './util.js';
import { push, pop, importImages, header } from './nav.js';
import { putProject, putBlob, getBlob, deleteBlob } from './store.js';
import { pickAudio, onAppPause } from './native.js';
import { LOOKS, FONTS, lookById, applyTint } from './draw.js';
import { FORMATS, TRANSITIONS, MOTIONS, STYLES, outputSize, timeline, renderFrame, imagesAround, indexAt,
  slideDur, addSlide, applyStyle } from './slideshow.js';
import { MusicPlayer, decodeMusic } from './audio.js';
import { exportVideo } from './export.js';

const TEXT_COLORS = ['#ffffff', '#fff1d0', '#ffd166', '#ff7a59', '#9be7ff', '#111111'];

export async function openEditor(p, store, { fresh = false } = {}) {
  // Ältere Projekte ergänzen
  p.intro = p.intro || { text: '', sub: '' };
  p.ending = p.ending || { text: '' };

  await store.loadThumbs(Object.keys(p.images));
  const player = new MusicPlayer();
  let musicBuf = null;
  if (p.music) {
    try {
      const b = await getBlob(`${p.id}/music`);
      if (b) musicBuf = await decodeMusic(b);
      player.setBuffer(musicBuf);
    } catch {
      toast('Musik konnte nicht geladen werden');
    }
  }

  let tl = timeline(p);
  let t = 0;
  let playing = false;
  let raf = 0;
  let startPerf = 0;
  let startT = 0;
  let sel = 0;
  let tab = 'slides';
  let lastIdx = -1;
  // Steht die Vorschau ganz am Anfang? Dann ein sichtbares Bild zeigen, Abspielen startet aber bei 0.
  let atStart = true;
  const START_VIEW = 0.7;

  const saveNow = () => {
    p.updated = Date.now();
    return putProject(p).catch(() => toast('Speichern fehlgeschlagen'));
  };
  const save = debounce(saveNow, 600);

  // ---------- Aufbau ----------
  const titleEl = h('button', { class: 'h-title editable', onclick: rename }, p.title);
  const exportBtn = h('button', { class: 'btn primary small', onclick: startExport }, icon('download', 18), 'Video');
  const canvas = h('canvas', { class: 'preview' });
  const ctx = canvas.getContext('2d', { alpha: false });
  const playOverlay = h('div', { class: 'play-overlay' }, icon('play', 44));
  const stage = h('div', { class: 'stage' }, h('div', { class: 'canvas-wrap', onclick: togglePlay }, canvas, playOverlay));
  const playBtn = h('button', { class: 'icon-btn play-btn', onclick: togglePlay, 'aria-label': 'Abspielen' }, icon('play'));
  const timeEl = h('span', { class: 'time' }, '0:00 / 0:00');
  const scrub = h('input', { type: 'range', class: 'scrub', min: 0, max: 1000, value: 0 });
  scrub.addEventListener('input', () => seek((scrub.value / 1000) * tl.total));
  const transport = h('div', { class: 'transport' }, playBtn, scrub, timeEl);
  const strip = h('div', { class: 'strip' });
  const panel = h('div', { class: 'panel' });
  const tabsEl = h('nav', { class: 'tabs' });
  const TABS = [
    ['slides', 'image', 'Bild'],
    ['style', 'sparkles', 'Stil'],
    ['music', 'music', 'Musik'],
    ['text', 'text', 'Text'],
    ['format', 'frame', 'Format'],
  ];
  for (const [id, ic, label] of TABS) {
    tabsEl.append(h('button', { class: 'tab', 'data-tab': id, onclick: () => setTab(id) }, icon(ic, 22), h('span', null, label)));
  }

  const el = h('div', { class: 'screen editor' },
    header(titleEl, exportBtn),
    h('div', { class: 'editor-main' },
      h('div', { class: 'editor-left' }, stage, transport, strip),
      h('div', { class: 'editor-right' }, panel)),
    tabsEl);

  // ---------- Vorschau ----------
  const src = (id) => store.peekFull(id) || { bmp: store.thumb(id), blur: null };

  function sizeCanvas() {
    const { w, h: hh } = outputSize(p.format, '1080');
    const wrap = stage.getBoundingClientRect();
    const availW = Math.max(120, (wrap.width || window.innerWidth) - 24);
    const wide = window.innerWidth > 760 && window.innerWidth > window.innerHeight;
    const maxH = wide ? window.innerHeight * 0.55 : Math.min(window.innerHeight * 0.36, 520);
    let cw = availW;
    let ch = (cw * hh) / w;
    if (ch > maxH) {
      ch = maxH;
      cw = (ch * w) / hh;
    }
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let bw = Math.round(cw * dpr);
    let bh = Math.round(ch * dpr);
    const maxPx = 1280 * 720;
    if (bw * bh > maxPx) {
      const s = Math.sqrt(maxPx / (bw * bh));
      bw = Math.round(bw * s);
      bh = Math.round(bh * s);
    }
    canvas.width = bw;
    canvas.height = bh;
    draw();
  }

  function draw() {
    renderFrame(ctx, canvas.width, canvas.height, p, tl, t, src, { frameSeed: Math.floor(t * 30) });
  }

  function prefetch() {
    for (const id of imagesAround(p, tl, t, 1.5).slice(0, 3)) store.getFull(id).catch(() => {});
  }

  const offLoaded = store.onLoaded(() => {
    if (!playing) draw();
  });

  function updateTime() {
    const shown = atStart ? 0 : t;
    timeEl.textContent = `${fmtTime(shown)} / ${fmtTime(tl.total)}`;
    scrub.value = tl.total ? Math.round((shown / tl.total) * 1000) : 0;
    scrub.style.setProperty('--p', (tl.total ? (shown / tl.total) * 100 : 0) + '%');
    if (tl.items.length) {
      const i = indexAt(tl, t);
      if (i !== lastIdx) {
        lastIdx = i;
        for (const th of strip.querySelectorAll('.thumb')) th.classList.toggle('now', +th.dataset.i === i);
      }
    }
  }

  function play() {
    if (!tl.items.length) return;
    if (t >= tl.total - 0.05 || atStart) t = 0;
    atStart = false;
    playing = true;
    startPerf = performance.now();
    startT = t;
    if (musicBuf) player.start(t, p.music, tl.total);
    playOverlay.classList.add('hide');
    playBtn.replaceChildren(icon('pause'));
    loop();
  }

  function loop() {
    raf = requestAnimationFrame(() => {
      if (!playing) return;
      t = startT + (performance.now() - startPerf) / 1000;
      if (t >= tl.total) {
        pause();
        toStart();
        return;
      }
      prefetch();
      draw();
      updateTime();
      loop();
    });
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    player.stop();
    playOverlay.classList.remove('hide');
    playBtn.replaceChildren(icon('play'));
  }

  function togglePlay() {
    if (playing) pause();
    else play();
  }

  function toStart() {
    t = Math.min(START_VIEW, tl.total);
    atStart = true;
    draw();
    updateTime();
  }

  function seek(nt) {
    atStart = false;
    t = clamp(nt, 0, tl.total);
    if (playing) {
      startT = t;
      startPerf = performance.now();
      if (musicBuf) player.start(t, p.music, tl.total);
    }
    prefetch();
    draw();
    updateTime();
  }

  /** Nach jeder Änderung: Zeitleiste neu, speichern, Vorschau neu zeichnen. */
  function changed({ strip: re = false, panel: rp = false, size = false } = {}) {
    tl = timeline(p);
    if (t > tl.total) t = tl.total;
    save();
    if (re) renderStrip();
    if (rp) renderPanel();
    if (size) sizeCanvas();
    else draw();
    if (playing && musicBuf) {
      startT = t;
      startPerf = performance.now();
      player.start(t, p.music, tl.total);
    }
    updateTime();
  }

  function showSlide(i) {
    if (!tl.items[i]) return;
    const it = tl.items[i];
    seek(it.start + Math.min(0.6, it.dur * 0.3));
  }

  // ---------- Bildleiste ----------
  function renderStrip() {
    strip.textContent = '';
    p.slides.forEach((s, i) => {
      const th = h('div', { class: 'thumb' + (i === sel ? ' sel' : ''), 'data-i': i },
        h('img', { src: store.thumbUrl(s.img), draggable: 'false', alt: '' }),
        h('span', { class: 'num' }, String(i + 1)),
        s.caption ? h('span', { class: 'cap' }, icon('text', 12)) : null,
        h('span', { class: 'dur' }, fmtSec(slideDur(p, s))));
      th.addEventListener('click', () => {
        if (th.dataset.dragged) return;
        select(i);
      });
      th.addEventListener('contextmenu', (e) => e.preventDefault());
      enableDrag(th, i);
      strip.append(th);
    });
    strip.append(h('button', { class: 'thumb add', onclick: addImages, 'aria-label': 'Bilder hinzufügen' }, icon('plus', 26)));
    lastIdx = -1;
    updateTime();
  }

  function select(i, { seekTo = true } = {}) {
    sel = clamp(i, 0, Math.max(0, p.slides.length - 1));
    for (const th of strip.querySelectorAll('.thumb')) th.classList.toggle('sel', +th.dataset.i === sel);
    const cur = strip.querySelector(`.thumb[data-i="${sel}"]`);
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    if (seekTo) {
      if (playing) pause();
      showSlide(sel);
    }
    if (tab !== 'slides') setTab('slides');
    else renderPanel();
  }

  /** Lange drücken und ziehen: Reihenfolge ändern. */
  function enableDrag(th, i) {
    let timer = 0;
    let sx = 0;
    let sy = 0;
    let dragging = false;
    let target = i;
    const begin = () => {
      dragging = true;
      th.classList.add('dragging');
      strip.classList.add('sorting');
      if (navigator.vibrate) navigator.vibrate(15);
    };
    const move = (x) => {
      th.style.transform = `translateX(${x - sx}px) scale(1.08)`;
      const items = [...strip.querySelectorAll('.thumb:not(.add)')];
      target = i;
      let best = Infinity;
      items.forEach((it, k) => {
        const r = it.getBoundingClientRect();
        const c = r.left + r.width / 2;
        const d = Math.abs(c - x);
        if (d < best) {
          best = d;
          target = k;
        }
      });
      items.forEach((it, k) => it.classList.toggle('drop', k === target && k !== i));
      const r = strip.getBoundingClientRect();
      if (x < r.left + 40) strip.scrollLeft -= 12;
      if (x > r.right - 40) strip.scrollLeft += 12;
    };
    const end = () => {
      clearTimeout(timer);
      if (!dragging) return;
      dragging = false;
      th.dataset.dragged = '1';
      setTimeout(() => delete th.dataset.dragged, 50);
      strip.classList.remove('sorting');
      if (target !== i) {
        const [s] = p.slides.splice(i, 1);
        p.slides.splice(target, 0, s);
        sel = target;
        changed({ strip: true, panel: true });
        showSlide(sel);
      } else renderStrip();
    };
    th.addEventListener('touchstart', (e) => {
      const p0 = e.touches[0];
      sx = p0.clientX;
      sy = p0.clientY;
      timer = setTimeout(begin, 380);
    }, { passive: true });
    th.addEventListener('touchmove', (e) => {
      const p1 = e.touches[0];
      if (!dragging) {
        if (Math.hypot(p1.clientX - sx, p1.clientY - sy) > 10) clearTimeout(timer);
        return;
      }
      e.preventDefault();
      move(p1.clientX);
    }, { passive: false });
    th.addEventListener('touchend', end);
    th.addEventListener('touchcancel', end);
  }

  async function addImages() {
    if (playing) pause();
    const items = await importImages();
    if (!items.length) return;
    const ov = items.length > 3 ? progressOverlay('Bilder werden hinzugefügt') : null;
    for (let k = 0; k < items.length; k++) {
      const { id, meta } = await store.add(items[k]);
      addSlide(p, id, meta);
      if (ov) ov.set((k + 1) / items.length);
    }
    if (ov) ov.done();
    sel = p.slides.length - items.length;
    changed({ strip: true, panel: true });
    showSlide(sel);
    toast(`${items.length} ${items.length === 1 ? 'Bild' : 'Bilder'} hinzugefügt`);
  }

  async function removeSlide(i) {
    const s = p.slides[i];
    if (!s) return;
    p.slides.splice(i, 1);
    // Bilddaten löschen, wenn kein anderes Dia sie nutzt
    if (!p.slides.some((x) => x.img === s.img)) {
      delete p.images[s.img];
      store.remove(s.img);
      deleteBlob(`${p.id}/img/${s.img}`).catch(() => {});
      deleteBlob(`${p.id}/thumb/${s.img}`).catch(() => {});
    }
    sel = clamp(i, 0, Math.max(0, p.slides.length - 1));
    changed({ strip: true, panel: true });
    if (p.slides.length) showSlide(sel);
  }

  // ---------- Tabs ----------
  function setTab(id) {
    tab = id;
    for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === id);
    renderPanel();
    panel.scrollTop = 0;
  }

  function renderPanel() {
    panel.textContent = '';
    const fn = { slides: slidesPanel, style: stylePanel, music: musicPanel, text: textPanel, format: formatPanel }[tab];
    panel.append(fn());
  }

  function slidesPanel() {
    const wrap = h('div');
    if (!p.slides.length) {
      wrap.append(h('div', { class: 'empty big' },
        h('p', null, 'Noch keine Bilder in dieser Diashow.'),
        h('button', { class: 'btn primary', onclick: addImages }, icon('plus', 18), 'Bilder hinzufügen')));
      return wrap;
    }
    const s = p.slides[sel];
    const meta = p.images[s.img] || {};
    const fit = s.fit || p.fit;

    wrap.append(h('div', { class: 'row between' },
      h('strong', null, `Bild ${sel + 1} von ${p.slides.length}`),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', disabled: sel === 0, 'aria-label': 'Nach vorne', onclick: () => moveSlide(-1) }, icon('left')),
        h('button', { class: 'icon-btn', disabled: sel === p.slides.length - 1, 'aria-label': 'Nach hinten', onclick: () => moveSlide(1) }, icon('right')),
        h('button', { class: 'icon-btn', 'aria-label': 'Duplizieren', onclick: duplicate }, icon('copy')),
        h('button', { class: 'icon-btn danger', 'aria-label': 'Entfernen', onclick: () => removeSlide(sel) }, icon('trash')))));

    // Bildtext
    const cap = h('input', { class: 'input', type: 'text', value: s.caption || '', placeholder: 'Text zu diesem Bild (optional)', maxlength: 90 });
    cap.addEventListener('input', debounce(() => {
      s.caption = cap.value;
      changed();
      const th = strip.querySelector(`.thumb[data-i="${sel}"]`);
      if (th && !!th.querySelector('.cap') !== !!s.caption) renderStrip();
    }, 250));
    wrap.append(section('Bildtext', cap));

    // Fokuspunkt
    if (fit !== 'contain') {
      const dot = h('span', { class: 'focus-dot', style: { left: s.fx * 100 + '%', top: s.fy * 100 + '%' } });
      const img = h('img', { src: store.thumbUrl(s.img), draggable: 'false', alt: '' });
      const box = h('div', { class: 'focus-box' }, img, dot);
      const setFocus = (e) => {
        const r = img.getBoundingClientRect();
        const pt = e.touches ? e.touches[0] : e;
        s.fx = clamp((pt.clientX - r.left) / r.width, 0, 1);
        s.fy = clamp((pt.clientY - r.top) / r.height, 0, 1);
        dot.style.left = s.fx * 100 + '%';
        dot.style.top = s.fy * 100 + '%';
        changed();
      };
      box.addEventListener('pointerdown', (e) => {
        box.setPointerCapture(e.pointerId);
        setFocus(e);
      });
      box.addEventListener('pointermove', (e) => {
        if (e.buttons || e.pointerType === 'touch') setFocus(e);
      });
      wrap.append(section('Wichtigster Bildbereich', h('p', { class: 'hint' }, 'Tippe auf das, was immer zu sehen sein soll (z. B. Gesichter). Der Ausschnitt richtet sich danach.'), box));
    }

    // Dauer
    const durSl = slider('Anzeigedauer', {
      min: 0.5, max: 12, step: 0.1, value: slideDur(p, s), fmt: fmtSec,
      onInput: (v) => {
        s.dur = v;
        changed();
      },
      onChange: () => renderStrip(),
    });
    const resetDur = h('button', { class: 'link small', onclick: () => {
      s.dur = null;
      durSl.set(p.duration);
      changed({ strip: true });
    } }, `Standard (${fmtSec(p.duration)})`);
    wrap.append(section(null, durSl, s.dur ? resetDur : null));

    wrap.append(section('Übergang zum nächsten Bild',
      chips([{ id: null, name: 'Wie alle' }, ...TRANSITIONS], s.tr, (v) => {
        s.tr = v;
        changed();
        showTransition(sel);
      })));
    wrap.append(section('Bewegung',
      chips(MOTIONS, s.motion || 'auto', (v) => {
        s.motion = v;
        changed();
        showSlide(sel);
        if (!playing) play();
      })));
    wrap.append(section('Darstellung',
      chips([{ id: null, name: 'Wie alle' }, { id: 'cover', name: 'Füllen' }, { id: 'contain', name: 'Ganzes Bild' }], s.fit, (v) => {
        s.fit = v;
        changed({ panel: true });
      })));
    if (meta.name) wrap.append(h('p', { class: 'hint' }, `${meta.name} · ${meta.w} × ${meta.h}`));

    wrap.append(section('Alle Bilder',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: addImages }, icon('plus', 18), 'Hinzufügen'),
        h('button', { class: 'btn', onclick: () => sortSlides('date') }, icon('clock', 18), 'Nach Datum'),
        h('button', { class: 'btn', onclick: () => sortSlides('reverse') }, icon('sort', 18), 'Umkehren'),
        h('button', { class: 'btn', onclick: () => sortSlides('shuffle') }, icon('shuffle', 18), 'Mischen')),
      h('p', { class: 'hint' }, 'Tipp: Bild in der Leiste lange drücken und ziehen, um die Reihenfolge zu ändern.')));
    return wrap;
  }

  function showTransition(i) {
    const it = tl.items[i];
    if (!it || i >= tl.items.length - 1) return;
    seek(Math.max(it.start, it.end - it.trOut - 0.6));
    if (!playing) play();
  }

  function moveSlide(d) {
    const j = sel + d;
    if (j < 0 || j >= p.slides.length) return;
    const [s] = p.slides.splice(sel, 1);
    p.slides.splice(j, 0, s);
    sel = j;
    changed({ strip: true, panel: true });
    showSlide(sel);
  }

  function duplicate() {
    const s = p.slides[sel];
    const copy = { ...s, id: uid() };
    p.slides.splice(sel + 1, 0, copy);
    sel++;
    changed({ strip: true, panel: true });
    showSlide(sel);
  }

  function sortSlides(kind) {
    if (kind === 'date') {
      const has = p.slides.some((s) => (p.images[s.img] || {}).date);
      if (!has) {
        toast('Die Bilder haben kein Aufnahmedatum');
        return;
      }
      p.slides.sort((a, b) => ((p.images[a.img] || {}).date || 0) - ((p.images[b.img] || {}).date || 0));
    } else if (kind === 'reverse') p.slides.reverse();
    else {
      for (let i = p.slides.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p.slides[i], p.slides[j]] = [p.slides[j], p.slides[i]];
      }
    }
    sel = 0;
    changed({ strip: true, panel: true });
    showSlide(0);
  }

  function stylePanel() {
    const wrap = h('div');
    const grid = h('div', { class: 'style-grid' });
    for (const st of STYLES) {
      const c = h('canvas', { width: 240, height: Math.round((240 * outputSize(p.format, '720').h) / outputSize(p.format, '720').w) });
      const card = h('button', { class: 'style-card' + (p.style === st.id ? ' on' : ''), onclick: () => {
        applyStyle(p, st.id);
        changed({ panel: true });
        seek(0.8);
        if (!playing) play();
      } }, c, h('strong', null, st.name), h('span', null, st.desc));
      grid.append(card);
      drawStyleThumb(c, st);
    }
    wrap.append(section('Stil – ein Tipp, alles passt', grid));

    wrap.append(section('Farb-Look', lookStrip(p.look, (id) => {
      p.look = id;
      changed();
    })));
    wrap.append(section('Übergang (alle Bilder)',
      chips(TRANSITIONS, p.transition, (v) => {
        p.transition = v;
        changed();
        showTransition(Math.min(sel, Math.max(0, p.slides.length - 2)));
      })));
    wrap.append(section(null,
      slider('Dauer pro Bild', { min: 0.8, max: 10, step: 0.1, value: p.duration, fmt: fmtSec, onInput: (v) => {
        p.duration = v;
        changed();
      }, onChange: () => renderStrip() }),
      slider('Dauer der Übergänge', { min: 0.2, max: 2.5, step: 0.1, value: p.transDur, fmt: fmtSec, onInput: (v) => {
        p.transDur = v;
        changed();
      } }),
      toggle('Bewegung (Zoom & Schwenk)', p.motion, (v) => {
        p.motion = v;
        changed();
      }, 'Langsamer Kamera-Effekt auf jedem Bild'),
      slider('Vignette (dunkle Ecken)', { min: 0, max: 100, value: Math.round((p.vignette || 0) * 100), fmt: (v) => v + ' %', onInput: (v) => {
        p.vignette = v / 100;
        changed();
      } }),
      slider('Filmkorn', { min: 0, max: 100, value: Math.round((p.grain || 0) * 100), fmt: (v) => v + ' %', onInput: (v) => {
        p.grain = v / 100;
        changed();
      } }),
      toggle('Kino-Balken', !!p.letterbox, (v) => {
        p.letterbox = v;
        changed();
      })));
    return wrap;
  }

  function drawStyleThumb(c, st) {
    const s = p.slides[0];
    if (!s) return;
    const clone = JSON.parse(JSON.stringify(p));
    applyStyle(clone, st.id);
    clone.intro = { text: '', sub: '' };
    clone.ending = { text: '' };
    const ctl = timeline(clone);
    const it = ctl.items[0];
    const at = Math.min(it.end - it.trOut - 0.05, it.start + it.dur * 0.6);
    const draw2 = () => renderFrame(c.getContext('2d'), c.width, c.height, clone, ctl, Math.max(0.7, at), src);
    draw2();
    store.getFull(s.img).then(draw2).catch(() => {});
  }

  function lookStrip(value, onPick) {
    const s = p.slides[sel] || p.slides[0];
    const bmp = s ? store.thumb(s.img) : null;
    const row = h('div', { class: 'look-strip' });
    for (const l of LOOKS) {
      const c = h('canvas', { width: 120, height: 120 });
      if (bmp) {
        const g = c.getContext('2d');
        const sc = Math.max(120 / bmp.width, 120 / bmp.height);
        g.filter = l.filter || 'none';
        g.drawImage(bmp, (120 - bmp.width * sc) / 2, (120 - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
        g.filter = 'none';
        applyTint(g, 0, 0, 120, 120, l.id);
      }
      const b = h('button', { class: 'look' + (l.id === value ? ' on' : ''), onclick: () => {
        for (const x of row.children) x.classList.remove('on');
        b.classList.add('on');
        onPick(l.id);
      } }, c, h('span', null, l.name));
      row.append(b);
    }
    return row;
  }

  function musicPanel() {
    const wrap = h('div');
    if (!p.music || !musicBuf) {
      wrap.append(h('div', { class: 'card music-empty' },
        h('div', { class: 'big-ic' }, icon('music', 34)),
        h('strong', null, 'Musik hinzufügen'),
        h('p', { class: 'muted' }, 'Wähle ein Lied vom Handy (MP3, M4A, OGG, WAV …). Es wird passend zur Diashow geschnitten und am Ende sanft ausgeblendet.'),
        h('button', { class: 'btn primary', onclick: chooseMusic }, icon('music', 18), 'Musik wählen')));
      return wrap;
    }
    const m = p.music;
    const dur = musicBuf.duration;
    const info = h('p', { class: 'hint' }, musicInfo());
    wrap.append(h('div', { class: 'card music-card' },
      h('div', { class: 'big-ic small' }, icon('music', 24)),
      h('div', { class: 'grow' }, h('strong', { class: 'ellipsis' }, m.name), h('span', { class: 'muted' }, 'Länge ' + fmtTime(dur))),
      h('button', { class: 'icon-btn', 'aria-label': 'Anhören', onclick: () => {
        if (playing) pause();
        player.preview(m);
      } }, icon('volume'))));
    wrap.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: chooseMusic }, icon('swap', 18), 'Ändern'),
      h('button', { class: 'btn danger', onclick: removeMusic }, icon('trash', 18), 'Entfernen')));
    wrap.append(section(null,
      slider('Lautstärke', { min: 0, max: 100, value: Math.round((m.volume ?? 1) * 100), fmt: (v) => v + ' %', onInput: (v) => {
        m.volume = v / 100;
        changed();
      } }),
      slider('Musik startet bei', { min: 0, max: Math.max(0, Math.floor(dur - 5)), step: 0.5, value: m.start || 0, fmt: fmtTime, onInput: (v) => {
        m.start = v;
        save();
      }, onChange: () => {
        player.preview(m, 6);
        changed();
      } }),
      toggle('Am Ende ausblenden', m.fadeOut !== false, (v) => {
        m.fadeOut = v;
        changed();
      })));
    wrap.append(section('Länge',
      info,
      h('button', { class: 'btn', onclick: fitToMusic }, icon('clock', 18), 'Diashow an Musiklänge anpassen')));
    return wrap;

    function musicInfo() {
      const left = dur - (m.start || 0);
      if (left < tl.total - 0.5) return `Diashow ${fmtTime(tl.total)} · Musik ${fmtTime(left)} – die Musik wird wiederholt.`;
      return `Diashow ${fmtTime(tl.total)} · Musik ${fmtTime(left)} – die Musik endet mit der Diashow.`;
    }
  }

  async function chooseMusic() {
    if (playing) pause();
    const f = await pickAudio();
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) {
      toast('Die Datei ist zu groß (max. 60 MB)');
      return;
    }
    const ov = progressOverlay('Musik wird geladen');
    ov.set(0.3);
    try {
      const buf = await decodeMusic(f);
      musicBuf = buf;
      player.setBuffer(buf);
      await putBlob(`${p.id}/music`, f);
      const name = (f.name || 'Musik').replace(/\.[a-z0-9]{2,4}$/i, '');
      p.music = { name, duration: buf.duration, volume: 1, start: 0, fadeOut: true };
      ov.done();
      changed({ panel: true });
      toast('Musik hinzugefügt');
    } catch (e) {
      ov.done();
      toast('Diese Datei kann nicht gelesen werden');
    }
  }

  async function removeMusic() {
    player.stop();
    p.music = null;
    musicBuf = null;
    player.setBuffer(null);
    deleteBlob(`${p.id}/music`).catch(() => {});
    changed({ panel: true });
  }

  function fitToMusic() {
    if (!musicBuf || !p.slides.length) return;
    const left = musicBuf.duration - (p.music.start || 0);
    const per = left / p.slides.length;
    if (per < 0.8) {
      toast('Die Musik ist zu kurz für so viele Bilder');
      return;
    }
    p.duration = Math.round(clamp(per, 0.8, 12) * 10) / 10;
    for (const s of p.slides) s.dur = null;
    changed({ strip: true, panel: true });
    toast(per > 12 ? `Jedes Bild jetzt 12 s (Maximum) – Diashow ${fmtTime(tl.total)}` : `Jedes Bild jetzt ${fmtSec(p.duration)} – passt zur Musik`);
  }

  function textPanel() {
    const wrap = h('div');
    const inp = (value, ph, set) => {
      const i = h('input', { class: 'input', type: 'text', value, placeholder: ph, maxlength: 80 });
      i.addEventListener('input', debounce(() => {
        set(i.value);
        changed();
      }, 250));
      i.addEventListener('focus', () => {
        if (playing) pause();
      });
      return i;
    };
    wrap.append(section('Titel am Anfang',
      inp(p.intro.text, 'z. B. Sommerurlaub 2026', (v) => {
        p.intro.text = v;
        seek(1.5);
      }),
      inp(p.intro.sub, 'Untertitel (optional)', (v) => {
        p.intro.sub = v;
        seek(1.5);
      })));
    wrap.append(section('Text am Ende',
      inp(p.ending.text, 'z. B. Danke fürs Zuschauen', (v) => {
        p.ending.text = v;
        seek(Math.max(0, tl.total - 1.8));
      })));
    const fontRow = h('div', { class: 'chips' });
    for (const f of FONTS) {
      const b = h('button', { class: 'chip font' + (p.font === f.id ? ' on' : ''), style: { fontFamily: f.family, fontWeight: f.weight }, onclick: () => {
        p.font = f.id;
        for (const x of fontRow.children) x.classList.remove('on');
        b.classList.add('on');
        changed();
        if (!p.intro.text) seek(tl.items[sel] ? tl.items[sel].start + 0.8 : 0);
      } }, f.upper ? f.name.toUpperCase() : f.name);
      fontRow.append(b);
    }
    wrap.append(section('Schrift', fontRow));
    wrap.append(section('Textstil',
      chips([{ id: 'shadow', name: 'Schatten' }, { id: 'box', name: 'Kasten' }, { id: 'outline', name: 'Kontur' }], p.textStyle || 'shadow', (v) => {
        p.textStyle = v;
        changed();
      })));
    const colors = h('div', { class: 'swatches' });
    for (const c of TEXT_COLORS) {
      const b = h('button', { class: 'swatch' + ((p.textColor || '#ffffff') === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => {
        p.textColor = c;
        for (const x of colors.children) x.classList.remove('on');
        b.classList.add('on');
        changed();
      } });
      colors.append(b);
    }
    wrap.append(section('Textfarbe', colors));
    wrap.append(h('p', { class: 'hint' }, 'Texte zu einzelnen Bildern gibst du im Tab „Bild“ ein.'));
    return wrap;
  }

  function formatPanel() {
    const wrap = h('div');
    const grid = h('div', { class: 'format-grid' });
    for (const [id, f] of Object.entries(FORMATS)) {
      const [a, b] = id.split(':').map(Number);
      const s = 34 / Math.max(a, b);
      grid.append(h('button', { class: 'format-card' + (p.format === id ? ' on' : ''), onclick: () => {
        p.format = id;
        changed({ panel: true, size: true });
      } },
      h('span', { class: 'ratio' }, h('i', { style: { width: a * s + 'px', height: b * s + 'px' } })),
      h('strong', null, `${f.name} ${id}`), h('span', null, f.hint)));
    }
    wrap.append(section('Seitenverhältnis', grid));
    wrap.append(section('Bilder',
      chips([{ id: 'cover', name: 'Füllen (zuschneiden)' }, { id: 'contain', name: 'Ganzes Bild zeigen' }], p.fit, (v) => {
        p.fit = v;
        changed({ panel: true });
      })));
    if (p.fit === 'contain' || p.slides.some((s) => s.fit === 'contain')) {
      wrap.append(section('Hintergrund bei ganzen Bildern',
        chips([{ id: 'blur', name: 'Unscharf' }, { id: 'black', name: 'Schwarz' }, { id: 'white', name: 'Weiß' }], p.bg || 'blur', (v) => {
          p.bg = v;
          changed();
        })));
    }
    const size = outputSize(p.format, p.quality);
    const mb = ((p.quality === '720' ? 3.5 : 6) * tl.total) / 8 * 1.05;
    wrap.append(section('Qualität',
      chips([{ id: '1080', name: 'Full HD (1080p)' }, { id: '720', name: 'HD (720p)' }], p.quality, (v) => {
        p.quality = v;
        changed({ panel: true });
      }),
      h('p', { class: 'hint' }, `${size.w} × ${size.h} Pixel · 30 Bilder/s · ca. ${fmtSize(mb * 1024 * 1024)} bei ${fmtTime(tl.total)}`)));
    return wrap;
  }

  // ---------- Umbenennen, Export ----------
  async function rename() {
    const v = await promptText('Diashow umbenennen', p.title);
    if (v) {
      p.title = v;
      titleEl.textContent = v;
      save();
    }
  }

  async function startExport() {
    if (!p.slides.length) {
      toast('Füge zuerst Bilder hinzu');
      return;
    }
    if (playing) pause();
    await saveNow();
    const ctrl = new AbortController();
    const ov = progressOverlay('Video wird erstellt', { onCancel: () => ctrl.abort() });
    ov.set(0, 'Bitte die App geöffnet lassen …');
    try {
      const res = await exportVideo(p, store, musicBuf, {
        signal: ctrl.signal,
        onProgress: (f, rest, phase) => ov.set(f, (phase || '') + (rest != null && rest > 1 ? ` · noch ca. ${fmtTime(rest)}` : '')),
      });
      ov.title('Wird gespeichert …');
      let where = null;
      let err = null;
      try {
        where = await res.output.save();
      } catch (e) {
        err = e;
      }
      ov.done();
      showResult(res, where, err);
    } catch (e) {
      ov.done();
      if (e.name === 'AbortError') toast('Export abgebrochen');
      else {
        console.error(e);
        sheet('Das hat leider nicht geklappt', h('div', { class: 'dialog' },
          h('p', null, 'Das Video konnte nicht erstellt werden.'),
          h('p', { class: 'muted small' }, String(e && e.message ? e.message : e)),
          h('p', { class: 'hint' }, 'Tipp: Unter „Format“ die Qualität auf 720p stellen und es noch einmal versuchen.')));
      }
    }
  }

  function showResult(res, where, err) {
    const out = res.output;
    const video = h('video', { src: out.url, controls: true, playsinline: true, preload: 'metadata', class: 'result-video' });
    const s = sheet('Dein Video ist fertig', h('div', { class: 'result' },
      video,
      h('p', { class: 'muted' }, `${res.width} × ${res.height} · ${fmtTime(res.duration)} · ${fmtSize(out.size || 0)}`),
      where ? h('p', { class: 'ok' }, icon('check', 18), ` Gespeichert in der Galerie: ${where}`) : null,
      err ? h('p', { class: 'warn' }, 'Speichern in der Galerie fehlgeschlagen: ' + err.message) : null,
      ...(res.warnings || []).map((w) => h('p', { class: 'warn' }, w)),
      h('div', { class: 'btn-row' },
        err ? h('button', { class: 'btn', onclick: async () => {
          try {
            const w = await out.save();
            toast('Gespeichert: ' + w);
          } catch (e) {
            toast('Speichern fehlgeschlagen');
          }
        } }, icon('download', 18), 'Speichern') : null,
        h('button', { class: 'btn primary', onclick: () => out.share() }, icon('share', 18), 'Teilen'),
        h('button', { class: 'btn', onclick: () => out.open() }, icon('open', 18), 'Öffnen'))),
    { onClose: () => video.pause() });
    return s;
  }

  // ---------- Bildschirm ----------
  const offPause = onAppPause(() => {
    if (playing) pause();
    saveNow();
  });
  const onResize = debounce(sizeCanvas, 120);
  window.addEventListener('resize', onResize);

  push({
    el,
    onBack: () => {
      if (playing) pause();
      return false;
    },
    destroy: () => {
      pause();
      save.flush();
      offLoaded();
      offPause();
      window.removeEventListener('resize', onResize);
      store.dispose();
    },
  });
  renderStrip();
  setTab('slides');
  requestAnimationFrame(() => {
    sizeCanvas();
    toStart();
    if (fresh && p.slides.length) {
      // Neue Diashow: gleich einmal abspielen
      store.getFull(p.slides[0].img).then(() => setTimeout(play, 250)).catch(() => {});
    }
  });
}

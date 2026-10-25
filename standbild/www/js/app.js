/* Standbild – Oberfläche: Video laden, Analyse zeigen, Poster-Galerie, Editor, Speichern. */
(function () {
  'use strict';
  const S = window.Standbild;
  const T = S.templates;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Plattform: Android-App (Bridge), Claude-Artifact (downloads/sample) oder normaler Browser
  const android = !!(window.Android && typeof window.Android.saveImage === 'function');
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const use = name => inClaude ? Promise.resolve().then(() => window.claude.use(name)).catch(() => null) : Promise.resolve(null);
  const downloadsP = use('downloads');
  const sampleP = use('sample');

  const state = {
    a: null, posters: [], text: { title: '', subtitle: '', line: '' }, touched: false,
    format: 'poster', filetype: 'jpg', demo: false, busy: false, ai: null,
  };
  let nextId = 1;
  S.app = state;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  const byId = id => state.posters.find(p => String(p.id) === String(id));
  const pad = n => String(n).padStart(2, '0');
  const slug = s => (String(s || 'poster').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'poster').slice(0, 40);

  let toastTimer;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), ms || 3400);
  }

  const fontsReady = (async () => {
    if (!document.fonts || !document.fonts.load) return;
    const specs = ['400 40px Anton', '400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"', '400 40px "Archivo Black"',
      '400 40px "IBM Plex Mono"', '600 40px "IBM Plex Mono"', '400 40px "IBM Plex Sans"', '600 40px "IBM Plex Sans"', '400 40px Shrikhand'];
    await Promise.race([Promise.all(specs.map(s => document.fonts.load(s).catch(() => null))), new Promise(r => setTimeout(r, 4000))]);
  })();

  // ---------- Format ----------

  function cm(px) { return (px / 300 * 2.54).toFixed(1).replace('.', ',').replace(',0', ''); }
  function buildFormats() {
    const box = $('formats');
    for (const [k, f] of Object.entries(S.formats)) {
      const lab = el('label');
      const inp = el('input');
      inp.type = 'radio'; inp.name = 'fmt'; inp.id = 'fmt-' + k; inp.value = k; inp.checked = k === state.format;
      inp.addEventListener('change', () => { state.format = k; updateFormatHint(); refreshAll(); });
      lab.append(inp, el('span', null, f.name));
      box.append(lab);
    }
    document.querySelectorAll('input[name="ft"]').forEach(inp => inp.addEventListener('change', () => { state.filetype = inp.value; }));
    updateFormatHint();
  }
  function updateFormatHint() {
    const [w, h] = S.formats[state.format].export;
    $('format-hint').textContent = `${w} × ${h} Pixel, ${cm(w)} × ${cm(h)} cm bei 300 dpi`;
  }

  // ---------- Leerer Zustand ----------

  function showGhosts() {
    const grid = $('grid');
    grid.innerHTML = '';
    const ratio = S.formats[state.format].ratio;
    for (const k of S.templateOrder) {
      const fig = el('figure', 'ghost');
      const sheet = el('div', 'ghost-sheet');
      sheet.style.aspectRatio = String(ratio);
      sheet.append(el('span', null, T[k].name));
      fig.append(sheet, el('figcaption', null, T[k].about));
      grid.append(fig);
    }
  }

  // ---------- Video laden ----------

  const PHASES = ['load', 'sample', 'refine', 'capture', 'colors'];
  const WEIGHT = { load: 0.03, sample: 0.72, refine: 0.1, capture: 0.12, colors: 0.03 };
  let live = null;

  function showProgress() {
    $('progress').hidden = false;
    document.querySelectorAll('#phases li').forEach(li => li.classList.remove('is-now', 'is-done'));
    document.querySelectorAll('#phases .count').forEach(c => { c.textContent = ''; });
    $('bar-fill').style.width = '0%';
    const cv = $('live');
    cv.width = Math.max(200, Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
    cv.height = 80;
    live = cv.getContext('2d');
    live.clearRect(0, 0, cv.width, cv.height);
  }

  function onProgress(p) {
    const idx = PHASES.indexOf(p.phase);
    document.querySelectorAll('#phases li').forEach((li, i) => {
      li.classList.toggle('is-done', i < idx);
      li.classList.toggle('is-now', i === idx);
    });
    const count = document.querySelector(`[data-count="${p.phase}"]`);
    if (count && p.total > 1) count.textContent = `${Math.min(p.done + (p.phase === 'sample' ? 0 : 1), p.total)}/${p.total}`;
    let pct = 0;
    for (let i = 0; i < idx; i++) pct += WEIGHT[PHASES[i]];
    pct += WEIGHT[p.phase] * (p.total ? p.done / p.total : 0);
    $('bar-fill').style.width = Math.round(pct * 100) + '%';
    if (p.sample && live) {
      const cv = live.canvas, n = p.total, i = p.done - 1;
      const x0 = Math.floor(i * cv.width / n), x1 = Math.floor((i + 1) * cv.width / n);
      const rows = p.sample.rows, R = rows.length / 3;
      for (let r = 0; r < R; r++) {
        live.fillStyle = `rgb(${rows[r * 3]},${rows[r * 3 + 1]},${rows[r * 3 + 2]})`;
        live.fillRect(x0, Math.floor(r * cv.height / R), x1 - x0, Math.ceil(cv.height / R));
      }
    }
  }

  function errorText(e) {
    const m = e && e.message;
    if (m === 'codec') return 'Dieses Video kann der Browser nicht öffnen. Speichere es als MP4 (H.264) und versuch es noch einmal.';
    if (m === 'duration') return 'Die Länge des Videos ließ sich nicht lesen. Versuch es mit einer MP4-Datei.';
    if (m === 'empty') return 'Im Video gab es keine brauchbaren Bilder (nur schwarz oder einfarbig?).';
    return 'Die Analyse ist fehlgeschlagen. Versuch es mit einer anderen Videodatei.';
  }

  async function start(file) {
    if (state.busy || !file) return;
    if (file.type && !file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name || '')) {
      toast('Das ist keine Videodatei. Wähle ein MP4-, MOV- oder WebM-Video.');
      return;
    }
    state.busy = true;
    document.querySelector('.panel').classList.add('is-busy');
    setButtons();
    $('report').hidden = true;
    showProgress();
    try {
      const a = await S.analyzeVideo(file, onProgress);
      await fontsReady;
      useAnalysis(a, false, null);
      toast(`${a.keyframes.length} Standbilder gefunden, ${state.posters.length} Poster gestaltet.`);
    } catch (e) {
      console.error(e);
      toast(errorText(e), 7000);
      if (state.a) $('report').hidden = false;
    } finally {
      state.busy = false;
      document.querySelector('.panel').classList.remove('is-busy');
      $('progress').hidden = true;
      setButtons();
    }
  }

  function defaultText(a) {
    const clean = S.cleanName(a.name), mood = a.mood || { title: 'Standbild', line: '' };
    return {
      title: clean || mood.title,
      subtitle: a.scenes.length > 1 ? `Ein Film in ${a.scenes.length} Szenen` : 'Ein Moment, angehalten',
      line: mood.line || '',
    };
  }
  function setText(t) {
    state.text = { title: t.title || '', subtitle: t.subtitle || '', line: t.line || '' };
    $('t-title').value = state.text.title;
    $('t-sub').value = state.text.subtitle;
    $('t-line').value = state.text.line;
  }

  function useAnalysis(a, demo, text) {
    const keepTyped = state.touched && !state.a;
    state.a = a;
    state.demo = demo;
    if (text) setText(text);
    else if (!keepTyped) setText(defaultText(a));
    state.touched = false;
    state.posters = S.suggest(a).map(p => Object.assign({ id: nextId++ }, p));
    $('ai-ideas').innerHTML = '';
    showReport();
    buildGallery();
    setButtons();
    if (state.ai) {
      $('ai').hidden = false;
      $('ai-note').textContent = 'Claude schaut sich vier Standbilder an und schlägt Titel, Untertitel und Zeile vor.';
    }
  }

  function setButtons() {
    const ready = !!state.a && !state.busy;
    $('save-all').disabled = !ready || !state.posters.length;
    $('more').disabled = !ready;
    $('save-frames').disabled = !ready;
  }

  // ---------- Analysebericht ----------

  function frameThumb(f, w) {
    const c = f.content, ar = c.w / c.h;
    const cv = S.canvas(w, w / ar);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(f.canvas, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    return cv;
  }

  function showReport() {
    const a = state.a;
    $('report').hidden = false;
    $('src-name').textContent = a.name;
    $('src-name').title = a.name;
    $('src-badge').hidden = !state.demo;
    const facts = [
      ['Länge', S.tc(a.duration)],
      ['Auflösung', `${a.width}×${a.height}`],
      ['Szenen', String(a.scenes.length)],
      ['Geprüft', `${a.checked} Bilder`],
      ['Schwarzbilder', String(a.blackCount)],
      ['Kino-Balken', a.letterbox ? 'entfernt' : 'keine'],
    ];
    const dl = $('facts');
    dl.innerHTML = '';
    for (const [k, v] of facts) {
      const d = el('div');
      d.append(el('dt', null, k), el('dd', null, v));
      dl.append(d);
    }

    // Zeitleiste: Filmbarcode, Szenenschnitte, gewählte Standbilder
    const cv = $('strip');
    cv.width = 720; cv.height = 92;
    const ctx = cv.getContext('2d');
    const n = a.samples.length, R = a.samples[0].rows.length / 3, top = 14, h = cv.height - top;
    a.samples.forEach((s, i) => {
      const x0 = Math.floor(i * cv.width / n), x1 = Math.floor((i + 1) * cv.width / n);
      for (let r = 0; r < R; r++) {
        ctx.fillStyle = `rgb(${s.rows[r * 3]},${s.rows[r * 3 + 1]},${s.rows[r * 3 + 2]})`;
        ctx.fillRect(x0, top + Math.floor(r * h / R), x1 - x0, Math.ceil(h / R));
      }
    });
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c70063';
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#666';
    ctx.fillStyle = ink;
    for (const sc of a.scenes) ctx.fillRect(Math.round(sc.start / a.duration * cv.width), 0, 2, 7);
    ctx.fillStyle = accent;
    for (const f of a.keyframes) {
      const x = f.t / a.duration * cv.width;
      ctx.beginPath(); ctx.moveTo(x - 6, 2); ctx.lineTo(x + 6, 2); ctx.lineTo(x, 12); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 1, top, 2, h);
    }
    const axis = $('strip-axis');
    axis.innerHTML = '';
    for (let k = 0; k <= 4; k++) axis.append(el('span', null, S.tc(a.duration * k / 4)));

    const keys = $('keys');
    keys.innerHTML = '';
    a.keyframes.forEach((f, i) => {
      const box = el('div', 'key');
      const label = el('span');
      label.append(el('b', null, `#${i + 1}`), document.createTextNode(` ${S.tc(f.t)}`));
      box.append(frameThumb(f, 192), label);
      box.title = `Standbild ${i + 1} bei ${S.tc(f.t, true)}`;
      keys.append(box);
    });
    $('save-frames').textContent = android ? 'Standbilder ohne Gestaltung in der Galerie speichern' : 'Standbilder ohne Gestaltung speichern (ZIP)';
  }

  // ---------- Galerie ----------

  const ICON_DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function cardLabel(p) {
    const a = state.a, t = T[p.tpl];
    if (t.frames === 'all') return `${a.timeline.length} Bilder`;
    if (t.frames === 0) return `${a.samples.length} Streifen, ganzes Video`;
    const f = a.keyframes[p.frame] || a.keyframes[0];
    return t.frames === 3 ? `3 Bilder ab ${S.tc(f.t)}` : `Standbild ${S.tc(f.t)}`;
  }

  function makeCard(p) {
    const fig = el('figure', 'card');
    fig.dataset.id = p.id;
    const open = el('button', 'card-open');
    open.type = 'button';
    const cv = el('canvas');
    const ratio = S.formats[state.format].ratio;
    cv.width = 200; cv.height = Math.round(200 / ratio);
    open.append(cv);
    open.addEventListener('click', () => openEditor(p.id));
    const cap = el('figcaption');
    const name = el('div', 'card-name');
    name.append(el('b'), el('span'));
    const dl = el('button', 'icon-btn');
    dl.type = 'button';
    dl.innerHTML = ICON_DL;
    dl.addEventListener('click', () => downloadOne(p.id));
    cap.append(name, dl);
    fig.append(open, cap);
    labelCard(fig, p);
    return fig;
  }
  function labelCard(fig, p) {
    const n = T[p.tpl].name;
    fig.querySelector('.card-name b').textContent = n;
    fig.querySelector('.card-name span').textContent = cardLabel(p);
    fig.querySelector('.card-open').setAttribute('aria-label', `Poster „${n}“ bearbeiten`);
    fig.querySelector('.icon-btn').setAttribute('aria-label', `Poster „${n}“ ${android ? 'in der Galerie speichern' : 'herunterladen'}`);
  }

  function buildGallery() {
    const grid = $('grid');
    grid.innerHTML = '';
    for (const p of state.posters) grid.append(makeCard(p));
    updateGalleryHead();
    refreshAll();
  }
  function updateGalleryHead() {
    $('gallery-title').textContent = `${state.posters.length} Posterideen`;
    $('gallery-sub').textContent = state.demo
      ? 'Beispiel aus deinem TikTok-Testvideo. Lade oben ein eigenes Video hoch, dann entstehen deine Poster.'
      : 'Tippe ein Poster an, um Stil, Standbild, Ausschnitt, Farbe und Texte zu ändern.';
  }

  let renderGen = 0;
  async function refreshAll() {
    if (!state.a) { showGhosts(); return; }
    const gen = ++renderGen;
    await fontsReady;
    for (const fig of Array.from($('grid').querySelectorAll('.card'))) {
      if (gen !== renderGen) return;
      renderCard(fig);
      await tick();
    }
  }
  function renderCard(fig) {
    const p = byId(fig.dataset.id);
    if (!p) return;
    const cv = fig.querySelector('canvas');
    const ratio = S.formats[state.format].ratio;
    const cssW = fig.clientWidth || 220;
    const W = Math.round(Math.min(900, cssW * Math.min(2, window.devicePixelRatio || 1)));
    const H = Math.round(W / ratio);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    S.render(cv, state.a, p, state.text, state.format);
  }
  function renderOne(id) {
    const fig = document.querySelector(`.card[data-id="${id}"]`);
    if (fig) { labelCard(fig, byId(id)); renderCard(fig); }
  }

  let textTimer;
  function scheduleRefresh() {
    clearTimeout(textTimer);
    textTimer = setTimeout(refreshAll, 220);
  }

  function moreIdeas() {
    const a = state.a;
    if (!a) return;
    const have = new Set(state.posters.map(p => p.tpl + ':' + p.frame));
    const tpls = S.templateOrder.filter(k => T[k].frames !== 0 && T[k].frames !== 'all');
    const rand = S.rng(state.posters.length * 31 + 7);
    const fresh = [];
    for (let guard = 0; fresh.length < 6 && guard < 400; guard++) {
      const tpl = tpls[Math.floor(rand() * tpls.length)], frame = Math.floor(rand() * a.keyframes.length);
      if (have.has(tpl + ':' + frame)) continue;
      have.add(tpl + ':' + frame);
      fresh.push({ id: nextId++, tpl, frame, zoom: rand() < 0.35 ? 1.35 : 1 });
    }
    if (!fresh.length) { toast('Alle Kombinationen aus Stil und Standbild sind schon da.'); return; }
    state.posters.push(...fresh);
    const grid = $('grid');
    const figs = fresh.map(makeCard);
    figs.forEach(f => grid.append(f));
    updateGalleryHead();
    setButtons();
    (async () => { await fontsReady; for (const f of figs) { renderCard(f); await tick(); } })();
    figs[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(`${fresh.length} neue Ideen unten angefügt.`);
  }

  // ---------- Exportieren & Speichern ----------

  async function exportPoster(p) {
    await fontsReady;
    const [w, h] = S.formats[state.format].export;
    const cv = S.canvas(w, h);
    S.render(cv, state.a, p, state.text, state.format);
    const type = state.filetype === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), type, 0.93));
    cv.width = cv.height = 1;
    return blob;
  }
  function posterName(p, i) {
    const title = p.title ?? state.text.title;
    return `standbild-${slug(title)}-${pad(i + 1)}-${p.tpl}.${state.filetype === 'png' ? 'png' : 'jpg'}`;
  }

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function save(blob, name) {
    if (android) {
      const r = window.Android.saveImage(await blobToBase64(blob), name, blob.type || 'image/jpeg');
      if (r !== 'ok') throw new Error(r || 'save');
      return;
    }
    if (inClaude) {
      const dl = await downloadsP;
      if (!dl) throw { code: 'unavailable' };
      await dl.save({ filename: name, data: blob });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url; link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function saveError(e) {
    const c = e && e.code;
    if (c === 'declined') return 'Download abgebrochen.';
    if (c === 'rate_limited') return 'Es ist noch ein Download offen. Bestätige ihn oder warte kurz.';
    if (c === 'too_large') return 'Die Datei ist zu groß. Lade die Poster einzeln herunter.';
    if (c === 'unavailable' || c === 'not_granted' || c === 'capability_disabled') return 'Herunterladen ist in dieser Ansicht nicht möglich.';
    if (e && e.message === 'permission') return 'Ohne Speicher-Berechtigung kann die App nichts in der Galerie ablegen.';
    return 'Speichern hat nicht geklappt. Versuch es noch einmal.';
  }

  async function downloadOne(id) {
    const p = byId(id);
    if (!p || state.busy) return;
    const i = state.posters.indexOf(p);
    toast('Poster wird in voller Größe gerendert …', 20000);
    try {
      const blob = await exportPoster(p);
      await save(blob, posterName(p, i));
      toast(android ? 'In der Galerie gespeichert (Bilder › Standbild).' : `Gespeichert: ${posterName(p, i)}`);
    } catch (e) {
      console.error(e);
      toast(saveError(e), 5000);
    }
  }

  async function saveMany(items, zipName, what) {
    state.busy = true;
    setButtons();
    try {
      if (android) {
        for (let i = 0; i < items.length; i++) {
          toast(`${what} ${i + 1} von ${items.length} wird gespeichert …`, 60000);
          const { name, blob } = await items[i]();
          await save(blob, name);
        }
        toast(`${items.length} ${what === 'Poster' ? 'Poster' : 'Standbilder'} in der Galerie gespeichert (Bilder › Standbild).`, 5000);
      } else {
        const files = [];
        for (let i = 0; i < items.length; i++) {
          toast(`${what} ${i + 1} von ${items.length} wird gerendert …`, 60000);
          const { name, blob } = await items[i]();
          files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
          await tick();
        }
        toast('ZIP wird gepackt …', 60000);
        await save(S.zip(files), zipName);
        toast(`ZIP mit ${files.length} Dateien gespeichert.`, 5000);
      }
    } catch (e) {
      console.error(e);
      toast(saveError(e), 5000);
    } finally {
      state.busy = false;
      setButtons();
    }
  }

  function saveAll() {
    if (!state.a || state.busy) return;
    const items = state.posters.map((p, i) => async () => ({ name: posterName(p, i), blob: await exportPoster(p) }));
    saveMany(items, `standbild-${slug(state.text.title)}-poster.zip`, 'Poster');
  }

  function saveFrames() {
    if (!state.a || state.busy) return;
    const items = state.a.keyframes.map((f, i) => async () => {
      const c = f.content, cv = S.canvas(c.w, c.h);
      cv.getContext('2d').drawImage(f.canvas, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.95));
      return { name: `standbild-${pad(i + 1)}-${S.tc(f.t, true).replace(/[:.]/g, '-')}.jpg`, blob };
    });
    saveMany(items, `standbild-${slug(state.text.title)}-standbilder.zip`, 'Standbild');
  }

  // ---------- Editor ----------

  let edId = null, drag = null, edQueued = false;

  function openEditor(id) {
    const p = byId(id);
    if (!p) return;
    edId = id;
    buildEditor(p);
    const dlg = $('editor');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    requestAnimationFrame(renderEditor);
  }
  function closeEditor() {
    const dlg = $('editor');
    if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); onEditorClosed(); }
  }
  function onEditorClosed() {
    if (edId != null) renderOne(edId);
    edId = null;
  }

  function chip(label, pressed, onClick, cls) {
    const b = el('button', cls || 'chip', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  function buildEditor(p) {
    const a = state.a, t = T[p.tpl];
    $('ed-title').textContent = `${t.name}-Poster`;
    const tpls = $('ed-tpls');
    tpls.innerHTML = '';
    for (const k of S.templateOrder) {
      tpls.append(chip(T[k].name, k === p.tpl, () => { p.tpl = k; p.focus = null; edChanged(true); }));
    }
    const frames = $('ed-frames');
    frames.innerHTML = '';
    if (t.frames === 0) {
      frames.append(el('p', 'hint', 'Dieser Stil nutzt das ganze Video, nicht ein einzelnes Standbild.'));
    } else {
      a.keyframes.forEach((f, i) => {
        const b = el('button', 'thumb');
        b.type = 'button';
        b.setAttribute('aria-pressed', i === p.frame ? 'true' : 'false');
        b.setAttribute('aria-label', `Standbild ${i + 1} bei ${S.tc(f.t)}`);
        b.append(frameThumb(f, 160), el('span', null, S.tc(f.t)));
        b.addEventListener('click', () => { p.frame = i; p.focus = null; p.accent = null; edChanged(true); });
        frames.append(b);
      });
    }
    $('ed-zoom').value = p.zoom || 1;
    $('ed-zoom').disabled = t.frames === 0;
    const colors = $('ed-colors');
    colors.innerHTML = '';
    colors.append(chip('Auto', !p.accent, () => { p.accent = null; edChanged(true); }, 'swatch swatch-auto'));
    const f = a.keyframes[p.frame] || a.keyframes[0];
    const seen = [];
    for (const c of f.palette.concat(a.palette)) {
      if (seen.some(s => Math.hypot(s[0] - c.rgb[0], s[1] - c.rgb[1], s[2] - c.rgb[2]) < 30) || seen.length >= 10) continue;
      seen.push(c.rgb);
      const b = chip('', p.accent && p.accent.join() === c.rgb.join(), () => { p.accent = c.rgb.slice(); edChanged(true); }, 'swatch');
      b.style.background = S.color.css(c.rgb);
      b.setAttribute('aria-label', `${S.colorName(c.rgb)} ${S.color.hex(c.rgb)}`);
      b.title = `${S.colorName(c.rgb)} ${S.color.hex(c.rgb)}`;
      colors.append(b);
    }
    for (const [id, key, glob] of [['ed-t-title', 'title', 'title'], ['ed-t-sub', 'subtitle', 'subtitle'], ['ed-t-line', 'line', 'line']]) {
      const inp = $(id);
      inp.value = p[key] ?? '';
      inp.placeholder = state.text[glob] || '';
    }
    $('ed-save').textContent = android ? 'In der Galerie speichern' : 'Herunterladen';
  }

  function edChanged(rebuild) {
    const p = byId(edId);
    if (!p) return;
    if (rebuild) buildEditor(p);
    queueEditorRender();
  }
  function queueEditorRender() {
    if (edQueued) return;
    edQueued = true;
    requestAnimationFrame(() => { edQueued = false; renderEditor(); });
  }

  let lastMain = null;
  function renderEditor() {
    const p = byId(edId);
    if (!p) return;
    const cv = $('ed-canvas'), stage = $('ed-stage');
    const ratio = S.formats[state.format].ratio;
    const narrow = window.matchMedia('(max-width: 820px)').matches;
    const availW = Math.max(160, stage.clientWidth - (narrow ? 28 : 48));
    const availH = narrow ? window.innerHeight * 0.58 : Math.max(200, stage.clientHeight - 80);
    let w = availW, h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    cv.style.width = Math.round(w) + 'px';
    cv.style.height = Math.round(h) + 'px';
    const W = Math.round(Math.min(1600, w * Math.min(2, window.devicePixelRatio || 1)));
    const H = Math.round(W / ratio);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const d = S.render(cv, state.a, p, state.text, state.format);
    lastMain = d.main;
  }

  function setupEditor() {
    const dlg = $('editor');
    dlg.addEventListener('close', onEditorClosed);
    dlg.addEventListener('click', e => { if (e.target === dlg) closeEditor(); });
    $('ed-close').addEventListener('click', closeEditor);
    $('ed-zoom').addEventListener('input', e => {
      const p = byId(edId);
      if (!p) return;
      p.zoom = parseFloat(e.target.value) || 1;
      queueEditorRender();
    });
    $('ed-reset').addEventListener('click', () => {
      const p = byId(edId);
      if (!p) return;
      p.focus = null; p.zoom = 1;
      $('ed-zoom').value = 1;
      queueEditorRender();
    });
    for (const [id, key] of [['ed-t-title', 'title'], ['ed-t-sub', 'subtitle'], ['ed-t-line', 'line']]) {
      $(id).addEventListener('input', e => {
        const p = byId(edId);
        if (!p) return;
        p[key] = e.target.value.trim() ? e.target.value : null;
        queueEditorRender();
      });
    }
    $('ed-save').addEventListener('click', () => { if (edId != null) downloadOne(edId); });
    $('ed-dup').addEventListener('click', () => {
      const p = byId(edId);
      if (!p) return;
      const copy = Object.assign({}, p, { id: nextId++, focus: p.focus && Object.assign({}, p.focus) });
      state.posters.splice(state.posters.indexOf(p) + 1, 0, copy);
      const fig = makeCard(copy);
      document.querySelector(`.card[data-id="${p.id}"]`).after(fig);
      renderOne(p.id);
      edId = copy.id;
      buildEditor(copy);
      queueEditorRender();
      updateGalleryHead();
      toast('Kopie angelegt, du bearbeitest jetzt die Kopie.');
    });
    $('ed-del').addEventListener('click', () => {
      const p = byId(edId);
      if (!p) return;
      state.posters.splice(state.posters.indexOf(p), 1);
      const fig = document.querySelector(`.card[data-id="${p.id}"]`);
      if (fig) fig.remove();
      edId = null;
      closeEditor();
      updateGalleryHead();
      setButtons();
      toast('Poster entfernt.');
    });

    // Ausschnitt mit Maus oder Finger verschieben
    const cv = $('ed-canvas');
    cv.addEventListener('pointerdown', e => {
      const p = byId(edId);
      if (!p || T[p.tpl].frames === 0) return;
      const frame = state.a.keyframes[p.frame] || state.a.keyframes[0];
      const main = lastMain || { aspect: S.formats[state.format].ratio, share: 1 };
      const box = S.cropBox(frame, main.aspect, p.zoom || 1, p.focus);
      const shown = cv.clientWidth * main.share;
      drag = {
        x: e.clientX, y: e.clientY, frame, aspect: main.aspect,
        fx: (box.x + box.w / 2) / frame.canvas.width, fy: (box.y + box.h / 2) / frame.canvas.height,
        kx: box.w / frame.canvas.width / shown, ky: box.h / frame.canvas.height / (shown / main.aspect),
      };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('is-dragging');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = byId(edId);
      if (!p) return;
      p.focus = { x: clamp(drag.fx - (e.clientX - drag.x) * drag.kx, 0, 1), y: clamp(drag.fy - (e.clientY - drag.y) * drag.ky, 0, 1) };
      queueEditorRender();
    });
    const end = () => {
      if (!drag) return;
      const p = byId(edId);
      if (p && p.focus) {
        // Fokus auf den tatsächlich möglichen Ausschnitt zurückholen, damit es beim nächsten Ziehen nicht hakt
        const box = S.cropBox(drag.frame, drag.aspect, p.zoom || 1, p.focus);
        p.focus = { x: (box.x + box.w / 2) / drag.frame.canvas.width, y: (box.y + box.h / 2) / drag.frame.canvas.height };
      }
      drag = null;
      cv.classList.remove('is-dragging');
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  // ---------- Texte von Claude ----------

  async function setupAI() {
    const sample = await sampleP;
    if (!sample || typeof sample.json !== 'function') return;
    let lim = null;
    try { lim = await sample.limits(); } catch (e) { lim = null; }
    if (!lim || !lim.images) return;
    state.ai = { sample, max: Math.max(1, Math.min(4, lim.images.maxCount || 4)) };
    if (state.a) $('ai').hidden = false;
  }

  function frameJpeg(f, max) {
    const c = f.content, k = Math.min(1, max / Math.max(c.w, c.h));
    const cv = S.canvas(c.w * k, c.h * k);
    cv.getContext('2d').drawImage(f.canvas, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.85));
  }

  async function askClaude() {
    if (!state.ai || !state.a) return;
    const btn = $('ai-go'), note = $('ai-note'), a = state.a;
    btn.disabled = true;
    note.textContent = 'Claude schaut sich die Standbilder an …';
    try {
      const frames = a.keyframes.slice(0, state.ai.max);
      const images = await Promise.all(frames.map(f => frameJpeg(f, 768)));
      const prompt = [
        `Du bekommst ${frames.length} Standbilder aus einem Video (Datei: "${a.name}", Länge ${S.tc(a.duration)}, ${a.scenes.length} Szenen).`,
        'Daraus werden Poster gestaltet: Filmplakat, Magazin-Cover, Kunstdruck und ähnliche Stile.',
        'Schlage 4 unterschiedliche Text-Sets für diese Poster vor. Jedes Set hat:',
        '- "titel": 1 bis 3 Wörter, prägnant wie ein Filmtitel. Steht im Bild gut lesbarer Text (Name, Ort, Marke, Modell), darfst du ihn nutzen.',
        '- "untertitel": höchstens 6 Wörter, sagt sachlich, was zu sehen ist.',
        '- "zeile": ein kurzer, stimmungsvoller Satz (Tagline), höchstens 9 Wörter.',
        'Schreib auf Deutsch; Eigennamen und feste englische Begriffe dürfen bleiben. Keine Anführungszeichen, keine Emojis, keine Hashtags.',
        'Antworte nur mit JSON in genau dieser Form: {"ideen":[{"titel":"...","untertitel":"...","zeile":"..."}]}',
      ].join('\n');
      const res = await state.ai.sample.json(prompt, { images, modelTier: 'default' });
      const ideas = ((res && res.ideen) || []).filter(i => i && typeof i.titel === 'string' && i.titel.trim()).slice(0, 4)
        .map(i => ({ title: i.titel.trim(), subtitle: String(i.untertitel || '').trim(), line: String(i.zeile || '').trim() }));
      if (!ideas.length) throw { code: 'empty' };
      showIdeas(ideas);
      applyIdea(ideas[0], 0);
      note.textContent = 'Der erste Vorschlag ist übernommen. Tippe einen anderen an, um zu wechseln.';
    } catch (e) {
      console.error(e);
      if (e && e.code === 'not_granted') {
        note.textContent = 'Claude darf auf dieser Seite nicht genutzt werden. Trag die Texte einfach selbst ein.';
        btn.hidden = true;
      } else if (e && e.code === 'rate_limited') {
        note.textContent = 'Gerade zu viele Anfragen. Versuch es in einer Minute noch einmal.';
      } else {
        note.textContent = 'Claude konnte gerade keine Vorschläge machen. Versuch es noch einmal oder trag die Texte selbst ein.';
      }
    } finally {
      btn.disabled = false;
    }
  }
  function showIdeas(ideas) {
    const box = $('ai-ideas');
    box.innerHTML = '';
    ideas.forEach((idea, i) => {
      const b = el('button', 'idea');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.append(el('b', null, idea.title), el('span', null, [idea.subtitle, idea.line].filter(Boolean).join(' · ')));
      b.addEventListener('click', () => applyIdea(idea, i));
      box.append(b);
    });
  }
  function applyIdea(idea, i) {
    setText(idea);
    state.touched = true;
    $('ai-ideas').querySelectorAll('.idea').forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    refreshAll();
  }

  // ---------- Beispiel (nur wenn eingebettet) ----------

  async function loadDemo(data) {
    const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const dec = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const a = Object.assign({}, data.meta);
    a.samples = data.samples.map(s => Object.assign({}, s, { rows: dec(s.rows) }));
    a.frames = await Promise.all(data.frames.map(async f => {
      const im = await img(f.src);
      const cv = S.canvas(im.naturalWidth, im.naturalHeight);
      cv.getContext('2d').drawImage(im, 0, 0);
      return S.prepareFrame(cv, { t: f.t, key: f.key, score: f.score, sample: f.sample, scene: f.scene });
    }));
    S.finishAnalysis(a);
    await fontsReady;
    if (!state.a) useAnalysis(a, true, data.text);
  }

  // ---------- Android: geteilte Videos ----------

  S.openShared = async function () {
    if (!android || typeof window.Android.sharedVideo !== 'function') return;
    const info = window.Android.sharedVideo();
    if (!info) return;
    try {
      const { url, name, type } = JSON.parse(info);
      toast('Geteiltes Video wird geladen …', 15000);
      const blob = await fetch(url).then(r => { if (!r.ok) throw new Error('fetch'); return r.blob(); });
      start(new File([blob], name || 'Video.mp4', { type: type || blob.type || 'video/mp4' }));
    } catch (e) {
      console.error(e);
      toast('Das geteilte Video ließ sich nicht öffnen.', 5000);
    }
  };

  // Android-Zurücktaste: erst den Editor schließen, dann die App
  S.back = function () {
    if ($('editor').open) { closeEditor(); return true; }
    return false;
  };

  // ---------- Start ----------

  function init() {
    buildFormats();
    setupEditor();
    $('save-all').textContent = android ? 'Alle in der Galerie speichern' : 'Alle als ZIP herunterladen';
    $('file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) start(f);
    });
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, () => drop.classList.add('is-over')));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) start(f);
    });
    for (const [id, key] of [['t-title', 'title'], ['t-sub', 'subtitle'], ['t-line', 'line']]) {
      $(id).addEventListener('input', e => {
        state.text[key] = e.target.value;
        state.touched = true;
        $('ai-ideas').querySelectorAll('.idea').forEach(b => b.setAttribute('aria-pressed', 'false'));
        scheduleRefresh();
      });
    }
    $('save-all').addEventListener('click', saveAll);
    $('more').addEventListener('click', moreIdeas);
    $('save-frames').addEventListener('click', saveFrames);
    $('ai-go').addEventListener('click', askClaude);
    let lastW = window.innerWidth, resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if ($('editor').open) renderEditor();
        if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; refreshAll(); }
      }, 250);
    });
    showGhosts();
    setButtons();
    setupAI();
    if (window.STANDBILD_DEMO) loadDemo(window.STANDBILD_DEMO).catch(e => console.error(e));
    if (android) S.openShared();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

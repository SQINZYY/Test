/* Klangwelt – Oberfläche. Läuft unverändert in der Windows-App (Electron), der Android-App und im Browser. */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const Lib = Library.create();
  // Optional: Spotify-Konto verknüpfen – Bibliothek von Spotify und Suche im ganzen Katalog (eigene Entwickler-App nötig)
  const SP_SCOPES = ['user-read-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-library-modify', 'user-follow-read'];
  const sp = Spotify.create({ platform: Platform, prefix: 'kw', scopes: SP_SCOPES });
  const ROW_CHUNK = 120;

  const S = {
    ready: false,
    mixes: null,       // Daily Mixe (pro Tag und Lieblingssong-Stand zwischengespeichert)
    mixesKey: '',
    radio: null,       // zuletzt gestartetes Radio { name, tracks }
    lastQuery: '',
    panel: local('kw.panel') !== '0',
  };

  // ---------- Hilfen ----------

  function local(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { /* privater Modus */ }
    return null;
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('de-DE');
  const plural = (n, one, many) => num(n) + ' ' + (n === 1 ? one : many);
  const T = i => Catalog.track(i);

  function dur(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function longDur(sec) {
    const m = Math.round((sec || 0) / 60);
    if (m < 60) return m + ' Min.';
    return Math.floor(m / 60) + ' Std. ' + (m % 60) + ' Min.';
  }

  function ago(t) {
    if (!t) return '';
    const days = Math.floor((Date.now() - t) / 864e5);
    if (days < 1) return 'Heute';
    if (days < 2) return 'Gestern';
    if (days < 7) return 'Vor ' + days + ' Tagen';
    if (days < 28) { const w = Math.floor(days / 7); return 'Vor ' + w + (w === 1 ? ' Woche' : ' Wochen'); }
    return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function hashColor(str, l) {
    return 'hsl(' + (Catalog.hash(String(str)) % 360) + ', 45%, ' + (l || 30) + '%)';
  }

  const ICONS = {
    home: '<path d="M12 3.2 3 10.6V21h6.6v-6.2h4.8V21H21V10.6z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15.6 15.6 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    library: '<path d="M4 3h2.3v18H4zM9.6 3h2.3v18H9.6z"/><path d="m14.5 4.3 2.2-.8 5.2 16.9-2.2.8z"/>',
    play: '<path d="M7.2 4.3v15.4c0 .5.5.8.9.5l12.4-7.7c.4-.2.4-.8 0-1L8.1 3.8c-.4-.3-.9 0-.9.5z"/>',
    pause: '<rect x="5.6" y="4" width="4.4" height="16" rx="1"/><rect x="14" y="4" width="4.4" height="16" rx="1"/>',
    next: '<path d="M5 5.3v13.4c0 .5.5.8.9.5L15.6 13v5.5h2.6v-13h-2.6V11L5.9 4.8c-.4-.3-.9 0-.9.5z"/>',
    prev: '<path d="M19 5.3v13.4c0 .5-.5.8-.9.5L8.4 13v5.5H5.8v-13h2.6V11l9.7-6.2c.4-.3.9 0 .9.5z"/>',
    shuffle: '<path d="M3 7h3.2c2 0 3.3.9 4.4 2.6l2.6 4.8c1.1 1.7 2.4 2.6 4.4 2.6H21M3 17h3.2c1.4 0 2.4-.5 3.2-1.3M13.6 8.3C14.4 7.5 15.4 7 16.8 7H21M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    repeat: '<path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19M16 3l3 3-3 3M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    repeatOne: '<path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19M16 3l3 3-3 3M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 10.2 12.6 9v5.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    heart: '<path d="M12 20.2 4.7 13a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l.5.5.5-.5a4.8 4.8 0 0 1 6.8 6.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
    heartFill: '<path d="M12 20.2 4.7 13a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l.5.5.5-.5a4.8 4.8 0 0 1 6.8 6.8z"/>',
    clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    more: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>',
    back: '<path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    fwd: '<path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    settings: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="15.5" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="8.5" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/>',
    note: '<path d="M9 18.3V6.3l11-2.3v12.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18.3" r="2.6"/><circle cx="17.5" cy="16.2" r="2.6"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    plusCircle: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    check: '<circle cx="12" cy="12" r="9.5"/><path d="m7.8 12.3 2.8 2.8 5.6-5.8" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    queue: '<path d="M4 6h12M4 11h12M4 16h7M17.5 13v7M14 16.5h7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    radio: '<circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    album: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4"/>',
    artist: '<circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20.5c.8-3.8 3.8-5.8 7.5-5.8s6.7 2 7.5 5.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14.5 4v16" stroke="currentColor" stroke-width="1.8"/><circle cx="17.8" cy="9" r="1.2"/>',
    moon: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.5 6.5 0 0 0 10.1 10.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    up: '<path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    downSmall: '<path d="m6 10 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  };

  const ic = (name, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + ICONS[name] + '</svg>';
  const LOGO = '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#1ed760"/><g fill="#121212"><rect x="9" y="20" width="4" height="8" rx="2"/><rect x="15.5" y="15" width="4" height="18" rx="2"/><rect x="22" y="11" width="4" height="26" rx="2"/><rect x="28.5" y="15" width="4" height="18" rx="2"/><rect x="35" y="20" width="4" height="8" rx="2"/></g></svg>';
  const EQ = '<span class="eqz" aria-hidden="true"><i></i><i></i><i></i></span>';

  // ---------- Cover ----------

  function albumKey(al) { return Catalog.albumName(al) + '\u0001' + Catalog.artistName(Catalog.albumArtist(al)); }

  /** Cover eines Albums: erzeugtes Farbcover, das echte Cover lädt nach (siehe covers.js). */
  function albumCover(al, cls) {
    const key = albumKey(al);
    const g = Covers.generated(Catalog.albumName(al), key);
    const top = Catalog.albumTracks(al)[0];
    const cached = Covers.cached(key);
    return '<div class="cv ' + (cls || '') + (cached ? ' has-img' : '') + '" style="' + g.style + '" data-shape="' + g.shape + '"' +
      (cached ? '' : ' data-cover="' + esc(key) + '" data-track="' + (top != null ? T(top).id : '') + '"') + '><span>' + esc(g.letters) + '</span>' +
      (cached ? '<img src="' + esc(cached) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>';
  }

  /** Cover mit Bild-Adresse (Spotify-Suche); ohne Bild das erzeugte Farbcover. */
  function extCover(img, title, cls, round) {
    const g = Covers.generated(title, 'x' + title);
    return '<div class="cv ' + (round ? 'round ' : '') + (cls || '') + (img ? ' has-img' : '') + '" style="' + g.style + '" data-shape="' + g.shape + '"><span>' + esc(g.letters) + '</span>' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>';
  }

  const trackCover = (t, cls) => (t.external ? extCover(t.album.img, t.album.name || t.name, cls) : albumCover(t.album.i, cls));
  const coverKey = t => (t.external ? 'x' + (t.album.sid || t.id) : 'a' + t.album.i);
  const trackColor = (t, l) => hashColor(t.external ? coverKey(t) : albumKey(t.album.i), l);

  /** Spotify-Songs außerhalb des Datensatzes in der Bibliothek merken, bevor sie gespeichert werden. */
  function keep(i) {
    const m = Catalog.externalMeta(i);
    if (m) Lib.rememberTrack(m);
  }

  /** Spotify-API-Song (aus spotify.js) als Klangwelt-Index. */
  function fromSpotify(t, albumImg) {
    return Catalog.addExternal({
      id: t.id, name: t.name, sec: Math.round((t.ms || 0) / 1000), explicit: !!t.explicit,
      artists: t.artists.map(a => ({ name: a.name, sid: a.id })),
      album: { name: t.album ? t.album.name : '', sid: t.album ? t.album.id : null, img: (t.album && (t.album.imgL || t.album.img)) || albumImg || '' },
    });
  }

  function artistCover(a, cls) {
    const g = Covers.generated(Catalog.artistName(a), 'artist' + Catalog.artistName(a));
    return '<div class="cv round ' + (cls || '') + '" style="' + g.style + '" data-shape="' + g.shape + '"><span>' + esc(g.letters) + '</span></div>';
  }

  /** Cover für Mixe und Charts: Farbe + großer Titel, wie bei Musik-Apps üblich. */
  function mixCover(title, color, cls, sub) {
    return '<div class="cv mixcv ' + (cls || '') + '" style="--mc:' + color + '"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  function playlistCover(p, cls) {
    const ids = p.tracks.map(x => Catalog.indexOf(x.id)).filter(i => i >= 0);
    const seen = new Set(), firsts = [];
    for (const i of ids) {
      const t = T(i);
      if (seen.has(coverKey(t))) continue;
      seen.add(coverKey(t));
      firsts.push(t);
      if (firsts.length === 4) break;
    }
    if (firsts.length >= 4) return '<div class="cv mosaic ' + (cls || '') + '">' + firsts.map(t => trackCover(t)).join('') + '</div>';
    if (firsts.length) return trackCover(firsts[0], cls);
    return '<div class="cv ph ' + (cls || '') + '">' + ic('note') + '</div>';
  }

  const likedCover = cls => '<div class="cv liked-img ' + (cls || '') + '">' + ic('heartFill') + '</div>';

  function artistLinks(t) {
    return t.artists.map(a => (a.href ? '<a href="' + esc(a.href) + '">' + esc(a.name) + '</a>' : '<span>' + esc(a.name) + '</span>')).join(', ');
  }
  const artistNames = t => t.artists.map(a => a.name).join(', ');

  // ---------- Ebenen: Popups, Dialoge, Vollbild-Player (für "Zurück" auf Android) ----------

  const layers = [];
  function pushLayer(close) {
    const layer = { close };
    layers.push(layer);
    return () => { const k = layers.indexOf(layer); if (k >= 0) layers.splice(k, 1); };
  }
  function closeTopLayer() {
    const top = layers[layers.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }

  function toast(msg, ms) {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms || 2800);
  }

  function modal(o) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h2>' + esc(o.title) + '</h2><div class="modal-body">' + (o.html || '') + '</div><div class="modal-actions"></div></div>';
    const actions = $('.modal-actions', wrap);
    let closed = false;
    const remove = pushLayer(() => close(null));
    function close(value) {
      if (closed) return;
      closed = true;
      remove();
      wrap.remove();
      if (o.onClose) o.onClose(value);
    }
    for (const a of o.actions || [{ label: 'OK', primary: true }]) {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost');
      b.textContent = a.label;
      b.onclick = () => { const r = a.onClick ? a.onClick(wrap) : undefined; if (r !== false) close(a.value === undefined ? true : a.value); };
      actions.appendChild(b);
    }
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });
    document.body.appendChild(wrap);
    const first = $('input, textarea', wrap);
    if (first && !coarse) setTimeout(() => first.focus(), 30);
    return { el: wrap, close };
  }

  function prompt(title, value, label, onOk) {
    modal({
      title,
      html: '<label class="field"><span>' + esc(label) + '</span><input id="prompt-in" value="' + esc(value || '') + '" maxlength="100" autocomplete="off"></label>',
      actions: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', primary: true, onClick: w => { onOk($('#prompt-in', w).value); } }],
    });
    const input = $('#prompt-in');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.closest('.modal').querySelector('.btn-primary').click(); });
  }

  let openPopup = null;
  function popup(anchor, html, onPick) {
    if (openPopup) openPopup.close();
    const el = document.createElement('div');
    el.className = 'popup';
    const shade = document.createElement('div');
    shade.className = 'popup-shade';
    document.body.append(shade, el);
    let removeLayer = null;
    const api = {
      el,
      set(h) { el.innerHTML = h; place(); },
      close() {
        el.remove(); shade.remove();
        document.removeEventListener('pointerdown', outside, true);
        if (removeLayer) removeLayer();
        if (openPopup === api) openPopup = null;
      },
    };
    function place() {
      if (matchMedia('(max-width: 860px)').matches) return;
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
    function outside(e) { if (!el.contains(e.target) && !anchor.contains(e.target)) api.close(); }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      api.close();
      onPick(b.dataset.k);
    });
    shade.addEventListener('click', () => api.close());
    removeLayer = pushLayer(() => api.close());
    api.set(html);
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    openPopup = api;
    return api;
  }

  const item = (k, icon, label) => '<button class="pop-item" data-k="' + esc(k) + '">' + ic(icon) + '<span>' + esc(label) + '</span></button>';

  function openFullSong(t) {
    Platform.openSpotify(t.uri, 'https://open.spotify.com/track/' + t.id);
  }

  // ---------- Start ----------

  async function boot() {
    app.innerHTML = '<div class="splash">' + LOGO + '<b>Klangwelt</b><span>Musikkatalog wird geladen …</span><span class="spinner"></span></div>';
    try {
      await Catalog.load('data/catalog.json');
    } catch (e) {
      app.innerHTML = '<div class="splash">' + LOGO + '<b>Klangwelt</b><span>Der Musikkatalog konnte nicht geladen werden.</span><small>' + esc(e.message) + '</small></div>';
      return;
    }
    S.ready = true;
    Lib.extras().forEach(m => Catalog.addExternal(m));
    await SA.load();
    // Browser-Variante: Spotify leitet nach der Anmeldung auf diese Seite zurück
    if (Platform.kind === 'web' && /[?&](code|error)=/.test(location.search)) {
      const url = location.href;
      history.replaceState(null, '', location.pathname + location.hash);
      await sp.finishLogin(url).then(() => toast('Spotify-Konto verknüpft'), e => toast(spExplain(e), 6000));
    }
    renderShell();
    Lib.onChange(what => {
      if (what === 'import') Lib.extras().forEach(m => Catalog.addExternal(m));
      if (what === 'liked' || what === 'import') S.mixesKey = '';
      renderLibLists();
      if (viewRefresh) viewRefresh(what);
    });
    renderLibLists();
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', placeEmbed);
    route();
    Player.restore();
    bindKeys();
    // Spotify-Bibliothek im Hintergrund abgleichen (höchstens alle 10 Minuten automatisch)
    if (SA.linked() && Date.now() - SA.synced > 10 * 60 * 1000) SA.sync(false);
  }

  // ---------- Gerüst ----------

  let viewEl, mainEl, viewRefresh = null, observers = [];

  function renderShell() {
    app.innerHTML =
      '<div class="shell' + (S.panel ? ' with-panel' : '') + '">' +
      '<aside class="side">' +
      '<nav class="panel side-nav"><div class="brand">' + LOGO + '<span>Klangwelt</span></div>' +
      '<a href="#/home" data-nav="home">' + ic('home') + '<span>Start</span></a>' +
      '<a href="#/search" data-nav="search">' + ic('search') + '<span>Suchen</span></a></nav>' +
      '<section class="panel side-lib">' +
      '<header class="side-lib-head"><a href="#/library" data-nav="library">' + ic('library') + '<span>Deine Bibliothek</span></a>' +
      '<button class="icon-btn" data-act="new-playlist" title="Neue Playlist">' + ic('plus') + '</button></header>' +
      '<div class="sp-sync" data-spsync></div>' +
      '<div class="chips" data-chips></div>' +
      '<div class="side-list lib-list" data-liblist></div>' +
      '</section></aside>' +
      '<main class="main" id="main">' +
      '<div class="topbar" id="topbar"><div class="nav-btns"><button class="nav-round" data-act="back" aria-label="Zurück">' + ic('back') + '</button>' +
      '<button class="nav-round hide-m" data-act="fwd" aria-label="Vor">' + ic('fwd') + '</button></div>' +
      '<div class="tb-title" id="tb-title"></div>' +
      '<a class="nav-round" href="#/settings" aria-label="Einstellungen">' + ic('settings') + '</a></div>' +
      '<div class="view" id="view"></div></main>' +
      '<aside class="np-panel panel" id="np-panel"></aside>' +
      '<footer class="player" id="player"></footer>' +
      '<nav class="tabbar">' +
      '<a href="#/home" data-nav="home">' + ic('home') + '<span>Start</span></a>' +
      '<a href="#/search" data-nav="search">' + ic('search') + '<span>Suchen</span></a>' +
      '<a href="#/library" data-nav="library">' + ic('library') + '<span>Bibliothek</span></a></nav>' +
      '</div>' +
      '<div class="full" id="full" hidden></div>' +
      '<div id="embed-host" class="embed-host parked"></div>';
    viewEl = $('#view');
    mainEl = $('#main');
    Preview.attach($('#embed-host'));
    buildPlayer();
    app.addEventListener('click', onShellClick);
    mainEl.addEventListener('scroll', () => { $('#topbar').classList.toggle('solid', mainEl.scrollTop > 56); }, { passive: true });
  }

  function onShellClick(e) {
    const playBtn = e.target.closest('[data-play]');
    if (playBtn) { e.preventDefault(); e.stopPropagation(); playSource(playBtn.dataset.play); return; }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const f = chip.dataset.chip;
      local('kw.libFilter', local('kw.libFilter') === f ? 'all' : f);
      renderLibLists();
      return;
    }
    const ext = e.target.closest('[data-ext]');
    if (ext) { e.preventDefault(); Platform.openExternal(ext.dataset.ext); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'back') history.back();
    else if (a === 'fwd') history.forward();
    else if (a === 'sp-connect') connectSpotify();
    else if (a === 'new-playlist') newPlaylist();
    else Player.action(a, act);
  }

  function newPlaylist(ids, then) {
    const p = Lib.createPlaylist('', ids);
    toast('Playlist „' + p.name + '“ erstellt');
    if (then) then(p); else location.hash = '#/playlist/' + p.id;
    return p;
  }

  // ---------- Bibliothek in der Seitenleiste ----------

  function libItems() {
    const f = local('kw.libFilter') || 'all';
    const items = [];
    if (f === 'all' || f === 'playlists') {
      items.push('<a class="lib-row" href="#/liked">' + likedCover('lib-img') + '<div class="lib-meta"><div class="lib-t">Lieblingssongs</div><div class="lib-s">' + ic('heartFill', 'pin') + 'Playlist • ' + plural(likedEntries().length, 'Song', 'Songs') + '</div></div></a>');
      for (const p of Lib.playlists()) {
        items.push('<a class="lib-row" href="#/playlist/' + esc(p.id) + '">' + playlistCover(p, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(p.name) + '</div><div class="lib-s">Playlist • ' + plural(p.tracks.length, 'Song', 'Songs') + '</div></div></a>');
      }
      // Verknüpftes Spotify-Konto: eigene und gespeicherte Playlists von Spotify
      if (SA.linked()) {
        for (const p of SA.playlists) {
          const own = SA.me && p.owner.id === SA.me.id;
          items.push('<a class="lib-row" href="#/splaylist/' + esc(p.id) + '">' + extCover(p.imgS || p.img, p.name, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(p.name) + '</div><div class="lib-s">' +
            (p.collaborative ? 'Gemeinsame Playlist' : 'Playlist') + ' • ' + (own ? 'Spotify' : 'von ' + esc(p.owner.name)) + (own ? '' : '<span class="tag">Gespeichert</span>') + '</div></div></a>');
        }
      }
    }
    if (f === 'all' || f === 'albums') {
      if (SA.linked()) {
        for (const a of SA.albums) {
          if (Lib.albums().some(x => x.sid === a.id)) continue;
          items.push('<a class="lib-row" href="#/salbum/' + esc(a.id) + '">' + extCover(a.imgS || a.img, a.name, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Album • ' + esc(a.artists.map(x => x.name).join(', ')) + '</div></div></a>');
        }
      }
      for (const a of Lib.albums()) {
        if (a.sid) {
          items.push('<a class="lib-row" href="#/salbum/' + esc(a.sid) + '">' + extCover(a.img, a.name, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Album • ' + esc(a.artist) + '</div></div></a>');
          continue;
        }
        const al = Catalog.albumIndex(a.name, a.artist);
        if (al < 0) continue;
        items.push('<a class="lib-row" href="#/album/' + al + '">' + albumCover(al, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Album • ' + esc(a.artist) + '</div></div></a>');
      }
    }
    if (f === 'all' || f === 'artists') {
      if (SA.linked()) {
        for (const a of SA.artists) {
          if (Lib.artists().some(x => x.sid === a.id || x.name === a.name)) continue;
          items.push('<a class="lib-row" href="#/sartist/' + esc(a.id) + '">' + extCover(a.imgS || a.img, a.name, 'lib-img', true) + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Künstler</div></div></a>');
        }
      }
      for (const a of Lib.artists()) {
        if (a.sid) {
          items.push('<a class="lib-row" href="#/sartist/' + esc(a.sid) + '">' + extCover(a.img, a.name, 'lib-img', true) + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Künstler</div></div></a>');
          continue;
        }
        const k = Catalog.artistIndex(a.name);
        if (k < 0) continue;
        items.push('<a class="lib-row" href="#/artist/' + k + '">' + artistCover(k, 'lib-img') + '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Künstler</div></div></a>');
      }
    }
    return items;
  }

  function renderLibLists() {
    const f = local('kw.libFilter') || 'all';
    const chips = [['playlists', 'Playlists'], ['albums', 'Alben'], ['artists', 'Künstler']]
      .map(([k, label]) => '<button class="chip' + (f === k ? ' on' : '') + '" data-chip="' + k + '">' + label + '</button>').join('');
    $$('[data-chips]').forEach(el => { el.innerHTML = chips; });
    const items = libItems();
    const html = items.length > 1 || f !== 'all' ? items.join('') || '<div class="lib-empty">Noch nichts gespeichert.</div>'
      : items.join('') + '<div class="lib-hint"><b>Erstelle deine erste Playlist</b><span>Es ist ganz einfach.</span><button class="btn btn-small btn-white" data-act="new-playlist">Playlist erstellen</button></div>';
    $$('[data-liblist]').forEach(el => { el.innerHTML = html; Covers.watch(el); });
    markNow();
  }

  // ---------- Router ----------

  let navSeq = 0;
  const views = { home: homeView, search: searchView, library: libraryView, liked: likedView, playlist: playlistView, mix: mixView, album: albumView, artist: artistView, genre: genreView, queue: queueView, settings: settingsView, salbum: spotifyAlbumView, sartist: spotifyArtistView, splaylist: spotifyPlaylistView };

  function route() {
    if (!viewEl) return;
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const name = views[parts[0]] ? parts[0] : 'home';
    const id = decodeURIComponent(parts.slice(1).join('/'));
    const seq = ++navSeq;
    viewRefresh = null;
    observers.forEach(o => o.disconnect());
    observers = [];
    if (openPopup) openPopup.close();
    closeFull();
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name || ((name === 'liked' || name === 'playlist') && a.dataset.nav === 'library')));
    $('#topbar').classList.remove('solid');
    $('#tb-title').textContent = '';
    document.body.dataset.view = name;
    viewEl.className = 'view view-' + name;
    viewEl.style.removeProperty('--hero');
    viewEl.onclick = viewEl.onchange = null;
    viewEl.innerHTML = '';
    mainEl.scrollTop = 0;
    views[name](id, seq);
    Covers.watch(viewEl);
    markNow();
  }

  const alive = seq => seq === navSeq;
  function setHero(color, title) {
    viewEl.style.setProperty('--hero', color);
    $('#topbar').style.setProperty('--tb', color);
    if (title !== undefined) $('#tb-title').textContent = title;
  }

  // ---------- Bausteine ----------

  function cardHtml(o) {
    return '<a class="card" href="' + o.href + '"><div class="card-img' + (o.round ? ' round' : '') + '">' + o.cover +
      (o.play ? '<button class="card-play" data-play="' + esc(o.play) + '" aria-label="Abspielen">' + ic('play') + '</button>' : '') + '</div>' +
      '<div class="card-t">' + esc(o.title) + '</div><div class="card-s">' + esc(o.sub) + '</div></a>';
  }

  const albumCard = al => cardHtml({ href: '#/album/' + al, cover: albumCover(al, 'cimg'), title: Catalog.albumName(al), sub: 'Album • ' + Catalog.artistName(Catalog.albumArtist(al)), play: 'album:' + al });
  const artistCard = a => cardHtml({ href: '#/artist/' + a, cover: artistCover(a, 'cimg'), title: Catalog.artistName(a), sub: 'Künstler', play: 'artist:' + a, round: true });
  const mixCard = m => cardHtml({ href: '#/mix/' + m.id, cover: mixCover(m.title || m.name, m.color, 'cimg', m.coverSub), title: m.name, sub: m.desc, play: 'mix:' + m.id });
  const playlistCard = p => cardHtml({ href: '#/playlist/' + p.id, cover: playlistCover(p, 'cimg'), title: p.name, sub: plural(p.tracks.length, 'Song', 'Songs'), play: 'playlist:' + p.id });
  const likedCard = () => cardHtml({ href: '#/liked', cover: likedCover('cimg'), title: 'Lieblingssongs', sub: plural(likedEntries().length, 'Song', 'Songs'), play: 'liked' });
  const spPlaylistCard = p => cardHtml({ href: '#/splaylist/' + p.id, cover: extCover(p.img, p.name, 'cimg'), title: p.name, sub: SA.me && p.owner.id === SA.me.id ? (p.total != null ? plural(p.total, 'Song', 'Songs') : 'Playlist') : 'von ' + p.owner.name });
  const genreCard = g => cardHtml({ href: '#/genre/' + Catalog.genreId(g), cover: mixCover(Catalog.genreName(g), hashColor('genre' + g, 38), 'cimg', 'Top 100'), title: Catalog.genreName(g), sub: 'Genre', play: 'genre:' + g });

  function section(title, inner, more) {
    return '<section class="sec"><div class="sec-head"><h2>' + esc(title) + '</h2>' + (more ? '<a class="sec-more" href="' + more + '">Alle anzeigen</a>' : '') + '</div>' + inner + '</section>';
  }
  const row = cards => '<div class="cards">' + cards.join('') + '</div>';

  function heroHtml(o) {
    return '<header class="hero"><div class="hero-img' + (o.round ? ' round' : '') + '">' + o.cover + '</div>' +
      '<div class="hero-meta"><div class="hero-kind">' + esc(o.kind) + '</div><h1 class="hero-title' + (o.title.length > 26 ? ' long' : '') + '"' + (o.editable ? ' data-edit="1" title="Umbenennen"' : '') + '>' + esc(o.title) + '</h1>' +
      (o.desc ? '<p class="hero-desc">' + esc(o.desc) + '</p>' : '') + '<div class="hero-by">' + o.by + '</div></div></header>';
  }

  /** Aktionsleiste unter dem Kopf: Abspielen, Zufall, weitere Knöpfe, Filter. */
  function actionsHtml(o) {
    return '<div class="actions"><button class="bigplay" data-act="list-play" aria-label="Abspielen">' + ic('play') + '</button>' +
      '<button class="icon-btn big" data-act="list-shuffle" title="Zufallswiedergabe">' + ic('shuffle') + '</button>' +
      (o.extra || '') +
      '<button class="icon-btn big" data-act="list-more" title="Mehr">' + ic('more') + '</button>' +
      (o.filter ? '<label class="mini-search grow">' + ic('search') + '<input data-trackq placeholder="In ' + esc(o.filter) + ' suchen"></label>' : '') +
      '</div>';
  }

  function loading(text) {
    return '<div class="loading"><span class="spinner"></span>' + esc(text || 'Wird geladen …') + '</div>';
  }

  // ---------- Songliste ----------

  /**
   * Songliste mit Filter, Sortierung und nachladendem Rendern.
   * items: Track-Indizes; o.ctx: Quelle fürs Abspielen; o.added: Zeitstempel je Eintrag; o.playlist: eigene Playlist-ID
   */
  function mountTracks(el, items, o) {
    o = o || {};
    const st = { q: '', sort: 'default', dir: 1, list: [], shown: 0 };
    el.classList.add('tracks');
    el.classList.toggle('has-album', o.album !== false);
    el.classList.toggle('has-added', !!o.added);
    el.classList.toggle('no-cover', o.cover === false);
    const head = o.head === false ? '' :
      '<div class="thead"><div class="c-num">#</div><div class="c-title" data-sort="name">Titel</div>' +
      (o.album !== false ? '<div class="c-album" data-sort="album">Album</div>' : '') +
      (o.added ? '<div class="c-added" data-sort="added">Hinzugefügt</div>' : '') +
      '<div class="c-like"></div><div class="c-dur" data-sort="sec">' + ic('clock') + '</div><div class="c-more"></div></div>';
    el.innerHTML = head + '<div class="rows"></div><div class="rows-end"></div>';
    const rows = $('.rows', el);

    function key(x) {
      const t = x.t;
      if (st.sort === 'name') return t.name.toLowerCase();
      if (st.sort === 'album') return t.album.name.toLowerCase();
      if (st.sort === 'added') return o.added ? o.added[x.k] : 0;
      if (st.sort === 'sec') return t.sec;
      return 0;
    }

    function apply() {
      let list = items.map((i, k) => ({ i, k, t: T(i) }));
      const q = st.q.trim().toLowerCase();
      if (q) list = list.filter(({ t }) => (t.name + ' ' + artistNames(t) + ' ' + t.album.name).toLowerCase().includes(q));
      if (st.sort !== 'default') list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
      st.list = list;
      st.shown = 0;
      rows.innerHTML = list.length ? '' : '<div class="empty">' + esc(q ? 'Keine Treffer für „' + st.q.trim() + '“' : (o.empty || 'Hier ist noch nichts.')) + '</div>';
      more();
      $$('[data-sort]', el).forEach(h => h.classList.toggle('sorted', h.dataset.sort === st.sort));
    }

    function more() {
      const next = st.list.slice(st.shown, st.shown + (o.max || ROW_CHUNK));
      rows.insertAdjacentHTML('beforeend', next.map((x, n) => rowHtml(x, st.shown + n, o)).join(''));
      st.shown += next.length;
      Covers.watch(rows);
      markNow();
    }

    if (!o.max) {
      const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && st.shown < st.list.length) more(); }, { root: mainEl, rootMargin: '900px' });
      io.observe($('.rows-end', el));
      observers.push(io);
    }

    const order = () => st.list.map(x => x.i);
    const play = k => {
      const list = order();
      Player.playList(list, k, o.ctx || { kind: 'list', name: '' });
    };

    el.addEventListener('click', e => {
      const sortHead = e.target.closest('[data-sort]');
      if (sortHead) {
        if (st.sort === sortHead.dataset.sort) { if (st.dir === 1) st.dir = -1; else { st.sort = 'default'; st.dir = 1; } }
        else { st.sort = sortHead.dataset.sort; st.dir = sortHead.dataset.sort === 'added' ? -1 : 1; }
        apply();
        return;
      }
      const r = e.target.closest('.trow');
      if (!r || e.target.closest('a')) return;
      const pos = Number(r.dataset.pos);
      const x = st.list[pos];
      if (!x) return;
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'like') { e.stopPropagation(); toggleLike(x.t); return; }
      if (act && act.dataset.act === 'add') { e.stopPropagation(); if (o.onAdd) o.onAdd(x.i, r); return; }
      if (act && act.dataset.act === 'menu') { e.stopPropagation(); trackMenu(act, x.t, o, x.k); return; }
      if ((act && act.dataset.act === 'play') || coarse) { e.stopPropagation(); play(pos); return; }
      $$('.trow.sel', el).forEach(y => y.classList.remove('sel'));
      r.classList.add('sel');
    });
    el.addEventListener('dblclick', e => {
      const r = e.target.closest('.trow');
      if (r && !e.target.closest('a, button')) play(Number(r.dataset.pos));
    });

    apply();
    return {
      filter(q) { st.q = q; apply(); },
      play(shuffle) {
        const list = order();
        if (!list.length) return;
        Player.playList(list, shuffle ? Math.floor(Math.random() * list.length) : 0, o.ctx || { kind: 'list', name: '' }, { shuffle: !!shuffle });
      },
      order,
    };
  }

  function rowHtml(x, pos, o) {
    const t = x.t;
    const liked = isLiked(t.id);
    return '<div class="trow" data-pos="' + pos + '" data-id="' + t.id + '">' +
      '<div class="c-num"><span class="n">' + (pos + 1) + '</span><button class="rowplay" data-act="play" aria-label="Abspielen">' + ic('play') + '</button>' + EQ + '</div>' +
      '<div class="c-title">' + (o.cover === false ? '' : trackCover(t, 'tcover')) +
      '<div class="tmeta"><div class="tname">' + esc(t.name) + '</div><div class="tsub">' + (t.explicit ? '<span class="explicit">E</span>' : '') + artistLinks(t) + '</div></div></div>' +
      (o.album !== false ? '<div class="c-album">' + (t.album.href ? '<a href="' + esc(t.album.href) + '">' + esc(t.album.name) + '</a>' : esc(t.album.name)) + '</div>' : '') +
      (o.added ? '<div class="c-added">' + esc(ago(o.added[x.k])) + '</div>' : '') +
      '<div class="c-like">' + (o.onAdd
        ? '<button class="btn btn-small btn-ghost" data-act="add">Hinzufügen</button>'
        : '<button class="icon-btn like' + (liked ? ' on' : '') + '" data-act="like" aria-label="' + (liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen') + '">' + ic(liked ? 'heartFill' : 'heart') + '</button>') + '</div>' +
      '<div class="c-dur">' + dur(t.sec) + '</div>' +
      '<div class="c-more"><button class="icon-btn" data-act="menu" aria-label="Mehr">' + ic('more') + '</button></div></div>';
  }

  /** Markiert überall den Song, der gerade läuft, und die Quelle in der Bibliothek. */
  function markNow() {
    const cur = Player.current >= 0 ? T(Player.current).id : null;
    $$('.trow.now').forEach(r => { if (r.dataset.id !== cur) r.classList.remove('now'); });
    if (cur) $$('.trow[data-id="' + cur + '"]').forEach(r => r.classList.add('now'));
    document.body.classList.toggle('is-playing', Player.playing);
    const href = Player.ctx && Player.ctx.href;
    $$('.lib-row').forEach(r => r.classList.toggle('now', !!href && r.getAttribute('href') === href));
  }

  function trackMenu(anchor, t, o, k) {
    const liked = isLiked(t.id);
    const html = '<div class="pop-title">' + esc(t.name) + '<small>' + esc(artistNames(t)) + '</small></div>' +
      item('next', 'queue', 'Als Nächstes spielen') +
      item('queue', 'queue', 'Zur Warteschlange hinzufügen') +
      item('playlist', 'plus', 'Zur Playlist hinzufügen') +
      item('like', liked ? 'heartFill' : 'heart', liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen') +
      (o && o.playlist ? item('remove', 'trash', 'Aus dieser Playlist entfernen') : '') +
      (o && o.playlist && o.reorder ? item('up', 'up', 'Nach oben') + item('down', 'downSmall', 'Nach unten') : '') +
      '<div class="pop-sep"></div>' +
      item('radio', 'radio', 'Song-Radio starten') +
      (t.artists[0] && t.artists[0].href ? item('artist', 'artist', 'Zum Künstler') : '') +
      (t.album.href ? item('album', 'album', 'Zum Album') : '') +
      item('info', 'info', 'Song-Infos') +
      '<div class="pop-sep"></div>' +
      item('spotify', 'external', 'Ganzen Song in Spotify hören') +
      item('copy', 'copy', 'Spotify-Link kopieren');
    popup(anchor, html, key => {
      if (key === 'next') { Player.addNext(t.i); toast('Spielt als Nächstes'); }
      if (key === 'queue') { Player.addQueue(t.i); toast('Zur Warteschlange hinzugefügt'); }
      if (key === 'playlist') addToPlaylistMenu(anchor, [t.i]);
      if (key === 'like') toggleLike(t);
      if (key === 'remove') { Lib.removeFromPlaylist(o.playlist, k); toast('Aus der Playlist entfernt'); }
      if (key === 'up') Lib.movePlaylistTrack(o.playlist, k, k - 1);
      if (key === 'down') Lib.movePlaylistTrack(o.playlist, k, k + 1);
      if (key === 'radio') startRadio([t.i], 'Radio: ' + t.name);
      if (key === 'artist') location.hash = t.artists[0].href;
      if (key === 'album') location.hash = t.album.href;
      if (key === 'info') songInfo(t);
      if (key === 'spotify') openFullSong(t);
      if (key === 'copy') Platform.copy('https://open.spotify.com/track/' + t.id).then(() => toast('Link kopiert'), () => toast('https://open.spotify.com/track/' + t.id));
    });
  }

  function addToPlaylistMenu(anchor, ids) {
    const pls = Lib.playlists();
    popup(anchor, '<div class="pop-title">Zur Playlist hinzufügen</div>' + item('__new', 'plus', 'Neue Playlist') +
      (pls.length ? '<div class="pop-sep"></div>' : '') + pls.map(p => item(p.id, 'note', p.name)).join(''), key => {
      ids.forEach(keep);
      const tids = ids.map(i => T(i).id);
      if (key === '__new') { newPlaylist(tids, p => toast('Zu „' + p.name + '“ hinzugefügt')); return; }
      const p = Lib.playlist(key);
      const n = Lib.addToPlaylist(key, tids);
      toast(n ? 'Zu „' + p.name + '“ hinzugefügt' : 'Ist schon in „' + p.name + '“');
    });
  }

  /** Lieblingssong, wenn in Klangwelt oder (verknüpft) bei Spotify gespeichert. */
  const isLiked = id => Lib.isLiked(id) || SA.likedSet.has(id);

  /** Alle Lieblingssongs (Klangwelt + Spotify), neueste zuerst. */
  function likedEntries() {
    const map = new Map();
    for (const x of SA.liked) map.set(x.id, x.t);
    for (const x of Lib.liked()) map.set(x.id, Math.max(map.get(x.id) || 0, x.t));
    return [...map.entries()].map(([id, t]) => ({ id, t })).sort((a, b) => b.t - a.t);
  }

  function toggleLike(t) {
    keep(t.i);
    const on = !isLiked(t.id);
    // Verknüpft: auch bei Spotify speichern bzw. entfernen
    if (SA.linked()) SA.saveLike(t, on);
    Lib.setLiked(t.id, on);
    $$('.trow[data-id="' + t.id + '"] .like').forEach(b => { b.classList.toggle('on', on); b.innerHTML = ic(on ? 'heartFill' : 'heart'); });
    renderPlayer();
    toast(on ? 'Zu Lieblingssongs hinzugefügt' : 'Aus Lieblingssongs entfernt');
  }

  function bar(label, v) {
    return '<div class="feat"><span>' + esc(label) + '</span><i><b style="width:' + Math.round(v * 100) + '%"></b></i><em>' + Math.round(v * 100) + '</em></div>';
  }

  function featuresHtml(t) {
    const f = Catalog.features(t.i);
    if (!f) {
      return '<div class="facts"><div><b>' + dur(t.sec) + '</b><span>Länge</span></div>' + (t.explicit ? '<div><b>E</b><span>Explicit</span></div>' : '') + '</div>' +
        '<p class="muted small">Dieser Song kommt aus der Spotify-Suche. Für ihn gibt es keine Audio-Merkmale; Radio und Endlos-Wiedergabe nehmen dafür die Songs des Künstlers aus dem Katalog.</p>';
    }
    return '<div class="facts"><div><b>' + t.tempo + '</b><span>BPM</span></div><div><b>' + esc(t.key) + (t.major ? '-Dur' : '-Moll') + '</b><span>Tonart</span></div>' +
      '<div><b>' + dur(t.sec) + '</b><span>Länge</span></div><div><b>' + t.pop + '</b><span>Beliebtheit</span></div></div>' +
      bar('Energie', f.energy) + bar('Tanzbarkeit', f.dance) + bar('Gute Laune', f.valence) + bar('Akustisch', f.acoustic) + bar('Instrumental', f.instr) + bar('Gesprochen', f.speech) + bar('Live-Gefühl', f.live) +
      '<p class="muted small">Genres: ' + esc(t.genres.map(g => Catalog.genreName(Catalog.genreIndex(g))).join(', ')) + '</p>';
  }

  function songInfo(t) {
    modal({ title: t.name, html: '<p class="muted">' + esc(artistNames(t)) + ' • ' + esc(t.album.name) + '</p>' + featuresHtml(t), actions: [{ label: 'Song-Radio', onClick: () => { startRadio([t.i], 'Radio: ' + t.name); } }, { label: 'OK', primary: true }] });
  }

  function startRadio(seeds, name) {
    const tracks = Catalog.radio(seeds, 60);
    if (tracks.length < 2) { toast('Für diesen Song gibt es kein Radio – der Künstler ist nicht im Katalog'); return; }
    S.radio = { name, tracks, seed: seeds[0] };
    Player.playList(tracks, 0, { kind: 'mix', id: 'radio', name, href: '#/mix/radio' });
    toast(name + ' läuft');
  }

  // ---------- Mixe ----------

  const CHART_GENRES = ['pop', 'hip-hop', 'dance', 'rock', 'german', 'latin', 'k-pop', 'edm', 'indie', 'r-n-b', 'country', 'metal'];

  function likedIdx() {
    return likedEntries().map(x => Catalog.indexOf(x.id)).filter(i => i >= 0);
  }

  function dailyMixes() {
    const liked = likedIdx();
    const key = Math.floor(Date.now() / 864e5) + ':' + liked.length + ':' + (liked[0] || 0);
    if (S.mixesKey !== key) {
      S.mixes = Catalog.dailyMixes(liked, 6).map(m => Object.assign(m, { color: hashColor('mix' + m.genre, 36), title: m.name, coverSub: Catalog.genreName(m.genre) }));
      S.mixesKey = key;
    }
    return S.mixes;
  }

  /** Mix nach ID: daily-N, weekly, mood-X, top, top-GENRE, radio. */
  function getMix(id) {
    if (id.startsWith('daily-')) return dailyMixes().find(m => m.id === id) || null;
    if (id === 'weekly') {
      const liked = likedIdx();
      const key = dailyMixes() && S.mixesKey;
      if (!S.weekly || S.weekly.key !== key) S.weekly = { key, tracks: Catalog.weekly(liked, 30) };
      return { id, name: 'Mix der Woche', title: 'Mix der Woche', color: '#5f3dc4', desc: liked.length ? 'Neue Songs, die zu deinen Lieblingssongs passen. Jeden Montag neu.' : 'Markiere ein paar Lieblingssongs, dann gibt es hier jede Woche neue Entdeckungen.', tracks: S.weekly.tracks };
    }
    if (id.startsWith('mood-')) {
      const m = Catalog.MOODS.find(x => x.id === id.slice(5));
      return m ? { id, name: m.name, title: m.name, color: m.color, desc: m.desc + '. Jede Woche neu gemischt.', tracks: Catalog.moodMix(m.id, 50) } : null;
    }
    if (id === 'top') return { id, name: 'Top 50', title: 'Top 50', coverSub: 'Alle Genres', color: '#c2185b', desc: 'Die beliebtesten Songs im ganzen Katalog.', tracks: Catalog.top(50) };
    if (id.startsWith('top-')) {
      const g = Catalog.genreIndex(id.slice(4));
      return g < 0 ? null : { id, name: 'Top 50 ' + Catalog.genreName(g), title: 'Top 50', coverSub: Catalog.genreName(g), color: hashColor('genre' + g, 38), desc: 'Die beliebtesten ' + Catalog.genreName(g) + '-Songs.', tracks: Catalog.top(50, g) };
    }
    if (id === 'radio' && S.radio) return { id, name: S.radio.name, title: 'Radio', coverSub: S.radio.name.replace(/^Radio: /, ''), color: hashColor('radio' + S.radio.seed, 34), desc: 'Songs, die zu „' + S.radio.name.replace(/^Radio: /, '') + '“ passen.', tracks: S.radio.tracks };
    return null;
  }

  /** Startet eine Quelle aus einem Abspiel-Knopf (data-play). */
  function playSource(src, shuffle) {
    const [kind, ...rest] = src.split(':');
    const id = rest.join(':');
    let list = [], ctx = null;
    if (kind === 'liked') { list = likedIdx(); ctx = { kind, name: 'Lieblingssongs', href: '#/liked' }; }
    if (kind === 'playlist') {
      const p = Lib.playlist(id);
      if (p) { list = p.tracks.map(x => Catalog.indexOf(x.id)).filter(i => i >= 0); ctx = { kind, id, name: p.name, href: '#/playlist/' + id }; }
    }
    if (kind === 'mix') { const m = getMix(id); if (m) { list = m.tracks; ctx = { kind, id, name: m.name, href: '#/mix/' + id }; } }
    if (kind === 'album') { list = Catalog.albumTracks(Number(id)); ctx = { kind, id, name: Catalog.albumName(Number(id)), href: '#/album/' + id }; }
    if (kind === 'artist') { list = Catalog.artistTracks(Number(id)).slice(0, 50); ctx = { kind, id, name: Catalog.artistName(Number(id)), href: '#/artist/' + id }; }
    if (kind === 'genre') { const g = Number(id); list = Catalog.genreTracks(g).slice(0, 100); ctx = { kind, id: Catalog.genreId(g), name: Catalog.genreName(g), href: '#/genre/' + Catalog.genreId(g) }; }
    if (!list.length) { toast(kind === 'liked' ? 'Noch keine Lieblingssongs – tippe bei einem Song aufs Herz' : 'Hier ist noch nichts drin'); return; }
    Player.playList(list, shuffle ? Math.floor(Math.random() * list.length) : 0, ctx, { shuffle: !!shuffle });
  }

  // ---------- Ansichten ----------

  function homeView() {
    const h = new Date().getHours();
    const greet = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
    setHero('#26413a', '');
    viewEl.innerHTML = '<div class="page"><div class="home-head"><h1 class="greet">' + greet + '</h1></div><div class="shortcuts" id="shortcuts"></div><div id="home-secs"></div></div>';

    function render() {
      const liked = likedEntries();
      const mixes = dailyMixes();
      if (SA.linked() && SA.me) $('.greet').textContent = greet + ', ' + SA.me.name.split(' ')[0];
      const sc = ['<a class="shortcut" href="#/liked">' + likedCover('sc-img') + '<span>Lieblingssongs</span><button class="sc-play" data-play="liked" aria-label="Abspielen">' + ic('play') + '</button></a>'];
      const recent = Lib.recent().filter(r => r.href && r.href !== '#/liked').slice(0, 7);
      for (const r of recent) sc.push(shortcutFor(r));
      for (const m of [getMix('weekly')].concat(mixes)) if (sc.length < 8 && m && m.tracks.length && !recent.some(r => r.href === '#/mix/' + m.id)) sc.push('<a class="shortcut" href="#/mix/' + m.id + '">' + mixCover(m.title || m.name, m.color, 'sc-img') + '<span>' + esc(m.name) + '</span><button class="sc-play" data-play="mix:' + m.id + '" aria-label="Abspielen">' + ic('play') + '</button></a>');
      for (const g of CHART_GENRES) if (sc.length < 8) sc.push('<a class="shortcut" href="#/mix/top-' + g + '">' + mixCover('Top 50', hashColor('genre' + Catalog.genreIndex(g), 38), 'sc-img') + '<span>Top 50 ' + esc(Catalog.genreName(Catalog.genreIndex(g))) + '</span><button class="sc-play" data-play="mix:top-' + g + '" aria-label="Abspielen">' + ic('play') + '</button></a>');
      $('#shortcuts').innerHTML = sc.join('');

      const out = [];
      if (!liked.length) {
        out.push('<div class="welcome">' + ic('spark') + '<div><b>Willkommen bei Klangwelt</b><span>Über 80.000 Songs aus 114 Genres. Tippe bei Songs aufs Herz – daraus baut Klangwelt deine eigenen Mixe, jeden Tag neu.</span></div></div>');
      }
      if (mixes.length) out.push(section('Deine Mixe', row(mixes.map(mixCard))));
      const weekly = getMix('weekly');
      if (weekly.tracks.length) out.push(section('Für dich entdeckt', row([mixCard(Object.assign({}, weekly, { desc: 'Jeden Montag neu' }))].concat(Lib.playlists().slice(0, 8).map(playlistCard)))));
      if (recent.length) out.push(section('Zuletzt gehört', row(recent.map(cardFor).filter(Boolean))));
      if (SA.linked() && SA.playlists.length) out.push(section('Deine Spotify-Playlists', row(SA.playlists.slice(0, 20).map(spPlaylistCard)), '#/library'));
      out.push(section('Stimmungen', row(Catalog.MOODS.map(m => mixCard({ id: 'mood-' + m.id, name: m.name, title: m.name, color: m.color, desc: m.desc })))));
      out.push(section('Charts', row([mixCard({ id: 'top', name: 'Top 50', title: 'Top 50', coverSub: 'Alle Genres', color: '#c2185b', desc: 'Die beliebtesten Songs' })]
        .concat(CHART_GENRES.map(g => { const k = Catalog.genreIndex(g); return mixCard({ id: 'top-' + g, name: 'Top 50 ' + Catalog.genreName(k), title: 'Top 50', coverSub: Catalog.genreName(k), color: hashColor('genre' + k, 38), desc: Catalog.genreName(k) }); })))));
      out.push(section('Beliebte Künstler', row(popularArtists(14).map(artistCard))));
      if (Lib.albums().length) out.push(section('Deine Alben', row(Lib.albums().slice(0, 12).map(a => Catalog.albumIndex(a.name, a.artist)).filter(al => al >= 0).map(albumCard))));
      out.push(section('Genres entdecken', row(CHART_GENRES.concat(['jazz', 'classical', 'chill', 'reggaeton', 'techno', 'soul']).map(g => genreCard(Catalog.genreIndex(g)))), '#/search'));
      $('#home-secs').innerHTML = out.join('');
      Covers.watch(viewEl);
      markNow();
    }

    render();
    viewRefresh = what => { if (what !== 'recent' && what !== 'settings') render(); };
  }

  function popularArtists(n) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < 4000 && out.length < n; i++) {
      const a = T(i).artists[0].i;
      if (!seen.has(a)) { seen.add(a); out.push(a); }
    }
    return out;
  }

  function shortcutFor(r) {
    const cover = recentCover(r, 'sc-img');
    return '<a class="shortcut" href="' + esc(r.href) + '">' + cover + '<span>' + esc(r.name) + '</span>' + (r.play ? '<button class="sc-play" data-play="' + esc(r.play) + '" aria-label="Abspielen">' + ic('play') + '</button>' : '') + '</a>';
  }

  function recentCover(r, cls) {
    if (r.kind === 'album') return albumCover(Number(r.id), cls);
    if (r.kind === 'artist') return artistCover(Number(r.id), cls);
    if (r.kind === 'playlist') { const p = Lib.playlist(r.id); return p ? playlistCover(p, cls) : '<div class="cv ph ' + cls + '">' + ic('note') + '</div>'; }
    if (r.kind === 'genre') return mixCover(r.name, hashColor('genre' + Catalog.genreIndex(r.id), 38), cls);
    if (r.kind === 'salbum' || r.kind === 'sartist' || r.kind === 'splaylist') return extCover(r.img, r.name, cls, r.kind === 'sartist');
    if (r.kind === 'mix') { const m = r.id === 'radio' ? null : getMix(r.id); return mixCover(m ? m.title || m.name : r.name, m ? m.color : hashColor(r.name, 34), cls); }
    return '<div class="cv ph ' + cls + '">' + ic('note') + '</div>';
  }

  function cardFor(r) {
    if (r.kind === 'playlist' && !Lib.playlist(r.id)) return '';
    return '<a class="card" href="' + esc(r.href) + '"><div class="card-img' + (r.kind === 'artist' || r.kind === 'sartist' ? ' round' : '') + '">' + recentCover(r, 'cimg') +
      (r.play ? '<button class="card-play" data-play="' + esc(r.play) + '" aria-label="Abspielen">' + ic('play') + '</button>' : '') + '</div>' +
      '<div class="card-t">' + esc(r.name) + '</div><div class="card-s">' + esc({ album: 'Album', artist: 'Künstler', playlist: 'Playlist', genre: 'Genre', mix: 'Mix', salbum: 'Album', sartist: 'Künstler', splaylist: 'Playlist' }[r.kind] || '') + '</div></a>';
  }

  function libraryView() {
    setHero('#222', 'Deine Bibliothek');
    viewEl.innerHTML = '<div class="page lib-page"><div class="lib-page-head"><h1 class="page-title">Deine Bibliothek</h1><button class="icon-btn big" data-act="new-playlist" title="Neue Playlist">' + ic('plus') + '</button></div>' +
      '<div class="sp-sync" data-spsync></div><div class="chips" data-chips></div><div class="lib-list big" data-liblist></div></div>';
    renderLibLists();
  }

  function bindActions(getList, opts) {
    opts = opts || {};
    const q = $('[data-trackq]');
    if (q) q.addEventListener('input', () => { const l = getList(); if (l) l.filter(q.value); });
    $('.actions').addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      e.stopPropagation();
      const l = getList();
      if (a.dataset.act === 'list-play') { if (Player.ctx && opts.href && Player.ctx.href === opts.href && Player.current >= 0) Player.toggle(); else if (l) l.play(false); }
      if (a.dataset.act === 'list-shuffle') { if (l) l.play(true); }
      if (a.dataset.act === 'list-more' && opts.menu) opts.menu(a);
      if (opts.on) opts.on(a.dataset.act, a);
    });
  }

  function likedView() {
    setHero('#4a3aa8', 'Lieblingssongs');
    let list = null;
    function render() {
      const liked = likedEntries();
      const idxs = [], added = [];
      for (const x of liked) { const i = Catalog.indexOf(x.id); if (i >= 0) { idxs.push(i); added.push(x.t); } }
      const sec = idxs.reduce((s, i) => s + T(i).sec, 0);
      viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Playlist', title: 'Lieblingssongs', cover: likedCover('himg'), by: '<b>' + esc(SA.linked() && SA.me ? SA.me.name : 'Du') + '</b> • ' + plural(idxs.length, 'Song', 'Songs') + (sec ? ', ' + longDur(sec) : '') + (SA.linked() ? ' • mit Spotify abgeglichen' : '') }) +
        '<div class="page">' + actionsHtml({ filter: 'Lieblingssongs' }) + '<div id="list"></div></div>';
      list = mountTracks($('#list'), idxs, { added, ctx: { kind: 'liked', name: 'Lieblingssongs', href: '#/liked' }, empty: 'Tippe bei Songs aufs Herz, dann landen sie hier.' });
      bindActions(() => list, { href: '#/liked', menu: a => listMenu(a, () => list.order(), 'Lieblingssongs') });
      Covers.watch(viewEl);
    }
    render();
    viewRefresh = what => { if (what === 'import' || what === 'spotify') render(); };
  }

  function listMenu(anchor, getOrder, name, extra) {
    popup(anchor, '<div class="pop-title">' + esc(name) + '</div>' + item('queue', 'queue', 'Alle zur Warteschlange') + item('playlist', 'plus', 'Alle zu einer Playlist') +
      item('radio', 'radio', 'Radio dazu starten') + (extra ? extra.html : ''), k => {
      const order = getOrder();
      if (k === 'queue') { order.forEach(i => Player.addQueue(i)); toast(plural(order.length, 'Song', 'Songs') + ' zur Warteschlange'); }
      if (k === 'playlist') addToPlaylistMenu(anchor, order);
      if (k === 'radio') startRadio(order.slice(0, 20), 'Radio: ' + name);
      if (extra) extra.pick(k);
    });
  }

  function playlistView(id, seq) {
    let list = null;
    function render() {
      const p = Lib.playlist(id);
      if (!p) { viewEl.innerHTML = '<div class="page"><div class="empty">Diese Playlist gibt es nicht mehr.</div></div>'; return; }
      setHero(hashColor(p.id, 34), p.name);
      const idxs = [], added = [];
      for (const x of p.tracks) { const i = Catalog.indexOf(x.id); if (i >= 0) { idxs.push(i); added.push(x.t); } }
      const sec = idxs.reduce((s, i) => s + T(i).sec, 0);
      viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Playlist', title: p.name, desc: p.desc, cover: playlistCover(p, 'himg'), editable: true, by: '<b>Du</b> • ' + plural(idxs.length, 'Song', 'Songs') + (sec ? ', ' + longDur(sec) : '') }) +
        '<div class="page">' + actionsHtml({ filter: 'Playlist' }) + '<div id="list"></div>' +
        '<section class="sec find"><div class="sec-head"><h2>' + (idxs.length ? 'Empfohlen' : 'Lass uns etwas für deine Playlist finden') + '</h2></div>' +
        (idxs.length ? '<p class="muted">Passend zu den Songs in dieser Playlist</p>' : '') +
        '<label class="searchbox small">' + ic('search') + '<input id="pl-q" placeholder="Nach Songs suchen" autocomplete="off"></label><div id="pl-add"></div></section></div>';
      list = mountTracks($('#list'), idxs, { added, playlist: p.id, reorder: true, ctx: { kind: 'playlist', id: p.id, name: p.name, href: '#/playlist/' + p.id }, empty: 'Noch leer – füge unten Songs hinzu.' });
      bindActions(() => list, {
        href: '#/playlist/' + p.id,
        menu: a => listMenu(a, () => list.order(), p.name, {
          html: '<div class="pop-sep"></div>' + item('rename', 'edit', 'Umbenennen und Beschreibung') + item('delete', 'trash', 'Playlist löschen'),
          pick: k => { if (k === 'rename') rename(p); if (k === 'delete') removePlaylist(p); },
        }),
      });
      $('.hero-title').addEventListener('click', () => rename(p));
      const addOpts = { head: false, max: 10, ctx: { kind: 'list', name: 'Empfohlen' }, onAdd: (i, r) => { keep(i); Lib.addToPlaylist(p.id, [T(i).id]); toast('Zu „' + p.name + '“ hinzugefügt'); } };
      const showAdd = q => {
        const box = $('#pl-add');
        if (!box) return;
        const have = new Set(idxs);
        let pick;
        if (q.trim()) pick = Catalog.search(q, 30).tracks.filter(i => !have.has(i)).slice(0, 10);
        else if (idxs.length) pick = Catalog.similar(idxs.slice(0, 40), 10, { exclude: idxs, seed: Catalog.hash(p.id) + idxs.length });
        else pick = [];
        if (!pick.length) { box.innerHTML = q.trim() ? '<div class="empty">Keine Treffer</div>' : ''; return; }
        mountTracks(box, pick, addOpts);
      };
      let timer = null;
      $('#pl-q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => showAdd(e.target.value), 250); });
      showAdd('');
      Covers.watch(viewEl);
    }
    function rename(p) {
      modal({
        title: 'Playlist bearbeiten',
        html: '<label class="field"><span>Name</span><input id="pl-name" value="' + esc(p.name) + '" maxlength="100"></label><label class="field"><span>Beschreibung</span><textarea id="pl-desc" rows="3" maxlength="300">' + esc(p.desc) + '</textarea></label>',
        actions: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', primary: true, onClick: w => { Lib.renamePlaylist(p.id, $('#pl-name', w).value, $('#pl-desc', w).value); } }],
      });
    }
    function removePlaylist(p) {
      modal({ title: 'Playlist löschen?', html: '<p>„' + esc(p.name) + '“ wird aus deiner Bibliothek gelöscht.</p>', actions: [{ label: 'Abbrechen', value: null }, { label: 'Löschen', danger: true, onClick: () => { Lib.deletePlaylist(p.id); toast('Playlist gelöscht'); location.hash = '#/library'; } }] });
    }
    render();
    viewRefresh = what => {
      if (what !== 'playlists' && what !== 'import') return;
      const y = mainEl.scrollTop;
      render();
      mainEl.scrollTop = y;
    };
  }

  function mixView(id) {
    const m = getMix(id);
    if (!m) { viewEl.innerHTML = '<div class="page"><div class="empty">Diesen Mix gibt es gerade nicht.</div></div>'; return; }
    setHero(m.color, m.name);
    const sec = m.tracks.reduce((s, i) => s + T(i).sec, 0);
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: id.startsWith('top') ? 'Charts' : id === 'radio' ? 'Radio' : 'Mix', title: m.name, desc: m.desc, cover: mixCover(m.title || m.name, m.color, 'himg', m.coverSub), by: '<b>Klangwelt</b> • ' + plural(m.tracks.length, 'Song', 'Songs') + ', ' + longDur(sec) }) +
      '<div class="page">' + actionsHtml({ filter: 'Mix', extra: '<button class="btn btn-ghost btn-small" data-act="save-mix">' + ic('plus') + 'Als Playlist speichern</button>' }) + '<div id="list"></div></div>';
    const list = mountTracks($('#list'), m.tracks, { ctx: { kind: 'mix', id, name: m.name, href: '#/mix/' + id }, empty: id === 'weekly' ? 'Markiere zuerst ein paar Lieblingssongs.' : 'Leer' });
    bindActions(() => list, {
      href: '#/mix/' + id,
      menu: a => listMenu(a, () => list.order(), m.name),
      on: k => { if (k === 'save-mix') { const p = Lib.createPlaylist(m.name, m.tracks.map(i => T(i).id)); toast('Als Playlist „' + p.name + '“ gespeichert'); } },
    });
  }

  function albumView(id) {
    const al = Number(id);
    const tracks = Catalog.albumTracks(al);
    if (!tracks.length) { viewEl.innerHTML = '<div class="page"><div class="empty">Album nicht gefunden.</div></div>'; return; }
    const name = Catalog.albumName(al), artist = Catalog.albumArtist(al);
    setHero(hashColor(albumKey(al), 32), name);
    const sec = tracks.reduce((s, i) => s + T(i).sec, 0);
    const saved = () => Lib.isAlbumSaved(name, Catalog.artistName(artist));
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: tracks.length === 1 ? 'Single' : 'Album', title: name, cover: albumCover(al, 'himg'), by: '<a class="b" href="#/artist/' + artist + '">' + esc(Catalog.artistName(artist)) + '</a> • ' + plural(tracks.length, 'Song', 'Songs') + ' im Katalog, ' + longDur(sec) }) +
      '<div class="page">' + actionsHtml({ extra: '<button class="icon-btn big save' + (saved() ? ' on' : '') + '" data-act="save-album" title="In der Bibliothek speichern">' + ic(saved() ? 'check' : 'plusCircle') + '</button>' }) + '<div id="list"></div>' +
      section('Mehr von ' + Catalog.artistName(artist), row(Catalog.artistAlbums(artist).filter(x => x !== al).slice(0, 12).map(albumCard))) + '</div>';
    const list = mountTracks($('#list'), tracks, { album: false, ctx: { kind: 'album', id: String(al), name, href: '#/album/' + al } });
    bindActions(() => list, {
      href: '#/album/' + al,
      menu: a => listMenu(a, () => list.order(), name),
      on: (k, el) => {
        if (k !== 'save-album') return;
        const on = Lib.toggleAlbum(name, Catalog.artistName(artist));
        el.classList.toggle('on', on);
        el.innerHTML = ic(on ? 'check' : 'plusCircle');
        toast(on ? 'In deiner Bibliothek gespeichert' : 'Aus deiner Bibliothek entfernt');
      },
    });
    if (!$('#view .sec .card')) $$('#view .sec').forEach(s => { if (!s.querySelector('.card')) s.remove(); });
  }

  function artistView(id) {
    const a = Number(id);
    const tracks = Catalog.artistTracks(a);
    if (!tracks.length) { viewEl.innerHTML = '<div class="page"><div class="empty">Künstler nicht gefunden.</div></div>'; return; }
    const name = Catalog.artistName(a);
    setHero(hashColor('artist' + name, 34), name);
    const genres = Catalog.artistGenres(a);
    const following = () => Lib.isFollowing(name);
    const likedHere = likedIdx().filter(i => T(i).artists.some(x => x.i === a));
    const similarArtists = (() => {
      const seen = new Set([a]);
      const out = [];
      for (const i of Catalog.similar(tracks.slice(0, 8), 80, { seed: a })) {
        const b = T(i).artists[0].i;
        if (!seen.has(b)) { seen.add(b); out.push(b); }
        if (out.length >= 12) break;
      }
      return out;
    })();
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Künstler', title: name, round: true, cover: artistCover(a, 'himg'), by: esc(genres.slice(0, 3).map(Catalog.genreName).join(', ')) + ' • ' + plural(tracks.length, 'Song', 'Songs') + (likedHere.length ? ' • ' + plural(likedHere.length, 'Lieblingssong', 'Lieblingssongs') : '') }) +
      '<div class="page">' + actionsHtml({ extra: '<button class="btn btn-ghost btn-small follow' + (following() ? ' on' : '') + '" data-act="follow">' + (following() ? 'Gefolgt' : 'Folgen') + '</button>' }) +
      section('Beliebt', '<div class="tracks-slot" id="ar-top"></div><button class="link-btn" id="ar-more">Mehr anzeigen</button>') +
      (likedHere.length ? section('Deine Lieblingssongs', '<div class="tracks-slot" id="ar-liked"></div>') : '') +
      section('Alben und Singles', row(Catalog.artistAlbums(a).slice(0, 20).map(albumCard))) +
      (similarArtists.length ? section('Das gefällt Fans auch', row(similarArtists.map(artistCard))) : '') + '</div>';
    const ctx = { kind: 'artist', id: String(a), name, href: '#/artist/' + a };
    let max = 10;
    let list = mountTracks($('#ar-top'), tracks.slice(0, 50), { head: false, max, ctx });
    $('#ar-more').addEventListener('click', e => {
      max = max === 10 ? 50 : 10;
      list = mountTracks($('#ar-top'), tracks.slice(0, 50), { head: false, max, ctx });
      e.target.textContent = max === 10 ? 'Mehr anzeigen' : 'Weniger anzeigen';
      if (tracks.length <= 10) e.target.remove();
    });
    if (tracks.length <= 10) $('#ar-more').remove();
    if (likedHere.length) mountTracks($('#ar-liked'), likedHere, { head: false, max: 50, ctx: { kind: 'liked', name: 'Lieblingssongs', href: '#/liked' } });
    bindActions(() => ({ play: shuffle => Player.playList(tracks.slice(0, 50), shuffle ? Math.floor(Math.random() * Math.min(50, tracks.length)) : 0, ctx, { shuffle }), order: () => tracks.slice(0, 50) }), {
      href: ctx.href,
      menu: el => listMenu(el, () => tracks.slice(0, 50), name),
      on: (k, el) => {
        if (k !== 'follow') return;
        const on = Lib.toggleArtist(name);
        el.classList.toggle('on', on);
        el.textContent = on ? 'Gefolgt' : 'Folgen';
      },
    });
  }

  function genreView(id) {
    const g = Catalog.genreIndex(id);
    if (g < 0) { viewEl.innerHTML = '<div class="page"><div class="empty">Genre nicht gefunden.</div></div>'; return; }
    const name = Catalog.genreName(g);
    const color = hashColor('genre' + g, 38);
    setHero(color, name);
    const tracks = Catalog.genreTracks(g);
    const artists = [];
    const seen = new Set();
    for (const i of tracks) { const a = T(i).artists[0].i; if (!seen.has(a)) { seen.add(a); artists.push(a); } if (artists.length >= 14) break; }
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Genre', title: name, cover: mixCover(name, color, 'himg'), by: plural(tracks.length, 'Song', 'Songs') + ' im Katalog' }) +
      '<div class="page">' + actionsHtml({ filter: name, extra: '<button class="btn btn-ghost btn-small" data-act="genre-radio">' + ic('radio') + 'Genre-Radio</button>' }) +
      section('Beliebte Künstler', row(artists.map(artistCard))) +
      section('Top-Songs', '<div id="list"></div>') + '</div>';
    const list = mountTracks($('#list'), tracks.slice(0, 200), { ctx: { kind: 'genre', id, name, href: '#/genre/' + id } });
    bindActions(() => list, {
      href: '#/genre/' + id,
      menu: a => listMenu(a, () => list.order(), name),
      on: k => {
        if (k !== 'genre-radio') return;
        const seeds = Catalog.shuffled(tracks.slice(0, 60), Catalog.rng(Date.now())).slice(0, 10);
        const radio = seeds.concat(Catalog.similar(seeds, 50, { genre: g }));
        S.radio = { name: 'Radio: ' + name, tracks: radio, seed: g };
        Player.playList(radio, 0, { kind: 'mix', id: 'radio', name: 'Radio: ' + name, href: '#/mix/radio' });
      },
    });
  }

  function searchView(_, seq) {
    setHero('#1f1f1f', 'Suchen');
    viewEl.innerHTML = '<div class="page"><h1 class="page-title show-m">Suchen</h1><label class="searchbox">' + ic('search') +
      '<input id="q" type="search" placeholder="Was möchtest du hören?" autocomplete="off" value="' + esc(S.lastQuery) + '"></label><div id="results"></div></div>';
    const input = $('#q');
    let timer = null;
    function browse() {
      const genres = Catalog.genreStats().sort((x, y) => Catalog.genreTracks(x.i)[0] - Catalog.genreTracks(y.i)[0]);
      $('#results').innerHTML =
        section('Stimmungen', '<div class="tiles">' + Catalog.MOODS.map(m => '<a class="tile" href="#/mix/mood-' + m.id + '" style="background:' + m.color + '"><b>' + esc(m.name) + '</b><span>' + esc(m.desc) + '</span></a>').join('') + '</div>') +
        section('Alle Genres', '<div class="tiles">' + genres.map(x => '<a class="tile" href="#/genre/' + esc(x.id) + '" style="background:' + hashColor('genre' + x.i, 38) + '"><b>' + esc(x.name) + '</b><span>' + plural(x.count, 'Song', 'Songs') + '</span></a>').join('') + '</div>');
    }
    function run() {
      if (!alive(seq)) return; // inzwischen auf einer anderen Seite
      const q = input.value.trim();
      S.lastQuery = input.value;
      if (!q) { browse(); return; }
      const r = Catalog.search(q, 50);
      const secs = [];
      // Bester Treffer: Künstler, wenn sein Name passt und er mindestens so beliebt ist wie der beste Song
      const bestTrack = r.tracks[0];
      const artistFirst = r.artists.length && (bestTrack == null || Catalog.artistName(r.artists[0]).toLowerCase().startsWith(q.toLowerCase()) || Catalog.artistTracks(r.artists[0])[0] <= bestTrack);
      const best = artistFirst ? { kind: 'artist', a: r.artists[0] } : bestTrack != null ? { kind: 'track', i: bestTrack } : null;
      if (best || r.tracks.length) {
        let bestHtml = '';
        if (best && best.kind === 'artist') bestHtml = '<a class="best" href="#/artist/' + best.a + '">' + artistCover(best.a, 'best-img') + '<b>' + esc(Catalog.artistName(best.a)) + '</b><span class="pill">Künstler</span><button class="card-play" data-play="artist:' + best.a + '" aria-label="Abspielen">' + ic('play') + '</button></a>';
        if (best && best.kind === 'track') { const t = T(best.i); bestHtml = '<a class="best" href="#/album/' + t.album.i + '">' + trackCover(t, 'best-img') + '<b>' + esc(t.name) + '</b><span>Song • ' + esc(artistNames(t)) + '</span><button class="card-play" data-best-track="1" aria-label="Abspielen">' + ic('play') + '</button></a>'; }
        secs.push('<div class="top-results">' + (bestHtml ? '<section class="sec"><div class="sec-head"><h2>Bester Treffer</h2></div>' + bestHtml + '</section>' : '') +
          (r.tracks.length ? '<section class="sec grow"><div class="sec-head"><h2>Songs</h2></div><div class="tracks-slot" id="r-songs"></div><button class="link-btn" id="r-more">Alle ' + r.tracks.length + ' anzeigen</button></section>' : '') + '</div>');
      }
      if (r.artists.length) secs.push(section('Künstler', row(r.artists.map(artistCard))));
      if (r.albums.length) secs.push(section('Alben', row(r.albums.map(albumCard))));
      if (r.genres.length) secs.push(section('Genres', row(r.genres.map(genreCard))));
      $('#results').innerHTML = (secs.join('') || (sp.isLoggedIn() ? '' : '<div class="empty">Keine Treffer im Katalog für „' + esc(q) + '“</div>')) + '<div id="sp-results"></div>';
      spotifyResults(q, seq);
      const ctx = { kind: 'list', name: 'Suche „' + q + '“' };
      if (r.tracks.length) {
        let max = 5;
        mountTracks($('#r-songs'), r.tracks, { head: false, max, ctx, album: false });
        $('#r-more').addEventListener('click', e => { max = max === 5 ? 50 : 5; mountTracks($('#r-songs'), r.tracks, { head: false, max, ctx, album: false }); e.target.textContent = max === 5 ? 'Alle ' + r.tracks.length + ' anzeigen' : 'Weniger anzeigen'; });
        if (r.tracks.length <= 5) $('#r-more').remove();
      }
      const bt = $('[data-best-track]');
      if (bt) bt.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.playList(r.tracks, 0, ctx); });
      Covers.watch(viewEl);
      markNow();
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
    run();
    if (!coarse) input.focus();
  }

  // ---------- Verknüpftes Spotify-Konto ----------

  /** Bibliothek des verknüpften Spotify-Kontos (in IndexedDB zwischengespeichert, beim Start abgeglichen). */
  const SA = {
    me: null, playlists: [], liked: [], likedSet: new Set(), albums: [], artists: [], synced: 0, syncing: false,

    /** Verknüpft = angemeldet und mit Zugriff auf die Bibliothek (reine Such-Verbindungen aus 1.1.0 zählen nicht). */
    linked: () => sp.isLoggedIn() && sp.hasScope('user-library-read'),

    async load() {
      const keys = ['sp.me', 'sp.playlists', 'sp.liked', 'sp.albums', 'sp.artists', 'sp.synced'];
      const [me, playlists, liked, albums, artists, synced] = await Promise.all(keys.map(k => Store.get(k)));
      this.me = me || null;
      this.playlists = playlists || [];
      this.albums = albums || [];
      this.artists = artists || [];
      this.synced = synced || 0;
      this.setLiked(liked || []);
    },

    /** liked: [{id, t, m?}] – m sind die Angaben für Songs außerhalb des Datensatzes. */
    setLiked(list) {
      for (const x of list) if (x.m) Catalog.addExternal(x.m);
      this.liked = list;
      this.likedSet = new Set(list.map(x => x.id));
    },

    status(text) {
      $$('[data-spsync]').forEach(el => { el.innerHTML = text ? '<span class="spinner small"></span><span>' + esc(text) + '</span>' : ''; });
    },

    async sync(manual) {
      if (!this.linked() || this.syncing) return;
      this.syncing = true;
      this.status('Spotify-Bibliothek wird abgeglichen …');
      try {
        const me = await sp.me();
        this.me = { id: me.id, name: me.display_name || me.id, img: Spotify.norm.image(me.images, 64) };
        this.status('Playlists von Spotify …');
        this.playlists = await sp.myPlaylists();
        const liked = await sp.likedTracks((n, total) => this.status('Lieblingssongs von Spotify: ' + num(n) + ' von ' + num(total)));
        this.setLiked(liked.tracks.filter(t => t.id && !t.local).map(t => {
          const i = fromSpotify(t);
          const m = Catalog.externalMeta(i);
          return m ? { id: t.id, t: Date.parse(t.added) || Date.now(), m } : { id: t.id, t: Date.parse(t.added) || Date.now() };
        }));
        this.status('Alben und Künstler von Spotify …');
        const [albums, artists] = await Promise.all([sp.savedAlbums().catch(() => null), sp.followedArtists().catch(() => null)]);
        if (albums) this.albums = albums;
        if (artists) this.artists = artists;
        this.synced = Date.now();
        await Promise.all([Store.set('sp.me', this.me), Store.set('sp.playlists', this.playlists), Store.set('sp.liked', this.liked),
          Store.set('sp.albums', this.albums), Store.set('sp.artists', this.artists), Store.set('sp.synced', this.synced)]);
        S.mixesKey = '';
        renderLibLists();
        if (viewRefresh) viewRefresh('spotify');
        if (manual) toast('Spotify abgeglichen: ' + plural(this.playlists.length, 'Playlist', 'Playlists') + ', ' + plural(this.liked.length, 'Lieblingssong', 'Lieblingssongs'));
      } catch (e) {
        if (manual || !e.auth) toast(spExplain(e), 6000);
      } finally {
        this.syncing = false;
        this.status('');
      }
    },

    /** Herz in Klangwelt auch bei Spotify setzen bzw. entfernen. */
    saveLike(t, on) {
      if (on && !this.likedSet.has(t.id)) {
        const m = Catalog.externalMeta(t.i);
        this.liked.unshift(m ? { id: t.id, t: Date.now(), m } : { id: t.id, t: Date.now() });
      }
      if (!on) this.liked = this.liked.filter(x => x.id !== t.id);
      this.likedSet = new Set(this.liked.map(x => x.id));
      Store.set('sp.liked', this.liked);
      sp.setSaved([{ id: t.id, uri: t.uri }], on).catch(e => toast('Bei Spotify nicht gespeichert: ' + spExplain(e), 5000));
    },

    clear() {
      this.me = null; this.playlists = []; this.albums = []; this.artists = []; this.synced = 0;
      this.setLiked([]);
      for (const k of ['sp.me', 'sp.playlists', 'sp.liked', 'sp.albums', 'sp.artists', 'sp.synced']) Store.del(k);
      S.mixesKey = '';
      renderLibLists();
    },
  };

  function spotifyCard() {
    if (SA.linked()) {
      return '<section class="set-card"><h2>Spotify-Konto</h2><div class="acct">' + extCover(SA.me && SA.me.img, SA.me ? SA.me.name : 'Spotify', 'acct-img', true) +
        '<div><b>' + esc(SA.me ? SA.me.name : 'Verknüpft') + '</b><small>Verknüpft' + (SA.synced ? ' • abgeglichen ' + ago(SA.synced).toLowerCase() + ' um ' + new Date(SA.synced).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '') + '</small></div></div>' +
        '<div class="stats"><div><b>' + num(SA.playlists.length) + '</b><span>Spotify-Playlists</span></div><div><b>' + num(SA.liked.length) + '</b><span>Lieblingssongs bei Spotify</span></div>' +
        '<div><b>' + num(SA.albums.length) + '</b><span>Alben</span></div><div><b>' + num(SA.artists.length) + '</b><span>Künstler</span></div></div>' +
        '<p class="muted">Deine Spotify-Playlists, Lieblingssongs, Alben und Künstler erscheinen in deiner Bibliothek. Herzen in Klangwelt werden auch bei Spotify gespeichert. In der Suche findest du zusätzlich jeden Song auf Spotify.</p>' +
        '<div class="set-btns"><button class="btn btn-ghost" data-set="sp-sync">' + ic('radio') + 'Jetzt abgleichen</button><button class="btn btn-ghost" data-set="sp-off">Konto trennen</button></div></section>';
    }
    if (sp.isLoggedIn()) {
      return '<section class="set-card"><h2>Spotify-Konto</h2><p class="muted">Spotify ist nur für die Suche verbunden. Verknüpfe das Konto neu, damit Klangwelt auch deine Playlists, Lieblingssongs, Alben und Künstler lädt.</p>' +
        '<div class="set-btns"><button class="btn btn-ghost" data-act="sp-connect">Konto verknüpfen</button><button class="btn btn-ghost" data-set="sp-off">Trennen</button></div></section>';
    }
    return '<section class="set-card"><h2>Spotify-Konto</h2><p class="muted">Verknüpfe dein Spotify-Konto: Dann zeigt Klangwelt deine Playlists (eigene und gespeicherte von anderen), Lieblingssongs, Alben und Künstler, ' +
      'speichert Herzen auch bei Spotify und findet in der Suche jeden Song auf Spotify (über 100 Millionen).</p><div class="set-btns"><button class="btn btn-ghost" data-act="sp-connect">Spotify-Konto verknüpfen</button></div></section>';
  }

  async function spotifyPlaylistView(id, seq) {
    if (!SA.linked()) { needSpotify('Diese Playlist'); return; }
    let meta = SA.playlists.find(p => p.id === id) || null;
    let list = null;
    const own = () => !!(meta && SA.me && (meta.owner.id === SA.me.id || meta.collaborative));
    function header(sec) {
      if (!meta) return;
      setHero(hashColor('sp' + id, 32), meta.name);
      $('#spl-hero').innerHTML = heroHtml({ kind: (meta.collaborative ? 'Gemeinsame Playlist' : 'Playlist') + ' • Spotify', title: meta.name, desc: meta.desc, cover: extCover(meta.img, meta.name, 'himg'),
        by: '<b>' + esc(meta.owner.name) + '</b>' + (meta.total != null ? ' • ' + plural(meta.total, 'Song', 'Songs') : '') + (sec ? ', ' + longDur(sec) : '') + (own() ? '' : ' <span class="tag">In deiner Bibliothek gespeichert</span>') });
    }
    setHero(hashColor('sp' + id, 32), meta ? meta.name : '');
    viewEl.innerHTML = '<div class="page-bg"></div><div id="spl-hero"></div><div class="page">' +
      actionsHtml({ filter: 'Playlist', extra: '<button class="btn btn-ghost btn-small" data-act="copy-pl">' + ic('plus') + 'In Klangwelt kopieren</button>' }) + '<div id="list">' + loading('Songs werden von Spotify geladen …') + '</div></div>';
    header();
    const ctx = () => ({ kind: 'splaylist', id, name: meta ? meta.name : 'Playlist', href: '#/splaylist/' + id, img: meta ? meta.img : '' });
    bindActions(() => list, {
      href: '#/splaylist/' + id,
      menu: a => listMenu(a, () => (list ? list.order() : []), meta ? meta.name : 'Playlist', {
        html: '<div class="pop-sep"></div>' + item('spotify', 'external', 'In Spotify öffnen'),
        pick: k => { if (k === 'spotify') Platform.openSpotify('spotify:playlist:' + id, 'https://open.spotify.com/playlist/' + id); },
      }),
      on: k => {
        if (k !== 'copy-pl') return;
        if (!list) { toast('Die Songs dieser Playlist gibt Spotify nicht heraus – kopieren geht nur bei eigenen Playlists'); return; }
        const ids = list.order();
        ids.forEach(keep);
        const p = Lib.createPlaylist(meta.name, ids.map(i => T(i).id));
        toast('Als Klangwelt-Playlist „' + p.name + '“ gespeichert');
      },
    });
    try {
      const r = await sp.getPlaylist(id);
      if (!alive(seq)) return;
      meta = r.meta;
      header();
      let entries;
      const cached = await Store.get('sp.pl:' + id);
      if (cached && cached.snapshot && cached.snapshot === meta.snapshot) {
        entries = cached.entries;
        for (const x of entries) if (x.m) Catalog.addExternal(x.m);
      } else {
        const tracks = await sp.playlistTracks(id, (n, total) => { if (alive(seq) && $('#list') && !list) $('#list').innerHTML = loading('Songs werden von Spotify geladen … ' + num(n) + ' von ' + num(total)); });
        entries = tracks.filter(t => t.id && !t.local && !t.episode).map(t => {
          const i = fromSpotify(t);
          const m = Catalog.externalMeta(i);
          return m ? { id: t.id, t: Date.parse(t.added) || 0, m } : { id: t.id, t: Date.parse(t.added) || 0 };
        });
        Store.set('sp.pl:' + id, { snapshot: meta.snapshot, entries });
      }
      if (!alive(seq)) return;
      const idxs = entries.map(x => Catalog.indexOf(x.id));
      header(idxs.reduce((x, i) => x + T(i).sec, 0));
      list = mountTracks($('#list'), idxs, { added: entries.map(x => x.t), ctx: ctx(), empty: 'Diese Playlist ist leer.' });
      const q = $('[data-trackq]');
      if (q && q.value) list.filter(q.value);
    } catch (e) {
      if (!alive(seq)) return;
      if (e.status === 403 || e.status === 404) {
        // Playlists anderer Leute: Songliste gibt Spotify seit Februar 2026 nicht heraus – offizieller Spotify-Player
        const q = $('[data-trackq]');
        if (q) q.closest('.mini-search').remove();
        $('#list').innerHTML = '<div class="notice">' + ic('info') + '<div><b>Songliste direkt von Spotify</b><br>Die Songs von Playlists anderer Leute gibt Spotify seit Februar 2026 nicht mehr an solche Apps heraus. Unten siehst und hörst du die Playlist im offiziellen Spotify-Player.</div></div>' +
          '<iframe class="embed" src="https://open.spotify.com/embed/playlist/' + encodeURIComponent(id) + '?utm_source=generator&amp;theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify-Playlist"></iframe>';
      } else {
        $('#list').innerHTML = '<div class="empty">' + esc(spExplain(e)) + '</div>';
      }
    }
  }

  // ---------- Spotify-Suche (ganzer Spotify-Katalog, optional) ----------

  let spToken = 0;

  /** Ergebnisse von Spotify unter den Katalog-Treffern; ohne Verbindung ein Hinweis zum Verbinden. */
  async function spotifyResults(q, seq) {
    const box = $('#sp-results');
    if (!box) return;
    if (!sp.isLoggedIn()) {
      box.innerHTML = '<div class="sp-promo">' + ic('search') + '<div><b>Nicht dabei, was du suchst?</b><span>Verknüpfe dein Spotify-Konto, dann durchsucht Klangwelt den ganzen Spotify-Katalog – über 100 Millionen Songs – und zeigt deine Spotify-Playlists und Lieblingssongs.</span></div>' +
        '<button class="btn btn-white btn-small" data-act="sp-connect">Spotify-Konto verknüpfen</button></div>';
      return;
    }
    const my = ++spToken;
    box.innerHTML = section('Auf Spotify', loading('Suche bei Spotify …'));
    await new Promise(r => setTimeout(r, 250));
    if (my !== spToken || !alive(seq)) return;
    let r;
    try { r = await sp.search(q, ['track', 'artist', 'album']); } catch (e) {
      if (my === spToken && alive(seq) && $('#sp-results')) $('#sp-results').innerHTML = section('Auf Spotify', '<div class="empty">' + esc(spExplain(e)) + '</div>');
      return;
    }
    if (my !== spToken || !alive(seq) || !$('#sp-results')) return;
    const tracks = r.tracks.map(t => fromSpotify(t));
    const secs = [];
    if (tracks.length) secs.push(section('Songs auf Spotify', '<div class="tracks-slot" id="sp-songs"></div>' + (r.totals.tracks > tracks.length ? '<button class="link-btn" id="sp-more">Mehr laden</button>' : '')));
    if (r.artists.length) secs.push(section('Künstler auf Spotify', row(r.artists.map(spArtistCard))));
    if (r.albums.length) secs.push(section('Alben auf Spotify', row(r.albums.map(spAlbumCard))));
    $('#sp-results').innerHTML = secs.join('') || '<div class="empty">Auch bei Spotify nichts gefunden.</div>';
    if (!tracks.length) return;
    const ctx = { kind: 'list', name: 'Spotify: „' + q + '“' };
    const list = tracks.slice();
    const show = () => mountTracks($('#sp-songs'), list, { head: false, max: list.length, ctx });
    show();
    const more = $('#sp-more');
    if (more) {
      more.addEventListener('click', async () => {
        more.disabled = true;
        try {
          const next = await sp.search(q, ['track'], list.length);
          for (const t of next.tracks) { const i = fromSpotify(t); if (!list.includes(i)) list.push(i); }
          show();
          if (!next.tracks.length || list.length >= next.totals.tracks || list.length >= 200) more.remove();
        } catch (e) { toast(spExplain(e), 5000); }
        more.disabled = false;
      });
    }
    markNow();
  }

  const spArtistCard = a => cardHtml({ href: '#/sartist/' + a.id, cover: extCover(a.img, a.name, 'cimg', true), title: a.name, sub: 'Künstler • Spotify', round: true });
  const spAlbumCard = a => cardHtml({ href: '#/salbum/' + a.id, cover: extCover(a.img, a.name, 'cimg'), title: a.name, sub: (a.year ? a.year + ' • ' : '') + a.artists.map(x => x.name).join(', ') });

  function spExplain(e) {
    const msg = String(e && e.message || e || '');
    if (/premium subscription required/i.test(msg)) return 'Spotify verlangt, dass der Besitzer der Entwickler-App (die mit dieser Client-ID) Spotify Premium hat.';
    if (/not be registered|not registered/i.test(msg)) return 'Dein Spotify-Konto ist in der Entwickler-App nicht eingetragen: im Spotify-Dashboard unter „User Management“ Name und E-Mail deines Kontos hinzufügen.';
    if (e && (e.reason === 'invalid_client' || /invalid client/i.test(msg))) return 'Spotify kennt diese Client-ID nicht. Bitte im Spotify-Dashboard unter „Settings“ noch einmal kopieren.';
    if (/redirect/i.test(msg)) return 'In der Spotify-App fehlen die Redirect-URIs: ' + Platform.redirectUris.join(' und ');
    if (e && e.status === 0) return 'Spotify ist gerade nicht erreichbar. Prüfe die Internetverbindung.';
    if (e && e.status === 429) return 'Spotify bremst gerade. Versuch es gleich noch einmal.';
    if (e && e.auth && !sp.isLoggedIn()) return 'Die Verbindung zu Spotify ist abgelaufen – bitte das Konto neu verknüpfen.';
    return msg || 'Spotify meldet einen Fehler.';
  }

  /** Dialog: eigene Spotify-Entwickler-App eintragen und das Konto verknüpfen. */
  function connectSpotify() {
    const m = modal({
      title: 'Spotify-Konto verknüpfen',
      html: '<p>Danach zeigt Klangwelt <b>deine Spotify-Playlists</b> (eigene und gespeicherte von anderen), <b>Lieblingssongs</b>, Alben und Künstler, speichert Herzen auch bei Spotify und findet in der Suche <b>jeden Song auf Spotify</b>. Dafür braucht Klangwelt einmalig eine eigene, kostenlose Spotify-Entwickler-App:</p><ol class="steps-ol">' +
        '<li>Auf <a href="#" data-ext="https://developer.spotify.com/dashboard">developer.spotify.com/dashboard</a> <b>Create app</b> wählen (oder die App von Klangraum nehmen).</li>' +
        '<li>Bei <b>Redirect URIs</b> eintragen:' + Platform.redirectUris.map(u => '<div class="copyrow"><code>' + esc(u) + '</code><button class="btn btn-small" data-copy="' + esc(u) + '" aria-label="Kopieren">' + ic('copy') + '</button></div>').join('') + '</li>' +
        '<li><b>Web API</b> ankreuzen, speichern, unter <b>Settings</b> die <b>Client ID</b> kopieren.</li></ol>' +
        '<p class="muted small">Premium braucht nur der Besitzer der Entwickler-App; dein eigenes Konto darf kostenlos sein (dann im Dashboard unter „User Management“ eintragen).</p>' +
        '<label class="field"><span>Client ID</span><input id="sp-cid" value="' + esc(sp.clientId) + '" placeholder="32 Zeichen" autocomplete="off" autocapitalize="off" spellcheck="false"></label><div id="sp-status" class="error-text"></div>',
      actions: [{ label: 'Abbrechen', value: null, onClick: () => { Platform.cancelLogin(); } }, {
        label: 'Konto verknüpfen', primary: true, onClick: w => {
          const id = $('#sp-cid', w).value.replace(/\s+/g, '');
          const status = $('#sp-status', w);
          if (!/^[0-9a-f]{32}$/i.test(id)) { status.textContent = 'Die Client-ID hat 32 Zeichen (Ziffern und a–f).'; return false; }
          sp.setClientId(id);
          status.classList.remove('error-text');
          status.innerHTML = '<span class="wait"><span class="spinner small"></span>Spotify hat sich im Browser geöffnet. Melde dich an und tippe auf „Zustimmen“ …</span>';
          sp.login().then(() => {
            m.close(true);
            toast('Spotify-Konto verknüpft – deine Bibliothek wird geladen');
            route();
            SA.sync(true);
          }, e => {
            status.classList.add('error-text');
            status.textContent = e.message === 'Abgebrochen' ? '' : spExplain(e);
          });
          return false;
        },
      }],
    });
    m.el.addEventListener('click', e => {
      const c = e.target.closest('[data-copy]');
      if (c) Platform.copy(c.dataset.copy).then(() => toast('Kopiert'), () => toast(c.dataset.copy));
      const x = e.target.closest('[data-ext]');
      if (x) { e.preventDefault(); Platform.openExternal(x.dataset.ext); }
    });
  }

  function needSpotify(what) {
    viewEl.innerHTML = '<div class="page"><div class="sp-promo">' + ic('search') + '<div><b>' + esc(what) + ' kommt von Spotify</b><span>Verknüpfe dein Spotify-Konto, um das hier zu sehen.</span></div><button class="btn btn-white btn-small" data-act="sp-connect">Spotify-Konto verknüpfen</button></div></div>';
  }

  async function spotifyAlbumView(sid, seq) {
    if (!sp.isLoggedIn()) { needSpotify('Dieses Album'); return; }
    setHero(hashColor('x' + sid, 32), '');
    viewEl.innerHTML = '<div class="page">' + loading('Album wird von Spotify geladen …') + '</div>';
    let r;
    try { r = await sp.getAlbum(sid); } catch (e) {
      if (alive(seq)) viewEl.innerHTML = '<div class="page"><div class="empty">' + esc(spExplain(e)) + '</div></div>';
      return;
    }
    if (!alive(seq)) return;
    const a = r.meta;
    const tracks = r.tracks.map(t => fromSpotify(t, a.img));
    const sec = tracks.reduce((x, i) => x + T(i).sec, 0);
    const artist = a.artists[0] || { name: '' };
    const saved = () => Lib.isAlbumSaved(a.name, artist.name);
    setHero(hashColor('x' + sid, 32), a.name);
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: (a.type === 'single' ? 'Single' : 'Album') + ' • Spotify', title: a.name, cover: extCover(a.img, a.name, 'himg'),
      by: a.artists.map(x => '<a class="b" href="#/sartist/' + esc(x.id) + '">' + esc(x.name) + '</a>').join(', ') + (a.year ? ' • ' + a.year : '') + ' • ' + plural(tracks.length, 'Song', 'Songs') + ', ' + longDur(sec) }) +
      '<div class="page">' + actionsHtml({ extra: '<button class="icon-btn big save' + (saved() ? ' on' : '') + '" data-act="save-album" title="In der Bibliothek speichern">' + ic(saved() ? 'check' : 'plusCircle') + '</button>' }) + '<div id="list"></div>' +
      (a.copyright ? '<p class="copyright">' + esc(a.copyright) + '</p>' : '') + '</div>';
    const ctx = { kind: 'salbum', id: sid, name: a.name, href: '#/salbum/' + sid, img: a.img };
    const list = mountTracks($('#list'), tracks, { album: false, ctx });
    bindActions(() => list, {
      href: ctx.href,
      menu: el => listMenu(el, () => list.order(), a.name),
      on: (k, el) => {
        if (k !== 'save-album') return;
        const on = Lib.toggleAlbum(a.name, artist.name, { sid, img: a.img });
        el.classList.toggle('on', on);
        el.innerHTML = ic(on ? 'check' : 'plusCircle');
        toast(on ? 'In deiner Bibliothek gespeichert' : 'Aus deiner Bibliothek entfernt');
      },
    });
  }

  async function spotifyArtistView(sid, seq) {
    if (!sp.isLoggedIn()) { needSpotify('Dieser Künstler'); return; }
    setHero(hashColor('x' + sid, 34), '');
    viewEl.innerHTML = '<div class="page">' + loading('Künstler wird von Spotify geladen …') + '</div>';
    let a;
    try { a = await sp.getArtist(sid); } catch (e) {
      if (alive(seq)) viewEl.innerHTML = '<div class="page"><div class="empty">' + esc(spExplain(e)) + '</div></div>';
      return;
    }
    if (!alive(seq)) return;
    const local = Catalog.artistIndex(a.name);
    const q = 'artist:"' + a.name.replace(/"/g, '') + '"';
    const [songs, albums] = await Promise.all([
      sp.search(q, ['track']).then(r => r.tracks.filter(t => t.artists.some(x => x.id === sid))).catch(() => []),
      sp.artistAlbums(sid).catch(() => sp.search(q, ['album']).then(r => r.albums.filter(x => x.artists.some(y => y.id === sid))).catch(() => [])),
    ]);
    if (!alive(seq)) return;
    const tracks = songs.map(t => fromSpotify(t));
    if (local >= 0) for (const i of Catalog.artistTracks(local).slice(0, 20)) if (!tracks.includes(i)) tracks.push(i);
    const following = () => Lib.isFollowing(a.name);
    setHero(hashColor('x' + sid, 34), a.name);
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Künstler • Spotify', title: a.name, round: true, cover: extCover(a.img, a.name, 'himg', true),
      by: esc(a.genres.slice(0, 3).join(', ')) + (local >= 0 ? (a.genres.length ? ' • ' : '') + '<a class="b" href="#/artist/' + local + '">' + plural(Catalog.artistTracks(local).length, 'Song', 'Songs') + ' im Katalog</a>' : '') }) +
      '<div class="page">' + actionsHtml({ extra: '<button class="btn btn-ghost btn-small follow' + (following() ? ' on' : '') + '" data-act="follow">' + (following() ? 'Gefolgt' : 'Folgen') + '</button>' +
        (local >= 0 ? '<button class="btn btn-ghost btn-small" data-act="artist-radio">' + ic('radio') + 'Radio</button>' : '') }) +
      section('Songs', tracks.length ? '<div class="tracks-slot" id="sa-songs"></div>' : '<p class="muted">Keine Songs gefunden.</p>') +
      (albums.length ? section('Alben und Singles', row(albums.map(spAlbumCard))) : '') + '</div>';
    const ctx = { kind: 'sartist', id: sid, name: a.name, href: '#/sartist/' + sid, img: a.img };
    let list = null;
    if (tracks.length) list = mountTracks($('#sa-songs'), tracks, { head: false, max: 50, ctx });
    bindActions(() => list, {
      href: ctx.href,
      menu: el => listMenu(el, () => (list ? list.order() : []), a.name),
      on: (k, el) => {
        if (k === 'follow') {
          const on = Lib.toggleArtist(a.name, { sid, img: a.img });
          el.classList.toggle('on', on);
          el.textContent = on ? 'Gefolgt' : 'Folgen';
        }
        if (k === 'artist-radio') startRadio(Catalog.artistTracks(local).slice(0, 8), 'Radio: ' + a.name);
      },
    });
  }

  function queueView() {
    setHero('#222', 'Warteschlange');
    function render() {
      viewEl.innerHTML = '<div class="page"><h1 class="page-title">Warteschlange</h1><div id="q-now"></div><div id="q-next"></div><div id="q-ctx"></div>' +
        '<p class="muted small" id="q-auto"></p></div>';
      if (Player.current < 0) { $('#q-now').innerHTML = '<div class="empty">Gerade läuft nichts. Such dir einen Song aus!</div>'; return; }
      $('#q-now').innerHTML = section('Läuft gerade', '<div class="tracks-slot" id="q1"></div>');
      mountTracks($('#q1'), [Player.current], { head: false, max: 1, ctx: Player.ctx });
      if (Player.upNext.length) {
        $('#q-next').innerHTML = section('Als Nächstes in der Warteschlange', '<div class="tracks-slot" id="q2"></div><button class="link-btn" id="q-clear">Warteschlange leeren</button>');
        mountTracks($('#q2'), Player.upNext.slice(), { head: false, max: 100, ctx: { kind: 'list', name: 'Warteschlange' } });
        $('#q-clear').addEventListener('click', () => { Player.upNext = []; render(); });
      }
      const rest = Player.order.slice(Player.pos + 1, Player.pos + 51);
      if (rest.length) {
        $('#q-ctx').innerHTML = section('Als Nächstes aus: ' + (Player.ctx ? Player.ctx.name : ''), '<div class="tracks-slot" id="q3"></div>');
        const box = $('#q3');
        mountTracks(box, rest, { head: false, max: 50, ctx: Player.ctx });
        // Tippen springt in der Warteschlange dorthin, statt eine neue Liste zu starten
        box.addEventListener('click', e => {
          const r = e.target.closest('.trow');
          if (!r || e.target.closest('a, [data-act="like"], [data-act="menu"]')) return;
          if (!(coarse || e.target.closest('[data-act="play"]'))) return;
          e.stopImmediatePropagation();
          Player.jump(Player.pos + 1 + Number(r.dataset.pos));
        }, true);
      }
      $('#q-auto').textContent = Lib.setting('autoplay') ? 'Endlos-Wiedergabe ist an: Wenn die Liste zu Ende ist, geht es mit passenden Songs weiter.' : 'Endlos-Wiedergabe ist aus (Einstellungen).';
      Covers.watch(viewEl);
      markNow();
    }
    render();
    viewRefresh = what => { if (what === 'queue') render(); };
  }

  function settingsView() {
    setHero('#262626', 'Einstellungen');
    function render() {
      const own = Lib.playlists().length;
      const desktop = Platform.kind !== 'android';
      viewEl.innerHTML = '<div class="page settings"><h1 class="page-title">Einstellungen</h1>' +
        '<section class="set-card"><h2>Wiedergabe</h2>' +
        toggle('autoplay', 'Endlos-Wiedergabe', 'Wenn eine Playlist, ein Album oder die Warteschlange zu Ende ist, spielt Klangwelt passende Songs weiter.', Lib.setting('autoplay')) +
        '<p class="muted">Klangwelt spielt über den offiziellen Spotify-Player die <b>30-Sekunden-Vorschau</b> jedes Songs – ohne Werbung, ohne Anmeldung, mit unbegrenztem Überspringen. ' +
        'Ganze Songs gibt es nur in Spotify selbst: Tippe dafür im Player auf ' + ic('external') + ' „Ganzer Song“.</p>' +
        '<div class="set-btns"><button class="btn btn-ghost" data-set="sleep">' + ic('moon') + (Player.sleepAt ? 'Sleep-Timer: ' + new Date(Player.sleepAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Sleep-Timer') + '</button>' +
        (desktop ? '' : '') + '</div></section>' +
        spotifyCard() +
        '<section class="set-card"><h2>Deine Bibliothek</h2><div class="stats">' +
        '<div><b>' + num(likedEntries().length) + '</b><span>Lieblingssongs</span></div><div><b>' + num(own) + '</b><span>Playlists</span></div>' +
        '<div><b>' + num(Lib.albums().length) + '</b><span>Alben</span></div><div><b>' + num(Lib.artists().length) + '</b><span>Künstler</span></div></div>' +
        '<p class="muted">Deine Bibliothek ist nur auf diesem Gerät gespeichert. Mit einem Code nimmst du sie auf ein anderes Gerät mit (z. B. vom PC aufs Handy).</p>' +
        '<div class="set-btns"><button class="btn btn-ghost" data-set="export">' + ic('copy') + 'Code kopieren</button><button class="btn btn-ghost" data-set="import">Code einfügen</button></div></section>' +
        '<section class="set-card"><h2>Über Klangwelt</h2><p class="muted">Version ' + esc(Platform.version) + ' (' + esc({ desktop: 'Windows-App', android: 'Android-App', web: 'Browser' }[Platform.kind]) + ') • ' + num(Catalog.count) + ' Songs im Katalog.<br>' +
        'Songdaten: „Spotify Tracks Dataset“ von Maharshi Pandya (Hugging Face/Kaggle), gesammelt über die Spotify Web API. Vorschauen und Cover kommen direkt von Spotify. Klangwelt ist kein offizielles Spotify-Produkt.</p>' +
        '<div class="set-btns"><button class="btn btn-ghost" data-set="reset">' + ic('trash') + 'Bibliothek zurücksetzen</button></div></section></div>';
    }
    function toggle(k, title, text, on) {
      return '<label class="switch-row"><span><b>' + esc(title) + '</b><small>' + esc(text) + '</small></span><input type="checkbox" data-toggle="' + k + '"' + (on ? ' checked' : '') + '><i class="switch"></i></label>';
    }
    render();
    const page = viewEl;
    page.onchange = e => { const t = e.target.closest('[data-toggle]'); if (t) Lib.set(t.dataset.toggle, t.checked); };
    page.onclick = e => {
      const b = e.target.closest('[data-set]');
      if (!b) return;
      const k = b.dataset.set;
      if (k === 'sleep') sleepMenu(b);
      if (k === 'export') {
        const code = Lib.exportCode();
        Platform.copy(code).then(() => toast('Code kopiert – auf dem anderen Gerät unter „Code einfügen“ einfügen'), () => {
          modal({ title: 'Dein Bibliotheks-Code', html: '<textarea class="code" readonly rows="6">' + esc(code) + '</textarea>' });
        });
      }
      if (k === 'import') {
        modal({
          title: 'Code einfügen',
          html: '<p>Füge den Code von deinem anderen Gerät ein.</p><textarea id="imp" class="code" rows="6" placeholder="KW1.…"></textarea>' +
            '<label class="check"><input type="checkbox" id="imp-merge" checked> Mit der Bibliothek hier zusammenführen (sonst ersetzen)</label><div id="imp-err" class="error-text"></div>',
          actions: [{ label: 'Abbrechen', value: null }, {
            label: 'Übernehmen', primary: true, onClick: w => {
              try {
                const r = Lib.importCode($('#imp', w).value, $('#imp-merge', w).checked);
                toast(plural(r.liked, 'Lieblingssong', 'Lieblingssongs') + ' und ' + plural(r.playlists, 'Playlist', 'Playlists') + ' übernommen');
              } catch (err) { $('#imp-err', w).textContent = err.message; return false; }
            },
          }],
        });
      }
      if (k === 'sp-off') { sp.logout(); SA.clear(); toast('Spotify-Konto getrennt'); render(); }
      if (k === 'sp-sync') SA.sync(true).then(render);
      if (k === 'reset') modal({ title: 'Bibliothek zurücksetzen?', html: '<p>Alle Lieblingssongs, Playlists, Alben und Künstler auf diesem Gerät werden gelöscht.</p>', actions: [{ label: 'Abbrechen', value: null }, { label: 'Zurücksetzen', danger: true, onClick: () => { Lib.reset(); toast('Bibliothek zurückgesetzt'); } }] });
    };
    viewRefresh = what => { if (what !== 'recent') render(); };
  }

  function sleepMenu(anchor) {
    popup(anchor, '<div class="pop-title">Sleep-Timer<small>Wiedergabe stoppt automatisch</small></div>' +
      ['15', '30', '45', '60', '90'].map(m => item(m, 'moon', m + ' Minuten')).join('') + item('end', 'moon', 'Am Ende des Songs') +
      (Player.sleepAt || Player.sleepEnd ? '<div class="pop-sep"></div>' + item('off', 'close', 'Timer ausschalten') : ''), k => {
      Player.setSleep(k === 'off' ? 0 : k === 'end' ? -1 : Number(k));
      if (viewRefresh) viewRefresh('settings');
    });
  }

  // ---------- Player ----------

  const Player = {
    base: [],      // Reihenfolge der Quelle
    order: [],     // Abspielreihenfolge (gemischt oder wie base)
    pos: -1,
    upNext: [],    // "Als Nächstes"/Warteschlange
    ctx: null,
    current: -1,
    fromQueue: false,
    playing: false,
    position: 0,
    duration: 0,
    at: 0,
    shuffle: local('kw.shuffle') === '1',
    repeat: local('kw.repeat') || 'off',
    history: [],
    skips: 0,
    sleepAt: 0,
    sleepEnd: false,
    sleepTimer: null,
    status: '',

    playList(list, start, ctx, opts) {
      opts = opts || {};
      if (!list.length) return;
      if (opts.shuffle !== undefined && opts.shuffle !== this.shuffle) this.setShuffle(opts.shuffle, true);
      this.base = list.slice();
      const first = list[Math.max(0, Math.min(start || 0, list.length - 1))];
      this.order = this.shuffle ? [first].concat(Catalog.shuffled(list.filter((x, k) => k !== list.indexOf(first)), Catalog.rng(Date.now()))) : this.base.slice();
      this.pos = this.order.indexOf(first);
      this.ctx = ctx;
      if (ctx && ctx.href && ctx.id !== 'radio') Lib.addRecent({ kind: ctx.kind, id: ctx.id || ctx.kind, name: ctx.name, href: ctx.href, play: playKey(ctx), img: ctx.img || '' });
      this.start(first);
    },

    start(i) {
      this.current = i;
      this.history.push(i);
      if (this.history.length > 200) this.history.splice(0, 50);
      this.position = 0;
      this.duration = 30000;
      this.at = Date.now();
      this.playing = true;
      this.status = '';
      Preview.load(T(i).uri, true);
      this.save();
      renderPlayer();
      markNow();
      if (viewRefresh) viewRefresh('queue');
    },

    jump(p) {
      if (p < 0 || p >= this.order.length) return;
      this.pos = p;
      this.start(this.order[p]);
    },

    next(auto) {
      if (this.sleepEnd === true && auto) { this.stopForSleep(); return; }
      if (auto && this.repeat === 'one' && this.current >= 0) { this.start(this.current); return; }
      if (this.upNext.length) { this.start(this.upNext.shift()); return; }
      if (this.pos + 1 < this.order.length) { this.pos++; this.start(this.order[this.pos]); return; }
      if (this.repeat === 'all' && this.order.length) { this.pos = 0; this.start(this.order[0]); return; }
      if (Lib.setting('autoplay') && this.current >= 0) {
        // Endlos-Wiedergabe: passende Songs zu den zuletzt gehörten anhängen
        const seeds = [...new Set(this.history.slice(-8))].slice(-5);
        let more = Catalog.similar(seeds, 25, { exclude: this.history.slice(-300), seed: Date.now(), jitter: 0.1 });
        // Nur Spotify-Songs gehört: über deren Künstler im Katalog, sonst die Charts
        if (!more.length) more = Catalog.radio(seeds.slice(-1), 26).slice(1);
        if (!more.length) more = Catalog.shuffled(Catalog.top(200).filter(i => !this.history.includes(i)), Catalog.rng(Date.now())).slice(0, 25);
        if (more.length) {
          this.base = this.base.concat(more);
          this.order = this.order.concat(more);
          this.pos++;
          if (auto) toast('Endlos-Wiedergabe: passende Songs laufen weiter');
          this.start(this.order[this.pos]);
          return;
        }
      }
      Preview.pause();
      this.playing = false;
      renderPlayer();
    },

    prev() {
      if (this.current < 0) return;
      if (this.pos2() > 3000 || this.pos <= 0) { this.seek(0); return; }
      this.pos--;
      this.start(this.order[this.pos]);
    },

    pos2() { return this.playing ? Math.min(this.duration, this.position + (Date.now() - this.at)) : this.position; },

    toggle() {
      if (this.current < 0) {
        const liked = likedIdx();
        if (liked.length) this.playList(liked, 0, { kind: 'liked', name: 'Lieblingssongs', href: '#/liked' });
        else this.playList(Catalog.top(50), 0, { kind: 'mix', id: 'top', name: 'Top 50', href: '#/mix/top' });
        return;
      }
      if (this.playing) { this.position = this.pos2(); this.playing = false; Preview.pause(); }
      else if (Preview.state.uri !== T(this.current).uri) { this.start(this.current); return; }
      else { this.at = Date.now(); this.playing = true; Preview.play(); }
      renderPlayer();
      markNow();
    },

    seek(ms) {
      this.position = Math.max(0, Math.min(ms, this.duration));
      this.at = Date.now();
      Preview.seek(this.position / 1000);
      renderPlayer();
    },

    setShuffle(on, silent) {
      this.shuffle = !!on;
      local('kw.shuffle', on ? '1' : '0');
      if (this.current >= 0 && this.base.length) {
        if (on) {
          const rest = this.base.filter(i => i !== this.current);
          this.order = [this.current].concat(Catalog.shuffled(rest, Catalog.rng(Date.now())));
          this.pos = 0;
        } else {
          this.order = this.base.slice();
          this.pos = Math.max(0, this.order.indexOf(this.current));
        }
      }
      if (!silent) { renderPlayer(); if (viewRefresh) viewRefresh('queue'); }
    },

    cycleRepeat() {
      this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat] || 'off';
      local('kw.repeat', this.repeat);
      renderPlayer();
      toast({ off: 'Wiederholen aus', all: 'Alle wiederholen', one: 'Diesen Song wiederholen' }[this.repeat]);
    },

    addNext(i) { this.upNext.unshift(i); if (this.current < 0) this.next(); if (viewRefresh) viewRefresh('queue'); },
    addQueue(i) { this.upNext.push(i); if (this.current < 0) this.next(); if (viewRefresh) viewRefresh('queue'); },

    setSleep(min) {
      clearTimeout(this.sleepTimer);
      this.sleepAt = 0;
      this.sleepEnd = false;
      if (min > 0) {
        this.sleepAt = Date.now() + min * 60000;
        this.sleepTimer = setTimeout(() => this.stopForSleep(), min * 60000);
        toast('Sleep-Timer: Stopp in ' + min + ' Minuten');
      } else if (min === -1) {
        this.sleepEnd = true;
        toast('Sleep-Timer: Stopp am Ende des Songs');
      } else toast('Sleep-Timer aus');
      renderPlayer();
    },

    stopForSleep() {
      this.sleepAt = 0;
      this.sleepEnd = false;
      if (this.playing) this.toggle();
      toast('Sleep-Timer: Wiedergabe gestoppt');
    },

    action(a, el) {
      if (a === 'toggle') this.toggle();
      if (a === 'next') this.next(false);
      if (a === 'prev') this.prev();
      if (a === 'shuffle') { this.setShuffle(!this.shuffle); toast(this.shuffle ? 'Zufallswiedergabe an' : 'Zufallswiedergabe aus'); }
      if (a === 'repeat') this.cycleRepeat();
      if (a === 'like-current' && this.current >= 0) toggleLike(T(this.current));
      if (a === 'full-song' && this.current >= 0) openFullSong(T(this.current));
      if (a === 'queue') { if (location.hash === '#/queue') history.back(); else location.hash = '#/queue'; }
      if (a === 'panel') togglePanel();
      if (a === 'sleep') sleepMenu(el);
      if (a === 'np-menu' && this.current >= 0) trackMenu(el, T(this.current), null);
      if (a === 'full') openFull();
      if (a === 'close-full') closeFull();
      if (a === 'np-artist' && this.current >= 0 && T(this.current).artists[0].href) { closeFull(); location.hash = T(this.current).artists[0].href; }
      if (a === 'np-context' && this.ctx && this.ctx.href) { closeFull(); location.hash = this.ctx.href; }
    },

    save() {
      try {
        const base = this.base.slice(0, 500), up = this.upNext.slice(0, 100);
        const ext = base.concat(up, [this.current]).map(i => Catalog.externalMeta(i)).filter(Boolean);
        localStorage.setItem('kw.player', JSON.stringify({
          ctx: this.ctx, base: base.map(i => T(i).id), cur: T(this.current).id,
          up: up.map(i => T(i).id), ext,
        }));
      } catch (e) { /* egal */ }
    },

    /** Nach dem Start: letzten Song wieder anzeigen (nicht automatisch abspielen). */
    restore() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem('kw.player') || 'null'); } catch (e) { d = null; }
      if (!d || !d.cur) { renderPlayer(); return; }
      (d.ext || []).forEach(m => Catalog.addExternal(m));
      const toIdx = ids => (ids || []).map(id => Catalog.indexOf(id)).filter(i => i >= 0);
      const cur = Catalog.indexOf(d.cur);
      if (cur < 0) { renderPlayer(); return; }
      this.base = toIdx(d.base);
      if (!this.base.includes(cur)) this.base.unshift(cur);
      this.order = this.base.slice();
      this.pos = this.order.indexOf(cur);
      this.upNext = toIdx(d.up);
      this.ctx = d.ctx;
      this.current = cur;
      this.playing = false;
      this.position = 0;
      this.duration = 30000;
      renderPlayer();
      markNow();
    },
  };

  function playKey(ctx) {
    if (ctx.kind === 'liked') return 'liked';
    if (ctx.kind === 'playlist') return 'playlist:' + ctx.id;
    if (ctx.kind === 'mix') return 'mix:' + ctx.id;
    if (ctx.kind === 'album') return 'album:' + ctx.id;
    if (ctx.kind === 'artist') return 'artist:' + ctx.id;
    if (ctx.kind === 'genre') return 'genre:' + Catalog.genreIndex(ctx.id);
    return '';
  }

  Preview.on('update', s => {
    if (Player.current < 0 || s.uri !== T(Player.current).uri) return;
    if (s.duration) Player.duration = s.duration;
    Player.position = s.position;
    Player.at = Date.now();
    const playing = !s.paused;
    if (playing) { Player.skips = 0; Player.status = ''; }
    if (playing !== Player.playing && (playing || s.position > 0)) Player.playing = playing;
    renderPlayer();
    markNow();
  });
  Preview.on('ended', () => Player.next(true));
  Preview.on('error', e => {
    if (e.kind === 'offline') {
      Player.playing = false;
      Player.status = 'Keine Verbindung zum Spotify-Player – Internet prüfen';
      toast(Player.status, 4000);
      renderPlayer();
      return;
    }
    // Für manche Songs gibt es keine Vorschau: weiter zum nächsten (höchstens 5 am Stück)
    Player.skips++;
    if (Player.skips > 5) {
      Player.playing = false;
      Player.status = 'Für diese Songs gibt es keine Vorschau';
      toast(Player.status, 4000);
      renderPlayer();
      return;
    }
    toast('Keine Vorschau für „' + T(Player.current).name + '“ – nächster Song');
    Player.next(true);
  });

  // Player-Leiste, Vollbild-Player und "Jetzt läuft"-Bereich
  function buildPlayer() {
    $('#player').innerHTML =
      '<div class="np"><div class="np-cover" data-act="full"></div><div class="np-meta" data-act="full"><div class="np-t"></div><div class="np-a"></div></div>' +
      '<button class="icon-btn np-like" data-act="like-current" aria-label="Lieblingssong"></button></div>' +
      '<div class="ctl"><div class="ctl-btns">' +
      '<button class="icon-btn" data-act="shuffle" aria-label="Zufallswiedergabe">' + ic('shuffle') + '</button>' +
      '<button class="icon-btn" data-act="prev" aria-label="Zurück">' + ic('prev') + '</button>' +
      '<button class="pp" data-act="toggle" aria-label="Abspielen/Pause"></button>' +
      '<button class="icon-btn" data-act="next" aria-label="Weiter">' + ic('next') + '</button>' +
      '<button class="icon-btn" data-act="repeat" aria-label="Wiederholen"></button></div>' +
      '<div class="ctl-bar"><span class="t-cur">0:00</span><input type="range" class="range seek" min="0" max="1000" value="0" aria-label="Position"><span class="t-dur">0:30</span></div></div>' +
      '<div class="extra"><span class="badge" title="Klangwelt spielt 30-Sekunden-Vorschauen">Vorschau</span>' +
      '<button class="icon-btn" data-act="full-song" title="Ganzen Song in Spotify hören">' + ic('external') + '</button>' +
      '<button class="icon-btn" data-act="sleep" title="Sleep-Timer">' + ic('moon') + '</button>' +
      '<button class="icon-btn" data-act="queue" title="Warteschlange">' + ic('queue') + '</button>' +
      '<button class="icon-btn" data-act="panel" title="Jetzt läuft">' + ic('panel') + '</button></div>' +
      '<button class="mini-pp" data-act="toggle" aria-label="Abspielen/Pause"></button>' +
      '<div class="mini-progress"><i></i></div>';

    $('#np-panel').innerHTML =
      '<div class="npp-head"><b class="npp-ctx"></b><button class="icon-btn" data-act="panel" aria-label="Schließen">' + ic('close') + '</button></div>' +
      '<div class="embed-slot" data-slot="panel"></div><div class="npp-scroll">' +
      '<div class="npp-meta"><div><div class="npp-t"></div><div class="npp-a"></div></div><button class="icon-btn np-like" data-act="like-current" aria-label="Lieblingssong"></button></div>' +
      '<button class="btn btn-white btn-small full-song" data-act="full-song">' + ic('external') + 'Ganzen Song in Spotify hören</button>' +
      '<div class="npp-status muted small"></div>' +
      '<div class="npp-card"><h3>Song-Infos</h3><div class="npp-info"></div></div>' +
      '<div class="npp-card"><div class="npp-card-head"><h3>Als Nächstes</h3><a href="#/queue">Warteschlange öffnen</a></div><div class="npp-next"></div></div></div>';
    $('#np-panel').addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (a) { e.stopPropagation(); Player.action(a.dataset.act, a); return; }
      const n = e.target.closest('[data-jump]');
      if (n) Player.jump(Number(n.dataset.jump));
    });

    $('#full').innerHTML =
      '<div class="full-bg"></div><div class="full-inner">' +
      '<div class="full-top"><button class="icon-btn" data-act="close-full" aria-label="Schließen">' + ic('down') + '</button>' +
      '<button class="full-ctx" data-act="np-context"><small>Wiedergabe von</small><b></b></button><button class="icon-btn" data-act="np-menu" aria-label="Mehr">' + ic('more') + '</button></div>' +
      '<div class="full-art"></div>' +
      '<div class="full-meta"><div><div class="full-t"></div><button class="full-a" data-act="np-artist"></button></div><button class="icon-btn np-like big" data-act="like-current" aria-label="Lieblingssong"></button></div>' +
      '<input type="range" class="range seek" min="0" max="1000" value="0" aria-label="Position"><div class="full-times"><span class="t-cur">0:00</span><span class="t-dur">0:30</span></div>' +
      '<div class="full-btns"><button class="icon-btn" data-act="shuffle">' + ic('shuffle') + '</button><button class="icon-btn big" data-act="prev">' + ic('prev') + '</button>' +
      '<button class="pp big" data-act="toggle"></button><button class="icon-btn big" data-act="next">' + ic('next') + '</button><button class="icon-btn" data-act="repeat"></button></div>' +
      '<div class="full-extra"><button class="icon-btn" data-act="sleep" aria-label="Sleep-Timer">' + ic('moon') + '</button><button class="btn btn-white btn-small" data-act="full-song">' + ic('external') + 'Ganzer Song in Spotify</button><button class="icon-btn" data-act="queue" aria-label="Warteschlange">' + ic('queue') + '</button></div>' +
      '<div class="embed-slot" data-slot="full"></div></div>';
    // Eigener Handler; nicht zusätzlich an die App weiterreichen (sonst zählt jeder Tipp doppelt)
    $('#full').addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (a) { e.stopPropagation(); Player.action(a.dataset.act, a); }
    });

    $$('.seek').forEach(r => {
      let dragging = false;
      r.addEventListener('pointerdown', () => { dragging = true; Player.seeking = true; });
      r.addEventListener('input', () => { Player.seeking = true; const ms = r.value / 1000 * Player.duration; $$('.t-cur').forEach(x => { x.textContent = dur(ms / 1000); }); paintRange(r); });
      r.addEventListener('change', () => { dragging = false; Player.seeking = false; if (Player.current >= 0) Player.seek(r.value / 1000 * Player.duration); });
    });
    setInterval(tick, 500);
    renderPlayer();
    if (window.ResizeObserver) new ResizeObserver(placeEmbed).observe($('#np-panel'));
  }

  function paintRange(r) { r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%'); }

  function tick() {
    if (Player.current < 0 || Player.seeking) return;
    const ms = Player.pos2();
    $$('.seek').forEach(r => { r.value = Player.duration ? Math.round(ms / Player.duration * 1000) : 0; paintRange(r); });
    $$('.t-cur').forEach(x => { x.textContent = dur(ms / 1000); });
    const b = $('.mini-progress i');
    if (b) b.style.width = (Player.duration ? ms / Player.duration * 100 : 0) + '%';
  }

  let lastCover = null;

  function renderPlayer() {
    const el = $('#player');
    if (!el) return;
    const has = Player.current >= 0;
    const t = has ? T(Player.current) : null;
    const liked = t && isLiked(t.id);
    el.classList.toggle('idle', !has);
    if ((t ? coverKey(t) : null) !== lastCover) {
      lastCover = t ? coverKey(t) : null;
      $('.np-cover', el).innerHTML = t ? trackCover(t, 'np-img') : '<div class="cv ph np-img">' + ic('note') + '</div>';
      $('.full-art').innerHTML = t ? trackCover(t, 'full-img') : '<div class="cv ph full-img">' + ic('note') + '</div>';
      $('#full').style.setProperty('--hero', t ? trackColor(t, 32) : '#333');
      el.style.setProperty('--np', t ? trackColor(t, 26) : '#282828');
      Covers.watch(el);
      Covers.watch($('#full'));
    }
    $('.np-t', el).innerHTML = t ? (t.album.href ? '<a href="' + esc(t.album.href) + '">' + esc(t.name) + '</a>' : esc(t.name)) : 'Gerade läuft nichts';
    $('.np-a', el).innerHTML = t ? artistLinks(t) : 'Such dir einen Song aus – oder starte einen Mix';
    $$('.np-like').forEach(b => { b.hidden = !t; b.classList.toggle('on', !!liked); b.innerHTML = ic(liked ? 'heartFill' : 'heart'); });
    $$('.pp, .mini-pp').forEach(b => { b.innerHTML = ic(Player.playing ? 'pause' : 'play'); });
    $$('[data-act="shuffle"]').forEach(b => b.classList.toggle('on', Player.shuffle));
    $$('[data-act="repeat"]').forEach(b => { b.classList.toggle('on', Player.repeat !== 'off'); b.innerHTML = ic(Player.repeat === 'one' ? 'repeatOne' : 'repeat'); });
    $$('[data-act="sleep"]').forEach(b => b.classList.toggle('on', !!(Player.sleepAt || Player.sleepEnd)));
    $$('[data-act="queue"]').forEach(b => b.classList.toggle('on', location.hash === '#/queue'));
    $$('[data-act="panel"]', el).forEach(b => b.classList.toggle('on', S.panel));
    $$('.t-dur').forEach(x => { x.textContent = dur(Player.duration / 1000); });
    tick();
    // Vollbild
    $('.full-t').textContent = t ? t.name : 'Gerade läuft nichts';
    $('.full-a').textContent = t ? artistNames(t) : '';
    $('.full-ctx b').textContent = Player.ctx ? Player.ctx.name : '';
    // Jetzt läuft
    const p = $('#np-panel');
    $('.npp-ctx', p).textContent = Player.ctx && Player.ctx.name ? Player.ctx.name : 'Jetzt läuft';
    $('.npp-t', p).innerHTML = t ? (t.album.href ? '<a href="' + esc(t.album.href) + '">' + esc(t.name) + '</a>' : esc(t.name)) : 'Gerade läuft nichts';
    $('.npp-a', p).innerHTML = t ? artistLinks(t) : '';
    $('.npp-status', p).textContent = Player.status || (t ? 'Vorschau über den Spotify-Player (30 Sekunden)' : '');
    $('.full-song', p).hidden = !t;
    if (t && $('.npp-info', p).dataset.id !== t.id) { $('.npp-info', p).dataset.id = t.id; $('.npp-info', p).innerHTML = featuresHtml(t); }
    if (!t) $('.npp-info', p).innerHTML = '<p class="muted small">Starte einen Song, dann siehst du hier Tempo, Tonart und Stimmung.</p>';
    const nextItems = Player.upNext.slice(0, 3).map(i => [i, -1]).concat(Player.order.slice(Player.pos + 1, Player.pos + 4).map((i, k) => [i, Player.pos + 1 + k])).slice(0, 3);
    $('.npp-next', p).innerHTML = nextItems.length ? nextItems.map(([i, k]) => { const n = T(i); return '<button class="npp-row"' + (k >= 0 ? ' data-jump="' + k + '"' : '') + '>' + trackCover(n, 'tcover') + '<span><b>' + esc(n.name) + '</b><small>' + esc(artistNames(n)) + '</small></span></button>'; }).join('')
      : '<p class="muted small">' + (Lib.setting('autoplay') && t ? 'Danach geht es mit passenden Songs weiter.' : 'Nichts in der Warteschlange.') + '</p>';
    Covers.watch(p);
    document.title = t ? t.name + ' • ' + artistNames(t) : 'Klangwelt';
  }

  function togglePanel() {
    S.panel = !S.panel;
    local('kw.panel', S.panel ? '1' : '0');
    $('.shell').classList.toggle('with-panel', S.panel);
    renderPlayer();
    setTimeout(placeEmbed, 30);
  }

  /** Der Spotify-Player sitzt in einem festen Element; es wird über den sichtbaren Platzhalter gelegt. */
  function placeEmbed() {
    const host = $('#embed-host');
    if (!host) return;
    const full = $('#full');
    let slot = null;
    if (full && !full.hidden && full.classList.contains('open')) slot = $('[data-slot="full"]', full);
    else if (S.panel && !matchMedia('(max-width: 1100px)').matches) slot = $('[data-slot="panel"]');
    if (!slot) { host.classList.add('parked'); return; }
    const r = slot.getBoundingClientRect();
    if (!r.width) { host.classList.add('parked'); return; }
    host.classList.remove('parked');
    host.style.left = r.left + 'px';
    host.style.top = r.top + 'px';
    host.style.width = r.width + 'px';
  }

  let removeFullLayer = null;
  function openFull() {
    const full = $('#full');
    if (!full || !full.hidden) return;
    full.hidden = false;
    requestAnimationFrame(() => { full.classList.add('open'); setTimeout(placeEmbed, 240); });
    removeFullLayer = pushLayer(closeFull);
  }
  function closeFull() {
    const full = $('#full');
    if (!full || full.hidden) return;
    full.classList.remove('open');
    setTimeout(() => { full.hidden = true; placeEmbed(); }, 220);
    $('#embed-host').classList.add('parked');
    if (removeFullLayer) { removeFullLayer(); removeFullLayer = null; }
  }

  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); Player.toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') Player.next(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') Player.prev();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); location.hash = '#/search'; }
      if (e.key === 'Escape') closeTopLayer();
    });
    $('.npp-scroll').addEventListener('scroll', placeEmbed, { passive: true });
  }

  // ---------- Schnittstelle für die Android-Hülle ----------

  window.KW = {
    back() {
      if (closeTopLayer()) return true;
      if (S.ready && !/^#?\/?(home)?$/.test(location.hash)) { history.back(); return true; }
      return false;
    },
    onResume() { placeEmbed(); },
    onAuthCallback(url) {
      if (Platform._authCallback(url)) return;
      // App wurde zwischendurch neu gestartet: Anmeldung direkt abschließen
      sp.finishLogin(url).then(() => { toast('Spotify-Konto verknüpft'); route(); SA.sync(true); }, e => toast(spExplain(e), 6000));
    },
    player: Player,
    lib: Lib,
  };

  boot();
})();

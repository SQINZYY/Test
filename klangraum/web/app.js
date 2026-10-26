/* Klangraum – Oberfläche. Läuft unverändert in der Windows-App (Electron), der Android-App und im Browser. */
(function () {
  'use strict';

  const sp = Spotify.create({ platform: Platform });
  const N = Spotify.norm;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const app = document.getElementById('app');
  const ROW_CHUNK = 120;
  const MAX_URIS = 150;

  const S = {
    me: null,
    playlists: [],
    liked: [],
    likedTotal: null,
    likedSet: new Set(),
    albums: [],
    artists: [],
    loaded: false,
    syncing: false,
    lib: { filter: local('kr.libFilter') || 'all', sort: local('kr.libSort') || 'recent', q: '' },
    home: null,
    player: null,
    device: local('kr.device'),
    lastQuery: '',
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

  function dur(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function longDur(ms) {
    const m = Math.round((ms || 0) / 60000);
    if (m < 60) return m + ' Min.';
    return Math.floor(m / 60) + ' Std. ' + (m % 60) + ' Min.';
  }

  function ago(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 864e5);
    if (days < 1) return 'Heute';
    if (days < 2) return 'Gestern';
    if (days < 7) return 'Vor ' + days + ' Tagen';
    if (days < 28) { const w = Math.floor(days / 7); return 'Vor ' + w + (w === 1 ? ' Woche' : ' Wochen'); }
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function hashColor(str) {
    let h = 0;
    for (const c of String(str || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 'hsl(' + (h % 360) + ', 42%, 30%)';
  }

  const ICONS = {
    home: '<path d="M12 3.2 3 10.6V21h6.6v-6.2h4.8V21H21V10.6z"/>',
    homeLine: '<path d="M12 4.2 4 10.9V20h5v-6h6v6h5v-9.1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
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
    devices: '<rect x="2.5" y="4.5" width="12.5" height="9.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 18h6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="17" y="8" width="4.8" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    computer: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20.5h8M12 16.5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.8 18.3h2.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    speaker: '<rect x="5.5" y="2.5" width="13" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="14.3" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="7" r="1.3"/>',
    volume: '<path d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5z"/><path d="M15.5 8.6a4.8 4.8 0 0 1 0 6.8M18.2 5.9a8.6 8.6 0 0 1 0 12.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    volumeOff: '<path d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5z"/><path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    more: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>',
    back: '<path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    fwd: '<path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    settings: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="15.5" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="8.5" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/>',
    note: '<path d="M9 18.3V6.3l11-2.3v12.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18.3" r="2.6"/><circle cx="17.5" cy="16.2" r="2.6"/>',
    user: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c.8-4 4-6.2 8-6.2s7.2 2.2 8 6.2z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4.5V9h-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    queue: '<path d="M4 6h12M4 11h12M4 16h7M17.5 13v7M14 16.5h7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    album: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4"/>',
    artist: '<circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20.5c.8-3.8 3.8-5.8 7.5-5.8s6.7 2 7.5 5.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  const ic = (name, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + ICONS[name] + '</svg>';
  const LOGO = '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#1ed760"/><g fill="#121212"><rect x="10.4" y="19" width="4.4" height="10" rx="2.2"/><rect x="18" y="13" width="4.4" height="22" rx="2.2"/><rect x="25.6" y="16" width="4.4" height="16" rx="2.2"/><rect x="33.2" y="20" width="4.4" height="8" rx="2.2"/></g></svg>';
  const EQ = '<span class="eqz" aria-hidden="true"><i></i><i></i><i></i></span>';

  function cover(url, cls, icon) {
    if (url) return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" decoding="async">';
    return '<div class="' + cls + ' ph">' + ic(icon || 'note') + '</div>';
  }

  function artistLinks(artists) {
    return (artists || []).map(a => a.id && !a.show
      ? '<a href="#/artist/' + esc(a.id) + '">' + esc(a.name) + '</a>'
      : '<span>' + esc(a.name) + '</span>').join(', ');
  }

  const artistNames = t => (t && t.artists || []).map(a => a.name).join(', ');
  const isOwn = p => !!(S.me && p.owner.id === S.me.id);
  const likedContext = () => (S.me ? 'spotify:user:' + S.me.id + ':collection' : null);

  // ---------- Ebenen: Popups, Dialoge, Vollbild-Player (für "Zurück" auf Android) ----------

  const layers = [];

  function pushLayer(close) {
    const layer = { close };
    layers.push(layer);
    return () => { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); };
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
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms || 3200);
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
      b.className = 'btn ' + (a.primary ? 'btn-primary' : 'btn-ghost');
      b.textContent = a.label;
      b.onclick = () => { if (!a.onClick || a.onClick() !== false) close(a.value === undefined ? null : a.value); };
      actions.appendChild(b);
    }
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });
    wrap.addEventListener('click', e => {
      const ext = e.target.closest('[data-ext]');
      if (ext) { e.preventDefault(); Platform.openExternal(ext.dataset.ext); }
    });
    document.body.appendChild(wrap);
    return { el: wrap, close };
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
      set(h) { el.innerHTML = h; place(); },
      close() {
        el.remove(); shade.remove();
        document.removeEventListener('pointerdown', outside, true);
        if (removeLayer) removeLayer();
        if (openPopup === api) openPopup = null;
      },
    };
    function place() {
      if (matchMedia('(max-width: 860px)').matches) return; // auf dem Handy als Leiste von unten
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = Math.min(r.right - w, window.innerWidth - w - 8);
      left = Math.max(8, left);
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

  // ---------- Fehler verständlich machen ----------

  function explain(e) {
    const msg = String(e && e.message || e || '');
    if (/premium subscription required/i.test(msg)) {
      return { title: 'Premium für die Entwickler-App nötig', text: 'Seit Februar 2026 verlangt Spotify, dass der Besitzer der Entwickler-App (die mit deiner Client-ID) Spotify Premium hat. Ohne Premium lehnt Spotify alle Anfragen dieser App ab.' };
    }
    if (/not be registered|not registered/i.test(msg)) {
      return { title: 'Konto nicht freigeschaltet', text: 'Dieses Spotify-Konto ist in deiner Entwickler-App nicht eingetragen. Öffne developer.spotify.com/dashboard → deine App → „User Management“ und trage Name und E-Mail-Adresse dieses Kontos ein (bis zu 5 Konten).' };
    }
    if (e && e.reason === 'PREMIUM_REQUIRED') {
      return { title: 'Spotify Premium nötig', text: 'Die Wiedergabe lässt sich nur mit Spotify Premium aus anderen Apps steuern. Du kannst Songs und Playlists aber in der Spotify-App öffnen.', premium: true };
    }
    if (e && (e.reason === 'invalid_client' || /invalid client/i.test(msg))) {
      return { title: 'Client-ID ungültig', text: 'Spotify kennt diese Client-ID nicht. Kopiere sie im Spotify-Dashboard unter „Settings“ noch einmal.' };
    }
    if (/redirect/i.test(msg)) {
      return { title: 'Redirect-URI fehlt', text: 'Trage in deiner Spotify-App unter „Redirect URIs“ genau diese Adressen ein: ' + Platform.redirectUris.join(' und ') };
    }
    if (e && e.status === 0) return { title: 'Keine Verbindung', text: 'Spotify ist gerade nicht erreichbar. Prüfe die Internetverbindung.' };
    if (e && e.status === 429) return { title: 'Zu viele Anfragen', text: 'Spotify bremst gerade. Versuch es in ein paar Sekunden noch einmal.' };
    if (/restriction violated/i.test(msg)) return { title: 'Nicht möglich', text: 'Diese Aktion ist auf dem aktuellen Gerät gerade nicht erlaubt (z. B. Werbung, Podcast oder am Ende der Warteschlange).' };
    return { title: 'Das hat nicht geklappt', text: msg || 'Unbekannter Fehler' };
  }

  function showError(e) {
    if (e && e.auth && !sp.isLoggedIn()) return; // wird zur Anmeldung umgeleitet
    console.warn(e);
    const x = explain(e);
    if (x.premium) {
      modal({ title: x.title, html: '<p>' + esc(x.text) + '</p>', actions: [{ label: 'OK' }, { label: 'Spotify öffnen', primary: true, onClick: () => { openInSpotify(currentUri()); } }] });
      return;
    }
    if (x.title === 'Das hat nicht geklappt' || x.title === 'Nicht möglich' || x.title === 'Zu viele Anfragen' || x.title === 'Keine Verbindung') {
      toast(x.text, 4500);
      return;
    }
    modal({ title: x.title, html: '<p>' + esc(x.text) + '</p>' });
  }

  function openInSpotify(uri) {
    if (Platform.openSpotify(uri) === false) Platform.openExternal(Spotify.webUrl(uri));
  }

  // ---------- Start ----------

  async function boot() {
    sp.onChange(what => { if (what === 'logout') renderSetup(); });
    // Browser-Variante: Spotify leitet direkt auf diese Seite zurück
    if (Platform.kind === 'web' && /[?&](code|error)=/.test(location.search)) {
      const url = location.href;
      history.replaceState(null, '', location.pathname + location.hash);
      try { await sp.finishLogin(url); } catch (e) { renderSetup(e); return; }
    }
    if (!sp.isLoggedIn()) { renderSetup(); return; }
    start();
  }

  let started = false;

  async function start() {
    renderShell();
    await loadCache();
    renderAvatar();
    renderSideLib();
    route();
    if (!started) {
      started = true;
      window.addEventListener('hashchange', route);
      Player.start();
      bindKeys();
    }
    syncLibrary(false);
  }

  // ---------- Einrichtung ----------

  function renderSetup(err) {
    document.body.classList.remove('has-shell');
    const cid = sp.clientId;
    app.innerHTML = '<div class="setup"><div class="setup-card">' +
      '<div class="setup-brand">' + LOGO + '<span>Klangraum</span></div>' +
      '<h1>Verbinde dein Spotify-Konto</h1>' +
      '<p class="muted">Danach lädt Klangraum automatisch alle deine Playlists – eigene und die von anderen, die du gespeichert hast – und deine Lieblingssongs.</p>' +
      '<details class="steps"' + (cid ? '' : ' open') + '><summary>Einmalig: eigene Spotify-App anlegen (ca. 2 Minuten)</summary><ol>' +
      '<li>Öffne <a href="#" data-ext="https://developer.spotify.com/dashboard">developer.spotify.com/dashboard</a> und melde dich mit deinem Spotify-Konto an.</li>' +
      '<li>Klicke auf <b>Create app</b>. Name und Beschreibung sind egal, z. B. „Klangraum“.</li>' +
      '<li>Trage bei <b>Redirect URIs</b> diese zwei Adressen ein (jeweils mit <b>Add</b>):' +
      Platform.redirectUris.map(u => '<div class="copyrow"><code>' + esc(u) + '</code><button class="btn btn-small" data-copy="' + esc(u) + '" aria-label="Kopieren">' + ic('copy') + '<span>Kopieren</span></button></div>').join('') + '</li>' +
      '<li>Bei „Which API/SDKs are you planning to use?“ <b>Web API</b> ankreuzen, den Bedingungen zustimmen und <b>Save</b> klicken.</li>' +
      '<li>In der App unter <b>Settings</b> die <b>Client ID</b> kopieren und unten einfügen. Auf PC und Handy kannst du dieselbe Client-ID nutzen.</li>' +
      '</ol><p class="note">' + ic('info') + '<span>Spotify erlaubt solche Apps seit Februar 2026 nur, wenn der Besitzer der App Spotify Premium hat. Bis zu 5 Konten können sie nutzen – weitere Konten unter „User Management“ eintragen.</span></p></details>' +
      '<label class="field"><span>Client ID</span><input id="cid" value="' + esc(cid) + '" placeholder="32 Zeichen, z. B. 8f2c…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<button class="btn btn-primary btn-big" id="connect">Mit Spotify verbinden</button>' +
      '<div class="setup-status" id="setup-status"></div>' +
      '</div><p class="legal">Klangraum ist kein offizielles Spotify-Produkt. Musik, Cover und Wiedergabe kommen von Spotify.</p></div>';

    const status = $('#setup-status');
    const input = $('#cid');
    const btn = $('#connect');
    if (err) status.innerHTML = '<div class="error">' + esc(explain(err).text) + '</div>';

    app.onclick = e => {
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        Platform.copy(copy.dataset.copy).then(() => toast('Kopiert'), () => toast(copy.dataset.copy));
        return;
      }
      const ext = e.target.closest('[data-ext]');
      if (ext) { e.preventDefault(); Platform.openExternal(ext.dataset.ext); }
      if (e.target.closest('#cancel-login')) Platform.cancelLogin();
    };

    btn.onclick = async () => {
      const id = input.value.replace(/\s+/g, '');
      if (!/^[0-9a-f]{32}$/i.test(id)) {
        status.innerHTML = '<div class="error">Die Client-ID besteht aus 32 Zeichen (Ziffern und Buchstaben a–f). Du findest sie im Spotify-Dashboard unter „Settings“.</div>';
        input.focus();
        return;
      }
      sp.setClientId(id);
      btn.disabled = true;
      status.innerHTML = '<div class="wait"><span class="spinner"></span><span>' +
        (Platform.kind === 'web' ? 'Weiter zu Spotify …' : 'Im Browser hat sich Spotify geöffnet. Melde dich dort an und tippe auf „Zustimmen“. Danach geht es hier automatisch weiter.') +
        '</span></div>' + (Platform.kind === 'web' ? '' : '<button class="btn btn-ghost btn-small" id="cancel-login">Abbrechen</button>');
      try {
        await sp.login();
        start();
      } catch (e) {
        btn.disabled = false;
        status.innerHTML = e.message === 'Abgebrochen' ? '' : '<div class="error">' + esc(explain(e).text) + '</div>';
      }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  }

  // ---------- Gerüst ----------

  let viewEl, mainEl, viewRefresh = null, observers = [], shellBound = false;

  function renderShell() {
    document.body.classList.add('has-shell');
    app.onclick = null;
    app.innerHTML =
      '<div class="shell">' +
      '<aside class="side">' +
      '<nav class="panel side-nav"><div class="brand">' + LOGO + '<span>Klangraum</span></div>' +
      '<a href="#/home" data-nav="home">' + ic('home') + '<span>Start</span></a>' +
      '<a href="#/search" data-nav="search">' + ic('search') + '<span>Suchen</span></a></nav>' +
      '<section class="panel side-lib">' +
      '<header class="side-lib-head"><a href="#/library" data-nav="library">' + ic('library') + '<span>Deine Bibliothek</span></a>' +
      '<button class="icon-btn" data-act="sync" title="Bibliothek neu laden">' + ic('refresh') + '</button></header>' +
      '<div class="chips" data-chips></div>' +
      '<div class="lib-tools"><label class="mini-search">' + ic('search') + '<input data-libq placeholder="In Bibliothek suchen"></label><button class="sort-btn" data-act="sort"></button></div>' +
      '<div class="side-list lib-list" data-liblist></div>' +
      '</section></aside>' +
      '<main class="main" id="main">' +
      '<div class="topbar" id="topbar"><div class="nav-btns"><button class="round" data-act="back" aria-label="Zurück">' + ic('back') + '</button>' +
      '<button class="round hide-m" data-act="fwd" aria-label="Vor">' + ic('fwd') + '</button></div>' +
      '<div class="tb-title" id="tb-title"></div><div class="sync" id="sync"></div>' +
      '<button class="avatar" data-act="account" id="avatar" aria-label="Konto"></button></div>' +
      '<div class="view" id="view"></div></main>' +
      '<footer class="player" id="player"></footer>' +
      '<nav class="tabbar">' +
      '<a href="#/home" data-nav="home">' + ic('home') + '<span>Start</span></a>' +
      '<a href="#/search" data-nav="search">' + ic('search') + '<span>Suchen</span></a>' +
      '<a href="#/library" data-nav="library">' + ic('library') + '<span>Bibliothek</span></a></nav>' +
      '</div>' +
      '<div class="full" id="full" hidden></div>';
    viewEl = $('#view');
    mainEl = $('#main');
    buildPlayer();
    if (!shellBound) {
      shellBound = true;
      app.addEventListener('click', onShellClick);
      app.addEventListener('input', e => {
        if (e.target.matches('[data-libq]')) {
          S.lib.q = e.target.value;
          $$('[data-libq]').forEach(i => { if (i !== e.target) i.value = S.lib.q; });
          renderLibLists();
        }
      });
    }
    mainEl.addEventListener('scroll', () => {
      $('#topbar').classList.toggle('solid', mainEl.scrollTop > 56);
    }, { passive: true });
  }

  function onShellClick(e) {
    if (!document.body.classList.contains('has-shell')) return;
    const playBtn = e.target.closest('[data-play]');
    if (playBtn) {
      e.preventDefault();
      e.stopPropagation();
      playUri(playBtn.dataset.play);
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      S.lib.filter = chip.dataset.chip === S.lib.filter && chip.dataset.chip !== 'all' ? 'all' : chip.dataset.chip;
      local('kr.libFilter', S.lib.filter);
      renderLibLists();
      return;
    }
    const ext = e.target.closest('[data-ext]');
    if (ext) { e.preventDefault(); Platform.openExternal(ext.dataset.ext); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    switch (act.dataset.act) {
      case 'sync': syncLibrary(true); break;
      case 'sort': {
        const order = ['recent', 'alpha', 'owner'];
        S.lib.sort = order[(order.indexOf(S.lib.sort) + 1) % order.length];
        local('kr.libSort', S.lib.sort);
        renderLibLists();
        break;
      }
      case 'back': history.back(); break;
      case 'fwd': history.forward(); break;
      case 'account': accountMenu(act); break;
      default: Player.action(act.dataset.act, act, e);
    }
  }

  function accountMenu(anchor) {
    popup(anchor,
      '<div class="pop-title">' + esc(S.me ? S.me.name : 'Konto') + '</div>' +
      '<button class="pop-item" data-k="settings">' + ic('settings') + '<span>Einstellungen</span></button>' +
      '<button class="pop-item" data-k="sync">' + ic('refresh') + '<span>Bibliothek neu laden</span></button>' +
      '<button class="pop-item" data-k="open">' + ic('external') + '<span>Spotify öffnen</span></button>' +
      '<div class="pop-sep"></div>' +
      '<button class="pop-item" data-k="logout">' + ic('logout') + '<span>Abmelden</span></button>',
      k => {
        if (k === 'settings') location.hash = '#/settings';
        if (k === 'sync') syncLibrary(true);
        if (k === 'open') openInSpotify('');
        if (k === 'logout') logout();
      });
  }

  function logout() {
    Store.clear();
    S.playlists = []; S.liked = []; S.likedSet = new Set(); S.albums = []; S.artists = []; S.me = null; S.home = null; S.player = null;
    sp.logout();
  }

  function renderAvatar() {
    const el = $('#avatar');
    if (!el) return;
    el.innerHTML = S.me && S.me.img ? '<img src="' + esc(S.me.img) + '" alt="">' : '<span>' + esc(S.me ? S.me.name.slice(0, 1).toUpperCase() : '') + '</span>';
    el.title = S.me ? S.me.name : '';
  }

  function syncStatus(text) {
    const el = $('#sync');
    if (el) el.innerHTML = text ? '<span class="spinner small"></span><span>' + esc(text) + '</span>' : '';
  }

  // ---------- Bibliothek ----------

  async function loadCache() {
    const [me, playlists, liked, albums, artists] = await Promise.all(['me', 'playlists', 'liked', 'albums', 'artists'].map(k => Store.get(k)));
    if (me) S.me = me;
    if (playlists) S.playlists = playlists;
    if (liked) { S.liked = liked.tracks || []; S.likedTotal = liked.total; }
    if (albums) S.albums = albums;
    if (artists) S.artists = artists;
    S.likedSet = new Set(S.liked.map(t => t.id));
  }

  async function syncLibrary(manual) {
    if (S.syncing) return;
    S.syncing = true;
    syncStatus('Bibliothek wird aktualisiert …');
    try {
      const me = await sp.me();
      S.me = { id: me.id, name: me.display_name || me.id, img: N.image(me.images, 64) };
      Store.set('me', S.me);
      renderAvatar();

      syncStatus('Playlists werden geladen …');
      S.playlists = await sp.myPlaylists();
      Store.set('playlists', S.playlists);
      libraryChanged();

      const liked = await sp.likedTracks((n, total) => syncStatus('Lieblingssongs: ' + num(n) + ' von ' + num(total)));
      const changed = liked.tracks.length !== S.liked.length || (liked.tracks[0] && liked.tracks[0].id) !== (S.liked[0] && S.liked[0].id);
      S.liked = liked.tracks;
      S.likedTotal = liked.total;
      S.likedSet = new Set(S.liked.map(t => t.id));
      Store.set('liked', liked);
      if (changed) libraryChanged('liked');

      syncStatus('Alben und Künstler …');
      const [albums, artists] = await Promise.all([sp.savedAlbums().catch(() => null), sp.followedArtists().catch(() => null)]);
      if (albums) { S.albums = albums; Store.set('albums', albums); }
      if (artists) { S.artists = artists; Store.set('artists', artists); }
      S.loaded = true;
      libraryChanged();
      if (manual) toast('Bibliothek aktualisiert: ' + plural(S.playlists.length, 'Playlist', 'Playlists') + ', ' + plural(S.likedTotal || S.liked.length, 'Lieblingssong', 'Lieblingssongs'));
    } catch (e) {
      showError(e);
    } finally {
      S.syncing = false;
      syncStatus('');
    }
  }

  function libraryChanged(what) {
    renderSideLib();
    renderPlayer();
    if (viewRefresh) viewRefresh(what);
  }

  const FILTERS = [['all', 'Alle'], ['playlists', 'Playlists'], ['own', 'Von dir'], ['others', 'Von anderen'], ['albums', 'Alben'], ['artists', 'Künstler']];
  const SORTS = { recent: 'Zuletzt hinzugefügt', alpha: 'Alphabetisch', owner: 'Ersteller' };

  function libItems() {
    const f = S.lib.filter;
    const items = [];
    const likedRow = { kind: 'liked', name: 'Lieblingssongs', owner: S.me ? S.me.name : '' };
    if (f === 'all' || f === 'playlists' || f === 'own') items.push(likedRow);
    for (const p of S.playlists) {
      if (f === 'all' || f === 'playlists' || (f === 'own' && isOwn(p)) || (f === 'others' && !isOwn(p))) {
        items.push({ kind: 'playlist', name: p.name, owner: p.owner.name, p });
      }
    }
    if (f === 'all' || f === 'albums') for (const a of S.albums) items.push({ kind: 'album', name: a.name, owner: artistNames(a), a });
    if (f === 'all' || f === 'artists') for (const a of S.artists) items.push({ kind: 'artist', name: a.name, owner: '', a });
    const q = S.lib.q.trim().toLowerCase();
    let list = q ? items.filter(x => (x.name + ' ' + x.owner).toLowerCase().includes(q)) : items;
    if (S.lib.sort !== 'recent') {
      const key = S.lib.sort === 'owner' ? (x => x.owner + ' ' + x.name) : (x => x.name);
      list = list.slice().sort((a, b) => (a.kind === 'liked' ? -1 : b.kind === 'liked' ? 1 : key(a).localeCompare(key(b), 'de', { sensitivity: 'base' })));
    }
    return list;
  }

  function libRowHtml(x) {
    const ctx = S.player && S.player.context;
    if (x.kind === 'liked') {
      return '<a class="lib-row' + (ctx && ctx === likedContext() ? ' now' : '') + '" href="#/liked"><div class="lib-img liked-img">' + ic('heartFill') + '</div>' +
        '<div class="lib-meta"><div class="lib-t">Lieblingssongs</div><div class="lib-s">' + ic('heartFill', 'pin') + 'Playlist • ' + plural(S.likedTotal != null ? S.likedTotal : S.liked.length, 'Song', 'Songs') + '</div></div></a>';
    }
    if (x.kind === 'playlist') {
      const p = x.p;
      const own = isOwn(p);
      const sub = (p.collaborative ? 'Gemeinsame Playlist' : 'Playlist') + ' • ' + (own ? esc(p.owner.name) : 'von ' + esc(p.owner.name));
      return '<a class="lib-row' + (ctx === p.uri ? ' now' : '') + '" href="#/playlist/' + esc(p.id) + '">' + cover(p.imgS || p.img, 'lib-img') +
        '<div class="lib-meta"><div class="lib-t">' + esc(p.name) + '</div><div class="lib-s">' + sub + (own ? '' : '<span class="tag">Gespeichert</span>') + '</div></div></a>';
    }
    if (x.kind === 'album') {
      const a = x.a;
      return '<a class="lib-row' + (ctx === a.uri ? ' now' : '') + '" href="#/album/' + esc(a.id) + '">' + cover(a.imgS || a.img, 'lib-img', 'album') +
        '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Album • ' + esc(artistNames(a)) + '</div></div></a>';
    }
    const a = x.a;
    return '<a class="lib-row' + (ctx === a.uri ? ' now' : '') + '" href="#/artist/' + esc(a.id) + '">' + cover(a.imgS || a.img, 'lib-img round', 'artist') +
      '<div class="lib-meta"><div class="lib-t">' + esc(a.name) + '</div><div class="lib-s">Künstler</div></div></a>';
  }

  function renderLibLists() {
    const chips = FILTERS.filter(([k]) => k === 'all' || k === 'playlists' || k === 'own' || k === 'others' ||
      (k === 'albums' && S.albums.length) || (k === 'artists' && S.artists.length))
      .map(([k, label]) => '<button class="chip' + (S.lib.filter === k ? ' on' : '') + '" data-chip="' + k + '">' + label + '</button>').join('');
    $$('[data-chips]').forEach(el => { el.innerHTML = chips; });
    $$('[data-act="sort"]').forEach(el => { el.textContent = SORTS[S.lib.sort]; });
    const items = libItems();
    const empty = S.syncing && !S.playlists.length ? '<div class="lib-empty"><span class="spinner"></span>Bibliothek wird geladen …</div>' : '<div class="lib-empty">Nichts gefunden</div>';
    const html = items.length ? items.map(libRowHtml).join('') : empty;
    $$('[data-liblist]').forEach(el => { el.innerHTML = html; });
  }

  const renderSideLib = renderLibLists;

  // ---------- Router ----------

  let navSeq = 0;
  const views = { home: homeView, search: searchView, library: libraryView, liked: likedView, playlist: playlistView, album: albumView, artist: artistView, settings: settingsView };

  function route() {
    if (!viewEl) return;
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const name = views[parts[0]] ? parts[0] : 'home';
    const id = parts.slice(1).join('/');
    const seq = ++navSeq;
    viewRefresh = null;
    observers.forEach(o => o.disconnect());
    observers = [];
    if (openPopup) openPopup.close();
    closeFull();
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name || (name === 'liked' && a.dataset.nav === 'library')));
    $('#topbar').classList.remove('solid');
    $('#topbar').style.removeProperty('--tb');
    $('#tb-title').textContent = '';
    document.body.dataset.view = name;
    viewEl.className = 'view view-' + name;
    viewEl.innerHTML = '';
    mainEl.scrollTop = 0;
    views[name](id ? decodeURIComponent(id) : '', seq);
  }

  const alive = seq => seq === navSeq;

  function setHero(color, title) {
    viewEl.style.setProperty('--hero', color);
    $('#topbar').style.setProperty('--tb', color);
    if (title !== undefined) $('#tb-title').textContent = title;
  }

  const colorCache = {};

  /** Mittlere, kräftige Farbe eines Covers (für den Farbverlauf oben), abgedunkelt für gute Lesbarkeit. */
  function coverColor(url, fallbackKey) {
    const fallback = hashColor(fallbackKey || url);
    if (!url) return Promise.resolve(fallback);
    if (colorCache[url]) return Promise.resolve(colorCache[url]);
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 12;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, 12, 12);
          const d = g.getImageData(0, 0, 12, 12).data;
          let r = 0, gr = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            const w = 1 + (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 24;
            r += d[i] * w; gr += d[i + 1] * w; b += d[i + 2] * w; n += w;
          }
          r /= n; gr /= n; b /= n;
          const lum = (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 255;
          const k = lum > 0.34 ? 0.34 / lum : 1;
          const col = 'rgb(' + Math.round(r * k) + ',' + Math.round(gr * k) + ',' + Math.round(b * k) + ')';
          colorCache[url] = col;
          resolve(col);
        } catch (e) { resolve(fallback); }
      };
      img.onerror = () => resolve(fallback);
      img.src = url;
    });
  }

  // ---------- Bausteine ----------

  function cardHtml(o) {
    return '<a class="card" href="' + o.href + '"><div class="card-img' + (o.round ? ' round' : '') + '">' + (o.html || cover(o.img, 'cimg', o.icon)) +
      (o.play ? '<button class="card-play" data-play="' + esc(o.play) + '" aria-label="Abspielen">' + ic('play') + '</button>' : '') + '</div>' +
      '<div class="card-t">' + esc(o.title) + '</div><div class="card-s">' + o.sub + '</div></a>';
  }

  const playlistCard = p => cardHtml({ href: '#/playlist/' + p.id, img: p.img, title: p.name, sub: esc(isOwn(p) ? (p.total != null ? plural(p.total, 'Song', 'Songs') : 'Playlist') : 'von ' + p.owner.name), play: p.uri });
  const albumCard = a => cardHtml({ href: '#/album/' + a.id, img: a.img, icon: 'album', title: a.name, sub: esc((a.year ? a.year + ' • ' : '') + artistNames(a)), play: a.uri });
  const artistCard = a => cardHtml({ href: '#/artist/' + a.id, img: a.img, icon: 'artist', title: a.name, sub: 'Künstler', play: a.uri, round: true });
  const likedCard = () => cardHtml({ href: '#/liked', html: '<div class="cimg liked-img">' + ic('heartFill') + '</div>', title: 'Lieblingssongs', sub: esc(plural(S.likedTotal != null ? S.likedTotal : S.liked.length, 'Song', 'Songs')), play: likedContext() || '' });

  function section(title, inner, more) {
    return '<section class="sec"><div class="sec-head"><h2>' + esc(title) + '</h2>' + (more ? '<a class="sec-more" href="' + more + '">Alle anzeigen</a>' : '') + '</div>' + inner + '</section>';
  }

  const row = cards => '<div class="cards">' + cards.join('') + '</div>';

  function heroHtml(o) {
    return '<header class="hero"><div class="hero-img' + (o.round ? ' round' : '') + '">' + (o.html || cover(o.img, 'himg', o.icon)) + '</div>' +
      '<div class="hero-meta"><div class="hero-kind">' + esc(o.kind) + '</div><h1 class="hero-title' + (o.title.length > 28 ? ' long' : '') + '">' + esc(o.title) + '</h1>' +
      (o.desc ? '<p class="hero-desc">' + esc(o.desc) + '</p>' : '') + '<div class="hero-by">' + o.by + '</div></div></header>';
  }

  function actionsHtml(o) {
    return '<div class="actions"><button class="bigplay" data-act="' + (o.playAct || 'ctx-play') + '" aria-label="Abspielen">' + ic('play') + '</button>' +
      (o.shuffle !== false ? '<button class="icon-btn big" data-act="ctx-shuffle" title="Zufallswiedergabe">' + ic('shuffle') + '</button>' : '') +
      (o.uri ? '<button class="icon-btn big" data-ext="' + esc(Spotify.webUrl(o.uri)) + '" title="In Spotify öffnen">' + ic('external') + '</button>' : '') +
      (o.filter ? '<label class="mini-search grow">' + ic('search') + '<input data-trackq placeholder="In ' + esc(o.filter) + ' suchen"></label>' : '') +
      '</div>';
  }

  function loading(text) {
    return '<div class="loading"><span class="spinner"></span>' + esc(text || 'Wird geladen …') + '</div>';
  }

  // ---------- Songliste ----------

  /** Songliste mit Filter, Sortierung und nachladendem Rendern (auch für tausende Lieblingssongs). */
  function mountTracks(el, tracks, o) {
    o = o || {};
    const st = { q: '', sort: 'default', dir: 1, list: [], shown: 0 };
    el.classList.add('tracks');
    el.classList.toggle('has-album', !!o.album);
    el.classList.toggle('has-added', !!o.added);
    el.classList.toggle('no-cover', o.cover === false);
    const head = o.head === false ? '' :
      '<div class="thead"><div class="c-num">#</div><div class="c-title" data-sort="name">Titel</div>' +
      (o.album ? '<div class="c-album" data-sort="album">Album</div>' : '') +
      (o.added ? '<div class="c-added" data-sort="added">Hinzugefügt</div>' : '') +
      '<div class="c-like"></div><div class="c-dur" data-sort="ms">' + ic('clock') + '</div><div class="c-more"></div></div>';
    el.innerHTML = head + '<div class="rows"></div><div class="rows-end"></div>';
    const rows = $('.rows', el);

    function sortKey(t) {
      if (st.sort === 'name') return t.name.toLowerCase();
      if (st.sort === 'album') return (t.album ? t.album.name : '').toLowerCase();
      if (st.sort === 'added') return t.added || '';
      if (st.sort === 'ms') return t.ms;
      return 0;
    }

    function apply() {
      let list = tracks.map((t, i) => ({ t, i }));
      const q = st.q.trim().toLowerCase();
      if (q) list = list.filter(({ t }) => (t.name + ' ' + artistNames(t) + ' ' + (t.album ? t.album.name : '')).toLowerCase().includes(q));
      if (st.sort !== 'default') {
        list.sort((a, b) => {
          const x = sortKey(a.t), y = sortKey(b.t);
          return (x < y ? -1 : x > y ? 1 : 0) * st.dir;
        });
      }
      st.list = list;
      st.shown = 0;
      rows.innerHTML = list.length ? '' : '<div class="empty">' + esc(q ? 'Keine Treffer für „' + st.q.trim() + '“' : (o.empty || 'Hier ist noch nichts.')) + '</div>';
      more();
      $$('[data-sort]', el).forEach(h => h.classList.toggle('sorted', h.dataset.sort === st.sort));
    }

    function more() {
      const next = st.list.slice(st.shown, st.shown + (o.max || ROW_CHUNK));
      rows.insertAdjacentHTML('beforeend', next.map((x, k) => rowHtml(x.t, x.i, st.shown + k, o)).join(''));
      st.shown += next.length;
      markPlaying();
    }

    if (!o.max) {
      const io = new IntersectionObserver(es => {
        if (es.some(x => x.isIntersecting) && st.shown < st.list.length) more();
      }, { root: mainEl, rootMargin: '900px' });
      io.observe($('.rows-end', el));
      observers.push(io);
    }

    const custom = () => !!st.q.trim() || st.sort !== 'default';
    const play = i => playTracks(tracks, i, o, custom() ? st.list.map(x => x.t) : null);

    el.addEventListener('click', e => {
      const sortHead = e.target.closest('[data-sort]');
      if (sortHead) {
        if (st.sort === sortHead.dataset.sort) {
          if (st.dir === 1) st.dir = -1; else { st.sort = 'default'; st.dir = 1; }
        } else { st.sort = sortHead.dataset.sort; st.dir = sortHead.dataset.sort === 'added' ? -1 : 1; }
        apply();
        return;
      }
      const r = e.target.closest('.trow');
      if (!r || e.target.closest('a')) return;
      const i = Number(r.dataset.i);
      const t = tracks[i];
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'like') { e.stopPropagation(); toggleLike(t); return; }
      if (act && act.dataset.act === 'menu') { e.stopPropagation(); trackMenu(act, t, o); return; }
      if ((act && act.dataset.act === 'play') || coarse) { e.stopPropagation(); play(i); return; }
      $$('.trow.sel', el).forEach(x => x.classList.remove('sel'));
      r.classList.add('sel');
    });
    el.addEventListener('dblclick', e => {
      const r = e.target.closest('.trow');
      if (r && !e.target.closest('a, button')) play(Number(r.dataset.i));
    });

    apply();
    return {
      filter(q) { st.q = q; apply(); },
      playFirst(shuffle) {
        if (!st.list.length) return;
        const k = shuffle ? Math.floor(Math.random() * st.list.length) : 0;
        // Normales Abspielen lässt den Zufallsmodus, wie er ist
        playTracks(tracks, st.list[k].i, o, custom() ? st.list.map(x => x.t) : null, shuffle ? true : undefined);
      },
    };
  }

  function rowHtml(t, i, pos, o) {
    const liked = t.id && S.likedSet.has(t.id);
    return '<div class="trow' + (t.playable ? '' : ' off') + '" data-i="' + i + '" data-uri="' + esc(t.uri) + '">' +
      '<div class="c-num"><span class="n">' + (o.trackNo ? t.no : pos + 1) + '</span><button class="rowplay" data-act="play" aria-label="Abspielen">' + ic('play') + '</button>' + EQ + '</div>' +
      '<div class="c-title">' + (o.cover === false ? '' : cover(t.album && t.album.img, 'tcover')) +
      '<div class="tmeta"><div class="tname">' + esc(t.name) + '</div><div class="tsub">' + (t.explicit ? '<span class="explicit">E</span>' : '') + artistLinks(t.artists) + '</div></div></div>' +
      (o.album ? '<div class="c-album">' + (t.album && t.album.id ? '<a href="#/album/' + esc(t.album.id) + '">' + esc(t.album.name) + '</a>' : esc(t.album ? t.album.name : '')) + '</div>' : '') +
      (o.added ? '<div class="c-added">' + esc(ago(t.added)) + '</div>' : '') +
      '<div class="c-like"><button class="icon-btn like' + (liked ? ' on' : '') + '" data-act="like" aria-label="' + (liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen') + '">' + ic(liked ? 'heartFill' : 'heart') + '</button></div>' +
      '<div class="c-dur">' + dur(t.ms) + '</div>' +
      '<div class="c-more"><button class="icon-btn" data-act="menu" aria-label="Mehr">' + ic('more') + '</button></div></div>';
  }

  function markPlaying() {
    const uri = S.player && S.player.track && S.player.track.uri;
    $$('.trow.now').forEach(r => { if (r.dataset.uri !== uri) r.classList.remove('now'); });
    if (uri) $$('.trow[data-uri="' + CSS.escape(uri) + '"]').forEach(r => r.classList.add('now'));
    document.body.classList.toggle('is-playing', !!(S.player && S.player.playing));
  }

  function trackMenu(anchor, t, o) {
    const liked = t.id && S.likedSet.has(t.id);
    const a = t.artists && t.artists[0];
    popup(anchor,
      '<div class="pop-title">' + esc(t.name) + '<small>' + esc(artistNames(t)) + '</small></div>' +
      '<button class="pop-item" data-k="queue">' + ic('queue') + '<span>Zur Warteschlange hinzufügen</span></button>' +
      '<button class="pop-item" data-k="like">' + ic(liked ? 'heartFill' : 'heart') + '<span>' + (liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen') + '</span></button>' +
      (a && a.id && !a.show ? '<button class="pop-item" data-k="artist">' + ic('artist') + '<span>Zum Künstler</span></button>' : '') +
      (t.album && t.album.id && !o.noAlbumLink ? '<button class="pop-item" data-k="album">' + ic('album') + '<span>Zum Album</span></button>' : '') +
      '<div class="pop-sep"></div>' +
      '<button class="pop-item" data-k="spotify">' + ic('external') + '<span>In Spotify öffnen</span></button>' +
      '<button class="pop-item" data-k="copy">' + ic('copy') + '<span>Link kopieren</span></button>',
      k => {
        if (k === 'queue') Player.queue(t);
        if (k === 'like') toggleLike(t);
        if (k === 'artist') location.hash = '#/artist/' + a.id;
        if (k === 'album') location.hash = '#/album/' + t.album.id;
        if (k === 'spotify') openInSpotify(t.uri);
        if (k === 'copy') Platform.copy(Spotify.webUrl(t.uri)).then(() => toast('Link kopiert'), () => toast(Spotify.webUrl(t.uri)));
      });
  }

  async function toggleLike(t) {
    if (!t) return;
    if (!t.id || t.local) { toast('Lokale Dateien kann Spotify nicht speichern'); return; }
    const was = S.likedSet.has(t.id);
    setLiked(t, !was);
    try {
      await sp.setSaved([t], !was);
      toast(was ? 'Aus Lieblingssongs entfernt' : 'Zu Lieblingssongs hinzugefügt');
      Store.set('liked', { total: S.likedTotal, tracks: S.liked });
    } catch (e) {
      setLiked(t, was);
      showError(e);
    }
  }

  function setLiked(t, on) {
    // Neue Arrays statt Ändern: angezeigte Listen behalten so ihre Indizes
    if (on) {
      S.likedSet.add(t.id);
      if (!S.liked.some(x => x.id === t.id)) S.liked = [Object.assign({}, t, { added: new Date().toISOString() })].concat(S.liked);
      S.likedTotal = (S.likedTotal || 0) + 1;
    } else {
      S.likedSet.delete(t.id);
      S.liked = S.liked.filter(x => x.id !== t.id);
      S.likedTotal = Math.max(0, (S.likedTotal || 1) - 1);
    }
    $$('.trow[data-uri="' + CSS.escape(t.uri) + '"] .like').forEach(b => {
      b.classList.toggle('on', on);
      b.innerHTML = ic(on ? 'heartFill' : 'heart');
    });
    renderPlayer();
    renderSideLib();
    const by = $('#liked-by');
    if (by) by.innerHTML = (S.me ? '<b>' + esc(S.me.name) + '</b> • ' : '') + plural(S.likedTotal, 'Song', 'Songs');
  }

  // ---------- Abspielen ----------

  function playTracks(tracks, i, o, order, shuffle) {
    const t = tracks[i];
    if (!t) return;
    if (!t.playable) { toast('Dieser Song ist in deinem Land nicht verfügbar'); return; }
    if (order) {
      const k = order.indexOf(t);
      return Player.playUris(order.slice(k, k + MAX_URIS).filter(x => x === t || !x.local).map(x => x.uri), shuffle);
    }
    const fallback = () => tracks.slice(i, i + MAX_URIS).filter(x => x === t || !x.local).map(x => x.uri);
    if (o.context && !t.local) return Player.playContext(o.context, t.uri, o.uriFallback ? fallback : null, shuffle);
    return Player.playUris(fallback(), shuffle);
  }

  function playUri(uri) {
    if (!uri) return;
    if (uri === likedContext()) {
      if (!S.liked.length) { toast('Keine Lieblingssongs'); return; }
      const k = 0;
      return Player.playContext(uri, S.liked[k].uri, () => S.liked.slice(0, MAX_URIS).map(t => t.uri));
    }
    if (/^spotify:(track|episode):/.test(uri)) return Player.playUris([uri]);
    return Player.playContext(uri);
  }

  const currentUri = () => S.player && S.player.track ? S.player.track.uri : '';

  // ---------- Ansichten ----------

  function homeView(_, seq) {
    const h = new Date().getHours();
    const greet = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
    setHero('#2b3a2f', '');
    viewEl.innerHTML = '<div class="page"><div class="home-head"><h1 class="greet">' + greet + (S.me ? ', ' + esc(S.me.name.split(' ')[0]) : '') + '</h1>' +
      '<a class="icon-btn show-m" href="#/settings" aria-label="Einstellungen">' + ic('settings') + '</a></div>' +
      '<div class="shortcuts" id="shortcuts"></div><div id="home-secs"></div></div>';

    function shortcuts() {
      const items = ['<a class="shortcut" href="#/liked"><div class="sc-img liked-img">' + ic('heartFill') + '</div><span>Lieblingssongs</span>' +
        (likedContext() ? '<button class="sc-play" data-play="' + esc(likedContext()) + '" aria-label="Abspielen">' + ic('play') + '</button>' : '') + '</a>'];
      for (const p of S.playlists.slice(0, 7)) {
        items.push('<a class="shortcut" href="#/playlist/' + esc(p.id) + '">' + cover(p.imgS || p.img, 'sc-img') + '<span>' + esc(p.name) + '</span>' +
          '<button class="sc-play" data-play="' + esc(p.uri) + '" aria-label="Abspielen">' + ic('play') + '</button></a>');
      }
      $('#shortcuts').innerHTML = items.join('');
    }

    function sections() {
      const H = S.home || {};
      const out = [];
      if (H.recent && H.recent.length) out.push(section('Zuletzt gehört', row(H.recent)));
      if (H.topTracks && H.topTracks.length) out.push(section('Deine Top-Songs diesen Monat', '<div class="tracks-slot" id="top-tracks"></div>'));
      if (H.topArtists && H.topArtists.length) out.push(section('Deine Top-Künstler', row(H.topArtists.map(artistCard))));
      const own = S.playlists.filter(isOwn), others = S.playlists.filter(p => !isOwn(p));
      if (own.length) out.push(section('Deine Playlists', row([likedCard()].concat(own.slice(0, 20).map(playlistCard))), '#/library'));
      if (others.length) out.push(section('Von anderen gespeichert', row(others.slice(0, 20).map(playlistCard)), '#/library'));
      if (S.albums.length) out.push(section('Deine Alben', row(S.albums.slice(0, 20).map(albumCard)), '#/library'));
      if (!out.length) out.push(S.syncing || !S.home ? loading('Deine Bibliothek wird geladen …') : '<p class="muted">Noch nichts in deiner Bibliothek.</p>');
      $('#home-secs').innerHTML = out.join('');
      const slot = $('#top-tracks');
      if (slot) mountTracks(slot, H.topTracks.slice(0, 5), { head: false, max: 5, album: true });
    }

    shortcuts();
    sections();
    viewRefresh = what => { if (what !== 'liked') { shortcuts(); sections(); } };
    if (!S.home || Date.now() - S.home.at > 5 * 60 * 1000) loadHome(seq, () => { if (alive(seq)) sections(); });
  }

  async function loadHome(seq, done) {
    const [recent, topTracks, topArtists] = await Promise.all([
      sp.recentlyPlayed().catch(() => []),
      sp.top('tracks', 'short_term').catch(() => []),
      sp.top('artists', 'medium_term').catch(() => []),
    ]);
    // Zuletzt gehört: Playlists/Alben aus dem Verlauf, sonst das Album des Songs
    const seen = new Set();
    const cards = [];
    for (const t of recent) {
      const ctx = t.context;
      let key = ctx, card = null;
      const pl = ctx && ctx.startsWith('spotify:playlist:') && S.playlists.find(p => p.uri === ctx);
      if (pl) card = playlistCard(pl);
      else if (ctx && ctx === likedContext()) card = likedCard();
      else if (ctx && ctx.startsWith('spotify:artist:')) {
        const a = S.artists.find(x => x.uri === ctx);
        if (a) card = artistCard(a);
      }
      if (!card && t.album && t.album.id) {
        key = t.album.uri;
        card = cardHtml({ href: '#/album/' + t.album.id, img: t.album.imgL || t.album.img, icon: 'album', title: t.album.name, sub: esc(artistNames(t)), play: t.album.uri });
      }
      if (card && !seen.has(key)) { seen.add(key); cards.push(card); }
      if (cards.length >= 12) break;
    }
    S.home = { at: Date.now(), recent: cards, topTracks, topArtists };
    done();
  }

  function libraryView() {
    setHero('#222', 'Deine Bibliothek');
    viewEl.innerHTML = '<div class="page lib-page"><h1 class="page-title">Deine Bibliothek</h1>' +
      '<div class="chips" data-chips></div>' +
      '<div class="lib-tools"><label class="mini-search">' + ic('search') + '<input data-libq placeholder="In Bibliothek suchen" value="' + esc(S.lib.q) + '"></label><button class="sort-btn" data-act="sort"></button></div>' +
      '<div class="lib-list big" data-liblist></div></div>';
    renderLibLists();
  }

  function likedView(_, seq) {
    setHero('#4a3aa8', 'Lieblingssongs');
    const by = () => (S.me ? '<b>' + esc(S.me.name) + '</b> • ' : '') + plural(S.likedTotal != null ? S.likedTotal : S.liked.length, 'Song', 'Songs');
    viewEl.innerHTML = '<div class="page-bg"></div>' + heroHtml({ kind: 'Playlist', title: 'Lieblingssongs', html: '<div class="himg liked-img">' + ic('heartFill') + '</div>', by: '<span id="liked-by">' + by() + '</span>' }) +
      '<div class="page">' + actionsHtml({ filter: 'Lieblingssongs', playAct: 'ctx-play' }) + '<div id="list"></div></div>';
    let list = null;
    const mount = () => {
      $('#liked-by').innerHTML = by();
      if (!S.liked.length && (S.syncing || !S.loaded)) { $('#list').innerHTML = loading('Lieblingssongs werden geladen …'); list = null; return; }
      list = mountTracks($('#list'), S.liked, { context: likedContext(), uriFallback: true, album: true, added: true, empty: 'Markiere Songs mit dem Herz, dann landen sie hier.' });
      const q = $('[data-trackq]');
      if (q && q.value) list.filter(q.value);
    };
    mount();
    bindHeroActions(() => list);
    viewRefresh = what => { if (what === 'liked' || !list) mount(); };
  }

  function bindHeroActions(getList, ctx) {
    const q = $('[data-trackq]');
    if (q) q.addEventListener('input', () => { const l = getList(); if (l) l.filter(q.value); });
    const actions = $('.actions');
    actions.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      e.stopPropagation();
      const l = getList();
      if (a.dataset.act === 'ctx-play') { if (l) l.playFirst(false); else if (ctx) Player.playContext(ctx()); }
      if (a.dataset.act === 'ctx-shuffle') { if (l) l.playFirst(true); else if (ctx) Player.playContext(ctx(), null, null, true); }
    });
  }

  async function playlistView(id, seq) {
    let meta = S.playlists.find(p => p.id === id) || null;
    let list = null;
    let embed = false;

    function header() {
      const own = meta && isOwn(meta);
      const by = meta ? '<b>' + esc(meta.owner.name) + '</b>' + (meta.total != null ? ' • ' + plural(meta.total, 'Song', 'Songs') : '') + '<span id="pl-len"></span>' : '';
      $('#pl-hero').innerHTML = heroHtml({ kind: meta ? (meta.collaborative ? 'Gemeinsame Playlist' : meta.public === false ? 'Private Playlist' : 'Playlist') : 'Playlist', title: meta ? meta.name : '…', desc: meta && meta.desc, img: meta && meta.img, by: by + (meta && !own ? ' <span class="tag">In deiner Bibliothek gespeichert</span>' : '') });
      if (meta) {
        $('#tb-title').textContent = meta.name;
        coverColor(meta.img, meta.id).then(c => { if (alive(seq)) setHero(c); });
      }
    }

    setHero(hashColor(id), meta ? meta.name : '');
    viewEl.innerHTML = '<div class="page-bg"></div><div id="pl-hero"></div><div class="page">' +
      actionsHtml({ filter: 'Playlist', uri: 'spotify:playlist:' + id }) + '<div id="list">' + loading('Songs werden geladen …') + '</div></div>';
    header();
    bindHeroActions(() => list, () => 'spotify:playlist:' + id);

    function show(tracks) {
      const ms = tracks.reduce((s, t) => s + t.ms, 0);
      const len = $('#pl-len');
      if (len && ms) len.textContent = ', ' + longDur(ms);
      list = mountTracks($('#list'), tracks, { context: 'spotify:playlist:' + id, album: true, added: true, empty: 'Diese Playlist ist leer.' });
      const q = $('[data-trackq]');
      if (q && q.value) list.filter(q.value);
    }

    function showEmbed() {
      embed = true;
      $('[data-trackq]') && $('[data-trackq]').closest('.mini-search').remove();
      $('#list').innerHTML = '<div class="notice">' + ic('info') + '<div><b>Songliste direkt von Spotify</b><br>' +
        'Die Songs von Playlists anderer Leute gibt Spotify seit Februar 2026 nicht mehr an selbst angelegte Apps heraus. ' +
        'Abspielen klappt trotzdem: Tippe oben auf ▶ oder auf Zufall. Unten siehst du die Liste im offiziellen Spotify-Player.</div></div>' +
        '<iframe class="embed" src="https://open.spotify.com/embed/playlist/' + encodeURIComponent(id) + '?utm_source=generator&amp;theme=0" ' +
        'allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify-Playlist"></iframe>';
    }

    try {
      const r = await sp.getPlaylist(id);
      if (!alive(seq)) return;
      meta = r.meta;
      header();
      const cached = await Store.get('pl:' + id);
      if (!alive(seq)) return;
      if (cached && cached.snapshot && cached.snapshot === meta.snapshot) { show(cached.tracks); return; }
      let tracks;
      if (r.firstItems && meta.total != null && r.firstItems.length >= meta.total) tracks = r.firstItems;
      else tracks = await sp.playlistTracks(id, (n, total) => { if (alive(seq) && !list) $('#list').innerHTML = loading('Songs werden geladen … ' + num(n) + ' von ' + num(total)); });
      if (!alive(seq)) return;
      show(tracks);
      Store.set('pl:' + id, { snapshot: meta.snapshot, tracks });
    } catch (e) {
      if (!alive(seq)) return;
      if (e.status === 403 || e.status === 404) {
        showEmbed();
      } else {
        const cached = await Store.get('pl:' + id);
        if (cached) show(cached.tracks); else $('#list').innerHTML = '<div class="empty">' + esc(explain(e).text) + '</div>';
      }
    }
    viewRefresh = () => {
      if (embed || !list) return;
      const m = S.playlists.find(p => p.id === id);
      if (m) meta = Object.assign({}, meta, { name: m.name, img: m.img, total: m.total });
    };
  }

  async function albumView(id, seq) {
    let list = null;
    let saved = S.albums.find(a => a.id === id);
    setHero(hashColor(id), saved ? saved.name : '');
    viewEl.innerHTML = '<div class="page-bg"></div><div id="al-hero">' + heroHtml({ kind: 'Album', title: saved ? saved.name : '…', img: saved && saved.img, icon: 'album', by: saved ? artistLinks(saved.artists) : '' }) +
      '</div><div class="page">' + actionsHtml({ uri: 'spotify:album:' + id }) + '<div id="list">' + loading() + '</div></div>';
    bindHeroActions(() => list, () => 'spotify:album:' + id);
    try {
      const r = await sp.getAlbum(id);
      if (!alive(seq)) return;
      const a = r.meta;
      const ms = r.tracks.reduce((s, t) => s + t.ms, 0);
      const kind = a.type === 'single' ? 'Single' : a.type === 'compilation' ? 'Kompilation' : 'Album';
      $('#al-hero').innerHTML = heroHtml({ kind, title: a.name, img: a.img, icon: 'album', by: artistLinks(a.artists).replace(/<a /, '<a class="b" ') + (a.year ? ' • ' + a.year : '') + ' • ' + plural(r.tracks.length, 'Song', 'Songs') + ', ' + longDur(ms) });
      $('#tb-title').textContent = a.name;
      coverColor(a.img, a.id).then(c => { if (alive(seq)) setHero(c); });
      list = mountTracks($('#list'), r.tracks, { context: a.uri, cover: false, trackNo: true, noAlbumLink: true });
      if (a.copyright) $('#list').insertAdjacentHTML('afterend', '<p class="copyright">' + esc(a.copyright) + '</p>');
    } catch (e) {
      if (alive(seq)) $('#list').innerHTML = '<div class="empty">' + esc(explain(e).text) + '</div>';
    }
  }

  async function artistView(id, seq) {
    const known = S.artists.find(a => a.id === id);
    setHero(hashColor(id), known ? known.name : '');
    viewEl.innerHTML = '<div class="page-bg"></div><div id="ar-hero">' + heroHtml({ kind: 'Künstler', title: known ? known.name : '…', img: known && known.img, icon: 'artist', round: true, by: '' }) +
      '</div><div class="page">' + actionsHtml({ uri: 'spotify:artist:' + id, shuffle: false }) + '<div id="ar-secs">' + loading() + '</div></div>';
    bindHeroActions(() => null, () => 'spotify:artist:' + id);
    try {
      const a = await sp.getArtist(id);
      if (!alive(seq)) return;
      const likedHere = S.liked.filter(t => t.artists.some(x => x.id === id));
      $('#ar-hero').innerHTML = heroHtml({ kind: 'Künstler', title: a.name, img: a.img, icon: 'artist', round: true, by: (a.genres.length ? esc(a.genres.slice(0, 3).join(', ')) : '') + (likedHere.length ? (a.genres.length ? ' • ' : '') + plural(likedHere.length, 'Lieblingssong', 'Lieblingssongs') : '') });
      $('#tb-title').textContent = a.name;
      coverColor(a.img, a.id).then(c => { if (alive(seq)) setHero(c); });
      const q = 'artist:"' + a.name.replace(/"/g, '') + '"';
      const [songs, albums] = await Promise.all([
        sp.search(q, ['track']).then(r => r.tracks.filter(t => t.artists.some(x => x.id === id))).catch(() => []),
        sp.artistAlbums(id).catch(() => sp.search(q, ['album']).then(r => r.albums.filter(x => x.artists.some(y => y.id === id))).catch(() => [])),
      ]);
      if (!alive(seq)) return;
      const secs = [];
      if (likedHere.length) secs.push(section('Deine Lieblingssongs', '<div class="tracks-slot" id="ar-liked"></div>'));
      if (songs.length) secs.push(section('Songs', '<div class="tracks-slot" id="ar-songs"></div>'));
      if (albums.length) secs.push(section('Alben und Singles', row(albums.map(albumCard))));
      $('#ar-secs').innerHTML = secs.join('') || '<p class="muted">Keine weiteren Infos verfügbar.</p>';
      if (likedHere.length) mountTracks($('#ar-liked'), likedHere, { head: false, album: true, max: 50, context: likedContext(), uriFallback: true });
      if (songs.length) mountTracks($('#ar-songs'), songs, { head: false, album: true, max: 10 });
    } catch (e) {
      if (alive(seq)) $('#ar-secs').innerHTML = '<div class="empty">' + esc(explain(e).text) + '</div>';
    }
  }

  function searchView(_, seq) {
    setHero('#1f1f1f', 'Suchen');
    viewEl.innerHTML = '<div class="page"><h1 class="page-title show-m">Suchen</h1><label class="searchbox">' + ic('search') +
      '<input id="q" type="search" placeholder="Was möchtest du hören?" autocomplete="off" value="' + esc(S.lastQuery) + '"></label><div id="results"></div></div>';
    const input = $('#q');
    let timer = null;
    let token = 0;
    const run = async () => {
      const q = input.value.trim();
      S.lastQuery = input.value;
      const my = ++token;
      if (!q) { browse(); return; }
      const lq = q.toLowerCase();
      const likedHits = S.liked.filter(t => (t.name + ' ' + artistNames(t) + ' ' + (t.album ? t.album.name : '')).toLowerCase().includes(lq));
      const plHits = S.playlists.filter(p => (p.name + ' ' + p.owner.name).toLowerCase().includes(lq));
      const localHtml = () => (plHits.length ? section('In deiner Bibliothek', row(plHits.slice(0, 12).map(playlistCard))) : '') +
        (likedHits.length ? section('In deinen Lieblingssongs (' + num(likedHits.length) + ')', '<div class="tracks-slot" id="r-liked"></div>') : '');
      const mountLocal = () => { if ($('#r-liked')) mountTracks($('#r-liked'), likedHits, { head: false, album: true, max: 8, context: likedContext(), uriFallback: true }); };
      $('#results').innerHTML = localHtml() + loading('Suche bei Spotify …');
      mountLocal();
      try {
        const r = await sp.search(q);
        if (my !== token || !alive(seq)) return;
        const secs = [];
        if (r.tracks.length) secs.push(section('Songs', '<div class="tracks-slot" id="r-songs"></div>'));
        if (r.artists.length) secs.push(section('Künstler', row(r.artists.map(artistCard))));
        if (r.albums.length) secs.push(section('Alben', row(r.albums.map(albumCard))));
        if (r.playlists.length) secs.push(section('Playlists', row(r.playlists.map(playlistCard))));
        $('#results').innerHTML = secs.join('') + localHtml() || '<div class="empty">Keine Treffer für „' + esc(q) + '“</div>';
        if (r.tracks.length) mountTracks($('#r-songs'), r.tracks, { head: false, album: true, max: 10 });
        mountLocal();
      } catch (e) {
        if (my === token && alive(seq)) { $('#results').innerHTML = localHtml() + '<div class="empty">' + esc(explain(e).text) + '</div>'; mountLocal(); }
      }
    };
    function browse() {
      const own = S.playlists.filter(isOwn).length, others = S.playlists.length - own;
      const tiles = [
        ['#/liked', 'Lieblingssongs', plural(S.likedTotal || S.liked.length, 'Song', 'Songs'), '#5038a0'],
        ['#/library', 'Deine Playlists', plural(own, 'Playlist', 'Playlists'), '#1e7a4e', 'own'],
        ['#/library', 'Von anderen gespeichert', plural(others, 'Playlist', 'Playlists'), '#b0521f', 'others'],
        ['#/library', 'Alben', plural(S.albums.length, 'Album', 'Alben'), '#8c1d4f', 'albums'],
        ['#/library', 'Künstler', plural(S.artists.length, 'Künstler', 'Künstler'), '#1d5a8c', 'artists'],
      ];
      $('#results').innerHTML = section('Deine Bibliothek durchstöbern', '<div class="tiles">' + tiles.map(t =>
        '<a class="tile" href="' + t[0] + '"' + (t[4] ? ' data-filter="' + t[4] + '"' : '') + ' style="background:' + t[3] + '"><b>' + esc(t[1]) + '</b><span>' + esc(t[2]) + '</span></a>').join('') + '</div>');
      $$('[data-filter]', $('#results')).forEach(a => a.addEventListener('click', () => { S.lib.filter = a.dataset.filter; local('kr.libFilter', S.lib.filter); }));
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 320); });
    run();
    if (!coarse) input.focus();
  }

  function settingsView() {
    setHero('#262626', 'Einstellungen');
    const own = S.playlists.filter(isOwn).length;
    viewEl.innerHTML = '<div class="page settings"><h1 class="page-title">Einstellungen</h1>' +
      '<section class="set-card"><h2>Konto</h2><div class="acct">' + (S.me && S.me.img ? '<img src="' + esc(S.me.img) + '" alt="">' : '<div class="acct-ph">' + ic('user') + '</div>') +
      '<div><b>' + esc(S.me ? S.me.name : '–') + '</b><small>Spotify-Konto' + (S.me ? ' • ' + esc(S.me.id) : '') + '</small></div></div>' +
      '<button class="btn btn-ghost" data-set="logout">' + ic('logout') + 'Abmelden</button></section>' +
      '<section class="set-card"><h2>Bibliothek</h2><div class="stats">' +
      '<div><b>' + num(own) + '</b><span>eigene Playlists</span></div><div><b>' + num(S.playlists.length - own) + '</b><span>von anderen</span></div>' +
      '<div><b>' + num(S.likedTotal != null ? S.likedTotal : S.liked.length) + '</b><span>Lieblingssongs</span></div><div><b>' + num(S.albums.length) + '</b><span>Alben</span></div>' +
      '<div><b>' + num(S.artists.length) + '</b><span>Künstler</span></div></div>' +
      '<div class="set-btns"><button class="btn btn-ghost" data-set="sync">' + ic('refresh') + 'Neu laden</button><button class="btn btn-ghost" data-set="clear">Zwischenspeicher leeren</button></div></section>' +
      '<section class="set-card"><h2>Wiedergabe</h2><p class="muted">Klangraum steuert die Musik über Spotify Connect – sie läuft in der Spotify-App auf diesem oder einem anderen Gerät (PC, Handy, Lautsprecher, Web-Player). Dafür ist Spotify Premium nötig. Unten im Player wählst du das Gerät mit ' + ic('devices') + '.</p>' +
      '<div class="set-btns"><button class="btn btn-ghost" data-set="spotify">' + ic('external') + 'Spotify-App öffnen</button>' + (Platform.kind !== 'android' ? '<button class="btn btn-ghost" data-ext="https://open.spotify.com/">Web-Player öffnen</button>' : '') + '</div></section>' +
      '<section class="set-card"><h2>Spotify-Entwickler-App</h2><p class="muted">Client-ID: <code>' + esc(sp.clientId ? sp.clientId.slice(0, 6) + '…' + sp.clientId.slice(-4) : '–') + '</code><br>Redirect-URIs: ' + Platform.redirectUris.map(u => '<code>' + esc(u) + '</code>').join(' ') + '</p>' +
      '<div class="set-btns"><button class="btn btn-ghost" data-ext="https://developer.spotify.com/dashboard">Dashboard öffnen</button><button class="btn btn-ghost" data-set="cid">Client-ID ändern</button></div></section>' +
      '<section class="set-card"><h2>Über Klangraum</h2><p class="muted">Version ' + esc(Platform.version) + ' (' + esc({ desktop: 'Windows-App', android: 'Android-App', web: 'Browser' }[Platform.kind]) + ').<br>' +
      'Klangraum ist kein offizielles Spotify-Produkt. Musik, Cover und Daten stammen von Spotify und gehören den jeweiligen Rechteinhabern.</p></section></div>';
    viewEl.addEventListener('click', e => {
      const b = e.target.closest('[data-set]');
      if (!b) return;
      const k = b.dataset.set;
      if (k === 'logout') logout();
      if (k === 'sync') syncLibrary(true);
      if (k === 'spotify') openInSpotify('');
      if (k === 'clear') {
        Store.clear().then(() => { toast('Zwischenspeicher geleert'); syncLibrary(false); });
      }
      if (k === 'cid') {
        modal({ title: 'Client-ID ändern?', html: '<p>Du wirst abgemeldet und kannst danach eine andere Client-ID eintragen.</p>', actions: [{ label: 'Abbrechen' }, { label: 'Ändern', primary: true, onClick: () => { logout(); } }] });
      }
    });
  }

  // ---------- Player ----------

  const Player = {
    timer: null,
    seeking: false,
    volTimer: null,

    start() {
      this.loop();
      setInterval(() => this.tick(), 500);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.soon(50); });
    },

    async loop() {
      clearTimeout(this.timer);
      if (!document.hidden && sp.isLoggedIn()) await this.refresh();
      const p = S.player;
      this.timer = setTimeout(() => this.loop(), document.hidden ? 20000 : p && p.playing ? 3000 : 6000);
    },

    soon(ms) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.loop(), ms == null ? 700 : ms);
    },

    async refresh() {
      try {
        S.player = await sp.player.state();
      } catch (e) {
        if (e.auth) return;
        // Ohne Premium oder ohne Gerät gibt es keinen Status – kein Grund für eine Meldung
      }
      renderPlayer();
      markPlaying();
    },

    pos() {
      const p = S.player;
      if (!p) return 0;
      const ms = p.progress + (p.playing ? Date.now() - p.at : 0);
      return Math.min(ms, p.track ? p.track.ms : ms);
    },

    tick() {
      const p = S.player;
      if (!p || !p.track) return;
      const ms = this.pos();
      if (!this.seeking) setProgress(ms, p.track.ms);
      if (p.playing && ms >= p.track.ms - 300 && Date.now() - p.at > 1500) this.soon(400);
    },

    /** Führt einen Player-Befehl aus; ohne aktives Gerät wird eins gewählt bzw. auf Spotify gewartet. */
    async run(fn) {
      try {
        await fn(undefined);
      } catch (e) {
        if (!isNoDevice(e)) { showError(e); this.soon(); return; }
        const device = await this.chooseDevice();
        if (!device) return;
        try { await fn(device); } catch (err) { showError(err); }
      }
      this.soon(600);
    },

    async chooseDevice() {
      const devices = await sp.player.devices().catch(() => []);
      const preferred = Platform.kind === 'android' ? 'Smartphone' : 'Computer';
      const pick = devices.find(d => d.id === S.device) || devices.find(d => d.is_active) || devices.find(d => d.type === preferred) || devices[0];
      if (pick) { this.remember(pick.id); return pick.id; }
      return this.waitForDevice();
    },

    remember(id) { S.device = id; local('kr.device', id); },

    waitForDevice() {
      return new Promise(resolve => {
        let stopped = false;
        const where = Platform.kind === 'android' ? 'hier auf dem Handy' : 'hier auf dem PC';
        const m = modal({
          title: 'Spotify öffnen',
          html: '<p>Klangraum steuert die Musik über Spotify Connect. Öffne Spotify ' + where + ' (oder auf einem anderen Gerät mit demselben Konto) – dann geht es automatisch los.</p>' +
            '<div class="wait" id="dev-wait"><span class="spinner"></span><span>Suche nach Spotify-Geräten …</span></div>',
          actions: [
            { label: 'Abbrechen' },
            ...(Platform.kind !== 'android' ? [{ label: 'Web-Player', onClick: () => { Platform.openExternal('https://open.spotify.com/'); return false; } }] : []),
            { label: 'Spotify öffnen', primary: true, onClick: () => { if (Platform.openSpotify('') === false) toast('Spotify-App nicht gefunden'); return false; } },
          ],
          onClose: v => { stopped = true; resolve(v); },
        });
        const started = Date.now();
        const poll = async () => {
          if (stopped) return;
          const devices = await sp.player.devices().catch(() => []);
          if (stopped) return;
          if (devices.length) {
            const preferred = Platform.kind === 'android' ? 'Smartphone' : 'Computer';
            const d = devices.find(x => x.is_active) || devices.find(x => x.type === preferred) || devices[0];
            this.remember(d.id);
            m.close(d.id);
            return;
          }
          if (Date.now() - started > 30000) {
            const w = $('#dev-wait');
            if (w) w.innerHTML = '<span class="spinner"></span><span>Noch kein Gerät gefunden. Ist Spotify geöffnet und mit demselben Konto angemeldet?</span>';
          }
          setTimeout(poll, 2000);
        };
        setTimeout(poll, 1200);
      });
    },

    playContext(context, offsetUri, fallback, shuffle) {
      return this.run(async device => {
        if (shuffle !== undefined) await sp.player.shuffle(!!shuffle, device).catch(e => { if (isNoDevice(e)) throw e; });
        try {
          await sp.player.play(Object.assign({ context_uri: context }, offsetUri ? { offset: { uri: offsetUri } } : {}), device);
        } catch (e) {
          if (!fallback || isNoDevice(e) || e.reason === 'PREMIUM_REQUIRED') throw e;
          await sp.player.play({ uris: fallback() }, device);
        }
      });
    },

    playUris(uris, shuffle) {
      if (!uris.length) return;
      return this.run(async device => {
        if (shuffle !== undefined) await sp.player.shuffle(!!shuffle, device).catch(e => { if (isNoDevice(e)) throw e; });
        await sp.player.play({ uris }, device);
      });
    },

    queue(t) {
      return this.run(device => sp.player.queue(t.uri, device).then(() => toast('Zur Warteschlange hinzugefügt')));
    },

    toggle() {
      const p = S.player;
      if (p && p.track) {
        const play = !p.playing;
        p.progress = this.pos();
        p.at = Date.now();
        p.playing = play;
        renderPlayer();
        markPlaying();
        return this.run(d => (play ? sp.player.resume(d) : sp.player.pause(d)));
      }
      if (S.liked.length) return playUri(likedContext());
      return this.run(d => sp.player.resume(d));
    },

    action(act, el) {
      const p = S.player;
      switch (act) {
        case 'toggle': this.toggle(); break;
        case 'next': this.run(d => sp.player.next(d)); break;
        case 'prev':
          if (p && this.pos() > 4000) { p.progress = 0; p.at = Date.now(); this.run(d => sp.player.seek(0, d)); }
          else this.run(d => sp.player.previous(d));
          break;
        case 'shuffle': if (p) { p.shuffle = !p.shuffle; renderPlayer(); this.run(d => sp.player.shuffle(p.shuffle, d)); } break;
        case 'repeat': if (p) { p.repeat = { off: 'context', context: 'track', track: 'off' }[p.repeat] || 'off'; renderPlayer(); this.run(d => sp.player.repeat(p.repeat, d)); } break;
        case 'devices': showDevices(el); break;
        case 'mute': if (p && p.device) this.setVolume(p.device.volume > 0 ? 0 : (Number(local('kr.vol')) || 50)); break;
        case 'like-current': if (p && p.track) toggleLike(p.track); break;
        case 'full': openFull(); break;
        case 'close-full': closeFull(); break;
        case 'np-artist': if (p && p.track && p.track.artists[0] && p.track.artists[0].id) location.hash = '#/artist/' + p.track.artists[0].id; break;
        case 'np-context': if (p) goToContext(p.context, p.track); break;
        default: break;
      }
    },

    seekTo(ms) {
      const p = S.player;
      if (!p) return;
      p.progress = ms;
      p.at = Date.now();
      this.run(d => sp.player.seek(ms, d));
    },

    setVolume(v) {
      const p = S.player;
      if (!p || !p.device) return;
      if (v > 0) local('kr.vol', String(Math.round(v)));
      p.device.volume = v;
      renderPlayer();
      clearTimeout(this.volTimer);
      this.volTimer = setTimeout(() => this.run(d => sp.player.volume(v, d)), 220);
    },
  };

  function isNoDevice(e) {
    return !!e && (e.reason === 'NO_ACTIVE_DEVICE' || (e.status === 404 && /device/i.test(e.message || '')));
  }

  function goToContext(ctx, t) {
    const m = /^spotify:(playlist|album|artist):(.+)$/.exec(ctx || '');
    if (m) { location.hash = '#/' + m[1] + '/' + m[2]; return; }
    if (ctx && ctx === likedContext()) { location.hash = '#/liked'; return; }
    if (t && t.album && t.album.id) location.hash = '#/album/' + t.album.id;
  }

  function contextName(ctx) {
    if (!ctx) return '';
    if (ctx === likedContext()) return 'Lieblingssongs';
    const p = S.playlists.find(x => x.uri === ctx);
    if (p) return p.name;
    const a = S.albums.find(x => x.uri === ctx) || S.artists.find(x => x.uri === ctx);
    return a ? a.name : '';
  }

  const DEVICE_TYPES = { Computer: 'Computer', Smartphone: 'Smartphone', Speaker: 'Lautsprecher', TV: 'Fernseher', CastVideo: 'Chromecast', CastAudio: 'Chromecast', Tablet: 'Tablet', GameConsole: 'Konsole', Automobile: 'Auto' };
  const devIcon = type => (type === 'Smartphone' || type === 'Tablet' ? 'phone' : type === 'Computer' ? 'computer' : 'speaker');

  async function showDevices(anchor) {
    const pop = popup(anchor, '<div class="pop-title">Gerät auswählen</div><div class="pop-wait"><span class="spinner small"></span>Suche Geräte …</div>', pick);
    const devices = await sp.player.devices().catch(e => { if (e.reason === 'PREMIUM_REQUIRED') showError(e); return []; });
    if (openPopup !== pop) return;
    pop.set('<div class="pop-title">Gerät auswählen</div>' +
      (devices.map(d => '<button class="pop-item dev' + (d.is_active ? ' on' : '') + '" data-k="' + esc(d.id) + '">' + ic(devIcon(d.type)) +
        '<span><b>' + esc(d.name) + '</b><small>' + (d.is_active ? 'Wird gerade abgespielt' : esc(DEVICE_TYPES[d.type] || d.type)) + '</small></span></button>').join('') ||
        '<div class="pop-empty">Kein Spotify-Gerät gefunden. Öffne Spotify auf dem PC, dem Handy oder im Browser – mit demselben Konto.</div>') +
      '<div class="pop-sep"></div><button class="pop-item" data-k="__app">' + ic('external') + '<span>Spotify-App öffnen</span></button>' +
      (Platform.kind !== 'android' ? '<button class="pop-item" data-k="__web">' + ic('external') + '<span>Spotify im Browser öffnen</span></button>' : ''));

    function pick(k) {
      if (k === '__app') { if (Platform.openSpotify('') === false) toast('Spotify-App nicht gefunden'); return; }
      if (k === '__web') { Platform.openExternal('https://open.spotify.com/'); return; }
      Player.remember(k);
      sp.player.transfer(k, true).then(() => { toast('Wiedergabe gewechselt'); Player.soon(800); }, showError);
    }
  }

  // Player-Leiste: einmal aufbauen, danach nur Werte setzen (damit Schieberegler nicht springen)
  function buildPlayer() {
    lastArt = '';
    lastNp = null;
    $('#player').innerHTML =
      '<div class="np"><div class="np-cover" data-act="full"></div><div class="np-meta" data-act="full"><div class="np-t"></div><div class="np-a"></div></div>' +
      '<button class="icon-btn np-like" data-act="like-current" aria-label="Lieblingssong"></button></div>' +
      '<div class="ctl"><div class="ctl-btns">' +
      '<button class="icon-btn" data-act="shuffle" aria-label="Zufallswiedergabe">' + ic('shuffle') + '</button>' +
      '<button class="icon-btn" data-act="prev" aria-label="Zurück">' + ic('prev') + '</button>' +
      '<button class="pp" data-act="toggle" aria-label="Abspielen/Pause"></button>' +
      '<button class="icon-btn" data-act="next" aria-label="Weiter">' + ic('next') + '</button>' +
      '<button class="icon-btn" data-act="repeat" aria-label="Wiederholen"></button></div>' +
      '<div class="ctl-bar"><span class="t-cur">0:00</span><input type="range" class="range seek" min="0" max="1000" value="0" aria-label="Position"><span class="t-dur">0:00</span></div></div>' +
      '<div class="extra"><button class="icon-btn dev-btn" data-act="devices" aria-label="Geräte">' + ic('devices') + '</button>' +
      '<button class="icon-btn vol-btn" data-act="mute" aria-label="Lautstärke"></button><input type="range" class="range vol" min="0" max="100" value="50" aria-label="Lautstärke"></div>' +
      '<button class="icon-btn mini-dev" data-act="devices" aria-label="Geräte">' + ic('devices') + '</button>' +
      '<button class="mini-pp" data-act="toggle" aria-label="Abspielen/Pause"></button>' +
      '<div class="mini-progress"><i></i></div><div class="dev-line"></div>';

    $('#full').innerHTML =
      '<div class="full-bg"></div><div class="full-inner">' +
      '<div class="full-top"><button class="icon-btn" data-act="close-full" aria-label="Schließen">' + ic('down') + '</button>' +
      '<button class="full-ctx" data-act="np-context"><small>Wiedergabe von</small><b></b></button><button class="icon-btn" data-act="devices" aria-label="Geräte">' + ic('devices') + '</button></div>' +
      '<div class="full-art"></div>' +
      '<div class="full-meta"><div><div class="full-t"></div><button class="full-a" data-act="np-artist"></button></div><button class="icon-btn np-like big" data-act="like-current" aria-label="Lieblingssong"></button></div>' +
      '<input type="range" class="range seek" min="0" max="1000" value="0" aria-label="Position"><div class="full-times"><span class="t-cur">0:00</span><span class="t-dur">0:00</span></div>' +
      '<div class="full-btns"><button class="icon-btn" data-act="shuffle">' + ic('shuffle') + '</button><button class="icon-btn big" data-act="prev">' + ic('prev') + '</button>' +
      '<button class="pp big" data-act="toggle"></button><button class="icon-btn big" data-act="next">' + ic('next') + '</button><button class="icon-btn" data-act="repeat"></button></div>' +
      '<div class="dev-line full-dev"></div></div>';

    $('#full').addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (a) Player.action(a.dataset.act, a, e);
    });

    $$('.seek').forEach(r => {
      const startSeek = () => { Player.seeking = true; };
      r.addEventListener('pointerdown', startSeek);
      r.addEventListener('touchstart', startSeek, { passive: true });
      r.addEventListener('input', () => {
        Player.seeking = true;
        const p = S.player;
        if (p && p.track) { const ms = r.value / 1000 * p.track.ms; $$('.t-cur').forEach(x => { x.textContent = dur(ms); }); paintRange(r); }
      });
      r.addEventListener('change', () => {
        const p = S.player;
        Player.seeking = false;
        if (p && p.track) Player.seekTo(r.value / 1000 * p.track.ms);
      });
    });
    const vol = $('.vol');
    vol.addEventListener('input', () => { paintRange(vol); Player.setVolume(Number(vol.value)); });
    renderPlayer();
  }

  function paintRange(r) {
    r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%');
  }

  function setProgress(ms, total) {
    $$('.seek').forEach(r => { r.value = total ? Math.round(ms / total * 1000) : 0; paintRange(r); });
    $$('.t-cur').forEach(x => { x.textContent = dur(ms); });
    const bar = $('.mini-progress i');
    if (bar) bar.style.width = (total ? ms / total * 100 : 0) + '%';
  }

  let lastArt = '', lastNp = null;

  function renderPlayer() {
    const el = $('#player');
    if (!el) return;
    const p = S.player;
    const t = p && p.track;
    const liked = t && t.id && S.likedSet.has(t.id);
    el.classList.toggle('idle', !t);
    const npImg = t ? (t.album && (t.album.img || t.album.imgL)) || '' : null;
    if (npImg !== lastNp) {
      lastNp = npImg;
      $('.np-cover', el).innerHTML = t ? cover(npImg, 'np-img') : '<div class="np-img ph">' + ic('note') + '</div>';
      // Mini-Player auf dem Handy in der Farbe des Covers
      if (t) coverColor(npImg, t.uri).then(c => el.style.setProperty('--np', c));
    }
    $('.np-t', el).innerHTML = t ? (t.album && t.album.id ? '<a href="#/album/' + esc(t.album.id) + '">' + esc(t.name) + '</a>' : esc(t.name)) : 'Gerade läuft nichts';
    $('.np-a', el).innerHTML = t ? artistLinks(t.artists) : 'Wähle einen Song – oder öffne Spotify auf einem Gerät';
    $$('.np-like').forEach(b => { b.hidden = !t || !t.id; b.classList.toggle('on', !!liked); b.innerHTML = ic(liked ? 'heartFill' : 'heart'); });
    $$('.pp, .mini-pp').forEach(b => { b.innerHTML = ic(p && p.playing ? 'pause' : 'play'); });
    $$('[data-act="shuffle"]').forEach(b => b.classList.toggle('on', !!(p && p.shuffle)));
    $$('[data-act="repeat"]').forEach(b => { b.classList.toggle('on', !!(p && p.repeat !== 'off')); b.innerHTML = ic(p && p.repeat === 'track' ? 'repeatOne' : 'repeat'); });
    const dis = p ? p.disallows : {};
    $$('[data-act="prev"]').forEach(b => { b.disabled = !!(dis.skipping_prev && !(p && Player.pos() > 4000)); });
    $$('[data-act="next"]').forEach(b => { b.disabled = !!dis.skipping_next; });
    $$('.t-dur').forEach(x => { x.textContent = t ? dur(t.ms) : '0:00'; });
    if (!Player.seeking) setProgress(t ? Player.pos() : 0, t ? t.ms : 0);
    const d = p && p.device;
    const vol = $('.vol', el);
    vol.disabled = !d || !d.canVolume;
    if (d && typeof d.volume === 'number' && document.activeElement !== vol) { vol.value = d.volume; }
    paintRange(vol);
    $('.vol-btn', el).innerHTML = ic(d && d.volume === 0 ? 'volumeOff' : 'volume');
    $$('.dev-line').forEach(x => { x.innerHTML = d ? ic(devIcon(d.type)) + '<span>' + (p.playing ? 'Läuft auf ' : 'Bereit auf ') + esc(d.name) + '</span>' : ''; });
    $$('.dev-btn, .mini-dev').forEach(b => b.classList.toggle('on', !!d));
    // Vollbild-Player
    const full = $('#full');
    if (full) {
      $('.full-t', full).textContent = t ? t.name : 'Gerade läuft nichts';
      $('.full-a', full).textContent = t ? artistNames(t) : '';
      $('.full-ctx b', full).textContent = p ? (contextName(p.context) || (t && t.album ? t.album.name : '')) : '';
      const art = t && t.album && (t.album.imgL || t.album.img);
      if (art !== lastArt) {
        lastArt = art;
        $('.full-art', full).innerHTML = art ? '<img src="' + esc(art) + '" alt="">' : '<div class="ph">' + ic('note') + '</div>';
        coverColor(art, t && t.uri).then(c => full.style.setProperty('--hero', c));
      }
    }
    document.title = t ? t.name + ' • ' + artistNames(t) : 'Klangraum';
  }

  let removeFullLayer = null;

  function openFull() {
    const full = $('#full');
    if (!full || !full.hidden) return;
    full.hidden = false;
    requestAnimationFrame(() => full.classList.add('open'));
    removeFullLayer = pushLayer(closeFull);
  }

  function closeFull() {
    const full = $('#full');
    if (!full || full.hidden) return;
    full.classList.remove('open');
    setTimeout(() => { full.hidden = true; }, 220);
    if (removeFullLayer) { removeFullLayer(); removeFullLayer = null; }
  }

  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea') || !document.body.classList.contains('has-shell')) return;
      if (e.code === 'Space') { e.preventDefault(); Player.toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') Player.action('next');
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') Player.action('prev');
      if (e.key === 'Escape') closeTopLayer();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); location.hash = '#/search'; }
    });
  }

  // ---------- Schnittstelle für die Android-Hülle ----------

  window.KR = {
    /** Zurück-Taste: true, wenn die App sie selbst behandelt hat. */
    back() {
      if (closeTopLayer()) return true;
      if (document.body.classList.contains('has-shell') && !/^#?\/?(home)?$/.test(location.hash)) { history.back(); return true; }
      return false;
    },
    onResume() { if (sp.isLoggedIn()) Player.soon(50); },
    onAuthCallback(url) {
      if (Platform._authCallback(url)) return;
      // App wurde zwischendurch neu gestartet: Anmeldung direkt abschließen
      sp.finishLogin(url).then(start, e => renderSetup(e));
    },
  };

  boot();
})();

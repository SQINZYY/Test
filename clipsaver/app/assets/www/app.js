/* ClipSaver – Oberfläche. Spricht über window.Android mit der App (MainActivity.Bridge);
   Antworten kommen als Aufrufe von window.CS.* zurück. */
(function () {
  'use strict';

  var A = window.Android;
  var $ = function (sel) { return document.querySelector(sel); };

  // ---------- Icons (Strich-Icons, 24er-Raster) ----------
  var ICONS = {
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
    ad: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3.8A.8.8 0 0 1 9.8 3h4.4a.8.8 0 0 1 .8.8v.7M9 11h6M9 15h4"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
    music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M10 9.5v5l4-2.5z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
    alert: '<path d="M12 8.5v4.5M12 16.5h.01"/><path d="M10.3 4.3L2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    more: '<circle cx="12" cy="5.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18.5" r="1.2"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    trend: '<path d="M4 16l5-5 4 4 7-7M15 8h5v5"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  // ---------- Hilfen ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load(key) { try { return A && A.load(key); } catch (e) { return null; } }
  function save(key, val) { try { if (A) A.save(key, val); } catch (e) { /* egal */ } }
  function parse(json, fallback) { try { return JSON.parse(json); } catch (e) { return fallback; } }
  function fmtSize(b) {
    if (!b || b <= 0) return '';
    if (b >= 1e9) return (b / 1e9).toFixed(1).replace('.', ',') + ' GB';
    if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
    return Math.max(1, Math.round(b / 1e3)) + ' KB';
  }
  function fmtDur(s) {
    s = Math.round(s || 0);
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function fmtDate(t) {
    var d = new Date(t), now = new Date();
    var hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'heute ' + hm;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'gestern ' + hm;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function resLabel(target) { return target >= 2160 ? '4K' : target + 'p'; }
  function resName(target) { return { 1080: 'Full HD', 1440: '2K', 2160: 'Ultra HD' }[target] || ''; }
  var PLATFORMS = {
    tiktok: 'TikTok', youtube: 'YouTube', ads: 'Werbung', instagram: 'Instagram', twitter: 'X', facebook: 'Facebook',
    reddit: 'Reddit', pinterest: 'Pinterest', snapchat: 'Snapchat', threads: 'Threads', bluesky: 'Bluesky', vimeo: 'Vimeo',
    twitch: 'Twitch', tumblr: 'Tumblr', linkedin: 'LinkedIn', dailymotion: 'Dailymotion', soundcloud: 'SoundCloud',
    imgur: 'Imgur', flickr: 'Flickr', vk: 'VK', bilibili: 'Bilibili', kick: 'Kick', '9gag': '9GAG', likee: 'Likee', other: ''
  };
  function platformName(p) {
    if (Object.prototype.hasOwnProperty.call(PLATFORMS, p)) return PLATFORMS[p];
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
  }
  // Anmeldung im eingebauten Browser je Plattform (Cookies landen in cookies.txt für yt-dlp und gallery-dl)
  var LOGINS = {
    tiktok: { domain: 'tiktok.com', url: 'https://www.tiktok.com/login' },
    youtube: { domain: 'youtube.com', url: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F' },
    instagram: { domain: 'instagram.com', url: 'https://www.instagram.com/accounts/login/' },
    twitter: { domain: 'x.com', url: 'https://x.com/i/flow/login' },
    facebook: { domain: 'facebook.com', url: 'https://m.facebook.com/login/' },
    threads: { domain: 'threads.net', url: 'https://www.threads.net/login' },
    reddit: { domain: 'reddit.com', url: 'https://www.reddit.com/login/' },
    pinterest: { domain: 'pinterest.com', url: 'https://www.pinterest.com/login/' },
    snapchat: { domain: 'snapchat.com', url: 'https://accounts.snapchat.com/accounts/login' }
  };
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- Zustand ----------
  var LIBS = {
    'tt-library': { url: 'https://library.tiktok.com/ads', name: 'TikTok Werbebibliothek', cls: 'tt', icon: 'ad',
      desc: 'Alle Anzeigen, die in der EU auf TikTok laufen – Videos und Bild-Anzeigen.' },
    'tt-top': { url: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/de', name: 'TikTok Top Ads', cls: 'top', icon: 'trend',
      desc: 'Die erfolgreichsten Werbevideos auf TikTok (Creative Center).' },
    'google': { url: 'https://adstransparency.google.com/?region=DE', name: 'Google Anzeigen-Transparenzcenter', cls: 'google', icon: 'search',
      desc: 'YouTube-Videowerbung und Bild-Anzeigen von Google – nach Werbetreibendem suchen.' },
    'meta': { url: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=DE&media_type=all', name: 'Meta Werbebibliothek', cls: 'meta', icon: 'ad',
      desc: 'Anzeigen auf Instagram und Facebook – Videos und Bild-Anzeigen.' }
  };
  var S = {
    tab: 'home',
    quality: load('quality') || '1080',
    slots: { home: newSlot(), ads: newSlot() },
    jobs: {},
    history: [],
    engine: { state: 'init' },
    cookies: { domains: [] },
    found: null,
    sheet: null,
    clip: null
  };
  function newSlot() { return { input: '', pick: null, req: null, loading: false, result: null, error: null, q: null, sel: [] }; }

  // ---------- Navigation ----------
  var TABS = [
    { id: 'home', label: 'Laden', icon: 'download' },
    { id: 'ads', label: 'Werbung', icon: 'ad' },
    { id: 'downloads', label: 'Downloads', icon: 'list' },
    { id: 'more', label: 'Mehr', icon: 'gear' }
  ];
  function renderNav() {
    var active = activeJobs().length;
    $('#nav').innerHTML = TABS.map(function (t) {
      var badge = t.id === 'downloads' && active ? '<span class="count">' + active + '</span>' : '';
      return '<button data-a="tab" data-tab="' + t.id + '" class="' + (S.tab === t.id ? 'active' : '') + '">' + icon(t.icon) + t.label + badge + '</button>';
    }).join('');
  }
  function showTab(tab) {
    if (S.tab === tab) return;
    S.tab = tab;
    if (tab === 'downloads') refreshDownloads();
    if (tab === 'more') refreshMore();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    renderNav();
    renderEnginePill();
    var html = '';
    if (S.tab === 'home') html = viewHome();
    else if (S.tab === 'ads') html = viewAds();
    else if (S.tab === 'downloads') html = viewDownloads();
    else html = viewMore();
    $('#view').innerHTML = html;
    bindImages($('#view'));
  }

  function renderEnginePill() {
    var e = S.engine, cls = 'dot', text = 'Engine';
    if (e.state === 'ready') { cls += ' ok'; text = 'Bereit'; }
    else if (e.state === 'error') { cls += ' err'; text = 'Fehler'; }
    else { cls += ' busy'; text = 'Startet …'; }
    $('#enginePill').innerHTML = '<span class="' + cls + '"></span><span>' + text + '</span>';
  }

  // ---------- Startseite ----------
  function viewHome() {
    var st = S.slots.home;
    var h = clipBanner('home') + '<section class="card hero">'
      + '<h1>Video oder Bild speichern</h1>'
      + '<p class="muted">Link von jeder Plattform einfügen – TikTok, YouTube, Instagram, X, Facebook, Reddit, Pinterest … Videos in 1080p, 1440p oder 4K, Bilder und Galerien in voller Größe.</p>'
      + inputRow('home', 'Link einfügen – von jeder Seite')
      + '<button class="btn primary big" data-a="analyze" data-slot="home">' + icon('search') + 'Link prüfen</button>'
      + '</section>';
    h += engineBanner();
    h += slotResult('home');
    if (!st.result && !st.loading && !st.error) {
      h += '<div class="section-title">Was geht?</div><section class="card">'
        + '<div class="features">'
        + '<span class="chip"><b>TikTok</b> Videos &amp; Fotos</span><span class="chip"><b>YouTube</b> Videos, Shorts, Bilder</span>'
        + '<span class="chip"><b>Instagram</b> Reels, Fotos, Karussells</span><span class="chip"><b>X</b> Videos &amp; Bilder</span>'
        + '<span class="chip"><b>Facebook</b></span><span class="chip"><b>Reddit</b></span><span class="chip"><b>Pinterest</b></span>'
        + '<span class="chip"><b>Snapchat</b></span><span class="chip"><b>Threads</b></span><span class="chip"><b>Bluesky</b></span>'
        + '<span class="chip"><b>Vimeo</b></span><span class="chip"><b>Twitch</b></span><span class="chip"><b>Tumblr</b></span>'
        + '<span class="chip"><b>Werbung</b> Video &amp; Bild</span><span class="chip">MP3</span><span class="chip">+ 2000 weitere Seiten</span></div>'
        + '<p class="muted small" style="margin:14px 0 0">' + icon('info', 'sm') + ' Am schnellsten: In jeder App auf <b>Teilen</b> tippen und <b>ClipSaver</b> wählen. '
        + 'Findet die App auf einer Seite nichts, sammelt „Im Browser suchen“ alle Videos und Bilder, die dort geladen werden.</p>'
        + '</section>';
    }
    return h;
  }

  function inputRow(slot, placeholder) {
    var st = S.slots[slot];
    return '<div class="input-row">'
      + '<input id="in-' + slot + '" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(placeholder) + '" value="' + esc(st.input) + '" data-slot="' + slot + '">'
      + '<button class="square" data-a="paste" data-slot="' + slot + '" aria-label="Einfügen">' + icon('paste') + '</button>'
      + '</div><div class="detect" id="det-' + slot + '">' + detectHtml(slot) + '</div>';
  }

  /** Was im eingegebenen Text als Link erkannt wird (Links.detect in der App). */
  function detect(text) {
    if (!text || !text.trim() || !A || !A.detect) return null;
    return parse(A.detect(text), null);
  }

  function chosenLink(slot) {
    var st = S.slots[slot];
    var d = detect(st.input);
    if (!d || !d.links || !d.links.length) return null;
    var i = st.pick != null && st.pick < d.links.length ? st.pick : d.best;
    return { link: d.links[i], others: d.links.length - 1, all: d.links };
  }

  function detectHtml(slot) {
    var st = S.slots[slot];
    if (!st.input || !st.input.trim()) return '';
    var c = chosenLink(slot);
    if (!c) return '<span class="no">' + icon('alert', 'sm') + 'Kein Link erkannt – füge den Link oder den ganzen geteilten Text ein.</span>';
    var shown = c.link.url.replace(/^https?:\/\/(www\.)?/, '');
    if (shown.length > 46) shown = shown.slice(0, 45) + '…';
    return '<span class="ok">' + icon('check', 'sm') + 'Erkannt: <b>' + esc(c.link.label) + '</b></span>'
      + '<span class="u">' + esc(shown) + '</span>'
      + (c.others ? '<button class="link" data-a="chooseLink" data-slot="' + slot + '">' + (c.others === 1 ? '1 weiterer Link' : c.others + ' weitere Links') + ' – anderen wählen</button>' : '');
  }

  function updateDetect(slot) {
    var el = document.getElementById('det-' + slot);
    if (el) el.innerHTML = detectHtml(slot);
  }

  /** Vorschlag, wenn ein neuer Link in der Zwischenablage liegt (MainActivity.checkClipboard). */
  function clipBanner(slot) {
    if (!S.clip) return '';
    var l = S.clip.links[S.clip.best];
    return '<div class="clip-banner">' + icon('paste') + '<span class="txt">Link in der Zwischenablage:<b>' + esc(l.label) + '</b></span>'
      + '<button class="btn primary small" data-a="useClip" data-slot="' + slot + '">Laden</button>'
      + '<button class="round" data-a="dismissClip" aria-label="Ausblenden">' + icon('x', 'sm') + '</button></div>';
  }

  function engineBanner() {
    if (S.engine.state === 'init') {
      return '<div class="banner"><span class="spinner"></span><span>Die Download-Engine wird eingerichtet (nur beim ersten Start, ca. 10–30 Sekunden). Links kannst du schon einfügen.</span></div>';
    }
    if (S.engine.state === 'error') {
      return '<div class="banner">' + icon('alert') + '<span>Die Download-Engine konnte nicht starten: ' + esc(S.engine.error || '') + '. Bitte App neu starten. Bilder von TikTok/YouTube-Beiträgen gehen trotzdem.</span></div>';
    }
    return '';
  }

  // ---------- Ergebnis eines Links ----------
  function slotResult(slot) {
    var inner = slotResultInner(slot);
    return inner ? '<div id="res-' + slot + '">' + inner + '</div>' : '';
  }

  /** Ergebnis nach dem Prüfen in den sichtbaren Bereich holen (unter der Kopfzeile). */
  function scrollToResult(slot) {
    var el = document.getElementById('res-' + slot);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  }

  function slotResultInner(slot) {
    var st = S.slots[slot];
    if (st.loading) {
      return '<section class="card"><div class="loading-row"><span class="spinner"></span><div style="flex:1"><b>Link wird geprüft …</b>'
        + '<div class="muted small">' + (S.engine.state === 'init' ? 'Wartet auf die Engine …' : 'Formate und Qualitäten werden gelesen') + '</div></div>'
        + '<button class="round" data-a="cancelAnalyze" data-slot="' + slot + '" aria-label="Abbrechen">' + icon('x', 'sm') + '</button></div>'
        + '<div class="skeleton" style="height:170px;margin-top:16px"></div><div class="skeleton" style="height:18px;margin-top:12px;width:70%"></div></section>';
    }
    if (st.error) {
      var login = st.errorLogin && LOGINS[st.errorLogin];
      return '<section class="card error-card"><div class="error-head">' + icon('alert') + '<span>' + esc(st.error) + '</span></div>'
        + '<div class="row"><button class="btn ghost small" data-a="analyze" data-slot="' + slot + '">' + icon('refresh', 'sm') + 'Nochmal</button>'
        + '<button class="btn ghost small" data-a="browseInput" data-slot="' + slot + '">' + icon('globe', 'sm') + 'Im Browser suchen</button></div>'
        + (login ? '<div class="row"><button class="btn primary small" data-a="login" data-platform="' + esc(st.errorLogin) + '">' + icon('user', 'sm')
          + 'Bei ' + esc(platformName(st.errorLogin)) + ' anmelden</button></div>'
          + '<p class="muted small" style="margin:10px 0 0">Viele Beiträge zeigt ' + esc(platformName(st.errorLogin)) + ' nur angemeldet. Danach den Link einfach nochmal prüfen.</p>' : '')
        + '<p class="muted small" style="margin:12px 0 0">„Im Browser suchen“ öffnet die Seite und sammelt alle Videos und Bilder, die dort geladen werden.</p></section>';
    }
    var r = st.result;
    if (!r) return '';
    if (r.kind === 'browse') return resultBrowse(slot, r);
    if (r.kind === 'playlist') return resultPlaylist(slot, r);
    if (r.kind === 'images') return resultImages(slot, r);
    return resultVideo(slot, r);
  }

  function mediaHeader(r, extraBadge) {
    var thumb = r.thumbnail;
    var portrait = r.platform === 'tiktok' || r.kind === 'images' || /\/shorts\//.test(r.pageUrl || '');
    var h = '<div class="media' + (portrait ? ' portrait' : '') + '">';
    if (thumb) {
      h += '<img class="blur" src="' + esc(thumb) + '" referrerpolicy="no-referrer" alt="">'
        + '<img class="fg" src="' + esc(thumb) + '" referrerpolicy="no-referrer" alt="" data-fallback="hide">';
    } else {
      h += '<div class="ph" style="height:100%;display:grid;place-items:center;color:var(--muted)">' + icon('film') + '</div>';
    }
    if (r.platform) h += '<span class="badge tl ' + esc(r.platform) + '">' + esc(platformName(r.platform)) + '</span>';
    if (extraBadge) h += '<span class="badge br">' + esc(extraBadge) + '</span>';
    return h + '</div>';
  }

  /** Video mit direkten Adressen (eigene Auslese: TikTok, X, Instagram, Webseite) statt yt-dlp-Formaten. */
  function isDirect(r) {
    return !r.qualities && r.videos && r.videos.length > 0;
  }

  /** Auswahl 1080p / 1440p / 4K / MP3 für ein Ergebnis. */
  function qualityOptions(r) {
    var opts = [];
    if (isDirect(r)) {
      var vids = r.videos || [];
      var max = vids.length ? vids[0].res : 0;
      if (!max) return [{ key: '1080', label: 'Original', available: true, sub: 'wie auf der Seite' }];
      [1080, 1440, 2160].forEach(function (t) {
        var v = pickDirect(vids, t);
        opts.push({ key: String(t), label: resLabel(t), available: max >= t, sub: max >= t ? (fmtSize(v && v.size) || resName(t)) : 'nicht verfügbar' });
      });
      if (r.audioUrl) opts.push({ key: 'audio', label: 'Ton', available: true, sub: 'Sound' });
      return opts;
    }
    (r.qualities || []).forEach(function (q) {
      opts.push({ key: String(q.target), label: resLabel(q.target), available: q.available, format: q.format,
        sub: q.available ? (fmtSize(q.size) || resName(q.target)) : 'nicht verfügbar' });
    });
    if (r.kind === 'video' || r.kind === 'audio') opts.push({ key: 'audio', label: 'MP3', available: true, sub: r.audioSize ? fmtSize(r.audioSize) : 'nur Ton' });
    return opts;
  }

  function maxRes(r) {
    if (isDirect(r)) return r.videos[0].res || 0;
    return r.maxRes || 0;
  }

  /** Beste direkte Videofassung ≤ Ziel (Liste ist absteigend sortiert). */
  function pickDirect(vids, target) {
    for (var i = 0; i < vids.length; i++) if (vids[i].res <= target) return vids[i];
    return vids[vids.length - 1];
  }

  function defaultQuality(r) {
    var opts = qualityOptions(r).filter(function (o) { return o.key !== 'audio'; });
    var wanted = parseInt(S.quality, 10);
    var best = null;
    opts.forEach(function (o) { if (o.available && parseInt(o.key, 10) <= wanted) best = o.key; });
    if (!best) opts.forEach(function (o) { if (!best && o.available) best = o.key; });
    if (r.kind === 'audio') return 'audio';
    return best || '1080';
  }

  function resultVideo(slot, r) {
    var st = S.slots[slot];
    var opts = qualityOptions(r);
    var mr = maxRes(r);
    var h = '<section class="card">' + mediaHeader(r, fmtDur(r.duration));
    h += '<div class="result-title">' + esc(r.title) + '</div>';
    var meta = [];
    if (r.uploader) meta.push(esc(r.uploader));
    if (mr) meta.push('max. ' + (mr >= 2160 ? '4K' : mr + 'p'));
    h += '<div class="meta">' + meta.join(' · ') + '</div>';
    h += '<div class="qgrid">' + opts.map(function (o) {
      return '<button class="q' + (st.q === o.key && o.available ? ' sel' : '') + (o.available ? '' : ' off') + '" data-a="quality" data-slot="' + slot + '" data-q="' + o.key + '"'
        + (o.available ? '' : ' aria-disabled="true"') + '><b>' + esc(o.label) + '</b><small>' + esc(o.sub) + '</small></button>';
    }).join('') + '</div>';
    if (r.note) h += '<p class="note">' + icon('info') + '<span>' + esc(r.note) + '</span></p>';
    if (r.kind === 'video' && mr > 0 && mr < 1080) {
      h += '<p class="note">' + icon('info') + '<span>Dieses Video gibt es nur bis ' + mr + 'p – es wird in der besten verfügbaren Qualität geladen.</span></p>';
    } else if (r.kind === 'video' && mr >= 1080 && mr < 2160) {
      h += '<p class="note info">' + icon('info') + '<span>Höher als ' + (mr >= 1440 ? '1440p' : '1080p') + ' hat ' + esc(platformName(r.platform) || 'die Seite') + ' dieses Video nicht – ausgegraute Stufen gibt es nicht.</span></p>';
    }
    var label = st.q === 'audio' ? (isDirect(r) ? 'Ton herunterladen' : 'MP3 herunterladen')
      : isDirect(r) && !mr ? 'Herunterladen' : 'Herunterladen · ' + (mr > 0 && mr < 1080 ? mr + 'p' : resLabel(parseInt(st.q, 10)));
    h += '<button class="btn primary big" data-a="downloadVideo" data-slot="' + slot + '">' + icon('download') + esc(label) + '</button>';
    if (r.thumbnail) {
      h += '<div class="row"><button class="btn ghost small" data-a="downloadThumb" data-slot="' + slot + '">' + icon('image', 'sm')
        + (r.platform === 'tiktok' ? 'Titelbild speichern' : 'Vorschaubild speichern') + '</button></div>';
    }
    if (r.images && r.images.length) {
      h += '<div class="section-title" style="margin:20px 0 0">' + (r.images.length === 1 ? 'Bild' : r.images.length + ' Bilder') + ' im Beitrag</div>';
      h += mediaGrid(slot, r) + saveSelectedButton(slot, r);
    }
    return h + '</section>';
  }

  /** Raster mit Bildern und Videos eines Beitrags zum Auswählen. */
  function mediaGrid(slot, r) {
    var st = S.slots[slot];
    var items = r.images || [];
    var n = st.sel.filter(Boolean).length;
    var h = '<div class="grid">' + items.map(function (it, i) {
      var dim = it.width && it.height ? it.width + '×' + it.height : '';
      var video = it.type === 'video';
      var inner;
      if (!video) inner = '<img src="' + esc(it.url) + '" referrerpolicy="no-referrer" loading="lazy" alt="" data-alt="' + esc((it.fallback || [])[0] || '') + '">';
      else if (it.thumb) inner = '<img src="' + esc(it.thumb) + '" referrerpolicy="no-referrer" loading="lazy" alt="">';
      else if (it.via === 'files') inner = '<video src="' + esc(it.url) + '" muted playsinline preload="metadata"></video>';
      else inner = '<div class="ph">' + icon('film') + '</div>';
      return '<button class="tile' + (st.sel[i] ? ' sel' : '') + '" data-a="toggleImg" data-slot="' + slot + '" data-i="' + i + '">' + inner
        + (video ? '<span class="kind">Video</span>' : '') + '<span class="check">' + icon('check') + '</span>'
        + (dim ? '<span class="dim">' + dim + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    if (items.length > 1) {
      h += '<div class="grid-tools"><button class="link" data-a="selectAll" data-slot="' + slot + '">' + (n === items.length ? 'Keine auswählen' : 'Alle auswählen') + '</button>'
        + '<span class="muted small">' + n + ' ausgewählt</span></div>';
    }
    return h;
  }

  function saveSelectedButton(slot, r) {
    var st = S.slots[slot];
    var picked = (r.images || []).filter(function (it, i) { return st.sel[i]; });
    var videos = picked.filter(function (it) { return it.type === 'video'; }).length;
    var n = picked.length;
    var what = videos === 0 ? (n === 1 ? 'Bild' : 'Bilder') : videos === n ? (n === 1 ? 'Video' : 'Videos') : (n === 1 ? 'Datei' : 'Dateien');
    return '<button class="btn primary big" data-a="downloadImages" data-slot="' + slot + '"' + (n ? '' : ' disabled') + '>' + icon('download')
      + n + ' ' + what + ' speichern</button>';
  }

  function resultImages(slot, r) {
    var imgs = r.images || [];
    var videos = imgs.filter(function (it) { return it.type === 'video'; }).length;
    var pics = imgs.length - videos;
    var counts = [];
    if (pics) counts.push(pics + (pics === 1 ? ' Bild' : ' Bilder'));
    if (videos) counts.push(videos + (videos === 1 ? ' Video' : ' Videos'));
    var what = { 'youtube-post': 'Community-Beitrag', 'tiktok-web': 'Foto-Post' }[r.source];
    var h = '<section class="card">';
    h += '<div style="display:flex;gap:10px;align-items:center;margin-bottom:4px">'
      + (platformName(r.platform) ? '<span class="badge ' + esc(r.platform) + '" style="position:static">' + esc(platformName(r.platform)) + '</span>' : '')
      + '<span class="muted small">' + counts.join(' · ') + (what ? ' · ' + what : '') + '</span></div>';
    h += '<div class="result-title" style="margin-top:8px">' + esc(r.title) + '</div>';
    if (r.uploader) h += '<div class="meta">' + esc(r.uploader) + '</div>';
    if (r.note) h += '<p class="note">' + icon('info') + '<span>' + esc(r.note) + '</span></p>';
    h += mediaGrid(slot, r) + saveSelectedButton(slot, r);
    var extra = '';
    if (r.audioUrl) extra += '<button class="btn ghost small" data-a="downloadAudio" data-slot="' + slot + '">' + icon('music', 'sm') + 'Musik speichern</button>';
    if (r.videoId) extra += '<button class="btn ghost small" data-a="openVideo" data-slot="' + slot + '">' + icon('film', 'sm') + 'Video im Beitrag laden</button>';
    if (extra) h += '<div class="row">' + extra + '</div>';
    h += '<p class="muted small" style="margin:12px 0 0">Gespeichert wird in voller Auflösung (Galerie → Bilder bzw. Filme/ClipSaver).</p>';
    return h + '</section>';
  }

  function resultPlaylist(slot, r) {
    var st = S.slots[slot];
    var entries = r.entries || [];
    var h = '<section class="card">';
    h += '<div style="display:flex;gap:10px;align-items:center"><span class="badge ' + esc(r.platform) + '" style="position:static">' + esc(platformName(r.platform)) + '</span>'
      + '<span class="muted small">Playlist · ' + (r.count || entries.length) + ' Videos</span></div>';
    h += '<div class="result-title" style="margin-top:8px">' + esc(r.title) + '</div>';
    h += '<div style="margin-top:10px">' + entries.slice(0, 8).map(function (e, i) {
      return '<div class="muted small" style="padding:5px 0;border-top:1px solid var(--line)">' + (i + 1) + '. ' + esc(e.title) + (e.duration ? ' · ' + fmtDur(e.duration) : '') + '</div>';
    }).join('') + (entries.length > 8 ? '<div class="muted small" style="padding:5px 0">… und ' + (entries.length - 8) + ' weitere</div>' : '') + '</div>';
    h += '<div class="qgrid">' + ['1080', '1440', '2160', 'audio'].map(function (k) {
      return '<button class="q' + (st.q === k ? ' sel' : '') + '" data-a="quality" data-slot="' + slot + '" data-q="' + k + '"><b>' + (k === 'audio' ? 'MP3' : resLabel(+k)) + '</b><small>'
        + (k === 'audio' ? 'nur Ton' : 'höchstens') + '</small></button>';
    }).join('') + '</div>';
    h += '<p class="note info">' + icon('info') + '<span>Jedes Video wird in der gewählten Qualität geladen – oder in der besten, die es gibt.</span></p>';
    h += '<button class="btn primary big" data-a="downloadPlaylist" data-slot="' + slot + '">' + icon('download') + 'Alle ' + entries.length + ' laden</button>';
    return h + '</section>';
  }

  function resultBrowse(slot, r) {
    return '<section class="card"><div class="error-head" style="color:var(--accent2)">' + icon('globe') + '<span>' + esc(r.message) + '</span></div>'
      + '<button class="btn primary big" data-a="browseResult" data-slot="' + slot + '">' + icon('globe') + 'Im Browser öffnen</button></section>';
  }

  // ---------- Werbung ----------
  function viewAds() {
    var h = clipBanner('ads') + '<section class="card hero"><h1>Werbung speichern</h1>'
      + '<p class="muted">Video- und Bild-Anzeigen von TikTok, YouTube, Instagram, Facebook und anderen: Link der Anzeige einfügen oder unten in einer Werbebibliothek suchen.</p>'
      + inputRow('ads', 'Link der Anzeige einfügen')
      + '<button class="btn primary big" data-a="analyze" data-slot="ads">' + icon('search') + 'Werbung laden</button></section>';
    h += slotResult('ads');
    h += '<div class="section-title">Werbebibliotheken durchsuchen</div>';
    Object.keys(LIBS).forEach(function (k) {
      var l = LIBS[k];
      h += '<button class="card libcard" data-a="lib" data-lib="' + k + '"><span class="libicon ' + l.cls + '">' + icon(l.icon) + '</span>'
        + '<span><b>' + esc(l.name) + '</b><small>' + esc(l.desc) + '</small></span><span class="go">' + icon('right') + '</span></button>';
    });
    h += '<details class="card help"><summary>So kommst du an den Link einer Anzeige ' + icon('chevron') + '</summary><ol>'
      + '<li><b>TikTok:</b> Bei der Anzeige auf <b>Teilen</b> → <b>Link kopieren</b> (oder direkt <b>ClipSaver</b> wählen). Viele TikTok-Anzeigen sind normale Beiträge des Werbetreibenden.</li>'
      + '<li><b>YouTube:</b> Viele Werbespots sind (oft nicht gelistete) YouTube-Videos – deren Link funktioniert wie jedes Video. Sonst bei der Werbung auf <b>ⓘ</b> tippen, den Werbetreibenden merken und ihn im <b>Google Anzeigen-Transparenzcenter</b> suchen.</li>'
      + '<li><b>Instagram/Facebook:</b> Bei der Anzeige auf <b>⋯</b> bzw. <b>Teilen</b> → <b>Link kopieren</b>; sonst den Werbetreibenden in der <b>Meta Werbebibliothek</b> suchen.</li>'
      + '<li><b>Bild-Werbung:</b> In der Werbebibliothek die Anzeige öffnen – der Browser sammelt alle Bilder und Videos; unten auf „… gefunden – anzeigen“ tippen und auswählen.</li>'
      + '</ol></details>';
    return h;
  }

  // ---------- Downloads ----------
  function activeJobs() {
    return Object.keys(S.jobs).map(function (k) { return S.jobs[k]; }).filter(function (j) {
      return j.state === 'queued' || j.state === 'running';
    });
  }
  function refreshDownloads() {
    S.history = parse(A ? A.history() : '[]', []);
    var list = parse(A ? A.jobs() : '[]', []);
    S.jobs = {};
    list.forEach(function (j) { S.jobs[j.id] = j; });
  }

  function viewDownloads() {
    var jobs = Object.keys(S.jobs).map(function (k) { return S.jobs[k]; })
      .filter(function (j) { return j.state !== 'done'; })
      .sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
    var h = '';
    if (jobs.length) {
      h += '<div class="section-title" style="margin-top:4px">Laufend</div><section class="card" id="jobs">' + jobs.map(jobHtml).join('') + '</section>';
    }
    h += '<div class="section-title" style="display:flex;justify-content:space-between;' + (jobs.length ? '' : 'margin-top:4px') + '"><span>Gespeichert</span>'
      + (S.history.length ? '<button class="link" style="padding:0;text-transform:none;letter-spacing:0" data-a="clearHistory">Liste leeren</button>' : '') + '</div>';
    if (!S.history.length) {
      h += '<section class="card empty">' + icon('folder') + '<div>Noch nichts gespeichert.</div><div class="small">Fertige Downloads findest du auch in der Galerie unter <b>ClipSaver</b>.</div></section>';
    } else {
      h += '<section class="card" style="padding:8px 14px">' + S.history.map(histHtml).join('') + '</section>';
    }
    return h;
  }

  function jobHtml(j) {
    var p = typeof j.progress === 'number' ? j.progress : -1;
    var running = j.state === 'running' || j.state === 'queued';
    var title = j.title || (j.platform === 'youtube' ? 'YouTube-Video' : 'Download');
    var h = '<div class="job" data-job="' + esc(j.id) + '"><div class="info"><div class="t">' + esc(title) + '</div>';
    if (j.state === 'error') h += '<div class="s err">' + esc(j.error || 'Fehlgeschlagen') + '</div>';
    else h += '<div class="s">' + esc(j.status || '') + '</div>';
    if (running) h += '<div class="bar' + (p < 0 ? ' indet' : '') + '"><i style="width:' + Math.round(Math.max(p, 0) * 100) + '%"></i></div>';
    h += '</div>';
    if (running) h += '<button class="round" data-a="cancelJob" data-id="' + esc(j.id) + '" aria-label="Abbrechen">' + icon('x', 'sm') + '</button>';
    else if (j.state === 'error' || j.state === 'canceled') h += '<button class="round" data-a="retryJob" data-id="' + esc(j.id) + '" aria-label="Nochmal">' + icon('refresh', 'sm') + '</button>';
    return h + '</div>';
  }

  function histHtml(e, i) {
    // Vorschaubild aus der gespeicherten Datei (MainActivity: /thumb), sonst das Original-Vorschaubild
    var thumb = e.kind === 'audio' ? icon('music')
      : '<img src="/thumb?uri=' + encodeURIComponent(e.uri) + '" referrerpolicy="no-referrer" alt="" data-alt="' + esc(e.thumb || '') + '" data-fallback="icon">';
    var tag = e.label ? '<span class="tag">' + esc(e.label) + '</span>' : (e.kind === 'audio' ? '<span class="tag">MP3</span>' : '');
    return '<div class="hist"><button class="thumb" data-a="openHist" data-i="' + i + '">' + thumb + '</button>'
      + '<button class="info" data-a="openHist" data-i="' + i + '"><div class="t">' + esc(e.title) + '</div>'
      + '<div class="s">' + tag + esc(platformName(e.platform)) + (e.platform ? ' · ' : '') + fmtDate(e.time) + '</div></button>'
      + '<button class="round" data-a="histMenu" data-i="' + i + '" aria-label="Optionen">' + icon('more', 'sm') + '</button></div>';
  }

  // ---------- Mehr / Einstellungen ----------
  function refreshMore() {
    if (!A) return;
    S.engine = parse(A.engineInfo(), S.engine);
    S.cookies = parse(A.cookiesInfo(), S.cookies);
  }

  function viewMore() {
    var e = S.engine;
    var h = '<div class="section-title" style="margin-top:4px">Standard-Qualität</div><section class="card">'
      + '<div class="set-row"><span>Videos laden in<small>Wenn ein Video die Stufe nicht hat, wird die nächstbeste genommen.</small></span></div>'
      + '<div class="seg">' + ['1080', '1440', '2160'].map(function (q) {
        return '<button style="flex:1" class="' + (S.quality === q ? 'sel' : '') + '" data-a="defaultQuality" data-q="' + q + '">' + resLabel(+q) + '</button>';
      }).join('') + '</div></section>';

    h += '<div class="section-title">Download-Engine</div><section class="card">'
      + '<div class="kv"><span>yt-dlp</span><span>' + esc(e.version || (e.state === 'init' ? 'wird eingerichtet …' : '–')) + ' <span class="muted">(Videos)</span></span>'
      + (e.galleryVersion ? '<span>gallery-dl</span><span>' + esc(e.galleryVersion) + ' <span class="muted">(Bilder &amp; Galerien)</span></span>' : '')
      + '<span>Status</span><span>' + (e.state === 'ready' ? 'bereit' : e.state === 'error' ? 'Fehler: ' + esc(e.error || '') : 'startet …') + '</span>'
      + (e.lastCheck ? '<span>Geprüft</span><span>' + fmtDate(e.lastCheck) + '</span>' : '') + '</div>'
      + '<p class="muted small" style="margin:10px 0 0">Plattformen ändern ihre Seiten oft. Wenn etwas nicht mehr klappt, hilft fast immer ein Update (holt yt-dlp und gallery-dl neu).</p>'
      + '<button class="btn ghost big" data-a="updateEngine" id="updBtn">' + icon('refresh') + 'Jetzt aktualisieren</button>'
      + '<div class="set-row" style="margin-top:6px"><span>Automatisch aktualisieren<small>einmal täglich beim Start</small></span>'
      + '<button class="switch' + (e.autoUpdate !== false ? ' on' : '') + '" data-a="toggleAuto" aria-label="Automatisch aktualisieren"></button></div>'
      + '<div class="set-row"><span>Nightly-Versionen<small>neueste Korrekturen, etwas weniger getestet</small></span>'
      + '<button class="switch' + (e.nightly ? ' on' : '') + '" data-a="toggleNightly" aria-label="Nightly"></button></div></section>';

    h += '<div class="section-title">Links erkennen</div><section class="card">'
      + '<div class="set-row"><span>Links aus der Zwischenablage vorschlagen<small>Kopierst du in einer anderen App einen Link, schlägt ClipSaver ihn beim Öffnen vor.</small></span>'
      + '<button class="switch' + (load('clipSuggest') !== '0' ? ' on' : '') + '" data-a="toggleClip" aria-label="Zwischenablage"></button></div>'
      + '<p class="muted small" style="margin:6px 0 0">Außerdem: In jeder App auf <b>Teilen → ClipSaver</b>, oder Text mit Link markieren → <b>Mit ClipSaver laden</b>. '
      + 'Erkannt werden auch Links mitten im Text, Kurz- und Teilen-Links (t.co, pin.it, instagram.com/share …) und Weiterleitungen; Tracking-Anhängsel werden entfernt.</p></section>';

    var d = (S.cookies.domains || []);
    h += '<div class="section-title">Anmeldung (optional)</div><section class="card">'
      + '<p class="muted small" style="margin:0 0 10px">Nötig, wenn eine Plattform Beiträge nur angemeldet zeigt (oft bei Instagram und Facebook), für private oder '
      + 'altersbeschränkte Inhalte oder wenn YouTube fragt „Bist du ein Bot?“. Gespeichert werden nur Anmelde-Cookies, nur auf diesem Handy.</p>'
      + '<div class="kv"><span>Angemeldet</span><span>' + (d.length ? esc(d.join(', ')) : 'nirgends') + '</span></div>'
      + '<div class="row">' + ['instagram', 'tiktok', 'twitter', 'youtube', 'facebook', 'reddit'].map(function (p) {
        return '<button class="btn ghost small" data-a="login" data-platform="' + p + '">' + icon('user', 'sm') + esc(platformName(p)) + '</button>';
      }).join('') + '</div>'
      + '<div class="row"><button class="btn ghost small" data-a="importCookies">' + icon('folder', 'sm') + 'cookies.txt importieren</button>'
      + (d.length ? '<button class="btn ghost small" data-a="clearCookies">' + icon('trash', 'sm') + 'Abmelden</button>' : '') + '</div>'
      + '<p class="muted small" style="margin:10px 0 0">Für andere Seiten oder wenn Google die Anmeldung im eingebauten Browser blockiert: am PC mit einer Browser-Erweiterung eine <b>cookies.txt</b> exportieren und hier importieren.</p></section>';

    h += '<div class="section-title">Speicherorte</div><section class="card"><div class="kv">'
      + '<span>' + icon('film', 'sm') + '</span><span>Videos → <b>Filme/ClipSaver</b></span>'
      + '<span>' + icon('image', 'sm') + '</span><span>Bilder → <b>Bilder/ClipSaver</b></span>'
      + '<span>' + icon('music', 'sm') + '</span><span>Ton → <b>Musik/ClipSaver</b></span></div>'
      + '<p class="muted small" style="margin:10px 0 0">1440p und 4K gibt es bei YouTube nur als VP9 – das spielen fast alle Handys ab Android 10. Bis 1080p wird H.264 genommen (läuft überall).</p></section>';

    h += '<div class="section-title">Hinweis</div><section class="card"><p class="muted small" style="margin:0">Lade nur Inhalte herunter, die du speichern darfst – z. B. eigene Videos, Inhalte mit Erlaubnis oder für den privaten Gebrauch, soweit das Urheberrecht es erlaubt. '
      + 'Inhalte bleiben Eigentum der Urheber.</p></section>';
    h += '<p class="center muted small">ClipSaver ' + esc(A && A.appVersion ? A.appVersion() : '') + ' · yt-dlp, FFmpeg, QuickJS (Open Source)</p>';
    return h;
  }

  // ---------- Bilder: Ersatzadresse / kleine Bilder ----------
  function bindImages(root) {
    root.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function () {
        var alt = img.getAttribute('data-alt');
        if (alt) { img.removeAttribute('data-alt'); img.src = alt; return; }
        var fb = img.getAttribute('data-fallback');
        if (fb === 'hide') img.style.visibility = 'hidden';
        else if (fb === 'icon' && img.parentNode) img.parentNode.innerHTML = icon('image');
      }, { once: false });
    });
  }

  // ---------- Aktionen ----------
  function analyze(slot, text) {
    var st = S.slots[slot];
    var input = $('#in-' + slot);
    var given = text != null;
    text = (given ? text : (input ? input.value : st.input) || '').trim();
    if (!text) { toast('Bitte zuerst einen Link einfügen'); return; }
    if (!A) { toast('Nur in der App verfügbar'); return; }
    // Den erkannten (bzw. ausgewählten) Link prüfen und bereinigt ins Feld schreiben
    if (given && text !== st.input) st.pick = null;
    st.input = text;
    var c = chosenLink(slot);
    if (!c) { render(); toast('Im Text wurde kein Link gefunden'); return; }
    text = c.link.url;
    st.pick = null;
    if (st.req) A.cancelAnalyze(st.req);
    st.req = 'r' + Date.now();
    st.input = text;
    st.loading = true;
    st.result = null;
    st.error = null;
    st.errorLogin = null;
    render();
    scrollToResult(slot);
    A.analyze(st.req, text);
  }

  function enqueue(job, quiet) {
    var id = A && A.enqueue(JSON.stringify(job));
    if (!id) { toast('Download konnte nicht gestartet werden'); return null; }
    job.id = id;
    job.state = 'queued';
    job.status = 'Wartet …';
    job.created = Date.now();
    S.jobs[id] = job;
    renderNav();
    if (!quiet) toast('Download gestartet – siehe „Downloads“');
    return id;
  }

  function downloadVideo(slot) {
    var st = S.slots[slot], r = st.result, q = st.q || '1080';
    if (isDirect(r)) {
      if (q === 'audio') return downloadAudio(slot);
      var v = pickDirect(r.videos || [], parseInt(q, 10));
      if (!v) return toast('Kein Video gefunden');
      enqueue({ kind: 'files', title: r.title, thumb: r.thumbnail, platform: r.platform, pageUrl: r.pageUrl, headers: r.headers,
        items: [{ urls: [v.url].concat(v.fallback || []), type: 'video', name: r.title + (v.res ? ' (' + (v.res >= 2160 ? '4K' : v.res + 'p') + ')' : '') }] });
      return;
    }
    // Exakte Format-IDs aus der Prüfung; bei Videos unter 1080p die beste vorhandene Fassung
    var format = null;
    if (q === 'audio') format = r.audioFormat || null;
    else if (r.low && !(r.qualities || []).some(function (x) { return x.available; })) format = r.low.format;
    else (r.qualities || []).forEach(function (x) { if (String(x.target) === q && x.available) format = x.format; });
    var job = { kind: 'ytdlp', url: r.url || r.pageUrl, infoFile: r.infoFile, quality: q, title: r.title, thumb: r.thumbnail, platform: r.platform };
    if (format) job.format = format;
    enqueue(job);
  }

  function downloadAudio(slot) {
    var r = S.slots[slot].result;
    if (!r.audioUrl) return;
    enqueue({ kind: 'files', title: r.audioTitle || r.title, thumb: r.thumbnail, platform: r.platform, pageUrl: r.pageUrl, headers: r.headers,
      items: [{ urls: [r.audioUrl], type: 'audio', name: r.audioTitle || r.title }] });
  }

  function downloadThumb(slot) {
    var r = S.slots[slot].result;
    enqueue({ kind: 'files', title: r.title, thumb: r.thumbnail, platform: r.platform, pageUrl: r.pageUrl, headers: r.headers,
      items: [{ urls: [r.thumbnail].concat(r.thumbnailFallback || []), type: 'image', name: r.title + ' (Vorschaubild)' }] });
  }

  /**
   * Ausgewählte Bilder/Videos laden – je nach Herkunft direkt ("files"), über gallery-dl ("gdl", kennt die
   * nötigen Header der Seite) oder über yt-dlp (Videos, die gallery-dl an yt-dlp weiterreicht).
   */
  function downloadImages(slot) {
    var st = S.slots[slot], r = st.result;
    var all = r.images || [];
    var picked = all.map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return st.sel[x.i]; });
    if (!picked.length) return;
    var name = function (x) { return r.title + (all.length > 1 ? ' (' + (x.i + 1) + ')' : ''); };
    var base = { title: r.title, thumb: r.thumbnail, platform: r.platform, pageUrl: r.pageUrl };
    var files = picked.filter(function (x) { return (x.it.via || 'files') === 'files'; });
    var gdl = picked.filter(function (x) { return x.it.via === 'gdl'; });
    var ytdl = picked.filter(function (x) { return x.it.via === 'ytdlp'; });
    var n = 0;
    if (files.length && enqueue(Object.assign({ kind: 'files', headers: r.headers, items: files.map(function (x) {
      return { urls: [x.it.url].concat(x.it.fallback || []), type: x.it.type || 'image', name: name(x) };
    }) }, base), true)) n++;
    if (gdl.length) {
      var allGdl = all.filter(function (it) { return it.via === 'gdl'; }).length;
      var range = r.gdlRange && gdl.length < allGdl ? gdl.map(function (x) { return x.it.index; }).join(',') : null;
      if (enqueue(Object.assign({ kind: 'gdl', url: r.gdlUrl, range: range, count: range ? gdl.length : allGdl }, base), true)) n++;
    }
    ytdl.forEach(function (x) {
      if (enqueue(Object.assign({}, base, { kind: 'ytdlp', url: x.it.url, quality: S.quality, title: name(x) }), true)) n++;
    });
    if (n) toast('Download gestartet – siehe „Downloads“');
  }

  function downloadPlaylist(slot) {
    var st = S.slots[slot], r = st.result;
    var n = 0;
    (r.entries || []).forEach(function (e) {
      if (enqueue({ kind: 'ytdlp', url: e.url, quality: st.q || S.quality, title: e.title, platform: r.platform }, true)) n++;
    });
    toast(n + ' Downloads gestartet');
  }

  function openBrowser(url) {
    if (A) A.browse(url, 'sniff', '');
  }

  // ---------- Medien aus dem Browser ----------
  function viewFound() {
    var f = S.found;
    var items = f.items.filter(function (it) {
      if (it.small && !f.showSmall) return false;
      if (f.filter === 'video') return it.kind !== 'image';
      if (f.filter === 'image') return it.kind === 'image';
      return true;
    });
    var smallCount = f.items.filter(function (it) { return it.small; }).length;
    var sel = f.items.filter(function (it) { return it.sel && (!it.small || f.showSmall); });
    var hasVideoQ = sel.some(function (it) { return it.kind === 'youtube' || it.kind === 'hls'; });
    var h = '<div class="screen"><div class="screen-head"><button class="round" data-a="closeFound" aria-label="Schließen">' + icon('back', 'sm') + '</button>'
      + '<div class="ttl"><b>' + esc(f.title || 'Gefundene Medien') + '</b><small>' + esc(f.page) + '</small></div></div><div class="screen-body">';
    h += '<div class="filters">' + [['all', 'Alle'], ['video', 'Videos'], ['image', 'Bilder']].map(function (x) {
      return '<button class="' + (f.filter === x[0] ? 'sel' : '') + '" data-a="foundFilter" data-f="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '<button data-a="foundAll">' + (sel.length === items.length && items.length ? 'Keine' : 'Alle') + ' auswählen</button></div>';
    if (!items.length) h += '<div class="empty">' + icon('image') + '<div>Hier ist nichts dabei.</div></div>';
    h += '<div class="grid">' + items.map(function (it) {
      var idx = f.items.indexOf(it);
      var inner, kind = '';
      if (it.kind === 'image') inner = '<img src="' + esc(it.url) + '" referrerpolicy="no-referrer" alt="" data-measure="' + idx + '">';
      else if (it.kind === 'video') inner = '<video src="' + esc(it.url) + '" muted playsinline preload="metadata"' + (it.poster ? ' poster="' + esc(it.poster) + '"' : '') + ' data-measure="' + idx + '"></video>';
      else if (it.kind === 'youtube') inner = '<img src="https://i.ytimg.com/vi/' + esc(it.url.split('v=')[1]) + '/hqdefault.jpg" alt="">';
      else inner = '<div class="ph">' + icon('film') + '<br>Stream (HLS)</div>';
      if (it.kind === 'video') kind = '<span class="kind">Video</span>';
      if (it.kind === 'youtube') kind = '<span class="kind youtube">YouTube</span>';
      if (it.kind === 'hls') kind = '<span class="kind">Stream</span>';
      var dim = it.width && it.height ? '<span class="dim">' + it.width + '×' + it.height + '</span>' : '';
      return '<button class="tile' + (it.sel ? ' sel' : '') + '" data-a="toggleFound" data-i="' + idx + '">' + inner + kind + dim + '<span class="check">' + icon('check') + '</span></button>';
    }).join('') + '</div>';
    if (smallCount) {
      h += '<p class="center"><button class="link" data-a="foundSmall">' + (f.showSmall ? 'Kleine Bilder ausblenden' : smallCount + (smallCount === 1 ? ' kleines Bild' : ' kleine Bilder') + ' (Icons) einblenden') + '</button></p>';
    }
    h += '</div><div class="actionbar">';
    if (hasVideoQ) {
      h += '<div class="seg">' + ['1080', '1440', '2160'].map(function (q) {
        return '<button style="flex:1" class="' + (f.q === q ? 'sel' : '') + '" data-a="foundQuality" data-q="' + q + '">' + resLabel(+q) + '</button>';
      }).join('') + '</div>';
    }
    h += '<button class="btn primary big" data-a="downloadFound"' + (sel.length ? '' : ' disabled') + '>' + icon('download')
      + (sel.length === 1 ? '1 Datei speichern' : sel.length + ' Dateien speichern') + '</button></div></div>';
    return h;
  }

  function renderOverlay() {
    var o = $('#overlay');
    var h = '';
    if (S.found) h += viewFound();
    if (S.sheet) h += S.sheet;
    o.innerHTML = h;
    document.body.classList.toggle('has-sheet', !!h);
    bindImages(o);
    o.querySelectorAll('[data-measure]').forEach(function (el) {
      var idx = +el.getAttribute('data-measure');
      var done = function () {
        var it = S.found && S.found.items[idx];
        if (!it) return;
        var w = el.naturalWidth || el.videoWidth || 0, hh = el.naturalHeight || el.videoHeight || 0;
        if (!w || !hh) return;
        var changed = it.width !== w || it.height !== hh;
        it.width = w; it.height = hh;
        if (it.kind === 'image' && (w < 150 || hh < 150) && !it.small) {
          it.small = true;
          it.sel = false;
          changed = true;
        }
        if (changed) scheduleOverlay();
      };
      if (el.tagName === 'IMG') { if (el.complete && el.naturalWidth) done(); else el.addEventListener('load', done); }
      else el.addEventListener('loadedmetadata', done);
    });
  }
  var overlayTimer;
  function scheduleOverlay() {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(function () { var y = ($('.screen') || {}).scrollTop || 0; renderOverlay(); var s = $('.screen'); if (s) s.scrollTop = y; }, 250);
  }

  function downloadFound() {
    var f = S.found;
    var sel = f.items.filter(function (it) { return it.sel && (!it.small || f.showSmall); });
    if (!sel.length) return;
    var title = (f.title || 'ClipSaver').replace(/\s+/g, ' ').trim().slice(0, 60);
    var files = sel.filter(function (it) { return it.kind === 'image' || it.kind === 'video'; });
    var n = 0;
    if (files.length) {
      if (enqueue({ kind: 'files', title: title, pageUrl: f.page, platform: 'ads', thumb: (files.find(function (x) { return x.kind === 'image'; }) || {}).url,
        items: files.map(function (it, i) {
          return { urls: [it.url], type: it.kind, headers: it.headers, name: title + (files.length > 1 ? ' (' + (i + 1) + ')' : '') };
        }) }, true)) n += files.length;
    }
    sel.forEach(function (it) {
      if (it.kind === 'youtube') {
        if (enqueue({ kind: 'ytdlp', url: it.url, quality: f.q, title: '', platform: 'youtube',
          thumb: 'https://i.ytimg.com/vi/' + it.url.split('v=')[1] + '/hqdefault.jpg' }, true)) n++;
      } else if (it.kind === 'hls') {
        if (enqueue({ kind: 'ytdlp', url: it.url, quality: f.q, title: title, headers: it.headers, platform: 'ads' }, true)) n++;
      }
    });
    if (n) toast(n === 1 ? 'Download gestartet' : n + ' Downloads gestartet');
    S.found = null;
    renderOverlay();
    showTab('downloads');
  }

  // ---------- Bottom-Sheet ----------
  function openSheet(html) {
    S.sheet = '<div class="sheet-bg" data-a="closeSheet"><div class="sheet" data-stop="1"><div class="grab"></div>' + html + '</div></div>';
    renderOverlay();
  }
  function closeSheet() {
    S.sheet = null;
    renderOverlay();
  }

  function histMenu(i) {
    var e = S.history[i];
    if (!e) return;
    openSheet('<div class="result-title" style="padding:0 6px 8px">' + esc(e.title) + '</div>'
      + '<button class="opt" data-a="histOpen" data-i="' + i + '">' + icon('open') + 'Öffnen</button>'
      + '<button class="opt" data-a="histShare" data-i="' + i + '">' + icon('share') + 'Teilen</button>'
      + (e.source ? '<button class="opt" data-a="histSource" data-i="' + i + '">' + icon('globe') + 'Original-Link öffnen</button>' : '')
      + '<button class="opt" data-a="histRemove" data-i="' + i + '">' + icon('x') + 'Aus der Liste entfernen</button>'
      + '<button class="opt danger" data-a="histDelete" data-i="' + i + '">' + icon('trash') + 'Datei löschen</button>');
  }

  // ---------- Klicks ----------
  var ACTIONS = {
    tab: function (el) { closeAllOverlays(); showTab(el.dataset.tab); },
    paste: function (el) {
      var slot = el.dataset.slot;
      var text = A ? A.getClipboard() : null;
      if (!text) { toast('Zwischenablage ist leer'); return; }
      S.slots[slot].input = text.trim();
      S.slots[slot].pick = null;
      S.clip = null;
      var input = $('#in-' + slot);
      if (input) input.value = text.trim();
      analyze(slot, text);
    },
    analyze: function (el) { analyze(el.dataset.slot); },
    cancelAnalyze: function (el) {
      var st = S.slots[el.dataset.slot];
      if (st.req && A) A.cancelAnalyze(st.req);
      st.req = null;
      st.loading = false;
      render();
    },
    quality: function (el) {
      var st = S.slots[el.dataset.slot];
      if (el.getAttribute('aria-disabled')) {
        toast(el.querySelector('b').textContent + ' gibt es für dieses Video nicht');
        return;
      }
      st.q = el.dataset.q;
      render();
    },
    downloadVideo: function (el) { downloadVideo(el.dataset.slot); },
    downloadThumb: function (el) { downloadThumb(el.dataset.slot); },
    downloadImages: function (el) { downloadImages(el.dataset.slot); },
    downloadAudio: function (el) { downloadAudio(el.dataset.slot); },
    downloadPlaylist: function (el) { downloadPlaylist(el.dataset.slot); },
    openVideo: function (el) {
      var r = S.slots[el.dataset.slot].result;
      analyze(el.dataset.slot, 'https://www.youtube.com/watch?v=' + r.videoId);
    },
    toggleImg: function (el) {
      var st = S.slots[el.dataset.slot];
      st.sel[+el.dataset.i] = !st.sel[+el.dataset.i];
      render();
    },
    selectAll: function (el) {
      var st = S.slots[el.dataset.slot];
      var all = st.sel.filter(Boolean).length === st.result.images.length;
      st.sel = st.result.images.map(function () { return !all; });
      render();
    },
    browseInput: function (el) {
      var st = S.slots[el.dataset.slot];
      var m = (st.input || '').match(/https?:\/\/\S+/);
      openBrowser(m ? m[0] : 'https://www.google.com/search?q=' + encodeURIComponent(st.input || ''));
    },
    browseResult: function (el) { openBrowser(S.slots[el.dataset.slot].result.url); },
    lib: function (el) { openBrowser(LIBS[el.dataset.lib].url); },
    cancelJob: function (el) { if (A) A.cancelJob(el.dataset.id); },
    retryJob: function (el) {
      var j = S.jobs[el.dataset.id];
      if (!j) return;
      var copy = {};
      ['kind', 'url', 'infoFile', 'quality', 'format', 'title', 'thumb', 'platform', 'pageUrl', 'headers', 'items', 'range', 'count'].forEach(function (k) { if (j[k] != null) copy[k] = j[k]; });
      delete S.jobs[j.id];
      enqueue(copy);
      render();
    },
    openHist: function (el) { var e = S.history[+el.dataset.i]; if (e && A) A.open(e.uri, e.mime); },
    histMenu: function (el) { histMenu(+el.dataset.i); },
    histOpen: function (el) { var e = S.history[+el.dataset.i]; closeSheet(); if (e && A) A.open(e.uri, e.mime); },
    histShare: function (el) { var e = S.history[+el.dataset.i]; closeSheet(); if (e && A) A.share(e.uri, e.mime); },
    histSource: function (el) { var e = S.history[+el.dataset.i]; closeSheet(); if (e && A) A.openUrl(e.source); },
    histRemove: function (el) {
      var e = S.history[+el.dataset.i];
      closeSheet();
      if (e && A) { A.removeHistory(e.id, false); refreshDownloads(); render(); }
    },
    histDelete: function (el) {
      var e = S.history[+el.dataset.i];
      closeSheet();
      if (e && A) { A.removeHistory(e.id, true); refreshDownloads(); render(); toast('Datei gelöscht'); }
    },
    clearHistory: function () {
      openSheet('<div class="result-title" style="padding:0 6px 8px">Liste leeren?</div><p class="muted small" style="padding:0 6px">Die Dateien bleiben in der Galerie.</p>'
        + '<button class="opt danger" data-a="clearHistoryYes">' + icon('trash') + 'Liste leeren</button>'
        + '<button class="opt" data-a="closeSheet">' + icon('x') + 'Abbrechen</button>');
    },
    clearHistoryYes: function () { closeSheet(); if (A) { A.clearHistory(); A.clearFinished(); } refreshDownloads(); render(); },
    closeSheet: function (el, ev) {
      if (ev && ev.target.closest('[data-stop]') && !ev.target.closest('.opt')) return;
      closeSheet();
    },
    defaultQuality: function (el) { S.quality = el.dataset.q; save('quality', S.quality); render(); },
    updateEngine: function (el) {
      if (!A) return;
      el.disabled = true;
      el.innerHTML = '<span class="spinner"></span>Wird aktualisiert …';
      A.updateEngine();
    },
    toggleAuto: function () {
      S.engine.autoUpdate = S.engine.autoUpdate === false;
      if (A) A.setEngineOptions(S.engine.autoUpdate, !!S.engine.nightly);
      render();
    },
    chooseLink: function (el) {
      var slot = el.dataset.slot;
      var c = chosenLink(slot);
      if (!c) return;
      openSheet('<div class="result-title" style="padding:0 6px 8px">Welchen Link laden?</div>' + c.all.map(function (l, i) {
        return '<button class="opt" data-a="pickLink" data-slot="' + slot + '" data-i="' + i + '">' + icon(l.url === c.link.url ? 'check' : 'globe')
          + '<span style="min-width:0"><b style="display:block">' + esc(l.label) + '</b><small class="muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + esc(l.url) + '</small></span></button>';
      }).join(''));
    },
    pickLink: function (el) {
      var st = S.slots[el.dataset.slot];
      st.pick = +el.dataset.i;
      closeSheet();
      updateDetect(el.dataset.slot);
    },
    useClip: function (el) {
      var slot = el.dataset.slot;
      var det = S.clip;
      S.clip = null;
      if (!det) return;
      S.slots[slot].input = det.links[det.best].url;
      S.slots[slot].pick = null;
      analyze(slot, det.links[det.best].url);
    },
    dismissClip: function () { S.clip = null; render(); },
    toggleClip: function () {
      var on = load('clipSuggest') !== '0';
      save('clipSuggest', on ? '0' : '1');
      render();
    },
    toggleNightly: function () {
      S.engine.nightly = !S.engine.nightly;
      if (A) A.setEngineOptions(S.engine.autoUpdate !== false, S.engine.nightly);
      render();
      if (S.engine.nightly) toast('Beim nächsten Update wird die Nightly-Version geladen');
    },
    login: function (el) {
      var l = LOGINS[el.dataset.platform];
      if (l && A) A.browse(l.url, 'login', l.domain);
    },
    importCookies: function () { if (A) A.importCookies(); },
    clearCookies: function () { if (A) { A.clearCookies(); S.cookies = { domains: [] }; render(); toast('Abgemeldet'); } },
    closeFound: function () { S.found = null; renderOverlay(); },
    foundFilter: function (el) { S.found.filter = el.dataset.f; renderOverlay(); },
    foundAll: function () {
      var f = S.found;
      var vis = f.items.filter(function (it) {
        if (it.small && !f.showSmall) return false;
        return f.filter === 'all' || (f.filter === 'image' ? it.kind === 'image' : it.kind !== 'image');
      });
      var all = vis.every(function (it) { return it.sel; });
      vis.forEach(function (it) { it.sel = !all; });
      renderOverlay();
    },
    toggleFound: function (el) { var it = S.found.items[+el.dataset.i]; it.sel = !it.sel; scheduleOverlayNow(); },
    foundSmall: function () { S.found.showSmall = !S.found.showSmall; renderOverlay(); },
    foundQuality: function (el) { S.found.q = el.dataset.q; renderOverlay(); },
    downloadFound: function () { downloadFound(); }
  };
  function scheduleOverlayNow() { var y = ($('.screen') || {}).scrollTop || 0; renderOverlay(); var s = $('.screen'); if (s) s.scrollTop = y; }

  function closeAllOverlays() {
    if (S.sheet || S.found) { S.sheet = null; S.found = null; renderOverlay(); }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]');
    if (!el) return;
    var fn = ACTIONS[el.dataset.a];
    if (fn) fn(el, ev);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('input[data-slot]')) {
      ev.target.blur();
      analyze(ev.target.dataset.slot);
    }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.matches && ev.target.matches('input[data-slot]')) {
      var slot = ev.target.dataset.slot;
      S.slots[slot].input = ev.target.value;
      S.slots[slot].pick = null;
      updateDetect(slot);
    }
  });

  // ---------- Rückrufe aus Android ----------
  window.CS = {
    onAnalyzed: function (req, r) {
      Object.keys(S.slots).forEach(function (slot) {
        var st = S.slots[slot];
        if (st.req !== req) return;
        st.req = null;
        st.loading = false;
        if (!r || !r.ok) {
          st.error = (r && r.error) || 'Unbekannter Fehler';
          st.errorLogin = r && r.login;
        } else {
          st.result = r;
          st.q = r.kind === 'playlist' ? S.quality : defaultQuality(r);
          st.sel = (r.images || []).map(function () { return true; });
          if (r.kind === 'browse' && r.why === 'ads') openBrowser(r.url);
        }
        if (S.tab === slot) {
          render();
          scrollToResult(slot);
        }
      });
    },
    onClipboard: function (det) {
      if (!det || !det.links || det.best < 0) return;
      var url = det.links[det.best].url;
      // schon im Feld oder gerade geprüft → kein Vorschlag nötig
      var same = Object.keys(S.slots).some(function (k) {
        var c = chosenLink(k);
        return c && c.link.url === url;
      });
      if (same) return;
      S.clip = det;
      if (S.tab === 'home' || S.tab === 'ads') render();
    },
    onShared: function (text) {
      closeAllOverlays();
      S.clip = null;
      S.slots.home.pick = null;
      S.tab = 'home';
      S.slots.home.input = text;
      render();
      analyze('home', text);
    },
    showTab: function (tab) { closeAllOverlays(); showTab(tab); },
    onJob: function (job) {
      var old = S.jobs[job.id];
      S.jobs[job.id] = job;
      var finished = job.state === 'done' && (!old || old.state !== 'done');
      if (finished) {
        S.history = parse(A ? A.history() : '[]', S.history);
        toast('Gespeichert: ' + (job.title || 'Download'));
      }
      if (job.state === 'error' && (!old || old.state !== 'error')) toast('Fehlgeschlagen: ' + (job.title || 'Download'));
      renderNav();
      if (S.tab !== 'downloads') return;
      var row = document.querySelector('[data-job="' + job.id + '"]');
      if (row && !finished && (job.state === 'running' || job.state === 'queued') && old && old.state === job.state) {
        var tmp = document.createElement('div');
        tmp.innerHTML = jobHtml(job);
        row.parentNode.replaceChild(tmp.firstChild, row);
      } else {
        render();
      }
    },
    onBrowserResult: function (res) {
      if (!res || !res.items || !res.items.length) return;
      var cookies = res.cookies || {};
      var headersFor = function (url) {
        var h = { 'User-Agent': res.userAgent || '' };
        if (/^https?:/.test(res.pageUrl || '')) h.Referer = res.pageUrl;
        var host = '';
        try { host = new URL(url).host; } catch (e) { /* ungültig */ }
        if (cookies[host]) h.Cookie = cookies[host];
        return h;
      };
      S.found = {
        page: res.pageUrl, title: res.title, filter: 'all', q: S.quality, showSmall: false,
        items: res.items.map(function (it) {
          return { kind: it.kind, url: it.url, width: it.width || 0, height: it.height || 0, poster: it.poster, headers: headersFor(it.url),
            sel: it.kind !== 'image' || !it.width || (it.width >= 150 && it.height >= 150),
            small: it.kind === 'image' && it.width > 0 && (it.width < 150 || it.height < 150) };
        })
      };
      renderOverlay();
    },
    onEngine: function (info) {
      S.engine = info;
      renderEnginePill();
      if (S.tab === 'home' || S.tab === 'more') render();
    },
    onEngineUpdate: function (r) {
      if (r.version) S.engine.version = r.version;
      if (r.galleryVersion) S.engine.galleryVersion = r.galleryVersion;
      if (r.ok) S.engine.lastCheck = Date.now();
      if (!r.auto || r.updated) {
        toast(r.ok ? (r.updated ? 'Engine aktualisiert auf ' + r.version : 'Engine ist aktuell (' + r.version + ')') : 'Update fehlgeschlagen: ' + r.error);
      }
      if (S.tab === 'more') render();
    },
    onCookies: function (info) {
      S.cookies = info;
      if (S.tab === 'more') render();
    },
    back: function () {
      if (S.sheet) { closeSheet(); return true; }
      if (S.found) { S.found = null; renderOverlay(); return true; }
      if (S.tab !== 'home') { showTab('home'); return true; }
      return false;
    }
  };

  // ---------- Start ----------
  $('#logo').innerHTML = icon('download');
  if (A) {
    S.engine = parse(A.engineInfo(), S.engine);
    refreshDownloads();
  }
  render();
})();

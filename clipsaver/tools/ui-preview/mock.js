/* Ersatz für window.Android (MainActivity.Bridge), damit sich die Oberfläche im Desktop-Browser
   ansehen und testen lässt: node tools/ui-preview/run.js */
(function () {
  function svg(w, h, a, b, text) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>'
      + '<rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="white" font-family="sans-serif" font-size="' + Math.round(w / 9)
      + '" text-anchor="middle" dominant-baseline="middle">' + text + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  var COLORS = [['#ff3d6e', '#7c3aed'], ['#22d3ee', '#2563eb'], ['#f59e0b', '#ef4444'], ['#10b981', '#0ea5e9'], ['#a855f7', '#ec4899'], ['#f97316', '#facc15']];
  var RESULTS = {
    youtube: {
      ok: true, source: 'ytdlp', platform: 'youtube', kind: 'video', id: 'abc', title: 'Alpen in 4K – Drohnenflug über den Gletscher bei Sonnenaufgang',
      uploader: 'Mountain Views', duration: 754, pageUrl: 'https://www.youtube.com/watch?v=abcdefghijk', url: 'https://youtu.be/abcdefghijk',
      thumbnail: svg(1280, 720, '#0ea5e9', '#1e3a8a', 'YouTube 16:9'), maxRes: 2160, infoFile: '/x.json', audioSize: 12100000,
      qualities: [{ target: 1080, available: true, res: 1080, size: 412000000 }, { target: 1440, available: true, res: 1440, size: 905000000 },
        { target: 2160, available: true, res: 2160, size: 2210000000 }]
    },
    tiktok: {
      ok: true, source: 'ytdlp', platform: 'tiktok', kind: 'video', title: 'Neuer Trend 😂 #fyp #viral', uploader: 'creator.name', duration: 34,
      pageUrl: 'https://www.tiktok.com/@creator.name/video/7300000000000000000', thumbnail: svg(720, 1280, '#ff3d6e', '#22d3ee', 'TikTok'),
      maxRes: 1080, infoFile: '/y.json', audioSize: 500000,
      qualities: [{ target: 1080, available: true, res: 1080, size: 8300000 }, { target: 1440, available: false, res: 1080 }, { target: 2160, available: false, res: 1080 }]
    },
    photo: {
      ok: true, source: 'tiktok-web', platform: 'tiktok', kind: 'images', title: 'Urlaubsfotos Teil 2 ☀️ #photomode', uploader: '@travel.diary',
      pageUrl: 'https://www.tiktok.com/@travel.diary/photo/7300000000000000001', audioUrl: 'https://example.com/a.m4a', audioTitle: 'original sound',
      images: COLORS.map(function (c, i) { return { url: svg(1080, 1440, c[0], c[1], 'Foto ' + (i + 1)), width: 1080, height: 1440, fallback: [] }; }),
      thumbnail: svg(1080, 1440, '#ff3d6e', '#7c3aed', 'Foto 1'), headers: {}
    },
    post: {
      ok: true, source: 'youtube-post', platform: 'youtube', kind: 'images', title: 'Neues Merch ist da! Welche Farbe gefällt euch am besten?', uploader: 'Kanalname',
      pageUrl: 'https://www.youtube.com/post/UgkxAAAAAAAAAAAA', images: COLORS.slice(0, 3).map(function (c, i) {
        return { url: svg(1200, 1200, c[0], c[1], 'Bild ' + (i + 1)), width: 1200, height: 1200, fallback: [] };
      })
    },
    playlist: {
      ok: true, source: 'ytdlp', platform: 'youtube', kind: 'playlist', title: 'Lofi Mix 2026', count: 12,
      entries: Array.apply(null, Array(12)).map(function (_, i) { return { url: 'https://youtube.com/watch?v=x' + i, title: 'Track ' + (i + 1), duration: 180 + i * 7 }; })
    },
    low: {
      ok: true, source: 'ytdlp', platform: 'youtube', kind: 'video', title: 'Altes Video von 2009', uploader: 'Retro', duration: 95,
      pageUrl: 'https://www.youtube.com/watch?v=old', thumbnail: svg(640, 480, '#64748b', '#0f172a', '480p'), maxRes: 480, low: { target: 480, res: 480, format: '135+140', size: 9000000 },
      qualities: [{ target: 1080, available: false, res: 480 }, { target: 1440, available: false, res: 480 }, { target: 2160, available: false, res: 480 }]
    },
    error: { ok: false, error: 'Das Video ist privat.' },
    login: { ok: false, error: 'Diese Seite zeigt den Beitrag nur angemeldet. Melde dich unter „Mehr → Anmeldung“ an.', login: 'instagram', url: 'https://www.instagram.com/p/X/' },
    tweet: {
      ok: true, source: 'ytdlp', platform: 'twitter', kind: 'video', title: 'Max - Konzert gestern, Video und zwei Fotos 🎸', uploader: 'Max', duration: 42,
      pageUrl: 'https://x.com/max/status/1932498346298290497', url: 'https://x.com/max/status/1932498346298290497',
      thumbnail: svg(1280, 720, '#111', '#334155', 'X-Video'), maxRes: 1080, infoFile: '/t.json', audioSize: 700000,
      qualities: [{ target: 1080, available: true, res: 1080, size: 21000000, format: 'http-2176+0' }, { target: 1440, available: false, res: 1080 }, { target: 2160, available: false, res: 1080 }],
      headers: {}, images: [
        { type: 'image', url: svg(2048, 1365, '#f97316', '#be123c', 'Foto 1'), width: 2048, height: 1365, via: 'files', fallback: [] },
        { type: 'image', url: svg(1200, 1600, '#0ea5e9', '#4338ca', 'Foto 2'), width: 1200, height: 1600, via: 'files', fallback: [] }]
    },
    carousel: {
      ok: true, source: 'gallery-dl', platform: 'instagram', kind: 'images', title: 'Sommer am Meer 🌊 Teil 1', uploader: '@reise.tagebuch',
      pageUrl: 'https://www.instagram.com/p/CxAbC123/', gdlUrl: 'https://www.instagram.com/p/CxAbC123/', gdlRange: true,
      images: [
        { type: 'image', url: svg(1080, 1350, '#f58529', '#dd2a7b', '1'), width: 1080, height: 1350, via: 'gdl', index: 1 },
        { type: 'video', url: 'https://example.com/reel.mp4', thumb: svg(1080, 1920, '#8134af', '#dd2a7b', 'Reel'), width: 1080, height: 1920, via: 'gdl', index: 2 },
        { type: 'image', url: svg(1080, 1350, '#22d3ee', '#0f766e', '3'), width: 1080, height: 1350, via: 'gdl', index: 3 }],
      thumbnail: svg(1080, 1350, '#f58529', '#dd2a7b', '1')
    },
    ads: { ok: true, kind: 'browse', why: 'ads', url: 'https://library.tiktok.com/ads', message: 'Werbebibliothek erkannt – die Seite öffnet sich im Browser.' }
  };
  var FOUND = {
    pageUrl: 'https://adstransparency.google.com/advertiser/AR123/creative/CR456?region=DE', title: 'Werbetreibender XY – Anzeigen-Transparenzcenter',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile Safari/537.36', cookies: { 'example.com': 'a=1' },
    items: [
      { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { kind: 'image', url: svg(1200, 628, '#f59e0b', '#ef4444', 'Bild-Anzeige'), width: 1200, height: 628 },
      { kind: 'image', url: svg(300, 250, '#10b981', '#0ea5e9', 'Banner'), width: 300, height: 250 },
      { kind: 'video', url: 'https://example.com/ad.mp4', poster: svg(720, 1280, '#a855f7', '#ec4899', 'Video-Ad') },
      { kind: 'image', url: svg(64, 64, '#444', '#222', 'i'), width: 64, height: 64 },
      { kind: 'hls', url: 'https://example.com/master.m3u8' }
    ]
  };
  var history = [
    { id: 'h1', title: 'Alpen in 4K – Drohnenflug (4K)', kind: 'video', uri: 'content://media/1', mime: 'video/mp4', time: Date.now() - 600000, platform: 'youtube', label: '4K',
      thumb: svg(320, 180, '#0ea5e9', '#1e3a8a', '4K') },
    { id: 'h2', title: 'Urlaubsfotos Teil 2 (3)', kind: 'image', uri: 'content://media/2', mime: 'image/jpeg', time: Date.now() - 86400000, platform: 'tiktok',
      thumb: svg(300, 400, '#f59e0b', '#ef4444', '3') },
    { id: 'h3', title: 'original sound', kind: 'audio', uri: 'content://media/3', mime: 'audio/mpeg', time: Date.now() - 3 * 86400000, platform: 'tiktok' }
  ];
  var jobs = [];
  var clipboard = 'https://www.youtube.com/watch?v=abcdefghijk';
  window.__mock = { results: RESULTS, setClipboard: function (t) { clipboard = t; } };

  function pick(text) {
    if (/x\.com/.test(text)) return RESULTS.tweet;
    if (/instagram\.com\/p\/X/.test(text)) return RESULTS.login;
    if (/instagram/.test(text)) return RESULTS.carousel;
    if (/photo/.test(text)) return RESULTS.photo;
    if (/post/.test(text)) return RESULTS.post;
    if (/playlist|list=/.test(text)) return RESULTS.playlist;
    if (/old/.test(text)) return RESULTS.low;
    if (/privat/.test(text)) return RESULTS.error;
    if (/library\.tiktok/.test(text)) return RESULTS.ads;
    if (/tiktok/.test(text)) return RESULTS.tiktok;
    return RESULTS.youtube;
  }

  window.Android = {
    load: function (k) { return localStorage.getItem(k); },
    save: function (k, v) { localStorage.setItem(k, v); },
    getClipboard: function () { return clipboard; },
    appVersion: function () { return '1.0'; },
    engineInfo: function () { return JSON.stringify({ state: 'ready', version: '2026.10.20', galleryVersion: '1.32.19', autoUpdate: true, nightly: false, lastCheck: Date.now() - 3600e3 }); },
    analyze: function (req, text) { setTimeout(function () { CS.onAnalyzed(req, pick(text)); }, 400); },
    cancelAnalyze: function () {},
    enqueue: function (json) {
      var job = JSON.parse(json);
      job.id = 'j' + Math.random().toString(36).slice(2);
      job.state = 'running';
      job.progress = 0.42;
      job.status = 'Video · 42 % · 3,2 MB/s · noch 00:21';
      job.created = Date.now();
      jobs.push(job);
      setTimeout(function () { CS.onJob(JSON.parse(JSON.stringify(job))); }, 50);
      return job.id;
    },
    cancelJob: function (id) {},
    jobs: function () { return JSON.stringify(jobs); },
    clearFinished: function () {},
    history: function () { return JSON.stringify(history); },
    removeHistory: function (id) { history = history.filter(function (h) { return h.id !== id; }); },
    clearHistory: function () { history = []; },
    open: function () {}, share: function () {}, openUrl: function () {},
    browse: function (url, mode) { if (mode !== 'login') setTimeout(function () { CS.onBrowserResult(JSON.parse(JSON.stringify(FOUND))); }, 200); },
    setEngineOptions: function () {}, updateEngine: function () { setTimeout(function () { CS.onEngineUpdate({ ok: true, updated: false, version: '2026.10.20' }); }, 500); },
    cookiesInfo: function () { return JSON.stringify({ domains: ['tiktok.com'] }); },
    importCookies: function () {}, clearCookies: function () {}
  };
})();

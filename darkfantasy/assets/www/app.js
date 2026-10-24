// Oberfläche: Stilauswahl, Beschwören, Charakterkarte, Sammlung (Favoriten) und Verlauf.
(function () {
  var D = DF_DATA, G = DF_GEN;
  var HISTORY_MAX = 60;
  var $ = function (id) { return document.getElementById(id); };

  // ---- Speicher (Android-Bridge, sonst localStorage) ----
  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.Android ? Android.load(key) : localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      var raw = JSON.stringify(value);
      try { if (window.Android) Android.save(key, raw); else localStorage.setItem(key, raw); } catch (e) { /* egal */ }
    }
  };

  var settings = store.get('settings', { style: 'dark', gender: 'r', mode: 'balanced' });
  var favorites = store.get('favorites', []);
  var history = store.get('history', []);
  var stats = store.get('stats', { total: 0, legendary: 0, mythic: 0 });
  var current = null; // { opts, char }
  var filter = 'all';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---- Stilauswahl & Optionen ----
  function renderStyles() {
    $('styles').innerHTML = D.STYLE_IDS.map(function (id) {
      return '<button class="style' + (settings.style === id ? ' sel' : '') + '" data-style="' + id + '">' +
        '<div class="style-art">' + DF_SIGIL.scene(id) + '<span class="check">✓</span></div>' +
        '<div class="style-name">' + esc(D.STYLES[id].name) + '</div></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#gender .chip'), function (b) {
      b.classList.toggle('sel', b.dataset.v === settings.gender);
    });
    $('mode-value').textContent = settings.mode === 'chaos'
      ? 'Chaos – Welten vermischen sich' : 'Ausgewogen – passend zum Stil';
    $('mode').classList.toggle('chaos', settings.mode === 'chaos');
  }

  function renderCounter() {
    $('counter').innerHTML = stats.total
      ? stats.total + ' beschworen · <span style="color:#fbbf24">' + stats.legendary + ' Legendär</span> · <span style="color:#f43f5e">' +
        stats.mythic + ' Mythisch</span>'
      : 'Wähle einen Stil und beschwöre deinen ersten Helden.';
  }

  $('styles').addEventListener('click', function (e) {
    var b = e.target.closest('.style');
    if (!b) return;
    settings.style = b.dataset.style;
    store.set('settings', settings);
    renderStyles();
  });
  $('gender').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    settings.gender = b.dataset.v;
    store.set('settings', settings);
    renderStyles();
  });
  $('mode').addEventListener('click', function () {
    settings.mode = settings.mode === 'chaos' ? 'balanced' : 'chaos';
    store.set('settings', settings);
    renderStyles();
  });

  // ---- Charakterkarte ----
  function isFavorite(code) {
    return favorites.some(function (f) { return f.code === code; });
  }

  function cardHtml(c, actions) {
    var st = D.STYLES[c.style];
    var statRows = D.STATS.map(function (s) {
      var v = c.stats[s.id];
      return '<div class="stat"><span class="stat-k">' + s.short + '</span><div class="bar"><i style="width:' + Math.min(100, v / 24 * 100) +
        '%"></i></div><span class="stat-v">' + v + '</span></div>';
    }).join('');
    var abil = c.abilities.map(function (a) {
      return '<div class="ability t-' + a.type.toLowerCase() + '"><div class="ab-head"><b>' + esc(a.name) + '</b><span class="tag">' + esc(a.type) +
        '</span></div><div class="ab-desc">' + esc(a.desc) + '</div></div>';
    }).join('');
    var fav = isFavorite(c.code);
    var html = '<article class="card r-' + c.rarity + '" style="--rc:' + c.rarityColor + '">' +
      '<div class="card-top"><div class="portrait">' + DF_SIGIL.render(c, G.decode(c.code).seeds.core) + '</div>' +
      '<div class="rarity">' + esc(c.rarityName) + '</div></div>' +
      '<div class="card-body">' +
      '<h2 class="cname">' + esc(c.name) + '</h2><div class="epithet">' + esc(c.epithet) + '</div>' +
      '<div class="meta">' + esc(c.race) + ' · ' + esc(c.cls) + ' · Stufe ' + c.level + '</div>' +
      '<div class="meta2">' + esc(c.alignment) + ' · ' + esc(c.mode === 'chaos' ? 'Chaos' : st.short) + ' · <b>Macht ' + c.power + '</b></div>' +
      '<div class="stats">' + statRows + '</div>' +
      '<div class="weapon"><span>Waffe</span>' + esc(c.weapon) + '</div>' +
      '<h3>Fähigkeiten</h3>' + abil +
      '<h3>Lore</h3><p class="lore">' + c.lore.map(esc).join(' ') + '</p>' +
      '<blockquote>' + esc(c.quote) + '</blockquote>' +
      '</div>';
    if (actions) {
      html += '<div class="card-actions">' +
        '<button class="act fav' + (fav ? ' on' : '') + '" data-act="fav">' + (fav ? '♥ Gespeichert' : '♡ Speichern') + '</button>' +
        '<button class="act" data-act="share">Teilen</button><button class="act" data-act="copy">Code kopieren</button></div>';
      if (actions === 'reroll') {
        html += '<div class="reroll"><span>Neu würfeln:</span>' +
          '<button class="chip" data-act="r-name">Name</button><button class="chip" data-act="r-abil">Fähigkeiten</button>' +
          '<button class="chip" data-act="r-lore">Lore</button></div>';
      }
    }
    return html + '</article>';
  }

  function bindCard(container, c, onChange) {
    container.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'fav') {
        if (isFavorite(c.code)) {
          favorites = favorites.filter(function (f) { return f.code !== c.code; });
          toast('Aus der Sammlung entfernt');
        } else {
          favorites.unshift({ code: c.code, char: c, at: Date.now() });
          toast('In der Sammlung gespeichert');
        }
        store.set('favorites', favorites);
        onChange(c);
      } else if (act === 'share') {
        var text = G.toText(c);
        if (window.Android) Android.share(text, c.name);
        else if (navigator.share) navigator.share({ title: c.name, text: text }).catch(function () {});
        else copy(text, 'Text kopiert');
      } else if (act === 'copy') {
        copy(c.code, 'Code kopiert');
      } else if (act.indexOf('r-') === 0 && current) {
        var key = { 'r-name': 'name', 'r-abil': 'abil', 'r-lore': 'lore' }[act];
        current.opts.seeds[key] = G.newSeed();
        showCurrent(false);
        remember(current.char, false);
      }
    };
  }

  function copy(text, msg) {
    if (window.Android) { Android.copy(text); toast(msg); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(msg); }, function () { toast(text); });
  }

  function showCurrent(animate) {
    current.char = G.generate(current.opts);
    var box = $('result');
    box.innerHTML = cardHtml(current.char, 'reroll');
    if (animate) {
      var card = box.firstChild;
      card.classList.add('reveal');
      if (current.char.tier >= 3) card.classList.add('burst');
      setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    }
    bindCard(box, current.char, function () { showCurrent(false); });
  }

  // Im Verlauf ersetzt ein neu gewürfelter Teil den vorherigen Eintrag desselben Charakters
  function remember(c, isNew) {
    if (!isNew && history.length) history.shift();
    history.unshift({ code: c.code, char: c, at: Date.now() });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    store.set('history', history);
  }

  $('summon').addEventListener('click', function () {
    var btn = $('summon');
    btn.classList.add('casting');
    setTimeout(function () {
      btn.classList.remove('casting');
      current = { opts: G.randomOptions(settings.style, settings.gender, settings.mode) };
      showCurrent(true);
      stats.total++;
      if (current.char.rarity === 'legendary') stats.legendary++;
      if (current.char.rarity === 'mythic') stats.mythic++;
      store.set('stats', stats);
      renderCounter();
      remember(current.char, true);
      if (current.char.tier >= 3) toast(current.char.rarityName + '!');
    }, 420);
  });

  // ---- Listen ----
  function rowHtml(entry) {
    var c = entry.char;
    return '<button class="row" data-code="' + esc(c.code) + '" style="--rc:' + c.rarityColor + '">' +
      '<div class="row-sigil">' + DF_SIGIL.render(c, G.decode(c.code).seeds.core) + '</div>' +
      '<div class="row-main"><div class="row-name">' + esc(c.name) + '</div>' +
      '<div class="row-meta">' + esc(c.race) + ' · ' + esc(c.cls) + ' · Stufe ' + c.level + '</div></div>' +
      '<div class="row-r">' + esc(c.rarityName) + '</div></button>';
  }

  function renderCollection() {
    var counts = { all: favorites.length };
    favorites.forEach(function (f) { counts[f.char.rarity] = (counts[f.char.rarity] || 0) + 1; });
    $('filter').innerHTML = [{ id: 'all', name: 'Alle' }].concat(D.RARITIES).map(function (r) {
      return '<button class="chip' + (filter === r.id ? ' sel' : '') + '" data-f="' + r.id + '"' +
        (r.color ? ' style="--cc:' + r.color + '"' : '') + '>' + esc(r.name) + ' ' + (counts[r.id] || 0) + '</button>';
    }).join('');
    var list = favorites.filter(function (f) { return filter === 'all' || f.char.rarity === filter; });
    $('collection-list').innerHTML = list.length ? list.map(rowHtml).join('')
      : '<div class="empty">Noch nichts gespeichert. Tippe auf „♡ Speichern“, um Charaktere in deine Sammlung zu legen.</div>';
  }

  function renderHistory() {
    $('history-list').innerHTML = history.length ? history.map(rowHtml).join('')
      : '<div class="empty">Hier erscheinen deine zuletzt beschworenen Charaktere.</div>';
  }

  $('filter').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.f;
    renderCollection();
  });

  function openFromList(list, e) {
    var b = e.target.closest('.row');
    if (!b) return;
    var entry = list().filter(function (x) { return x.code === b.dataset.code; })[0];
    if (entry) openDetail(entry.char);
  }
  $('collection-list').addEventListener('click', function (e) { openFromList(function () { return favorites; }, e); });
  $('history-list').addEventListener('click', function (e) { openFromList(function () { return history; }, e); });
  $('clear-history').addEventListener('click', function () {
    if (!history.length || !confirm('Verlauf wirklich leeren? Gespeicherte Charaktere bleiben erhalten.')) return;
    history = [];
    store.set('history', history);
    renderHistory();
  });

  function openDetail(c) {
    var body = $('detail-body');
    body.innerHTML = cardHtml(c, 'basic');
    bindCard(body, c, function () { openDetail(c); renderCollection(); });
    $('detail').hidden = false;
    $('detail').scrollTop = 0;
  }
  $('detail-close').addEventListener('click', function () { $('detail').hidden = true; });

  // ---- Code importieren ----
  function importText(text) {
    var opts = G.decode(text);
    if (!opts) { toast('Kein gültiger Charakter-Code'); return false; }
    var c = G.generate(opts);
    remember(c, true);
    openDetail(c);
    return true;
  }
  $('import-btn').addEventListener('click', function () {
    $('import-text').value = '';
    $('dialog').hidden = false;
  });
  $('paste').addEventListener('click', function () {
    if (window.Android) { $('import-text').value = Android.getClipboard() || ''; return; }
    if (navigator.clipboard) navigator.clipboard.readText().then(function (t) { $('import-text').value = t; }, function () {});
  });
  $('import-cancel').addEventListener('click', function () { $('dialog').hidden = true; });
  $('import-ok').addEventListener('click', function () {
    if (importText($('import-text').value)) $('dialog').hidden = true;
  });

  // ---- Navigation ----
  function show(view) {
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (view === 'collection') renderCollection();
    if (view === 'history') renderHistory();
    window.scrollTo(0, 0);
  }
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) show(b.dataset.view);
  });

  window.DF = {
    back: function () {
      if (!$('dialog').hidden) { $('dialog').hidden = true; return true; }
      if (!$('detail').hidden) { $('detail').hidden = true; return true; }
      if (!$('view-create').classList.contains('active')) { show('create'); return true; }
      return false;
    },
    importText: function (text) { $('dialog').hidden = true; importText(text); }
  };

  // Glut im Hintergrund
  var embers = document.querySelector('.embers');
  for (var i = 0; i < 26; i++) {
    var e = document.createElement('i');
    e.style.left = Math.random() * 100 + '%';
    e.style.animationDelay = (-Math.random() * 14) + 's';
    e.style.animationDuration = (9 + Math.random() * 9) + 's';
    e.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
    embers.appendChild(e);
  }

  renderStyles();
  renderCounter();
})();

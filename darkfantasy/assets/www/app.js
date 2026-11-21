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

  function rankBadge(rank) {
    if (!rank) return '<span class="rank r0">Eigene</span>';
    var r = D.RARITIES[rank];
    return '<span class="rank" style="--rk:' + r.color + '">' + esc(r.name) + '</span>';
  }

  function sigilSeed(c) { return c.seed || G.decode(c.code).seeds.core; }

  function cardHtml(c, actions) {
    var st = D.STYLES[c.style];
    var statRows = D.STATS.map(function (s) {
      var v = c.stats[s.id];
      return '<div class="stat"><span class="stat-k">' + s.short + '</span><div class="bar"><i style="width:' + Math.min(100, v / 24 * 100) +
        '%"></i></div><span class="stat-v">' + v + '</span></div>';
    }).join('');
    var abil = c.abilities.map(function (a) {
      return '<div class="ability t-' + a.type.toLowerCase() + '"><div class="ab-head"><b>' + esc(a.name) + '</b><span class="tags">' +
        (a.rank && a.type !== 'Mythisch' ? rankBadge(a.rank) : '') + '<span class="tag">' + esc(a.type) + '</span></span></div><div class="ab-desc">' + esc(a.desc) + '</div></div>';
    }).join('');
    var fav = isFavorite(c.code);
    var html = '<article class="card r-' + c.rarity + '" style="--rc:' + c.rarityColor + '">' +
      '<div class="card-top"><div class="portrait">' + DF_SIGIL.render(c, sigilSeed(c)) + '</div>' +
      '<div class="rarity">' + esc(c.rarityName) + '</div></div>' +
      '<div class="card-body">' +
      '<h2 class="cname">' + esc(c.name) + '</h2>' + (c.epithet ? '<div class="epithet">' + esc(c.epithet) + '</div>' : '') +
      '<div class="meta">' + esc(c.race) + ' · ' + esc(c.cls) + ' · Stufe ' + c.level + '</div>' +
      '<div class="meta2">' + esc(c.alignment) + ' · ' + esc(c.custom ? 'Eigene Kreation' : c.mode === 'chaos' ? 'Chaos' : st.short) + ' · <b>Macht ' + c.power + '</b></div>' +
      '<div class="stats">' + statRows + '</div>' +
      '<div class="weapon"><span>Waffe</span><div class="weapon-row">' + esc(c.weapon) + rankBadge(c.weaponRank) + '</div></div>' +
      '<h3>Fähigkeiten</h3>' + abil +
      (c.lore.length ? '<h3>Lore</h3><p class="lore">' + c.lore.map(esc).join(' ') + '</p>' : '') +
      (c.quote ? '<blockquote>' + esc(c.quote) + '</blockquote>' : '') +
      '</div>';
    if (actions) {
      html += '<div class="card-actions">' +
        '<button class="act fav' + (fav ? ' on' : '') + '" data-act="fav">' + (fav ? '♥ Gespeichert' : '♡ Speichern') + '</button>' +
        '<button class="act" data-act="share">Teilen</button><button class="act" data-act="copy">Code</button>' +
        '<button class="act" data-act="edit">✎ Bearbeiten</button></div>';
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
      } else if (act === 'edit') {
        $('detail').hidden = true;
        editChar(c);
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
      '<div class="row-sigil">' + DF_SIGIL.render(c, sigilSeed(c)) + '</div>' +
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
    var c = G.fromCode(text);
    if (!c) { toast('Kein gültiger Charakter-Code'); return false; }
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

  // ---- Selbst erstellen ----
  var ed = null;          // Editor-Zustand (siehe DF_GEN.sanitize)
  var editingCode = null; // Code des Sammlungs-Eintrags, der gerade bearbeitet wird
  var edOpen = {};        // aufgeklappte Fähigkeitsgruppen
  var BEST = '<span class="best">★ Beste</span>';

  function edEntry(list, key) { var p = key.split(':'); return D.STYLES[p[0]][list][+p[1]]; }
  function edArche() { return edEntry('classes', ed.cls)[1]; }
  function edRarity() { return G.rarityById(ed.rarity); }
  function saveDraft() { store.set('draft', ed); }

  // Grenzen der Seltenheit anwenden, Texte so lassen, wie sie gerade getippt werden
  function normalize() {
    var text = { name: ed.name, epithet: ed.epithet, lore: ed.lore, quote: ed.quote, weapon: ed.weapon };
    ed = Object.assign(G.sanitize(ed), text);
    var r = edRarity();
    if (r.ultimate && !ed.ultimate) ed.ultimate = edArche();
    if (r.gift && ed.gift === null) ed.gift = 0;
  }

  function newDraft() {
    ed = G.toState(G.generate(G.randomOptions(settings.style, settings.gender, 'balanced')));
    editingCode = null;
    normalize();
  }

  function editChar(c) {
    ed = G.toState(c);
    editingCode = isFavorite(c.code) ? c.code : null;
    normalize();
    saveDraft();
    show('editor');
  }

  function optionGroups(list, current, label) {
    var order = [ed.style].concat(D.STYLE_IDS.filter(function (id) { return id !== ed.style; }));
    return order.map(function (id) {
      return '<optgroup label="' + esc(D.STYLES[id].name) + '">' + D.STYLES[id][list].map(function (item, i) {
        var key = id + ':' + i;
        return '<option value="' + key + '"' + (key === current ? ' selected' : '') + '>' + esc(label(item)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function renderEdText() {
    $('ed-name').value = ed.name;
    $('ed-epithet').value = ed.epithet;
    $('ed-lore').value = ed.lore;
    $('ed-quote').value = ed.quote;
  }

  function renderEdBasics() {
    $('ed-style').innerHTML = D.STYLE_IDS.map(function (id) {
      return '<button class="chip' + (ed.style === id ? ' sel' : '') + '" data-v="' + id + '">' + esc(D.STYLES[id].name) + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#ed-gender .chip'), function (b) {
      b.classList.toggle('sel', b.dataset.v === ed.gender);
    });
    $('ed-race').innerHTML = optionGroups('races', ed.race, function (r) { return G.form(r, ed.gender); });
    $('ed-cls').innerHTML = optionGroups('classes', ed.cls, function (c) {
      return G.form(c[0], ed.gender) + ' · ' + D.ARCHETYPES[c[1]].name;
    });
    $('ed-align').innerHTML = D.ALIGNMENTS.map(function (a) {
      return '<option' + (a === ed.alignment ? ' selected' : '') + '>' + esc(a) + '</option>';
    }).join('');
  }

  function renderEdRarity() {
    var r = edRarity(), last = D.RARITIES.length - 1;
    $('ed-rarity').innerHTML = D.RARITIES.map(function (x, i) {
      return '<button class="rp' + (x.id === ed.rarity ? ' sel' : '') + '" data-v="' + x.id + '" style="--rk:' + x.color + '">' +
        '<b>' + esc(x.name) + '</b>' + (i === last ? BEST : '') + '</button>';
    }).join('');
    $('ed-rarity-info').innerHTML = r.points + ' Attributpunkte (max. ' + r.maxStat + ' pro Wert) · ' + G.slots(r) + ' Fähigkeiten' +
      (r.ultimate ? ' + Ultimativ' : '') + (r.gift ? ' + Mythische Gabe' : '') + ' · Stufe ' + r.level[0] + '–' + r.level[1];
    var lv = $('ed-level');
    lv.min = r.level[0]; lv.max = r.level[1]; lv.value = ed.level;
    $('ed-level-v').innerHTML = ed.level + (ed.level === r.level[1] ? ' ' + BEST : '');
  }

  function renderEdStats() {
    var r = edRarity(), sum = 0;
    $('ed-stats').innerHTML = D.STATS.map(function (st) {
      var v = ed.stats[st.id];
      sum += v;
      return '<div class="ed-stat"><span class="ed-stat-n">' + esc(st.name) + '</span>' +
        '<button class="pm" data-stat="' + st.id + '" data-d="-1">−</button><b>' + v + '</b>' +
        '<button class="pm" data-stat="' + st.id + '" data-d="1">+</button>' +
        '<div class="bar"><i style="width:' + (v / r.maxStat * 100) + '%;background:' + r.color + '"></i></div></div>';
    }).join('');
    var left = r.points - sum;
    $('ed-points').textContent = left ? left + ' Punkte übrig' : 'alle verteilt ✓';
    $('ed-points').classList.toggle('done', !left);
  }

  function abilityItem(kind, key, selected, best, full) {
    var a = G.describe(kind, key, ed);
    return '<button class="ab-pick' + (selected ? ' sel' : '') + (full && !selected ? ' full' : '') + '" data-kind="' + kind + '" data-key="' + key + '">' +
      '<span class="box">' + (selected ? '✓' : '') + '</span><span class="ab-main"><span class="ab-line"><b>' + esc(a.name) + '</b>' +
      rankBadge(a.rank) + (best ? BEST : '') + '</span><span class="ab-d">' + (a.type === 'Passiv' ? 'Passiv: ' : '') + esc(a.desc) +
      '</span></span></button>';
  }

  function renderEdAbilities() {
    var r = edRarity(), own = edArche(), max = G.slots(r), full = ed.abilities.length >= max;
    $('ed-abil-count').textContent = ed.abilities.length + ' / ' + max + ' gewählt';
    var groups = [own].concat(Object.keys(D.ABILITIES).filter(function (k) { return k !== own; }));
    var html = groups.map(function (arche) {
      var list = D.ABILITIES[arche].map(function (e, i) { return { key: arche + ':' + i, rank: e[2] }; });
      list.sort(function (a, b) { return b.rank - a.rank; });
      var picked = list.filter(function (x) { return ed.abilities.indexOf(x.key) >= 0; }).length;
      var open = arche === own || edOpen[arche];
      return '<div class="ab-group"><button class="ab-gh" data-group="' + arche + '"><span>' + esc(D.ARCHETYPES[arche].name) +
        (arche === own ? ' <small>(deine Klasse)</small>' : '') + '</span><span>' + (picked ? picked + ' ✓ ' : '') + (open ? '▾' : '▸') + '</span></button>' +
        (open ? list.map(function (x) { return abilityItem('a', x.key, ed.abilities.indexOf(x.key) >= 0, x.rank === 3, full); }).join('') : '') +
        '</div>';
    }).join('');

    html += '<h4 class="ed-sub">Ultimative Fähigkeit</h4>';
    html += r.ultimate ? Object.keys(D.ULTIMATES).map(function (k) {
      return abilityItem('u', k, ed.ultimate === k, k === own, false);
    }).join('') + '<p class="ed-note">★ Beste = die Ultimative deiner Klasse.</p>'
      : '<p class="locked">🔒 Ab Seltenheit Episch verfügbar</p>';

    html += '<h4 class="ed-sub">Mythische Gabe</h4>';
    html += r.gift ? D.GIFTS.map(function (g, i) { return abilityItem('g', String(i), ed.gift === i, i === 0, false); }).join('')
      : '<p class="locked">🔒 Nur bei Seltenheit Mythisch</p>';
    $('ed-abilities').innerHTML = html;
  }

  function renderEdWeapon() {
    var own = G.weaponRank(ed.weapon) === 0;
    var order = [ed.style].concat(D.STYLE_IDS.filter(function (id) { return id !== ed.style; }));
    $('ed-weapon').innerHTML = order.map(function (id) {
      var st = D.STYLES[id];
      return '<optgroup label="' + esc(st.name) + '">' + st.weapons.map(function (w, i) {
        var t = st.weaponTiers[i];
        return '<option value="' + esc(w) + '"' + (!own && w === ed.weapon ? ' selected' : '') + '>' + esc(w) + ' — ' +
          D.RARITIES[t].name + (t === 3 ? ' ★ Beste' : '') + '</option>';
      }).join('') + '</optgroup>';
    }).join('') + '<option value="__own"' + (own ? ' selected' : '') + '>✎ Eigene Waffe …</option>';
    $('ed-weapon-own').hidden = !own;
    if (own) $('ed-weapon-own').value = ed.weapon;
  }

  function renderEdPreview() {
    $('ed-preview').innerHTML = cardHtml(G.buildCustom(ed), false);
  }

  function renderEditor() {
    if (!ed) { ed = store.get('draft', null); if (ed) normalize(); else newDraft(); }
    renderEdText(); renderEdBasics(); renderEdRarity(); renderEdStats(); renderEdAbilities(); renderEdWeapon(); renderEdPreview();
  }

  // Nach jeder Änderung: Grenzen prüfen, betroffene Teile neu zeichnen, Entwurf merken
  function edChanged(parts) {
    normalize();
    parts.forEach(function (p) {
      ({ text: renderEdText, basics: renderEdBasics, rarity: renderEdRarity, stats: renderEdStats, abil: renderEdAbilities, weapon: renderEdWeapon })[p]();
    });
    renderEdPreview();
    saveDraft();
  }

  ['name', 'epithet', 'lore', 'quote'].forEach(function (f) {
    $('ed-' + f).addEventListener('input', function () { ed[f] = this.value; renderEdPreview(); saveDraft(); });
  });
  $('ed-weapon-own').addEventListener('input', function () { ed.weapon = this.value; renderEdPreview(); saveDraft(); });

  $('view-editor').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dice) {
      e.preventDefault();
      var rn = G.randomName(ed.style, ed.gender);
      if (b.dataset.dice === 'name') ed.name = rn.name;
      if (b.dataset.dice === 'epithet') ed.epithet = rn.epithet;
      if (b.dataset.dice === 'quote') ed.quote = rn.quote;
      if (b.dataset.dice === 'lore') ed.lore = G.randomLore(ed);
      edChanged(['text']);
    } else if (b.closest('#ed-style')) {
      ed.style = b.dataset.v;
      var st = D.STYLES[ed.style];
      ed.race = ed.style + ':' + Math.floor(Math.random() * st.races.length);
      ed.cls = ed.style + ':' + Math.floor(Math.random() * st.classes.length);
      ed.weapon = st.weapons[Math.floor(Math.random() * st.weapons.length)];
      ed.ultimate = null;
      edChanged(['basics', 'abil', 'weapon']);
    } else if (b.closest('#ed-gender')) {
      ed.gender = b.dataset.v;
      edChanged(['basics']);
    } else if (b.classList.contains('rp')) {
      ed.rarity = b.dataset.v;
      var r = edRarity();
      ed.level = Math.max(r.level[0], Math.min(r.level[1], ed.level));
      edChanged(['rarity', 'stats', 'abil']);
    } else if (b.id === 'ed-level-max') {
      ed.level = edRarity().level[1];
      edChanged(['rarity']);
    } else if (b.dataset.stat) {
      var r2 = edRarity(), id = b.dataset.stat, d = +b.dataset.d;
      var sum = D.STATS.reduce(function (s, x) { return s + ed.stats[x.id]; }, 0);
      if (d > 0 && sum >= r2.points) { toast('Keine Punkte mehr übrig – erst woanders abziehen'); return; }
      if (d > 0 && ed.stats[id] >= r2.maxStat) { toast('Maximum für ' + r2.name + ': ' + r2.maxStat); return; }
      if (d < 0 && ed.stats[id] <= 3) return;
      ed.stats[id] += d;
      edChanged(['stats']);
    } else if (b.id === 'ed-best-stats') {
      ed.stats = G.bestStats(ed.rarity, edArche());
      edChanged(['stats']);
      toast('Punkte optimal verteilt');
    } else if (b.dataset.group) {
      edOpen[b.dataset.group] = !edOpen[b.dataset.group];
      renderEdAbilities();
    } else if (b.classList.contains('ab-pick')) {
      var key = b.dataset.key, kind = b.dataset.kind;
      if (kind === 'u') ed.ultimate = key;
      else if (kind === 'g') ed.gift = +key;
      else {
        var i = ed.abilities.indexOf(key), max = G.slots(edRarity());
        if (i >= 0) ed.abilities.splice(i, 1);
        else if (ed.abilities.length >= max) { toast('Maximal ' + max + ' – eine höhere Seltenheit gibt mehr Plätze'); return; }
        else ed.abilities.push(key);
      }
      edChanged(['abil']);
    } else if (b.id === 'ed-new') {
      newDraft();
      renderEditor();
      saveDraft();
      toast('Neuer Zufalls-Charakter – jetzt anpassen');
    } else if (b.id === 'ed-save') {
      var c = G.buildCustom(ed);
      var idx = -1;
      favorites.forEach(function (f, k) { if (f.code === editingCode || f.code === c.code) idx = k; });
      var entry = { code: c.code, char: c, at: Date.now() };
      if (idx >= 0) favorites[idx] = entry; else favorites.unshift(entry);
      store.set('favorites', favorites);
      editingCode = c.code;
      remember(c, true);
      toast(idx >= 0 ? 'Änderungen gespeichert' : 'In der Sammlung gespeichert');
      openDetail(c);
    }
  });

  $('ed-race').addEventListener('change', function () { ed.race = this.value; edChanged([]); });
  $('ed-cls').addEventListener('change', function () { ed.cls = this.value; ed.ultimate = null; edChanged(['abil']); });
  $('ed-align').addEventListener('change', function () { ed.alignment = this.value; edChanged([]); });
  $('ed-level').addEventListener('input', function () { ed.level = +this.value; edChanged(['rarity']); });
  $('ed-weapon').addEventListener('change', function () {
    if (this.value === '__own') {
      ed.weapon = '';
      $('ed-weapon-own').hidden = false;
      $('ed-weapon-own').value = '';
      $('ed-weapon-own').focus();
    } else {
      ed.weapon = this.value;
      $('ed-weapon-own').hidden = true;
    }
    renderEdPreview();
    saveDraft();
  });

  // ---- Navigation ----
  function show(view) {
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (view === 'collection') renderCollection();
    if (view === 'history') renderHistory();
    if (view === 'editor') renderEditor();
    if (view === 'arena' && window.DFArena) DFArena.render();
    window.scrollTo(0, 0);
  }
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) show(b.dataset.view);
  });

  // Für die Arena (arena.js)
  window.DFApp = {
    store: store, toast: toast, esc: esc, sigilSeed: sigilSeed,
    champions: function () {
      var seen = {}, out = [];
      favorites.concat(history).forEach(function (f) {
        if (seen[f.code]) return;
        seen[f.code] = true;
        out.push(f.char);
      });
      return out.sort(function (a, b) { return b.power - a.power; });
    }
  };

  window.DF = {
    back: function () {
      if (window.DFArena && DFArena.back()) return true;
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

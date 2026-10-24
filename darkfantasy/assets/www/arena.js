// Oberfläche der Arena „Turm der Schatten“: Champion wählen, Kampfbildschirm, Segen, Rekorde.
(function () {
  var D = DF_DATA, S = DF_GAME, A = window.DFApp;
  var $ = function (id) { return document.getElementById(id); };
  var esc = A.esc;
  var run = null, busy = false;
  var records = A.store.get('arena', { best: {}, top: [] });

  var KIND_ICONS = { dmg: '⚔', stun: '💫', heal: '✚', shield: '🛡', dot: '☠', buff: '🔥', drain: '🩸', ult: '★' };

  // ---- Auswahl ----
  function render() {
    var champs = A.champions();
    $('arena-top').innerHTML = records.top.length
      ? '<h4 class="ed-sub">Rekorde</h4>' + records.top.slice(0, 5).map(function (t, i) {
        return '<div class="rec"><span>' + (i + 1) + '.</span><b style="color:' + t.color + '">' + esc(t.name) + '</b><span>Ebene ' + t.floor + '</span></div>';
      }).join('')
      : '';
    $('arena-list').innerHTML = champs.length ? champs.map(function (c) {
      var best = records.best[c.code];
      return '<button class="row" data-code="' + esc(c.code) + '" style="--rc:' + c.rarityColor + '">' +
        '<div class="row-sigil">' + DF_SIGIL.render(c, A.sigilSeed(c)) + '</div>' +
        '<div class="row-main"><div class="row-name">' + esc(c.name) + '</div>' +
        '<div class="row-meta">' + esc(c.cls) + ' · Stufe ' + c.level + ' · Macht ' + c.power + '</div></div>' +
        '<div class="row-r">' + (best ? '🏆 ' + best : esc(c.rarityName)) + '<div class="fight">Kämpfen ▸</div></div></button>';
    }).join('') : '<div class="empty">Beschwöre oder erstelle zuerst einen Charakter – dann kann er hier kämpfen.</div>';
  }

  $('arena-list').addEventListener('click', function (e) {
    var b = e.target.closest('.row');
    if (!b) return;
    var c = A.champions().filter(function (x) { return x.code === b.dataset.code; })[0];
    if (c) start(c);
  });

  // ---- Kampf ----
  function start(c) {
    run = S.newRun(c);
    run.log = ['— Ebene 1 —'];
    busy = false;
    $('b-modal').hidden = true;
    $('battle').hidden = false;
    $('b-psigil').innerHTML = DF_SIGIL.render(c, A.sigilSeed(c));
    $('b-pname').textContent = c.name;
    drawEnemy();
    draw();
  }

  function enemyChar() {
    var e = run.enemy;
    return { style: 'dark', icon: e.icon, tier: e.boss ? 4 : 1, rarityColor: e.boss ? '#f43f5e' : '#ef4444' };
  }

  function drawEnemy() {
    var e = run.enemy;
    $('b-esigil').innerHTML = DF_SIGIL.render(enemyChar(), e.floor * 7919 + e.name.length);
    $('b-ename').innerHTML = (e.boss ? '<span class="boss">BOSS</span> ' : '') + esc(e.name);
    $('b-enemy').classList.toggle('is-boss', e.boss);
  }

  function bar(id, hp, max, shield) {
    var el = $(id);
    el.querySelector('i').style.width = (hp / max * 100) + '%';
    el.querySelector('span').textContent = hp + ' / ' + max + (shield ? '  🛡 ' + shield : '');
  }

  function draw() {
    var p = run.player, e = run.enemy;
    $('b-floor').textContent = 'Ebene ' + run.floor;
    var best = records.best[p.char.code];
    $('b-best').textContent = best ? '🏆 ' + best : '';
    bar('b-ehp', e.hp, e.maxHp);
    bar('b-php', p.hp, p.maxHp, p.shield);
    var info = S.intentInfo(run);
    $('b-intent').className = 'b-intent i-' + (e.stun ? 'stun' : info.id);
    $('b-intent').textContent = 'Absicht: ' + info.text;
    $('b-estatus').innerHTML = [e.stun ? '💫 Betäubt' : '', e.stunImmune && !e.stun ? 'Widersteht Betäubung' : '',
      e.dotTurns ? '☠ ' + e.dot + ' × ' + e.dotTurns : '', e.vuln ? 'Verwundbar' : ''].filter(Boolean).map(tag).join('');
    $('b-pstatus').innerHTML = [p.buff ? '🔥 +40 % (' + p.buff + ')' : '', p.curse ? '☠ Verflucht (' + p.curse + ')' : '',
      p.revive ? '✦ Wiederbelebung' : '', 'Angriff ' + Math.round(p.atk), 'Krit ' + Math.round(p.crit * 100) + ' %']
      .filter(Boolean).map(tag).join('');
    $('b-log').innerHTML = run.log.slice(-4).map(function (l, i, arr) {
      return '<div' + (i === arr.length - 1 ? ' class="new"' : '') + '>' + esc(l) + '</div>';
    }).join('');

    var btn = function (act, icon, name, sub, cls, cd) {
      return '<button class="b-act ' + (cls || '') + '" data-act="' + act + '"' + (cd || busy || run.phase !== 'battle' ? ' disabled' : '') + '>' +
        '<span class="b-icon">' + icon + '</span><b>' + esc(name) + '</b><small>' + esc(sub) + '</small>' +
        (cd ? '<span class="cd">' + cd + '</span>' : '') + '</button>';
    };
    $('b-actions').innerHTML = btn('attack', '⚔', 'Angriff', 'Normaler Schlag') +
      btn('defend', '🛡', 'Verteidigen', '−60 % Schaden, Abklingen −1') +
      p.skills.map(function (k, i) {
        return btn(i, KIND_ICONS[k.kind], k.name, S.KIND_NAMES[k.kind] + ' · ' + D.RARITIES[k.rank].name,
          'r' + k.rank + (k.kind === 'ult' ? ' ult' : ''), k.cd);
      }).join('');
  }

  function tag(t) { return '<span class="st">' + esc(t) + '</span>'; }

  function float(target, text, cls) {
    var host = $(target === 'enemy' ? 'b-enemy' : 'b-player');
    var f = document.createElement('div');
    f.className = 'float ' + cls;
    f.textContent = text;
    f.style.left = (35 + Math.random() * 30) + '%';
    host.appendChild(f);
    setTimeout(function () { f.remove(); }, 1100);
  }

  function shake(target, big) {
    var el = $(target === 'enemy' ? 'b-esigil' : 'b-player');
    el.classList.remove('shake', 'shake-big');
    void el.offsetWidth;
    el.classList.add(big ? 'shake-big' : 'shake');
  }

  // Ereignisse nacheinander abspielen: erst der eigene Zug, dann der des Gegners
  function play(events, done) {
    var i = 0;
    (function next() {
      if (i >= events.length) { done(); return; }
      var ev = events[i++], delay = 0;
      if (ev.type === 'dmg') {
        float(ev.target, (ev.crit ? '💥 ' : '−') + ev.value, ev.target === 'enemy' ? (ev.crit ? 'crit' : 'hurt') : 'ouch');
        shake(ev.target, ev.big || ev.crit);
        delay = 420;
      } else if (ev.type === 'heal' && ev.value) {
        float(ev.target, '+' + ev.value, 'heal'); delay = 300;
      } else if (ev.type === 'shield') {
        float(ev.target, '🛡 ' + ev.value, 'heal'); delay = 300;
      } else if (ev.type === 'revive') {
        float('player', '✦ Wiederbelebt', 'heal'); delay = 600;
      } else if (ev.type === 'dot') {
        float('enemy', '☠', 'hurt'); delay = 250;
      }
      setTimeout(next, delay);
    })();
  }

  $('b-actions').addEventListener('click', function (e) {
    var b = e.target.closest('.b-act');
    if (!b || b.disabled || busy || !run) return;
    var act = b.dataset.act;
    var events = S.act(run, act === 'attack' || act === 'defend' ? act : +act);
    if (!events.length) return;
    busy = true;
    draw();
    play(events, function () {
      busy = false;
      draw();
      if (run.phase === 'reward') showRewards();
      if (run.phase === 'over') finish(false);
    });
  });

  function showRewards() {
    var m = $('b-modal');
    var boss = run.enemy.boss;
    m.innerHTML = '<div class="b-box"><h2>' + (boss ? '👑 Boss besiegt!' : 'Sieg!') + '</h2><p class="muted">Ebene ' + run.floor +
      ' geschafft · +30 % Leben geheilt. Wähle einen Segen:</p>' +
      run.choices.map(function (c) {
        return '<button class="bless" data-b="' + c.id + '"><b>' + esc(c.name) + '</b><span>' + esc(c.desc) + '</span></button>';
      }).join('') + '</div>';
    m.hidden = false;
  }

  $('b-modal').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.b) {
      S.bless(run, b.dataset.b);
      $('b-modal').hidden = true;
      drawEnemy();
      draw();
      if (run.enemy.boss) A.toast('👑 Ein Boss erscheint: ' + run.enemy.name);
    } else if (b.dataset.end === 'again') {
      start(run.player.char);
    } else if (b.dataset.end === 'close') {
      close();
    }
  });

  // Erreichte Ebene speichern (Ebene, auf der der Charakter gefallen ist bzw. aufgegeben hat)
  function saveRecord() {
    var c = run.player.char, floor = run.floor, isNew = !(records.best[c.code] >= floor);
    if (isNew) records.best[c.code] = floor;
    records.top = records.top.filter(function (t) { return t.code !== c.code || t.floor >= floor; });
    if (!records.top.some(function (t) { return t.code === c.code; })) {
      records.top.push({ code: c.code, name: c.name, color: c.rarityColor, floor: floor });
    }
    records.top.sort(function (a, b) { return b.floor - a.floor; });
    records.top.length = Math.min(records.top.length, 10);
    A.store.set('arena', records);
    return isNew;
  }

  function finish(quit) {
    run.over = true;
    run.phase = 'over';
    var isNew = saveRecord();
    var m = $('b-modal');
    m.innerHTML = '<div class="b-box"><h2>' + (quit ? 'Aufgegeben' : '☠ Gefallen') + '</h2>' +
      '<p class="big-floor">Ebene ' + run.floor + '</p>' +
      (isNew ? '<p class="new-rec">🏆 Neuer Rekord für ' + esc(run.player.char.name) + '!</p>' : '<p class="muted">Rekord: Ebene ' +
        records.best[run.player.char.code] + '</p>') +
      '<div class="b-end"><button class="ghost" data-end="close">Zur Arena</button><button class="primary" data-end="again">Nochmal</button></div></div>';
    m.hidden = false;
  }

  function close() {
    $('battle').hidden = true;
    run = null;
    render();
  }

  function quit() {
    if (!run) return;
    if (run.over) { close(); return; }
    if (confirm('Lauf beenden? Die erreichte Ebene wird als Ergebnis gespeichert.')) finish(true);
  }
  $('b-quit').addEventListener('click', quit);

  window.DFArena = {
    render: render,
    back: function () {
      if ($('battle').hidden) return false;
      quit();
      return true;
    }
  };
})();

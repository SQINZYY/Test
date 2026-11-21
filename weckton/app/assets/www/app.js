/* Oberfläche von Weckton: MP3 wählen, Wecker der Uhr-App auswählen, Klingelton übernehmen. */
(function () {
  'use strict';

  const A = window.Alarms;
  const bridge = window.Android;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    note: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
    play: svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'),
    stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    warn: svg('<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
    clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M5 4L2.5 6.5M19 4l2.5 2.5"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  };

  const S = {
    status: 'loading', alarms: [], clockAudio: 'unknown', backup: 0, canWriteSettings: false, defaultAlarm: '',
    sound: null, soundLoading: false, playing: false, busy: false,
    selected: new Set(), filter: 'all', sheet: null,
  };

  function load() {
    let d;
    try {
      d = JSON.parse(bridge.load());
    } catch (e) {
      d = { status: bridge ? 'unavailable' : 'no_app' };
    }
    S.status = d.status || 'unavailable';
    S.alarms = A.sortAlarms(d.alarms || []);
    S.clockAudio = d.clockAudio || 'unknown';
    S.backup = d.backup || 0;
    S.canWriteSettings = !!d.canWriteSettings;
    S.defaultAlarm = d.defaultAlarm || '';
    if (d.sound) S.sound = d.sound;
    // Auswahl auf Wecker beschränken, die es noch gibt
    const ids = new Set(S.alarms.map((a) => a.id));
    S.selected = new Set([...S.selected].filter((id) => ids.has(id)));
    render();
  }

  function visible() {
    if (S.filter === 'on') return S.alarms.filter((a) => a.active > 0);
    if (S.filter === 'off') return S.alarms.filter((a) => !(a.active > 0));
    return S.alarms;
  }

  /* ---------- Bausteine ---------- */

  function soundCard() {
    const s = S.sound;
    let body;
    if (S.soundLoading) {
      body = '<div class="sound"><span class="spinner" aria-hidden="true"></span><div class="grow"><b>Datei wird übernommen …</b></div></div>';
    } else if (!s) {
      body = '<p class="muted">Wähle eine MP3-Datei. Sie wird der Klingelton für die Wecker, die du darunter auswählst.</p>'
        + '<button class="btn primary wide" data-a="pick">' + ICON.music + 'MP3-Datei auswählen</button>';
    } else {
      body = '<div class="sound">'
        + '<button class="play" data-a="' + (S.playing ? 'stop' : 'play') + '" aria-label="' + (S.playing ? 'Anhören beenden' : 'Probehören') + '">' + (S.playing ? ICON.stop : ICON.play) + '</button>'
        + '<div class="grow"><b class="clip">' + esc(s.title) + '</b><div class="small muted">' + (S.playing ? 'Wird abgespielt …' : 'Probehören mit ▶') + '</div></div>'
        + '<button class="btn ghost" data-a="pick">Ändern</button></div>';
    }
    return '<section class="card"><h2><span class="step">1</span>Klingelton</h2>' + body + '</section>';
  }

  function notices() {
    if (S.status === 'loading' || S.status === 'ok') {
      if (S.status === 'ok' && S.clockAudio === 'denied') {
        return '<section class="card notice warn">' + ICON.warn + '<div><h3>Die Uhr-App darf deine MP3 noch nicht abspielen</h3>'
          + '<p>Ohne die Berechtigung „Musik und Audio“ nimmt sie beim Klingeln ihren Standardton. '
          + 'So erlaubst du es: Einstellungen der Uhr → <b>Berechtigungen</b> → <b>Musik und Audio</b> → <b>Zulassen</b>.</p>'
          + '<button class="btn" data-a="clockSettings">' + ICON.gear + 'Einstellungen der Uhr öffnen</button></div></section>';
      }
      return '';
    }
    const why = {
      no_samsung: ['Keine Samsung-Uhr gefunden',
        'Weckton liest die Wecker aus der Uhr-App von Samsung. Andere Uhr-Apps, z. B. die Google Uhr, geben ihre Wecker nicht an andere Apps heraus.'],
      denied: ['Die Uhr-App verweigert den Zugriff',
        'Meist hilft es, Weckton einmal zu deinstallieren und neu zu installieren – deine Wecker bleiben dabei, wie sie sind. '
        + 'Klappt es danach immer noch nicht, lässt deine Version der Uhr-App keinen Zugriff zu.'],
      locked: ['Deine Uhr-App sperrt den Zugriff',
        'Samsung hat in neueren Versionen der Uhr (ab One UI 7) die Wecker für andere Apps gesperrt. Weckton kann sie deshalb '
        + 'weder auslesen noch ändern – daran ändert auch eine Neuinstallation nichts.'],
      no_app: ['Nur in der App', 'Diese Seite funktioniert nur in der Weckton-App auf dem Handy.'],
    }[S.status] || ['Wecker-Liste nicht erreichbar', 'Die Uhr-App hat keine Wecker geliefert. Öffne sie einmal und versuch es dann noch mal.'];
    let html = '<section class="card notice">' + ICON.warn + '<div><h3>' + why[0] + '</h3><p>' + why[1] + '</p>'
      + (['no_samsung', 'no_app', 'locked'].includes(S.status) ? '' : '<button class="btn" data-a="retry">Erneut versuchen</button>')
      + '</div></section>';
    if (S.status !== 'no_app') {
      html += '<section class="card"><h2>So geht es trotzdem</h2>'
        + '<p class="muted">' + (S.sound ? '„' + esc(S.sound.title) + '“ liegt jetzt' : 'Die MP3, die du oben wählst, landet') + ' im Ordner „Alarms“. '
        + 'In deiner Uhr-App erscheint sie deshalb zur Auswahl: Wecker antippen → <b>Weckton</b> → '
        + (S.sound ? '„' + esc(S.sound.title) + '“' : 'deine MP3') + ' wählen → <b>Speichern</b>.</p>'
        + '<button class="btn wide" data-a="clock">' + ICON.clock + 'Uhr-App öffnen</button>'
        + '<p class="muted top">Oder setze sie als <b>Standard-Weckton</b> des Handys – das gilt für alle Wecker, die den Standardton nutzen'
        + (S.defaultAlarm ? ' (gerade: „' + esc(S.defaultAlarm) + '“)' : '') + '.</p>'
        + '<button class="btn wide" data-a="default"' + (S.sound ? '' : ' disabled') + '>' + ICON.music + 'Als Standard-Weckton setzen</button></section>';
    }
    return html;
  }

  function alarmSection() {
    if (S.status !== 'ok') return '';
    const all = S.alarms;
    if (!all.length) {
      return '<section class="card"><h2><span class="step">2</span>Wecker</h2><p class="muted">In deiner Uhr-App ist noch kein Wecker gespeichert.</p></section>';
    }
    const on = all.filter((a) => a.active > 0).length;
    const list = visible();
    const allSel = list.length > 0 && list.every((a) => S.selected.has(a.id));
    const chip = (f, label, n) => '<button class="chip' + (S.filter === f ? ' on' : '') + '" data-a="filter" data-f="' + f + '">' + label + ' <span>' + n + '</span></button>';
    const scope = { all: '', on: ' <span class="muted">(nur An)</span>', off: ' <span class="muted">(nur Aus)</span>' }[S.filter];
    const now = Date.now();
    const rows = list.map((a) => {
      const sel = S.selected.has(a.id);
      const snd = A.sound(a);
      const has = A.hasSound(a, S.sound && S.sound.uri);
      return '<button class="alarm' + (sel ? ' sel' : '') + (a.active > 0 ? '' : ' inactive') + '" data-a="toggle" data-id="' + a.id + '" role="checkbox" aria-checked="' + sel + '">'
        + '<span class="cb">' + ICON.check + '</span>'
        + '<span class="info"><span class="row1"><span class="time">' + A.time(a) + '</span>'
        + '<span class="pill ' + (a.active > 0 ? 'on' : 'off') + '">' + A.statusText(a) + '</span></span>'
        + '<span class="meta">' + esc(A.repeatText(a, now)) + (a.name ? ' · ' + esc(a.name) : '') + '</span>'
        + '<span class="tone' + (snd.off ? ' warn' : '') + (has ? ' same' : '') + '">' + ICON.note + '<span class="clip">' + esc(snd.text) + '</span>' + (has ? ICON.check : '') + '</span>'
        + '</span></button>';
    }).join('');
    return '<section class="list-head"><h2><span class="step">2</span>Wecker auswählen</h2>'
      + '<p class="muted small">' + all.length + ' Wecker in deiner Uhr-App gefunden</p>'
      + '<div class="chips">' + chip('all', 'Alle', all.length) + chip('on', 'An', on) + chip('off', 'Aus', all.length - on) + '</div>'
      + '<button class="selall' + (allSel ? ' sel' : '') + '" data-a="all"' + (list.length ? '' : ' disabled') + '><span class="cb">' + ICON.check + '</span>'
      + '<span class="grow">' + (allSel ? 'Auswahl aufheben' : 'Alle auswählen') + scope + '</span>'
      + '<span class="count">' + S.selected.size + ' ausgewählt</span></button></section>'
      + '<div class="alarms">' + (rows || '<p class="muted center pad">Keine Wecker in dieser Ansicht.</p>') + '</div>';
  }

  function undoCard() {
    if (!S.backup || S.status !== 'ok') return '';
    return '<section class="card undo">' + ICON.undo + '<div class="grow"><b>Alte Töne wiederherstellen</b>'
      + '<div class="small muted">Weckton hat sich die ursprünglichen Töne von ' + S.backup + ' Wecker' + (S.backup === 1 ? '' : 'n') + ' gemerkt.</div></div>'
      + '<button class="btn ghost" data-a="restore"' + (S.busy ? ' disabled' : '') + '>Zurücksetzen</button></section>';
  }

  function footer() {
    if (S.status !== 'ok') return '';
    return '<p class="foot muted small">Weckton ändert nur den Klingelton. Uhrzeit, Tage und ob ein Wecker an ist, bleiben, wie sie sind.</p>';
  }

  function bar() {
    if (S.status !== 'ok' || !S.alarms.length) return '';
    const n = S.selected.size;
    if (!S.sound) return '<button class="btn primary wide" data-a="pick">' + ICON.music + 'Zuerst eine MP3 wählen</button>';
    let label;
    if (S.busy) label = '<span class="spinner dark" aria-hidden="true"></span>Wird übernommen …';
    else if (!n) label = 'Wecker auswählen';
    else label = (n === S.alarms.length ? 'Für alle ' + n : 'Für ' + n) + ' Wecker übernehmen';
    return '<button class="btn primary wide" data-a="apply"' + (S.busy || !n ? ' disabled' : '') + '>' + label + '</button>';
  }

  function sheet() {
    const sh = S.sheet;
    if (!sh) return '';
    const r = sh.result || {};
    let body;
    if (r.error) {
      body = '<h2>Das hat nicht geklappt</h2><p class="muted">' + esc(r.error) + '</p>';
    } else if (sh.type === 'applied') {
      body = '<div class="big-ok">' + ICON.check + '</div>'
        + '<h2>' + r.ok + ' Wecker klingeln jetzt mit „' + esc(sh.title) + '“</h2>'
        + (r.failed ? '<p class="neg">' + r.failed + ' Wecker ließen sich nicht ändern.</p>' : '')
        + '<p class="muted">Letzter Schritt: Öffne einmal die Uhr-App. Sie hat den nächsten Wecker schon vorgeplant und übernimmt den neuen Ton beim Öffnen auch für ihn.</p>'
        + '<button class="btn primary wide" data-a="clock">' + ICON.clock + 'Uhr-App öffnen</button>'
        + '<button class="btn wide" data-a="default">' + ICON.music + 'Auch als Standard-Weckton setzen</button>';
    } else {
      body = '<div class="big-ok">' + ICON.undo + '</div>'
        + '<h2>' + r.ok + ' Wecker haben wieder ihren alten Ton</h2>'
        + (r.gone ? '<p class="muted">' + r.gone + ' Wecker gibt es inzwischen nicht mehr.</p>' : '')
        + (r.failed ? '<p class="neg">' + r.failed + ' Wecker ließen sich nicht zurücksetzen.</p>' : '')
        + '<button class="btn primary wide" data-a="clock">' + ICON.clock + 'Uhr-App öffnen</button>';
    }
    return '<div class="backdrop" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true">' + body
      + '<button class="btn ghost wide" data-a="close">Schließen</button></div>';
  }

  function render() {
    $('view').innerHTML = S.status === 'loading' ? '' : soundCard() + notices() + alarmSection() + undoCard() + footer();
    const b = bar();
    $('bar').innerHTML = b;
    document.body.classList.toggle('has-bar', !!b);
    $('sheet').innerHTML = sheet();
    document.body.classList.toggle('has-sheet', !!S.sheet);
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3800);
  }

  /* ---------- Bedienung ---------- */

  const actions = {
    pick() { bridge.pickSound(); },
    play() { S.playing = true; bridge.preview(S.sound.uri); },
    stop() { bridge.stopPreview(); },
    filter(el) { S.filter = el.dataset.f; },
    all() {
      const list = visible();
      const allSel = list.every((a) => S.selected.has(a.id));
      list.forEach((a) => (allSel ? S.selected.delete(a.id) : S.selected.add(a.id)));
    },
    toggle(el) {
      const id = Number(el.dataset.id);
      if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
    },
    apply() {
      if (!S.sound || !S.selected.size || S.busy) return;
      if (S.playing) bridge.stopPreview();
      S.busy = true;
      bridge.apply(JSON.stringify([...S.selected]), S.sound.uri);
    },
    restore() {
      if (S.busy) return;
      S.busy = true;
      bridge.restore();
    },
    clock() { S.sheet = null; bridge.openClock(); },
    clockSettings() { bridge.openClockSettings(); },
    default() {
      if (!S.sound) return;
      const r = bridge.setDefault(S.sound.uri);
      if (r === 'ok') toast('„' + S.sound.title + '“ ist jetzt der Standard-Weckton.');
      else if (r === 'permission') toast('Erlaube Weckton „Systemeinstellungen ändern“ und tippe dann noch einmal darauf.');
      else toast('Der Standard-Weckton ließ sich nicht ändern.', true);
      if (r === 'ok') S.defaultAlarm = S.sound.title;
    },
    retry() { load(); },
    close() { S.sheet = null; },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (!fn) return;
    fn(el);
    render();
  });

  /* ---------- Rückmeldungen von Android ---------- */

  window.W = {
    onResume() { if (!S.busy && !S.soundLoading) load(); },
    onSoundLoading() { S.soundLoading = true; render(); },
    onSound(s) {
      S.soundLoading = false;
      S.playing = false;
      S.sound = s;
      toast('„' + s.title + '“ ist bereit.');
      render();
    },
    onSoundCancel() { S.soundLoading = false; render(); },
    onError(msg) {
      S.soundLoading = false;
      S.busy = false;
      S.playing = false;
      toast(msg, true);
      render();
    },
    onPreviewEnd() { S.playing = false; render(); },
    onApplied(r) {
      S.busy = false;
      if (!r.error) S.selected.clear();
      S.sheet = { type: 'applied', result: r, title: S.sound ? S.sound.title : '' };
      load();
    },
    onRestored(r) {
      S.busy = false;
      S.sheet = { type: 'restored', result: r };
      load();
    },
    back() {
      if (S.sheet) { S.sheet = null; render(); return true; }
      return false;
    },
  };

  if (!bridge) {
    S.status = 'no_app';
    render();
  } else {
    load();
  }
})();

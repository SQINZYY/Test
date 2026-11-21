/* Wiedergabe über den offiziellen Spotify-Player (Spotify iFrame API).
 * Ohne Spotify-Anmeldung spielt er die 30-Sekunden-Vorschau eines Songs. Klangwelt steuert ihn
 * (laden, abspielen, Pause, spulen) und erkennt das Ende, um den nächsten Song zu starten. */
(function (global) {
  'use strict';

  const SCRIPT = 'https://open.spotify.com/embed/iframe-api/v1';
  const NO_PREVIEW_MS = global.__kwNoPreviewMs || 9000; // im Test kürzer

  let api = null;
  let scriptPromise = null;
  let ctrl = null;
  let creating = null;
  let host = null;
  let token = 0;
  let wantPlay = false;
  let userPaused = false;
  let wasPlaying = false;
  let gotProgress = false;
  let watchdog = null;
  let loadAt = 0;
  const handlers = { update: [], ended: [], error: [], ready: [] };
  const state = { paused: true, position: 0, duration: 0, buffering: false, uri: null };

  function emit(ev, data) { for (const fn of handlers[ev]) { try { fn(data); } catch (e) { console.error(e); } } }

  function loadScript() {
    if (api) return Promise.resolve(api);
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { scriptPromise = null; reject(new Error('timeout')); }, 15000);
        global.onSpotifyIframeApiReady = IFrameAPI => { clearTimeout(timer); api = IFrameAPI; resolve(api); };
        const s = document.createElement('script');
        s.src = SCRIPT;
        s.async = true;
        s.onerror = () => { clearTimeout(timer); scriptPromise = null; s.remove(); reject(new Error('offline')); };
        document.head.appendChild(s);
      });
    }
    return scriptPromise;
  }

  function onUpdate(e) {
    const d = e && e.data || {};
    const paused = !!d.isPaused;
    state.paused = paused;
    state.buffering = !!d.isBuffering;
    state.position = d.position || 0;
    state.duration = d.duration || 0;
    // Kurz nach dem Laden können noch Meldungen des vorigen Songs kommen – die zählen nicht
    if (!paused && state.position > 0 && Date.now() - loadAt > 800) { gotProgress = true; wasPlaying = true; }
    emit('update', Object.assign({}, state));
    // Ende: lief eben noch, jetzt pausiert am Ende (oder zurück auf 0) – ohne dass jemand Pause gedrückt hat
    const atEnd = state.duration > 0 && (state.position >= state.duration - 600 || state.position === 0);
    if (paused && wasPlaying && !userPaused && atEnd) {
      wasPlaying = false;
      emit('ended', { uri: state.uri });
    }
  }

  function create(uri) {
    if (creating) return creating;
    creating = loadScript().then(IFrameAPI => new Promise(resolve => {
      const el = document.createElement('div');
      host.appendChild(el);
      IFrameAPI.createController(el, { uri, width: '100%', height: 152 }, c => {
        ctrl = c;
        c.addListener('playback_update', onUpdate);
        c.addListener('ready', () => { emit('ready'); if (wantPlay) c.play(); });
        resolve(c);
      });
    }));
    creating.catch(() => { creating = null; });
    return creating;
  }

  function armWatchdog(my) {
    clearTimeout(watchdog);
    // Erster Versuch, falls "ready" ausbleibt; danach melden, wenn gar nichts abspielt
    setTimeout(() => { if (my === token && wantPlay && !gotProgress && ctrl) ctrl.play(); }, 1500);
    watchdog = setTimeout(() => {
      if (my === token && wantPlay && !gotProgress) emit('error', { kind: 'nopreview', uri: state.uri });
    }, NO_PREVIEW_MS);
  }

  const Preview = {
    /** Element, in dem der Spotify-Player sitzt (die App positioniert es). */
    attach(el) { host = el; },
    on(ev, fn) { handlers[ev].push(fn); },
    get state() { return Object.assign({}, state); },
    get available() { return !!ctrl; },

    /** Song laden und (optional) sofort abspielen. */
    async load(uri, play) {
      const my = ++token;
      wantPlay = play !== false;
      userPaused = !wantPlay;
      wasPlaying = false;
      gotProgress = false;
      loadAt = Date.now();
      state.uri = uri;
      state.position = 0;
      state.duration = 0;
      state.paused = !wantPlay;
      emit('update', Object.assign({}, state));
      try {
        if (!ctrl) await create(uri);
        else ctrl.loadUri(uri);
      } catch (e) {
        if (my === token) emit('error', { kind: e.message === 'offline' || e.message === 'timeout' ? 'offline' : 'error', uri });
        return;
      }
      if (my !== token) return;
      if (wantPlay) armWatchdog(my);
    },
    play() {
      wantPlay = true;
      userPaused = false;
      if (ctrl) ctrl.resume ? ctrl.resume() : ctrl.play();
      if (!gotProgress) armWatchdog(token);
    },
    pause() {
      wantPlay = false;
      userPaused = true;
      clearTimeout(watchdog);
      if (ctrl) ctrl.pause();
    },
    seek(sec) {
      if (ctrl) ctrl.seek(Math.max(0, sec));
    },
    /** Nur für Tests: Zustand zurücksetzen. */
    _reset() { api = null; scriptPromise = null; ctrl = null; creating = null; },
  };

  global.Preview = Preview;
})(window);

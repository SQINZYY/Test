/* Verbindet die Oberfläche mit der jeweiligen Hülle: Windows-App (Electron), Android-App (WebView) oder Browser. */
(function (global) {
  'use strict';

  const desktop = global.klangweltDesktop; // aus desktop/preload.js
  const android = global.Android;          // aus MainActivity.Bridge
  const kind = desktop ? 'desktop' : android ? 'android' : 'web';
  const waiters = {};
  let seq = 0;
  // Rückkehr von der Spotify-Anmeldung (eigener Port/eigenes Schema, damit Klangraum und Klangwelt nebeneinander laufen)
  const REDIRECTS = { desktop: 'http://127.0.0.1:43822/callback', android: 'klangwelt://callback' };
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  let authWaiter = null;

  const Platform = {
    kind,
    version: (desktop && desktop.version) || (android && android.appVersion && android.appVersion()) || 'web',
    redirectUri: REDIRECTS[kind] || (location.origin + location.pathname),
    redirectUris: [REDIRECTS.desktop, REDIRECTS.android],

    /** Öffnet die Spotify-Anmeldung und liefert die Weiterleitungs-URL (mit code oder error). */
    login(url) {
      if (desktop) return desktop.login(url);
      if (android) {
        if (authWaiter) authWaiter.reject(new Error('Neue Anmeldung gestartet'));
        return new Promise((resolve, reject) => {
          authWaiter = { resolve, reject };
          android.openAuth(url);
        });
      }
      location.assign(url);
      return new Promise(() => {});
    },

    cancelLogin() {
      if (desktop) desktop.cancelLogin();
      if (authWaiter) { authWaiter.reject(new Error('Abgebrochen')); authWaiter = null; }
    },

    /** POST an den Token-Endpunkt – in den Apps nativ, damit CORS keine Rolle spielt. */
    tokenRequest(body) {
      if (desktop) return desktop.token(body);
      if (android) {
        return new Promise(resolve => {
          const id = 't' + (++seq);
          waiters[id] = resolve;
          android.post(id, TOKEN_URL, body);
        });
      }
      return fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
        .then(async r => ({ status: r.status, text: await r.text() }));
    },

    openExternal(url) {
      if (desktop) return desktop.open(url);
      if (android) return android.openUrl(url);
      global.open(url, '_blank', 'noopener');
    },

    /** Öffnet einen Song/ein Album in der Spotify-App (oder im Browser, wenn es die App nicht gibt). */
    openSpotify(uri, webUrl) {
      if (android) { if (!android.openSpotify(uri)) android.openUrl(webUrl); return; }
      if (desktop) { desktop.open(uri || 'spotify:'); return; }
      global.open(webUrl, '_blank', 'noopener');
    },

    copy(text) {
      if (android && android.copy) { android.copy(text); return Promise.resolve(); }
      if (navigator.clipboard) return navigator.clipboard.writeText(text);
      return Promise.reject(new Error('Zwischenablage nicht verfügbar'));
    },

    /** JSON von open.spotify.com/oembed (Cover) – in den Apps nativ, damit CORS keine Rolle spielt. */
    getJson(url) {
      if (desktop) return desktop.getJson(url);
      if (android && android.get) {
        return new Promise(resolve => {
          const id = 'g' + (++seq);
          waiters[id] = resolve;
          android.get(id, url);
        }).then(r => (r.status === 200 ? JSON.parse(r.text) : null));
      }
      return fetch(url).then(r => (r.ok ? r.json() : null));
    },

    // vom nativen Teil aufgerufen
    _authCallback(url) {
      if (!authWaiter) return false;
      authWaiter.resolve(url);
      authWaiter = null;
      return true;
    },
    _http(id, status, text) {
      const w = waiters[id];
      delete waiters[id];
      if (w) w({ status, text });
    },
  };

  global.Platform = Platform;
})(window);

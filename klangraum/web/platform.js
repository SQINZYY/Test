/* Verbindet die Oberfläche mit der jeweiligen Hülle: Windows-App (Electron), Android-App (WebView) oder Browser. */
(function (global) {
  'use strict';

  const desktop = global.klangraumDesktop; // aus desktop/preload.js
  const android = global.Android;          // aus MainActivity.Bridge
  const kind = desktop ? 'desktop' : android ? 'android' : 'web';
  const REDIRECTS = {
    desktop: 'http://127.0.0.1:43821/callback',
    android: 'klangraum://callback',
  };
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';

  let authWaiter = null;
  const httpWaiters = {};
  let httpSeq = 0;

  const Platform = {
    kind,
    redirectUri: REDIRECTS[kind] || (location.origin + location.pathname),
    redirectUris: [REDIRECTS.desktop, REDIRECTS.android],
    version: (desktop && desktop.version) || (android && android.appVersion && android.appVersion()) || 'web',

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
          const id = 'h' + (++httpSeq);
          httpWaiters[id] = resolve;
          android.post(id, TOKEN_URL, body);
        });
      }
      return fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }).then(async r => ({ status: r.status, text: await r.text() }));
    },

    openExternal(url) {
      if (desktop) return desktop.open(url);
      if (android) return android.openUrl(url);
      global.open(url, '_blank', 'noopener');
    },

    /** Startet die Spotify-App (optional direkt mit Song/Playlist). false, wenn sie fehlt. */
    openSpotify(uri) {
      if (android) return android.openSpotify(uri || '');
      if (desktop) { desktop.open(uri || 'spotify:'); return true; }
      global.open(global.Spotify.webUrl(uri), '_blank', 'noopener');
      return true;
    },

    copy(text) {
      if (android && android.copy) { android.copy(text); return Promise.resolve(); }
      if (navigator.clipboard) return navigator.clipboard.writeText(text);
      return Promise.reject(new Error('Zwischenablage nicht verfügbar'));
    },

    // ---- vom nativen Teil aufgerufen ----
    _authCallback(url) {
      if (!authWaiter) return false;
      authWaiter.resolve(url);
      authWaiter = null;
      return true;
    },
    _http(id, status, text) {
      const w = httpWaiters[id];
      delete httpWaiters[id];
      if (w) w({ status, text });
    },
  };

  global.Platform = Platform;
})(window);

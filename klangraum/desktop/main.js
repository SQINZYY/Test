// Klangraum für Windows: Electron-Hülle um die Oberfläche in ../web.
// Stellt die Anmeldung bei Spotify bereit (Systembrowser + Rückkehr über http://127.0.0.1:43821/callback).
'use strict';

const { app, BrowserWindow, ipcMain, shell, net, protocol, Menu, screen } = require('electron');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const PORT = 43821;
const CALLBACK = '/callback';
const LOGIN_TIMEOUT = 10 * 60 * 1000;
const WEB = [path.join(__dirname, 'web'), path.join(__dirname, '..', 'web')].find(d => fs.existsSync(path.join(d, 'index.html')));
const ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Eigene Adresse app://klangraum/ statt file://, damit Speicher, CSP und CORS sauber funktionieren
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null;
let pendingLogin = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusWindow());
  app.whenReady().then(() => {
    protocol.handle('app', req => {
      const { pathname } = new URL(req.url);
      const file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
      if (!file.startsWith(WEB + path.sep)) return new Response('Nicht gefunden', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// ---------- Fenster ----------

function stateFile() { return path.join(app.getPath('userData'), 'fenster.json'); }

function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    // Nur übernehmen, wenn das Fenster noch auf einem Bildschirm liegt
    const visible = screen.getAllDisplays().some(d => b.x < d.bounds.x + d.bounds.width - 80 && b.x + b.width > d.bounds.x + 80 && b.y >= d.bounds.y - 20 && b.y < d.bounds.y + d.bounds.height - 80);
    return visible ? b : { width: b.width, height: b.height, maximized: b.maximized };
  } catch (e) {
    return { width: 1320, height: 860 };
  }
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(Object.assign(win.getNormalBounds(), { maximized: win.isMaximized() })));
  } catch (e) { /* egal */ }
}

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width || 1320, height: b.height || 860,
    minWidth: 380, minHeight: 560,
    backgroundColor: '#000000',
    title: 'Klangraum',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: ['--klangraum-version=' + app.getVersion()],
    },
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  // Falls der erste Frame ausbleibt (z. B. Grafiktreiber-Probleme), das Fenster trotzdem zeigen
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);
  win.on('close', saveBounds);

  // Links (Spotify, Dashboard …) im normalen Browser öffnen, die App selbst nie verlassen
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://klangraum/')) {
      e.preventDefault();
      openExternal(url);
    }
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
    }
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });
  win.loadURL('app://klangraum/index.html');
}

function focusWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  // Windows lässt Fenster sonst nicht in den Vordergrund springen
  win.setAlwaysOnTop(true);
  win.focus();
  win.setAlwaysOnTop(false);
}

function openExternal(url) {
  if (/^(https:\/\/|spotify:)/i.test(String(url))) return shell.openExternal(url).catch(() => {});
  return Promise.resolve();
}

// ---------- Spotify-Anmeldung ----------

const DONE_PAGE = ok => '<!doctype html><html lang="de"><meta charset="utf-8"><title>Klangraum</title>' +
  '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#121212;color:#fff;font:16px Segoe UI,system-ui,sans-serif">' +
  '<div style="text-align:center;max-width:420px;padding:24px"><svg width="64" height="64" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#1ed760"/><g fill="#121212"><rect x="10.4" y="19" width="4.4" height="10" rx="2.2"/><rect x="18" y="13" width="4.4" height="22" rx="2.2"/><rect x="25.6" y="16" width="4.4" height="16" rx="2.2"/><rect x="33.2" y="20" width="4.4" height="8" rx="2.2"/></g></svg>' +
  '<h1 style="font-size:24px">' + (ok ? 'Verbunden!' : 'Anmeldung abgebrochen') + '</h1>' +
  '<p style="color:#b3b3b3">' + (ok ? 'Du kannst dieses Fenster schließen und zu Klangraum zurückkehren.' : 'Du kannst dieses Fenster schließen und es in Klangraum noch einmal versuchen.') + '</p></div></body></html>';

function login(url) {
  if (pendingLogin) pendingLogin.cancel('Neue Anmeldung gestartet');
  return new Promise((resolve, reject) => {
    let done = false;
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1:' + PORT);
      if (u.pathname !== CALLBACK) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(DONE_PAGE(!u.searchParams.has('error')));
      finish(null, 'http://127.0.0.1:' + PORT + req.url);
    });
    const timer = setTimeout(() => finish(new Error('Zeitüberschreitung bei der Anmeldung')), LOGIN_TIMEOUT);
    function finish(err, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
      pendingLogin = null;
      if (!err) focusWindow();
      if (err) reject(err); else resolve(value);
    }
    pendingLogin = { cancel: msg => finish(new Error(msg)) };
    server.on('error', e => finish(new Error(e.code === 'EADDRINUSE'
      ? 'Port ' + PORT + ' ist belegt. Schließe andere Klangraum-Fenster und versuche es erneut.'
      : 'Anmeldung nicht möglich: ' + e.message)));
    server.listen(PORT, '127.0.0.1', () => {
      shell.openExternal(url).catch(e => finish(new Error('Browser konnte nicht geöffnet werden: ' + e.message)));
    });
  });
}

ipcMain.handle('kr:login', (e, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://accounts.spotify.com/authorize?')) throw new Error('Ungültige Anmelde-Adresse');
  return login(url);
});

ipcMain.handle('kr:cancel-login', () => { if (pendingLogin) pendingLogin.cancel('Abgebrochen'); });

// Token-Anfragen laufen hier statt im Fenster: kein CORS, gleiche Proxy-Einstellungen wie Windows
ipcMain.handle('kr:token', async (e, body) => {
  if (typeof body !== 'string') throw new Error('Ungültige Anfrage');
  try {
    const res = await net.fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    return { status: 0, text: JSON.stringify({ error: 'network', error_description: 'Keine Verbindung zu Spotify' }) };
  }
});

ipcMain.handle('kr:open', (e, url) => openExternal(url));

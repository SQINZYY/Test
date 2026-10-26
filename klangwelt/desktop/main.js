// Klangwelt für Windows: Electron-Hülle um die Oberfläche in ../web.
// Lädt die Oberfläche unter app://klangwelt/, öffnet Spotify-Links im System und holt Cover über open.spotify.com/oembed.
'use strict';

const { app, BrowserWindow, ipcMain, shell, net, protocol, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const WEB = [path.join(__dirname, 'web'), path.join(__dirname, '..', 'web')].find(d => fs.existsSync(path.join(d, 'index.html')));
const ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const OEMBED = 'https://open.spotify.com/oembed?';

// Eigene Adresse app://klangwelt/ statt file://, damit Speicher, CSP und CORS sauber funktionieren
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null;

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
    return { width: 1400, height: 880 };
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
    x: b.x, y: b.y, width: b.width || 1400, height: b.height || 880,
    minWidth: 380, minHeight: 560,
    backgroundColor: '#000000',
    title: 'Klangwelt',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Der Spotify-Player soll nach einem Klick auf einen Song sofort loslegen dürfen
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: ['--klangwelt-version=' + app.getVersion()],
    },
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  // Falls der erste Frame ausbleibt (z. B. Grafiktreiber-Probleme), das Fenster trotzdem zeigen
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);
  win.on('close', saveBounds);

  // Links (z. B. "Ganzer Song in Spotify") im System öffnen, die App selbst nie verlassen
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://klangwelt/')) {
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
  win.loadURL('app://klangwelt/index.html');
}

function focusWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openExternal(url) {
  if (/^(https:\/\/|spotify:)/i.test(String(url))) return shell.openExternal(url).catch(() => {});
  return Promise.resolve();
}

ipcMain.handle('kw:open', (e, url) => openExternal(url));

// Cover-Infos von open.spotify.com/oembed – hier statt im Fenster, damit CORS keine Rolle spielt
ipcMain.handle('kw:json', async (e, url) => {
  if (typeof url !== 'string' || !url.startsWith(OEMBED)) throw new Error('Nicht erlaubt');
  const res = await net.fetch(url);
  if (!res.ok) return null;
  return res.json();
});

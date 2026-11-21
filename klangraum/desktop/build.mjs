// Baut release/Klangraum-Windows-x64.zip (Ordner mit Klangraum.exe) – funktioniert auch unter Linux, ohne Wine.
// Aufruf im Ordner desktop/: npm install && npm run build:win
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { downloadArtifact } from '@electron/get';
import { createPackage } from '@electron/asar';
import * as ResEdit from 'resedit';

const require = createRequire(import.meta.url);
const extract = require('extract-zip');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BUILD = path.join(ROOT, '..', 'build', 'klangraum-desktop');
const RELEASE = path.join(ROOT, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(HERE, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const NAME = 'Klangraum';
const KEEP_LOCALES = new Set(['de.pak', 'en-US.pak']);

function step(msg) { console.log('• ' + msg); }

async function main() {
  fs.rmSync(BUILD, { recursive: true, force: true });
  const appDir = path.join(BUILD, 'app');
  const outDir = path.join(BUILD, 'win', NAME);
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(RELEASE, { recursive: true });

  step('Electron ' + electronVersion + ' für Windows laden (mit Prüfsumme) …');
  const zip = await downloadArtifact({ version: electronVersion, platform: 'win32', arch: 'x64', artifactName: 'electron' });
  await extract(zip, { dir: outDir });

  step('App packen …');
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, main: 'main.js', description: pkg.description }, null, 2));
  for (const f of ['main.js', 'preload.js', 'icon.ico']) fs.copyFileSync(path.join(HERE, f), path.join(appDir, f));
  fs.cpSync(path.join(ROOT, 'web'), path.join(appDir, 'web'), { recursive: true });
  const res = path.join(outDir, 'resources');
  fs.rmSync(path.join(res, 'default_app.asar'), { force: true });
  await createPackage(appDir, path.join(res, 'app.asar'));

  // Nur Deutsch und Englisch behalten (spart ~40 MB)
  for (const f of fs.readdirSync(path.join(outDir, 'locales'))) {
    if (!KEEP_LOCALES.has(f)) fs.rmSync(path.join(outDir, 'locales', f));
  }

  step('Klangraum.exe mit Icon und Versionsinfo …');
  const exePath = path.join(outDir, NAME + '.exe');
  fs.renameSync(path.join(outDir, 'electron.exe'), exePath);
  setExeResources(exePath);

  fs.writeFileSync(path.join(outDir, 'LIESMICH.txt'), readme().replace(/\n/g, '\r\n'));

  step('ZIP erstellen …');
  const target = path.join(RELEASE, NAME + '-Windows-x64.zip');
  fs.rmSync(target, { force: true });
  zipFolder(path.dirname(outDir), NAME, target);
  console.log('Fertig: ' + path.relative(process.cwd(), target) + ' (' + (fs.statSync(target).size / 1048576).toFixed(1) + ' MB)');
}

function setExeResources(exePath) {
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(HERE, 'icon.ico')));
  const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icon.icons.map(i => i.data));

  const [major, minor, patch] = pkg.version.split('.').map(Number);
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const strings = {
    ProductName: NAME,
    FileDescription: NAME,
    CompanyName: NAME,
    LegalCopyright: 'MIT-Lizenz',
    InternalName: NAME,
    OriginalFilename: NAME + '.exe',
    FileVersion: pkg.version,
    ProductVersion: pkg.version,
  };
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, strings);
    vi.removeStringValue(lang, 'SquirrelAwareVersion'); // kein Squirrel-Installer
  }
  vi.setFileVersion(major, minor, patch, 0);
  vi.setProductVersion(major, minor, patch, 0);
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

function zipFolder(cwd, folder, target) {
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(cwd, folder)}' -DestinationPath '${target}' -CompressionLevel Optimal`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-r', '-9', '-X', '-q', target, folder], { cwd, stdio: 'inherit' });
  }
}

function readme() {
  return `Klangraum ${pkg.version} für Windows
=================================

Starten
-------
1. Diesen Ordner irgendwohin entpacken (z. B. nach "Dokumente\\Klangraum").
2. Klangraum.exe doppelklicken.
   Windows SmartScreen kann warnen, weil die App nicht signiert ist:
   "Weitere Informationen" -> "Trotzdem ausführen".
3. Tipp: Rechtsklick auf Klangraum.exe -> "An Start anheften" oder
   "Verknüpfung erstellen" und auf den Desktop ziehen.

Einmalig einrichten
-------------------
Klangraum braucht eine eigene (kostenlose) Spotify-Entwickler-App:
1. https://developer.spotify.com/dashboard öffnen und "Create app" klicken.
2. Bei "Redirect URIs" eintragen (jeweils "Add"):
     http://127.0.0.1:43821/callback
     klangraum://callback
3. "Web API" ankreuzen, speichern, unter "Settings" die Client ID kopieren.
4. In Klangraum die Client ID einfügen und "Mit Spotify verbinden" klicken.

Danach lädt Klangraum alle Playlists (eigene und gespeicherte von anderen)
und deine Lieblingssongs.

Abspielen
---------
Klangraum steuert die Musik über Spotify Connect (Spotify Premium nötig).
Die Musik läuft in der Spotify-App auf dem PC, dem Handy, im Browser
(open.spotify.com) oder auf einem Lautsprecher. Läuft noch nichts, bietet
Klangraum an, Spotify zu öffnen, und legt dann automatisch los.

Hinweise
--------
- Spotify verlangt seit Februar 2026 Premium beim Besitzer der Entwickler-App.
  Bis zu 5 Konten können sie nutzen ("User Management" im Dashboard).
- Die Songs von Playlists anderer Leute gibt Spotify nicht mehr an solche Apps
  heraus. Klangraum zeigt sie deshalb im offiziellen Spotify-Player an und
  kann sie trotzdem komplett abspielen.
- Klangraum ist kein offizielles Spotify-Produkt.
`;
}

main().catch(e => { console.error(e); process.exit(1); });

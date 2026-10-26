// Baut release/Klangwelt-Windows-x64.zip (Ordner mit Klangwelt.exe) – funktioniert auch unter Linux, ohne Wine.
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
const BUILD = path.join(ROOT, '..', 'build', 'klangwelt-desktop');
const RELEASE = path.join(ROOT, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(HERE, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const NAME = 'Klangwelt';
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

  step('Klangwelt.exe mit Icon und Versionsinfo …');
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
  return `Klangwelt ${pkg.version} für Windows
=================================

Starten
-------
1. Diesen Ordner irgendwohin entpacken (z. B. nach "Dokumente\\Klangwelt").
2. Klangwelt.exe doppelklicken.
   Windows SmartScreen kann warnen, weil die App nicht signiert ist:
   "Weitere Informationen" -> "Trotzdem ausführen".
3. Tipp: Rechtsklick auf Klangwelt.exe -> "An Start anheften" oder
   "Verknüpfung erstellen" und auf den Desktop ziehen.

Was Klangwelt kann
------------------
- Über 80.000 Songs aus 114 Genres durchsuchen (Songs, Künstler, Alben, Genres).
- Lieblingssongs, eigene Playlists, gespeicherte Alben, gefolgte Künstler.
- Mixe: Daily Mixe aus deinen Lieblingssongs, Mix der Woche, Stimmungen,
  Charts (Top 50 gesamt und pro Genre), Song-, Künstler- und Genre-Radio.
- Ohne Werbung, unbegrenzt überspringen, jeden Song direkt wählen,
  Warteschlange, Zufall, Wiederholen, Endlos-Wiedergabe, Sleep-Timer.

Abspielen
---------
Klangwelt spielt über den offiziellen Spotify-Player die 30-Sekunden-
Vorschau jedes Songs (Internet nötig, keine Anmeldung). Den ganzen Song
öffnet der Knopf "Ganzen Song in Spotify hören" in Spotify.

Alle Songs von Spotify (optional)
---------------------------------
Einstellungen -> "Spotify verbinden": Dann findet die Suche jeden Song auf
Spotify. Dafür einmalig auf https://developer.spotify.com/dashboard eine App
anlegen, als Redirect URIs http://127.0.0.1:43822/callback und
klangwelt://callback eintragen, "Web API" ankreuzen und die Client ID in
Klangwelt einfügen. Premium braucht nur der Besitzer dieser Entwickler-App.

Deine Bibliothek bleibt auf diesem PC. Unter Einstellungen -> "Code kopieren"
nimmst du sie aufs Handy mit (dort "Code einfügen").

Songdaten: "Spotify Tracks Dataset" (Maharshi Pandya), gesammelt über die
Spotify Web API. Klangwelt ist kein offizielles Spotify-Produkt.
`;
}

main().catch(e => { console.error(e); process.exit(1); });

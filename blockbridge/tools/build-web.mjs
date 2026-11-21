// Baut die Oberfläche nach dist/ (wird von der Windows- und der Android-App benutzt).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, minify: true, format: 'iife', target: ['chrome70', 'firefox78', 'safari14'], legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: [join(root, 'src/ui/main.js')], outfile: join(out, 'app.js') });
await build({ ...common, entryPoints: [join(root, 'src/ui/worker.js')], outfile: join(out, 'worker.js') });

const html = readFileSync(join(root, 'src/index.html'), 'utf8').replace('<span id="app-version">1.0</span>', `<span id="app-version">${pkg.version}</span>`);
writeFileSync(join(out, 'index.html'), html);
for (const f of ['styles.css', 'icon.png']) copyFileSync(join(root, 'src', f), join(out, f));
console.log('dist/ fertig');

// Baut release/Standbild.html: die ganze App in einer Datei (Schriften und Skripte eingebettet).
// Läuft per Doppelklick im Browser, auch ohne Internet.  Aufruf: node standbild/build-web.js
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, 'www');
const OUT = path.join(__dirname, '..', 'release', 'Standbild.html');

let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(WWW, 'style.css'), 'utf8');
css = css.replace(/url\((fonts\/[^)]+)\)/g, (m, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(WWW, f)).toString('base64')})`);
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) => {
  const js = fs.readFileSync(path.join(WWW, f), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${f} enthält </script>`);
  return `<script>\n${js}</script>`;
});
html = html.replace(/\n?<!-- \/?(page|head|body) -->/g, '');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Fertig: release/Standbild.html (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);

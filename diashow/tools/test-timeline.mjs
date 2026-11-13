// Tests für die Zeitleiste der Diashow (ohne Browser): node diashow/tools/test-timeline.mjs
import assert from 'node:assert/strict';
import { newProject, addSlide, timeline, indexAt, imagesAround, applyStyle, STYLES, motionFor, outputSize } from '../app/assets/www/js/slideshow.js';

const p = newProject([]);
for (let i = 0; i < 5; i++) addSlide(p, 'img' + i, { w: 4000, h: 3000 });
p.duration = 3;
p.transDur = 1;
let tl = timeline(p);
assert.equal(tl.items.length, 5);
assert.equal(tl.total, 15);
assert.equal(tl.items[4].trOut, 0, 'letztes Bild hat keinen Übergang');
for (const it of tl.items.slice(0, 4)) assert.equal(it.trOut, 1);
assert.equal(tl.items[1].visStart, 2, 'Bild 2 ist ab Beginn des Übergangs sichtbar');
assert.equal(indexAt(tl, 0), 0);
assert.equal(indexAt(tl, 2.99), 0);
assert.equal(indexAt(tl, 3), 1);
assert.equal(indexAt(tl, 14.9), 4);
assert.deepEqual(imagesAround(p, tl, 2.5, 0), ['img0', 'img1'], 'im Übergang werden beide Bilder gebraucht');

// Übergang nie länger als die halbe Bilddauer
p.slides[2].dur = 0.8;
tl = timeline(p);
assert.ok(tl.items[1].trOut <= 0.4 + 1e-9 && tl.items[2].trOut <= 0.4 + 1e-9);
assert.equal(tl.total, 3 * 4 + 0.8);

// Harter Schnitt
p.slides[0].tr = 'none';
tl = timeline(p);
assert.equal(tl.items[0].trOut, 0);
assert.equal(tl.items[1].trIn, 0);

// "Gemischt" ist pro Bild fest (gleiche Diashow → gleiches Video)
p.transition = 'mix';
const a = timeline(p).items.map((i) => i.trKind).join();
const b = timeline(p).items.map((i) => i.trKind).join();
assert.equal(a, b);
assert.ok(!a.includes('mix'));

// Stile setzen alle Werte
for (const st of STYLES) {
  applyStyle(p, st.id);
  assert.equal(p.style, st.id);
  assert.equal(p.duration, st.set.duration);
}

// Bewegung: Hochformat-Bild in 16:9 → senkrechter Schwenk; ohne Bewegung → keine
p.motion = true;
const s = p.slides[0];
s.motion = 'auto';
const m = motionFor(p, s, 2000, 3000, 1920, 1080);
assert.ok(m.y0 !== m.y1 && m.x0 === m.x1, 'Hochformat schwenkt senkrecht');
p.motion = false;
const n = motionFor(p, s, 2000, 3000, 1920, 1080);
assert.equal(n.z0, n.z1);
assert.equal(n.y0, n.y1);

// Ausgabegrößen: gerade Zahlen, 720p-Fassungen durch 16 teilbar
for (const f of ['16:9', '9:16', '1:1', '4:5']) {
  for (const q of ['1080', '720']) {
    const o = outputSize(f, q);
    assert.ok(o.w % 2 === 0 && o.h % 2 === 0);
    if (q === '720') assert.ok(o.w % 16 === 0 && o.h % 16 === 0, f + ' 720p');
  }
}
console.log('Zeitleiste: alle Tests bestanden');

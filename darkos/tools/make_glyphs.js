#!/usr/bin/env node
// Wandelt ausgewählte Lucide-Symbole (ISC-Lizenz) in Android-Vektorgrafiken um.
// Aufruf: node darkos/tools/make_glyphs.js <lucide-static>/icon-nodes.json [vorschau.html]
// Schreibt darkos/res/drawable/g_*.xml und darkos/java/de/darkos/launcher/Glyphs.java.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Symbole, die man im Icon-Editor für Apps auswählen kann (Name in DarkOS: Lucide-Name)
const APP = {
  phone: 'phone', chat: 'message-circle', messages: 'message-square', chats: 'messages-square',
  mail: 'mail', send: 'send', at: 'at-sign', video: 'video', users: 'users', contact: 'contact-round',
  bell: 'bell', globe: 'globe', earth: 'earth', play: 'play', tv: 'tv', film: 'film',
  clapper: 'clapperboard', popcorn: 'popcorn', music: 'eighth-notes', headphones: 'headphones',
  radio: 'radio', mic: 'mic', waves: 'audio-lines', disc: 'disc-3', camera: 'camera',
  aperture: 'aperture', image: 'image', images: 'images', settings: 'settings', clock: 'clock',
  alarm: 'alarm-clock', timer: 'timer', calendar: 'calendar-days', calculator: 'calculator',
  folder: 'folder', file: 'file-text', note: 'sticky-note', notebook: 'notebook-pen', pen: 'pen-line',
  search: 'search', scan: 'scan-line', qr: 'qr-code', languages: 'languages', compass: 'compass',
  flashlight: 'flashlight', map: 'map', pin: 'map-pin', navigation: 'navigation', cloud: 'cloud',
  weather: 'cloud-sun', download: 'download', drive: 'hard-drive', printer: 'printer', key: 'key-round',
  lock: 'lock', shield: 'shield-check', wallet: 'wallet', card: 'credit-card', bank: 'landmark',
  piggy: 'piggy-bank', bitcoin: 'bitcoin', bag: 'shopping-bag', cart: 'shopping-cart', store: 'store',
  package: 'package', truck: 'truck', ticket: 'ticket', gift: 'gift', tag: 'tag', car: 'car',
  taxi: 'car-taxi-front', bus: 'bus', train: 'train-front', plane: 'plane', bike: 'bike', fuel: 'fuel',
  food: 'utensils', coffee: 'coffee', pizza: 'pizza', heart: 'heart', health: 'heart-pulse',
  fitness: 'dumbbell', steps: 'footprints', leaf: 'leaf', flame: 'flame', sun: 'sun', moon: 'moon',
  star: 'star', sparkles: 'sparkles', bot: 'bot', brain: 'brain', rocket: 'rocket', gamepad: 'gamepad-2',
  joystick: 'joystick', trophy: 'trophy', ghost: 'ghost', cat: 'cat', dog: 'dog', palette: 'palette',
  brush: 'brush', book: 'book-open', news: 'newspaper', school: 'graduation-cap', briefcase: 'briefcase',
  house: 'house', idea: 'lightbulb', smartphone: 'smartphone', keyboard: 'keyboard', grid: 'layout-grid',
  code: 'code', terminal: 'terminal', cpu: 'cpu', zap: 'zap', atom: 'atom', orbit: 'orbit', gem: 'gem',
  crown: 'crown', smile: 'face-slightly-smiling', swords: 'swords', dice: 'dice-5', todo: 'list-todo',
  activity: 'activity', gauge: 'gauge', monitor: 'monitor-play', cast: 'cast', wifi: 'wifi',
  bluetooth: 'bluetooth', volume: 'volume-2', thermometer: 'thermometer', umbrella: 'umbrella',
  satellite: 'satellite-dish', fingerprint: 'fingerprint-pattern', vpn: 'shield', box: 'box',
  tool: 'wrench', sliders: 'sliders-horizontal', layers: 'layers', translate: 'languages',
};

// Nur für die Oberfläche (Menüs, Widgets, Wetter)
const UI = {
  x: 'x', plus: 'plus', check: 'check', up: 'chevron-up', down: 'chevron-down', left: 'chevron-left',
  right: 'chevron-right', trash: 'trash', eye_off: 'eye-off', eye: 'eye', info: 'info', rename: 'pencil',
  arrow_up: 'arrow-up', arrow_down: 'arrow-down', refresh: 'refresh-cw', more: 'ellipsis-vertical',
  reset: 'rotate-ccw', add: 'circle-plus', edit: 'square-pen', app: 'app-window', external: 'external-link',
  battery: 'battery', battery_charging: 'battery-charging', battery_full: 'battery-full',
  battery_medium: 'battery-medium', battery_low: 'battery-low', flashlight_off: 'flashlight-off',
  brightness: 'sun-medium', memory: 'memory-stick', bell_off: 'bell-off', wallpaper: 'wallpaper',
  cloud_moon: 'cloud-moon', cloudy: 'cloudy', fog: 'cloud-fog', drizzle: 'cloud-drizzle', rain: 'cloud-rain',
  snow: 'cloud-snow', storm: 'cloud-lightning', hail: 'cloud-hail', wind: 'wind', droplets: 'droplets',
  home_star: 'house-plus', dock: 'panel-bottom', widget: 'layout-dashboard', move: 'move', shapes: 'shapes',
  power: 'power', hourglass: 'hourglass',
};

function main() {
  const nodesPath = process.argv[2];
  if (!nodesPath) {
    console.error('Aufruf: node make_glyphs.js <icon-nodes.json> [vorschau.html]');
    process.exit(1);
  }
  const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
  const all = Object.assign({}, APP, UI);
  const outDir = path.join(ROOT, 'res', 'drawable');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.startsWith('g_')) fs.unlinkSync(path.join(outDir, f));

  const preview = [];
  for (const [name, lucide] of Object.entries(all)) {
    const els = nodes[lucide];
    if (!els) throw new Error('Lucide-Symbol fehlt: ' + lucide);
    const strokes = [];
    const fills = [];
    for (const [tag, attrs] of els) {
      const d = normalize(toPath(tag, attrs));
      if (attrs.fill && attrs.fill !== 'none') fills.push(d); else strokes.push(d);
    }
    const parts = [];
    if (strokes.length) {
      parts.push(`    <path android:pathData="${strokes.join(' ')}"\n        android:strokeColor="#FFFFFFFF" android:strokeWidth="2"\n` +
        `        android:strokeLineCap="round" android:strokeLineJoin="round" />`);
    }
    if (fills.length) parts.push(`    <path android:pathData="${fills.join(' ')}" android:fillColor="#FFFFFFFF" />`);
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<!-- Lucide "${lucide}" (ISC-Lizenz), erzeugt von tools/make_glyphs.js -->\n` +
      `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="24dp" android:height="24dp"\n` +
      `    android:viewportWidth="24" android:viewportHeight="24">\n${parts.join('\n')}\n</vector>\n`;
    fs.writeFileSync(path.join(outDir, 'g_' + name + '.xml'), xml);
    preview.push({ name, strokes, fills });
  }

  const java = [
    '// Erzeugt von darkos/tools/make_glyphs.js – nicht von Hand ändern.',
    'package de.darkos.launcher;',
    '',
    '/** Neon-Symbole (Lucide, ISC-Lizenz) für App-Icons und Oberfläche. */',
    'final class Glyphs {',
    '    private Glyphs() {}',
    '',
    '    /** Symbole, die im Icon-Editor auswählbar sind. */',
    '    static final String[] APP_NAMES = {',
    ...chunk(Object.keys(APP).map((n) => `"${n}"`), 8).map((l) => '        ' + l.join(', ') + ','),
    '    };',
    '',
    '    static int id(String name) {',
    '        if (name == null) return 0;',
    '        switch (name) {',
    ...Object.keys(all).map((n) => `            case "${n}": return R.drawable.g_${n};`),
    '            default: return 0;',
    '        }',
    '    }',
    '}',
    '',
  ];
  fs.writeFileSync(path.join(ROOT, 'java', 'de', 'darkos', 'launcher', 'Glyphs.java'), java.join('\n'));

  if (process.argv[3]) {
    const cells = preview.map(({ name, strokes, fills }) =>
      `<div><svg viewBox="0 0 24 24" width="48" height="48"><path d="${strokes.join(' ')}" fill="none" stroke="#c084fc" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="${fills.join(' ')}" fill="#c084fc"/></svg>` +
      `<span>${name}</span></div>`).join('');
    fs.writeFileSync(process.argv[3], `<!doctype html><meta charset="utf-8"><style>body{background:#000;color:#aaa;` +
      `font:11px sans-serif;display:flex;flex-wrap:wrap;gap:6px;margin:8px}div{width:78px;display:flex;flex-direction:column;` +
      `align-items:center;gap:4px;padding:6px 0;border:1px solid #222;border-radius:8px}</style>${cells}`);
  }
  console.log(Object.keys(all).length + ' Symbole erzeugt (' + Object.keys(APP).length + ' für Apps).');
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const num = (v) => parseFloat(v || '0');

function toPath(tag, a) {
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle':
      return ellipse(num(a.cx), num(a.cy), num(a.r), num(a.r));
    case 'ellipse':
      return ellipse(num(a.cx), num(a.cy), num(a.rx), num(a.ry));
    case 'line':
      return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case 'polyline':
    case 'polygon': {
      const p = a.points.trim().split(/[\s,]+/).map(Number);
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? d + 'Z' : d;
    }
    case 'rect': {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      let rx = a.rx != null ? num(a.rx) : a.ry != null ? num(a.ry) : 0;
      let ry = a.ry != null ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    default:
      throw new Error('Unbekanntes Element: ' + tag);
  }
}

function ellipse(cx, cy, rx, ry) {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Schreibt SVG-Pfaddaten eindeutig neu (jedes Segment mit Befehl, Zahlen mit Leerzeichen, Bogen-Flags getrennt). */
function normalize(d) {
  let i = 0;
  const out = [];
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const readNum = () => {
    skip();
    const m = /^[+-]?(\d*\.\d+|\d+\.?\d*)([eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error('Zahl erwartet bei ' + i + ' in ' + d);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const readFlag = () => {
    skip();
    const c = d[i++];
    if (c !== '0' && c !== '1') throw new Error('Flag erwartet in ' + d);
    return Number(c);
  };
  let cmd = null;
  for (;;) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd) throw new Error('Pfad beginnt ohne Befehl: ' + d);
    const up = cmd.toUpperCase();
    if (!(up in ARGS)) throw new Error('Unbekannter Befehl ' + cmd);
    if (up === 'Z') { out.push(cmd); continue; }
    const vals = [];
    for (let k = 0; k < ARGS[up]; k++) vals.push(up === 'A' && (k === 3 || k === 4) ? readFlag() : readNum());
    // Ein relatives "m" am Anfang ist absolut – wichtig, weil mehrere Elemente zu einem Pfad zusammengefügt werden
    if (!out.length && cmd === 'm') cmd = 'M';
    out.push(cmd + vals.map(fmt).join(' '));
    if (out.length === 1 && d.trim()[0] === 'm') cmd = 'm';
    // Nach einem MoveTo folgen implizit LineTo-Befehle
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return out.join(' ');
}

function fmt(v) {
  const s = (Math.round(v * 1000) / 1000).toString();
  return s === '-0' ? '0' : s;
}

main();

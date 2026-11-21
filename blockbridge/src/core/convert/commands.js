// Befehle in .mcfunction-Dateien zwischen Java und Bedrock übersetzen.
//
// Bedrock lädt eine Funktion nur, wenn jede Zeile gültig ist. Zeilen, die sich nicht sicher
// übersetzen lassen, werden deshalb auskommentiert und mit einem Hinweis versehen.

import { textComponentToString } from '../util.js';
import { toBedrockId, toJavaId } from './recipes.js';

/** Zerlegt eine Befehlszeile in Teile; Klammern und Anführungszeichen bleiben zusammen. */
export function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) break;
    let j = i, depth = 0, q = null;
    while (j < s.length) {
      const c = s[j];
      if (q) {
        if (c === '\\') j++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') depth--;
      else if (c === ' ' && depth <= 0) break;
      j++;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

/** Restlicher Text ab dem n-ten Teil (für JSON-Texte mit Leerzeichen). */
function restFrom(cmd, tokens, n) {
  let pos = 0;
  for (let k = 0; k < n; k++) {
    pos = cmd.indexOf(tokens[k], pos) + tokens[k].length;
  }
  return cmd.slice(pos).trim();
}

function splitArgs(s) {
  const out = [];
  let depth = 0, start = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (s.slice(start).trim()) out.push(s.slice(start));
  return out
    .map((a) => {
      const k = a.indexOf('=');
      return k < 0 ? null : [a.slice(0, k).trim(), a.slice(k + 1).trim()];
    })
    .filter(Boolean);
}

function parseRange(v) {
  const s = String(v);
  const i = s.indexOf('..');
  const num = (x) => (x === '' ? null : Number(x));
  const r = i < 0 ? { min: num(s), max: num(s) } : { min: num(s.slice(0, i)), max: num(s.slice(i + 2)) };
  if ((r.min != null && !Number.isFinite(r.min)) || (r.max != null && !Number.isFinite(r.max))) return null;
  return r;
}

const stripNs = (id) => String(id).replace(/^minecraft:/, '');

class Fail extends Error {}
const fail = (why) => {
  throw new Fail(why);
};

// ---------- Selektoren ----------
function selJ2B(tok, notes) {
  const m = tok.match(/^@([parsen])(?:\[(.*)\])?$/s);
  if (!m) return tok;
  let base = m[1];
  const args = m[2] ? splitArgs(m[2]) : [];
  const out = [];
  let limit = null, sort = null;
  for (const [k, v] of args) {
    if (['type', 'name', 'tag', 'scores', 'x', 'y', 'z', 'dx', 'dy', 'dz'].includes(k)) out.push(`${k}=${v}`);
    else if (k === 'distance' || k === 'level' || k === 'x_rotation' || k === 'y_rotation') {
      const r = parseRange(v);
      if (!r) fail('ungültiger Bereich');
      const [lo, hi] = { distance: ['rm', 'r'], level: ['lm', 'l'], x_rotation: ['rxm', 'rx'], y_rotation: ['rym', 'ry'] }[k];
      if (r.min != null) out.push(`${lo}=${r.min}`);
      if (r.max != null) out.push(`${hi}=${r.max}`);
    } else if (k === 'limit') limit = Number(v);
    else if (k === 'sort') sort = v;
    else if (k === 'gamemode') out.push(`m=${v}`);
    else fail(`Selektor-Filter "${k}" gibt es in Bedrock nicht`);
  }
  if (base === 'n') {
    base = 'e';
    if (limit == null) limit = 1;
  }
  if (sort === 'random' && base === 'e') base = 'r';
  if (limit != null) out.push(`c=${sort === 'furthest' ? -limit : limit}`);
  else if (sort === 'furthest') fail('Sortierung "furthest" ohne limit');
  if (sort === 'arbitrary' && limit != null) notes.add('Selektoren mit sort=arbitrary nehmen in Bedrock die nächsten Ziele');
  return '@' + base + (out.length ? `[${out.join(',')}]` : '');
}

const GM_B2J = { 0: 'survival', s: 'survival', survival: 'survival', 1: 'creative', c: 'creative', creative: 'creative', 2: 'adventure', a: 'adventure', adventure: 'adventure', spectator: 'spectator' };

function selB2J(tok) {
  const m = tok.match(/^@([parse])(?:\[(.*)\])?$/s);
  if (!m) {
    if (/^@(initiator|c|v)\b/.test(tok)) fail('Selektor gibt es in Java nicht');
    return tok;
  }
  const base = m[1];
  const args = m[2] ? splitArgs(m[2]) : [];
  const out = [];
  const ranges = {};
  let c = null;
  for (const [k, v] of args) {
    if (['type', 'name', 'tag', 'scores', 'x', 'y', 'z', 'dx', 'dy', 'dz'].includes(k)) out.push(`${k}=${v}`);
    else if (['r', 'rm', 'l', 'lm', 'rx', 'rxm', 'ry', 'rym'].includes(k)) ranges[k] = v;
    else if (k === 'c') c = Number(v);
    else if (k === 'm') {
      const neg = v.startsWith('!');
      const g = GM_B2J[neg ? v.slice(1) : v];
      if (!g) fail('Spielmodus "default" gibt es in Java nicht');
      out.push(`gamemode=${neg ? '!' : ''}${g}`);
    } else fail(`Selektor-Filter "${k}" gibt es in Java nicht`);
  }
  for (const [lo, hi, name] of [['rm', 'r', 'distance'], ['lm', 'l', 'level'], ['rxm', 'rx', 'x_rotation'], ['rym', 'ry', 'y_rotation']]) {
    if (ranges[lo] == null && ranges[hi] == null) continue;
    out.push(`${name}=${ranges[lo] ?? ''}..${ranges[hi] ?? ''}`.replace(/^(\w+)=(-?[\d.]+)\.\.\2$/, '$1=$2'));
  }
  if (c != null && c !== 0) {
    out.push(`limit=${Math.abs(c)}`);
    if (base !== 'r') out.push(`sort=${c < 0 ? 'furthest' : 'nearest'}`);
  }
  return '@' + base + (out.length ? `[${out.join(',')}]` : '');
}

// ---------- Texte ----------
/** Java-Textkomponente -> Bedrock rawtext-Liste */
function toRawtext(c, out = [], style = '') {
  if (c == null) return out;
  if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
    out.push({ text: style + String(c) });
    return out;
  }
  if (Array.isArray(c)) {
    // im Array erben die Folgeteile das Aussehen des ersten
    const first = c[0];
    const st = first && typeof first === 'object' && !Array.isArray(first) ? textComponentToString({ ...first, text: '', extra: undefined }) : '';
    c.forEach((x, i) => toRawtext(x, out, i === 0 ? style : style + st));
    return out;
  }
  const st = style + textComponentToString({ color: c.color, bold: c.bold, italic: c.italic, text: '' });
  if (c.text != null) out.push({ text: st + String(c.text) });
  else if (c.selector) out.push({ selector: c.selector });
  else if (c.score) out.push({ score: { name: c.score.name, objective: c.score.objective } });
  else if (c.translate) out.push({ translate: c.translate, ...(c.with ? { with: { rawtext: c.with.flatMap((w) => toRawtext(w)) } } : {}) });
  else if (c.nbt || c.keybind) fail('Text mit NBT- oder Tastenbelegungs-Angaben');
  if (c.extra) c.extra.forEach((x) => toRawtext(x, out, st));
  return out;
}

function rawtextToJava(raw) {
  const parts = [''];
  for (const r of (raw && raw.rawtext) || []) {
    if (r.text != null) parts.push({ text: r.text });
    else if (r.selector) parts.push({ selector: r.selector });
    else if (r.score) parts.push({ score: { name: r.score.name, objective: r.score.objective } });
    else if (r.translate) parts.push({ translate: r.translate, ...(r.with && r.with.rawtext ? { with: rawtextToJava(r.with).slice(1) } : {}) });
  }
  return parts;
}

function parseJsonText(s) {
  try {
    return JSON.parse(s);
  } catch {
    // Java 1.21.5+ erlaubt SNBT-Texte; einfache Fälle wie {text:'Hallo'} versuchen
    const fixed = s.replace(/([{,]\s*)([A-Za-z_]+)\s*:/g, '$1"$2":').replace(/'([^']*)'/g, (m, x) => JSON.stringify(x));
    try {
      return JSON.parse(fixed);
    } catch {
      fail('Text konnte nicht gelesen werden');
    }
  }
}

// ---------- Java -> Bedrock ----------
const J_SAME = new Set(['say', 'tell', 'msg', 'w', 'me', 'tp', 'teleport', 'kill', 'gamemode', 'defaultgamemode', 'difficulty', 'time', 'weather',
  'gamerule', 'spawnpoint', 'setworldspawn', 'stopsound', 'enchant', 'clone', 'reload', 'list', 'kick', 'op', 'deop', 'tag', 'help']);
const J_UNSUPPORTED = {
  data: 'NBT-Daten', attribute: 'Attribute', bossbar: 'Bossleisten', team: 'Teams', loot: 'Beutetabellen', advancement: 'Fortschritte',
  recipe: 'Rezeptbuch', trigger: 'Trigger', worldborder: 'Weltgrenze', datapack: 'Datenpakete', forceload: 'Chunk-Laden', item: 'Item-Befehl',
  random: 'Zufallsbefehl', return: 'return', schedule: 'schedule', particle: 'Partikel-Namen', ride: 'ride', spectate: 'spectate',
  fillbiome: 'fillbiome', place: 'place', locate: 'locate', tick: 'tick', rotate: 'rotate', transfer: 'transfer', jfr: 'jfr', perf: 'perf',
  debug: 'debug', publish: 'publish', seed: 'seed', replaceitem: 'replaceitem', dialog: 'Dialoge', test: 'Tests', waypoint: 'Wegpunkte',
};

function jfn(ref) {
  if (ref.startsWith('#')) fail('Funktions-Tags');
  const [n, p] = ref.includes(':') ? ref.split(':') : ['minecraft', ref];
  return `${n}/${p}`;
}

function blockJ2B(b, notes) {
  if (/[[{]/.test(b)) notes.add('Blockzustände/NBT bei Blöcken entfernt (Bedrock schreibt sie anders)');
  return toBedrockId(b.replace(/[[{].*$/s, ''));
}

function jcmd(cmd, ctx) {
  const t = tokenize(cmd);
  const name = t[0];
  const notes = ctx.notes;
  const S = (x) => selJ2B(x, notes);
  switch (name) {
    case 'function':
      if (t.length > 2) fail('Funktions-Makros mit Argumenten');
      return `function ${jfn(t[1])}`;
    case 'effect':
      if (t[1] === 'give') return ['effect', S(t[2]), stripNs(t[3]), ...t.slice(4)].join(' ');
      if (t[1] === 'clear') {
        if (t[3]) notes.add('"effect clear" entfernt in Bedrock alle Effekte');
        return `effect ${S(t[2] || '@s')} clear`;
      }
      return ['effect', ...t.slice(1).map((x) => (x.startsWith('@') ? S(x) : stripNs(x)))].join(' ');
    case 'xp':
    case 'experience':
      if (t[1] === 'add') return `xp ${t[3]}${t[4] === 'levels' ? 'L' : ''} ${S(t[2])}`;
      if (/^-?\d+L?$/.test(t[1] || '')) return ['xp', t[1], ...(t[2] ? [S(t[2])] : [])].join(' ');
      fail('xp set/query');
      break;
    case 'give': {
      if (/[[{]/.test(t[2] || '')) notes.add('Item-Daten (NBT/Komponenten) entfernt');
      const item = toBedrockId((t[2] || '').replace(/[[{].*$/s, ''));
      return ['give', S(t[1]), item, ...(t[3] ? [t[3]] : [])].join(' ');
    }
    case 'clear': {
      if (!t[1]) return 'clear';
      if (!t[2]) return `clear ${S(t[1])}`;
      if (/[[{]/.test(t[2])) notes.add('Item-Daten (NBT/Komponenten) entfernt');
      const item = toBedrockId(t[2].replace(/[[{].*$/s, ''));
      return t[3] ? `clear ${S(t[1])} ${item} -1 ${t[3]}` : `clear ${S(t[1])} ${item}`;
    }
    case 'summon':
      if (t[5]) notes.add('NBT-Daten beim Beschwören entfernt');
      return ['summon', stripNs(t[1]), ...t.slice(2, 5)].join(' ');
    case 'setblock':
      return ['setblock', t[1], t[2], t[3], blockJ2B(t[4], notes), ...(t[5] ? [t[5]] : [])].join(' ');
    case 'fill': {
      const parts = ['fill', ...t.slice(1, 7), blockJ2B(t[7], notes)];
      if (t[8]) parts.push(t[8]);
      if (t[8] === 'replace' && t[9]) parts.push(blockJ2B(t[9], notes));
      return parts.join(' ');
    }
    case 'playsound':
      notes.add('Sound-Namen unterscheiden sich teilweise zwischen den Editionen');
      return ['playsound', t[1], ...(t[3] ? [S(t[3])] : []), ...t.slice(4)].join(' ');
    case 'title':
      if (['title', 'subtitle', 'actionbar'].includes(t[2])) {
        const raw = toRawtext(parseJsonText(restFrom(cmd, t, 3)));
        return `titleraw ${S(t[1])} ${t[2]} ${JSON.stringify({ rawtext: raw })}`;
      }
      return ['title', S(t[1]), ...t.slice(2)].join(' ');
    case 'tellraw':
      return `tellraw ${S(t[1])} ${JSON.stringify({ rawtext: toRawtext(parseJsonText(restFrom(cmd, t, 2))) })}`;
    case 'scoreboard':
      return scoreJ2B(t, cmd, S, notes);
    case 'execute':
      return execJ2B(t, cmd, ctx);
    case 'damage':
      if (t.length > 3) fail('damage mit Schadensart/Quelle');
      return `damage ${S(t[1])} ${t[2]}`;
    case 'spreadplayers':
      if (t[5] === 'under') fail('spreadplayers … under');
      return ['spreadplayers', t[1], t[2], t[3], t[4], S(t[6])].join(' ');
    default:
      if (J_SAME.has(name)) return t.map((x, i) => (i > 0 && x.startsWith('@') ? S(x) : x)).join(' ');
      if (J_UNSUPPORTED[name]) fail(`${J_UNSUPPORTED[name]} gibt es in Bedrock so nicht`);
      fail(`Befehl "${name}" gibt es in Bedrock nicht`);
  }
  return cmd;
}

function scoreJ2B(t, cmd, S, notes) {
  if (t[1] === 'objectives') {
    if (t[2] === 'add') {
      if (t[4] !== 'dummy') notes.add(`Ziel-Kriterium "${t[4]}" durch "dummy" ersetzt (Bedrock kennt nur dummy)`);
      const disp = t[5] ? textComponentToString(parseJsonText(restFrom(cmd, t, 5)), false) : '';
      return `scoreboard objectives add ${t[3]} dummy${disp ? ' ' + JSON.stringify(disp) : ''}`;
    }
    if (t[2] === 'remove') return t.join(' ');
    if (t[2] === 'setdisplay') {
      const slot = t[3] === 'below_name' ? 'belowname' : t[3];
      if (!['list', 'sidebar', 'belowname'].includes(slot)) fail('Anzeige-Platz gibt es in Bedrock nicht');
      return ['scoreboard', 'objectives', 'setdisplay', slot, ...t.slice(4)].join(' ');
    }
    if (t[2] === 'list') return 'scoreboard objectives list';
    fail('scoreboard objectives modify');
  }
  if (t[1] === 'players') {
    if (['set', 'add', 'remove', 'reset', 'operation', 'list'].includes(t[2])) return t.map((x) => (x.startsWith('@') ? S(x) : x)).join(' ');
    fail(`scoreboard players ${t[2]}`);
  }
  fail('scoreboard');
}

const DIM_J2B = { 'minecraft:overworld': 'overworld', 'minecraft:the_nether': 'nether', 'minecraft:the_end': 'the_end', overworld: 'overworld', the_nether: 'nether', the_end: 'the_end' };

function execJ2B(t, cmd, ctx) {
  const S = (x) => selJ2B(x, ctx.notes);
  const out = ['execute'];
  let i = 1;
  while (i < t.length) {
    const sub = t[i];
    if (sub === 'as' || sub === 'at') {
      out.push(sub, S(t[i + 1]));
      i += 2;
    } else if (sub === 'positioned' || sub === 'rotated') {
      if (t[i + 1] === 'as') {
        out.push(sub, 'as', S(t[i + 2]));
        i += 3;
      } else if (sub === 'positioned') {
        if (t[i + 1] === 'over') fail('positioned over');
        out.push(sub, t[i + 1], t[i + 2], t[i + 3]);
        i += 4;
      } else {
        out.push(sub, t[i + 1], t[i + 2]);
        i += 3;
      }
    } else if (sub === 'facing') {
      if (t[i + 1] === 'entity') {
        out.push('facing', 'entity', S(t[i + 2]), t[i + 3]);
        i += 4;
      } else {
        out.push('facing', t[i + 1], t[i + 2], t[i + 3]);
        i += 4;
      }
    } else if (sub === 'align' || sub === 'anchored') {
      out.push(sub, t[i + 1]);
      i += 2;
    } else if (sub === 'in') {
      const d = DIM_J2B[t[i + 1]];
      if (!d) fail('eigene Dimensionen');
      out.push('in', d);
      i += 2;
    } else if (sub === 'if' || sub === 'unless') {
      const kind = t[i + 1];
      if (kind === 'entity') {
        out.push(sub, 'entity', S(t[i + 2]));
        i += 3;
      } else if (kind === 'block') {
        if (/[[{]/.test(t[i + 5] || '')) fail('Block-Prüfung mit Zuständen');
        out.push(sub, 'block', t[i + 2], t[i + 3], t[i + 4], toBedrockId(t[i + 5]));
        i += 6;
      } else if (kind === 'blocks') {
        out.push(sub, 'blocks', ...t.slice(i + 2, i + 12));
        i += 12;
      } else if (kind === 'score') {
        const target = t[i + 2].startsWith('@') ? S(t[i + 2]) : t[i + 2];
        if (t[i + 4] === 'matches') {
          out.push(sub, 'score', target, t[i + 3], 'matches', t[i + 5]);
          i += 6;
        } else {
          const t2 = t[i + 5].startsWith('@') ? S(t[i + 5]) : t[i + 5];
          out.push(sub, 'score', target, t[i + 3], t[i + 4], t2, t[i + 6]);
          i += 7;
        }
      } else fail(`execute ${sub} ${kind}`);
    } else if (sub === 'run') {
      const rest = restFrom(cmd, t, i + 1);
      out.push('run', jcmd(rest, ctx));
      return out.join(' ');
    } else fail(`execute ${sub}`);
  }
  return out.join(' ');
}

// ---------- Bedrock -> Java ----------
const B_SAME = new Set(['say', 'tell', 'msg', 'w', 'me', 'tp', 'teleport', 'kill', 'defaultgamemode', 'difficulty', 'time', 'weather', 'gamerule',
  'spawnpoint', 'setworldspawn', 'stopsound', 'enchant', 'clone', 'reload', 'list', 'kick', 'op', 'deop', 'tag', 'help', 'spreadplayers']);
const B_UNSUPPORTED = {
  tickingarea: 'Ticking-Areas', camera: 'Kamera', dialogue: 'Dialoge', event: 'Ereignisse', fog: 'Nebel', hud: 'HUD', music: 'Musik',
  structure: 'Strukturen', ability: 'Fähigkeiten', mobevent: 'Mob-Ereignisse', scriptevent: 'Skript-Ereignisse', inputpermission: 'Eingaberechte',
  camerashake: 'Kamerawackeln', replaceitem: 'replaceitem', testfor: 'testfor', testforblock: 'testforblock', testforblocks: 'testforblocks',
  agent: 'Agent', wsserver: 'wsserver', volumearea: 'volumearea', playanimation: 'Animationen', controlscheme: 'Steuerung',
  clearspawnpoint: 'clearspawnpoint', aimassist: 'Zielhilfe', loot: 'Beutetabellen', ride: 'ride', particle: 'Partikel', schedule: 'schedule',
  gametest: 'gametest', alwaysday: 'alwaysday', daylock: 'daylock', immutableworld: 'immutableworld', toggledownfall: 'toggledownfall',
};
const DIM_B2J = { overworld: 'minecraft:overworld', nether: 'minecraft:the_nether', the_end: 'minecraft:the_end' };

function bcmd(cmd, ctx) {
  const t = tokenize(cmd);
  const name = t[0];
  const notes = ctx.notes;
  const S = (x) => selB2J(x);
  const nsfn = (p) => (p.includes(':') ? p : `${ctx.namespace}:${p.replace(/^\//, '').toLowerCase()}`);
  switch (name) {
    case 'function':
      return `function ${nsfn(t[1].replace(/^"|"$/g, ''))}`;
    case 'effect':
      if (t[2] === 'clear') return `effect clear ${S(t[1])}${t[3] ? ' minecraft:' + stripNs(t[3]) : ''}`;
      return ['effect', 'give', S(t[1]), 'minecraft:' + stripNs(t[2]), ...t.slice(3)].join(' ');
    case 'xp': {
      const m = (t[1] || '').match(/^(-?\d+)(L?)$/i);
      if (!m) fail('xp');
      return `xp add ${S(t[2] || '@s')} ${m[1]} ${m[2] ? 'levels' : 'points'}`;
    }
    case 'give':
      if (t[4] || t[5]) notes.add('Datenwerte/Komponenten bei Items entfernt');
      return ['give', S(t[1]), toJavaId(t[2]), ...(t[3] ? [t[3]] : [])].join(' ');
    case 'clear':
      if (!t[1]) return 'clear';
      if (!t[2]) return `clear ${S(t[1])}`;
      return ['clear', S(t[1]), toJavaId(t[2]), ...(t[4] ? [t[4]] : [])].join(' ');
    case 'summon':
      if (t.length > 5) notes.add('Zusatzangaben beim Beschwören (Name, Ereignis, Blickrichtung) entfernt');
      return ['summon', 'minecraft:' + stripNs(t[1]), ...t.slice(2, 5)].join(' ');
    case 'setblock': {
      let k = 5;
      if (t[5] && /^\[|^-?\d+$/.test(t[5])) {
        notes.add('Blockzustände bei Blöcken entfernt (Java schreibt sie anders)');
        k = 6;
      }
      return ['setblock', t[1], t[2], t[3], toJavaId(t[4]), ...(t[k] ? [t[k]] : [])].join(' ');
    }
    case 'fill': {
      const parts = ['fill', ...t.slice(1, 7), toJavaId(t[7])];
      let k = 8;
      if (t[k] && /^\[|^-?\d+$/.test(t[k])) {
        notes.add('Blockzustände bei Blöcken entfernt (Java schreibt sie anders)');
        k++;
      }
      if (t[k]) parts.push(t[k]);
      if (t[k] === 'replace' && t[k + 1]) parts.push(toJavaId(t[k + 1]));
      return parts.join(' ');
    }
    case 'playsound':
      notes.add('Sound-Namen unterscheiden sich teilweise zwischen den Editionen');
      return ['playsound', t[1], 'master', S(t[2] || '@s'), ...t.slice(3)].join(' ');
    case 'titleraw':
      if (['title', 'subtitle', 'actionbar'].includes(t[2])) return `title ${S(t[1])} ${t[2]} ${JSON.stringify(rawtextToJava(parseJsonText(restFrom(cmd, t, 3))))}`;
      return ['title', S(t[1]), ...t.slice(2)].join(' ');
    case 'title':
      if (['title', 'subtitle', 'actionbar'].includes(t[2])) return `title ${S(t[1])} ${t[2]} ${JSON.stringify(restFrom(cmd, t, 3))}`;
      return ['title', S(t[1]), ...t.slice(2)].join(' ');
    case 'tellraw':
      return `tellraw ${S(t[1])} ${JSON.stringify(rawtextToJava(parseJsonText(restFrom(cmd, t, 2))))}`;
    case 'gamemode': {
      const g = GM_B2J[t[1]];
      if (!g) fail('Spielmodus "default"');
      return ['gamemode', g, ...(t[2] ? [S(t[2])] : [])].join(' ');
    }
    case 'scoreboard':
      return scoreB2J(t, S, ctx);
    case 'execute':
      return execB2J(t, cmd, ctx);
    case 'damage':
      if (t.length > 3) fail('damage mit Ursache');
      return `damage ${S(t[1])} ${t[2]}`;
    default:
      if (B_SAME.has(name)) return t.map((x, i) => (i > 0 && x.startsWith('@') ? S(x) : x)).join(' ');
      if (B_UNSUPPORTED[name]) fail(`${B_UNSUPPORTED[name]} gibt es in Java so nicht`);
      fail(`Befehl "${name}" gibt es in Java nicht`);
  }
  return cmd;
}

function scoreB2J(t, S, ctx) {
  if (t[1] === 'objectives') {
    if (t[2] === 'add') return t.join(' ');
    if (t[2] === 'remove' || t[2] === 'list') return t.join(' ');
    if (t[2] === 'setdisplay') {
      const slot = t[3] === 'belowname' && ctx.dp >= 18 ? 'below_name' : t[3];
      return ['scoreboard', 'objectives', 'setdisplay', slot, ...(t[4] ? [t[4]] : [])].join(' ');
    }
    fail('scoreboard objectives');
  }
  if (t[1] === 'players') {
    if (t[2] === 'random') {
      if (ctx.dp < 18) fail('Zufallszahlen gibt es in Java erst ab 1.20.2');
      return `execute store result score ${S(t[3])} ${t[4]} run random value ${t[5]}..${t[6]}`;
    }
    if (['set', 'add', 'remove', 'reset', 'operation', 'list'].includes(t[2])) return t.map((x) => (x.startsWith('@') ? S(x) : x)).join(' ');
    fail(`scoreboard players ${t[2]}`);
  }
  fail('scoreboard');
}

const EXEC_SUBS = new Set(['as', 'at', 'positioned', 'rotated', 'facing', 'align', 'anchored', 'in', 'if', 'unless', 'run']);

function execB2J(t, cmd, ctx) {
  const S = (x) => selB2J(x);
  // Alte Schreibweise: execute <Ziel> <x y z> [detect <x y z> <Block> <Daten>] <Befehl>
  if (t[1] && !EXEC_SUBS.has(t[1])) {
    const out = ['execute', 'as', S(t[1]), 'at', '@s'];
    const pos = t.slice(2, 5);
    if (pos.join(' ') !== '~ ~ ~') out.push('positioned', ...pos);
    let k = 5;
    if (t[5] === 'detect') {
      out.push('if', 'block', t[6], t[7], t[8], toJavaId(t[9]));
      k = 11;
    }
    out.push('run', bcmd(restFrom(cmd, t, k), ctx));
    return out.join(' ');
  }
  const out = ['execute'];
  let i = 1;
  while (i < t.length) {
    const sub = t[i];
    if (sub === 'as' || sub === 'at') {
      out.push(sub, S(t[i + 1]));
      i += 2;
    } else if (sub === 'positioned' || sub === 'rotated') {
      if (t[i + 1] === 'as') {
        out.push(sub, 'as', S(t[i + 2]));
        i += 3;
      } else if (sub === 'positioned') {
        out.push(sub, t[i + 1], t[i + 2], t[i + 3]);
        i += 4;
      } else {
        out.push(sub, t[i + 1], t[i + 2]);
        i += 3;
      }
    } else if (sub === 'facing') {
      if (t[i + 1] === 'entity') {
        out.push('facing', 'entity', S(t[i + 2]), t[i + 3]);
      } else out.push('facing', t[i + 1], t[i + 2], t[i + 3]);
      i += 4;
    } else if (sub === 'align' || sub === 'anchored') {
      out.push(sub, t[i + 1]);
      i += 2;
    } else if (sub === 'in') {
      out.push('in', DIM_B2J[t[i + 1]] || t[i + 1]);
      i += 2;
    } else if (sub === 'if' || sub === 'unless') {
      const kind = t[i + 1];
      if (kind === 'entity') {
        out.push(sub, 'entity', S(t[i + 2]));
        i += 3;
      } else if (kind === 'block') {
        let n = 6;
        if (t[i + 6] && /^\[|^-?\d+$/.test(t[i + 6])) fail('Block-Prüfung mit Zuständen');
        out.push(sub, 'block', t[i + 2], t[i + 3], t[i + 4], toJavaId(t[i + 5]));
        i += n;
      } else if (kind === 'blocks') {
        out.push(sub, 'blocks', ...t.slice(i + 2, i + 12));
        i += 12;
      } else if (kind === 'score') {
        const target = t[i + 2].startsWith('@') ? S(t[i + 2]) : t[i + 2];
        if (t[i + 4] === 'matches') {
          out.push(sub, 'score', target, t[i + 3], 'matches', t[i + 5]);
          i += 6;
        } else {
          const t2 = t[i + 5].startsWith('@') ? S(t[i + 5]) : t[i + 5];
          out.push(sub, 'score', target, t[i + 3], t[i + 4], t2, t[i + 6]);
          i += 7;
        }
      } else fail(`execute ${sub} ${kind}`);
    } else if (sub === 'run') {
      out.push('run', bcmd(restFrom(cmd, t, i + 1), ctx));
      return out.join(' ');
    } else fail(`execute ${sub}`);
  }
  return out.join(' ');
}

// ---------- ganze Funktionen ----------
function translate(text, fn, ctx) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const stats = { converted: 0, commented: 0 };
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) {
      out.push(line);
      continue;
    }
    if (s.endsWith('\\')) {
      // Java 1.20.2+: Zeilen mit \ am Ende werden fortgesetzt – Bedrock kennt das nicht
      out.push(`# [BlockBridge] Nicht umgewandelt (mehrzeiliger Befehl): ${s}`);
      stats.commented++;
      continue;
    }
    const cmd = s.replace(/^\//, '');
    if (cmd.startsWith('$')) {
      out.push(`# [BlockBridge] Nicht umgewandelt (Makro-Zeile): ${cmd}`);
      stats.commented++;
      continue;
    }
    try {
      const res = fn(cmd, ctx);
      if (/\bundefined\b/.test(res)) throw new Fail('Befehl unvollständig');
      out.push(res);
      stats.converted++;
    } catch (e) {
      const why = e instanceof Fail ? e.message : 'Befehl unvollständig oder nicht erkannt';
      out.push(`# [BlockBridge] Nicht umgewandelt (${why}): ${cmd}`);
      stats.commented++;
      ctx.reasons.add(why);
    }
  }
  return { text: out.join('\n'), stats };
}

export function javaFunctionToBedrock(text) {
  const ctx = { notes: new Set(), reasons: new Set() };
  const r = translate(text, jcmd, ctx);
  return { ...r, notes: ctx.notes, reasons: ctx.reasons };
}

export function bedrockFunctionToJava(text, namespace, dp) {
  const ctx = { notes: new Set(), reasons: new Set(), namespace, dp };
  const r = translate(text, bcmd, ctx);
  return { ...r, notes: ctx.notes, reasons: ctx.reasons };
}

// Für Tests
export const _internal = { selJ2B, selB2J, jcmd, bcmd };

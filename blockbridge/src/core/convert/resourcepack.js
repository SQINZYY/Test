// Ressourcenpakete: Java <-> Bedrock und Java <-> andere Java-Version.
//
// Beide Richtungen laufen über ein gemeinsames Zwischenformat ("canon"): Texturen mit Kategorie
// (block, item, entity, armor, …) und dem Namen, den die neueste Java-Version benutzt.

import { basename, extname, jsonBytes, parseJson, stripExt, textComponentToString, toText, uuid } from '../util.js';
import { crop, decodeImage, decodePng, encodePng, isPng, makeOpaque, pngSize, tint } from '../image.js';
import {
  armorFromBedrock, armorFromJavaEquipment, armorToBedrock, armorToJava, BEDROCK_FLIPBOOKS, bedrockOnly, bedrockToJava, javaToBedrock, specName,
  ENTITY_FROM_BEDROCK, ENTITY_TO_BEDROCK, ENVIRONMENT, fontFromBedrock, fontToBedrock, JAVA_ANIMATED, JAVA_RENAMES,
  LEGACY_JAVA, LEGACY_JAVA_IN, MISC_FROM_BEDROCK, MISC_TO_BEDROCK, soundFromBedrock, soundToBedrock,
} from '../mappings.js';
import { BEDROCK_RP_MIN_ENGINE, packMcmeta } from '../versions.js';

export function newCanon() {
  return {
    meta: { name: '', description: '', icon: null },
    source: '',
    format: 0,
    textures: new Map(), // key "cat/name" -> { cat, name, data, ext, mcmeta, anim, src }
    sounds: new Map(), // Java-Pfad unter sounds/ ohne Endung -> Bytes (.ogg)
    javaOther: new Map(), // übrige Dateien unter assets/minecraft/ (Modelle, Sprachen …) – nur für Java -> Java
    passthrough: new Map(), // Dateien außerhalb von assets/minecraft/ – nur für Java -> Java
    skipped: new Map(),
  };
}

function putTex(canon, tex) {
  const key = tex.cat + '/' + tex.name;
  if (!canon.textures.has(key)) canon.textures.set(key, tex);
}

// ---------- Namen umrechnen ----------
function upgradeFlat(cat, name) {
  for (const [, c, oldName, newName] of JAVA_RENAMES) if (c === cat && name === oldName) name = newName;
  return name;
}
function downgradeFlat(cat, name, fmt) {
  for (let i = JAVA_RENAMES.length - 1; i >= 0; i--) {
    const [from, c, oldName, newName] = JAVA_RENAMES[i];
    if (c === cat && name === newName && fmt < from) name = oldName;
  }
  return name;
}
function legacyToFlat(cat, name) {
  const o = LEGACY_JAVA_IN[cat];
  if (o && o[name]) return o[name];
  if (cat === 'block' || cat === 'item') return upgradeFlat(cat, bedrockToJava(cat, name).name);
  return upgradeFlat(cat, name);
}
function flatToLegacyJava(cat, name) {
  const r = javaToBedrock(cat, name);
  const first = r.specs.length ? basename(specName(r.specs[0])) : name;
  return (LEGACY_JAVA[cat] && LEGACY_JAVA[cat][first]) || first;
}
export function bedrockToFlat(cat, name) {
  if (cat === 'block' || cat === 'item') return bedrockToJava(cat, name).name;
  return name;
}
/** -> { specs, mapped, known, none } (siehe mappings.javaToBedrock) */
export function flatToBedrock(cat, name) {
  return javaToBedrock(cat, name);
}

// ---------- Java lesen ----------
export function javaPackFormat(mcmeta) {
  const p = mcmeta && mcmeta.pack;
  if (!p) return 0;
  const pick = (v) => (Array.isArray(v) ? Number(v[0]) : typeof v === 'object' && v ? Number(v.min_inclusive) : Number(v));
  return pick(p.pack_format) || pick(p.min_format) || pick(p.max_format) || 0;
}

export function javaDescription(mcmeta) {
  const d = mcmeta && mcmeta.pack ? mcmeta.pack.description : '';
  return textComponentToString(d).trim();
}

/** Liest ein Java-Ressourcenpaket (Dateien relativ zum Paket-Ordner) ins Zwischenformat. */
export function readJavaRP(files, name = '') {
  const canon = newCanon();
  canon.source = 'java';
  const mcmeta = files.has('pack.mcmeta') ? parseJson(files.get('pack.mcmeta')) : null;
  canon.format = javaPackFormat(mcmeta) || 0;
  canon.meta.name = name;
  canon.meta.description = javaDescription(mcmeta);
  const legacyPack = canon.format > 0 && canon.format <= 3;
  const mcmetas = new Map();

  for (const [p, data] of files) {
    if (p === 'pack.mcmeta') continue;
    if (p === 'pack.png') {
      canon.meta.icon = data;
      continue;
    }
    const m = p.match(/^assets\/minecraft\/(.+)$/);
    if (!m) {
      canon.passthrough.set(p, data);
      continue;
    }
    const rest = m[1];
    if (rest.startsWith('textures/')) {
      const t = rest.slice('textures/'.length);
      if (t.endsWith('.png.mcmeta')) {
        mcmetas.set(t.slice(0, -'.mcmeta'.length), data);
        continue;
      }
      if (extname(t) !== 'png') {
        canon.javaOther.set(rest, data);
        continue;
      }
      const tex = classifyJavaTexture(t.slice(0, -4), legacyPack);
      putTex(canon, { ...tex, data, ext: 'png', src: t, mcmeta: null, anim: null });
      continue;
    }
    if (rest.startsWith('sounds/') && extname(rest) === 'ogg') {
      canon.sounds.set(stripExt(rest.slice('sounds/'.length)), data);
      continue;
    }
    canon.javaOther.set(rest, data);
  }
  for (const tex of canon.textures.values()) {
    const mm = mcmetas.get(tex.src);
    if (!mm) continue;
    tex.mcmeta = mm;
    const j = parseJson(mm);
    if (j && j.animation) tex.anim = j.animation;
  }
  return canon;
}

function classifyJavaTexture(t, legacyPack) {
  const segs = t.split('/');
  const folder = segs[0];
  const rest = segs.slice(1).join('/');
  if (folder === 'block' || folder === 'blocks') {
    return { cat: 'block', name: folder === 'blocks' || legacyPack ? legacyToFlat('block', rest) : upgradeFlat('block', rest) };
  }
  if (folder === 'item' || folder === 'items') {
    return { cat: 'item', name: folder === 'items' || legacyPack ? legacyToFlat('item', rest) : upgradeFlat('item', rest) };
  }
  if (folder === 'entity') {
    if (segs[1] === 'equipment' && segs.length === 4) {
      const armor = armorFromJavaEquipment(segs[2], segs[3]);
      if (armor) return { cat: 'armor', name: armor };
    }
    return { cat: 'entity', name: upgradeFlat('entity', rest) };
  }
  if (folder === 'models' && segs[1] === 'armor' && segs.length === 3) return { cat: 'armor', name: segs[2] };
  if (folder === 'environment') return { cat: 'environment', name: rest };
  if (folder === 'colormap') return { cat: 'colormap', name: rest };
  if (folder === 'misc') return { cat: 'misc', name: upgradeFlat('misc', rest) };
  if (folder === 'font') return { cat: 'font', name: rest };
  return { cat: 'other', name: t };
}

// ---------- Bedrock lesen ----------
function readLang(bytes) {
  const out = {};
  if (!bytes) return out;
  for (const line of toText(bytes).split(/\r?\n/)) {
    const s = line.replace(/\t*##.*$/, '');
    const i = s.indexOf('=');
    if (i > 0) out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

/** Name/Beschreibung aus manifest.json, auch wenn sie als Sprach-Schlüssel ("pack.name") angegeben sind. */
export function bedrockHeader(files, manifest) {
  const h = (manifest && manifest.header) || {};
  const lang = readLang(files.get('texts/en_US.lang') || files.get('texts/de_DE.lang'));
  const resolve = (v) => (typeof v === 'string' && lang[v] ? lang[v] : v || '');
  return { name: String(resolve(h.name)), description: String(resolve(h.description)), version: h.version, uuid: h.uuid };
}

/** Liest ein Bedrock-Ressourcenpaket ins Zwischenformat. */
export function readBedrockRP(files, report) {
  const canon = newCanon();
  canon.source = 'bedrock';
  const manifest = parseJson(files.get('manifest.json'));
  const head = bedrockHeader(files, manifest);
  canon.meta.name = head.name;
  canon.meta.description = head.description;

  // Unterpakete (z. B. Auflösungen): das erste wird über das Hauptpaket gelegt
  let all = files;
  const subs = manifest && Array.isArray(manifest.subpacks) ? manifest.subpacks : [];
  if (subs.length && subs[0].folder_name) {
    const prefix = 'subpacks/' + subs[0].folder_name + '/';
    all = new Map();
    for (const [k, v] of files) if (!k.startsWith('subpacks/')) all.set(k, v);
    for (const [k, v] of files) if (k.startsWith(prefix)) all.set(k.slice(prefix.length), v);
    if (report) report.info('Unterpaket verwendet', `"${subs[0].name || subs[0].folder_name}" (von ${subs.length})`);
  }

  const flip = new Map();
  const fb = parseJson(all.get('textures/flipbook_textures.json'));
  if (Array.isArray(fb)) {
    for (const f of fb) if (f && f.flipbook_texture) flip.set(f.flipbook_texture, { frametime: Number(f.ticks_per_frame) || 1 });
  }

  for (const [p, data] of all) {
    if (p === 'manifest.json') continue;
    if (p === 'pack_icon.png') {
      canon.meta.icon = data;
      continue;
    }
    if (p.startsWith('subpacks/')) continue;
    const ext = extname(p);
    const noExt = stripExt(p);
    let m;
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/(blocks|items)\/(.+)$/))) {
      const cat = m[1] === 'blocks' ? 'block' : 'item';
      if (bedrockOnly(cat, m[2])) {
        canon.skipped.set(p, 'Nur-Bedrock-Variante');
        continue;
      }
      putTex(canon, { cat, name: bedrockToFlat(cat, m[2]), data, ext, src: p, anim: flip.get(noExt) || null, mcmeta: null });
      continue;
    }
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/entity\/(.+)$/))) {
      putTex(canon, { cat: 'entity', name: ENTITY_FROM_BEDROCK[m[1]] || m[1], data, ext, src: p });
      continue;
    }
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/models\/armor\/([\w]+)$/))) {
      const name = armorFromBedrock(m[1]);
      if (name) putTex(canon, { cat: 'armor', name, data, ext, src: p });
      else canon.skipped.set(p, 'Rüstung');
      continue;
    }
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/environment\/(destroy_stage_\d)$/))) {
      putTex(canon, { cat: 'block', name: m[1], data, ext, src: p });
      continue;
    }
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/environment\/(\w+)$/)) && ENVIRONMENT.has(m[1])) {
      putTex(canon, { cat: 'environment', name: m[1], data, ext, src: p });
      continue;
    }
    if (ext === 'png' && (m = noExt.match(/^textures\/colormap\/(\w+)$/))) {
      putTex(canon, { cat: 'colormap', name: m[1], data, ext, src: p });
      continue;
    }
    if ((ext === 'png' || ext === 'tga') && (m = noExt.match(/^textures\/misc\/(\w+)$/)) && MISC_FROM_BEDROCK[m[1]]) {
      putTex(canon, { cat: 'misc', name: MISC_FROM_BEDROCK[m[1]], data, ext, src: p });
      continue;
    }
    if (ext === 'png' && (m = noExt.match(/^font\/(\w+)$/)) && fontFromBedrock(m[1])) {
      putTex(canon, { cat: 'font', name: fontFromBedrock(m[1]), data, ext, src: p });
      continue;
    }
    if ((m = noExt.match(/^sounds\/(.+)$/)) && (ext === 'ogg' || ext === 'fsb' || ext === 'wav')) {
      if (ext === 'ogg') canon.sounds.set(soundFromBedrock(m[1]), data);
      else canon.skipped.set(p, 'Sound-Format .' + ext);
      continue;
    }
    canon.skipped.set(p, 'bedrock');
  }
  return canon;
}

// ---------- Hilfen für Bilder ----------
function frameInfo(tex) {
  if (!tex.anim || tex.ext !== 'png') return null;
  const size = pngSize(tex.data);
  if (!size) return null;
  const fw = Number(tex.anim.width) || size.width;
  const fh = Number(tex.anim.height) || fw;
  if (size.height <= fh) return null;
  let first = 0;
  if (Array.isArray(tex.anim.frames) && tex.anim.frames.length) {
    const f = tex.anim.frames[0];
    first = typeof f === 'number' ? f : Number(f && f.index) || 0;
  }
  const perRow = Math.max(1, Math.floor(size.width / fw));
  return { x: (first % perRow) * fw, y: Math.floor(first / perRow) * fh, w: fw, h: fh };
}

function firstFrame(tex) {
  const fi = frameInfo(tex);
  if (!fi) return tex.data;
  return encodePng(crop(decodePng(tex.data), fi.x, fi.y, fi.w, fi.h));
}

function transformed(tex, spec, cropFirst) {
  const img0 = decodeImage(tex.data, tex.ext);
  const fi = cropFirst ? frameInfo(tex) : null;
  const img = fi ? crop(img0, fi.x, fi.y, fi.w, fi.h) : img0;
  if (spec.tint) return encodePng(tint(img, spec.tint));
  if (spec.opaque) return encodePng(makeOpaque(img));
  return encodePng(img);
}

function pngData(tex) {
  if (tex.ext === 'png' && isPng(tex.data)) return tex.data;
  return encodePng(decodeImage(tex.data, tex.ext));
}

const SKIP_TITLES = {
  gui: 'Menü-Grafiken (gui/) – Bedrock baut seine Menüs anders auf',
  particle: 'Partikel-Bilder – Bedrock nutzt dafür eine Sammeldatei',
  painting: 'Gemälde – Bedrock nutzt dafür eine Sammeldatei',
  mob_effect: 'Effekt-Symbole',
  trims: 'Rüstungsverzierungen (trims)',
  map: 'Karten-Symbole',
};

// ---------- Bedrock schreiben ----------
/** Zwischenformat -> Dateien eines Bedrock-Ressourcenpakets (Map Pfad -> Bytes). */
export function writeBedrockRP(canon, opts, report) {
  const files = new Map();
  const headerUuid = opts.uuid || uuid();
  files.set('manifest.json', jsonBytes({
    format_version: 2,
    header: {
      name: opts.name,
      description: opts.description || '',
      uuid: headerUuid,
      version: [1, 0, 0],
      min_engine_version: opts.minEngine || BEDROCK_RP_MIN_ENGINE,
    },
    modules: [{ type: 'resources', uuid: uuid(), version: [1, 0, 0] }],
    ...(opts.dependencies ? { dependencies: opts.dependencies } : {}),
  }));
  if (canon.meta.icon && isPng(canon.meta.icon)) files.set('pack_icon.png', canon.meta.icon);

  const put = (path, data) => {
    if (!files.has(path)) files.set(path, data);
  };
  writeBedrockTextures(canon, put, report);
  let sounds = 0;
  for (const [p, data] of canon.sounds) {
    put('sounds/' + soundToBedrock(p) + '.ogg', data);
    sounds++;
  }
  if (sounds) report.ok('Sounds übernommen', `${sounds} Dateien (.ogg)`);
  reportJavaLeftovers(canon, report);
  return files;
}

/** Schreibt alle Texturen des Zwischenformats mit Bedrock-Namen (put(pfad, bytes)). */
export function writeBedrockTextures(canon, put, report) {
  for (const tex of canon.textures.values()) {
    try {
      writeBedrockTexture(tex, put, report);
    } catch (e) {
      report.warn('Texturen, die nicht gelesen werden konnten (unverändert übernommen)', tex.src);
      if (tex.cat === 'block' || tex.cat === 'item') {
        const { specs } = flatToBedrock(tex.cat, tex.name);
        if (specs.length && typeof specs[0] === 'string') put(`textures/${tex.cat === 'block' ? 'blocks' : 'items'}/${specs[0]}.${tex.ext}`, tex.data);
      }
    }
  }
}

function writeBedrockTexture(tex, put, report) {
  const { cat, name } = tex;
  if (cat === 'block' || cat === 'item') {
    const folder = cat === 'block' ? 'textures/blocks/' : 'textures/items/';
    const kind = cat === 'block' ? 'Block' : 'Item';
    const r = javaToBedrock(cat, name);
    if (r.none) {
      report.skip(name === 'grass_block_side' || name === 'grass_block_side_overlay' ? 'Gras-Seite (Bedrock färbt sie über eine eigene Maske – bleibt wie im Standard)' : `${kind}-Texturen ohne Gegenstück in Bedrock`, tex.src);
      return;
    }
    const primary = specName(r.specs[0]);
    const animated = !!frameInfo(tex);
    const keepStrip = animated && BEDROCK_FLIPBOOKS.has(primary);
    r.specs.forEach((spec, i) => {
      const obj = typeof spec === 'object';
      const target = obj && spec.path ? spec.path : folder + specName(spec);
      let data;
      if (obj && (spec.tint || spec.opaque)) data = transformed(tex, spec, animated);
      else if (animated && !(i === 0 && keepStrip)) data = firstFrame(tex);
      else data = tex.data;
      put(target + '.' + (obj && (spec.tint || spec.opaque) ? 'png' : tex.ext), data);
    });
    if (animated && !keepStrip) report.info('Animationen auf das erste Bild gekürzt (Bedrock animiert diese Textur nicht)', tex.src);
    if (!r.known) report.info(`${kind}-Texturen ohne bekanntes Gegenstück in Bedrock (unter gleichem Namen abgelegt)`, name);
    else if (r.mapped) report.ok(`${kind}-Texturen umbenannt und übernommen`, `${name} → ${primary}`);
    else report.ok(`${kind}-Texturen mit gleichem Namen übernommen`, name);
    return;
  }
  if (cat === 'armor') {
    const p = armorToBedrock(name);
    if (p) {
      put(p + '.png', pngData(tex));
      report.ok('Rüstungs-Texturen übernommen', name);
    } else report.skip('Rüstungs-Overlays ohne Gegenstück in Bedrock', tex.src);
    return;
  }
  if (cat === 'entity') {
    if (name.startsWith('equipment/')) {
      report.skip('Ausrüstungs-Texturen ohne Gegenstück in Bedrock (Flügel, Pferde-/Wolfsrüstung …)', tex.src);
      return;
    }
    put('textures/entity/' + (ENTITY_TO_BEDROCK[name] || name) + '.png', tex.data);
    report.ok('Kreaturen-Texturen übernommen (der Bildaufbau kann sich je nach Kreatur unterscheiden)', name);
    return;
  }
  if (cat === 'environment') {
    const b = basename(name);
    if (ENVIRONMENT.has(b)) {
      put('textures/environment/' + b + '.png', tex.data);
      report.ok('Himmel & Umgebung übernommen', b);
    } else report.skip('Umgebungs-Bilder ohne Gegenstück in Bedrock', tex.src);
    return;
  }
  if (cat === 'colormap') {
    put('textures/colormap/' + name + '.png', tex.data);
    report.ok('Farbtabellen (Gras/Laub) übernommen', name);
    return;
  }
  if (cat === 'misc') {
    if (MISC_TO_BEDROCK[name]) {
      put('textures/misc/' + MISC_TO_BEDROCK[name] + '.png', tex.data);
      report.ok('Sonstige Effekt-Bilder übernommen', name);
    } else report.skip('Sonstige Bilder ohne Gegenstück in Bedrock', tex.src);
    return;
  }
  if (cat === 'font') {
    const p = fontToBedrock(name);
    if (p) {
      put(p + '.png', tex.data);
      report.ok('Schrift übernommen', name);
    } else report.skip('Schrift-Bilder ohne Gegenstück in Bedrock', tex.src);
    return;
  }
  const folder = name.split('/')[0];
  report.skip(SKIP_TITLES[folder] || `Bilder ohne Gegenstück in Bedrock (${folder}/)`, tex.src);
}

function reportJavaLeftovers(canon, report) {
  const groups = {
    models: 'Block- und Item-Modelle (models/) – Bedrock nutzt ein anderes Modellformat',
    blockstates: 'Blockzustände (blockstates/)',
    lang: 'Sprachdateien (lang/)',
    shaders: 'Shader (shaders/)',
    font: 'Schrift-Definitionen (font/*.json)',
    texts: 'Texte (texts/)',
    atlases: 'Atlas-Definitionen (atlases/)',
    items: 'Item-Definitionen (items/)',
    equipment: 'Ausrüstungs-Definitionen (equipment/)',
    particles: 'Partikel-Definitionen (particles/)',
    'sounds.json': 'sounds.json – Bedrock nutzt die eigenen Sound-Definitionen',
  };
  for (const p of canon.javaOther.keys()) {
    const top = p.split('/')[0];
    if (top === 'textures') report.skip('Zusatzdateien zu Texturen (z. B. OptiFine .properties)', p);
    else report.skip(groups[top] || 'Sonstige Java-Dateien', p);
  }
  for (const p of canon.passthrough.keys()) {
    if (/^assets\/[^/]+\//.test(p)) report.skip('Dateien anderer Namensräume (Mods, OptiFine …)', p);
    else if (!/^(readme|license|credits)/i.test(basename(p))) report.skip('Sonstige Dateien', p);
  }
}

// ---------- Java schreiben ----------
/** Zwischenformat -> Dateien eines Java-Ressourcenpakets für das Format "version.rp". */
export function writeJavaRP(canon, version, opts, report) {
  const fmt = version.rp;
  const files = new Map();
  const legacyOut = fmt <= 3;
  const crossLegacy = canon.source === 'java' && legacyOut !== (canon.format > 0 && canon.format <= 3);
  const desc = opts.description || canon.meta.description || opts.name || 'BlockBridge';
  files.set('pack.mcmeta', jsonBytes(packMcmeta(desc, fmt, 69)));
  if (canon.meta.icon && isPng(canon.meta.icon)) files.set('pack.png', canon.meta.icon);

  const put = (path, data) => {
    if (!files.has(path)) files.set(path, data);
  };
  const T = 'assets/minecraft/textures/';

  for (const tex of canon.textures.values()) {
    let rel = null;
    const { cat, name } = tex;
    if (cat === 'block' || cat === 'item') {
      const n = legacyOut ? flatToLegacyJava(cat, name) : downgradeFlat(cat, name, fmt);
      rel = (legacyOut ? (cat === 'block' ? 'blocks' : 'items') : cat) + '/' + n;
      if (canon.source === 'bedrock') {
        const orig = stripExt(tex.src).replace(/^textures\/(blocks|items|environment)\//, '');
        const kind = cat === 'block' ? 'Block' : 'Item';
        if (!bedrockToJava(cat, orig).known && !legacyOut) report.info(`${kind}-Texturen ohne bekanntes Gegenstück in Java (unter gleichem Namen abgelegt)`, orig);
        else if (orig !== n) report.ok(`${kind}-Texturen umbenannt und übernommen`, `${orig} → ${n}`);
        else report.ok(`${kind}-Texturen mit gleichem Namen übernommen`, n);
      } else report.ok(cat === 'block' ? 'Block-Texturen übernommen' : 'Item-Texturen übernommen', n);
    } else if (cat === 'armor') {
      rel = armorToJava(name, fmt);
      if (rel) report.ok('Rüstungs-Texturen übernommen', name);
    } else if (cat === 'entity') {
      rel = 'entity/' + downgradeFlat('entity', name, fmt);
      report.ok(canon.source === 'bedrock' ? 'Kreaturen-Texturen übernommen (der Bildaufbau kann sich je nach Kreatur unterscheiden)' : 'Kreaturen-Texturen übernommen', name);
    } else if (cat === 'environment') {
      rel = 'environment/' + name;
      report.ok('Himmel & Umgebung übernommen', name);
    } else if (cat === 'colormap') {
      rel = 'colormap/' + name;
      report.ok('Farbtabellen (Gras/Laub) übernommen', name);
    } else if (cat === 'misc') {
      rel = 'misc/' + downgradeFlat('misc', name, fmt);
      report.ok('Sonstige Effekt-Bilder übernommen', name);
    } else if (cat === 'font') {
      rel = 'font/' + name;
      report.ok('Schrift übernommen', name);
    } else if (cat === 'other') {
      rel = name;
      report.ok('Weitere Texturen übernommen', name);
    }
    if (!rel) {
      report.skip('Texturen ohne Gegenstück', tex.src);
      continue;
    }
    let data;
    try {
      data = pngData(tex);
    } catch {
      report.warn('TGA-Bilder, die nicht gelesen werden konnten', tex.src);
      continue;
    }
    put(T + rel + '.png', data);
    if (tex.mcmeta) put(T + rel + '.png.mcmeta', tex.mcmeta);
    else if (canon.source === 'bedrock') {
      const flat = cat === 'block' ? name : null;
      const size = pngSize(data);
      const strip = size && size.height > size.width && size.height % size.width === 0;
      if (strip && (tex.anim || (flat && JAVA_ANIMATED[flat]))) {
        put(T + rel + '.png.mcmeta', jsonBytes({ animation: { frametime: tex.anim ? tex.anim.frametime : JAVA_ANIMATED[flat] } }));
        report.ok('Animationen übernommen', rel);
      }
    }
  }

  let sounds = 0;
  for (const [p, data] of canon.sounds) {
    put('assets/minecraft/sounds/' + p + '.ogg', data);
    sounds++;
  }
  if (sounds) report.ok('Sounds übernommen', `${sounds} Dateien (.ogg)`);

  if (canon.source === 'java') {
    for (const [p, data] of canon.javaOther) {
      if (crossLegacy && !p.startsWith('lang/') && !p.startsWith('texts/')) report.skip('Modelle & Blockzustände (Format hat sich mit 1.13 geändert)', p);
      else put('assets/minecraft/' + p, data);
    }
    for (const [p, data] of canon.passthrough) put(p, data);
    if (!crossLegacy && canon.javaOther.size) report.info('Modelle, Sprachdateien und sonstige Dateien unverändert übernommen', `${canon.javaOther.size} Dateien`);
  } else {
    reportBedrockLeftovers(canon, report);
  }
  return files;
}

function reportBedrockLeftovers(canon, report) {
  const groups = {
    ui: 'Menü-Dateien (ui/) – Java baut seine Menüs anders auf',
    models: 'Modelle (models/) – Java nutzt ein anderes Modellformat',
    entity: 'Kreaturen-Definitionen (entity/)',
    render_controllers: 'Render-Controller',
    animations: 'Animationen',
    animation_controllers: 'Animations-Controller',
    particles: 'Partikel',
    attachables: 'Attachables',
    materials: 'Materialien',
    texts: 'Sprachdateien (texts/)',
    fogs: 'Nebel-Einstellungen',
    shaders: 'Shader',
    sounds: 'Sound-Definitionen',
    font: 'Schrift-Dateien',
  };
  for (const [p, why] of canon.skipped) {
    if (why === 'Nur-Bedrock-Variante') {
      report.info('Nur-Bedrock-Varianten ausgelassen (Inventar-/Laub-Varianten, die Java selbst erzeugt)', p);
      continue;
    }
    if (why.startsWith('Sound-Format')) {
      report.skip('Sounds im Format .fsb/.wav (Java braucht .ogg)', p);
      continue;
    }
    const top = p.split('/')[0];
    if (top === 'textures') {
      const sub = p.split('/')[1] || '';
      if (/\.json$/.test(p)) report.skip('Textur-Listen (*.json) – braucht Java nicht', p);
      else if (sub === 'ui' || sub === 'gui') report.skip('Menü-Grafiken (textures/ui) – Java baut seine Menüs anders auf', p);
      else if (sub === 'particle') report.skip('Partikel-Bilder', p);
      else report.skip('Bilder ohne Gegenstück in Java', p);
      continue;
    }
    if (p.endsWith('.json') && !p.includes('/')) {
      report.skip('Bedrock-Einstellungsdateien (*.json)', p);
      continue;
    }
    report.skip(groups[top] || 'Sonstige Bedrock-Dateien', p);
  }
}

/** Anzahl Texturen pro Kategorie (für die Anzeige). */
export function canonStats(canon) {
  const c = {};
  for (const t of canon.textures.values()) c[t.cat] = (c[t.cat] || 0) + 1;
  return { ...c, sounds: canon.sounds.size };
}

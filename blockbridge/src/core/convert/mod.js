// Java-Mods (Forge, NeoForge, Fabric, Quilt) -> Bedrock-Add-on.
//
// Eine Mod ist Java-Programmcode; der lässt sich nicht automatisch übersetzen. Übertragen werden
// die Teile, die als Daten in der .jar liegen: Item- und Block-Texturen und -Namen, einfache
// Blockformen und die Rezepte. Daraus entstehen echte Bedrock-Items und -Blöcke.

import { alphaKind, crop, decodePng, encodePng, isPng, pngSize } from '../image.js';
import { humanize, jsonBytes, parseJson, safeId, toBytes, toText, uuid, basename, stripExt } from '../util.js';
import { flatToBedrock, readJavaRP, writeBedrockTextures } from './resourcepack.js';
import { writeBedrockRecipes } from './datapack.js';
import { bedrockManifest } from './datapack.js';
import { BEDROCK_ADDON_MIN_ENGINE } from '../versions.js';

const BEDROCK_LANGS = new Set(['en_US', 'en_GB', 'de_DE', 'es_ES', 'es_MX', 'fr_FR', 'fr_CA', 'it_IT', 'ja_JP', 'ko_KR', 'pt_BR', 'pt_PT', 'ru_RU',
  'zh_CN', 'zh_TW', 'nl_NL', 'bg_BG', 'cs_CZ', 'da_DK', 'el_GR', 'fi_FI', 'hu_HU', 'id_ID', 'nb_NO', 'pl_PL', 'sk_SK', 'sv_SE', 'tr_TR', 'uk_UA']);
const IGNORED_NS = new Set(['minecraft', 'realms', 'fabric', 'fabric-api', 'forge', 'neoforge', 'c']);

// ---------- Metadaten ----------
function tomlValue(text, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:[^"\\\\]|\\\\.)*"|'[^']*')`, 'm');
  const m = text.match(re);
  if (!m) return null;
  let v = m[1];
  if (v.startsWith('"""') || v.startsWith("'''")) return v.slice(3, -3).trim();
  v = v.slice(1, -1);
  return m[1][0] === '"' ? v.replace(/\\"/g, '"').replace(/\\n/g, '\n') : v;
}

function readManifestVersion(files) {
  const mf = files.get('META-INF/MANIFEST.MF');
  if (!mf) return null;
  const m = toText(mf).match(/^Implementation-Version:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Erkennt, ob die .jar eine Mod ist, und liest Name, Version usw. */
export function readModMeta(files) {
  let meta = null;
  if (files.has('fabric.mod.json')) {
    const j = parseJson(files.get('fabric.mod.json')) || {};
    meta = {
      loader: 'Fabric', id: j.id, name: j.name || j.id, version: j.version, description: j.description || '',
      authors: (j.authors || []).map((a) => (typeof a === 'string' ? a : a && a.name)).filter(Boolean),
      icon: typeof j.icon === 'string' ? j.icon : j.icon && typeof j.icon === 'object' ? Object.values(j.icon).pop() : null,
    };
  } else if (files.has('quilt.mod.json')) {
    const j = (parseJson(files.get('quilt.mod.json')) || {}).quilt_loader || {};
    const md = j.metadata || {};
    meta = { loader: 'Quilt', id: j.id, name: md.name || j.id, version: j.version, description: md.description || '', authors: Object.keys(md.contributors || {}), icon: typeof md.icon === 'string' ? md.icon : null };
  } else if (files.has('META-INF/neoforge.mods.toml') || files.has('META-INF/mods.toml')) {
    const neo = files.has('META-INF/neoforge.mods.toml');
    const text = toText(files.get(neo ? 'META-INF/neoforge.mods.toml' : 'META-INF/mods.toml'));
    const i = text.search(/^\s*\[\[mods\]\]/m);
    const sec = i >= 0 ? text.slice(i).replace(/^\s*\[\[mods\]\]/, '').split(/^\s*\[/m)[0] : text;
    let version = tomlValue(sec, 'version');
    if (!version || version.includes('${')) version = readManifestVersion(files) || '';
    const logo = tomlValue(sec, 'logoFile') || tomlValue(text, 'logoFile');
    meta = {
      loader: neo ? 'NeoForge' : 'Forge', id: tomlValue(sec, 'modId'), name: tomlValue(sec, 'displayName'), version, description: tomlValue(sec, 'description') || '',
      authors: (tomlValue(sec, 'authors') || '').split(/,\s*/).filter(Boolean), icon: logo,
    };
  } else if (files.has('mcmod.info')) {
    let j = parseJson(files.get('mcmod.info'));
    if (j && !Array.isArray(j)) j = j.modList || j.modlist || [];
    const m = (j && j[0]) || {};
    meta = { loader: 'Forge (alt, bis 1.12)', id: m.modid, name: m.name || m.modid, version: m.version, description: m.description || '', authors: m.authorList || m.authors || [], icon: m.logoFile || null };
  }
  if (!meta) return null;
  if (meta.name && meta.name.includes('${')) meta.name = null;
  if (!meta.name) meta.name = meta.id ? humanize(meta.id) : 'Mod';
  if (meta.icon) {
    const p = String(meta.icon).replace(/^\//, '');
    const icon = files.get(p) || files.get('assets/' + (meta.id || '') + '/' + p);
    meta.iconData = icon && isPng(icon) ? icon : null;
  }
  return meta;
}

// ---------- Modelle ----------
function splitRef(ref, defNs = 'minecraft') {
  const s = String(ref || '');
  const i = s.indexOf(':');
  return i < 0 ? [defNs, s] : [s.slice(0, i), s.slice(i + 1)];
}

function makeModelReader(files) {
  const cache = new Map();
  const get = (ref) => {
    const [n, p] = splitRef(ref);
    const key = n + ':' + p;
    if (cache.has(key)) return cache.get(key);
    let raw = files.get(`assets/${n}/models/${p}.json`);
    if (!raw && !p.includes('/')) raw = files.get(`assets/${n}/models/block/${p}.json`) || files.get(`assets/${n}/models/item/${p}.json`);
    const m = raw ? parseJson(raw) : null;
    cache.set(key, m);
    return m;
  };
  return (ref) => {
    const chain = [];
    let textures = {};
    let elements = null;
    let cur = ref;
    for (let depth = 0; cur && depth < 16; depth++) {
      const [n, p] = splitRef(cur);
      chain.push(`${n}:${p}`);
      const m = get(cur);
      if (!m) break;
      textures = { ...(m.textures || {}), ...textures };
      if (!elements && Array.isArray(m.elements)) elements = { owner: `${n}:${p}`, list: m.elements };
      cur = m.parent;
    }
    return { chain, textures, elements };
  };
}

function resolveTex(textures, key) {
  let v = textures[key];
  for (let i = 0; i < 8 && typeof v === 'string' && v.startsWith('#'); i++) v = textures[v.slice(1)];
  return typeof v === 'string' && !v.startsWith('#') ? v : null;
}

const has = (chain, re) => chain.some((c) => re.test(c));

function blockShape(r) {
  const c = r.chain;
  const T = (k) => resolveTex(r.textures, k);
  if (has(c, /^minecraft:(block\/)?(cube_all|leaves|cube_mirrored_all)$/)) return { shape: 'cube', faces: { '*': T('all') } };
  if (has(c, /^minecraft:(block\/)?cube_column(_horizontal|_mirrored)?$/)) return { shape: 'cube', faces: { '*': T('side'), up: T('end'), down: T('end') } };
  if (has(c, /^minecraft:(block\/)?cube_bottom_top$/)) return { shape: 'cube', faces: { '*': T('side'), up: T('top'), down: T('bottom') } };
  if (has(c, /^minecraft:(block\/)?orientable(_with_bottom|_vertical)?$/)) return { shape: 'cube', faces: { '*': T('side'), up: T('top'), down: T('bottom') || T('top'), north: T('front') }, oriented: true };
  if (has(c, /^minecraft:(block\/)?cube_top$/)) return { shape: 'cube', faces: { '*': T('side'), up: T('top'), down: T('side') } };
  if (has(c, /^minecraft:(block\/)?(cross|tinted_cross|crop)$/)) return { shape: 'cross', faces: { '*': T('cross') || T('crop') } };
  if (has(c, /^minecraft:(block\/)?(cube|cube_directional)$/) && !r.elements) {
    const f = { '*': T('north') || T('particle'), up: T('up'), down: T('down'), north: T('north'), south: T('south'), east: T('east'), west: T('west') };
    return { shape: 'cube', faces: f };
  }
  // Andere Formen (Stufen, Treppen, Zäune, eigene Modelle …): als ganzer Block mit der passendsten Textur
  const any = T('side') || T('all') || T('texture') || T('particle') || T('top') || Object.keys(r.textures).map((k) => resolveTex(r.textures, k)).find(Boolean);
  return { shape: 'cube', faces: { '*': any }, simplified: true };
}

// ---------- Mod lesen ----------
export function readMod(files) {
  const meta = readModMeta(files);
  if (!meta) return null;
  const readModel = makeModelReader(files);
  const namespaces = new Set();
  for (const p of files.keys()) {
    const m = p.match(/^assets\/([^/]+)\/(textures|models|blockstates|lang|items)\//);
    if (m && !IGNORED_NS.has(m[1])) namespaces.add(m[1]);
  }
  const langs = {}; // ns -> { code -> {key: value} }
  for (const ns of namespaces) {
    langs[ns] = {};
    for (const [p, data] of files) {
      const m = p.match(new RegExp(`^assets/${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/lang/([a-zA-Z_]+)\\.(json|lang)$`));
      if (!m) continue;
      const code = m[1].toLowerCase();
      let table = {};
      if (m[2] === 'json') table = parseJson(data) || {};
      else for (const line of toText(data).split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i > 0 && !line.startsWith('#')) table[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      langs[ns][code] = { ...(langs[ns][code] || {}), ...table };
    }
  }

  const items = [];
  const blocks = [];
  const seenItems = new Set();
  for (const ns of namespaces) {
    const en = langs[ns].en_us || {};
    const hasLangKeys = Object.keys(en).some((k) => k.startsWith(`item.${ns}.`) || k.startsWith(`block.${ns}.`));
    const nameFor = (kind, id) => {
      const keys = kind === 'item' ? [`item.${ns}.${id}`, `item.${id}.name`, `item.${ns}.${id}.name`, `item.${ns}:${id}.name`] : [`block.${ns}.${id}`, `tile.${id}.name`, `tile.${ns}.${id}.name`, `tile.${ns}:${id}.name`];
      const per = {};
      for (const [code, table] of Object.entries(langs[ns])) {
        for (const k of keys) if (table[k]) {
          per[code] = table[k];
          break;
        }
      }
      return { key: `${kind === 'item' ? 'item' : 'block'}.${ns}.${id}`, en: per.en_us || humanize(id), per, known: !!per.en_us };
    };

    // Blöcke aus blockstates/
    const blockIds = new Set();
    for (const [p, data] of files) {
      const m = p.match(new RegExp(`^assets/${ns.replace(/[.]/g, '\\.')}/blockstates/([a-z0-9_.-]+)\\.json$`));
      if (!m) continue;
      const id = m[1];
      const bs = parseJson(data);
      let modelRef = null;
      let extraTextures = null;
      if (bs && bs.forge_marker && bs.defaults) {
        // altes Forge-Format (bis 1.12): Modell und Texturen stehen in "defaults"
        modelRef = bs.defaults.model;
        extraTextures = bs.defaults.textures || null;
      } else if (bs && bs.variants) {
        const v = Object.values(bs.variants)[0];
        modelRef = Array.isArray(v) ? v[0] && v[0].model : v && v.model;
      } else if (bs && Array.isArray(bs.multipart) && bs.multipart.length) {
        const a = bs.multipart[0].apply;
        modelRef = Array.isArray(a) ? a[0] && a[0].model : a && a.model;
      }
      if (!modelRef) continue;
      if (!String(modelRef).includes(':') && !String(modelRef).includes('/')) modelRef = `${ns}:block/${modelRef}`;
      const r = readModel(modelRef);
      if (extraTextures) r.textures = { ...r.textures, ...extraTextures };
      const shape = blockShape(r);
      if (!shape.faces['*']) continue;
      blockIds.add(id);
      blocks.push({ ns, id, ...shape, name: nameFor('block', id), multi: bs.multipart ? true : Object.keys(bs.variants || {}).length > 1 });
    }

    // Items aus models/item/ und (ab 1.21.4) items/
    const candidates = new Map();
    for (const p of files.keys()) {
      let m = p.match(new RegExp(`^assets/${ns.replace(/[.]/g, '\\.')}/models/item/([a-z0-9_.-]+)\\.json$`));
      if (m) candidates.set(m[1], `${ns}:item/${m[1]}`);
    }
    for (const [p, data] of files) {
      const m = p.match(new RegExp(`^assets/${ns.replace(/[.]/g, '\\.')}/items/([a-z0-9_.-]+)\\.json$`));
      if (!m) continue;
      const s = toText(data).match(/"model"\s*:\s*"([^"]+)"/);
      if (s) candidates.set(m[1], s[1]);
    }
    for (const [id, ref] of candidates) {
      if (blockIds.has(id) || seenItems.has(ns + ':' + id)) continue;
      const nm = nameFor('item', id);
      if (hasLangKeys && !nm.known && !en[`block.${ns}.${id}`]) continue;
      const r = readModel(ref);
      if (has(r.chain, /:block\//)) continue; // Block-Item ohne Blockzustand
      const layer0 = resolveTex(r.textures, 'layer0');
      if (!layer0) {
        items.push({ ns, id, skip: has(r.chain, /builtin\/entity/) ? 'Items mit eigenem 3D-Modell (brauchen Programmcode)' : 'Items ohne eigene Textur', name: nm });
        continue;
      }
      seenItems.add(ns + ':' + id);
      items.push({
        ns, id, tex: layer0, layers: !!resolveTex(r.textures, 'layer1'), handheld: has(r.chain, /item\/handheld/), name: nm,
        armor: /_(helmet|chestplate|leggings|boots)$/.test(id),
      });
    }
  }

  const recipes = new Map();
  for (const [p, data] of files) {
    const m = p.match(/^data\/([^/]+)\/recipes?\/(.+)\.json$/) || p.match(/^assets\/([^/]+)\/recipes\/(.+)\.json$/);
    if (!m) continue;
    const j = parseJson(data);
    if (j && j.type) recipes.set(`${m[1]}:${m[2]}`, j);
  }
  let classes = 0, entityTextures = 0, sounds = 0;
  for (const p of files.keys()) {
    if (p.endsWith('.class')) classes++;
    else if (/^assets\/[^/]+\/textures\/entity\//.test(p)) entityTextures++;
    else if (/^assets\/[^/]+\/sounds\//.test(p) && p.endsWith('.ogg')) sounds++;
  }
  const vanillaOverrides = [...files.keys()].filter((p) => p.startsWith('assets/minecraft/textures/')).length;
  return { meta, namespaces: [...namespaces], items, blocks, recipes, langs, classes, entityTextures, sounds, vanillaOverrides };
}

// ---------- Bedrock-Add-on schreiben ----------
function texFile(files, ref) {
  const [n, p] = splitRef(ref);
  return files.get(`assets/${n}/textures/${p}.png`) || null;
}

function firstFrame(files, ref, data) {
  const [n, p] = splitRef(ref);
  const mm = files.get(`assets/${n}/textures/${p}.png.mcmeta`);
  const size = pngSize(data);
  if (!mm || !size || size.height <= size.width) return data;
  try {
    return encodePng(crop(decodePng(data), 0, 0, size.width, size.width));
  } catch {
    return data;
  }
}

const CROSS_GEO = {
  format_version: '1.12.0',
  'minecraft:geometry': [{
    description: { identifier: 'geometry.blockbridge_cross', texture_width: 16, texture_height: 16, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.5, 0] },
    bones: [{
      name: 'cross',
      pivot: [0, 0, 0],
      cubes: [45, -45].map((rot) => ({
        origin: [-8, 0, 0], size: [16, 16, 0], pivot: [0, 8, 0], rotation: [0, rot, 0],
        uv: { north: { uv: [0, 0], uv_size: [16, 16] }, south: { uv: [16, 0], uv_size: [-16, 16] } },
      })),
    }],
  }],
};

export function modToBedrock(files, mod, opts, report) {
  const name = opts.name || mod.meta.name;
  const rp = new Map();
  const bp = new Map();
  const rpUuid = uuid();
  const bpUuid = uuid();
  const desc = opts.description || mod.meta.description || `${mod.meta.name} – umgewandelt mit BlockBridge`;
  rp.set('manifest.json', jsonBytes(bedrockManifest(name + ' (Ressourcen)', desc, 'resources', { uuid: rpUuid, dependencies: [{ uuid: bpUuid, version: [1, 0, 0] }] })));
  bp.set('manifest.json', jsonBytes(bedrockManifest(name, desc, 'data', { uuid: bpUuid, dependencies: [{ uuid: rpUuid, version: [1, 0, 0] }] })));
  if (mod.meta.iconData) {
    rp.set('pack_icon.png', mod.meta.iconData);
    bp.set('pack_icon.png', mod.meta.iconData);
  }

  const itemTex = {};
  const terrainTex = {};
  const lang = {}; // code -> lines
  const addLang = (keys, nm) => {
    for (const [code, value] of Object.entries({ en_us: nm.en, ...nm.per })) {
      const b = code.split('_')[0] + '_' + (code.split('_')[1] || '').toUpperCase();
      if (!BEDROCK_LANGS.has(b)) continue;
      (lang[b] = lang[b] || []).push(...keys.map((k) => `${k}=${String(value).replace(/\r?\n/g, ' ')}`));
    }
  };
  const known = new Set();

  // Vanilla-Textur als Bedrock-Pfad
  const vanillaPath = (ref, cat) => {
    const [, p] = splitRef(ref);
    const nm = p.replace(/^(block|blocks|item|items)\//, '');
    const { specs } = flatToBedrock(cat, nm);
    const first = !specs.length ? nm : typeof specs[0] === 'string' ? specs[0] : specs[0].path || specs[0].name;
    return first.startsWith('textures/') ? first : `textures/${cat === 'block' ? 'blocks' : 'items'}/${first}`;
  };
  const terrainKey = (ref) => {
    const [n, p] = splitRef(ref);
    const key = `${n === 'minecraft' ? 'vanilla' : n}_${p.replace(/^(block|blocks|item|items)\//, '').replace(/[/]/g, '_')}`;
    if (terrainTex[key]) return key;
    if (n === 'minecraft') {
      terrainTex[key] = { textures: vanillaPath(ref, 'block') };
      return key;
    }
    const data = texFile(files, ref);
    if (!data) return null;
    const out = `textures/blocks/${n}/${p.replace(/^(block|blocks)\//, '')}`;
    rp.set(out + '.png', firstFrame(files, ref, data));
    terrainTex[key] = { textures: out };
    return key;
  };

  // Items
  if (opts.items !== false) {
    for (const it of mod.items) {
      if (it.skip) {
        report.skip(it.skip, `${it.ns}:${it.id}`);
        continue;
      }
      const [tn, tp] = splitRef(it.tex);
      let texPath;
      if (tn === 'minecraft') texPath = vanillaPath(it.tex, tp.startsWith('block') ? 'block' : 'item');
      else {
        const data = texFile(files, it.tex);
        if (!data) {
          report.skip('Items, deren Textur fehlt', `${it.ns}:${it.id}`);
          continue;
        }
        texPath = `textures/items/${tn}/${tp.replace(/^(item|items)\//, '')}`;
        rp.set(texPath + '.png', firstFrame(files, it.tex, data));
      }
      const key = `${it.ns}_${it.id}`;
      itemTex[key] = { textures: texPath };
      const ident = `${it.ns}:${it.id}`;
      const single = it.handheld || it.armor;
      bp.set(`items/${it.ns}/${it.id}.json`, jsonBytes({
        format_version: '1.21.40',
        'minecraft:item': {
          description: { identifier: ident, menu_category: { category: single ? 'equipment' : 'items' } },
          components: {
            'minecraft:icon': { textures: { default: key } },
            'minecraft:display_name': { value: it.name.key },
            'minecraft:max_stack_size': single ? 1 : 64,
            ...(it.handheld ? { 'minecraft:hand_equipped': true } : {}),
          },
        },
      }));
      addLang([it.name.key, `item.${ident}`, `item.${ident}.name`], it.name);
      known.add(ident);
      report.ok('Items erstellt', `${it.name.en} (${ident})`);
      if (it.layers) report.warn('Items mit mehreren Bild-Ebenen – nur die unterste wurde übernommen', ident);
      if (it.armor) report.warn('Rüstungsteile als normale Items übernommen (anziehen bräuchte Programmcode)', ident);
      else if (it.handheld) report.info('Werkzeuge/Waffen: Aussehen übernommen, Werte wie Schaden oder Abbautempo nicht', ident);
    }
  }

  // Blöcke
  let needCross = false;
  if (opts.blocks !== false) {
    for (const b of mod.blocks) {
      const mats = {};
      let kind = 'opaque';
      let ok = true;
      for (const [face, ref] of Object.entries(b.faces)) {
        if (!ref) continue;
        const key = terrainKey(ref);
        if (!key) {
          ok = false;
          break;
        }
        const [tn] = splitRef(ref);
        if (tn !== 'minecraft' && face === '*') {
          try {
            kind = alphaKind(decodePng(texFile(files, ref)));
          } catch {
            /* bleibt undurchsichtig */
          }
        }
        mats[face] = key;
      }
      if (!ok || !mats['*']) {
        report.skip('Blöcke, deren Textur fehlt', `${b.ns}:${b.id}`);
        continue;
      }
      const cross = b.shape === 'cross';
      if (cross) needCross = true;
      const method = cross ? 'alpha_test' : kind === 'translucent' ? 'blend' : kind === 'cutout' ? 'alpha_test' : 'opaque';
      const instances = {};
      for (const [face, key] of Object.entries(mats)) instances[face] = { texture: key, render_method: method, ...(cross ? { ambient_occlusion: false, face_dimming: false } : {}) };
      const ident = `${b.ns}:${b.id}`;
      bp.set(`blocks/${b.ns}/${b.id}.json`, jsonBytes({
        format_version: '1.21.40',
        'minecraft:block': {
          description: { identifier: ident, menu_category: { category: cross ? 'nature' : 'construction' } },
          components: {
            'minecraft:display_name': b.name.key,
            'minecraft:destructible_by_mining': { seconds_to_destroy: cross ? 0 : 1.5 },
            'minecraft:destructible_by_explosion': { explosion_resistance: cross ? 0 : 6 },
            'minecraft:geometry': cross ? 'geometry.blockbridge_cross' : 'minecraft:geometry.full_block',
            'minecraft:material_instances': instances,
            ...(cross ? { 'minecraft:collision_box': false, 'minecraft:selection_box': { origin: [-6, 0, -6], size: [12, 13, 12] }, 'minecraft:light_dampening': 0 } : {}),
            ...(method === 'blend' ? { 'minecraft:light_dampening': 0 } : {}),
          },
        },
      }));
      addLang([b.name.key, `tile.${ident}.name`], b.name);
      known.add(ident);
      report.ok(cross ? 'Pflanzen-Blöcke erstellt' : 'Blöcke erstellt', `${b.name.en} (${ident})`);
      if (b.simplified) report.warn('Blöcke mit besonderer Form (Stufen, Treppen, eigene Modelle …) als ganzer Block übernommen', ident);
      if (b.oriented) report.info('Blöcke mit Vorderseite: zeigt immer nach Norden', ident);
      if (b.multi) report.info('Blöcke mit mehreren Zuständen: nur der Grundzustand wurde übernommen', ident);
    }
  }
  if (needCross) rp.set('models/blocks/blockbridge_cross.geo.json', jsonBytes(CROSS_GEO));

  if (Object.keys(itemTex).length) rp.set('textures/item_texture.json', jsonBytes({ resource_pack_name: safeId(name), texture_name: 'atlas.items', texture_data: itemTex }));
  if (Object.keys(terrainTex).length) rp.set('textures/terrain_texture.json', jsonBytes({ resource_pack_name: safeId(name), texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: terrainTex }));
  if (!lang.en_US) lang.en_US = [];
  for (const [code, lines] of Object.entries(lang)) rp.set(`texts/${code}.lang`, toBytes(lines.join('\n') + '\n'));
  rp.set('texts/languages.json', jsonBytes(Object.keys(lang)));

  if (opts.recipes !== false && mod.recipes.size) writeBedrockRecipes(mod.recipes, bp, report, known);

  // Vanilla-Texturen, die die Mod verändert
  if (mod.vanillaOverrides) {
    const sub = new Map();
    for (const [p, d] of files) if (p.startsWith('assets/minecraft/')) sub.set(p, d);
    const canon = readJavaRP(sub);
    writeBedrockTextures(canon, (p, d) => {
      if (!rp.has(p)) rp.set(p, d);
    }, report);
  }

  if (mod.classes) report.skip('Programmcode der Mod (Java-Klassen) – Maschinen, Kreaturen, Effekte, Weltgenerierung usw. lassen sich nicht automatisch übertragen', `${mod.classes} Klassen`);
  if (mod.entityTextures) report.skip('Kreaturen-Texturen der Mod (die Kreaturen selbst sind Programmcode)', `${mod.entityTextures} Bilder`);
  if (mod.sounds) report.skip('Sounds der Mod', `${mod.sounds} Dateien`);
  if (!known.size) return null;
  return { rp, bp, name, count: known.size };
}

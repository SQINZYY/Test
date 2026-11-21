// Datenpakete (Java) <-> Verhaltenspakete (Bedrock): Funktionen und Rezepte.
import { jsonBytes, parseJson, safeId, stripExt, toBytes, toText, uuid } from '../util.js';
import { bedrockFunctionToJava, javaFunctionToBedrock } from './commands.js';
import { bedrockRecipeToJava, javaRecipeForVersion, javaRecipeToBedrock } from './recipes.js';
import { javaDescription, javaPackFormat, bedrockHeader } from './resourcepack.js';
import { BEDROCK_ADDON_MIN_ENGINE, packMcmeta } from '../versions.js';

const SINGULAR = {
  functions: 'function', recipes: 'recipe', loot_tables: 'loot_table', advancements: 'advancement', predicates: 'predicate',
  item_modifiers: 'item_modifier', structures: 'structure',
};
const TAG_SINGULAR = { functions: 'function', items: 'item', blocks: 'block', entity_types: 'entity_type', fluids: 'fluid', game_events: 'game_event' };
const PLURAL = Object.fromEntries(Object.entries(SINGULAR).map(([a, b]) => [b, a]));
const TAG_PLURAL = Object.fromEntries(Object.entries(TAG_SINGULAR).map(([a, b]) => [b, a]));

const DP_GROUPS = {
  advancement: 'Fortschritte (advancements)', loot_table: 'Beutetabellen (loot_tables)', predicate: 'Bedingungen (predicates)',
  item_modifier: 'Item-Modifikatoren', structure: 'Strukturen', worldgen: 'Weltgenerierung (worldgen)', dimension: 'Dimensionen',
  dimension_type: 'Dimensionen', damage_type: 'Schadensarten', enchantment: 'Verzauberungen', chat_type: 'Chat-Typen', trim_material: 'Rüstungsverzierungen',
  trim_pattern: 'Rüstungsverzierungen', banner_pattern: 'Bannermuster', painting_variant: 'Gemälde', jukebox_song: 'Schallplatten',
  tags: 'Tags', instrument: 'Instrumente', wolf_variant: 'Tier-Varianten',
};

/** Liest ein Java-Datenpaket. */
export function readJavaDP(files) {
  const mcmeta = files.has('pack.mcmeta') ? parseJson(files.get('pack.mcmeta')) : null;
  const dp = { format: javaPackFormat(mcmeta), description: javaDescription(mcmeta), functions: new Map(), recipes: new Map(), tick: [], load: [], other: new Map(), files };
  for (const [p, data] of files) {
    const m = p.match(/^data\/([^/]+)\/(.+)$/);
    if (!m) continue;
    const [, ns, rest] = m;
    let mm;
    if ((mm = rest.match(/^functions?\/(.+)\.mcfunction$/))) dp.functions.set(`${ns}:${mm[1]}`, toText(data));
    else if ((mm = rest.match(/^recipes?\/(.+)\.json$/))) {
      const j = parseJson(data);
      if (j) dp.recipes.set(`${ns}:${mm[1]}`, j);
    } else if (ns === 'minecraft' && (mm = rest.match(/^tags\/functions?\/(tick|load)\.json$/))) {
      const j = parseJson(data);
      const vals = (j && j.values) || [];
      for (const v of vals) dp[mm[1]].push(typeof v === 'string' ? v : v && v.id);
    } else dp.other.set(p, rest.split('/')[0]);
  }
  return dp;
}

function bedrockManifest(name, description, type, extra = {}) {
  return {
    format_version: 2,
    header: { name, description: description || '', uuid: extra.uuid || uuid(), version: [1, 0, 0], min_engine_version: extra.minEngine || BEDROCK_ADDON_MIN_ENGINE },
    modules: [{ type, uuid: uuid(), version: [1, 0, 0] }],
    ...(extra.dependencies ? { dependencies: extra.dependencies } : {}),
  };
}
export { bedrockManifest };

/** Java-Datenpaket -> Bedrock-Verhaltenspaket (Dateien). */
export function writeBedrockBP(dp, opts, report, files = new Map()) {
  if (!files.has('manifest.json')) files.set('manifest.json', jsonBytes(bedrockManifest(opts.name, opts.description, 'data', opts)));
  let lines = 0, commented = 0;
  const reasons = new Set();
  const notes = new Set();
  for (const [id, text] of dp.functions) {
    const [ns, path] = id.split(':');
    const r = javaFunctionToBedrock(text);
    files.set(`functions/${ns}/${path}.mcfunction`, toBytes(r.text + '\n'));
    lines += r.stats.converted;
    commented += r.stats.commented;
    r.reasons.forEach((x) => reasons.add(x));
    r.notes.forEach((x) => notes.add(x));
    report.ok('Funktionen übersetzt', id);
  }
  if (dp.functions.size) report.info('Befehle übersetzt', `${lines} Befehle übernommen, ${commented} auskommentiert`);
  if (commented) {
    const g = report.warn('Auskommentierte Befehle (in der Datei mit "# [BlockBridge]" markiert)');
    for (const r of reasons) g.details.push(r);
  }
  for (const n of notes) report.warn('Hinweise zu übersetzten Befehlen', n);
  const tick = dp.tick.filter(Boolean).map((v) => v.replace(':', '/'));
  if (tick.length) {
    files.set('functions/tick.json', jsonBytes({ values: tick }));
    report.ok('Tick-Funktionen eingetragen', tick.join(', '));
  }
  if (dp.load.length) report.warn('Lade-Funktionen (load) gibt es in Bedrock nicht – einmal von Hand mit /function starten', dp.load.join(', '));
  writeBedrockRecipes(dp.recipes, files, report, null);
  for (const [p, group] of dp.other) report.skip(DP_GROUPS[group] || `Sonstige Datenpaket-Inhalte (${group})`, p);
  return files;
}

export function writeBedrockRecipes(recipes, files, report, known) {
  for (const [id, j] of recipes) {
    const ident = id.replace(/[^a-z0-9_:.-]/gi, '_').toLowerCase();
    const r = javaRecipeToBedrock(j, ident, known);
    if (r.skip) {
      report.skip(r.skip, id);
      continue;
    }
    files.set(`recipes/${ident.replace(':', '_')}.json`, jsonBytes(r.json));
    report.ok('Rezepte umgewandelt', id);
    if (r.note) report.warn(r.note, id);
  }
}

/** Liest ein Bedrock-Verhaltenspaket (nur Funktionen und Rezepte lassen sich nach Java übertragen). */
export function readBedrockBP(files) {
  const manifest = parseJson(files.get('manifest.json'));
  const head = bedrockHeader(files, manifest);
  const bp = { name: head.name, description: head.description, functions: new Map(), recipes: new Map(), tick: [], other: new Map(), counts: {} };
  for (const [p, data] of files) {
    let m;
    if (p === 'manifest.json' || p === 'pack_icon.png' || p.startsWith('texts/')) continue;
    if ((m = p.match(/^functions\/(.+)\.mcfunction$/))) bp.functions.set(m[1], toText(data));
    else if (p === 'functions/tick.json') {
      const j = parseJson(data);
      bp.tick = ((j && j.values) || []).filter((v) => typeof v === 'string');
    } else if ((m = p.match(/^recipes\/(.+)\.json$/))) {
      const j = parseJson(data);
      if (j) bp.recipes.set(m[1], j);
    } else {
      const top = p.split('/')[0];
      bp.other.set(p, top);
      bp.counts[top] = (bp.counts[top] || 0) + 1;
    }
  }
  return bp;
}

const BP_GROUPS = {
  items: 'Eigene Items (items/) – für Java bräuchte man eine Mod',
  blocks: 'Eigene Blöcke (blocks/) – für Java bräuchte man eine Mod',
  entities: 'Kreaturen-Verhalten (entities/) – für Java bräuchte man eine Mod',
  scripts: 'Skripte (scripts/) – JavaScript-API gibt es nur in Bedrock',
  loot_tables: 'Beutetabellen (anderes Format)',
  spawn_rules: 'Spawn-Regeln',
  trading: 'Handel',
  feature_rules: 'Weltgenerierung',
  features: 'Weltgenerierung',
  structures: 'Strukturen (.mcstructure)',
  biomes: 'Biome',
  animation_controllers: 'Animations-Controller',
  dimensions: 'Dimensionen',
  cameras: 'Kameras',
};

/** Bedrock-Verhaltenspaket -> Java-Datenpaket */
export function writeJavaDP(bp, version, opts, report) {
  const dpf = version.dp || 48;
  const files = new Map();
  const ns = safeId(opts.namespace || opts.name || 'blockbridge').replace(/[^a-z0-9_.-]/g, '_');
  files.set('pack.mcmeta', jsonBytes(packMcmeta(opts.description || bp.description || opts.name, dpf, 88)));
  const fnDir = dpf >= 45 ? 'function' : 'functions';
  const rcDir = dpf >= 45 ? 'recipe' : 'recipes';
  let lines = 0, commented = 0;
  const reasons = new Set();
  const notes = new Set();
  for (const [path, text] of bp.functions) {
    const r = bedrockFunctionToJava(text, ns, dpf);
    files.set(`data/${ns}/${fnDir}/${path.toLowerCase()}.mcfunction`, toBytes(r.text + '\n'));
    lines += r.stats.converted;
    commented += r.stats.commented;
    r.reasons.forEach((x) => reasons.add(x));
    r.notes.forEach((x) => notes.add(x));
    report.ok('Funktionen übersetzt', path);
  }
  if (bp.functions.size) report.info('Befehle übersetzt', `${lines} Befehle übernommen, ${commented} auskommentiert`);
  if (commented) {
    const g = report.warn('Auskommentierte Befehle (in der Datei mit "# [BlockBridge]" markiert)');
    for (const r of reasons) g.details.push(r);
  }
  for (const n of notes) report.warn('Hinweise zu übersetzten Befehlen', n);
  if (bp.tick.length) {
    files.set(`data/minecraft/tags/${fnDir}/tick.json`, jsonBytes({ values: bp.tick.map((v) => `${ns}:${v.toLowerCase()}`) }));
    report.ok('Tick-Funktionen eingetragen', bp.tick.join(', '));
  }
  for (const [file, j] of bp.recipes) {
    const r = bedrockRecipeToJava(j, dpf);
    if (r.skip) {
      report.skip(r.skip, file);
      continue;
    }
    for (const rec of r.recipes) {
      files.set(`data/${ns}/${rcDir}/${rec.name.toLowerCase()}.json`, jsonBytes(rec.json));
      report.ok('Rezepte umgewandelt', rec.name);
    }
  }
  for (const [p, top] of bp.other) report.skip(BP_GROUPS[top] || 'Sonstige Bedrock-Dateien', p);
  if (!bp.functions.size && !bp.recipes.size) return null;
  return files;
}

/** Java-Datenpaket auf ein anderes Java-Format umschreiben. */
export function convertJavaDPVersion(dp, version, opts, report) {
  const dpf = version.dp;
  const files = new Map();
  const singular = dpf >= 45;
  files.set('pack.mcmeta', jsonBytes(packMcmeta(opts.description || dp.description || opts.name, dpf, 88)));
  let renamed = 0;
  for (const [p, data] of dp.files) {
    if (p === 'pack.mcmeta') continue;
    const m = p.match(/^data\/([^/]+)\/([^/]+)\/(.*)$/);
    if (!m) {
      files.set(p, data);
      continue;
    }
    let [, ns, folder, rest] = m;
    let nf = folder;
    if (singular && SINGULAR[folder]) nf = SINGULAR[folder];
    if (!singular && PLURAL[folder]) nf = PLURAL[folder];
    if (folder === 'tags') {
      const [tf, ...tr] = rest.split('/');
      let ntf = tf;
      if (singular && TAG_SINGULAR[tf]) ntf = TAG_SINGULAR[tf];
      if (!singular && TAG_PLURAL[tf]) ntf = TAG_PLURAL[tf];
      if (ntf !== tf) renamed++;
      rest = [ntf, ...tr].join('/');
    }
    if (nf !== folder) renamed++;
    let out = data;
    if ((nf === 'recipe' || nf === 'recipes') && p.endsWith('.json')) {
      const j = parseJson(data);
      if (j) {
        out = jsonBytes(javaRecipeForVersion(j, dpf));
        report.ok('Rezepte an die Version angepasst', `${ns}:${stripExt(rest)}`);
      }
    }
    files.set(`data/${ns}/${nf}/${rest}`, out);
  }
  if (renamed) report.ok('Ordnernamen an die Version angepasst', `${renamed} Dateien (z. B. functions → function ab 1.21)`);
  if (dp.functions.size) report.warn('Befehle in Funktionen unverändert übernommen – Befehle mit NBT/Item-Daten haben sich in 1.20.5 und 1.21.x geändert', `${dp.functions.size} Funktionen`);
  return files;
}

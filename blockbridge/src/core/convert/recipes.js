// Rezepte: Java (Datenpaket/Mod) <-> Bedrock (Verhaltenspaket)
import { commonTagItem, ID_TO_BEDROCK, ID_TO_JAVA, javaTagToBedrock } from '../mappings.js';

const ns = (id) => (String(id).includes(':') ? String(id) : 'minecraft:' + id);
export const toBedrockId = (id) => ID_TO_BEDROCK[ns(id)] || ns(id);
export const toJavaId = (id) => ID_TO_JAVA[ns(id)] || ns(id);

/** Java-Zutat (alle Schreibweisen bis 1.21.x) -> { item } | { tag } | null */
function javaIngredient(v, note) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (v.length > 1) note('Zutaten mit Auswahl (A oder B) – Bedrock nimmt nur die erste');
    return javaIngredient(v[0], note);
  }
  if (typeof v === 'string') {
    if (v.startsWith('#')) return { tag: v.slice(1) };
    return { item: v };
  }
  if (typeof v === 'object') {
    if (v.item) return { item: v.item };
    if (v.tag) return { tag: v.tag };
    if (v.items) return javaIngredient(v.items, note);
  }
  return null;
}

function bedrockIngredient(ing, known, note) {
  if (!ing) return null;
  if (ing.item) {
    const id = toBedrockId(ing.item);
    if (known && !id.startsWith('minecraft:') && !known.has(id)) {
      note('Rezepte mit Gegenständen, die nicht umgewandelt wurden');
      return null;
    }
    return { item: id };
  }
  const common = commonTagItem(ing.tag);
  if (common) return { item: toBedrockId(common) };
  const t = javaTagToBedrock(ns(ing.tag));
  if (t) return { tag: t };
  note(`Rezepte mit Java-Tags ohne Gegenstück (z. B. #${ing.tag})`);
  return null;
}

function javaResult(r) {
  if (!r) return null;
  if (typeof r === 'string') return { item: r, count: 1 };
  const item = r.id || r.item;
  if (!item) return null;
  return { item, count: Number(r.count) || 1 };
}

const FURNACE_TAGS = {
  'minecraft:smelting': ['furnace'],
  'minecraft:blasting': ['blast_furnace'],
  'minecraft:smoking': ['smoker'],
  'minecraft:campfire_cooking': ['campfire', 'soul_campfire'],
};

/**
 * Java-Rezept -> Bedrock-Rezept-JSON. Gibt { json } oder { skip: Grund } zurück.
 * known: Set der Bedrock-IDs aus der Mod (für Prüfung, ob Ergebnisse existieren).
 */
export function javaRecipeToBedrock(j, identifier, known) {
  let problem = null;
  const note = (why) => {
    if (!problem) problem = why;
  };
  const type = ns(j && j.type ? j.type : '');
  const desc = { identifier };
  const fv = '1.20.10';

  if (type === 'minecraft:crafting_shaped') {
    const key = {};
    for (const [k, v] of Object.entries(j.key || {})) {
      const ing = bedrockIngredient(javaIngredient(v, note), known, note);
      if (!ing) return { skip: problem || 'unbekannte Zutat' };
      key[k] = ing;
    }
    const res = javaResult(j.result);
    const out = res && bedrockIngredient({ item: res.item }, known, note);
    if (!out) return { skip: problem || 'kein Ergebnis' };
    if (!Array.isArray(j.pattern) || !j.pattern.length) return { skip: 'Rezept ohne Muster' };
    return {
      json: { format_version: fv, 'minecraft:recipe_shaped': { description: desc, tags: ['crafting_table'], pattern: j.pattern, key, result: { ...out, count: res.count } } },
      note: problem,
    };
  }
  if (type === 'minecraft:crafting_shapeless') {
    const ings = [];
    for (const v of j.ingredients || []) {
      const ing = bedrockIngredient(javaIngredient(v, note), known, note);
      if (!ing) return { skip: problem || 'unbekannte Zutat' };
      ings.push(ing);
    }
    const res = javaResult(j.result);
    const out = res && bedrockIngredient({ item: res.item }, known, note);
    if (!out || !ings.length) return { skip: problem || 'kein Ergebnis' };
    return {
      json: { format_version: fv, 'minecraft:recipe_shapeless': { description: desc, tags: ['crafting_table'], ingredients: ings, result: { ...out, count: res.count } } },
      note: problem,
    };
  }
  if (FURNACE_TAGS[type]) {
    const ing = bedrockIngredient(javaIngredient(j.ingredient, note), known, note);
    const res = javaResult(j.result);
    const out = res && bedrockIngredient({ item: res.item }, known, note);
    if (!ing || !out) return { skip: problem || 'unbekannte Zutat' };
    if (!ing.item) return { skip: 'Ofen-Rezepte mit Tags (Bedrock braucht ein festes Item)' };
    return { json: { format_version: fv, 'minecraft:recipe_furnace': { description: desc, tags: FURNACE_TAGS[type], input: ing.item, output: out.item } }, note: problem };
  }
  if (type === 'minecraft:stonecutting') {
    const ing = bedrockIngredient(javaIngredient(j.ingredient, note), known, note);
    const res = javaResult(j.result);
    const out = res && bedrockIngredient({ item: res.item }, known, note);
    if (!ing || !out) return { skip: problem || 'unbekannte Zutat' };
    return {
      json: { format_version: fv, 'minecraft:recipe_shapeless': { description: desc, tags: ['stonecutter'], ingredients: [ing], result: { ...out, count: Number(j.count) || res.count } } },
      note: problem,
    };
  }
  if (type === 'minecraft:smithing_transform') {
    const t = bedrockIngredient(javaIngredient(j.template, note), known, note);
    const b = bedrockIngredient(javaIngredient(j.base, note), known, note);
    const a = bedrockIngredient(javaIngredient(j.addition, note), known, note);
    const res = javaResult(j.result);
    const out = res && bedrockIngredient({ item: res.item }, known, note);
    if (!t || !b || !a || !out || !t.item || !b.item || !a.item) return { skip: problem || 'unbekannte Zutat' };
    return {
      json: { format_version: fv, 'minecraft:recipe_smithing_transform': { description: desc, tags: ['smithing_table'], template: t.item, base: b.item, addition: a.item, result: out.item } },
      note: problem,
    };
  }
  if (/^minecraft:crafting_special_|^minecraft:crafting_decorated_pot|^minecraft:smithing_trim/.test(type)) return { skip: 'Spezial-Rezepte (fest im Spiel eingebaut)' };
  return { skip: `Rezept-Typen aus Mods (z. B. ${type || 'unbekannt'})` };
}

// ---------- Bedrock -> Java ----------
function bIng(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { item: v };
  if (v.item) return { item: typeof v.item === 'string' ? v.item : v.item.name || null };
  if (v.tag) return { tag: v.tag };
  return null;
}

/** Zutat im Format der Ziel-Version */
function jIng(ing, dp, mapIds = true) {
  if (!ing) return null;
  if (ing.tag) return dp >= 57 ? '#' + ing.tag : { tag: ing.tag };
  const id = mapIds ? toJavaId(ing.item) : ns(ing.item);
  return dp >= 57 ? id : { item: id };
}
function jResult(item, count, dp, mapIds = true) {
  const id = mapIds ? toJavaId(item) : ns(item);
  if (dp >= 41) return { id, count: count || 1 };
  return { item: id, count: count || 1 };
}

/** Bedrock-Rezept -> Liste von { name, json } für Java (ein Ofen-Rezept kann mehrere ergeben). */
export function bedrockRecipeToJava(b, dp) {
  const out = [];
  const entry = Object.entries(b || {}).find(([k]) => k.startsWith('minecraft:recipe_'));
  if (!entry) return { skip: 'kein Rezept' };
  const [kind, r] = entry;
  const id = (r.description && r.description.identifier) || 'recipe';
  const name = id.replace(/^[^:]*:/, '').replace(/[^a-z0-9_/.-]/g, '_');
  const tags = r.tags || [];
  const resItem = (res) => {
    if (!res) return null;
    if (Array.isArray(res)) return res.length ? resItem(res[0]) : null;
    if (typeof res === 'string') return { item: res, count: 1 };
    return { item: res.item, count: Number(res.count) || 1 };
  };
  if (kind === 'minecraft:recipe_shaped') {
    if (!tags.includes('crafting_table')) return { skip: 'Rezepte für Bedrock-Werkbänke ohne Java-Gegenstück' };
    const key = {};
    for (const [k, v] of Object.entries(r.key || {})) {
      const ing = jIng(bIng(v), dp);
      if (!ing) return { skip: 'unbekannte Zutat' };
      key[k] = ing;
    }
    const res = resItem(r.result);
    if (!res || !res.item) return { skip: 'kein Ergebnis' };
    out.push({ name, json: { type: 'minecraft:crafting_shaped', pattern: r.pattern, key, result: jResult(res.item, res.count, dp) } });
  } else if (kind === 'minecraft:recipe_shapeless') {
    const res = resItem(r.result);
    if (!res || !res.item) return { skip: 'kein Ergebnis' };
    const ings = [];
    for (const v of r.ingredients || []) {
      const ing = bIng(v);
      if (!ing) return { skip: 'unbekannte Zutat' };
      const n = Number(v && v.count) || 1;
      for (let i = 0; i < n; i++) ings.push(jIng(ing, dp));
    }
    if (tags.includes('stonecutter')) {
      out.push({ name, json: { type: 'minecraft:stonecutting', ingredient: ings[0], ...(dp >= 41 ? { result: { id: toJavaId(res.item), count: res.count } } : { result: toJavaId(res.item), count: res.count }) } });
    } else if (tags.includes('crafting_table')) {
      out.push({ name, json: { type: 'minecraft:crafting_shapeless', ingredients: ings, result: jResult(res.item, res.count, dp) } });
    } else return { skip: 'Rezepte für Bedrock-Werkbänke ohne Java-Gegenstück' };
  } else if (kind === 'minecraft:recipe_furnace') {
    const input = bIng(r.input);
    const output = resItem(r.output);
    if (!input || !input.item || !output) return { skip: 'unbekannte Zutat' };
    const types = { furnace: 'smelting', blast_furnace: 'blasting', smoker: 'smoking', campfire: 'campfire_cooking' };
    for (const t of tags) {
      if (!types[t]) continue;
      out.push({
        name: tags.length > 1 ? `${name}_${types[t]}` : name,
        json: {
          type: 'minecraft:' + types[t],
          ingredient: jIng(input, dp),
          result: dp >= 41 ? { id: toJavaId(output.item) } : toJavaId(output.item),
          experience: 0.1,
          cookingtime: t === 'furnace' ? 200 : t === 'campfire' ? 600 : 100,
        },
      });
    }
  } else if (kind === 'minecraft:recipe_smithing_transform') {
    if (dp < 15) return { skip: 'Schmiede-Rezepte gibt es so erst ab Java 1.20' };
    out.push({
      name,
      json: { type: 'minecraft:smithing_transform', template: jIng(bIng(r.template), dp), base: jIng(bIng(r.base), dp), addition: jIng(bIng(r.addition), dp), result: jResult(r.result, 1, dp) },
    });
  } else return { skip: `Bedrock-Rezept-Typen ohne Java-Gegenstück (${kind})` };
  if (!out.length) return { skip: 'Rezepte für Bedrock-Werkbänke ohne Java-Gegenstück' };
  return { recipes: out };
}

/** Java-Rezept auf ein anderes Java-Format umschreiben (Ergebnis "item"/"id", Zutaten als Text ab 1.21.2). */
export function javaRecipeForVersion(j, dp) {
  const note = () => {};
  const fix = (v) => {
    const ing = javaIngredient(v, note);
    return ing ? jIng(ing.tag ? { tag: ing.tag } : { item: ing.item }, dp, false) : v;
  };
  const r = JSON.parse(JSON.stringify(j));
  const type = ns(r.type || '');
  if (r.key) for (const k of Object.keys(r.key)) r.key[k] = fix(r.key[k]);
  if (Array.isArray(r.ingredients)) r.ingredients = r.ingredients.map(fix);
  for (const k of ['ingredient', 'template', 'base', 'addition']) if (r[k] != null) r[k] = fix(r[k]);
  if (r.result != null) {
    const res = javaResult(r.result);
    if (res) {
      if (FURNACE_TAGS[type]) r.result = dp >= 41 ? { id: res.item } : res.item;
      else if (type === 'minecraft:stonecutting') {
        if (dp >= 41) {
          r.result = { id: res.item, count: Number(r.count) || res.count };
          delete r.count;
        } else {
          r.count = Number(r.count) || res.count;
          r.result = res.item;
        }
      } else r.result = jResult(res.item, res.count, dp, false);
    }
  }
  return r;
}

// Lädt die Namen aller Vanilla-Texturen (Blöcke/Items) beider Editionen und schreibt sie nach
// src/core/data/textures.js. Damit prüft BlockBridge, ob es eine Textur in der Ziel-Edition gibt.
//
// Quellen: Mojang/bedrock-samples (offizielles Bedrock-Vanilla-Paket) und
// InventivetalentDev/minecraft-assets (Dateilisten der Java-Assets).
// Aufruf: node tools/gen-texture-lists.mjs [java-version]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JAVA = process.argv[2] || '1.21.8';
const RAW = 'https://raw.githubusercontent.com';
const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

const terrain = await get(`${RAW}/Mojang/bedrock-samples/main/resource_pack/textures/terrain_texture.json`);
const flip = await get(`${RAW}/Mojang/bedrock-samples/main/resource_pack/textures/flipbook_textures.json`);
const items = await get(`${RAW}/Mojang/bedrock-samples/main/resource_pack/textures/item_texture.json`);
const names = (text, folder) => [...new Set([...text.matchAll(new RegExp(`textures/${folder}/([^"]+)"`, 'g'))].map((m) => m[1]))].sort();
const bBlocks = names(terrain + flip, 'blocks');
const bItems = names(items, 'items');
const javaList = async (folder) => JSON.parse(await get(`${RAW}/InventivetalentDev/minecraft-assets/${JAVA}/assets/minecraft/textures/${folder}/_list.json`))
  .files.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
const jBlocks = await javaList('block');
const jItems = await javaList('item');

const out = `// Automatisch erzeugt mit tools/gen-texture-lists.mjs – nicht von Hand ändern.
// Namen der Vanilla-Texturen (ohne Endung): Bedrock (bedrock-samples), Java ${JAVA} (minecraft-assets).
export const JAVA_VERSION = ${JSON.stringify(JAVA)};
export const BEDROCK_BLOCKS = ${JSON.stringify(bBlocks.join(' '))};
export const BEDROCK_ITEMS = ${JSON.stringify(bItems.join(' '))};
export const JAVA_BLOCKS = ${JSON.stringify(jBlocks.join(' '))};
export const JAVA_ITEMS = ${JSON.stringify(jItems.join(' '))};
`;
const target = join(dirname(fileURLToPath(import.meta.url)), '../src/core/data/textures.js');
writeFileSync(target, out);
console.log(`Bedrock: ${bBlocks.length} Blöcke, ${bItems.length} Items · Java ${JAVA}: ${jBlocks.length} Blöcke, ${jItems.length} Items`);

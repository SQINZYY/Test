// Tests für den Umwandlungs-Kern: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze, convert } from '../src/core/index.js';
import { readZip, writeZip } from '../src/core/zip.js';
import { decodePng, decodeTga, encodePng, createImage, pngSize } from '../src/core/image.js';
import { jsonBytes, parseJson, toBytes, toText } from '../src/core/util.js';
import { _internal, javaFunctionToBedrock, bedrockFunctionToJava } from '../src/core/convert/commands.js';
import { isSlim, upgradeLegacySkin } from '../src/core/convert/skins.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fx = (n) => new Uint8Array(readFileSync(join(FIX, n)));

// ---------- Hilfen ----------
function png(w, h, rgba = [128, 128, 128, 255], fn) {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn ? fn(x, y) : rgba;
    img.data.set(c, (y * w + x) * 4);
  }
  return encodePng(img);
}
const strip = (frames) => png(16, 16 * frames, null, (x, y) => [Math.floor(y / 16) * 40, 0, 0, 255]);
const zip = (obj) => writeZip(new Map(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? toBytes(v) : v instanceof Uint8Array ? v : jsonBytes(v)])));
const run = (name, files, target, opts) => {
  const a = analyze([{ name, bytes: files instanceof Uint8Array ? files : zip(files) }]);
  const r = convert(a, target, opts);
  return { a, r, out: r.bytes[0] === 0x50 ? readZip(r.bytes, { nested: false }) : null };
};
const json = (m, p) => {
  assert.ok(m.has(p), `fehlt: ${p}\nvorhanden: ${[...m.keys()].join(', ')}`);
  return parseJson(m.get(p));
};
const groups = (r, level) => r.report.filter((g) => !level || g.level === level).map((g) => g.title);

// ---------- Bilder ----------
test('PNG: RGBA, Palette+tRNS, Adam7, 1 Bit, 16 Bit', () => {
  const expected = JSON.parse(readFileSync(join(FIX, 'rgba.json'), 'utf8')).flat();
  assert.deepEqual([...decodePng(fx('rgba.png')).data], expected);
  assert.deepEqual([...decodePng(fx('interlaced.png')).data], expected);
  const pal = decodePng(fx('palette.png'));
  assert.equal(pal.width, 5);
  assert.ok([...pal.data].some((v, i) => i % 4 === 3 && v === 0), 'Palette-Transparenz');
  const bw = decodePng(fx('bw.png'));
  assert.equal(bw.width, 9);
  assert.equal(bw.data[0], 255);
  const g16 = decodePng(fx('gray16.png'));
  assert.equal(g16.data[0], 40000 >> 8);
  // Rundweg
  const img = decodePng(fx('rgba.png'));
  assert.deepEqual([...decodePng(encodePng(img)).data], expected);
});

test('TGA: unkomprimiert und RLE', () => {
  const expected = JSON.parse(readFileSync(join(FIX, 'rgba.json'), 'utf8')).flat();
  assert.deepEqual([...decodeTga(fx('img.tga')).data], expected);
  assert.deepEqual([...decodeTga(fx('img_rle.tga')).data], expected);
});

// ---------- Java-Ressourcenpaket -> Bedrock ----------
function javaPack(format = 15) {
  const T = 'assets/minecraft/textures/';
  return {
    'MeinPack/pack.mcmeta': { pack: { pack_format: format, description: { text: 'Bunte Blöcke', color: 'gold' } } },
    'MeinPack/pack.png': png(16, 16, [10, 200, 10, 255]),
    [`MeinPack/${T}block/grass_block_top.png`]: png(16, 16, [150, 150, 150, 255]),
    [`MeinPack/${T}block/oak_planks.png`]: png(16, 16, [160, 120, 60, 255]),
    [`MeinPack/${T}block/stone.png`]: png(16, 16),
    [`MeinPack/${T}block/oak_leaves.png`]: png(16, 16, null, (x) => (x % 2 ? [100, 100, 100, 255] : [0, 0, 0, 0])),
    [`MeinPack/${T}block/sea_lantern.png`]: strip(5),
    [`MeinPack/${T}block/sea_lantern.png.mcmeta`]: { animation: { frametime: 5 } },
    [`MeinPack/${T}block/command_block_front.png`]: strip(4),
    [`MeinPack/${T}block/command_block_front.png.mcmeta`]: { animation: { frametime: 2 } },
    [`MeinPack/${T}block/dirt.png`]: strip(4),
    [`MeinPack/${T}block/dirt.png.mcmeta`]: { animation: { frametime: 2, frames: [2, 1, 0] } },
    [`MeinPack/${T}block/grass_block_side.png`]: png(16, 16),
    [`MeinPack/${T}block/destroy_stage_3.png`]: png(16, 16),
    [`MeinPack/${T}block/crimson_stem.png`]: png(16, 16),
    [`MeinPack/${T}block/chain.png`]: png(3, 16),
    [`MeinPack/${T}item/zombie_spawn_egg.png`]: png(16, 16),
    [`MeinPack/${T}item/red_bundle.png`]: png(16, 16),
    [`MeinPack/${T}item/music_disc_cat.png`]: png(16, 16),
    [`MeinPack/${T}item/music_disc_relic.png`]: png(16, 16),
    [`MeinPack/${T}item/dark_oak_sign.png`]: png(16, 16),
    [`MeinPack/${T}item/my_custom_thing.png`]: png(16, 16),
    [`MeinPack/${T}item/diamond_sword.png`]: png(16, 16),
    [`MeinPack/${T}item/golden_apple.png`]: png(16, 16),
    [`MeinPack/${T}item/wooden_pickaxe.png`]: png(16, 16),
    [`MeinPack/${T}entity/creeper/creeper.png`]: png(64, 32),
    [`MeinPack/${T}entity/player/wide/steve.png`]: png(64, 64),
    [`MeinPack/${T}models/armor/diamond_layer_1.png`]: png(64, 32),
    [`MeinPack/${T}environment/sun.png`]: png(32, 32),
    [`MeinPack/${T}font/ascii.png`]: png(128, 128),
    [`MeinPack/${T}gui/widgets.png`]: png(256, 256),
    'MeinPack/assets/minecraft/models/block/stone.json': { parent: 'block/cube_all' },
    'MeinPack/assets/minecraft/sounds/mob/zombie/say1.ogg': new Uint8Array([79, 103, 103, 83]),
    'MeinPack/assets/minecraft/sounds/records/cat.ogg': new Uint8Array([79, 103, 103, 83]),
  };
}

test('Java-Ressourcenpaket wird erkannt', () => {
  const a = analyze([{ name: 'MeinPack.zip', bytes: zip(javaPack()) }]);
  assert.equal(a.kind, 'java-rp');
  assert.equal(a.name, 'MeinPack');
  assert.equal(a.description, '§6Bunte Blöcke');
  assert.ok(a.facts.some((f) => f.value.includes('1.20 – 1.20.1')));
  assert.ok(a.targets.bedrock.available && a.targets.java.available);
});

test('Java-Ressourcenpaket -> Bedrock .mcpack', () => {
  const { r, out } = run('MeinPack.zip', javaPack(), { edition: 'bedrock' }, {});
  assert.equal(r.fileName, 'MeinPack.mcpack');
  assert.ok(r.openable);
  const man = json(out, 'manifest.json');
  assert.equal(man.format_version, 2);
  assert.equal(man.modules[0].type, 'resources');
  assert.match(man.header.uuid, /^[0-9a-f-]{36}$/);
  assert.notEqual(man.header.uuid, man.modules[0].uuid);
  assert.ok(out.has('pack_icon.png'));
  for (const p of ['textures/blocks/grass_top.png', 'textures/blocks/grass_carried.png', 'textures/blocks/planks_oak.png', 'textures/blocks/stone.png',
    'textures/blocks/leaves_oak.png', 'textures/blocks/leaves_oak_carried.png', 'textures/blocks/leaves_oak_opaque.png',
    'textures/items/diamond_sword.png', 'textures/items/apple_golden.png', 'textures/items/wood_pickaxe.png',
    'textures/entity/creeper/creeper.png', 'textures/entity/steve.png', 'textures/models/armor/diamond_1.png', 'textures/environment/sun.png',
    'font/default8.png', 'sounds/mob/zombie/say1.ogg', 'sounds/music/game/records/cat.ogg']) {
    assert.ok(out.has(p), 'fehlt ' + p);
  }
  // Eingefärbtes Inventar-Gras ist grün
  const carried = decodePng(out.get('textures/blocks/grass_carried.png'));
  assert.ok(carried.data[1] > carried.data[0] && carried.data[1] > carried.data[2]);
  // Laub für "schnell" ist undurchsichtig
  assert.ok([...decodePng(out.get('textures/blocks/leaves_oak_opaque.png')).data].every((v, i) => i % 4 !== 3 || v === 255));
  // Seelaterne und Befehlsblock bleiben animiert (Bedrock-Flipbook), Erde wird auf das erste Bild (Frame 2) gekürzt
  assert.equal(pngSize(out.get('textures/blocks/sea_lantern.png')).height, 80);
  assert.equal(pngSize(out.get('textures/blocks/command_block_front_mipmap.png')).height, 64);
  const dirt = decodePng(out.get('textures/blocks/dirt.png'));
  assert.equal(dirt.height, 16);
  assert.equal(dirt.data[0], 80);
  // Sonderfälle aus den Namenslisten
  for (const p of ['textures/environment/destroy_stage_3.png', 'textures/blocks/huge_fungus/crimson_log_side.png', 'textures/blocks/chain1.png', 'textures/blocks/chain2.png',
    'textures/items/spawn_eggs/spawn_egg_zombie.png', 'textures/items/bundle_red.png', 'textures/items/record_cat.png', 'textures/items/music_disc_relic.png',
    'textures/items/sign_darkoak.png', 'textures/items/my_custom_thing.png']) {
    assert.ok(out.has(p), 'fehlt ' + p);
  }
  assert.ok(![...out.keys()].some((k) => k.includes('grass_side')), 'Gras-Seite nicht übertragen');
  assert.ok(groups(r, 'info').some((t) => t.startsWith('Item-Texturen ohne bekanntes Gegenstück')));
  assert.ok(!out.has('textures/gui/widgets.png'));
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Menü-Grafiken')));
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Block- und Item-Modelle')));
});

test('Java-Ressourcenpaket -> Java 1.12 (alte Namen) und zurück', () => {
  const { out } = run('MeinPack.zip', javaPack(), { edition: 'java', javaVersion: '1.11' }, {});
  const mc = json(out, 'pack.mcmeta');
  assert.equal(mc.pack.pack_format, 3);
  const T = 'assets/minecraft/textures/';
  for (const p of ['blocks/grass_top', 'blocks/planks_oak', 'items/apple_golden', 'items/wood_pickaxe', 'models/armor/diamond_layer_1', 'entity/steve']) {
    assert.ok(out.has(T + p + '.png'), 'fehlt ' + p);
  }
  assert.ok(!out.has('assets/minecraft/models/block/stone.json'), 'Modelle über die 1.13-Grenze weglassen');
  // zurück auf 1.21.9
  const back = run('Alt.zip', Object.fromEntries([...out].map(([k, v]) => [k, v])), { edition: 'java', javaVersion: '1.21.9' }, {}).out;
  const m2 = json(back, 'pack.mcmeta');
  assert.equal(m2.pack.pack_format, 69);
  assert.equal(m2.pack.min_format, 69);
  for (const p of ['block/grass_block_top', 'block/oak_planks', 'item/golden_apple', 'item/wooden_pickaxe', 'entity/equipment/humanoid/diamond', 'entity/player/wide/steve']) {
    assert.ok(back.has(T + p + '.png'), 'fehlt ' + p);
  }
});

test('Java-Ressourcenpaket -> ältere flache Version: Umbenennungen', () => {
  const files = javaPack(46);
  files['MeinPack/assets/minecraft/textures/block/dirt_path_top.png'] = png(16, 16);
  files['MeinPack/assets/minecraft/textures/block/short_grass.png'] = png(16, 16);
  const { out } = run('MeinPack.zip', files, { edition: 'java', javaVersion: '1.16.2' }, {});
  const T = 'assets/minecraft/textures/';
  assert.ok(out.has(T + 'block/grass_path_top.png'));
  assert.ok(out.has(T + 'block/grass.png'));
  assert.ok(out.has(T + 'entity/steve.png'));
  assert.ok(out.has(T + 'models/armor/diamond_layer_1.png'));
  assert.ok(out.has('assets/minecraft/models/block/stone.json'), 'Modelle innerhalb der flachen Zeit behalten');
});

// ---------- Bedrock -> Java ----------
function tgaRle(w, h, rgba) {
  const head = new Uint8Array(18);
  head[2] = 10;
  head[12] = w;
  head[14] = h;
  head[16] = 32;
  head[17] = 8;
  const body = [];
  let n = w * h;
  while (n > 0) {
    const c = Math.min(128, n);
    body.push(0x80 | (c - 1), rgba[2], rgba[1], rgba[0], rgba[3]);
    n -= c;
  }
  return new Uint8Array([...head, ...body]);
}

function bedrockPack() {
  return {
    'manifest.json': { format_version: 2, header: { name: 'pack.name', description: 'pack.description', uuid: '11111111-2222-4333-8444-555555555555', version: [1, 0, 0], min_engine_version: [1, 20, 0] }, modules: [{ type: 'resources', uuid: '21111111-2222-4333-8444-555555555555', version: [1, 0, 0] }] },
    'texts/en_US.lang': 'pack.name=Klar Pack\npack.description=Sehr klar ## Kommentar\n',
    'pack_icon.png': png(16, 16),
    'textures/blocks/grass_top.png': png(16, 16),
    'textures/blocks/grass_carried.png': png(16, 16),
    'textures/blocks/leaves_oak.tga': tgaRle(16, 16, [90, 90, 90, 200]),
    'textures/blocks/leaves_oak_opaque.png': png(16, 16),
    'textures/blocks/planks_big_oak.png': png(16, 16),
    'textures/blocks/deepslate/deepslate_bricks.png': png(16, 16),
    'textures/blocks/water_still_grey.png': strip(4),
    'textures/blocks/magma.png': strip(3),
    'textures/flipbook_textures.json': '// Kommentar\n[{ "flipbook_texture": "textures/blocks/magma", "atlas_tile": "magma", "ticks_per_frame": 10, },]',
    'textures/items/apple_golden.png': png(16, 16),
    'textures/items/dye_powder_black_new.png': png(16, 16),
    'textures/entity/steve.png': png(64, 64),
    'textures/models/armor/cloth_2.png': png(64, 32),
    'textures/terrain_texture.json': {},
    'textures/ui/button.png': png(8, 8),
    'sounds/random/click.ogg': new Uint8Array([79, 103, 103, 83]),
    'sounds/random/old.fsb': new Uint8Array([1, 2]),
    'ui/hud_screen.json': {},
  };
}

test('Bedrock-Ressourcenpaket -> Java 1.21', () => {
  const { a, r, out } = run('klar.mcpack', bedrockPack(), { edition: 'java', javaVersion: '1.21' }, {});
  assert.equal(a.kind, 'bedrock-rp');
  assert.equal(a.name, 'Klar Pack');
  assert.equal(a.description, 'Sehr klar');
  assert.ok(!a.targets.bedrock.available);
  assert.equal(r.fileName, 'Klar Pack (Java 1.21 - 1.21.1).zip');
  const mc = json(out, 'pack.mcmeta');
  assert.equal(mc.pack.pack_format, 34);
  assert.equal(mc.pack.description, 'Sehr klar');
  const T = 'assets/minecraft/textures/';
  for (const p of ['block/grass_block_top', 'block/oak_leaves', 'block/dark_oak_planks', 'block/deepslate_bricks', 'block/water_still', 'block/magma',
    'item/golden_apple', 'item/black_dye', 'entity/player/wide/steve', 'models/armor/leather_layer_2']) {
    assert.ok(out.has(T + p + '.png'), 'fehlt ' + p);
  }
  assert.ok(out.has('pack.png'));
  assert.ok(!out.has(T + 'block/grass_carried.png'));
  // TGA wurde zu PNG
  const leaves = decodePng(out.get(T + 'block/oak_leaves.png'));
  assert.equal(leaves.data[3], 200);
  // Animationen
  assert.equal(json(out, T + 'block/magma.png.mcmeta').animation.frametime, 10);
  assert.equal(json(out, T + 'block/water_still.png.mcmeta').animation.frametime, 2);
  assert.ok(out.has('assets/minecraft/sounds/random/click.ogg'));
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Sounds im Format')));
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Menü-Dateien')));
});

test('Bedrock-Ressourcenpaket -> Java 1.21.4: Rüstung im neuen Ordner', () => {
  const { out } = run('klar.mcpack', bedrockPack(), { edition: 'java', javaVersion: '1.21.4' }, {});
  assert.ok(out.has('assets/minecraft/textures/entity/equipment/humanoid_leggings/leather.png'));
});

test('eigene pack_format-Nummer', () => {
  const { out } = run('klar.mcpack', bedrockPack(), { edition: 'java', customRp: '99' }, {});
  const mc = json(out, 'pack.mcmeta');
  assert.equal(mc.pack.pack_format, 99);
});

// ---------- Skins ----------
function skin64(slim) {
  return png(64, 64, null, (x, y) => (slim && x >= 54 && x < 56 && y >= 20 && y < 32 ? [0, 0, 0, 0] : [x * 4, y * 4, 100, 255]));
}

test('Skins: schmal erkennen, 64x32 erweitern', () => {
  assert.equal(isSlim(decodePng(skin64(true))), true);
  assert.equal(isSlim(decodePng(skin64(false))), false);
  const legacy = decodePng(png(64, 32, null, (x, y) => [x * 4, y * 8, 0, 255]));
  const up = upgradeLegacySkin(legacy);
  assert.equal(up.height, 64);
  // Vorderseite des linken Beins (20,52) = gespiegelte Vorderseite des rechten Beins (4..7,20)
  const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
  assert.deepEqual(px(up, 20, 52), px(legacy, 7, 20));
  assert.deepEqual(px(up, 23, 52), px(legacy, 4, 20));
});

test('Skins -> Bedrock-Skinpaket und zurück', () => {
  const a = analyze([{ name: 'Alex.png', bytes: skin64(true) }, { name: 'Bob.png', bytes: skin64(false) }, { name: 'Bild.png', bytes: png(10, 10) }]);
  assert.equal(a.kind, 'skins');
  assert.equal(a.notes.length, 1);
  const r = convert(a, { edition: 'bedrock' }, { name: 'Meine Skins' });
  const out = readZip(r.bytes, { nested: false });
  const sj = json(out, 'skins.json');
  assert.equal(sj.skins.length, 2);
  assert.equal(sj.skins[0].geometry, 'geometry.humanoid.customSlim');
  assert.equal(sj.skins[1].geometry, 'geometry.humanoid.custom');
  assert.equal(json(out, 'manifest.json').modules[0].type, 'skin_pack');
  assert.match(toText(out.get('texts/en_US.lang')), /skin\.BlockBridge_meine_skins\.skin_1=Alex/);
  // zurück
  const b = analyze([{ name: 'Meine Skins.mcpack', bytes: r.bytes }]);
  assert.equal(b.kind, 'bedrock-skinpack');
  const r2 = convert(b, { edition: 'java' }, {});
  assert.equal(r2.fileName, 'Meine Skins Skins.zip');
  const out2 = readZip(r2.bytes, { nested: false });
  assert.ok(out2.has('Alex (schmal).png'));
  assert.ok(out2.has('Bob.png'));
});

test('einzelner Skin -> Java PNG (64x32 wird 64x64)', () => {
  const a = analyze([{ name: 'alt.png', bytes: png(64, 32) }]);
  const r = convert(a, { edition: 'java' }, {});
  assert.equal(r.fileName, 'alt.png');
  assert.equal(pngSize(r.bytes).height, 64);
});

// ---------- Mods ----------
function fabricMod() {
  const A = 'assets/rubymod/';
  return {
    'fabric.mod.json': { schemaVersion: 1, id: 'rubymod', version: '2.1.0', name: 'Ruby Mod', description: 'Rubine überall', authors: ['Max', { name: 'Eva' }], icon: 'assets/rubymod/icon.png' },
    [A + 'icon.png']: png(32, 32),
    'net/example/RubyMod.class': new Uint8Array([0xca, 0xfe]),
    'net/example/RubyBlock.class': new Uint8Array([0xca, 0xfe]),
    [A + 'lang/en_us.json']: { 'item.rubymod.ruby': 'Ruby', 'item.rubymod.ruby_sword': 'Ruby Sword', 'block.rubymod.ruby_block': 'Block of Ruby', 'block.rubymod.ruby_log': 'Ruby Log', 'block.rubymod.ruby_flower': 'Ruby Flower', 'block.rubymod.ruby_glass': 'Ruby Glass', 'item.rubymod.ruby_helmet': 'Ruby Helmet' },
    [A + 'lang/de_de.json']: { 'item.rubymod.ruby': 'Rubin', 'block.rubymod.ruby_block': 'Rubinblock' },
    [A + 'models/item/ruby.json']: { parent: 'minecraft:item/generated', textures: { layer0: 'rubymod:item/ruby' } },
    [A + 'models/item/ruby_sword.json']: { parent: 'item/handheld', textures: { layer0: 'rubymod:item/ruby_sword' } },
    [A + 'models/item/ruby_helmet.json']: { parent: 'item/generated', textures: { layer0: 'rubymod:item/ruby_helmet', layer1: 'rubymod:item/ruby_helmet_overlay' } },
    [A + 'models/item/ruby_block.json']: { parent: 'rubymod:block/ruby_block' },
    [A + 'models/item/ruby_pulling_0.json']: { parent: 'item/generated', textures: { layer0: 'rubymod:item/ruby' } },
    [A + 'textures/item/ruby.png']: png(16, 16, [200, 0, 0, 255]),
    [A + 'textures/item/ruby_sword.png']: png(16, 16),
    [A + 'textures/item/ruby_helmet.png']: png(16, 16),
    [A + 'blockstates/ruby_block.json']: { variants: { '': { model: 'rubymod:block/ruby_block' } } },
    [A + 'blockstates/ruby_log.json']: { variants: { 'axis=x': { model: 'rubymod:block/ruby_log', x: 90 }, 'axis=y': { model: 'rubymod:block/ruby_log' } } },
    [A + 'blockstates/ruby_flower.json']: { variants: { '': { model: 'rubymod:block/ruby_flower' } } },
    [A + 'blockstates/ruby_glass.json']: { variants: { '': [{ model: 'rubymod:block/ruby_glass' }] } },
    [A + 'blockstates/ruby_stairs.json']: { variants: { 'facing=east': { model: 'rubymod:block/ruby_stairs' } } },
    [A + 'models/block/ruby_block.json']: { parent: 'minecraft:block/cube_all', textures: { all: 'rubymod:block/ruby_block' } },
    [A + 'models/block/ruby_log.json']: { parent: 'block/cube_column', textures: { end: 'rubymod:block/ruby_log_top', side: 'rubymod:block/ruby_log' } },
    [A + 'models/block/ruby_flower.json']: { parent: 'block/cross', textures: { cross: 'rubymod:block/ruby_flower' } },
    [A + 'models/block/ruby_glass.json']: { parent: 'rubymod:block/glass_base', textures: { pane: 'rubymod:block/ruby_glass' } },
    [A + 'models/block/glass_base.json']: { parent: 'block/cube_all', textures: { all: '#pane' } },
    [A + 'models/block/ruby_stairs.json']: { parent: 'block/stairs', textures: { side: 'minecraft:block/stone', top: 'rubymod:block/ruby_block', bottom: 'rubymod:block/ruby_block' } },
    [A + 'textures/block/ruby_block.png']: png(16, 16, [180, 0, 30, 255]),
    [A + 'textures/block/ruby_log.png']: strip(2),
    [A + 'textures/block/ruby_log.png.mcmeta']: { animation: {} },
    [A + 'textures/block/ruby_log_top.png']: png(16, 16),
    [A + 'textures/block/ruby_flower.png']: png(16, 16, null, (x) => (x > 8 ? [255, 0, 0, 255] : [0, 0, 0, 0])),
    [A + 'textures/block/ruby_glass.png']: png(16, 16, [255, 0, 0, 100]),
    [A + 'textures/entity/ruby_golem.png']: png(64, 64),
    'assets/minecraft/textures/item/diamond.png': png(16, 16),
    'data/rubymod/recipe/ruby_block.json': { type: 'minecraft:crafting_shaped', pattern: ['###', '###', '###'], key: { '#': 'rubymod:ruby' }, result: { id: 'rubymod:ruby_block', count: 1 } },
    'data/rubymod/recipe/ruby_from_block.json': { type: 'minecraft:crafting_shapeless', ingredients: ['rubymod:ruby_block'], result: { id: 'rubymod:ruby', count: 9 } },
    'data/rubymod/recipe/ruby_sword.json': { type: 'minecraft:crafting_shaped', pattern: [' R ', ' R ', ' S '], key: { R: { item: 'rubymod:ruby' }, S: { tag: 'c:rods/wooden' } }, result: { item: 'rubymod:ruby_sword' } },
    'data/rubymod/recipe/ruby_planks.json': { type: 'minecraft:crafting_shaped', pattern: ['PR'], key: { P: '#minecraft:planks', R: 'rubymod:ruby' }, result: { id: 'minecraft:stick', count: 4 } },
    'data/rubymod/recipe/smelt_ruby.json': { type: 'minecraft:smelting', ingredient: { item: 'rubymod:ruby_block' }, result: { id: 'rubymod:ruby' }, experience: 1 },
    'data/rubymod/recipe/strange.json': { type: 'rubymod:infusing', input: 'x' },
    'data/rubymod/recipe/unknown_tag.json': { type: 'minecraft:crafting_shapeless', ingredients: ['#rubymod:gems'], result: { id: 'rubymod:ruby' } },
  };
}

test('Fabric-Mod wird erkannt', () => {
  const a = analyze([{ name: 'rubymod-2.1.0.jar', bytes: zip(fabricMod()) }]);
  assert.equal(a.kind, 'java-mod');
  assert.equal(a.name, 'Ruby Mod');
  const f = Object.fromEntries(a.facts.map((x) => [x.label, x.value]));
  assert.equal(f['Mod-Loader'], 'Fabric');
  assert.equal(f.Items, '3');
  assert.equal(f['Blöcke'], '5');
  assert.equal(f.Rezepte, '7');
  assert.ok(!a.targets.java.available);
  assert.ok(a.icon);
});

test('Fabric-Mod -> Bedrock-Add-on', () => {
  const { r, out } = run('rubymod-2.1.0.jar', fabricMod(), { edition: 'bedrock' }, {});
  assert.equal(r.fileName, 'Ruby Mod.mcaddon');
  const RP = 'Ruby Mod RP/', BP = 'Ruby Mod BP/';
  const rpm = json(out, RP + 'manifest.json'), bpm = json(out, BP + 'manifest.json');
  assert.equal(bpm.modules[0].type, 'data');
  assert.equal(bpm.dependencies[0].uuid, rpm.header.uuid);
  assert.equal(rpm.dependencies[0].uuid, bpm.header.uuid);

  const ruby = json(out, BP + 'items/rubymod/ruby.json')['minecraft:item'];
  assert.equal(ruby.description.identifier, 'rubymod:ruby');
  assert.equal(ruby.components['minecraft:icon'].textures.default, 'rubymod_ruby');
  assert.equal(ruby.components['minecraft:max_stack_size'], 64);
  const sword = json(out, BP + 'items/rubymod/ruby_sword.json')['minecraft:item'];
  assert.equal(sword.components['minecraft:hand_equipped'], true);
  assert.equal(sword.components['minecraft:max_stack_size'], 1);
  assert.ok(!out.has(BP + 'items/rubymod/ruby_pulling_0.json'), 'Varianten ohne Namen auslassen');
  assert.ok(!out.has(BP + 'items/rubymod/ruby_block.json'), 'Block-Items nicht doppelt');

  const itemTex = json(out, RP + 'textures/item_texture.json');
  assert.equal(itemTex.texture_data.rubymod_ruby.textures, 'textures/items/rubymod/ruby');
  assert.ok(out.has(RP + 'textures/items/rubymod/ruby.png'));

  const block = json(out, BP + 'blocks/rubymod/ruby_block.json')['minecraft:block'];
  assert.equal(block.components['minecraft:geometry'], 'minecraft:geometry.full_block');
  assert.equal(block.components['minecraft:material_instances']['*'].texture, 'rubymod_ruby_block');
  assert.equal(block.components['minecraft:material_instances']['*'].render_method, 'opaque');
  const log = json(out, BP + 'blocks/rubymod/ruby_log.json')['minecraft:block'].components['minecraft:material_instances'];
  assert.equal(log['*'].texture, 'rubymod_ruby_log');
  assert.equal(log.up.texture, 'rubymod_ruby_log_top');
  assert.equal(pngSize(out.get(RP + 'textures/blocks/rubymod/ruby_log.png')).height, 16, 'animierte Textur gekürzt');
  const flower = json(out, BP + 'blocks/rubymod/ruby_flower.json')['minecraft:block'].components;
  assert.equal(flower['minecraft:geometry'], 'geometry.blockbridge_cross');
  assert.equal(flower['minecraft:material_instances']['*'].render_method, 'alpha_test');
  assert.equal(flower['minecraft:collision_box'], false);
  assert.ok(out.has(RP + 'models/blocks/blockbridge_cross.geo.json'));
  const glass = json(out, BP + 'blocks/rubymod/ruby_glass.json')['minecraft:block'].components;
  assert.equal(glass['minecraft:material_instances']['*'].render_method, 'blend');
  const stairs = json(out, BP + 'blocks/rubymod/ruby_stairs.json')['minecraft:block'].components;
  assert.equal(stairs['minecraft:material_instances']['*'].texture, 'vanilla_stone');
  const terrain = json(out, RP + 'textures/terrain_texture.json');
  assert.equal(terrain.texture_data.vanilla_stone.textures, 'textures/blocks/stone');
  assert.equal(terrain.texture_data.rubymod_ruby_block.textures, 'textures/blocks/rubymod/ruby_block');

  const en = toText(out.get(RP + 'texts/en_US.lang'));
  assert.match(en, /^item\.rubymod\.ruby=Ruby$/m);
  assert.match(en, /^block\.rubymod\.ruby_block=Block of Ruby$/m);
  assert.match(en, /^tile\.rubymod:ruby_block\.name=Block of Ruby$/m);
  const de = toText(out.get(RP + 'texts/de_DE.lang'));
  assert.match(de, /^item\.rubymod\.ruby=Rubin$/m);
  assert.deepEqual(json(out, RP + 'texts/languages.json').sort(), ['de_DE', 'en_US']);

  const shaped = json(out, BP + 'recipes/rubymod_ruby_block.json')['minecraft:recipe_shaped'];
  assert.deepEqual(shaped.key['#'], { item: 'rubymod:ruby' });
  assert.deepEqual(shaped.result, { item: 'rubymod:ruby_block', count: 1 });
  assert.deepEqual(shaped.tags, ['crafting_table']);
  const sw = json(out, BP + 'recipes/rubymod_ruby_sword.json')['minecraft:recipe_shaped'];
  assert.deepEqual(sw.key.S, { item: 'minecraft:stick' });
  const pl = json(out, BP + 'recipes/rubymod_ruby_planks.json')['minecraft:recipe_shaped'];
  assert.deepEqual(pl.key.P, { tag: 'minecraft:planks' });
  const shapeless = json(out, BP + 'recipes/rubymod_ruby_from_block.json')['minecraft:recipe_shapeless'];
  assert.equal(shapeless.result.count, 9);
  const furnace = json(out, BP + 'recipes/rubymod_smelt_ruby.json')['minecraft:recipe_furnace'];
  assert.equal(furnace.input, 'rubymod:ruby_block');
  assert.equal(furnace.output, 'rubymod:ruby');
  assert.ok(!out.has(BP + 'recipes/rubymod_strange.json'));
  assert.ok(!out.has(BP + 'recipes/rubymod_unknown_tag.json'));
  // Vanilla-Textur aus der Mod
  assert.ok(out.has(RP + 'textures/items/diamond.png'));
  assert.ok(out.has(RP + 'pack_icon.png'));
  const skips = groups(r, 'skip');
  assert.ok(skips.some((t) => t.startsWith('Programmcode der Mod')));
  assert.ok(skips.some((t) => t.startsWith('Rezept-Typen aus Mods')));
  assert.ok(skips.some((t) => t.startsWith('Rezepte mit Java-Tags')));
  assert.ok(groups(r, 'warn').some((t) => t.startsWith('Blöcke mit besonderer Form')));
});

test('Forge-Mod (mods.toml) und alte Forge-Mod (mcmod.info)', () => {
  const forge = {
    'META-INF/mods.toml': 'modLoader="javafml"\nloaderVersion="[47,)"\nlicense="MIT"\n[[mods]]\nmodId="coolores"\nversion="${file.jarVersion}"\ndisplayName="Cool Ores"\ndescription=\'\'\'\nViele Erze\n\'\'\'\n[[dependencies.coolores]]\nmodId="forge"\n',
    'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nImplementation-Version: 3.4.5\n',
    'assets/coolores/models/item/tin_ingot.json': { parent: 'item/generated', textures: { layer0: 'coolores:item/tin_ingot' } },
    'assets/coolores/textures/item/tin_ingot.png': png(16, 16),
  };
  const a = analyze([{ name: 'coolores.jar', bytes: zip(forge) }]);
  const f = Object.fromEntries(a.facts.map((x) => [x.label, x.value]));
  assert.equal(f['Mod-Loader'], 'Forge');
  assert.equal(a.name, 'Cool Ores');
  assert.equal(f.Version, '3.4.5');
  assert.equal(a.description, 'Viele Erze');
  const old = {
    'mcmod.info': [{ modid: 'oldmod', name: 'Old Mod', version: '1.0' }],
    'assets/oldmod/blockstates/copper_block.json': { forge_marker: 1, defaults: { model: 'cube_all', textures: { all: 'oldmod:blocks/copper_block' } }, variants: { normal: [{}] } },
    'assets/oldmod/textures/blocks/copper_block.png': png(16, 16),
    'assets/oldmod/lang/en_us.lang': 'tile.copper_block.name=Copper Block\n',
  };
  const { out } = run('oldmod.jar', old, { edition: 'bedrock' }, {});
  const b = json(out, 'Old Mod BP/blocks/oldmod/copper_block.json');
  assert.equal(b['minecraft:block'].components['minecraft:material_instances']['*'].texture, 'oldmod_copper_block');
  assert.match(toText(out.get('Old Mod RP/texts/en_US.lang')), /=Copper Block/);
});

test('Plugins, Welten und Unbekanntes werden erklärt', () => {
  assert.equal(analyze([{ name: 'p.jar', bytes: zip({ 'plugin.yml': 'name: X', 'a/B.class': 'x' }) }]).supported, false);
  const w = analyze([{ name: 'Welt.zip', bytes: zip({ 'Welt/level.dat': 'x', 'Welt/region/r.0.0.mca': 'x' }) }]);
  assert.equal(w.title, 'Java-Welt');
  assert.match(w.tip, /Chunker/);
  assert.equal(analyze([{ name: 'w.mcworld', bytes: zip({ 'level.dat': 'x', 'db/CURRENT': 'x' }) }]).title, 'Bedrock-Welt');
  assert.equal(analyze([{ name: 'x.txt', bytes: toBytes('hallo') }]).supported, false);
  assert.equal(analyze([{ name: 'x.zip', bytes: zip({ 'readme.txt': 'hi' }) }]).supported, false);
});

// ---------- Befehle ----------
test('Befehle Java -> Bedrock', () => {
  const j = (c) => {
    const r = javaFunctionToBedrock(c);
    return r.text;
  };
  assert.equal(j('effect give @a[distance=..10,limit=2,sort=nearest] minecraft:speed 30 1 true'), 'effect @a[r=10,c=2] speed 30 1 true');
  assert.equal(j('effect clear @s'), 'effect @s clear');
  assert.equal(j('xp add @p 5 levels'), 'xp 5L @p');
  assert.equal(j('give @s minecraft:diamond_sword[enchantments={sharpness:5}] 1'), 'give @s minecraft:diamond_sword 1');
  assert.equal(j('function mypack:sub/run'), 'function mypack/sub/run');
  assert.equal(j('execute as @e[type=minecraft:zombie,distance=2..8] at @s if block ~ ~-1 ~ minecraft:grass_block run tp @s ~ ~1 ~'),
    'execute as @e[type=minecraft:zombie,rm=2,r=8] at @s if block ~ ~-1 ~ minecraft:grass_block run tp @s ~ ~1 ~');
  assert.equal(j('execute in minecraft:the_nether run say hi'), 'execute in nether run say hi');
  assert.equal(j('tellraw @a {"text":"Hallo","color":"gold"}'), 'tellraw @a {"rawtext":[{"text":"§6Hallo"}]}');
  assert.equal(j('tellraw @a ["",{"text":"Punkte: "},{"score":{"name":"@s","objective":"p"}}]'), 'tellraw @a {"rawtext":[{"text":""},{"text":"Punkte: "},{"score":{"name":"@s","objective":"p"}}]}');
  assert.equal(j('title @a title {"text":"Los!"}'), 'titleraw @a title {"rawtext":[{"text":"Los!"}]}');
  assert.equal(j('scoreboard objectives add kills playerKillCount {"text":"Kills"}'), 'scoreboard objectives add kills dummy "Kills"');
  assert.equal(j('scoreboard players add @a[scores={p=1..}] p 1'), 'scoreboard players add @a[scores={p=1..}] p 1');
  assert.equal(j('setblock ~ ~ ~ minecraft:oak_stairs[facing=east] replace'), 'setblock ~ ~ ~ minecraft:oak_stairs replace');
  assert.equal(j('fill ~ ~ ~ ~5 ~ ~5 minecraft:magma_block replace minecraft:stone'), 'fill ~ ~ ~ ~5 ~ ~5 minecraft:magma replace minecraft:stone');
  assert.equal(j('playsound minecraft:entity.player.levelup master @a ~ ~ ~ 1 1'), 'playsound minecraft:entity.player.levelup @a ~ ~ ~ 1 1');
  assert.equal(j('kill @n[type=creeper]'), 'kill @e[type=creeper,c=1]');
  assert.equal(j('clear @s minecraft:dirt 5'), 'clear @s minecraft:dirt -1 5');
  assert.equal(j('# Kommentar'), '# Kommentar');
  assert.match(j('data merge entity @s {Glowing:1b}'), /^# \[BlockBridge\] Nicht umgewandelt \(NBT-Daten/);
  assert.match(j('execute store result score @s x run time query daytime'), /^# \[BlockBridge\]/);
  assert.match(j('kill @e[team=red]'), /^# \[BlockBridge\]/);
  assert.match(j('effect give'), /^# \[BlockBridge\]/);
  assert.match(j('$say $(text)'), /Makro/);
});

test('Befehle Bedrock -> Java', () => {
  const b = (c, dp = 48) => bedrockFunctionToJava(c, 'meinpack', dp).text;
  assert.equal(b('effect @a[r=10,c=2] speed 30 1 true'), 'effect give @a[distance=..10,limit=2,sort=nearest] minecraft:speed 30 1 true');
  assert.equal(b('effect @s clear'), 'effect clear @s');
  assert.equal(b('xp 5L @p'), 'xp add @p 5 levels');
  assert.equal(b('function Sub/Run'), 'function meinpack:sub/run');
  assert.equal(b('gamemode c @a[m=!1]'), 'gamemode creative @a[gamemode=!creative]');
  assert.equal(b('execute @a ~ ~ ~ detect ~ ~-1 ~ stone 0 say Stein'), 'execute as @a at @s if block ~ ~-1 ~ minecraft:stone run say Stein');
  assert.equal(b('execute as @e[rm=2,r=5] at @s in nether run say x'), 'execute as @e[distance=2..5] at @s in minecraft:the_nether run say x');
  assert.equal(b('tellraw @a {"rawtext":[{"text":"Hi "},{"selector":"@s"}]}'), 'tellraw @a ["",{"text":"Hi "},{"selector":"@s"}]');
  assert.equal(b('titleraw @a actionbar {"rawtext":[{"text":"x"}]}'), 'title @a actionbar ["",{"text":"x"}]');
  assert.equal(b('title @a title Hallo Welt'), 'title @a title "Hallo Welt"');
  assert.equal(b('scoreboard players random @s wurf 1 6'), 'execute store result score @s wurf run random value 1..6');
  assert.match(b('scoreboard players random @s wurf 1 6', 15), /^# \[BlockBridge\]/);
  assert.equal(b('give @p diamond 3 0'), 'give @p minecraft:diamond 3');
  assert.equal(b('playsound random.orb @a'), 'playsound random.orb master @a');
  assert.equal(b('setblock ~ ~ ~ grass_path'), 'setblock ~ ~ ~ minecraft:dirt_path');
  assert.match(b('tickingarea add ~ ~ ~ ~5 ~ ~5 x'), /^# \[BlockBridge\]/);
  assert.match(b('kill @e[family=monster]'), /^# \[BlockBridge\]/);
});

// ---------- Datenpakete ----------
function javaDatapack() {
  return {
    'pack.mcmeta': { pack: { pack_format: 48, description: 'Mini-Spiel' } },
    'data/spiel/function/start.mcfunction': 'say Los\neffect give @a minecraft:glowing 10\ndata get entity @s\n',
    'data/spiel/function/tick.mcfunction': 'execute as @a at @s run function spiel:check',
    'data/minecraft/tags/function/tick.json': { values: ['spiel:tick'] },
    'data/minecraft/tags/function/load.json': { values: ['spiel:start'] },
    'data/spiel/recipe/stick.json': { type: 'minecraft:crafting_shaped', pattern: ['#', '#'], key: { '#': { tag: 'minecraft:planks' } }, result: { id: 'minecraft:stick', count: 8 } },
    'data/spiel/recipe/glass.json': { type: 'minecraft:blasting', ingredient: { item: 'minecraft:sand' }, result: { id: 'minecraft:glass' } },
    'data/spiel/advancement/root.json': { criteria: {} },
  };
}

test('Java-Datenpaket -> Bedrock-Verhaltenspaket', () => {
  const { a, r, out } = run('spiel.zip', javaDatapack(), { edition: 'bedrock' }, {});
  assert.equal(a.kind, 'java-dp');
  assert.equal(json(out, 'manifest.json').modules[0].type, 'data');
  const start = toText(out.get('functions/spiel/start.mcfunction'));
  assert.match(start, /^effect @a glowing 10$/m);
  assert.match(start, /^# \[BlockBridge\] Nicht umgewandelt/m);
  assert.equal(toText(out.get('functions/spiel/tick.mcfunction')).trim(), 'execute as @a at @s run function spiel/check');
  assert.deepEqual(json(out, 'functions/tick.json').values, ['spiel/tick']);
  assert.deepEqual(json(out, 'recipes/spiel_stick.json')['minecraft:recipe_shaped'].key['#'], { tag: 'minecraft:planks' });
  assert.deepEqual(json(out, 'recipes/spiel_glass.json')['minecraft:recipe_furnace'].tags, ['blast_furnace']);
  assert.ok(groups(r, 'warn').some((t) => t.startsWith('Lade-Funktionen')));
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Fortschritte')));
});

test('Java-Datenpaket -> Java 1.20 (Ordner und Rezepte zurück)', () => {
  const { out } = run('spiel.zip', javaDatapack(), { edition: 'java', javaVersion: '1.20' }, {});
  assert.equal(json(out, 'pack.mcmeta').pack.pack_format, 15);
  assert.ok(out.has('data/spiel/functions/start.mcfunction'));
  assert.ok(out.has('data/minecraft/tags/functions/tick.json'));
  assert.deepEqual(json(out, 'data/spiel/recipes/stick.json').result, { item: 'minecraft:stick', count: 8 });
  assert.equal(json(out, 'data/spiel/recipes/glass.json').result, 'minecraft:glass');
  assert.ok(out.has('data/spiel/advancements/root.json'));
  // und auf 1.21.2: Zutaten als Text
  const o2 = run('spiel.zip', javaDatapack(), { edition: 'java', javaVersion: '1.21.2' }, {}).out;
  assert.equal(json(o2, 'data/spiel/recipe/stick.json').key['#'], '#minecraft:planks');
});

function bedrockAddon() {
  const head = (n, u) => ({ format_version: 2, header: { name: n, description: 'Test', uuid: u, version: [1, 0, 0], min_engine_version: [1, 20, 0] } });
  const rp = zip({ 'manifest.json': { ...head('Abenteuer RP', '11111111-1111-4111-8111-111111111111'), modules: [{ type: 'resources', uuid: '11111111-1111-4111-8111-111111111112', version: [1, 0, 0] }] }, 'textures/blocks/stone.png': png(16, 16) });
  const bp = zip({
    'manifest.json': { ...head('Abenteuer BP', '22222222-2222-4222-8222-222222222222'), modules: [{ type: 'data', uuid: '22222222-2222-4222-8222-222222222223', version: [1, 0, 0] }] },
    'functions/start.mcfunction': 'say Hallo\nxp 10 @p\ncamera @s fade',
    'functions/tick.json': { values: ['start'] },
    'recipes/apfel.json': { format_version: '1.20.10', 'minecraft:recipe_shapeless': { description: { identifier: 'abenteuer:apfel' }, tags: ['crafting_table'], ingredients: [{ item: 'minecraft:dirt', count: 2 }], result: { item: 'minecraft:apple', count: 1 } } },
    'recipes/ofen.json': { format_version: '1.20.10', 'minecraft:recipe_furnace': { description: { identifier: 'abenteuer:ofen' }, tags: ['furnace', 'smoker'], input: 'minecraft:rotten_flesh', output: 'minecraft:leather' } },
    'entities/drache.json': {},
    'items/schwert.json': {},
  });
  return zip({ 'Abenteuer RP.mcpack': rp, 'Abenteuer BP.mcpack': bp });
}

test('Bedrock-Add-on -> Java (Ressourcen- + Datenpaket)', () => {
  const a = analyze([{ name: 'Abenteuer.mcaddon', bytes: bedrockAddon() }]);
  assert.equal(a.kind, 'bedrock-addon');
  assert.ok(a.notes.some((n) => n.includes('Eigene Items')));
  const r = convert(a, { edition: 'java', javaVersion: '1.21' }, { name: 'Abenteuer' });
  const out = readZip(r.bytes, { nested: false });
  assert.ok(out.has('LIESMICH.txt'));
  const rpZip = [...out.keys()].find((k) => k.endsWith('.zip') && !k.includes('Datenpaket'));
  const dpZip = [...out.keys()].find((k) => k.includes('Datenpaket'));
  const rp = readZip(out.get(rpZip), { nested: false });
  const dp = readZip(out.get(dpZip), { nested: false });
  assert.ok(rp.has('assets/minecraft/textures/block/stone.png'));
  assert.equal(json(dp, 'pack.mcmeta').pack.pack_format, 48);
  const fn = toText(dp.get('data/abenteuer/function/start.mcfunction'));
  assert.match(fn, /^xp add @p 10 points$/m);
  assert.match(fn, /^# \[BlockBridge\] Nicht umgewandelt \(Kamera/m);
  assert.deepEqual(json(dp, 'data/minecraft/tags/function/tick.json').values, ['abenteuer:start']);
  assert.deepEqual(json(dp, 'data/abenteuer/recipe/apfel.json').ingredients, [{ item: 'minecraft:dirt' }, { item: 'minecraft:dirt' }]);
  assert.equal(json(dp, 'data/abenteuer/recipe/ofen_smelting.json').type, 'minecraft:smelting');
  assert.equal(json(dp, 'data/abenteuer/recipe/ofen_smoking.json').type, 'minecraft:smoking');
  assert.ok(groups(r, 'skip').some((t) => t.startsWith('Kreaturen-Verhalten')));
});

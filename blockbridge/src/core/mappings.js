// Namens-Zuordnungen zwischen Java Edition (ab 1.13, "flache" Namen) und Bedrock Edition.
// Bedrock nutzt größtenteils noch die alten Java-Namen von vor 1.13, deshalb dienen dieselben
// Tabellen auch für Java 1.8–1.12.
//
// Ein Eintrag kann mehrere Bedrock-Ziele haben: das erste ist das "echte" Gegenstück, die weiteren
// sind Varianten, die Bedrock zusätzlich braucht (z. B. eingefärbte Inventar-Bilder "_carried").

import { BEDROCK_BLOCKS, BEDROCK_ITEMS, JAVA_BLOCKS, JAVA_ITEMS } from './data/textures.js';

export const GRASS = [124, 189, 107];
export const FOLIAGE = [72, 181, 24];
const SPRUCE = [97, 153, 97];
const BIRCH = [128, 167, 85];

export const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const bc = (c) => (c === 'light_gray' ? 'silver' : c);

function table(text) {
  const t = {};
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const [a, b] = s.split('=');
    t[a.trim()] = [b.trim()];
  }
  return t;
}

// ---------- Blöcke (textures/block <-> textures/blocks) ----------
export const BLOCKS = table(`
grass_block_side=grass_side_carried
grass_block_snow=grass_side_snowed
podzol_top=dirt_podzol_top
podzol_side=dirt_podzol_side
dirt_path_top=grass_path_top
dirt_path_side=grass_path_side
farmland=farmland_dry
farmland_moist=farmland_wet
tall_grass_top=double_plant_grass_top
tall_grass_bottom=double_plant_grass_bottom
large_fern_top=double_plant_fern_top
large_fern_bottom=double_plant_fern_bottom
sunflower_front=double_plant_sunflower_front
sunflower_back=double_plant_sunflower_back
sunflower_top=double_plant_sunflower_top
sunflower_bottom=double_plant_sunflower_bottom
lilac_top=double_plant_syringa_top
lilac_bottom=double_plant_syringa_bottom
rose_bush_top=double_plant_rose_top
rose_bush_bottom=double_plant_rose_bottom
peony_top=double_plant_paeonia_top
peony_bottom=double_plant_paeonia_bottom
dead_bush=deadbush
lily_pad=waterlily
cobweb=web
sugar_cane=reeds
dandelion=flower_dandelion
poppy=flower_rose
blue_orchid=flower_blue_orchid
allium=flower_allium
azure_bluet=flower_houstonia
red_tulip=flower_tulip_red
orange_tulip=flower_tulip_orange
white_tulip=flower_tulip_white
pink_tulip=flower_tulip_pink
oxeye_daisy=flower_oxeye_daisy
cornflower=flower_cornflower
lily_of_the_valley=flower_lily_of_the_valley
wither_rose=flower_wither_rose
brown_mushroom=mushroom_brown
red_mushroom=mushroom_red
brown_mushroom_block=mushroom_block_skin_brown
red_mushroom_block=mushroom_block_skin_red
mushroom_stem=mushroom_block_skin_stem
stone_bricks=stonebrick
mossy_stone_bricks=stonebrick_mossy
cracked_stone_bricks=stonebrick_cracked
chiseled_stone_bricks=stonebrick_carved
mossy_cobblestone=cobblestone_mossy
bricks=brick
smooth_stone=stone_slab_top
smooth_stone_slab_side=stone_slab_side
granite=stone_granite
polished_granite=stone_granite_smooth
diorite=stone_diorite
polished_diorite=stone_diorite_smooth
andesite=stone_andesite
polished_andesite=stone_andesite_smooth
sandstone=sandstone_normal
chiseled_sandstone=sandstone_carved
cut_sandstone=sandstone_smooth
red_sandstone=red_sandstone_normal
chiseled_red_sandstone=red_sandstone_carved
cut_red_sandstone=red_sandstone_smooth
terracotta=hardened_clay
packed_ice=ice_packed
wet_sponge=sponge_wet
nether_quartz_ore=quartz_ore
chiseled_quartz_block=quartz_block_chiseled
chiseled_quartz_block_top=quartz_block_chiseled_top
quartz_pillar=quartz_block_lines
quartz_pillar_top=quartz_block_lines_top
prismarine=prismarine_rough
dark_prismarine=prismarine_dark
nether_bricks=nether_brick
red_nether_bricks=red_nether_brick
end_stone_bricks=end_bricks
carved_pumpkin=pumpkin_face_off
jack_o_lantern=pumpkin_face_on
note_block=noteblock
dispenser_front=dispenser_front_horizontal
dropper_front=dropper_front_horizontal
piston_top=piston_top_normal
redstone_lamp=redstone_lamp_off
torch=torch_on
redstone_torch=redstone_torch_on
rail=rail_normal
rail_corner=rail_normal_turned
powered_rail=rail_golden
powered_rail_on=rail_golden_powered
detector_rail=rail_detector
detector_rail_on=rail_detector_powered
activator_rail=rail_activator
activator_rail_on=rail_activator_powered
oak_door_top=door_wood_upper
oak_door_bottom=door_wood_lower
iron_door_top=door_iron_upper
iron_door_bottom=door_iron_lower
spruce_door_top=door_spruce_upper
spruce_door_bottom=door_spruce_lower
birch_door_top=door_birch_upper
birch_door_bottom=door_birch_lower
jungle_door_top=door_jungle_upper
jungle_door_bottom=door_jungle_lower
acacia_door_top=door_acacia_upper
acacia_door_bottom=door_acacia_lower
dark_oak_door_top=door_dark_oak_upper
dark_oak_door_bottom=door_dark_oak_lower
oak_trapdoor=trapdoor
furnace_front=furnace_front_off
spawner=mob_spawner
end_portal_frame_top=endframe_top
end_portal_frame_side=endframe_side
end_portal_frame_eye=endframe_eye
anvil=anvil_base
anvil_top=anvil_top_damaged_0
chipped_anvil_top=anvil_top_damaged_1
damaged_anvil_top=anvil_top_damaged_2
water_still=water_still_grey
water_flow=water_flow_grey
nether_portal=portal
slime_block=slime
honey_block_side=honey_side
honey_block_top=honey_top
honey_block_bottom=honey_bottom
melon_stem=melon_stem_disconnected
attached_melon_stem=melon_stem_connected
pumpkin_stem=pumpkin_stem_disconnected
attached_pumpkin_stem=pumpkin_stem_connected
comparator=comparator_off
repeater=repeater_off
smoker_front=smoker_front_off
blast_furnace_front=blast_furnace_front_off
stonecutter_saw=stonecutter2_saw
stonecutter_side=stonecutter2_side
stonecutter_top=stonecutter2_top
stonecutter_bottom=stonecutter2_bottom
turtle_egg=turtle_egg_not_cracked
shulker_box=shulker_top_undyed
oak_planks=planks_oak
spruce_planks=planks_spruce
birch_planks=planks_birch
jungle_planks=planks_jungle
acacia_planks=planks_acacia
dark_oak_planks=planks_big_oak
oak_log=log_oak
oak_log_top=log_oak_top
spruce_log=log_spruce
spruce_log_top=log_spruce_top
birch_log=log_birch
birch_log_top=log_birch_top
jungle_log=log_jungle
jungle_log_top=log_jungle_top
acacia_log=log_acacia
acacia_log_top=log_acacia_top
dark_oak_log=log_big_oak
dark_oak_log_top=log_big_oak_top
mangrove_log=mangrove_log_side
cherry_log=cherry_log_side
stripped_mangrove_log=stripped_mangrove_log_side
stripped_cherry_log=stripped_cherry_log_side
oak_sapling=sapling_oak
spruce_sapling=sapling_spruce
birch_sapling=sapling_birch
jungle_sapling=sapling_jungle
acacia_sapling=sapling_acacia
dark_oak_sapling=sapling_roofed_oak
tube_coral_block=coral_blue
brain_coral_block=coral_pink
bubble_coral_block=coral_purple
fire_coral_block=coral_red
horn_coral_block=coral_yellow
dead_tube_coral_block=coral_blue_dead
dead_brain_coral_block=coral_pink_dead
dead_bubble_coral_block=coral_purple_dead
dead_fire_coral_block=coral_red_dead
dead_horn_coral_block=coral_yellow_dead
tube_coral=coral_plant_blue
brain_coral=coral_plant_pink
bubble_coral=coral_plant_purple
fire_coral=coral_plant_red
horn_coral=coral_plant_yellow
tube_coral_fan=coral_fan_blue
brain_coral_fan=coral_fan_pink
bubble_coral_fan=coral_fan_purple
fire_coral_fan=coral_fan_red
horn_coral_fan=coral_fan_yellow
dead_tube_coral_fan=coral_fan_blue_dead
dead_brain_coral_fan=coral_fan_pink_dead
dead_bubble_coral_fan=coral_fan_purple_dead
dead_fire_coral_fan=coral_fan_red_dead
dead_horn_coral_fan=coral_fan_yellow_dead
glass_pane_top=glass_pane_top
bamboo_stalk=bamboo_stem
bamboo_large_leaves=bamboo_leaf
bamboo_small_leaves=bamboo_small_leaf
bamboo_stage0=bamboo_sapling
beehive_end=beehive_top
campfire_fire=campfire
soul_campfire_fire=soul_campfire
cave_vines=cave_vines_head
cave_vines_lit=cave_vines_head_berries
cave_vines_plant=cave_vines_body
cave_vines_plant_lit=cave_vines_body_berries
composter_compost=compost
composter_ready=compost_ready
crimson_stem=huge_fungus/crimson_log_side
crimson_stem_top=huge_fungus/crimson_log_top
warped_stem=huge_fungus/warped_stem_side
stripped_crimson_stem=huge_fungus/stripped_crimson_stem_side
stripped_warped_stem=huge_fungus/stripped_warped_stem_side
crimson_door_bottom=huge_fungus/crimson_door_lower
warped_door_bottom=huge_fungus/warped_door_lower
crimson_nylium=crimson_nylium_top
warped_nylium=warped_nylium_top
dead_tube_coral=coral_plant_blue_dead
dead_brain_coral=coral_plant_pink_dead
dead_bubble_coral=coral_plant_purple_dead
dead_fire_coral=coral_plant_red_dead
dead_horn_coral=coral_plant_yellow_dead
fletching_table_top=fletcher_table_top
fletching_table_side=fletcher_table_side1
fletching_table_front=fletcher_table_side2
honeycomb_block=honeycomb
item_frame=itemframe_background
kelp=kelp_top
lightning_rod_on=lightning_rod_powered
observer_back_on=observer_back_lit
pale_oak_log=pale_oak_log_side
stripped_pale_oak_log=stripped_pale_oak_log_side
pointed_dripstone_down_tip_merge=pointed_dripstone_down_merge
pointed_dripstone_up_tip_merge=pointed_dripstone_up_merge
redstone_dust_line0=redstone_dust_line
rooted_dirt=dirt_with_roots
tripwire=trip_wire
tripwire_hook=trip_wire_source
twisting_vines=twisting_vines_bottom
twisting_vines_plant=twisting_vines_base
weeping_vines=weeping_vines_bottom
weeping_vines_plant=weeping_vines_base
creaking_heart=creaking_heart_side_inactive
creaking_heart_awake=creaking_heart_side_active
creaking_heart_dormant=creaking_heart_side_dormant
creaking_heart_top=creaking_heart_top_inactive
creaking_heart_top_awake=creaking_heart_top_active
open_eyeblossom=eyeblossom_blooming
closed_eyeblossom=eyeblossom_dormant
torchflower_crop_stage0=torchflower_crop_stage_0
torchflower_crop_stage1=torchflower_crop_stage_1
`);

// Eine Java-Textur -> mehrere Bedrock-Texturen
BLOCKS.big_dripleaf_side = ['big_dripleaf_side1', 'big_dripleaf_side2'];
BLOCKS.chain = ['chain1', 'chain2'];
BLOCKS.kelp_plant = ['kelp_a', 'kelp_b', 'kelp_c', 'kelp_d'];
BLOCKS.tall_seagrass_bottom = ['seagrass_doubletall_bottom_a', 'seagrass_doubletall_bottom_b'];
BLOCKS.tall_seagrass_top = ['seagrass_doubletall_top_a', 'seagrass_doubletall_top_b'];
BLOCKS.dried_kelp_side = ['dried_kelp_side_a', 'dried_kelp_side_b'];
BLOCKS.pale_hanging_moss = ['pale_hanging_moss_middle', 'hanging_pale_moss_middle'];
for (let i = 0; i < 4; i++) {
  for (const [jf, bf] of [['north', 'front'], ['south', 'back'], ['west', 'left'], ['east', 'right'], ['top', 'top'], ['bottom', 'bottom'], ['tentacles', 'tentacles']]) {
    BLOCKS[`dried_ghast_hydration_${i}_${jf}`] = [`dried_ghast_state_${i + 1}_${bf}`];
  }
}
for (const pre of ['', 'chain_', 'repeating_']) {
  for (const part of ['front', 'back', 'side', 'conditional']) BLOCKS[`${pre}command_block_${part}`] = [`${pre}command_block_${part}_mipmap`];
}
for (let i = 0; i < 10; i++) BLOCKS[`destroy_stage_${i}`] = [{ name: `destroy_stage_${i}`, path: `textures/environment/destroy_stage_${i}` }];
// Bedrock färbt die Gras-Seite über eine eigene Maske – kein direktes Gegenstück
BLOCKS.grass_block_side = [];
BLOCKS.grass_block_side_overlay = [];

for (const c of COLORS) {
  const b = bc(c);
  BLOCKS[`${c}_wool`] = [`wool_colored_${b}`];
  BLOCKS[`${c}_terracotta`] = [`hardened_clay_stained_${b}`];
  BLOCKS[`${c}_glazed_terracotta`] = [`glazed_terracotta_${b}`];
  BLOCKS[`${c}_concrete`] = [`concrete_${b}`];
  BLOCKS[`${c}_concrete_powder`] = [`concrete_powder_${b}`];
  BLOCKS[`${c}_stained_glass`] = [`glass_${b}`];
  BLOCKS[`${c}_stained_glass_pane_top`] = [`glass_pane_top_${b}`];
  BLOCKS[`${c}_shulker_box`] = [`shulker_top_${b}`];
}
for (const [stage, n] of [['wheat', 8], ['carrots', 4], ['potatoes', 4], ['beetroots', 4], ['nether_wart', 3], ['cocoa', 3]]) {
  for (let i = 0; i < n; i++) BLOCKS[`${stage}_stage${i}`] = [`${stage}_stage_${i}`];
}
// Bedrock legt diese Texturen in Unterordner
for (const n of ['deepslate', 'deepslate_top', 'cobbled_deepslate', 'polished_deepslate', 'deepslate_bricks', 'cracked_deepslate_bricks',
  'deepslate_tiles', 'cracked_deepslate_tiles', 'chiseled_deepslate', 'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_copper_ore',
  'deepslate_gold_ore', 'deepslate_redstone_ore', 'deepslate_emerald_ore', 'deepslate_lapis_ore', 'deepslate_diamond_ore']) {
  BLOCKS[n] = [`deepslate/${n}`];
}
for (const c of ['', ...COLORS.map((x) => x + '_')]) {
  BLOCKS[`${c}candle`] = [`candles/${c}candle`];
  BLOCKS[`${c}candle_lit`] = [`candles/${c}candle_lit`];
}

// Mit Zusatzvarianten für Bedrock
BLOCKS.grass_block_top = ['grass_top', { name: 'grass_carried', tint: GRASS }];
BLOCKS.short_grass = ['tallgrass', { name: 'tallgrass_carried', tint: GRASS }];
BLOCKS.fern = ['fern', { name: 'fern_carried', tint: GRASS }];
BLOCKS.vine = ['vine', { name: 'vine_carried', tint: FOLIAGE }];
BLOCKS.tall_grass_top.push({ name: 'double_plant_grass_carried', tint: GRASS });
BLOCKS.large_fern_top.push({ name: 'double_plant_fern_carried', tint: GRASS });
for (const [java, bed, color] of [
  ['oak_leaves', 'leaves_oak', FOLIAGE],
  ['spruce_leaves', 'leaves_spruce', SPRUCE],
  ['birch_leaves', 'leaves_birch', BIRCH],
  ['jungle_leaves', 'leaves_jungle', FOLIAGE],
  ['acacia_leaves', 'leaves_acacia', FOLIAGE],
  ['dark_oak_leaves', 'leaves_big_oak', FOLIAGE],
  ['mangrove_leaves', 'mangrove_leaves', FOLIAGE],
]) {
  BLOCKS[java] = [bed, { name: bed + '_carried', tint: color }, { name: bed + '_opaque', opaque: true }];
}
for (const [java, bed] of [['azalea_leaves', 'azalea_leaves'], ['flowering_azalea_leaves', 'azalea_leaves_flowers'], ['cherry_leaves', 'cherry_leaves'], ['pale_oak_leaves', 'pale_oak_leaves']]) {
  BLOCKS[java] = [bed, { name: bed + '_opaque', opaque: true }];
}

// ---------- Items (textures/item <-> textures/items) ----------
export const ITEMS = table(`
wooden_sword=wood_sword
wooden_pickaxe=wood_pickaxe
wooden_axe=wood_axe
wooden_shovel=wood_shovel
wooden_hoe=wood_hoe
golden_sword=gold_sword
golden_pickaxe=gold_pickaxe
golden_axe=gold_axe
golden_shovel=gold_shovel
golden_hoe=gold_hoe
golden_helmet=gold_helmet
golden_chestplate=gold_chestplate
golden_leggings=gold_leggings
golden_boots=gold_boots
golden_horse_armor=gold_horse_armor
bow=bow_standby
fishing_rod=fishing_rod_uncast
book=book_normal
writable_book=book_writable
written_book=book_written
enchanted_book=book_enchanted
golden_apple=apple_golden
beef=beef_raw
cooked_beef=beef_cooked
porkchop=porkchop_raw
cooked_porkchop=porkchop_cooked
chicken=chicken_raw
cooked_chicken=chicken_cooked
mutton=mutton_raw
cooked_mutton=mutton_cooked
rabbit=rabbit_raw
cooked_rabbit=rabbit_cooked
cod=fish_raw
cooked_cod=fish_cooked
salmon=fish_salmon_raw
cooked_salmon=fish_salmon_cooked
tropical_fish=fish_clownfish_raw
pufferfish=fish_pufferfish_raw
golden_carrot=carrot_golden
baked_potato=potato_baked
poisonous_potato=potato_poisonous
melon_slice=melon
glistering_melon_slice=melon_speckled
wheat_seeds=seeds_wheat
pumpkin_seeds=seeds_pumpkin
melon_seeds=seeds_melon
beetroot_seeds=seeds_beetroot
bucket=bucket_empty
water_bucket=bucket_water
lava_bucket=bucket_lava
milk_bucket=bucket_milk
cod_bucket=bucket_cod
salmon_bucket=bucket_salmon
pufferfish_bucket=bucket_pufferfish
tropical_fish_bucket=bucket_tropical
powder_snow_bucket=bucket_powder_snow
axolotl_bucket=bucket_axolotl
minecart=minecart_normal
chest_minecart=minecart_chest
furnace_minecart=minecart_furnace
hopper_minecart=minecart_hopper
tnt_minecart=minecart_tnt
command_block_minecart=minecart_command_block
oak_boat=boat_oak
spruce_boat=boat_spruce
birch_boat=boat_birch
jungle_boat=boat_jungle
acacia_boat=boat_acacia
dark_oak_boat=boat_darkoak
oak_door=door_wood
iron_door=door_iron
spruce_door=door_spruce
birch_door=door_birch
jungle_door=door_jungle
acacia_door=door_acacia
dark_oak_door=door_dark_oak
redstone=redstone_dust
slime_ball=slimeball
ink_sac=dye_powder_black
cocoa_beans=dye_powder_brown
lapis_lazuli=dye_powder_blue
bone_meal=dye_powder_white
black_dye=dye_powder_black_new
blue_dye=dye_powder_blue_new
brown_dye=dye_powder_brown_new
white_dye=dye_powder_white_new
red_dye=dye_powder_red
green_dye=dye_powder_green
purple_dye=dye_powder_purple
cyan_dye=dye_powder_cyan
light_gray_dye=dye_powder_silver
gray_dye=dye_powder_gray
pink_dye=dye_powder_pink
lime_dye=dye_powder_lime
yellow_dye=dye_powder_yellow
light_blue_dye=dye_powder_light_blue
magenta_dye=dye_powder_magenta
orange_dye=dye_powder_orange
nether_brick=netherbrick
map=map_empty
filled_map=map_filled
glass_bottle=potion_bottle_empty
potion=potion_bottle_drinkable
splash_potion=potion_bottle_splash
lingering_potion=potion_bottle_lingering
totem_of_undying=totem
firework_rocket=fireworks
firework_star=fireworks_charge
fermented_spider_eye=spider_eye_fermented
popped_chorus_fruit=chorus_fruit_popped
turtle_scute=turtle_shell_piece
sugar_cane=reeds
oak_sign=sign
acacia_sign=sign_acacia
birch_sign=sign_birch
dark_oak_sign=sign_darkoak
jungle_sign=sign_jungle
spruce_sign=sign_spruce
crimson_sign=sign_crimson
warped_sign=sign_warped
dragon_breath=dragons_breath
elytra_broken=broken_elytra
fire_charge=fireball
heart_of_the_sea=heartofthesea_closed
nautilus_shell=nautilus
glow_ink_sac=dye_powder_glow
tadpole_bucket=bucket_tadpole
wolf_armor_overlay=wolf_armor_dyed
`);

// Java-Namen, die sich innerhalb der "flachen" Zeit geändert haben: [eingeführt ab pack_format, Kategorie, alt, neu]
export const JAVA_RENAMES = [
  [4, 'item', 'dandelion_yellow', 'yellow_dye'],
  [4, 'item', 'rose_red', 'red_dye'],
  [4, 'item', 'cactus_green', 'green_dye'],
  [7, 'block', 'grass_path_top', 'dirt_path_top'],
  [7, 'block', 'grass_path_side', 'dirt_path_side'],
  [12, 'entity', 'steve', 'player/wide/steve'],
  [12, 'entity', 'alex', 'player/slim/alex'],
  [13, 'misc', 'enchanted_item_glint', 'enchanted_glint_item'],
  [22, 'block', 'grass', 'short_grass'],
  [22, 'item', 'scute', 'turtle_scute'],
];

// Java 1.8–1.12 weicht an wenigen Stellen von Bedrock ab: Bedrock-Name -> alter Java-Name
export const LEGACY_JAVA = {
  block: { grass_side_carried: 'grass_side', water_still_grey: 'water_still', water_flow_grey: 'water_flow' },
  item: { fish_raw: 'fish_cod_raw', fish_cooked: 'fish_cod_cooked' },
};
// Alter Java-Name -> flacher Name, wo die Bedrock-Tabelle nicht passt
export const LEGACY_JAVA_IN = {
  block: { grass_side: 'grass_block_side', grass_side_overlay: 'grass_block_side_overlay', grass_side_snowed: 'grass_block_snow', water_still: 'water_still', water_flow: 'water_flow' },
  item: { fish_cod_raw: 'cod', fish_cod_cooked: 'cooked_cod' },
};

// ---------- Zuordnung mit Prüfung gegen die Vanilla-Namenslisten ----------
const split = (x) => new Set(x.split(' '));
export const BEDROCK_NAMES = { block: split(BEDROCK_BLOCKS), item: split(BEDROCK_ITEMS) };
export const JAVA_NAMES = { block: split(JAVA_BLOCKS), item: split(JAVA_ITEMS) };
export const specName = (s) => (typeof s === 'string' ? s : s.name);

// Bedrock legt manche Texturen in Unterordner (deepslate/, candles/, huge_fungus/, spawn_eggs/ …)
function subIndex(set) {
  const m = new Map();
  for (const n of set) if (n.includes('/')) {
    const b = n.slice(n.lastIndexOf('/') + 1);
    if (!m.has(b)) m.set(b, n);
  }
  return m;
}
const SUB = { block: subIndex(BEDROCK_NAMES.block), item: subIndex(BEDROCK_NAMES.item) };

function ruleCandidates(cat, name) {
  const c = [];
  let m;
  if (cat === 'item') {
    if ((m = name.match(/^(.+)_spawn_egg$/))) {
      const x = m[1] === 'tropical_fish' ? 'tropicalfish' : m[1];
      c.push(`spawn_eggs/spawn_egg_${x}`, `egg_${x}`);
    }
    if ((m = name.match(/^([a-z_]+)_bundle(_open_back|_open_front)?$/)) && COLORS.includes(m[1])) c.push(`bundle_${m[1]}${m[2] || ''}`);
    if ((m = name.match(/^([a-z_]+)_harness$/))) c.push(`harness/harness_${m[1]}`);
    if ((m = name.match(/^music_disc_(.+)$/))) c.push(`record_${m[1]}`);
  }
  const sub = SUB[cat] && SUB[cat].get(name);
  if (sub) c.push(sub);
  c.push(name);
  return c;
}

/**
 * Java-Name -> Bedrock-Ziele. known = es gibt die Textur in Bedrock; none = bewusst kein Gegenstück.
 * -> { specs: [Name | {name, tint|opaque|path}], mapped, known, none }
 */
export function javaToBedrock(cat, name) {
  const set = BEDROCK_NAMES[cat];
  const t = cat === 'block' ? BLOCKS : cat === 'item' ? ITEMS : null;
  if (!set || !t) return { specs: [name], mapped: false, known: false };
  if (t[name]) {
    if (!t[name].length) return { specs: [], mapped: true, known: false, none: true };
    const specs = t[name].filter((x) => (typeof x === 'object' && x.path) || set.has(specName(x)));
    if (specs.length) return { specs, mapped: true, known: true };
  }
  for (const cand of ruleCandidates(cat, name)) if (set.has(cand)) return { specs: [cand], mapped: cand !== name, known: true };
  return { specs: t[name] && t[name].length ? [t[name][0]] : [name], mapped: !!t[name], known: false };
}

// Rückwärts: Bedrock -> Java. Nebenvarianten (z. B. chain2, kelp_b, *_opaque) gibt es in Java nicht.
const REV = { block: new Map(), item: new Map() };
const SECONDARY = { block: new Set(), item: new Set() };
for (const [cat, t] of [['block', BLOCKS], ['item', ITEMS]]) {
  for (const [java, list] of Object.entries(t)) {
    if (!list.length) continue;
    const first = specName(list[0]);
    if (!REV[cat].has(first) && !(typeof list[0] === 'object' && list[0].path)) REV[cat].set(first, java);
    for (const x of list.slice(1)) SECONDARY[cat].add(specName(x));
  }
  for (const j of JAVA_NAMES[cat]) {
    const r = javaToBedrock(cat, j);
    if (r.known && r.specs.length && typeof r.specs[0] === 'string' && !REV[cat].has(r.specs[0])) REV[cat].set(r.specs[0], j);
  }
}
REV.block.set('tallgrass', 'short_grass');

/** Bedrock-Name -> { name: Java-Name, known } */
export function bedrockToJava(cat, name) {
  const r = REV[cat] && REV[cat].get(name);
  const j = r || (name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name);
  return { name: j, known: !!(JAVA_NAMES[cat] && JAVA_NAMES[cat].has(j)) };
}

// Bedrock-Texturen, die es in Java nicht gibt (eingefärbte Inventar-Bilder, Laub für "schnell", Zusatz-Bilder)
export function bedrockOnly(cat, name) {
  if (cat !== 'block' && cat !== 'item') return false;
  if (SECONDARY[cat].has(name) && !REV[cat].has(name)) return true;
  if (cat !== 'block') return false;
  return /_carried$/.test(name) || /_opaque$/.test(name) || name === 'grass_side';
}

// Bedrock-Texturen, die Bedrock als Animation (Flipbook) abspielt – lange Streifen bleiben dort erhalten
export const BEDROCK_FLIPBOOKS = new Set([
  'water_still_grey', 'water_flow_grey', 'lava_still', 'lava_flow', 'fire_0', 'fire_1', 'soul_fire_0', 'soul_fire_1', 'portal', 'magma',
  'sea_lantern', 'prismarine_rough', 'seagrass', 'stonecutter2_saw', 'lantern', 'soul_lantern', 'campfire', 'campfire_log_lit',
  'soul_campfire', 'soul_campfire_log_lit', 'command_block_front_mipmap', 'command_block_back_mipmap', 'command_block_side_mipmap',
  'command_block_conditional_mipmap', 'chain_command_block_front_mipmap', 'chain_command_block_back_mipmap', 'chain_command_block_side_mipmap',
  'chain_command_block_conditional_mipmap', 'repeating_command_block_front_mipmap', 'repeating_command_block_back_mipmap',
  'repeating_command_block_side_mipmap', 'repeating_command_block_conditional_mipmap', 'respawn_anchor_top', 'kelp_a', 'kelp_top',
  'sculk', 'sculk_catalyst_side_bloom', 'sculk_catalyst_top_bloom', 'sculk_sensor_tendril_active', 'sculk_shrieker_inner_top',
  'calibrated_sculk_sensor_amethyst', 'sculk_vein', 'warped_stem_side', 'crimson_log_side',
]);
// Java-Namen, die in Java animiert sind (für .mcmeta beim Umwandeln von Bedrock nach Java)
export const JAVA_ANIMATED = {
  water_still: 2, water_flow: 2, lava_still: 2, lava_flow: 3, fire_0: 1, fire_1: 1, soul_fire_0: 1, soul_fire_1: 1, nether_portal: 1,
  magma: 8, sea_lantern: 5, prismarine: 300, seagrass: 1, stonecutter_saw: 1, lantern: 8, soul_lantern: 8, campfire_fire: 1,
  campfire_log_lit: 1, soul_campfire_fire: 1, soul_campfire_log_lit: 1, kelp: 1, kelp_plant: 1, respawn_anchor_top: 1, sculk: 1,
};

// ---------- Rüstung ----------
const ARMOR_BEDROCK = { leather: 'cloth', chainmail: 'chain', iron: 'iron', gold: 'gold', diamond: 'diamond', netherite: 'netherite', turtle: 'turtle' };
const ARMOR_BEDROCK_REV = Object.fromEntries(Object.entries(ARMOR_BEDROCK).map(([a, b]) => [b, a]));
const ARMOR_EQUIP = { turtle: 'turtle_scute' };
const ARMOR_EQUIP_REV = { turtle_scute: 'turtle' };

/** "diamond_layer_1" -> Pfad im Bedrock-Paket (ohne Endung) oder null */
export function armorToBedrock(name) {
  const m = name.match(/^(\w+?)_layer_([12])$/);
  if (!m || !ARMOR_BEDROCK[m[1]]) return null;
  return `textures/models/armor/${ARMOR_BEDROCK[m[1]]}_${m[2]}`;
}
export function armorFromBedrock(file) {
  const m = file.match(/^(\w+?)_([12])$/);
  if (!m || !ARMOR_BEDROCK_REV[m[1]]) return null;
  return `${ARMOR_BEDROCK_REV[m[1]]}_layer_${m[2]}`;
}
/** Java-Pfad (unter assets/minecraft/textures, ohne Endung) für ein Rüstungs-Bild */
export function armorToJava(name, packFormat) {
  const m = name.match(/^(\w+?)_layer_([12])(_overlay)?$/);
  if (!m) return null;
  if (packFormat >= 42) {
    const mat = ARMOR_EQUIP[m[1]] || m[1];
    return `entity/equipment/${m[2] === '1' ? 'humanoid' : 'humanoid_leggings'}/${mat}${m[3] || ''}`;
  }
  return `models/armor/${name}`;
}
export function armorFromJavaEquipment(folder, file) {
  const m = file.match(/^(\w+?)(_overlay)?$/);
  if (!m) return null;
  const mat = ARMOR_EQUIP_REV[m[1]] || m[1];
  const layer = folder === 'humanoid' ? 1 : folder === 'humanoid_leggings' ? 2 : 0;
  return layer ? `${mat}_layer_${layer}${m[2] || ''}` : null;
}

// ---------- Kreaturen, Umgebung, Sonstiges ----------
export const ENTITY_TO_BEDROCK = {
  'player/wide/steve': 'steve',
  'player/slim/alex': 'alex',
  'bed/light_gray': 'bed/silver',
};
export const ENTITY_FROM_BEDROCK = Object.fromEntries(Object.entries(ENTITY_TO_BEDROCK).map(([a, b]) => [b, a]));

export const MISC_TO_BEDROCK = { pumpkinblur: 'pumpkin_blur', enchanted_glint_item: 'enchanted_item_glint' };
export const MISC_FROM_BEDROCK = Object.fromEntries(Object.entries(MISC_TO_BEDROCK).map(([a, b]) => [b, a]));

export const ENVIRONMENT = new Set(['sun', 'moon_phases', 'clouds', 'end_sky']);

// Schrift: ascii.png <-> default8.png, unicode_page_xx.png <-> glyph_XX.png
export function fontToBedrock(name) {
  if (name === 'ascii') return 'font/default8';
  const m = name.match(/^unicode_page_([0-9a-f]{2})$/i);
  return m ? `font/glyph_${m[1].toUpperCase()}` : null;
}
export function fontFromBedrock(file) {
  if (file === 'default8') return 'ascii';
  const m = file.match(/^glyph_([0-9a-f]{2})$/i);
  return m ? `unicode_page_${m[1].toLowerCase()}` : null;
}

// Schallplatten liegen in Bedrock unter music/game/records
export function soundToBedrock(path) {
  return path.startsWith('records/') ? 'music/game/' + path : path;
}
export function soundFromBedrock(path) {
  return path.startsWith('music/game/records/') ? path.slice('music/game/'.length) : path;
}

// ---------- Item- und Block-IDs (für Rezepte und Befehle) ----------
const IDS = `
dirt_path=grass_path
magma_block=magma
slime_block=slime
jack_o_lantern=lit_pumpkin
nether_quartz_ore=quartz_ore
note_block=noteblock
cobweb=web
lily_pad=waterlily
spawner=mob_spawner
terracotta=hardened_clay
end_stone_bricks=end_bricks
bricks=brick_block
nether_bricks=nether_brick
red_nether_bricks=red_nether_brick
snow_block=snow
snow=snow_layer
map=empty_map
oak_door=wooden_door
oak_trapdoor=trapdoor
oak_fence_gate=fence_gate
oak_pressure_plate=wooden_pressure_plate
oak_button=wooden_button
carved_pumpkin=carved_pumpkin
melon=melon_block
powered_rail=golden_rail
sugar_cane=sugar_cane
cocoa_beans=cocoa_beans
`;
export const ID_TO_BEDROCK = {};
export const ID_TO_JAVA = {};
for (const line of IDS.split('\n')) {
  const s = line.trim();
  if (!s) continue;
  const [a, b] = s.split('=');
  if (a !== b) {
    ID_TO_BEDROCK['minecraft:' + a] = 'minecraft:' + b;
    ID_TO_JAVA['minecraft:' + b] = 'minecraft:' + a;
  }
}

// Gängige Tags aus Mods (c: = Fabric/NeoForge, forge: = Forge) -> passendes Vanilla-Item
const COMMON = {
  'ingots/iron': 'iron_ingot', 'ingots/gold': 'gold_ingot', 'ingots/copper': 'copper_ingot', 'ingots/netherite': 'netherite_ingot',
  'gems/diamond': 'diamond', 'gems/emerald': 'emerald', 'gems/lapis': 'lapis_lazuli', 'gems/quartz': 'quartz', 'gems/amethyst': 'amethyst_shard',
  'nuggets/iron': 'iron_nugget', 'nuggets/gold': 'gold_nugget', 'rods/wooden': 'stick', 'rods/blaze': 'blaze_rod',
  'dusts/redstone': 'redstone', 'dusts/glowstone': 'glowstone_dust', 'string': 'string', 'strings': 'string', 'leather': 'leather', 'leathers': 'leather',
  'cobblestone': 'cobblestone', 'cobblestones': 'cobblestone', 'stone': 'stone', 'stones': 'stone', 'glass': 'glass', 'glass_blocks': 'glass',
  'sand': 'sand', 'sands': 'sand', 'obsidian': 'obsidian', 'obsidians': 'obsidian', 'ender_pearls': 'ender_pearl', 'slimeballs': 'slime_ball', 'slime_balls': 'slime_ball',
  'gunpowder': 'gunpowder', 'gunpowders': 'gunpowder', 'bones': 'bone', 'feathers': 'feather', 'eggs': 'egg', 'crops/wheat': 'wheat',
  'chests/wooden': 'chest', 'chests': 'chest', 'storage_blocks/iron': 'iron_block', 'storage_blocks/gold': 'gold_block',
  'storage_blocks/diamond': 'diamond_block', 'storage_blocks/coal': 'coal_block', 'storage_blocks/redstone': 'redstone_block',
  'raw_materials/iron': 'raw_iron', 'raw_materials/gold': 'raw_gold', 'raw_materials/copper': 'raw_copper', 'coal': 'coal',
  'ores/iron': 'iron_ore', 'ores/gold': 'gold_ore', 'ores/diamond': 'diamond_ore', 'ores/coal': 'coal_ore',
};
/** "#c:ingots/iron" -> "minecraft:iron_ingot" | null */
export function commonTagItem(tag) {
  const m = tag.match(/^(?:c|forge|neoforge|fabric):(.+)$/);
  if (!m) return null;
  const it = COMMON[m[1]];
  return it ? 'minecraft:' + it : null;
}

// Java-Tags, die es mit gleichem Namen auch in Bedrock gibt
export const BEDROCK_ITEM_TAGS = new Set([
  'minecraft:planks', 'minecraft:logs', 'minecraft:wool', 'minecraft:coals', 'minecraft:wooden_slabs', 'minecraft:stone_crafting_materials',
  'minecraft:stone_tool_materials', 'minecraft:logs_that_burn', 'minecraft:soul_fire_base_blocks', 'minecraft:boats', 'minecraft:arrow',
  'minecraft:sand', 'minecraft:crimson_stems', 'minecraft:warped_stems', 'minecraft:mangrove_logs', 'minecraft:cherry_logs',
]);
const JAVA_TAG_TO_BEDROCK = { 'minecraft:stone_crafting_materials': 'minecraft:stone_crafting_materials', 'minecraft:coals': 'minecraft:coals' };
export function javaTagToBedrock(tag) {
  if (JAVA_TAG_TO_BEDROCK[tag]) return JAVA_TAG_TO_BEDROCK[tag];
  return BEDROCK_ITEM_TAGS.has(tag) ? tag : null;
}

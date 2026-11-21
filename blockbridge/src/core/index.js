// Einstieg: Datei(en) erkennen (analyze) und umwandeln (convert).
import { readZip, writeZip, isZip, subTree, findDirsWith } from './zip.js';
import { isPng } from './image.js';
import { extname, parseJson, safeFileName, stripExt, basename, toBytes, formatBytes } from './util.js';
import { Report } from './report.js';
import { javaLabelForDp, javaLabelForRp, resolveJavaTarget, JAVA_VERSIONS, LATEST_JAVA } from './versions.js';
import { canonStats, readBedrockRP, readJavaRP, writeBedrockRP, writeJavaRP, bedrockHeader } from './convert/resourcepack.js';
import { convertJavaDPVersion, readBedrockBP, readJavaDP, writeBedrockBP, writeJavaDP } from './convert/datapack.js';
import { looksLikeSkin, readBedrockSkinPack, skinForJava, skinsToBedrockPack } from './convert/skins.js';
import { modToBedrock, readMod, readModMeta } from './convert/mod.js';

export { JAVA_VERSIONS, LATEST_JAVA, formatBytes };

const KIND_TITLES = {
  'java-rp': 'Java-Ressourcenpaket',
  'java-dp': 'Java-Datenpaket',
  'java-rp-dp': 'Java-Ressourcen- und Datenpaket',
  'java-mod': 'Java-Mod',
  skins: 'Skin',
  'bedrock-rp': 'Bedrock-Ressourcenpaket',
  'bedrock-bp': 'Bedrock-Verhaltenspaket',
  'bedrock-addon': 'Bedrock-Add-on',
  'bedrock-skinpack': 'Bedrock-Skinpaket',
};

function unsupported(name, title, reason, tip) {
  return { kind: 'unsupported', title, name, supported: false, reason, tip, facts: [], notes: [], targets: {} };
}

/** inputs: [{ name, bytes }] -> Analyse für die Anzeige (+ interne Daten für convert) */
export function analyze(inputs) {
  if (!inputs || !inputs.length) throw new Error('Keine Datei ausgewählt.');
  const pngs = inputs.filter((f) => isPng(f.bytes));
  if (pngs.length === inputs.length) return analyzeSkins(inputs);
  const notes = [];
  if (inputs.length > 1) notes.push(`Mehrere Dateien ausgewählt – verarbeitet wird nur „${inputs[0].name}“.`);
  const a = analyzeOne(inputs[0]);
  a.notes = [...notes, ...(a.notes || [])];
  return a;
}

function analyzeSkins(inputs) {
  const skins = [];
  const notes = [];
  for (const f of inputs) {
    if (looksLikeSkin(f.bytes)) skins.push({ title: stripExt(f.name), data: f.bytes });
    else notes.push(`„${f.name}“ ist kein Skin (Skins sind 64×64 oder 64×32 Pixel groß) und wird ignoriert.`);
  }
  if (!skins.length) return unsupported(inputs[0].name, 'Bild', 'Das Bild ist kein Minecraft-Skin. Skins sind 64×64 (oder alt 64×32) Pixel groß.', 'Texturen bitte als ganzes Ressourcenpaket (.zip) hochladen.');
  return {
    kind: 'skins',
    title: skins.length > 1 ? `${skins.length} Skins` : 'Skin',
    edition: null,
    supported: true,
    name: skins.length > 1 ? 'Meine Skins' : skins[0].title,
    description: '',
    icon: null,
    preview: skins[0].data,
    facts: [{ label: 'Anzahl', value: String(skins.length) }],
    notes,
    targets: {
      bedrock: { available: true, label: 'Skinpaket für Bedrock', ext: 'mcpack' },
      java: { available: true, label: skins.length > 1 ? 'PNG-Skins für Java (ZIP)' : 'PNG-Skin für Java', ext: skins.length > 1 ? 'zip' : 'png', versions: false },
    },
    options: { skinModel: true },
    _ctx: { skins },
  };
}

function analyzeOne(input) {
  const { name, bytes } = input;
  const ext = extname(name);
  const baseName = stripExt(basename(name));
  if (!isZip(bytes)) {
    if (ext === 'mcworld' || ext === 'mctemplate') return worldInfo(name, 'bedrock');
    return unsupported(name, 'Unbekannte Datei', 'Diese Datei kann BlockBridge nicht lesen. Unterstützt werden .zip, .jar, .mcpack, .mcaddon und .png (Skins).');
  }
  const files = readZip(bytes);

  // Mods und Plugins
  if (readModMeta(files)) return analyzeMod(name, files);
  if (files.has('plugin.yml') || files.has('paper-plugin.yml') || files.has('bungee.yml')) {
    return unsupported(name, 'Server-Plugin', 'Das ist ein Server-Plugin (Bukkit/Spigot/Paper). Plugins laufen nur auf Java-Servern und lassen sich nicht in ein Bedrock-Add-on umwandeln.', 'Mit dem Server-Plugin „Geyser“ können Bedrock-Spieler auf Java-Server mit Plugins.');
  }
  if (ext === 'jar' && [...files.keys()].some((k) => k.endsWith('.class'))) {
    return unsupported(name, 'Java-Programm', 'In dieser .jar wurden keine Mod-Daten (fabric.mod.json, mods.toml) gefunden. Es ist vermutlich ein Programm oder eine Bibliothek.');
  }

  // Welten
  const levelDirs = findDirsWith(files, 'level.dat');
  if (levelDirs.length) {
    const d = levelDirs[0] ? levelDirs[0] + '/' : '';
    const bedrock = [...files.keys()].some((k) => k.startsWith(d + 'db/'));
    return worldInfo(name, bedrock ? 'bedrock' : 'java');
  }

  // Bedrock-Pakete
  const manifests = findDirsWith(files, 'manifest.json')
    .map((dir) => {
      const sub = subTree(files, dir);
      const m = parseJson(sub.get('manifest.json'));
      if (!m || !m.header) return null;
      const types = (m.modules || []).map((x) => x && x.type);
      return { dir, files: sub, manifest: m, types, header: bedrockHeader(sub, m) };
    })
    .filter(Boolean)
    // Unterpakete (subpacks/…) gehören zum Hauptpaket
    .filter((p, _, all) => !all.some((o) => o !== p && p.dir.startsWith(o.dir ? o.dir + '/' : '') && p.dir.includes('subpacks/')));
  if (manifests.length) return analyzeBedrock(name, baseName, manifests);

  // Java-Pakete
  const roots = findDirsWith(files, 'pack.mcmeta');
  let root = roots.length ? roots[0] : null;
  if (root == null) {
    // ohne pack.mcmeta: Ordner suchen, in dem assets/ oder data/ liegt
    for (const k of files.keys()) {
      const i = k.search(/(^|\/)(assets\/minecraft\/|data\/[^/]+\/(functions?|recipes?)\/)/);
      if (i >= 0) {
        root = k.slice(0, i);
        break;
      }
    }
  }
  if (root != null) return analyzeJavaPack(name, baseName, subTree(files, root), !roots.length);
  return unsupported(name, 'Unbekanntes Archiv', 'In diesem Archiv wurde kein Minecraft-Inhalt gefunden (kein pack.mcmeta, manifest.json, fabric.mod.json oder mods.toml).');
}

function worldInfo(name, edition) {
  return unsupported(
    name,
    edition === 'bedrock' ? 'Bedrock-Welt' : 'Java-Welt',
    'Welten umzuwandeln ist sehr aufwendig (jeder Block, jede Kiste, jedes Tier) und gehört nicht zu BlockBridge.',
    'Für Welten gibt es das kostenlose Programm „Chunker“ (chunker.app), das Java- und Bedrock-Welten ineinander umwandelt.',
  );
}

function analyzeMod(name, files) {
  const mod = readMod(files);
  const usable = mod.items.filter((i) => !i.skip).length + mod.blocks.length;
  const facts = [
    { label: 'Mod-Loader', value: mod.meta.loader },
    { label: 'Mod-ID', value: mod.meta.id || '–' },
    ...(mod.meta.version ? [{ label: 'Version', value: String(mod.meta.version) }] : []),
    { label: 'Items', value: String(mod.items.filter((i) => !i.skip).length) },
    { label: 'Blöcke', value: String(mod.blocks.length) },
    { label: 'Rezepte', value: String(mod.recipes.size) },
    { label: 'Programmcode', value: `${mod.classes} Java-${mod.classes === 1 ? 'Klasse' : 'Klassen'}` },
  ];
  const notes = ['Mods bestehen zum großen Teil aus Java-Programmcode. Übertragen werden Items, Blöcke (mit Textur, Name und einfacher Form) und Rezepte – Maschinen, Kreaturen, Effekte oder neue Dimensionen funktionieren in Bedrock nicht.'];
  return {
    kind: 'java-mod',
    title: KIND_TITLES['java-mod'],
    edition: 'java',
    supported: true,
    name: mod.meta.name,
    description: mod.meta.description,
    icon: mod.meta.iconData || null,
    facts,
    notes,
    targets: {
      bedrock: usable
        ? { available: true, label: 'Add-on für Bedrock', ext: 'mcaddon' }
        : { available: false, reason: 'In der Mod wurden keine Items oder Blöcke mit Texturen gefunden – es gibt nichts, was sich übertragen lässt.' },
      java: { available: false, reason: 'Das ist schon eine Java-Mod. Installiere sie mit Forge, NeoForge oder Fabric.' },
    },
    options: { modParts: true },
    _ctx: { files, mod },
  };
}

function analyzeBedrock(name, baseName, packs) {
  const world = packs.find((p) => p.types.includes('world_template'));
  if (world) return worldInfo(name, 'bedrock');
  const skin = packs.find((p) => p.types.includes('skin_pack'));
  if (skin) {
    const skins = readBedrockSkinPack(skin.files);
    return {
      kind: 'bedrock-skinpack', title: KIND_TITLES['bedrock-skinpack'], edition: 'bedrock', supported: skins.length > 0,
      reason: skins.length ? null : 'In diesem Skinpaket wurden keine Skin-Bilder gefunden.',
      name: skin.header.name || baseName, description: skin.header.description, icon: skin.files.get('pack_icon.png') || null,
      preview: skins[0] ? skins[0].data : null,
      facts: [{ label: 'Skins', value: String(skins.length) }], notes: [],
      targets: {
        bedrock: { available: false, reason: 'Das ist schon ein Bedrock-Skinpaket.' },
        java: { available: skins.length > 0, label: skins.length > 1 ? 'PNG-Skins für Java (ZIP)' : 'PNG-Skin für Java', ext: skins.length > 1 ? 'zip' : 'png', versions: false },
      },
      options: {}, _ctx: { skins },
    };
  }
  const rp = packs.find((p) => p.types.includes('resources'));
  const bp = packs.find((p) => p.types.includes('data') || p.types.includes('script'));
  const kind = rp && bp ? 'bedrock-addon' : rp ? 'bedrock-rp' : 'bedrock-bp';
  const main = rp || bp;
  const facts = [];
  const notes = [];
  let rpCanon = null, bpData = null;
  if (rp) {
    rpCanon = readBedrockRP(rp.files, null);
    const st = canonStats(rpCanon);
    facts.push({ label: 'Block-Texturen', value: String(st.block || 0) }, { label: 'Item-Texturen', value: String(st.item || 0) });
    if (st.entity) facts.push({ label: 'Kreaturen-Texturen', value: String(st.entity) });
    if (st.sounds) facts.push({ label: 'Sounds', value: String(st.sounds) });
  }
  if (bp) {
    bpData = readBedrockBP(bp.files);
    facts.push({ label: 'Funktionen', value: String(bpData.functions.size) }, { label: 'Rezepte', value: String(bpData.recipes.size) });
    for (const [k, label] of [['items', 'Eigene Items'], ['blocks', 'Eigene Blöcke'], ['entities', 'Kreaturen'], ['scripts', 'Skripte']]) {
      if (bpData.counts[k]) facts.push({ label, value: String(bpData.counts[k]) });
    }
    if (bpData.counts.items || bpData.counts.blocks || bpData.counts.entities || bpData.counts.scripts) {
      notes.push('Eigene Items, Blöcke, Kreaturen und Skripte aus Bedrock-Add-ons gibt es in Java nur mit Mods – übertragen werden Texturen, Funktionen und Rezepte.');
    }
  }
  if (packs.length > 2) notes.push(`Das Archiv enthält ${packs.length} Pakete – verwendet werden „${(rp || main).header.name}“${bp && rp ? ` und „${bp.header.name}“` : ''}.`);
  const rpUseful = rpCanon && rpCanon.textures.size + rpCanon.sounds.size > 0;
  const bpUseful = bpData && bpData.functions.size + bpData.recipes.size > 0;
  return {
    kind, title: KIND_TITLES[kind], edition: 'bedrock', supported: true,
    name: main.header.name || baseName, description: main.header.description,
    icon: (rp && rp.files.get('pack_icon.png')) || (bp && bp.files.get('pack_icon.png')) || null,
    facts, notes,
    targets: {
      bedrock: { available: false, reason: 'Das ist schon ein Bedrock-Paket.' },
      java: rpUseful || bpUseful
        ? { available: true, label: kind === 'bedrock-addon' ? 'Ressourcen- und Datenpaket für Java (ZIP)' : kind === 'bedrock-rp' ? 'Ressourcenpaket für Java' : 'Datenpaket für Java', ext: 'zip', versions: true, needsDp: !!bpUseful, needsRp: !!rpUseful }
        : { available: false, reason: 'In diesem Paket gibt es nichts, was Java versteht (keine Vanilla-Texturen, Funktionen oder Rezepte).' },
    },
    options: { namespace: !!bpUseful },
    _ctx: { rp, bp, rpCanon, bpData },
  };
}

function analyzeJavaPack(name, baseName, files, noMcmeta) {
  const hasAssets = [...files.keys()].some((k) => k.startsWith('assets/'));
  const hasData = [...files.keys()].some((k) => k.startsWith('data/'));
  const kind = hasAssets && hasData ? 'java-rp-dp' : hasData ? 'java-dp' : 'java-rp';
  const facts = [];
  const notes = [];
  const canon = hasAssets ? readJavaRP(files, baseName) : null;
  const dp = hasData ? readJavaDP(files) : null;
  const fmt = canon ? canon.format : dp.format;
  if (noMcmeta) notes.push('pack.mcmeta fehlt – die Minecraft-Version des Pakets ist unbekannt.');
  if (fmt) facts.push({ label: 'Gemacht für', value: `Java ${hasAssets && kind !== 'java-dp' ? javaLabelForRp(fmt) : javaLabelForDp(fmt)} (Format ${fmt})` });
  if (canon) {
    const st = canonStats(canon);
    facts.push({ label: 'Block-Texturen', value: String(st.block || 0) }, { label: 'Item-Texturen', value: String(st.item || 0) });
    if (st.entity) facts.push({ label: 'Kreaturen-Texturen', value: String(st.entity) });
    if (st.armor) facts.push({ label: 'Rüstungs-Texturen', value: String(st.armor) });
    if (st.sounds) facts.push({ label: 'Sounds', value: String(st.sounds) });
    if (st.other) facts.push({ label: 'Menü- & sonstige Bilder', value: String(st.other) });
    const models = [...canon.javaOther.keys()].filter((k) => k.startsWith('models/')).length;
    if (models) notes.push(`Das Paket enthält ${models} eigene 3D-Modelle. Bedrock nutzt ein anderes Modellformat – Blöcke behalten dort ihre normale Form, nur die Texturen ändern sich.`);
    if ([...canon.javaOther.keys()].some((k) => k.startsWith('optifine/')) || [...canon.passthrough.keys()].some((k) => k.includes('/optifine/'))) {
      notes.push('OptiFine-Funktionen (verbundene Texturen, eigene Mob-Modelle …) gibt es in Bedrock nicht.');
    }
  }
  if (dp) {
    facts.push({ label: 'Funktionen', value: String(dp.functions.size) }, { label: 'Rezepte', value: String(dp.recipes.size) });
    if (dp.other.size) facts.push({ label: 'Weitere Datenpaket-Dateien', value: String(dp.other.size) });
  }
  const mcmeta = files.has('pack.mcmeta') ? parseJson(files.get('pack.mcmeta')) : null;
  const desc = canon ? canon.meta.description : dp.description;
  return {
    kind, title: KIND_TITLES[kind], edition: 'java', supported: true,
    name: baseName, description: desc, icon: files.get('pack.png') || null,
    facts, notes, format: fmt, hasOverlays: !!(mcmeta && mcmeta.overlays),
    targets: {
      bedrock: { available: true, label: kind === 'java-rp' ? 'Ressourcenpaket für Bedrock' : kind === 'java-dp' ? 'Verhaltenspaket für Bedrock (experimentell)' : 'Add-on für Bedrock', ext: kind === 'java-rp-dp' ? 'mcaddon' : 'mcpack' },
      java: { available: true, label: 'Für eine andere Java-Version', ext: 'zip', versions: true, needsDp: !!dp, needsRp: !!canon, legacyOk: !dp },
    },
    options: {},
    _ctx: { files, canon, dp },
  };
}

// ---------- Umwandeln ----------
const JAVA_RP_HINT = 'In Minecraft: Optionen → Ressourcenpakete → „Paketordner öffnen“ → Datei hineinziehen → Paket aktivieren.';
const README_JAVA = (rpName, dpName) => [
  'So installierst du die Dateien in Minecraft Java Edition:',
  '',
  ...(rpName ? [`Ressourcenpaket: „${rpName}“`, '  Optionen → Ressourcenpakete → „Paketordner öffnen“ → Datei hineinziehen → Paket aktivieren.', ''] : []),
  ...(dpName ? [`Datenpaket: „${dpName}“`, '  Beim Erstellen einer Welt: „Datenpakete“ → Datei hineinziehen.', '  Bei einer bestehenden Welt: Datei in den Ordner saves/<Welt>/datapacks kopieren und /reload eingeben.', ''] : []),
  'Umgewandelt mit BlockBridge.',
].join('\r\n');

/**
 * target: { edition: 'bedrock' | 'java', javaVersion?, customRp?, customDp? }
 * opts: { name, description, model, items, blocks, recipes, namespace }
 * -> { fileName, bytes, mime, report, openable, kind, instructions }
 */
export function convert(analysis, target, opts = {}) {
  const report = new Report();
  const name = (opts.name || analysis.name || 'BlockBridge').trim();
  const o = { ...opts, name, description: opts.description != null && opts.description !== '' ? opts.description : analysis.description };
  const ctx = analysis._ctx;
  const out = (fileName, files, instructions) => {
    const bytes = files instanceof Uint8Array ? files : writeZip(files);
    const ext = extname(fileName);
    return {
      fileName,
      bytes,
      mime: ext === 'png' ? 'image/png' : 'application/octet-stream',
      report: report.toJSON(),
      openable: ext === 'mcpack' || ext === 'mcaddon',
      edition: target.edition,
      instructions,
    };
  };
  const fname = safeFileName(name);

  if (target.edition === 'bedrock') {
    if (!analysis.targets.bedrock || !analysis.targets.bedrock.available) throw new Error(analysis.targets.bedrock?.reason || 'Nicht möglich.');
    const bedrockHint = 'Tippe auf „In Minecraft öffnen“ (oder öffne die Datei mit Minecraft) – Minecraft importiert das Paket dann selbst. Danach in den Welteinstellungen unter „Ressourcenpakete“ bzw. „Verhaltenspakete“ aktivieren.';
    switch (analysis.kind) {
      case 'java-rp': {
        const files = writeBedrockRP(ctx.canon, o, report);
        return out(`${fname}.mcpack`, files, bedrockHint);
      }
      case 'java-dp': {
        const files = writeBedrockBP(ctx.dp, o, report);
        report.info('Hinweis', 'Bedrock-Befehle unterscheiden sich von Java – teste die Funktionen in einer Kopie deiner Welt.');
        return out(`${fname}.mcpack`, files, bedrockHint);
      }
      case 'java-rp-dp': {
        const bpFiles = new Map();
        const rpFiles = writeBedrockRP(ctx.canon, { ...o, name: name + ' (Ressourcen)' }, report);
        writeBedrockBP(ctx.dp, { ...o, name: name + ' (Verhalten)' }, report, bpFiles);
        const all = new Map();
        for (const [p, d] of rpFiles) all.set(`${fname} RP/${p}`, d);
        for (const [p, d] of bpFiles) all.set(`${fname} BP/${p}`, d);
        return out(`${fname}.mcaddon`, all, bedrockHint);
      }
      case 'java-mod': {
        const r = modToBedrock(ctx.files, ctx.mod, o, report);
        if (!r) throw new Error('Aus dieser Mod ließen sich keine Items oder Blöcke übertragen.');
        const all = new Map();
        for (const [p, d] of r.rp) all.set(`${fname} RP/${p}`, d);
        for (const [p, d] of r.bp) all.set(`${fname} BP/${p}`, d);
        report.info('Neue Items und Blöcke finden', 'Im Kreativmodus im Inventar (Kategorien Items/Ausrüstung/Bau/Natur) oder per /give @s ' + (ctx.mod.meta.id || 'mod') + ':<name>');
        return out(`${fname}.mcaddon`, all, 'Tippe auf „In Minecraft öffnen“ – Minecraft importiert beide Pakete. Dann in den Welteinstellungen das Verhaltenspaket aktivieren (das Ressourcenpaket kommt automatisch mit).');
      }
      case 'skins': {
        const files = skinsToBedrockPack(ctx.skins, o, report);
        return out(`${fname}.mcpack`, files, 'In Minecraft öffnen, dann: Umkleidekabine → Klassische Skins → neues Paket. Einzelne Skins kannst du dort auch direkt als PNG importieren.');
      }
      default:
        throw new Error('Nicht möglich.');
    }
  }

  // ---------- Java ----------
  if (!analysis.targets.java || !analysis.targets.java.available) throw new Error(analysis.targets.java?.reason || 'Nicht möglich.');
  const version = resolveJavaTarget(target);
  if (analysis.kind === 'skins' || analysis.kind === 'bedrock-skinpack') {
    const list = ctx.skins.map((s) => skinForJava(s, report)).filter(Boolean);
    if (!list.length) throw new Error('Keiner der Skins konnte umgewandelt werden.');
    const hint = 'Skin hochladen: im Minecraft Launcher unter „Skins“ → „Neuer Skin“ (oder auf minecraft.net im Profil). Wähle dabei das angegebene Modell (normal/schmal).';
    if (list.length === 1) {
      report.info('Modell beim Hochladen', list[0].slim ? 'Schmal (Alex)' : 'Normal (Steve)');
      return out(`${safeFileName(list[0].title)}.png`, list[0].data, hint);
    }
    const files = new Map();
    const used = new Set();
    for (const s of list) {
      let n = safeFileName(s.title) + (s.slim ? ' (schmal)' : '');
      while (used.has(n)) n += '_';
      used.add(n);
      files.set(`${n}.png`, s.data);
    }
    return out(`${fname} Skins.zip`, files, hint);
  }

  const vlabel = version.id === 'custom' ? version.label : 'Java ' + version.label;
  const javaName = `${fname} (${vlabel.replace(/[–]/g, '-').replace(/\s+/g, ' ')})`;
  const dpName = `${fname} Datenpaket (${vlabel.replace(/[–]/g, '-')})`;
  switch (analysis.kind) {
    case 'java-rp': {
      const files = writeJavaRP(ctx.canon, version, o, report);
      return out(`${javaName}.zip`, files, JAVA_RP_HINT);
    }
    case 'java-dp': {
      if (!version.dp) throw new Error('Datenpakete gibt es erst ab Java 1.13.');
      const files = convertJavaDPVersion(ctx.dp, version, o, report);
      return out(`${dpName}.zip`, files, 'Datei in den Ordner saves/<Welt>/datapacks kopieren und /reload eingeben (oder beim Erstellen einer Welt unter „Datenpakete“ hineinziehen).');
    }
    case 'java-rp-dp': {
      if (!version.dp) throw new Error('Datenpakete gibt es erst ab Java 1.13.');
      const rp = writeJavaRP(ctx.canon, version, o, report);
      const dp = convertJavaDPVersion(ctx.dp, version, o, report);
      const all = new Map([[`${javaName}.zip`, writeZip(rp)], [`${dpName}.zip`, writeZip(dp)], ['LIESMICH.txt', toBytes(README_JAVA(javaName, dpName))]]);
      return out(`${fname} (Java).zip`, all, 'Die ZIP enthält ein Ressourcenpaket und ein Datenpaket – siehe LIESMICH.txt.');
    }
    case 'bedrock-rp':
    case 'bedrock-bp':
    case 'bedrock-addon': {
      let rpFiles = null, dpFiles = null;
      if (ctx.rpCanon && ctx.rpCanon.textures.size + ctx.rpCanon.sounds.size > 0) {
        const fresh = readBedrockRP(ctx.rp.files, report);
        rpFiles = writeJavaRP(fresh, version, o, report);
      }
      if (ctx.bpData && ctx.bpData.functions.size + ctx.bpData.recipes.size > 0) {
        if (!version.dp) report.warn('Datenpakete gibt es erst ab Java 1.13 – Funktionen und Rezepte wurden weggelassen');
        else dpFiles = writeJavaDP(ctx.bpData, version, { ...o, namespace: o.namespace || name }, report);
      } else if (ctx.bpData) {
        for (const [p, top] of ctx.bpData.other) report.skip(top === 'items' || top === 'blocks' || top === 'entities' ? `Eigene ${top === 'items' ? 'Items' : top === 'blocks' ? 'Blöcke' : 'Kreaturen'} (${top}/) – für Java bräuchte man eine Mod` : 'Sonstige Bedrock-Dateien', p);
      }
      if (rpFiles && dpFiles) {
        const all = new Map([[`${javaName}.zip`, writeZip(rpFiles)], [`${dpName}.zip`, writeZip(dpFiles)], ['LIESMICH.txt', toBytes(README_JAVA(javaName, dpName))]]);
        return out(`${fname} (Java).zip`, all, 'Die ZIP enthält ein Ressourcenpaket und ein Datenpaket – siehe LIESMICH.txt.');
      }
      if (rpFiles) return out(`${javaName}.zip`, rpFiles, JAVA_RP_HINT);
      if (dpFiles) return out(`${dpName}.zip`, dpFiles, 'Datei in den Ordner saves/<Welt>/datapacks kopieren und /reload eingeben (oder beim Erstellen einer Welt unter „Datenpakete“ hineinziehen).');
      throw new Error('In diesem Paket gibt es nichts, was sich für Java umwandeln lässt.');
    }
    default:
      throw new Error('Nicht möglich.');
  }
}

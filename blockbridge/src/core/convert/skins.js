// Skins: PNG (Java) <-> Bedrock-Skinpaket (.mcpack mit skins.json)
import { blit, createImage, decodePng, downscale, encodePng, isPng, pngSize } from '../image.js';
import { humanize, jsonBytes, parseJson, safeId, stripExt, toBytes, toText, uuid, basename } from '../util.js';

export function looksLikeSkin(bytes) {
  const s = pngSize(bytes);
  if (!s) return false;
  return (s.width === 64 && (s.height === 64 || s.height === 32)) || (s.width === 128 && s.height === 128);
}

/** Alex-Modell (3 Pixel breite Arme)? Bei schmalen Skins ist dieser Streifen am rechten Arm leer. */
export function isSlim(img) {
  if (img.height !== img.width) return false;
  const k = img.width / 64;
  let empty = 0, total = 0;
  for (let y = 20 * k; y < 32 * k; y++) {
    for (let x = 54 * k; x < 56 * k; x++) {
      total++;
      if (img.data[(y * img.width + x) * 4 + 3] === 0) empty++;
    }
  }
  return total > 0 && empty === total;
}

/** Altes 64x32-Format auf 64x64 erweitern (linkes Bein/linker Arm = gespiegelte rechte Seite, wie Java es macht). */
export function upgradeLegacySkin(img) {
  if (img.height !== 32) return img;
  const out = createImage(64, 64);
  blit(img, 0, 0, 64, 32, out, 0, 0);
  // Bein: Quelle (0,16) 16x16 -> Ziel (16,48), Arm: Quelle (40,16) -> Ziel (32,48); jeweils Teile gespiegelt
  const limb = (sx, sy, dx, dy) => {
    blit(img, sx + 4, sy, 4, 4, out, dx + 4, dy, true); // oben
    blit(img, sx + 8, sy, 4, 4, out, dx + 8, dy, true); // unten
    blit(img, sx + 0, sy + 4, 4, 12, out, dx + 8, dy + 4, true); // außen -> innen
    blit(img, sx + 4, sy + 4, 4, 12, out, dx + 4, dy + 4, true); // vorne
    blit(img, sx + 8, sy + 4, 4, 12, out, dx + 0, dy + 4, true); // innen -> außen
    blit(img, sx + 12, sy + 4, 4, 12, out, dx + 12, dy + 4, true); // hinten
  };
  limb(0, 16, 16, 48);
  limb(40, 16, 32, 48);
  return out;
}

/** PNG-Skins -> Bedrock-Skinpaket */
export function skinsToBedrockPack(skins, opts, report) {
  const packId = safeId(opts.name || 'BlockBridge Skins').replace(/[^a-z0-9_]/g, '_').slice(0, 40) || 'blockbridge_skins';
  const serial = 'BlockBridge_' + packId;
  const files = new Map();
  const entries = [];
  const lang = [`skinpack.${serial}=${opts.name || 'BlockBridge Skins'}`];
  skins.forEach((s, i) => {
    let img = decodePng(s.data);
    let upgraded = false;
    if (img.height === 32) {
      img = upgradeLegacySkin(img);
      upgraded = true;
    }
    const model = opts.model && opts.model !== 'auto' ? opts.model : isSlim(img) ? 'slim' : 'classic';
    const file = `skin_${i + 1}.png`;
    files.set(file, upgraded ? encodePng(img) : s.data);
    const key = `skin_${i + 1}`;
    entries.push({
      localization_name: key,
      geometry: model === 'slim' ? 'geometry.humanoid.customSlim' : 'geometry.humanoid.custom',
      texture: file,
      type: 'free',
    });
    lang.push(`skin.${serial}.${key}=${s.title}`);
    report.ok('Skins übernommen', `${s.title} (${model === 'slim' ? 'schmale Arme / Alex' : 'normale Arme / Steve'}${upgraded ? ', von 64×32 auf 64×64 erweitert' : ''})`);
  });
  files.set('skins.json', jsonBytes({ skins: entries, serialize_name: serial, localization_name: serial }));
  files.set('manifest.json', jsonBytes({
    format_version: 1,
    header: { name: opts.name || 'BlockBridge Skins', uuid: uuid(), version: [1, 0, 0] },
    modules: [{ type: 'skin_pack', uuid: uuid(), version: [1, 0, 0] }],
  }));
  files.set('texts/en_US.lang', toBytes(lang.join('\n') + '\n'));
  files.set('texts/de_DE.lang', toBytes(lang.join('\n') + '\n'));
  files.set('texts/languages.json', jsonBytes(['en_US', 'de_DE']));
  report.info('So nutzt du das Skinpaket', 'Datei in Minecraft öffnen, dann Umkleidekabine → Klassische Skins → das neue Paket auswählen');
  return files;
}

/** Bedrock-Skinpaket lesen: [{ title, data, slim }] */
export function readBedrockSkinPack(files) {
  const sj = parseJson(files.get('skins.json'));
  const out = [];
  if (!sj || !Array.isArray(sj.skins)) return out;
  const lang = {};
  const lf = files.get('texts/en_US.lang') || files.get('texts/de_DE.lang');
  if (lf) {
    for (const line of toText(lf).split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) lang[line.slice(0, i).trim()] = line.slice(i + 1).replace(/\t*#.*$/, '').trim();
    }
  }
  const serial = sj.localization_name || sj.serialize_name || '';
  for (const s of sj.skins) {
    if (!s || !s.texture) continue;
    const data = files.get(s.texture) || files.get(String(s.texture).replace(/^\.?\//, ''));
    if (!data) continue;
    const key = s.localization_name || stripExt(basename(s.texture));
    const title = lang[`skin.${serial}.${key}`] || humanize(key);
    const geom = String(s.geometry || '');
    out.push({ title, data, slim: /slim/i.test(geom), customGeometry: !/^geometry\.humanoid(\.custom(Slim)?)?$/i.test(geom), file: s.texture });
  }
  return out;
}

/** Skin für Java vorbereiten (64x64 PNG). */
export function skinForJava(skin, report) {
  if (!isPng(skin.data)) {
    report.skip('Skins, die kein PNG sind', skin.title);
    return null;
  }
  let img = decodePng(skin.data);
  let changed = false;
  if (img.width === 128 && img.height === 128) {
    img = downscale(img, 2);
    changed = true;
    report.warn('HD-Skins auf 64×64 verkleinert (Java kann nur 64×64)', skin.title);
  } else if (img.height === 32 && img.width === 64) {
    img = upgradeLegacySkin(img);
    changed = true;
  } else if (!(img.width === 64 && img.height === 64)) {
    report.skip('Skins mit ungewöhnlicher Größe', `${skin.title} (${img.width}×${img.height})`);
    return null;
  }
  if (skin.customGeometry) report.warn('Skins mit eigenem 3D-Modell – in Java sieht nur der Grundkörper richtig aus', skin.title);
  const slim = skin.slim ?? isSlim(img);
  report.ok('Skins umgewandelt', `${skin.title} – Modell: ${slim ? 'schmal (Alex)' : 'normal (Steve)'}`);
  return { title: skin.title, data: changed ? encodePng(img) : skin.data, slim };
}

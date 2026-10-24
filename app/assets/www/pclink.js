// "PC verbinden": Hardware-Daten vom PowerShell-Skript (assets/pclink.ps1) in Import-Kandidaten umwandeln.
'use strict';

const MB_MAKERS = [[/asustek|^asus/i, 'ASUS'], [/micro-star|^msi/i, 'MSI'], [/gigabyte/i, 'Gigabyte'], [/asrock/i, 'ASRock'],
  [/biostar/i, 'Biostar'], [/nzxt/i, 'NZXT'], [/evga/i, 'EVGA']];
const MONITOR_MAKERS = { GSM: 'LG', SAM: 'Samsung', SEC: 'Samsung', AUS: 'ASUS', DEL: 'Dell', ACR: 'Acer', AOC: 'AOC', BNQ: 'BenQ',
  MSI: 'MSI', MSG: 'MSI', GBT: 'Gigabyte', HPN: 'HP', HWP: 'HP', PHL: 'Philips', LEN: 'Lenovo', VSC: 'ViewSonic', IVM: 'iiyama',
  AOR: 'Aorus', XMI: 'Xiaomi', KOO: 'KOORUI', HKC: 'HKC', SNY: 'Sony', ALN: 'Alienware', NEC: 'NEC', EIZ: 'EIZO' };
const USB_VENDORS = { '046D': 'Logitech', 1532: 'Razer', 1038: 'SteelSeries', '0951': 'HyperX', '03F0': 'HyperX', '1B1C': 'Corsair',
  3434: 'Keychron', '31E3': 'Wooting', '1E7D': 'ROCCAT', '0B05': 'ASUS', 3367: 'Endgame Gear', '045E': 'Microsoft', '054C': 'Sony',
  '0FD9': 'Elgato', '1235': 'Focusrite', '1395': 'Sennheiser', '0D8C': '', '1A2C': '', '258A': '', '04D9': '', '0C45': '' };

// Namen, die Windows für viele Geräte gleich vergibt und die nichts über das Modell sagen
const GENERIC = /^(hid|usb|generic|standard|composite|root hub|receiver|input|keyboard|mouse|consumer control|system control|vendor|unknown|bluetooth|microsoft bluetooth|realtek|high definition|nvidia|amd|intel|steam|virtual|voicemeeter|digital audio|speakers|lautsprecher|kopfhörer|headphones|mikrofon|microphone|line|wireless controller$|integrated|unifying|hub)\b|enumerator|compliant|wave link|nahimic|sonic studio|dolby|dts/i;

function decodePcCode(text) {
  const m = /SBPC1\.([A-Za-z0-9+/=_-]+)/.exec(text || '');
  if (!m) return null;
  try { return JSON.parse(b64urlDecode(m[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))); } catch (e) { return null; }
}

const gib2gb = g => Math.round((+g || 0) * 1.073741824); // Windows rechnet in GiB, Hersteller in GB

function pcItem(text, cat, extra) {
  const m = matchLine(text, cat);
  const ok = m && m.cat === cat;
  return { cat, id: ok ? m.id : null, quality: ok ? m.quality : 'custom', name: text.replace(/\s+/g, ' ').trim().slice(0, 120), price: null, qty: 1,
    source: 'pc', checked: true, ...extra };
}

function pcScanToItems(scan) {
  const items = [];
  if (!scan || typeof scan !== 'object') return items;
  const str = v => (typeof v === 'string' ? v : '').trim();

  // CPU
  const cpu = str(scan.cpu && scan.cpu.name).replace(/\s+\d+-Core Processor$/i, '').replace(/\(R\)|\(TM\)|CPU @.*$/gi, '').replace(/\s+/g, ' ');
  if (cpu) items.push(pcItem(cpu, 'cpu'));

  // Mainboard (Hersteller-Kürzel vereinheitlichen, Werks-Modellnummern wie "(MS-7D75)" weglassen)
  if (scan.mb) {
    const maker = (MB_MAKERS.find(([re]) => re.test(str(scan.mb.maker))) || [null, str(scan.mb.maker)])[1];
    const product = str(scan.mb.product).replace(/\(MS-\w+\)/i, '').trim();
    if (product && !/to be filled|default string|^\d+$/i.test(product)) items.push(pcItem(`${maker} ${product}`, 'mb'));
  }

  // RAM: Riegel zusammenfassen
  const sticks = (Array.isArray(scan.ram) ? scan.ram : []).filter(r => r && r.size > 0);
  if (sticks.length) {
    const size = Math.round(sticks[0].size);
    const total = sticks.reduce((s, r) => s + Math.round(r.size), 0);
    const speed = Math.max(...sticks.map(r => +r.maxSpeed || +r.speed || 0));
    const t = { 24: 'DDR3', 26: 'DDR4', 34: 'DDR5' }[sticks[0].type] || (speed >= 4800 ? 'DDR5' : speed >= 2133 ? 'DDR4' : 'DDR3');
    const part = str(sticks[0].part);
    const maker = /^(0x|unknown|undefined)/i.test(str(sticks[0].maker)) ? '' : str(sticks[0].maker);
    const text = `${maker} ${t} ${total}GB ${sticks.length}x${size}GB ${t}-${speed} ${part}`;
    const it = pcItem(text, 'ram');
    it.name = `${maker ? maker + ' ' : ''}${total} GB (${sticks.length}×${size} GB) ${t}-${speed}${part ? ' · ' + part : ''}`;
    items.push(it);
  }

  // Grafikkarte(n): virtuelle Adapter weg, iGPU weg, wenn es eine echte Grafikkarte gibt
  let gpus = (Array.isArray(scan.gpu) ? scan.gpu : []).filter(g => str(g.name) && !/basic display|remote|virtual|parsec|meta |oculus|dummy|citrix|vmware|hyper-v|idd|spacedesk|displaylink|mirage/i.test(g.name));
  const isIgpu = g => /radeon\(tm\) graphics$|radeon graphics$|uhd graphics|iris|intel\(r\) graphics|hd graphics|vega \d+ graphics/i.test(g.name);
  if (gpus.some(g => !isIgpu(g))) gpus = gpus.filter(g => !isIgpu(g));
  for (const g of gpus.slice(0, 2)) {
    if (isIgpu(g)) continue; // Nur integrierte Grafik -> keine Grafikkarte eintragen
    items.push(pcItem(`${str(g.name)}${g.vram ? ` ${Math.round(g.vram)}GB` : ''}`, 'gpu'));
  }

  // Laufwerke (USB-Sticks und Kartenleser weglassen)
  for (const d of (Array.isArray(scan.disks) ? scan.disks : []).slice(0, 6)) {
    if (!str(d.name) || /usb|sd|mmc/i.test(str(d.bus)) || /virtual|msft/i.test(d.name)) continue;
    const gb = gib2gb(d.size);
    const sizeText = gb >= 900 ? `${Math.round(gb / 1000)}TB` : `${gb}GB`;
    const type = /nvme/i.test(str(d.bus)) ? 'NVMe' : /hdd/i.test(str(d.media)) ? 'HDD' : 'SSD';
    const it = pcItem(`${str(d.name)} ${sizeText} ${type === 'HDD' ? 'HDD Festplatte' : type}`, 'storage');
    it.name = normText(d.name).includes(normText(sizeText)) ? str(d.name) : `${str(d.name)} (${sizeText})`;
    items.push(it);
  }

  // Monitore
  for (const mon of (Array.isArray(scan.monitors) ? scan.monitors : []).slice(0, 3)) {
    const brand = MONITOR_MAKERS[str(mon.maker).toUpperCase()] || str(mon.maker);
    const name = str(mon.name);
    if (!name && !brand) continue;
    const text = name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
    items.push(pcItem(text.trim() || `${brand} Monitor`, 'monitor'));
  }

  // Angeschlossene Geräte: Maus, Tastatur, Headset, Webcam, Controller, Mikrofon …
  const seen = new Set(items.map(i => normText(i.name)));
  const taken = {};
  for (const d of Array.isArray(scan.devices) ? scan.devices : []) {
    const cls = str(d.cls);
    let label = str(d.desc) && !GENERIC.test(str(d.desc)) ? str(d.desc) : str(d.name);
    const inner = /\(([^()]+(?:\([^()]*\))?[^()]*)\)\s*$/.exec(label); // "Headphones (Arctis Nova 7)" -> "Arctis Nova 7"
    if (cls === 'AudioEndpoint' && inner) label = inner[1];
    label = label.replace(/\s+/g, ' ').trim();
    if (label.length < 3 || GENERIC.test(label) || /\b(hub|receiver|enumerator|adapter|controller \(|audio device)\b/i.test(label) && cls !== 'XnaComposite') continue;
    if (/realtek|nvidia|amd|intel|high definition|virtual|steam|vb-audio|voicemeeter|nahimic/i.test(label)) continue;
    const brand = USB_VENDORS[str(d.vid).toUpperCase()];
    const text = brand && !normText(label).includes(normText(brand)) ? `${brand} ${label}` : label;
    const key = normText(label);
    if (seen.has(key) || seen.has(normText(text))) continue;
    seen.add(key);

    let cat = null;
    const m = matchLine(text);
    if (m && m.id && ['mouse', 'keyboard', 'headset', 'monitor', 'extras'].includes(m.cat)) cat = m.cat;
    else if (cls === 'Mouse' || /\bmaus\b|mouse|g\d{3}\b|deathadder|viper|basilisk|superlight|pulsar|xm2|op1/i.test(label)) cat = 'mouse';
    else if (cls === 'Keyboard' || /keyboard|tastatur|wooting|keychron|huntsman|apex|alloy|k\d{2}\b/i.test(label)) cat = 'keyboard';
    else if (/mic|mikro|wave|quadcast|yeti|podmic|shure|rode/i.test(label)) cat = 'extras';
    else if (cls === 'AudioEndpoint' || cls === 'MEDIA' || /headset|headphone|kopfh|arctis|cloud|blackshark|kraken|pro x|virtuoso|nova|wh-|wf-|airpods|buds|maxwell/i.test(label)) cat = 'headset';
    else if (cls === 'Camera' || cls === 'Image' || /webcam|brio|c9\d\d|kiyo|facecam/i.test(label)) cat = 'extras';
    else if (cls === 'XnaComposite' || /controller|dualsense|gamepad/i.test(label)) cat = 'extras';
    else if (cls === 'Bluetooth') cat = 'extras';
    if (!cat) continue;
    const it = pcItem(text, cat);
    // Bei Einzel-Slots (Maus, Tastatur, Headset) nur das erste Gerät vorauswählen
    if (!CAT[cat].multi) { it.checked = !taken[cat]; taken[cat] = true; }
    if (cls === 'Bluetooth' && !it.id) it.checked = false; // Bluetooth-Geräte können auch Handy/Lautsprecher sein
    items.push(it);
  }
  return items;
}

// Was Windows nicht auslesen kann
const PC_NOT_DETECTABLE = 'Netzteil, Gehäuse, CPU-Kühler, Lüfter und Kopfhörer mit Klinkenstecker kann Windows nicht erkennen – die bitte im Builder ergänzen.';

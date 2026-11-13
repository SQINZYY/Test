// Musik: Datei dekodieren, in der Vorschau abspielen und für den Export fertig mischen
// (Startpunkt, Lautstärke, Schleife, Ausblenden am Ende).

let ac = null;
export function audioCtx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  return ac;
}

export async function decodeMusic(blob) {
  const data = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const p = audioCtx().decodeAudioData(data, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

const FADE_OUT = 2.5;

/** Spielt die Musik passend zur Vorschau ab. */
export class MusicPlayer {
  constructor() {
    this.buffer = null;
    this.src = null;
    this.gain = null;
  }

  setBuffer(buffer) {
    this.stop();
    this.buffer = buffer;
  }

  /** Startet bei Diashow-Zeit t (Sekunden); total = Länge der Diashow. */
  start(t, music, total) {
    this.stop();
    if (!this.buffer || !music) return;
    const ctx = audioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    const g = ctx.createGain();
    src.connect(g).connect(ctx.destination);
    const vol = music.volume ?? 1;
    const now = ctx.currentTime + 0.02;
    const left = Math.max(0.05, total - t);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol * envelope(t, music, total), now + 0.08);
    if (music.fadeOut !== false) {
      const fs = total - FADE_OUT;
      if (t < fs) g.gain.setValueAtTime(vol, now + (fs - t));
      g.gain.linearRampToValueAtTime(0, now + left);
    }
    const offset = ((music.start || 0) + t) % this.buffer.duration;
    src.start(now, offset);
    src.stop(now + left + 0.05);
    this.src = src;
    this.gain = g;
  }

  stop() {
    if (this.src) {
      try {
        this.src.stop();
      } catch {
        // schon gestoppt
      }
      this.src.disconnect();
    }
    this.src = null;
    this.gain = null;
  }

  /** Kurz in die Musik hineinhören (ab Startpunkt). */
  preview(music, seconds = 8) {
    this.stop();
    if (!this.buffer) return;
    const ctx = audioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = ctx.createGain();
    g.gain.value = music.volume ?? 1;
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime, (music.start || 0) % this.buffer.duration, seconds);
    this.src = src;
  }
}

function envelope(t, music, total) {
  if (music.fadeOut === false) return 1;
  const fs = total - FADE_OUT;
  return t < fs ? 1 : Math.max(0, (total - t) / FADE_OUT);
}

/** Mischt die Musik für den Export: Stereo, sampleRate Hz, genau so lang wie die Diashow. */
export async function renderMix(buffer, music, total, sampleRate = 48000) {
  const len = Math.max(1, Math.ceil(total * sampleRate));
  const oc = new OfflineAudioContext(2, len, sampleRate);
  const src = oc.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const g = oc.createGain();
  src.connect(g).connect(oc.destination);
  const vol = music.volume ?? 1;
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(vol, (music.start || 0) > 0 ? 0.6 : 0.05);
  if (music.fadeOut !== false && total > FADE_OUT + 0.5) {
    g.gain.setValueAtTime(vol, total - FADE_OUT);
    g.gain.linearRampToValueAtTime(0, total);
  }
  src.start(0, (music.start || 0) % buffer.duration);
  return oc.startRendering();
}

/** Rohes PCM (16 Bit, verschränkt) aus einem AudioBuffer – für den nativen AAC-Weg. */
export function toPcm16(buffer, from, count) {
  const ch = buffer.numberOfChannels;
  const out = new Int16Array(count * ch);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][from + i]));
      out[i * ch + c] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  }
  return out;
}

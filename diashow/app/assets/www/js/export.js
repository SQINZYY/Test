// Video-Export: Bild für Bild rendern, mit dem Hardware-Encoder des Handys (WebCodecs, H.264)
// kodieren und als MP4 schreiben. Musik als AAC. Ersatzweg: MediaRecorder (Echtzeit-Aufnahme).
import { Muxer, StreamTarget } from '../vendor/mp4-muxer.mjs';
import { timeline, renderFrame, outputSize, imagesAround } from './slideshow.js';
import { renderMix, toPcm16, audioCtx } from './audio.js';
import { createSink, Output, nativeMuxAudio, canMuxNatively, deleteNativeFile, keepScreenOn } from './native.js';
import { stamp, sleep } from './util.js';

export const FPS = 30;
const SAMPLE_RATE = 48000;

function abortError() {
  const e = new Error('Abgebrochen');
  e.name = 'AbortError';
  return e;
}

/** Unterstützte H.264-Einstellungen für W × H (beste zuerst). */
export async function videoConfigs(W, H) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return [];
  const big = W * H > 1280 * 720;
  const codecs = big
    ? ['avc1.640028', 'avc1.4d0028', 'avc1.420028']
    : ['avc1.64001f', 'avc1.4d001f', 'avc1.42001f', 'avc1.640028'];
  const out = [];
  // Erst Hardware (schnell), dann beliebig; ohne Angabe der Bitraten-Art als letzte Möglichkeit
  for (const hw of ['prefer-hardware', 'no-preference']) {
    for (const mode of ['variable', null]) {
      for (const codec of codecs) {
        const cfg = {
          codec, width: W, height: H, framerate: FPS,
          bitrate: big ? 6_000_000 : 3_500_000,
          avc: { format: 'avc' },
          hardwareAcceleration: hw,
        };
        if (mode) cfg.bitrateMode = mode;
        try {
          const s = await VideoEncoder.isConfigSupported(cfg);
          if (s.supported) {
            out.push(cfg);
            break; // pro Kombination reicht das beste Profil
          }
        } catch {
          // nicht unterstützt
        }
      }
      if (out.length >= 3) return out;
    }
  }
  return out;
}

async function audioConfig(codec) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const cfg = { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: codec === 'opus' ? 160_000 : 192_000 };
  try {
    const s = await AudioEncoder.isConfigSupported(cfg);
    return s.supported ? cfg : null;
  } catch {
    return null;
  }
}

async function encodeAudio(buffer, cfg) {
  const chunks = [];
  let err = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: (e) => (err = e),
  });
  enc.configure(cfg);
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const N = 4096;
  for (let i = 0; i < buffer.length; i += N) {
    const n = Math.min(N, buffer.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / buffer.sampleRate), data });
    enc.encode(ad);
    ad.close();
    if (enc.encodeQueueSize > 32) await sleep(1);
    if (err) throw err;
  }
  await enc.flush();
  enc.close();
  if (err) throw err;
  return chunks;
}

function waitQueue(enc, max) {
  return new Promise((resolve) => {
    const check = () => {
      if (enc.encodeQueueSize <= max || enc.state !== 'configured') resolve();
      else setTimeout(check, 3);
    };
    check();
  });
}

/** Lädt die Bilder, die zum Zeitpunkt t gebraucht werden, und schon mal das nächste. */
async function framesSource(p, tl, store, t) {
  const need = imagesAround(p, tl, t, 0);
  const got = new Map();
  for (const id of need) got.set(id, await store.getFull(id));
  const next = imagesAround(p, tl, t, 1.2).filter((id) => !got.has(id)).slice(0, 2);
  for (const id of next) store.getFull(id).catch(() => {});
  return (id) => got.get(id) || store.peekFull(id) || { bmp: store.thumb(id) };
}

/**
 * Erstellt das Video. Gibt { output, warnings, width, height, duration } zurück.
 * onProgress(anteil 0–1, restSekunden|null, phase)
 */
export async function exportVideo(p, store, musicBuffer, { onProgress = () => {}, signal } = {}) {
  const tl = timeline(p);
  if (!tl.items.length) throw new Error('Keine Bilder in der Diashow');
  keepScreenOn(true);
  try {
    let audio = null;
    if (p.music && musicBuffer) {
      onProgress(0, null, 'Musik wird vorbereitet …');
      audio = await renderMix(musicBuffer, p.music, tl.total, SAMPLE_RATE);
    }
    let lastErr = null;
    let W = 0;
    let H = 0;
    // Klappt Full HD auf diesem Gerät nicht, automatisch mit 720p weiter
    for (const q of p.quality === '720' ? ['720'] : ['1080', '720']) {
      ({ w: W, h: H } = outputSize(p.format, q));
      for (const cfg of await videoConfigs(W, H)) {
        try {
          return await webcodecsExport(p, tl, store, cfg, audio, signal, onProgress);
        } catch (e) {
          if (e.name === 'AbortError' || (signal && signal.aborted)) throw abortError();
          console.warn('Export mit', cfg.codec, cfg.width + 'x' + cfg.height, cfg.hardwareAcceleration, 'fehlgeschlagen:', e);
          lastErr = e;
        }
      }
    }
    if (typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream) {
      return await recorderExport(p, tl, store, W, H, audio, signal, onProgress);
    }
    throw lastErr || new Error('Videoexport wird auf diesem Gerät nicht unterstützt');
  } finally {
    keepScreenOn(false);
  }
}

async function webcodecsExport(p, tl, store, cfg, audio, signal, onProgress) {
  const W = cfg.width;
  const H = cfg.height;
  const name = `Diashow_${stamp()}.mp4`;
  const warnings = [];

  // Ton: AAC direkt in der WebView, sonst über Android anfügen, sonst Opus
  let route = 'none';
  let aCfg = null;
  if (audio) {
    aCfg = await audioConfig('mp4a.40.2');
    if (aCfg) route = 'js';
    else if (canMuxNatively) route = 'native';
    else if ((aCfg = await audioConfig('opus'))) route = 'js';
    else warnings.push('Musik kann auf diesem Gerät nicht ins Video übernommen werden.');
  }

  const sink = createSink(route === 'native' ? 'ohne_ton.mp4' : name);
  let sinkErr = null;
  let enc = null;
  try {
    const muxer = new Muxer({
      target: new StreamTarget({
        onData: (data, pos) => {
          try {
            sink.writeAt(data, pos);
          } catch (e) {
            sinkErr = e;
          }
        },
        chunked: true,
        chunkSize: 2 ** 21,
      }),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: route === 'js' ? { codec: aCfg.codec === 'opus' ? 'opus' : 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
      fastStart: false,
      firstTimestampBehavior: 'offset',
    });

    let audioChunks = [];
    if (route === 'js') {
      onProgress(0, null, 'Musik wird kodiert …');
      audioChunks = await encodeAudio(audio, aCfg);
    }
    let ai = 0;
    const pushAudio = (ts) => {
      while (ai < audioChunks.length && audioChunks[ai].chunk.timestamp <= ts) {
        muxer.addAudioChunk(audioChunks[ai].chunk, audioChunks[ai].meta);
        ai++;
      }
    };

    let encErr = null;
    let outFrames = 0;
    enc = new VideoEncoder({
      output: (chunk, meta) => {
        pushAudio(chunk.timestamp);
        muxer.addVideoChunk(chunk, meta);
        outFrames++;
      },
      error: (e) => (encErr = e),
    });
    enc.configure(cfg);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const frames = Math.max(1, Math.round(tl.total * FPS));
    const t0 = performance.now();
    onProgress(0, null, 'Video wird erstellt …');
    for (let f = 0; f < frames; f++) {
      if (signal && signal.aborted) throw abortError();
      if (encErr) throw encErr;
      if (sinkErr) throw sinkErr;
      const t = f / FPS;
      const src = await framesSource(p, tl, store, t);
      renderFrame(ctx, W, H, p, tl, t, src, { frameSeed: f });
      const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
      if (enc.encodeQueueSize > 6) await waitQueue(enc, 2);
      if (f % 6 === 0) {
        const el = (performance.now() - t0) / 1000;
        const frac = (f + 1) / frames;
        onProgress(frac * 0.97, f > 20 ? (el / frac) * (1 - frac) : null, 'Video wird erstellt …');
        await sleep(0);
      }
      // Erste Bilder geprüft: liefert der Encoder überhaupt etwas?
      if (f === 45) {
        for (let k = 0; k < 150 && !outFrames && !encErr; k++) await sleep(20);
        if (encErr) throw encErr;
        if (!outFrames) throw new Error('Encoder liefert keine Daten');
      }
    }
    await enc.flush();
    if (encErr) throw encErr;
    enc.close();
    enc = null;
    pushAudio(Infinity);
    muxer.finalize();
    if (sinkErr) throw sinkErr;
    let file = await sink.close();

    if (route === 'native') {
      onProgress(0.98, null, 'Musik wird eingefügt …');
      file = await attachNativeAudio(file, audio, name, warnings);
    }
    onProgress(1, 0, 'Fertig');
    const output = new Output(file, 'video/mp4');
    output.name = name;
    return { output, warnings, width: W, height: H, duration: tl.total };
  } catch (e) {
    if (enc && enc.state !== 'closed') {
      try {
        enc.close();
      } catch {
        // egal
      }
    }
    sink.discard();
    throw e;
  }
}

async function attachNativeAudio(videoFile, audio, name, warnings) {
  const pcmSink = createSink('ton.pcm');
  const STEP = SAMPLE_RATE * 2;
  for (let i = 0; i < audio.length; i += STEP) {
    const n = Math.min(STEP, audio.length - i);
    pcmSink.append(new Uint8Array(toPcm16(audio, i, n).buffer));
    await sleep(0);
  }
  const pcmFile = await pcmSink.close();
  const outSink = createSink(name);
  const outFile = await outSink.close();
  const r = await nativeMuxAudio(videoFile, pcmFile, SAMPLE_RATE, 2, outFile);
  deleteNativeFile(pcmFile);
  if (r && r.ok) {
    deleteNativeFile(videoFile);
    outFile.size = r.size || videoFile.size;
    return outFile;
  }
  deleteNativeFile(outFile);
  warnings.push('Die Musik konnte nicht eingefügt werden – das Video ist ohne Ton gespeichert.');
  return videoFile;
}

/** Ersatzweg für ältere WebViews: Aufnahme in Echtzeit (dauert so lange wie die Diashow). */
async function recorderExport(p, tl, store, W, H, audio, signal, onProgress) {
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Videoaufnahme wird auf diesem Gerät nicht unterstützt');
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const name = `Diashow_${stamp()}.${ext}`;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(FPS);
  let src = null;
  if (audio) {
    const ac = audioCtx();
    if (ac.state === 'suspended') await ac.resume();
    src = ac.createBufferSource();
    src.buffer = audio;
    const dest = ac.createMediaStreamDestination();
    src.connect(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const sink = createSink(name);
  let chain = Promise.resolve();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chain = chain.then(async () => sink.append(new Uint8Array(await e.data.arrayBuffer())));
  };
  const stopped = new Promise((r) => (rec.onstop = r));
  try {
    // Erste Bilder vorladen
    for (const id of imagesAround(p, tl, 0, 3)) await store.getFull(id);
    renderFrame(ctx, W, H, p, tl, 0, (id) => store.peekFull(id) || { bmp: store.thumb(id) });
    rec.start(1000);
    const start = performance.now();
    if (src) src.start();
    while (true) {
      if (signal && signal.aborted) throw abortError();
      const t = (performance.now() - start) / 1000;
      if (t >= tl.total) break;
      for (const id of imagesAround(p, tl, t, 2.5).slice(0, 3)) store.getFull(id).catch(() => {});
      renderFrame(ctx, W, H, p, tl, t, (id) => store.peekFull(id) || { bmp: store.thumb(id) }, { frameSeed: Math.floor(t * FPS) });
      onProgress(t / tl.total, tl.total - t, 'Video wird aufgenommen …');
      await new Promise((r) => requestAnimationFrame(r));
    }
    rec.stop();
    await stopped;
    await chain;
    const file = await sink.close();
    const output = new Output(file, ext === 'mp4' ? 'video/mp4' : 'video/webm');
    output.name = name;
    const warnings = ext === 'webm' ? ['Dieses Gerät kann nur WebM aufnehmen – manche Apps spielen das nicht ab.'] : [];
    return { output, warnings, width: W, height: H, duration: tl.total };
  } catch (e) {
    if (rec.state !== 'inactive') rec.stop();
    sink.discard();
    throw e;
  } finally {
    if (src) {
      try {
        src.stop();
      } catch {
        // egal
      }
    }
    stream.getTracks().forEach((t) => t.stop());
    canvas.remove();
  }
}

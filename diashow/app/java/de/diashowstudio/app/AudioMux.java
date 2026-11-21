package de.diashowstudio.app;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Kodiert rohes PCM (16 Bit, verschränkt) mit dem AAC-Encoder des Handys und legt es
 * zusammen mit der Videospur eines MP4 (ohne Ton) in eine neue MP4-Datei.
 */
final class AudioMux {

    private static final String AAC = "audio/mp4a-latm";
    private static final long TIMEOUT_US = 10000;

    private AudioMux() {
    }

    private static final class Frame {
        final byte[] data;
        final long pts;
        final int flags;

        Frame(byte[] data, long pts, int flags) {
            this.data = data;
            this.pts = pts;
            this.flags = flags;
        }
    }

    static void run(File video, File pcm, int sampleRate, int channels, File out) throws IOException {
        // 1. Ton komplett kodieren (AAC ist klein: ca. 1,5 MB pro Minute)
        List<Frame> frames = new ArrayList<>();
        MediaFormat audioFormat = encode(pcm, sampleRate, channels, frames);

        // 2. Videospur suchen
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mux = null;
        try {
            ex.setDataSource(video.getAbsolutePath());
            int videoIndex = -1;
            MediaFormat videoFormat = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/")) {
                    videoIndex = i;
                    videoFormat = f;
                    break;
                }
            }
            if (videoIndex < 0) throw new IOException("Keine Videospur");
            ex.selectTrack(videoIndex);

            // 3. Beide Spuren nach Zeit verschränkt schreiben
            mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int vTrack = mux.addTrack(videoFormat);
            int aTrack = mux.addTrack(audioFormat);
            mux.start();

            int size = 4 * 1024 * 1024;
            if (videoFormat.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                size = Math.max(size, videoFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
            }
            ByteBuffer buf = ByteBuffer.allocate(size);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            int a = 0;
            while (true) {
                buf.clear();
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                long pts = ex.getSampleTime();
                while (a < frames.size() && frames.get(a).pts <= pts) {
                    writeAudio(mux, aTrack, frames.get(a++), info);
                }
                int flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                info.set(0, n, pts, flags);
                mux.writeSampleData(vTrack, buf, info);
                ex.advance();
            }
            while (a < frames.size()) writeAudio(mux, aTrack, frames.get(a++), info);
            mux.stop();
        } finally {
            ex.release();
            if (mux != null) {
                try {
                    mux.release();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private static void writeAudio(MediaMuxer mux, int track, Frame f, MediaCodec.BufferInfo info) {
        ByteBuffer b = ByteBuffer.wrap(f.data);
        info.set(0, f.data.length, f.pts, f.flags);
        mux.writeSampleData(track, b, info);
    }

    private static MediaFormat encode(File pcm, int sampleRate, int channels, List<Frame> frames) throws IOException {
        MediaFormat fmt = MediaFormat.createAudioFormat(AAC, sampleRate, channels);
        fmt.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        fmt.setInteger(MediaFormat.KEY_BIT_RATE, 192000);
        fmt.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
        MediaCodec enc = MediaCodec.createEncoderByType(AAC);
        MediaFormat outFormat = null;
        try (InputStream in = new FileInputStream(pcm)) {
            enc.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            enc.start();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            int frameBytes = 2 * channels;
            byte[] chunk = new byte[4096 * frameBytes];
            long samples = 0;
            boolean inputDone = false;
            boolean outputDone = false;
            while (!outputDone) {
                if (!inputDone) {
                    int idx = enc.dequeueInputBuffer(TIMEOUT_US);
                    if (idx >= 0) {
                        ByteBuffer ib = enc.getInputBuffer(idx);
                        ib.clear();
                        int want = Math.min(chunk.length, ib.capacity());
                        want -= want % frameBytes;
                        int n = readFully(in, chunk, want);
                        long pts = samples * 1000000L / sampleRate;
                        if (n <= 0) {
                            enc.queueInputBuffer(idx, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            n -= n % frameBytes;
                            ib.put(chunk, 0, n);
                            enc.queueInputBuffer(idx, 0, n, pts, 0);
                            samples += n / frameBytes;
                        }
                    }
                }
                int o = enc.dequeueOutputBuffer(info, TIMEOUT_US);
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    outFormat = enc.getOutputFormat();
                } else if (o >= 0) {
                    ByteBuffer ob = enc.getOutputBuffer(o);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 && info.size > 0 && ob != null) {
                        byte[] data = new byte[info.size];
                        ob.position(info.offset);
                        ob.get(data, 0, info.size);
                        frames.add(new Frame(data, info.presentationTimeUs, 0));
                    }
                    enc.releaseOutputBuffer(o, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true;
                }
            }
        } finally {
            try {
                enc.stop();
            } catch (Exception ignored) {
            }
            enc.release();
        }
        if (outFormat == null) throw new IOException("AAC-Encoder lieferte kein Format");
        return outFormat;
    }

    private static int readFully(InputStream in, byte[] buf, int len) throws IOException {
        int total = 0;
        while (total < len) {
            int n = in.read(buf, total, len - total);
            if (n < 0) break;
            total += n;
        }
        return total;
    }
}

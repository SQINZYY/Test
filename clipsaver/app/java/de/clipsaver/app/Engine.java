package de.clipsaver.app;

import android.content.Context;

import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import kotlin.Unit;
import kotlin.jvm.functions.Function3;

/**
 * Die Download-Engine: yt-dlp auf dem Handy über youtubedl-android (Python + yt-dlp + QuickJS für die
 * YouTube-Prüfungen + FFmpeg zum Zusammenfügen von Bild und Ton). yt-dlp kann sich selbst aktualisieren,
 * damit die App weiter funktioniert, wenn YouTube oder TikTok etwas ändern.
 */
final class Engine {

    interface Progress {
        void onLine(float percent, long etaSeconds, String line);
    }

    static final class Result {
        final File file;
        final int width;
        final int height;
        final String title;

        Result(File file, int width, int height, String title) {
            this.file = file;
            this.width = width;
            this.height = height;
            this.title = title;
        }
    }

    // Infos (Format-Adressen) bleiben einige Zeit gültig; so muss yt-dlp die Seite nicht zweimal lesen
    private static final long INFO_MAX_AGE = 90 * 60 * 1000L;
    private static boolean ready;
    // Downloads/Analysen lesen, das Update schreibt die yt-dlp-Datei neu
    private static final ReentrantReadWriteLock LOCK = new ReentrantReadWriteLock();

    private Engine() {
    }

    static synchronized void init(Context c) throws Exception {
        if (ready) return;
        Context app = c.getApplicationContext();
        YoutubeDL.getInstance().init(app);
        FFmpeg.getInstance().init(app);
        ready = true;
        // gespeicherte Infos älter als einen Tag braucht niemand mehr
        File[] old = new File(app.getCacheDir(), "info").listFiles();
        for (File f : old == null ? new File[0] : old) {
            if (System.currentTimeMillis() - f.lastModified() > 24 * 60 * 60 * 1000L) f.delete();
        }
    }

    static File cookiesFile(Context c) {
        return new File(c.getFilesDir(), "cookies.txt");
    }

    private static void common(Context c, YoutubeDLRequest r) {
        r.addOption("--cache-dir", new File(c.getFilesDir(), "yt-dlp-cache").getAbsolutePath());
        r.addOption("--socket-timeout", "30");
        r.addOption("--retries", "5");
        r.addOption("--extractor-retries", "3");
        File cookies = cookiesFile(c);
        if (cookies.length() > 0) r.addOption("--cookies", cookies.getAbsolutePath());
    }

    /** yt-dlp -J: alle Infos und Formate. Das Roh-JSON landet zusätzlich in einer Datei für den Download. */
    static JSONObject info(Context c, String url, String processId) throws Exception {
        init(c);
        LOCK.readLock().lock();
        try {
            YoutubeDLRequest r = new YoutubeDLRequest(url);
            r.addOption("--dump-single-json");
            r.addOption("--no-playlist");
            r.addOption("--flat-playlist");
            r.addOption("--no-warnings");
            common(c, r);
            YoutubeDLResponse resp = YoutubeDL.getInstance().execute(r, processId);
            String out = resp.getOut();
            int start = out.indexOf('{');
            if (start < 0) throw new Exception("yt-dlp hat keine Infos geliefert");
            String json = out.substring(start).trim();
            JSONObject info = new JSONObject(json);
            File dir = new File(c.getCacheDir(), "info");
            if (dir.isDirectory() || dir.mkdirs()) {
                File f = new File(dir, Integer.toHexString(url.hashCode()) + "-" + System.currentTimeMillis() + ".json");
                try (FileOutputStream o = new FileOutputStream(f)) {
                    o.write(json.getBytes("UTF-8"));
                }
                info.put("_infoFile", f.getAbsolutePath());
            }
            return info;
        } finally {
            LOCK.readLock().unlock();
        }
    }

    /**
     * Lädt ein Video (quality = "1080", "1440", "2160") oder nur den Ton als MP3 (quality = "audio") in dir.
     * format: von {@link Formats} gewählte IDs ("137+140"); fehlen sie, sortiert yt-dlp selbst.
     * headers: zusätzliche HTTP-Header, z. B. Referer für Streams aus dem eingebauten Browser.
     */
    static Result download(Context c, String url, String infoFile, String quality, String format, JSONObject headers, File dir,
                           String processId, Progress progress) throws Exception {
        init(c);
        File info = infoFile == null ? null : new File(infoFile);
        if (info != null && info.isFile() && System.currentTimeMillis() - info.lastModified() < INFO_MAX_AGE) {
            try {
                return downloadOnce(c, url, info, quality, format, headers, dir, processId, progress);
            } catch (YoutubeDL.CanceledException | InterruptedException e) {
                throw e;
            } catch (Exception e) {
                if (url == null) throw e;
                // Abgelaufene Adressen in der gespeicherten Info: einmal frisch über den Link versuchen
                info.delete();
                clean(dir);
            }
        }
        return downloadOnce(c, url, null, quality, format, headers, dir, processId, progress);
    }

    private static Result downloadOnce(Context c, String url, File info, String quality, String format, JSONObject headers, File dir,
                                       String processId, final Progress progress) throws Exception {
        LOCK.readLock().lock();
        try {
            YoutubeDLRequest r = info != null ? new YoutubeDLRequest(Collections.<String>emptyList()) : new YoutubeDLRequest(url);
            if (info != null) r.addOption("--load-info-json", info.getAbsolutePath());
            r.addOption("--no-playlist");
            if ("audio".equals(quality)) {
                // TikTok: "audio" ist nur die Hintergrundmusik – dann lieber den Ton aus dem Video nehmen
                r.addOption("-f", (format != null ? format + "/" : "") + "ba[format_id!=audio]/b/ba");
                r.addOption("-x");
                r.addOption("--audio-format", "mp3");
                r.addOption("--audio-quality", "0");
            } else {
                r.addOption("-f", (format != null ? format + "/" : "") + "bv*+ba/b");
                r.addOption("-S", Formats.sortFor(Integer.parseInt(quality)));
                r.addOption("--merge-output-format", "mp4");
            }
            r.addOption("-o", new File(dir, "media.%(ext)s").getAbsolutePath());
            r.addOption("--no-mtime");
            r.addOption("--newline");
            r.addOption("--concurrent-fragments", "4");
            File done = new File(dir, "done.txt");
            r.addCommands(Arrays.asList("--print-to-file", "after_move:%(filepath)s\t%(width)s\t%(height)s\t%(title)j", done.getAbsolutePath()));
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    r.addOption("--add-header", k + ":" + headers.optString(k));
                }
            }
            common(c, r);
            YoutubeDL.getInstance().execute(r, processId, new Function3<Float, Long, String, Unit>() {
                @Override
                public Unit invoke(Float percent, Long eta, String line) {
                    progress.onLine(percent == null ? -1 : percent, eta == null ? -1 : eta, line == null ? "" : line);
                    return Unit.INSTANCE;
                }
            });
            return result(dir, done);
        } finally {
            LOCK.readLock().unlock();
        }
    }

    private static Result result(File dir, File done) throws Exception {
        if (done.isFile()) {
            String text = new String(Http.readAll(new FileInputStream(done), 1 << 20), "UTF-8").trim();
            String[] lines = text.split("\n");
            String[] f = lines[lines.length - 1].split("\t");
            File file = new File(f[0]);
            if (file.isFile()) {
                return new Result(file, parseInt(f.length > 1 ? f[1] : null), parseInt(f.length > 2 ? f[2] : null),
                        f.length > 3 ? jsonString(f[3]) : null);
            }
        }
        // Ersatz: größte fertige Datei im Ordner
        File best = null;
        File[] files = dir.listFiles();
        for (File f : files == null ? new File[0] : files) {
            String n = f.getName();
            if (n.endsWith(".part") || n.endsWith(".ytdl") || n.equals("done.txt")) continue;
            if (best == null || f.length() > best.length()) best = f;
        }
        if (best == null) throw new Exception("yt-dlp hat keine Datei erzeugt");
        return new Result(best, 0, 0, null);
    }

    /** Titel kommt als JSON-String (%(title)j), damit Tabs/Zeilenumbrüche im Titel nichts zerlegen. */
    private static String jsonString(String s) {
        try {
            Object v = new org.json.JSONArray("[" + s + "]").get(0);
            return v instanceof String && ((String) v).length() > 0 ? (String) v : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static int parseInt(String s) {
        try {
            return s == null ? 0 : (int) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static void clean(File dir) {
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) {
            if (f.isDirectory()) clean(f);
            f.delete();
        }
    }

    static boolean cancel(String processId) {
        try {
            return YoutubeDL.getInstance().destroyProcessById(processId);
        } catch (Exception e) {
            return false;
        }
    }

    /** Lädt die neueste yt-dlp-Version von GitHub. Liefert true, wenn es eine neue Version gab. */
    static boolean update(Context c, boolean nightly) throws Exception {
        init(c);
        LOCK.writeLock().lock();
        try {
            YoutubeDL.UpdateStatus s = YoutubeDL.getInstance().updateYoutubeDL(c.getApplicationContext(),
                    nightly ? YoutubeDL.UpdateChannel._NIGHTLY : YoutubeDL.UpdateChannel._STABLE);
            return s == YoutubeDL.UpdateStatus.DONE;
        } finally {
            LOCK.writeLock().unlock();
        }
    }

    static String version(Context c) {
        String v = null;
        try {
            v = YoutubeDL.getInstance().version(c.getApplicationContext());
            if (v == null) v = YoutubeDL.getInstance().versionName(c.getApplicationContext());
        } catch (Exception ignored) {
            // noch nie aktualisiert
        }
        return v == null ? "2025.11.12 (mitgeliefert)" : v;
    }

    /** Verständliche Fehlermeldung aus der Ausgabe von yt-dlp. */
    static String friendlyError(Throwable e) {
        String m = String.valueOf(e.getMessage());
        String l = m.toLowerCase(Locale.ROOT);
        if (l.contains("unsupported url")) return "Dieser Link wird nicht unterstützt.";
        if (l.contains("private video") || l.contains("is private")) return "Das Video ist privat.";
        if (l.contains("confirm your age") || l.contains("age-restricted") || l.contains("inappropriate for some users"))
            return "Das Video ist altersbeschränkt. Melde dich unter „Mehr → Anmeldung“ an.";
        if (l.contains("not a bot") || l.contains("sign in to confirm"))
            return "YouTube möchte eine Anmeldung („Bist du ein Bot?“). Melde dich unter „Mehr → Anmeldung“ an oder versuche es später.";
        if (l.contains("login") && l.contains("tiktok")) return "TikTok verlangt für diesen Beitrag eine Anmeldung („Mehr → Anmeldung“).";
        if (l.contains("video unavailable") || l.contains("has been removed") || l.contains("no longer available"))
            return "Das Video ist nicht (mehr) verfügbar.";
        if (l.contains("members-only") || l.contains("join this channel")) return "Das Video ist nur für Kanalmitglieder.";
        if (l.contains("premieres in") || l.contains("live event will begin")) return "Das Video ist noch nicht erschienen.";
        if (l.contains("http error 429") || l.contains("too many requests"))
            return "Zu viele Anfragen – bitte später erneut versuchen.";
        if (l.contains("http error 403")) return "Der Server hat den Download abgelehnt (403). Engine unter „Mehr“ aktualisieren und erneut versuchen.";
        if (l.contains("unable to download webpage") || l.contains("failed to resolve") || l.contains("network is unreachable")
                || l.contains("timed out") || l.contains("getaddrinfo"))
            return "Keine Verbindung zum Server. Ist das Internet an?";
        if (l.contains("no space left")) return "Der Speicher ist voll.";
        if (l.contains("requested format is not available")) return "Diese Qualität gibt es für das Video nicht.";
        // letzte Zeile mit "ERROR:" ist meistens die aussagekräftigste
        int i = m.lastIndexOf("ERROR:");
        if (i >= 0) {
            String rest = m.substring(i + 6).trim();
            int nl = rest.indexOf('\n');
            return nl > 0 ? rest.substring(0, nl) : rest;
        }
        return m.length() > 300 ? m.substring(0, 300) + "…" : m;
    }
}

package de.clipsaver.app;

import android.content.Context;

import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Zweite Engine für Bilder und Galerien: gallery-dl (über 300 Seiten, z. B. X/Twitter, Instagram, Reddit,
 * Pinterest, Bluesky, Tumblr, Facebook, Imgur, Flickr). Läuft mit derselben Python-Umgebung wie yt-dlp aus
 * youtubedl-android. gallery-dl und seine Abhängigkeiten (requests …) liegen als Wheels in den Assets
 * (assets/gdl) und werden beim ersten Start entpackt; Updates kommen als neues Wheel von PyPI.
 */
final class Gallery {

    interface FileDone {
        void onFile(File file);
    }

    private static final Map<String, Process> RUNNING = new ConcurrentHashMap<>();
    private static final String PYPI = "https://pypi.org/pypi/gallery-dl/json";
    /** So viele Dateien höchstens pro Link (Profile oder Alben können Tausende haben) */
    static final int MAX_FILES = 100;

    private Gallery() {
    }

    private static File home(Context c) {
        return new File(c.getFilesDir(), "gallery-dl");
    }

    /** Entpackt die mitgelieferten Wheels einmal pro App-Version nach files/gallery-dl/site. */
    static synchronized File site(Context c) throws Exception {
        File site = new File(home(c), "site");
        File marker = new File(site, ".clipsaver-version");
        String appVersion = String.valueOf(c.getPackageManager().getPackageInfo(c.getPackageName(), 0).lastUpdateTime);
        if (marker.isFile() && appVersion.equals(read(marker))) return site;
        File tmp = new File(home(c), "site.tmp");
        Engine.clean(tmp);
        tmp.mkdirs();
        String[] wheels = c.getAssets().list("gdl");
        for (String w : wheels == null ? new String[0] : wheels) {
            if (!w.endsWith(".whl")) continue;
            try (InputStream in = c.getAssets().open("gdl/" + w)) {
                unzip(in, tmp);
            }
        }
        // Ein neueres gallery-dl aus einem Update behalten
        File updated = new File(home(c), "update.whl");
        if (updated.isFile()) {
            Engine.clean(new File(tmp, "gallery_dl"));
            try (InputStream in = new java.io.FileInputStream(updated)) {
                unzip(in, tmp);
            }
        }
        write(new File(tmp, ".clipsaver-version"), appVersion);
        Engine.clean(site);
        site.delete();
        if (!tmp.renameTo(site)) throw new IOException("gallery-dl konnte nicht eingerichtet werden");
        return site;
    }

    private static void unzip(InputStream in, File dir) throws IOException {
        String root = dir.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry e;
            byte[] buf = new byte[65536];
            while ((e = zip.getNextEntry()) != null) {
                File f = new File(dir, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) continue; // kein Ausbruch aus dem Ordner
                if (e.isDirectory()) {
                    f.mkdirs();
                    continue;
                }
                f.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(f)) {
                    int n;
                    while ((n = zip.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
    }

    private static Object field(String name) throws Exception {
        Field f = YoutubeDL.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(null);
    }

    /** Startet "python -m gallery_dl …" mit der Umgebung, die youtubedl-android auch für yt-dlp setzt. */
    private static Process start(Context c, List<String> args) throws Exception {
        Engine.init(c);
        File site = site(c);
        File python = (File) field("pythonPath");
        File ytdlp = (File) field("ytdlpPath");
        File binDir = (File) field("binDir");
        String cert = (String) field("ENV_SSL_CERT_FILE");
        List<String> cmd = new ArrayList<>(Arrays.asList(python.getAbsolutePath(), "-m", "gallery_dl"));
        cmd.add("--config-ignore");
        cmd.addAll(Arrays.asList("-o", "cache.file=" + new File(home(c), "cache.sqlite3").getAbsolutePath()));
        File cookies = Engine.cookiesFile(c);
        if (cookies.length() > 0) cmd.addAll(Arrays.asList("--cookies", cookies.getAbsolutePath()));
        cmd.addAll(args);
        ProcessBuilder pb = new ProcessBuilder(cmd);
        Map<String, String> env = pb.environment();
        env.put("LD_LIBRARY_PATH", (String) field("ENV_LD_LIBRARY_PATH"));
        env.put("SSL_CERT_FILE", cert);
        env.put("REQUESTS_CA_BUNDLE", cert);
        env.put("PYTHONHOME", (String) field("ENV_PYTHONHOME"));
        env.put("HOME", home(c).getAbsolutePath());
        env.put("TMPDIR", (String) field("TMPDIR"));
        env.put("PATH", System.getenv("PATH") + ":" + binDir.getAbsolutePath());
        // yt-dlp liegt als Zip-Archiv vor und ist so für Videos innerhalb von Galerien importierbar
        env.put("PYTHONPATH", site.getAbsolutePath() + ":" + ytdlp.getAbsolutePath());
        env.put("PYTHONIOENCODING", "utf-8");
        return pb.start();
    }

    private static final class Run {
        int code;
        String out;
        String err;
    }

    private static Run run(Context c, List<String> args, String processId, final FileDone onLine) throws Exception {
        final Process p = start(c, args);
        RUNNING.put(processId, p);
        final StringBuilder err = new StringBuilder();
        Thread errReader = new Thread(new Runnable() {
            @Override
            public void run() {
                try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getErrorStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        synchronized (err) {
                            if (err.length() < 20000) err.append(line).append('\n');
                        }
                    }
                } catch (IOException ignored) {
                    // Prozess beendet
                }
            }
        });
        errReader.start();
        StringBuilder out = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), "UTF-8"))) {
            String line;
            while ((line = r.readLine()) != null) {
                out.append(line).append('\n');
                // output.mode=pipe: jede fertige Datei als eigene Zeile, übersprungene mit "# "
                if (onLine != null && line.length() > 0 && !line.startsWith("#") && !line.startsWith("[")) onLine.onFile(new File(line.trim()));
            }
        }
        Run res = new Run();
        res.code = p.waitFor();
        errReader.join(2000);
        boolean canceled = RUNNING.remove(processId) == null;
        if (canceled) throw new InterruptedException("abgebrochen");
        res.out = out.toString();
        synchronized (err) {
            res.err = err.toString();
        }
        return res;
    }

    static boolean cancel(String processId) {
        Process p = RUNNING.remove(processId);
        if (p == null) return false;
        p.destroy();
        return true;
    }

    /** Alle Dateien eines Links (höchstens MAX_FILES) im Ergebnisformat der App, ohne etwas zu laden. */
    static JSONObject list(Context c, String url, String processId) throws Exception {
        Run r = run(c, Arrays.asList("-J", "--range", "1-" + MAX_FILES, url), processId, null);
        try {
            return GalleryList.parse(r.out, url);
        } catch (IOException e) {
            throw new IOException(GalleryList.friendlyError(r.err, e.getMessage()));
        }
    }

    /**
     * Lädt die Dateien (range z. B. "1,3,5" oder null für alle) nach dir. Videos innerhalb der Galerie lädt
     * gallery-dl über yt-dlp; FFmpeg kommt aus youtubedl-android.
     */
    static List<File> download(Context c, String url, String range, File dir, String processId, FileDone onFile) throws Exception {
        List<String> args = new ArrayList<>(Arrays.asList("-D", dir.getAbsolutePath(), "--no-mtime",
                "-o", "output.mode=pipe",
                "-o", "downloader.ytdl.module=yt_dlp",
                "-o", "downloader.ytdl.raw-options={\"ffmpeg_location\":" + JSONObject.quote(((File) field("ffmpegPath")).getAbsolutePath()) + "}",
                "--range", range != null ? range : "1-" + MAX_FILES));
        args.add(url);
        Run r = run(c, args, processId, onFile);
        List<File> files = new ArrayList<>();
        File[] list = dir.listFiles();
        for (File f : list == null ? new File[0] : list) {
            String n = f.getName();
            if (f.isFile() && !n.endsWith(".part") && !n.endsWith(".ytdl") && f.length() > 0) files.add(f);
        }
        if (files.isEmpty()) throw new IOException(GalleryList.friendlyError(r.err, "gallery-dl hat keine Datei geladen"));
        java.util.Collections.sort(files);
        return files;
    }

    static String version(Context c) {
        try {
            File v = new File(site(c), "gallery_dl/version.py");
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("__version__\\s*=\\s*\"([^\"]+)\"").matcher(read(v));
            return m.find() ? m.group(1) : "?";
        } catch (Exception e) {
            return "?";
        }
    }

    /** Neuestes gallery-dl von PyPI holen. Liefert true, wenn es eine neue Version gab. */
    static boolean update(Context c) throws Exception {
        Http.Response r = new Http().get(PYPI, java.util.Collections.singletonMap("Accept", "application/json"));
        JSONObject info = new JSONObject(r.body);
        String latest = Json.str(info.optJSONObject("info"), "version");
        if (latest == null || latest.equals(version(c))) return false;
        JSONArray urls = info.optJSONArray("urls");
        String wheel = null;
        for (int i = 0; urls != null && i < urls.length(); i++) {
            JSONObject u = urls.getJSONObject(i);
            if ("bdist_wheel".equals(Json.str(u, "packagetype"))) wheel = Json.str(u, "url");
        }
        if (wheel == null) return false;
        File tmp = new File(home(c), "update.whl.tmp");
        HttpURLConnection conn = (HttpURLConnection) new URL(wheel).openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(60000);
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
            Saver.copy(in, out);
        } finally {
            conn.disconnect();
        }
        synchronized (Gallery.class) {
            if (!tmp.renameTo(new File(home(c), "update.whl"))) throw new IOException("Update konnte nicht gespeichert werden");
            // beim nächsten Aufruf neu entpacken
            new File(new File(home(c), "site"), ".clipsaver-version").delete();
        }
        return true;
    }

    private static String read(File f) throws IOException {
        return new String(Http.readAll(new java.io.FileInputStream(f), 1 << 20), "UTF-8").trim();
    }

    private static void write(File f, String text) throws IOException {
        try (OutputStream out = new FileOutputStream(f)) {
            out.write(text.getBytes("UTF-8"));
        }
    }
}

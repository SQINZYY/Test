package de.clipsaver.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Speichert fertige Dateien so, dass sie in der Galerie bzw. Musik-App erscheinen:
 * Videos in Filme/ClipSaver, Bilder in Bilder/ClipSaver, Ton in Musik/ClipSaver.
 * Ab Android 10 über MediaStore (ohne Berechtigung), davor direkt in den öffentlichen Ordner.
 * Außerdem der Verlauf der Downloads (history.json).
 */
final class Saver {

    static final String FOLDER = "ClipSaver";
    private static final int MAX_HISTORY = 300;
    private static final Object HISTORY_LOCK = new Object();

    private Saver() {
    }

    static String kindOf(String mime) {
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("audio/")) return "audio";
        return "video";
    }

    static String mimeOf(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".mp4") || n.endsWith(".m4v")) return "video/mp4";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".mkv")) return "video/x-matroska";
        if (n.endsWith(".mov")) return "video/quicktime";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".m4a")) return "audio/mp4";
        if (n.endsWith(".opus") || n.endsWith(".ogg")) return "audio/ogg";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".heic")) return "image/heic";
        if (n.endsWith(".avif")) return "image/avif";
        return "application/octet-stream";
    }

    static String extOf(String mime) {
        switch (mime) {
            case "video/mp4": return ".mp4";
            case "video/webm": return ".webm";
            case "video/x-matroska": return ".mkv";
            case "video/quicktime": return ".mov";
            case "audio/mpeg": return ".mp3";
            case "audio/mp4": return ".m4a";
            case "audio/ogg": return ".ogg";
            case "image/jpeg": return ".jpg";
            case "image/png": return ".png";
            case "image/webp": return ".webp";
            case "image/gif": return ".gif";
            case "image/heic": return ".heic";
            case "image/avif": return ".avif";
            default: return "";
        }
    }

    /** Dateiname ohne verbotene Zeichen und nicht zu lang. */
    static String safeName(String title) {
        String s = title == null ? "" : title.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        if (s.startsWith(".")) s = s.substring(1);
        if (s.length() > 80) s = s.substring(0, 80).trim();
        return s.length() == 0 ? "ClipSaver" : s;
    }

    /** Kopiert die Datei in die Galerie und liefert die content://-Adresse. Die Quelldatei wird gelöscht. */
    static Uri save(Context c, File src, String baseName, String mime) throws IOException {
        String kind = kindOf(mime);
        String name = safeName(baseName) + extOf(mime);
        Uri uri;
        if (Build.VERSION.SDK_INT >= 29) {
            String dir = kind.equals("image") ? Environment.DIRECTORY_PICTURES
                    : kind.equals("audio") ? Environment.DIRECTORY_MUSIC : Environment.DIRECTORY_MOVIES;
            Uri collection = kind.equals("image") ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : kind.equals("audio") ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, dir + "/" + FOLDER);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            ContentResolver cr = c.getContentResolver();
            try {
                uri = cr.insert(collection, v);
            } catch (IllegalArgumentException e) {
                // Format kennt die Galerie nicht (z. B. AVIF auf Android 10): dann in Download/ClipSaver
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            }
            if (uri == null) throw new IOException("Galerie hat das Speichern abgelehnt");
            try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new IOException("Datei kann nicht geschrieben werden");
                copy(in, out);
            } catch (IOException e) {
                cr.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
        } else {
            String type = kind.equals("image") ? Environment.DIRECTORY_PICTURES
                    : kind.equals("audio") ? Environment.DIRECTORY_MUSIC : Environment.DIRECTORY_MOVIES;
            File dir = new File(Environment.getExternalStoragePublicDirectory(type), FOLDER);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Ordner " + dir + " kann nicht angelegt werden");
            File dst = unique(dir, safeName(baseName), extOf(mime));
            try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
                copy(in, out);
            }
            uri = scan(c, dst, mime);
        }
        src.delete();
        return uri;
    }

    private static File unique(File dir, String base, String ext) {
        File f = new File(dir, base + ext);
        for (int i = 2; f.exists(); i++) f = new File(dir, base + " (" + i + ")" + ext);
        return f;
    }

    /** Android 7–9: Datei der Medienbibliothek melden, damit sie in der Galerie erscheint. */
    private static Uri scan(Context c, File f, String mime) {
        final Uri[] result = {Uri.fromFile(f)};
        final CountDownLatch latch = new CountDownLatch(1);
        MediaScannerConnection.scanFile(c, new String[]{f.getAbsolutePath()}, new String[]{mime},
                new MediaScannerConnection.OnScanCompletedListener() {
                    @Override
                    public void onScanCompleted(String path, Uri uri) {
                        if (uri != null) result[0] = uri;
                        latch.countDown();
                    }
                });
        try {
            latch.await(8, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return result[0];
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[256 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    // ---- Verlauf ----

    private static File historyFile(Context c) {
        return new File(c.getFilesDir(), "history.json");
    }

    static JSONArray history(Context c) {
        synchronized (HISTORY_LOCK) {
            File f = historyFile(c);
            if (!f.isFile()) return new JSONArray();
            try {
                return new JSONArray(new String(Http.readAll(new FileInputStream(f), 8 << 20), "UTF-8"));
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    static void addHistory(Context c, JSONObject entry) {
        synchronized (HISTORY_LOCK) {
            JSONArray old = history(c);
            JSONArray list = new JSONArray();
            list.put(entry);
            for (int i = 0; i < old.length() && list.length() < MAX_HISTORY; i++) list.put(old.opt(i));
            writeHistory(c, list);
        }
    }

    /** Entfernt einen Eintrag; mit deleteFile auch die Datei aus der Galerie. */
    static void removeHistory(Context c, String id, boolean deleteFile) {
        synchronized (HISTORY_LOCK) {
            JSONArray old = history(c);
            JSONArray list = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject e = old.optJSONObject(i);
                if (e == null) continue;
                if (id.equals(e.optString("id"))) {
                    if (deleteFile) {
                        try {
                            c.getContentResolver().delete(Uri.parse(e.optString("uri")), null, null);
                        } catch (Exception ignored) {
                            // schon gelöscht oder nicht mehr unsere Datei
                        }
                    }
                    continue;
                }
                list.put(e);
            }
            writeHistory(c, list);
        }
    }

    static void clearHistory(Context c) {
        synchronized (HISTORY_LOCK) {
            writeHistory(c, new JSONArray());
        }
    }

    private static void writeHistory(Context c, JSONArray list) {
        File f = historyFile(c);
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(list.toString().getBytes("UTF-8"));
        } catch (IOException e) {
            return;
        }
        tmp.renameTo(f);
    }
}

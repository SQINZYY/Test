package de.diashowstudio.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Dateien der App im Cache: importierte Bilder (für die Oberfläche) und fertige Videos/Bilder
 * (werden stückweise aus JavaScript geschrieben, dann in der Galerie gespeichert oder geteilt).
 */
class Files {

    static final String OUT = "out";
    private static final String IMPORT = "import";
    private static final String ALBUM = "Diashow Studio";

    private final Context context;
    private final Map<String, RandomAccessFile> open = new HashMap<>();

    Files(Context context) {
        this.context = context.getApplicationContext();
    }

    File importDir() {
        File d = new File(context.getCacheDir(), IMPORT);
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    File importFile(String name) throws IOException {
        if (!safe(name)) throw new IOException("Ungültiger Name");
        return new File(importDir(), name);
    }

    void clearImports() {
        File[] list = importDir().listFiles();
        if (list != null) for (File f : list) f.delete();
    }

    private File outDir() {
        File d = new File(context.getCacheDir(), OUT);
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    /** Beim Start: alte Importe und Ausgaben (älter als eine Stunde) löschen. */
    void cleanup() {
        clearImports();
        File[] list = outDir().listFiles();
        long limit = System.currentTimeMillis() - 60 * 60 * 1000L;
        if (list != null) for (File f : list) if (f.lastModified() < limit) f.delete();
    }

    private static boolean safe(String name) {
        return name != null && name.length() > 0 && !name.contains("/") && !name.contains("\\") && !name.contains("..");
    }

    File file(String id) throws IOException {
        if (!safe(id)) throw new IOException("Ungültige Datei");
        return new File(outDir(), id);
    }

    synchronized String open(String name) {
        String clean = name == null ? "datei" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (clean.length() > 60) clean = clean.substring(clean.length() - 60);
        String id = UUID.randomUUID().toString().substring(0, 8) + "_" + clean;
        try {
            RandomAccessFile raf = new RandomAccessFile(file(id), "rw");
            raf.setLength(0);
            open.put(id, raf);
            return id;
        } catch (IOException e) {
            return null;
        }
    }

    synchronized boolean write(String id, String base64, long pos) {
        RandomAccessFile raf = open.get(id);
        if (raf == null) return false;
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            raf.seek(pos < 0 ? raf.length() : pos);
            raf.write(data);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    synchronized double close(String id) {
        RandomAccessFile raf = open.remove(id);
        if (raf == null) return -1;
        try {
            long len = raf.length();
            raf.close();
            return len;
        } catch (IOException e) {
            return -1;
        }
    }

    synchronized void delete(String id) {
        close(id);
        try {
            file(id).delete();
        } catch (IOException ignored) {
        }
    }

    Uri contentUri(String id) throws IOException {
        File f = file(id);
        if (!f.isFile()) throw new IOException("Datei fehlt");
        return Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(id));
    }

    /** Kopiert die Datei in die Galerie (Filme bzw. Bilder / Diashow Studio). Gibt den Ort zurück. */
    String saveToGallery(String id, String mime, String displayName) throws IOException {
        File src = file(id);
        if (!src.isFile()) throw new IOException("Datei fehlt");
        boolean video = mime != null && mime.startsWith("video/");
        String dirType = video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES;
        String name = displayName == null || displayName.length() == 0 ? id : displayName.replaceAll("[\\\\/:*?\"<>|]", "_");

        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = context.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put("relative_path", dirType + "/" + ALBUM);
            v.put("is_pending", 1);
            Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            Uri item = cr.insert(collection, v);
            if (item == null) throw new IOException("Galerie nicht verfügbar");
            try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(item)) {
                if (out == null) throw new IOException("Galerie nicht beschreibbar");
                copy(in, out);
            } catch (IOException e) {
                cr.delete(item, null, null);
                throw e;
            }
            v.clear();
            v.put("is_pending", 0);
            cr.update(item, v, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(dirType), ALBUM);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Ordner kann nicht angelegt werden");
            File dst = new File(dir, name);
            try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
                copy(in, out);
            }
            MediaScannerConnection.scanFile(context, new String[]{dst.getAbsolutePath()}, new String[]{mime}, null);
        }
        return dirType + "/" + ALBUM;
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}

package de.weckton.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Legt die gewählte MP3 als Weckton in der Medienbibliothek ab (Ordner "Alarms"). Nur so kann die Uhr-App
 * sie abspielen: Sie akzeptiert ausschließlich Adressen der Form content://media/…. Außerdem erscheint die
 * Datei damit in jeder Uhr-App in der Liste der Wecktöne.
 */
final class Sounds {

    // Spalten der Medienbibliothek ab Android 10 (die App wird gegen ältere Android-Klassen kompiliert)
    private static final String RELATIVE_PATH = "relative_path";
    private static final String IS_PENDING = "is_pending";

    private Sounds() {
    }

    /** Kopiert die Datei in den Ordner "Alarms" und gibt die Adresse in der Medienbibliothek zurück. */
    static Uri importAlarm(Context context, Uri source) throws IOException {
        ContentResolver cr = context.getContentResolver();
        String name = "Weckton.mp3";
        long size = -1;
        Cursor c = cr.query(source, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null);
        if (c != null) {
            try {
                if (c.moveToFirst()) {
                    if (!c.isNull(0)) name = c.getString(0);
                    if (!c.isNull(1)) size = c.getLong(1);
                }
            } finally {
                c.close();
            }
        }
        String folder = Environment.DIRECTORY_ALARMS + "/";
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        // Dieselbe Datei wurde schon einmal übernommen → wiederverwenden statt doppelt ablegen
        if (size > 0) {
            Cursor existing = cr.query(collection, new String[]{MediaStore.MediaColumns._ID},
                    RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.SIZE + "=?",
                    new String[]{folder, name, String.valueOf(size)}, null);
            if (existing != null) {
                try {
                    if (existing.moveToFirst()) return ContentUris.withAppendedId(collection, existing.getLong(0));
                } finally {
                    existing.close();
                }
            }
        }

        String mime = cr.getType(source);
        if (mime == null || !mime.startsWith("audio/")) mime = "audio/mpeg";
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.TITLE, stripExtension(name));
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(RELATIVE_PATH, folder);
        v.put(MediaStore.Audio.AudioColumns.IS_ALARM, 1);
        v.put(IS_PENDING, 1);
        Uri item = cr.insert(collection, v);
        if (item == null) throw new IOException("Die Datei konnte nicht im Ordner „Alarms“ angelegt werden.");
        try {
            InputStream in = cr.openInputStream(source);
            OutputStream out = cr.openOutputStream(item);
            if (in == null || out == null) throw new IOException("Die Datei lässt sich nicht lesen.");
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } finally {
                in.close();
                out.close();
            }
            ContentValues done = new ContentValues();
            done.put(IS_PENDING, 0);
            cr.update(item, done, null, null);
        } catch (IOException | RuntimeException e) {
            try {
                cr.delete(item, null, null);
            } catch (RuntimeException ignored) {
                // nichts mehr zu retten
            }
            throw e instanceof IOException ? (IOException) e : new IOException(e.getMessage());
        }
        // Gleiche Form wie die Adressen, die die Uhr-App selbst speichert (…/external/audio/media/ID)
        return ContentUris.withAppendedId(collection, ContentUris.parseId(item));
    }

    /** Anzeigename eines gespeicherten Klingeltons; leer, wenn er sich nicht bestimmen lässt. */
    static String title(Context context, String uri) {
        if (uri == null || uri.isEmpty() || ClockAlarms.SILENT.equals(uri)) return "";
        Uri u = Uri.parse(uri);
        if (!"content".equals(u.getScheme())) {
            String last = u.getLastPathSegment();
            return last == null ? "" : stripExtension(last);
        }
        try {
            Cursor c = context.getContentResolver().query(u, new String[]{MediaStore.MediaColumns.TITLE}, null, null, null);
            if (c != null) {
                try {
                    if (c.moveToFirst() && !c.isNull(0)) return c.getString(0);
                } finally {
                    c.close();
                }
            }
        } catch (RuntimeException e) {
            // Datei einer anderen App, die Weckton nicht lesen darf
        }
        return "";
    }

    /** Position in der Weckton-Liste von Android; die Uhr-App wertet -1 (unbekannt) und -2 (lautlos) als ungültig. */
    static int alarmIndex(Context context, Uri sound) {
        try {
            RingtoneManager rm = new RingtoneManager(context);
            rm.setType(RingtoneManager.TYPE_ALARM);
            int pos = rm.getRingtonePosition(sound);
            return Math.max(pos, 0);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    static String defaultAlarmTitle(Context context) {
        Uri u = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM);
        return u == null ? "" : title(context, u.toString());
    }

    static void setDefaultAlarm(Context context, Uri sound) {
        RingtoneManager.setActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM, sound);
    }

    static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}

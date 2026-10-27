package de.weckton.app;

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.PermissionInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Liest und ändert die Wecker der Samsung-Uhr (com.sec.android.app.clockpackage).
 *
 * Die Uhr-App stellt ihre Wecker-Datenbank als Content Provider bereit. Lesen und Schreiben ist mit den
 * Berechtigungen READ_ALARM/WRITE_ALARM erlaubt. Ältere Versionen der Uhr-App legen sie mit der Schutzstufe
 * "normal" an – jede App bekommt sie bei der Installation; neuere sperren sie (siehe isLocked). Geändert
 * werden nur Klingelton und Ton-Modus; vor der ersten
 * Änderung eines Weckers merkt sich die App die alten Werte, damit sie sich wiederherstellen lassen.
 */
final class ClockAlarms {

    static final String PKG = "com.sec.android.app.clockpackage";
    static final Uri URI = Uri.parse("content://com.samsung.sec.android.clockpackage/alarm");
    static final String SILENT = "alarm_silent_ringtone";
    private static final String READ_PERMISSION = "com.sec.android.app.clockpackage.permission.READ_ALARM";

    // Bits in der Spalte "dailybrief", die bestimmen, was beim Wecken abgespielt wird
    private static final int TONE_OFF = 64;
    private static final int BIXBY = 16384;
    private static final int CELEB = 32768;
    static final int SOUND_MODE_BITS = TONE_OFF | BIXBY | CELEB;

    private static final String BACKUP = "backup";

    private final Context context;
    private final SharedPreferences prefs;

    ClockAlarms(Context context, SharedPreferences prefs) {
        this.context = context;
        this.prefs = prefs;
    }

    static boolean isInstalled(Context context) {
        try {
            context.getPackageManager().getPackageInfo(PKG, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /**
     * Darf die Uhr-App Audiodateien anderer Apps lesen? Ohne diese Berechtigung spielt sie eine eigene MP3
     * nicht ab, sondern fällt auf ihren Standardton zurück. "unknown", wenn die Uhr-App sie gar nicht anfragt.
     */
    static String audioPermission(Context context) {
        String perm = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : "android.permission.READ_EXTERNAL_STORAGE";
        PackageManager pm = context.getPackageManager();
        try {
            PackageInfo info = pm.getPackageInfo(PKG, PackageManager.GET_PERMISSIONS);
            boolean requested = false;
            if (info.requestedPermissions != null) {
                for (String p : info.requestedPermissions) if (perm.equals(p)) requested = true;
            }
            if (!requested) return "unknown";
            return pm.checkPermission(perm, PKG) == PackageManager.PERMISSION_GRANTED ? "ok" : "denied";
        } catch (PackageManager.NameNotFoundException e) {
            return "unknown";
        }
    }

    /**
     * Neuere Versionen der Samsung-Uhr (One UI 7/8, Uhr 12.x) geben READ_ALARM nur noch Samsung-eigenen Apps
     * (Schutzstufe "signature"). Dann hilft auch keine Neuinstallation.
     */
    static boolean isLocked(Context context) {
        try {
            PermissionInfo p = context.getPackageManager().getPermissionInfo(READ_PERMISSION, 0);
            int base = p.protectionLevel & PermissionInfo.PROTECTION_MASK_BASE;
            return base != PermissionInfo.PROTECTION_NORMAL && base != PermissionInfo.PROTECTION_DANGEROUS;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Alle Wecker der Uhr-App als JSON-Liste. Wirft eine Exception mit verständlicher Meldung, wenn das nicht geht. */
    JSONArray list() throws Exception {
        if (context.checkSelfPermission(READ_PERMISSION) != PackageManager.PERMISSION_GRANTED && isLocked(context)) {
            throw new Exception("locked");
        }
        Cursor c;
        try {
            c = context.getContentResolver().query(URI, null, null, null, "alarmtime ASC");
        } catch (SecurityException e) {
            throw new Exception(isLocked(context) ? "locked" : "denied");
        } catch (IllegalArgumentException e) {
            throw new Exception("unavailable");
        }
        if (c == null) throw new Exception("unavailable");
        JSONArray out = new JSONArray();
        Map<String, String> titles = new HashMap<>();
        try {
            while (c.moveToNext()) {
                JSONObject a = new JSONObject();
                a.put("id", getLong(c, "_id", -1));
                a.put("active", getLong(c, "active", 0));
                a.put("time", getLong(c, "alarmtime", 0));
                a.put("repeat", getLong(c, "repeattype", 0));
                a.put("brief", getLong(c, "dailybrief", 0));
                a.put("alert", getLong(c, "alerttime", -1));
                a.put("volume", getLong(c, "volume", 11));
                a.put("toneIndex", getLong(c, "alarmtone", 0));
                a.put("name", getString(c, "name"));
                String tone = decode(getString(c, "alarmuri"));
                a.put("tone", tone);
                String title = titles.get(tone);
                if (title == null) {
                    title = Sounds.title(context, tone);
                    titles.put(tone, title);
                }
                a.put("toneTitle", title);
                out.put(a);
            }
        } finally {
            c.close();
        }
        return out;
    }

    /** Setzt den Klingelton der Wecker mit den angegebenen IDs. Ergebnis: {"ok": n, "failed": m}. */
    JSONObject apply(JSONArray ids, Uri sound) throws Exception {
        int index = Sounds.alarmIndex(context, sound);
        JSONObject backup = loadBackup();
        Map<Long, JSONObject> current = new HashMap<>();
        int ok = 0, failed = 0;
        // Erst alle aktuellen Werte lesen und die alten Töne sichern, dann schreiben –
        // so bleibt die Sicherung vollständig, auch wenn die App mittendrin beendet wird
        for (int i = 0; i < ids.length(); i++) {
            long id = ids.getLong(i);
            JSONObject now = read(id);
            if (now == null) { failed++; continue; }
            current.put(id, now);
            if (!backup.has(String.valueOf(id))) backup.put(String.valueOf(id), now);
        }
        saveBackup(backup);
        for (Map.Entry<Long, JSONObject> e : current.entrySet()) {
            JSONObject now = e.getValue();
            ContentValues v = new ContentValues();
            v.put("alarmuri", encodeLike(now.getString("uri"), sound.toString()));
            v.put("alarmtone", index);
            // Weckton statt Bixby-Briefing/Promi-Stimme; ob der Ton an oder aus ist, bleibt wie eingestellt
            v.put("dailybrief", now.getLong("brief") & ~SOUND_MODE_BITS);
            if (update(ContentUris.withAppendedId(URI, e.getKey()), v)) ok++; else failed++;
        }
        JSONObject r = new JSONObject();
        r.put("ok", ok);
        r.put("failed", failed);
        return r;
    }

    /** Stellt die Klingeltöne wieder her, die die Wecker vor der ersten Änderung durch Weckton hatten. */
    JSONObject restore() throws Exception {
        JSONObject backup = loadBackup();
        int ok = 0, gone = 0;
        JSONObject left = new JSONObject();
        Iterator<String> keys = backup.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            JSONObject b = backup.getJSONObject(key);
            long id = Long.parseLong(key);
            JSONObject now;
            try {
                now = read(id);
            } catch (RuntimeException e) {
                left.put(key, b);
                continue;
            }
            if (now == null) { gone++; continue; } // Wecker wurde inzwischen gelöscht
            ContentValues v = new ContentValues();
            v.put("alarmuri", b.optString("uri", ""));
            v.put("alarmtone", b.optLong("tone", 0));
            v.put("dailybrief", (now.getLong("brief") & ~SOUND_MODE_BITS) | (b.optLong("brief", 0) & SOUND_MODE_BITS));
            if (update(ContentUris.withAppendedId(URI, id), v)) ok++; else left.put(key, b);
        }
        saveBackup(left);
        JSONObject r = new JSONObject();
        r.put("ok", ok);
        r.put("gone", gone);
        r.put("failed", left.length());
        return r;
    }

    int backupCount() {
        return loadBackup().length();
    }

    /** Ton-Einstellungen eines Weckers, wie sie in der Datenbank stehen; null, wenn es ihn nicht gibt. */
    private JSONObject read(long id) throws JSONException {
        Cursor c = context.getContentResolver().query(ContentUris.withAppendedId(URI, id), null, null, null, null);
        if (c == null) throw new IllegalStateException("Die Uhr-App antwortet gerade nicht.");
        try {
            if (!c.moveToFirst()) return null;
            JSONObject o = new JSONObject();
            o.put("uri", getString(c, "alarmuri"));
            o.put("tone", getLong(c, "alarmtone", 0));
            o.put("brief", getLong(c, "dailybrief", 0));
            return o;
        } finally {
            c.close();
        }
    }

    private boolean update(Uri row, ContentValues v) {
        try {
            return context.getContentResolver().update(row, v, null, null) > 0;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private JSONObject loadBackup() {
        try {
            return new JSONObject(prefs.getString(BACKUP, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private void saveBackup(JSONObject backup) {
        prefs.edit().putString(BACKUP, backup.toString()).commit();
    }

    /** Die Uhr-App speichert Klingelton-Adressen URL-kodiert ("content%3A%2F%2Fmedia…"); im selben Format schreiben. */
    static String encodeLike(String existing, String uri) {
        boolean plain = existing != null && existing.contains("://") && !existing.contains("%2F");
        return plain ? uri : Uri.encode(uri);
    }

    static String decode(String stored) {
        return stored == null ? "" : Uri.decode(stored);
    }

    private static long getLong(Cursor c, String column, long fallback) {
        int i = c.getColumnIndex(column);
        if (i < 0 || c.isNull(i)) return fallback;
        try {
            return c.getLong(i);
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    private static String getString(Cursor c, String column) {
        int i = c.getColumnIndex(column);
        if (i < 0 || c.isNull(i)) return "";
        String s = c.getString(i);
        return s == null ? "" : s;
    }
}

package de.unterwegs.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;

/**
 * Losgeh-Erinnerungen: speichert sie, stellt den Wecker (AlarmManager) und zeigt die Benachrichtigung.
 *
 * Eine Erinnerung (JSON aus der Oberfläche):
 * { id, leaveAt (ms), lead (Min. vorher, 0 = nur beim Losgehen), titleBefore, titleNow, text, label, navUrl }
 * Es gibt bis zu zwei Meldungen: "lead" Minuten vorher (Phase 0) und zur Losgeh-Zeit (Phase 1).
 */
final class Reminders {

    static final String CHANNEL = "losgehen";
    static final String EXTRA_ID = "reminderId";
    static final String EXTRA_PHASE = "phase";
    private static final String PREFS = "unterwegs";
    private static final String KEY = "reminders";
    private static final long KEEP_MS = 60 * 60 * 1000L; // eine Stunde nach dem Losgehen aufräumen

    private Reminders() {
    }

    // ------------------------------------------------------------ Speicher

    static JSONArray load(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            return new JSONArray(p.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void store(Context c, JSONArray list) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, list.toString()).apply();
    }

    static JSONObject find(Context c, String id) {
        JSONArray list = load(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && id.equals(r.optString("id"))) return r;
        }
        return null;
    }

    /** Aktuelle Erinnerungen (vergangene werden dabei entfernt). */
    static JSONArray active(Context c) {
        JSONArray list = load(c), keep = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && r.optLong("leaveAt") + KEEP_MS > now) keep.put(r);
        }
        if (keep.length() != list.length()) store(c, keep);
        return keep;
    }

    // ------------------------------------------------------------ Wecker

    /** Speichert und plant eine Erinnerung. Rückgabe: "exact" oder "inexact" (ohne Erlaubnis für genaue Wecker). */
    static String add(Context c, JSONObject r) {
        String id = r.optString("id");
        cancel(c, id);
        JSONArray list = active(c);
        list.put(r);
        store(c, list);
        return schedule(c, r);
    }

    static void cancel(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        for (int phase = 0; phase < 2; phase++) {
            PendingIntent pi = alarmIntent(c, id, phase, PendingIntent.FLAG_NO_CREATE);
            if (pi != null && am != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notificationId(id));
        JSONArray list = load(c), keep = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) keep.put(o);
        }
        store(c, keep);
    }

    /** Nach Neustart oder Update: alle noch kommenden Erinnerungen neu planen. */
    static void rescheduleAll(Context c) {
        JSONArray list = active(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null) schedule(c, r);
        }
    }

    private static String schedule(Context c, JSONObject r) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return "inexact";
        boolean exact = canExact(am);
        long now = System.currentTimeMillis();
        long leave = r.optLong("leaveAt");
        int lead = r.optInt("lead", 0);
        String id = r.optString("id");
        long[] times = {leave - lead * 60000L, leave};
        for (int phase = 0; phase < 2; phase++) {
            if (phase == 0 && lead <= 0) continue;
            long at = times[phase];
            if (at < now - 30000L) continue;
            PendingIntent pi = alarmIntent(c, id, phase, PendingIntent.FLAG_UPDATE_CURRENT);
            if (pi == null) continue;
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(at, now + 1000L), pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(at, now + 1000L), pi);
        }
        return exact ? "exact" : "inexact";
    }

    /** Ab Android 12 braucht ein genauer Wecker eine Erlaubnis (über USE_EXACT_ALARM meist automatisch da). */
    static boolean canExact(AlarmManager am) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try {
            Method m = AlarmManager.class.getMethod("canScheduleExactAlarms");
            return (Boolean) m.invoke(am);
        } catch (Exception e) {
            return false;
        }
    }

    private static PendingIntent alarmIntent(Context c, String id, int phase, int flags) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction("de.unterwegs.app.REMINDER." + id + "." + phase);
        i.putExtra(EXTRA_ID, id);
        i.putExtra(EXTRA_PHASE, phase);
        return PendingIntent.getBroadcast(c, requestCode(id, phase), i, flags | immutable());
    }

    private static int requestCode(String id, int phase) {
        return (id.hashCode() & 0x0FFFFFFF) * 2 + phase;
    }

    static int notificationId(String id) {
        return id.hashCode() & 0x7FFFFFFF;
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    // ------------------------------------------------------------ Benachrichtigung

    static boolean notificationsAllowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Losgeh-Erinnerungen", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Erinnert dich, wann du losgehen musst");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, String id, int phase) {
        JSONObject r = find(c, id);
        if (r == null) return;
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        String title = phase == 0 ? r.optString("titleBefore") : r.optString("titleNow");
        String text = r.optString("text");
        String label = r.optString("label");

        Intent open = new Intent(c, MainActivity.class);
        open.setAction("de.unterwegs.app.OPEN_REMINDER." + id);
        open.putExtra(EXTRA_ID, id);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, notificationId(id), open, PendingIntent.FLAG_UPDATE_CURRENT | immutable());

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_walk)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setSubText(label)
                .setWhen(r.optLong("leaveAt"))
                .setShowWhen(true)
                .setColor(0xFF0E7490)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(tap);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH);
            b.setDefaults(Notification.DEFAULT_ALL);
        }
        String nav = r.optString("navUrl");
        if (nav.startsWith("https://")) {
            Intent go = new Intent(Intent.ACTION_VIEW, Uri.parse(nav));
            go.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent goPi = PendingIntent.getActivity(c, notificationId(id) ^ 0x5A5A, go, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
            b.addAction(new Notification.Action.Builder(null, "Navigation starten", goPi).build());
        }
        nm.notify(notificationId(id), b.build());
    }
}

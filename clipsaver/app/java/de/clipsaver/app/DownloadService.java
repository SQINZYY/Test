package de.clipsaver.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Arbeitet die Download-Warteschlange nacheinander ab – als Vordergrund-Dienst mit Benachrichtigung,
 * damit große 4K-Downloads auch weiterlaufen, wenn die App im Hintergrund ist.
 *
 * Auftrag (JSON): kind "ytdlp" (Video/Ton über yt-dlp: url, quality, infoFile, headers) oder
 * kind "files" (direkte Dateien, z. B. TikTok-Fotos oder Medien aus dem Browser: items[{urls[], type, name}], headers).
 */
public class DownloadService extends Service {

    interface Listener {
        void onJob(JSONObject job);
    }

    static volatile Listener listener;

    private static final String CH_PROGRESS = "downloads";
    private static final String CH_DONE = "done";
    private static final int NOTIF_ID = 1;
    private static final Pattern SPEED = Pattern.compile("\\bat\\s+~?\\s*([\\d.]+\\s*[KMG]?i?B/s)");
    private static final Pattern FORMATS = Pattern.compile("Downloading \\d+ format\\(s\\): (\\S+)");
    private static final Pattern ETA = Pattern.compile("ETA\\s+(\\d+:\\d+(?::\\d+)?)");

    private static final LinkedHashMap<String, JSONObject> JOBS = new LinkedHashMap<>();
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean DRAINING = new AtomicBoolean();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static volatile String runningId;
    private static volatile boolean cancelRunning;
    private static volatile HttpURLConnection currentConnection;

    private NotificationManager nm;
    private PowerManager.WakeLock wakeLock;
    private long lastNotify, lastUi;
    private int doneNotifId = 100;

    // ---- Aufrufe aus der App ----

    static String enqueue(Context c, JSONObject job) throws Exception {
        String id = "j" + System.currentTimeMillis() + (int) (Math.random() * 1000);
        job.put("id", id);
        job.put("state", "queued");
        job.put("progress", -1);
        job.put("status", "Wartet …");
        job.put("created", System.currentTimeMillis());
        synchronized (JOBS) {
            JOBS.put(id, job);
        }
        notifyListener(job);
        Intent i = new Intent(c, DownloadService.class).setAction("run");
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
        return id;
    }

    static void cancel(String id) {
        JSONObject job;
        synchronized (JOBS) {
            job = JOBS.get(id);
            if (job == null) return;
            if ("queued".equals(job.optString("state"))) {
                set(job, "state", "canceled");
                set(job, "status", "Abgebrochen");
            }
        }
        if (id.equals(runningId)) {
            cancelRunning = true;
            Engine.cancel(id);
            HttpURLConnection c = currentConnection;
            if (c != null) c.disconnect();
        }
        notifyListener(job);
    }

    static JSONArray jobs() {
        JSONArray out = new JSONArray();
        synchronized (JOBS) {
            for (JSONObject j : JOBS.values()) out.put(j);
            try {
                return new JSONArray(out.toString());
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    static void clearFinished() {
        synchronized (JOBS) {
            Iterator<JSONObject> it = JOBS.values().iterator();
            while (it.hasNext()) {
                String s = it.next().optString("state");
                if (!s.equals("queued") && !s.equals("running")) it.remove();
            }
        }
    }

    static boolean isBusy() {
        synchronized (JOBS) {
            for (JSONObject j : JOBS.values()) {
                String s = j.optString("state");
                if (s.equals("queued") || s.equals("running")) return true;
            }
        }
        return false;
    }

    private static void set(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (Exception ignored) {
            // nur bei NaN/unendlich
        }
    }

    private static void notifyListener(JSONObject job) {
        Listener l = listener;
        if (l == null || job == null) return;
        JSONObject copy;
        synchronized (JOBS) {
            try {
                copy = new JSONObject(job.toString());
            } catch (Exception e) {
                return;
            }
        }
        l.onJob(copy);
    }

    // ---- Dienst ----

    @Override
    public void onCreate() {
        super.onCreate();
        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH_PROGRESS, "Laufende Downloads", NotificationManager.IMPORTANCE_LOW));
            nm.createNotificationChannel(new NotificationChannel(CH_DONE, "Fertige Downloads", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = progressNotification("ClipSaver", "Download startet …", -1, null);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIF_ID, n);
        if (intent != null && "cancel".equals(intent.getAction())) cancel(intent.getStringExtra("id"));
        if (DRAINING.compareAndSet(false, true)) {
            WORKER.execute(new Runnable() {
                @Override
                public void run() {
                    drain();
                }
            });
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Android 15 beendet dataSync-Dienste nach 6 Stunden. */
    public void onTimeout(int startId, int fgsType) {
        String id = runningId;
        if (id != null) cancel(id);
        stopForeground(true);
        stopSelf();
    }

    public void onTimeout(int startId) {
        onTimeout(startId, 0);
    }

    private void drain() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ClipSaver:download");
        wakeLock.acquire(6 * 60 * 60 * 1000L);
        try {
            while (true) {
                JSONObject job = null;
                synchronized (JOBS) {
                    for (JSONObject j : JOBS.values()) {
                        if ("queued".equals(j.optString("state"))) {
                            job = j;
                            break;
                        }
                    }
                    if (job == null) {
                        DRAINING.set(false);
                        break;
                    }
                    set(job, "state", "running");
                    set(job, "status", "Startet …");
                    runningId = job.optString("id");
                    cancelRunning = false;
                }
                notifyListener(job);
                try {
                    run(job);
                } catch (Throwable e) {
                    // darf die Warteschlange nie anhalten
                    synchronized (JOBS) {
                        set(job, "state", "error");
                        set(job, "error", String.valueOf(e.getMessage()));
                    }
                    notifyListener(job);
                }
                runningId = null;
            }
        } finally {
            if (wakeLock.isHeld()) wakeLock.release();
        }
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (!DRAINING.get()) {
                    stopForeground(true);
                    stopSelf();
                }
            }
        });
    }

    private void run(JSONObject job) {
        String id = job.optString("id");
        File dir = new File(getCacheDir(), "jobs/" + id);
        Engine.clean(dir);
        dir.mkdirs();
        List<JSONObject> results = new ArrayList<>();
        String error = null;
        try {
            if ("ytdlp".equals(job.optString("kind"))) runYtDlp(job, dir, results);
            else error = runFiles(job, dir, results);
        } catch (Throwable e) {
            error = cancelRunning ? null : Engine.friendlyError(e);
        }
        Engine.clean(dir);
        dir.delete();
        synchronized (JOBS) {
            JSONArray res = new JSONArray();
            for (JSONObject r : results) res.put(r);
            set(job, "results", res);
            if (cancelRunning) {
                set(job, "state", "canceled");
                set(job, "status", "Abgebrochen");
            } else if (results.isEmpty()) {
                set(job, "state", "error");
                set(job, "status", "Fehlgeschlagen");
                set(job, "error", error == null ? "Unbekannter Fehler" : error);
            } else {
                set(job, "state", "done");
                set(job, "progress", 1);
                set(job, "status", results.size() == 1 ? "Gespeichert" : results.size() + " Dateien gespeichert");
                if (error != null) set(job, "error", error);
            }
        }
        notifyListener(job);
        finishedNotification(job, results);
    }

    // ---- yt-dlp ----

    private void runYtDlp(final JSONObject job, File dir, List<JSONObject> results) throws Exception {
        final String quality = job.optString("quality", "1080");
        final int[] parts = {1};
        final int[] part = {0};
        final String[] stage = {"Video-Infos werden geladen …"};
        update(job, stage[0], -1, true);
        Engine.Result r = Engine.download(this, job.optString("url"), job.has("infoFile") ? job.optString("infoFile") : null,
                quality, job.has("format") ? job.optString("format") : null, job.optJSONObject("headers"), dir, job.optString("id"), new Engine.Progress() {
                    @Override
                    public void onLine(float percent, long eta, String line) {
                        Matcher fm = FORMATS.matcher(line);
                        if (fm.find()) parts[0] = fm.group(1).split("\\+").length;
                        if (line.startsWith("[download] Destination:")) part[0] = Math.min(part[0] + 1, parts[0]);
                        if (line.startsWith("[Merger]")) {
                            update(job, "Bild und Ton werden zusammengefügt …", 0.99, true);
                            return;
                        }
                        if (line.startsWith("[ExtractAudio]")) {
                            update(job, "MP3 wird erstellt …", 0.99, true);
                            return;
                        }
                        if (!line.startsWith("[download]") || percent < 0) return;
                        String what = "audio".equals(quality) ? "Ton" : parts[0] > 1 ? (part[0] <= 1 ? "Video" : "Ton") : "Download";
                        StringBuilder s = new StringBuilder(what).append(" · ").append(Math.round(percent)).append(" %");
                        Matcher sm = SPEED.matcher(line);
                        if (sm.find()) s.append(" · ").append(sm.group(1).replace("iB", "B"));
                        Matcher em = ETA.matcher(line);
                        if (em.find() && !em.group(1).equals("00:00")) s.append(" · noch ").append(em.group(1));
                        int idx = Math.max(part[0], 1) - 1;
                        update(job, s.toString(), (idx + percent / 100.0) / parts[0], false);
                    }
                });
        if (cancelRunning) return;
        String mime = Saver.mimeOf(r.file.getName());
        String label = null;
        int res = r.width > 0 && r.height > 0 ? Math.min(r.width, r.height) : Math.max(r.width, r.height);
        if (!"audio".equals(quality) && res > 0) label = res >= 2160 ? "4K" : res + "p";
        String title = job.optString("title", "");
        if (title.length() == 0) title = r.title != null ? r.title : "Video";
        String name = title + (label != null ? " (" + label + ")" : "");
        update(job, "Wird gespeichert …", 1, true);
        Uri uri = Saver.save(this, r.file, name, mime);
        results.add(saved(job, uri, mime, name, label));
    }

    // ---- direkte Dateien ----

    /** Lädt alle Einträge; liefert eine Fehlermeldung, falls einzelne nicht klappten. */
    private String runFiles(JSONObject job, File dir, List<JSONObject> results) throws Exception {
        JSONArray items = job.optJSONArray("items");
        JSONObject headers = job.optJSONObject("headers");
        int n = items == null ? 0 : items.length();
        String lastError = null;
        int failed = 0;
        for (int i = 0; i < n && !cancelRunning; i++) {
            JSONObject item = items.getJSONObject(i);
            JSONObject h = item.optJSONObject("headers") != null ? item.optJSONObject("headers") : headers;
            JSONArray urls = item.optJSONArray("urls");
            File tmp = new File(dir, "item" + i);
            String mime = null;
            for (int u = 0; urls != null && u < urls.length() && mime == null && !cancelRunning; u++) {
                try {
                    mime = fetch(job, urls.getString(u), h, tmp, item.optString("type", "image"), i, n);
                } catch (IOException e) {
                    lastError = e.getMessage();
                }
            }
            if (mime == null) {
                if (!cancelRunning) failed++;
                continue;
            }
            String name = item.optString("name", job.optString("title", "ClipSaver"));
            update(job, "Wird gespeichert …", (i + 1.0) / n, true);
            try {
                Uri uri = Saver.save(this, tmp, name, mime);
                results.add(saved(job, uri, mime, name, null));
            } catch (Exception e) {
                lastError = "Speichern: " + e.getMessage();
                failed++;
            }
        }
        if (failed == 0) return null;
        String why = lastError == null ? "" : " (" + lastError + ")";
        return failed == n ? "Download fehlgeschlagen" + why : failed + " von " + n + " Dateien konnten nicht geladen werden" + why;
    }

    private String fetch(JSONObject job, String url, JSONObject headers, File dst, String type, int index, int count) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        currentConnection = c;
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", Http.UA_DESKTOP);
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    c.setRequestProperty(k, headers.optString(k));
                }
            }
            int code = c.getResponseCode();
            if (code >= 400) throw new IOException("HTTP " + code);
            String mime = c.getContentType();
            if (mime != null) mime = mime.split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (mime == null || mime.equals("application/octet-stream") || mime.equals("binary/octet-stream") || Saver.extOf(mime).length() == 0) {
                String guess = Saver.mimeOf(url.split("\\?")[0]);
                mime = !guess.equals("application/octet-stream") ? guess
                        : type.equals("video") ? "video/mp4" : type.equals("audio") ? "audio/mp4" : "image/jpeg";
            }
            if (mime.startsWith("text/")) throw new IOException("keine Mediendatei");
            long total = c.getContentLength();
            String what = type.equals("video") ? "Video" : type.equals("audio") ? "Ton" : "Bild";
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(dst)) {
                byte[] buf = new byte[128 * 1024];
                long done = 0;
                int r;
                while ((r = in.read(buf)) > 0) {
                    if (cancelRunning) throw new IOException("abgebrochen");
                    out.write(buf, 0, r);
                    done += r;
                    double p = total > 0 ? (double) done / total : 0;
                    String s = count > 1 ? what + " " + (index + 1) + " von " + count : what;
                    if (total > 0) s += " · " + Math.round(p * 100) + " %";
                    update(job, s, (index + p) / count, false);
                }
            }
            if (dst.length() == 0) throw new IOException("leere Datei");
            return mime;
        } finally {
            currentConnection = null;
            c.disconnect();
        }
    }

    private JSONObject saved(JSONObject job, Uri uri, String mime, String name, String label) throws Exception {
        JSONObject r = new JSONObject();
        r.put("uri", uri.toString());
        r.put("mime", mime);
        r.put("name", name);
        JSONObject h = new JSONObject();
        h.put("id", job.optString("id") + "-" + System.nanoTime());
        h.put("title", name);
        h.put("kind", Saver.kindOf(mime));
        h.put("uri", uri.toString());
        h.put("mime", mime);
        h.put("time", System.currentTimeMillis());
        h.put("source", job.optString("url", job.optString("pageUrl", "")));
        h.put("platform", job.optString("platform", ""));
        if (label != null) h.put("label", label);
        if (job.has("thumb")) h.put("thumb", job.optString("thumb"));
        Saver.addHistory(this, h);
        return r;
    }

    // ---- Fortschritt & Benachrichtigungen ----

    private void update(JSONObject job, String status, double progress, boolean force) {
        synchronized (JOBS) {
            set(job, "status", status);
            set(job, "progress", progress);
        }
        long now = System.currentTimeMillis();
        if (force || now - lastUi > 250) {
            lastUi = now;
            notifyListener(job);
        }
        if (force || now - lastNotify > 800) {
            lastNotify = now;
            int queued = 0;
            synchronized (JOBS) {
                for (JSONObject j : JOBS.values()) if ("queued".equals(j.optString("state"))) queued++;
            }
            String text = queued > 0 ? status + " · " + queued + " in der Warteschlange" : status;
            nm.notify(NOTIF_ID, progressNotification(job.optString("title", "Download"), text, progress, job.optString("id")));
        }
    }

    private Notification.Builder builder(String channel) {
        if (Build.VERSION.SDK_INT >= 26) return new Notification.Builder(this, channel);
        return new Notification.Builder(this);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setAction("downloads").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification progressNotification(String title, String text, double progress, String jobId) {
        Notification.Builder b = builder(CH_PROGRESS)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp())
                .setProgress(100, (int) Math.round(Math.max(progress, 0) * 100), progress < 0);
        if (jobId != null) {
            Intent cancel = new Intent(this, DownloadService.class).setAction("cancel").putExtra("id", jobId);
            PendingIntent pi = PendingIntent.getService(this, 1, cancel, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.addAction(new Notification.Action.Builder(null, "Abbrechen", pi).build());
        }
        return b.build();
    }

    private void finishedNotification(JSONObject job, List<JSONObject> results) {
        String state = job.optString("state");
        if (state.equals("canceled")) return;
        Notification.Builder b = builder(CH_DONE).setSmallIcon(R.drawable.ic_notify).setAutoCancel(true);
        if (state.equals("done")) {
            b.setContentTitle(results.size() == 1 ? "Gespeichert" : results.size() + " Dateien gespeichert");
            b.setContentText(job.optString("title", ""));
            PendingIntent pi = openApp();
            if (results.size() == 1) {
                JSONObject r = results.get(0);
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(r.optString("uri")), r.optString("mime"))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                pi = PendingIntent.getActivity(this, doneNotifId, view, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            }
            b.setContentIntent(pi);
        } else {
            b.setContentTitle("Download fehlgeschlagen");
            b.setContentText(job.optString("title", "") + ": " + job.optString("error", ""));
            b.setStyle(new Notification.BigTextStyle().bigText(job.optString("title", "") + "\n" + job.optString("error", "")));
            b.setContentIntent(openApp());
        }
        try {
            nm.notify(doneNotifId++, b.build());
        } catch (SecurityException ignored) {
            // Benachrichtigungen nicht erlaubt
        }
    }
}

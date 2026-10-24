package de.darkos.launcher;

import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.BatteryManager;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import org.robolectric.shadows.ShadowPackageManager;

import java.io.File;
import java.io.FileOutputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

/** Hilfen für die Robolectric-Tests: Beispiel-Apps installieren, warten, Screenshots. */
final class TestSupport {
    private TestSupport() {}

    static final String[][] APPS = {
        // Paket, Name, System-App?
        {"com.google.android.dialer", "Telefon", "1"},
        {"com.google.android.apps.messaging", "Nachrichten", "1"},
        {"com.android.chrome", "Chrome", "1"},
        {"com.google.android.GoogleCamera", "Kamera", "1"},
        {"com.google.android.apps.photos", "Fotos", "1"},
        {"com.android.settings", "Einstellungen", "1"},
        {"com.android.vending", "Play Store", "1"},
        {"com.google.android.deskclock", "Uhr", "1"},
        {"com.google.android.calendar", "Kalender", "1"},
        {"com.google.android.apps.maps", "Maps", "1"},
        {"com.google.android.gm", "Gmail", "1"},
        {"com.google.android.youtube", "YouTube", "1"},
        {"com.google.android.calculator", "Rechner", "1"},
        {"com.whatsapp", "WhatsApp", "0"},
        {"com.spotify.music", "Spotify", "0"},
        {"com.instagram.android", "Instagram", "0"},
        {"org.telegram.messenger", "Telegram", "0"},
        {"com.discord", "Discord", "0"},
        {"com.netflix.mediaclient", "Netflix", "0"},
        {"de.hafas.android.db", "DB Navigator", "0"},
        {"com.paypal.android.p2pmobile", "PayPal", "0"},
        {"com.anthropic.claude", "Claude", "0"},
        {"de.example.banking", "Sparkasse", "0"},
        {"com.example.zylo", "Zylo Notes Pro", "0"},
        {"com.example.quark", "Quark", "0"},
        {"com.example.ark", "Ärztefinder", "0"},
    };

    /** Statische Zustände aus vorherigen Tests entfernen (gleiche Robolectric-Sandbox). */
    static void resetStatics() {
        try {
            java.lang.reflect.Field f = Sheet.class.getDeclaredField("current");
            f.setAccessible(true);
            f.set(null, null);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    static void installApps(Context c) {
        ShadowPackageManager spm = shadowOf(c.getPackageManager());
        for (String[] a : APPS) {
            String pkg = a[0];
            PackageInfo pi = new PackageInfo();
            pi.packageName = pkg;
            pi.applicationInfo = new ApplicationInfo();
            pi.applicationInfo.packageName = pkg;
            pi.applicationInfo.nonLocalizedLabel = a[1];
            pi.applicationInfo.flags = "1".equals(a[2]) ? ApplicationInfo.FLAG_SYSTEM : 0;
            spm.installPackage(pi);
            ComponentName cn = new ComponentName(pkg, pkg + ".MainActivity");
            ActivityInfo ai = spm.addActivityIfNotPresent(cn);
            ai.nonLocalizedLabel = a[1];
            ai.applicationInfo = pi.applicationInfo;
            IntentFilter f = new IntentFilter(Intent.ACTION_MAIN);
            f.addCategory(Intent.CATEGORY_LAUNCHER);
            spm.addIntentFilterForActivity(cn, f);
        }
        role(spm, "com.google.android.dialer", new IntentFilter(Intent.ACTION_DIAL));
        IntentFilter sms = new IntentFilter(Intent.ACTION_SENDTO);
        sms.addDataScheme("smsto");
        role(spm, "com.google.android.apps.messaging", sms);
        IntentFilter web = new IntentFilter(Intent.ACTION_VIEW);
        web.addCategory(Intent.CATEGORY_BROWSABLE);
        web.addDataScheme("https");
        role(spm, "com.android.chrome", web);
        role(spm, "com.google.android.GoogleCamera", new IntentFilter(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA));
    }

    private static void role(ShadowPackageManager spm, String pkg, IntentFilter f) {
        f.addCategory(Intent.CATEGORY_DEFAULT);
        try {
            spm.addIntentFilterForActivity(new ComponentName(pkg, pkg + ".MainActivity"), f);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    static void stickyBattery(Context c) {
        Intent b = new Intent(Intent.ACTION_BATTERY_CHANGED)
            .putExtra(BatteryManager.EXTRA_LEVEL, 76)
            .putExtra(BatteryManager.EXTRA_SCALE, 100)
            .putExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_CHARGING)
            .putExtra(BatteryManager.EXTRA_PLUGGED, BatteryManager.BATTERY_PLUGGED_USB)
            .putExtra(BatteryManager.EXTRA_TEMPERATURE, 312)
            .putExtra(BatteryManager.EXTRA_VOLTAGE, 4123)
            .putExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_GOOD);
        c.sendStickyBroadcast(b);
    }

    static final String WEATHER_JSON = "{\"latitude\":52.52,\"longitude\":13.42,\"timezone\":\"Europe/Berlin\","
        + "\"current_units\":{\"temperature_2m\":\"°C\"},"
        + "\"current\":{\"time\":\"2026-10-24T21:45\",\"interval\":900,\"temperature_2m\":11.4,\"apparent_temperature\":9.2,"
        + "\"relative_humidity_2m\":81,\"weather_code\":2,\"is_day\":0,\"wind_speed_10m\":13.7},"
        + "\"daily\":{\"time\":[\"2026-10-24\",\"2026-10-25\",\"2026-10-26\",\"2026-10-27\"],"
        + "\"weather_code\":[2,61,3,0],\"temperature_2m_max\":[13.1,12.0,10.4,14.8],\"temperature_2m_min\":[6.2,7.5,5.1,4.9]}}";

    static void weatherCache(Context c) {
        Prefs p = Prefs.get(c);
        p.setPlace("Berlin", 52.52, 13.41);
        p.setWeather(WEATHER_JSON, System.currentTimeMillis());
    }

    static void idle(long ms) {
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms));
    }

    static void waitFor(BooleanSupplier cond, long timeoutMs) throws InterruptedException {
        long end = System.nanoTime() + timeoutMs * 1_000_000L;
        while (!cond.getAsBoolean()) {
            if (System.nanoTime() > end) throw new AssertionError("Zeitüberschreitung beim Warten");
            Thread.sleep(15);
            shadowOf(Looper.getMainLooper()).idle();
        }
    }

    /** Lässt Hintergrund-Threads (Icons) arbeiten und die Hauptschleife laufen. */
    static void settle(long ms) throws InterruptedException {
        long end = System.nanoTime() + ms * 1_000_000L;
        while (System.nanoTime() < end) {
            Thread.sleep(20);
            idle(20);
        }
    }

    static File shot(Activity a, String name) throws Exception {
        View v = a.getWindow().getDecorView();
        // Robolectric zeichnet nur auf Anforderung: einmal vorzeichnen, damit View-Animationen starten und enden
        for (int i = 0; i < 4; i++) {
            Bitmap warm = Bitmap.createBitmap(Math.max(1, v.getWidth()), Math.max(1, v.getHeight()), Bitmap.Config.ARGB_8888);
            v.draw(new Canvas(warm));
            warm.recycle();
            idle(250);
        }
        return shot(v, name);
    }

    static File shot(View v, String name) throws Exception {
        if (v.getWidth() == 0) {
            v.measure(View.MeasureSpec.makeMeasureSpec(786, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1704, View.MeasureSpec.EXACTLY));
            v.layout(0, 0, v.getMeasuredWidth(), v.getMeasuredHeight());
        }
        Bitmap b = Bitmap.createBitmap(v.getWidth(), v.getHeight(), Bitmap.Config.ARGB_8888);
        v.draw(new Canvas(b));
        return save(b, name);
    }

    static File save(Bitmap b, String name) throws Exception {
        String dir = System.getProperty("screenshots");
        if (dir == null) dir = "target/screenshots";
        File d = new File(dir);
        d.mkdirs();
        File f = new File(d, name + ".png");
        try (FileOutputStream out = new FileOutputStream(f)) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        return f;
    }

    @SuppressWarnings("unchecked")
    static <T extends View> List<T> find(View root, Class<T> type) {
        List<T> out = new ArrayList<>();
        if (type.isInstance(root)) out.add((T) root);
        if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) out.addAll(find(g.getChildAt(i), type));
        }
        return out;
    }

    static TextView findText(View root, String text) {
        for (TextView t : find(root, TextView.class)) if (text.contentEquals(t.getText())) return t;
        return null;
    }
}

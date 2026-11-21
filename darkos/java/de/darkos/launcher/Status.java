package de.darkos.launcher;

import android.content.Intent;
import android.os.BatteryManager;

/** Akku- und Wetterzustand, den Startseite und Widgets anzeigen. */
final class Status {
    int level = -1;
    boolean charging;
    boolean full;
    int plugged;
    float tempC = Float.NaN;
    float volt = Float.NaN;
    int health;
    long chargeLeftMs = -1;

    Weather.Data weather;
    long weatherTime;
    boolean weatherLoading;
    String weatherError;

    void readBattery(Intent i, BatteryManager bm) {
        int l = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int s = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        level = l < 0 || s <= 0 ? -1 : Math.round(l * 100f / s);
        int st = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        charging = st == BatteryManager.BATTERY_STATUS_CHARGING || (plugged != 0 && st != BatteryManager.BATTERY_STATUS_FULL);
        full = st == BatteryManager.BATTERY_STATUS_FULL || (plugged != 0 && level >= 100);
        int t = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        tempC = t == Integer.MIN_VALUE ? Float.NaN : t / 10f;
        int v = i.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
        volt = v <= 0 ? Float.NaN : (v > 1000 ? v / 1000f : v);
        health = i.getIntExtra(BatteryManager.EXTRA_HEALTH, 0);
        chargeLeftMs = -1;
        if (android.os.Build.VERSION.SDK_INT >= 28 && bm != null && charging) {
            try {
                chargeLeftMs = bm.computeChargeTimeRemaining();
            } catch (RuntimeException ignored) {
                chargeLeftMs = -1;
            }
        }
    }

    String plugText() {
        switch (plugged) {
            case BatteryManager.BATTERY_PLUGGED_AC: return "Netzteil";
            case BatteryManager.BATTERY_PLUGGED_USB: return "USB";
            case BatteryManager.BATTERY_PLUGGED_WIRELESS: return "Kabellos";
            default: return "";
        }
    }

    String healthText() {
        switch (health) {
            case BatteryManager.BATTERY_HEALTH_GOOD: return "Gut";
            case BatteryManager.BATTERY_HEALTH_OVERHEAT: return "Überhitzt";
            case BatteryManager.BATTERY_HEALTH_DEAD: return "Defekt";
            case BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE: return "Überspannung";
            case BatteryManager.BATTERY_HEALTH_COLD: return "Zu kalt";
            default: return "Unbekannt";
        }
    }

    /** Farbe für den Akkustand: rot bei wenig, grün beim Laden. */
    int batteryColor(int accent) {
        if (charging || full) return Ui.NEON[Ui.GREEN];
        if (level >= 0 && level <= 15) return Ui.NEON[Ui.RED];
        if (level >= 0 && level <= 30) return Ui.NEON[Ui.ORANGE];
        return accent;
    }

    static String duration(long ms) {
        long min = Math.max(1, ms / 60000);
        if (min < 60) return min + " min";
        return (min / 60) + " h " + (min % 60) + " min";
    }
}

package de.darkos.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Alle Einstellungen und Listen (Startbildschirm, Dock, Widgets …) von DarkOS. */
final class Prefs {
    static final String STYLE_NEON = "neon", STYLE_GRADIENT = "gradient", STYLE_GLASS = "glass", STYLE_ORIGINAL = "original";
    static final String SHAPE_ROUNDED = "rounded", SHAPE_CIRCLE = "circle", SHAPE_SQUARE = "square";
    static final String COLORS_MULTI = "multi", COLORS_ACCENT = "accent";
    static final String BG_GRID = "grid", BG_NEBULA = "nebula", BG_PARTICLES = "particles", BG_BLACK = "black";
    static final int MAX_DOCK = 5;
    static final int MAX_FAVORITES = 16;

    private static Prefs instance;

    private final Context app;
    private final SharedPreferences sp;
    private final SharedPreferences stats;

    private Prefs(Context c) {
        app = c;
        sp = c.getSharedPreferences("darkos", Context.MODE_PRIVATE);
        stats = c.getSharedPreferences("darkos_stats", Context.MODE_PRIVATE);
    }

    static synchronized Prefs get(Context c) {
        Context a = c.getApplicationContext();
        if (instance == null || instance.app != a) instance = new Prefs(a);
        return instance;
    }

    /** Wird bei jeder Design-Änderung erhöht, damit der Startbildschirm neu zeichnet. */
    int rev() {
        return sp.getInt("rev", 0);
    }

    void bump() {
        sp.edit().putInt("rev", rev() + 1).apply();
    }

    int accentIndex() {
        return sp.getInt("accent", Ui.VIOLET);
    }

    int accent() {
        return Ui.neon(accentIndex());
    }

    void setAccent(int index) {
        sp.edit().putInt("accent", index).apply();
        bump();
    }

    String iconStyle() {
        return sp.getString("iconStyle", STYLE_NEON);
    }

    String iconShape() {
        return sp.getString("iconShape", SHAPE_ROUNDED);
    }

    String iconColors() {
        return sp.getString("iconColors", COLORS_MULTI);
    }

    String background() {
        return sp.getString("background", BG_GRID);
    }

    boolean animations() {
        return sp.getBoolean("animations", true);
    }

    boolean labels() {
        return sp.getBoolean("labels", true);
    }

    int drawerColumns() {
        return sp.getInt("columns", 4);
    }

    String name() {
        return sp.getString("name", "");
    }

    boolean miniWidgets() {
        return sp.getBoolean("miniWidgets", true);
    }

    boolean swipeDown() {
        return sp.getBoolean("swipeDown", true);
    }

    void putString(String key, String value) {
        sp.edit().putString(key, value).apply();
        bump();
    }

    void putBool(String key, boolean value) {
        sp.edit().putBoolean(key, value).apply();
        bump();
    }

    void putInt(String key, int value) {
        sp.edit().putInt(key, value).apply();
        bump();
    }

    // --- Listen ---

    private List<String> list(String key) {
        String s = sp.getString(key, "");
        List<String> out = new ArrayList<>();
        if (!s.isEmpty()) out.addAll(Arrays.asList(s.split("\n")));
        return out;
    }

    private void setList(String key, List<String> items) {
        sp.edit().putString(key, TextUtils.join("\n", items)).apply();
    }

    boolean defaultsDone() {
        return sp.getBoolean("defaultsDone", false);
    }

    void setDefaultsDone() {
        sp.edit().putBoolean("defaultsDone", true).apply();
    }

    boolean welcomeDone() {
        return sp.getBoolean("welcomeDone", false);
    }

    void setWelcomeDone() {
        sp.edit().putBoolean("welcomeDone", true).apply();
    }

    List<String> favorites() {
        return list("favorites");
    }

    void setFavorites(List<String> keys) {
        setList("favorites", keys);
    }

    List<String> dock() {
        return list("dock");
    }

    void setDock(List<String> keys) {
        setList("dock", keys);
    }

    Set<String> hidden() {
        return new HashSet<>(list("hidden"));
    }

    void setHidden(Set<String> keys) {
        setList("hidden", new ArrayList<>(keys));
    }

    List<String> widgets() {
        return list("widgets");
    }

    void setWidgets(List<String> ids) {
        setList("widgets", ids);
    }

    // --- Pro App ---

    String labelOverride(String key) {
        return sp.getString("label:" + key, null);
    }

    void setLabelOverride(String key, String label) {
        if (label == null || label.trim().isEmpty()) sp.edit().remove("label:" + key).apply();
        else sp.edit().putString("label:" + key, label.trim()).apply();
    }

    /** "auto", "original" oder "g:<symbol>". */
    String iconOverride(String key) {
        return sp.getString("icon:" + key, "auto");
    }

    void setIconOverride(String key, String value) {
        sp.edit().putString("icon:" + key, value).apply();
    }

    /** Index in Ui.NEON oder -1 für automatisch. */
    int colorOverride(String key) {
        return sp.getInt("color:" + key, -1);
    }

    void setColorOverride(String key, int index) {
        sp.edit().putInt("color:" + key, index).apply();
    }

    int launchCount(String key) {
        return stats.getInt(key, 0);
    }

    void countLaunch(String key) {
        stats.edit().putInt(key, launchCount(key) + 1).apply();
    }

    // --- Widgets ---

    int widgetHeight(int appWidgetId) {
        return sp.getInt("wh:" + appWidgetId, 0);
    }

    void setWidgetHeight(int appWidgetId, int dp) {
        sp.edit().putInt("wh:" + appWidgetId, dp).apply();
    }

    String note() {
        return sp.getString("note", "");
    }

    void setNote(String text) {
        sp.edit().putString("note", text).apply();
    }

    String city() {
        return sp.getString("city", "");
    }

    double lat() {
        return Double.longBitsToDouble(sp.getLong("lat", 0));
    }

    double lon() {
        return Double.longBitsToDouble(sp.getLong("lon", 0));
    }

    void setPlace(String city, double lat, double lon) {
        sp.edit().putString("city", city)
            .putLong("lat", Double.doubleToLongBits(lat))
            .putLong("lon", Double.doubleToLongBits(lon))
            .remove("weatherJson").remove("weatherTime").apply();
    }

    String weatherJson() {
        return sp.getString("weatherJson", null);
    }

    long weatherTime() {
        return sp.getLong("weatherTime", 0);
    }

    void setWeather(String json, long time) {
        sp.edit().putString("weatherJson", json).putLong("weatherTime", time).apply();
    }

    /** Startbildschirm, Dock und Widgets auf Anfang (Design bleibt). */
    void resetLayout() {
        sp.edit().remove("favorites").remove("dock").remove("widgets").remove("defaultsDone").apply();
        bump();
    }
}

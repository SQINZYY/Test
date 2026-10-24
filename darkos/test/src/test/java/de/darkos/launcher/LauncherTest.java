package de.darkos.launcher;

import static de.darkos.launcher.TestSupport.find;
import static de.darkos.launcher.TestSupport.findText;
import static de.darkos.launcher.TestSupport.idle;
import static de.darkos.launcher.TestSupport.settle;
import static de.darkos.launcher.TestSupport.shot;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.ScrollView;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.util.List;

@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 34, qualifiers = "w393dp-h852dp-xhdpi")
public class LauncherTest {
    private Context context;

    @Before
    public void setUp() {
        context = RuntimeEnvironment.getApplication();
        TestSupport.resetStatics();
        TestSupport.installApps(context);
        TestSupport.stickyBattery(context);
        TestSupport.weatherCache(context);
    }

    private LauncherActivity start() throws Exception {
        ActivityController<LauncherActivity> c = Robolectric.buildActivity(LauncherActivity.class).setup();
        final LauncherActivity a = c.get();
        TestSupport.waitFor(() -> !a.apps.all.isEmpty(), 10000);
        settle(1500);
        return a;
    }

    @Test
    public void appsRolesAndDefaults() throws Exception {
        LauncherActivity a = start();
        // 26 Apps + DarkOS-Eintrag
        assertEquals(TestSupport.APPS.length + 1, a.apps.all.size());
        assertEquals("com.google.android.dialer", a.apps.rolePackages.get("phone"));
        assertEquals("com.android.chrome", a.apps.rolePackages.get("browser"));
        List<String> dock = a.prefs.dock();
        assertTrue(dock.toString(), dock.contains("com.google.android.dialer/.MainActivity"));
        assertTrue(dock.toString(), dock.contains("com.google.android.GoogleCamera/.MainActivity"));
        assertFalse(a.prefs.favorites().isEmpty());
        assertEquals(6, a.prefs.widgets().size());
        // Sortierung mit Umlauten: "Ärztefinder" steht bei A
        assertEquals("Ärztefinder", a.apps.all.get(0).label);
        assertEquals('A', a.apps.all.get(0).section);
    }

    @Test
    public void glyphMatching() throws Exception {
        LauncherActivity a = start();
        assertEquals("chat", glyph(a, "com.whatsapp"));
        assertEquals("phone", glyph(a, "com.google.android.dialer"));
        assertEquals("bank", glyph(a, "de.example.banking"));
        assertEquals("note", glyph(a, "com.example.zylo"));
        assertEquals("sparkles", glyph(a, "com.anthropic.claude"));
        assertEquals("train", glyph(a, "de.hafas.android.db"));
        assertEquals(null, glyph(a, "com.example.quark"));
    }

    private static String glyph(LauncherActivity a, String pkg) {
        return IconFactory.autoGlyph(a.apps.forPackage(pkg), a.apps);
    }

    @Test
    public void screenshotsAndFlows() throws Exception {
        LauncherActivity a = start();
        // Willkommens-Hinweis (erscheint nur, wenn DarkOS noch nicht Standard-Launcher ist)
        settle(800);
        if (!Sheet.isShowing()) a.menus.welcome();
        idle(600);
        assertTrue(Sheet.isShowing());
        shot(a, "00-welcome");
        Sheet.dismissCurrent();
        idle(500);
        shot(a, "01-home");

        // App-Menü öffnen und durchsuchen
        a.openDrawer();
        idle(900);
        settle(600);
        assertTrue(a.drawer.isOpen());
        shot(a, "02-drawer");
        EditText search = find(a.drawer, EditText.class).get(0);
        search.setText("tele");
        idle(300);
        GridView grid = find(a.drawer, GridView.class).get(0);
        assertEquals(2, grid.getAdapter().getCount());
        assertEquals("Telefon", ((Apps.App) grid.getAdapter().getItem(0)).label);
        settle(400);
        shot(a, "03-search");
        search.setText("xyzzy");
        idle(300);
        assertEquals(0, grid.getAdapter().getCount());
        shot(a, "04-no-results");
        search.setText("");
        idle(300);

        // App starten
        Apps.App wa = a.apps.forPackage("com.whatsapp");
        a.launch(wa, null);
        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals("com.whatsapp", started.getComponent().getPackageName());
        assertEquals(1, a.prefs.launchCount(wa.key));

        // Menü zu einer App, Icon-Editor
        Apps.App tg = a.apps.forPackage("org.telegram.messenger");
        a.menus.appMenu(tg, null, "drawer");
        idle(600);
        shot(a, "05-app-menu");
        TextView toHome = findText(a.getWindow().getDecorView(), "Zum Startbildschirm");
        assertNotNull(toHome);
        ((android.view.View) toHome.getParent()).performClick();
        idle(500);
        assertTrue(a.prefs.favorites().contains(tg.key));
        a.menus.iconEditor(wa);
        idle(600);
        shot(a, "06-icon-editor");
        Sheet.dismissCurrent();
        idle(400);
        a.drawer.close(false);
        idle(300);

        // Widgets
        a.showWidgetsPage(null);
        idle(600);
        settle(300);
        shot(a, "07-widgets");
        ScrollView sv = find(a.pager, ScrollView.class).get(0);
        sv.scrollTo(0, 1400);
        idle(200);
        shot(a, "08-widgets-2");
        sv.scrollTo(0, 3000);
        idle(200);
        shot(a, "08-widgets-3");
        a.menus.showAddWidget();
        idle(600);
        shot(a, "09-add-widget");
        Sheet.dismissCurrent();
        idle(400);
        a.onBackPressed();
        idle(600);
        assertEquals(PagerLayout.PAGE_HOME, a.pager.page());

        a.menus.homeMenu();
        idle(600);
        shot(a, "10-home-menu");
        Sheet.dismissCurrent();
        idle(400);
    }

    @Test
    public void iconStylesSheet() throws Exception {
        LauncherActivity a = start();
        String[] styles = {Prefs.STYLE_NEON, Prefs.STYLE_GRADIENT, Prefs.STYLE_GLASS, Prefs.STYLE_ORIGINAL};
        String[] shapes = {Prefs.SHAPE_ROUNDED, Prefs.SHAPE_CIRCLE, Prefs.SHAPE_SQUARE};
        int size = Ui.dp(64);
        List<Apps.App> apps = a.apps.all;
        int cols = 9;
        Bitmap sheet = Bitmap.createBitmap(cols * size, (styles.length + 2) * size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(sheet);
        c.drawColor(0xFF000000);
        for (int r = 0; r < styles.length; r++) {
            IconFactory.Spec spec = new IconFactory.Spec(styles[r], shapes[r % shapes.length], Prefs.COLORS_MULTI, 0);
            for (int i = 0; i < cols; i++) {
                Bitmap b = IconFactory.render(a, apps.get(i * 3 % apps.size()), a.apps, spec, size);
                c.drawBitmap(b, i * size, r * size, null);
            }
        }
        // Akzentfarbe + Kreis, und Monogramm-Fallback
        IconFactory.Spec accent = new IconFactory.Spec(Prefs.STYLE_NEON, Prefs.SHAPE_CIRCLE, Prefs.COLORS_ACCENT, Ui.CYAN);
        for (int i = 0; i < cols; i++) {
            c.drawBitmap(IconFactory.render(a, apps.get(i * 2 + 1), a.apps, accent, size), i * size, styles.length * size, null);
        }
        String[] glyphs = {"sun", "rain", "battery_charging", "wifi", "calendar", "note", "zap", "storm", "snow"};
        for (int i = 0; i < cols; i++) {
            c.drawBitmap(IconFactory.glowGlyph(a, glyphs[i], Ui.neon(i), size), i * size, (styles.length + 1) * size, null);
        }
        TestSupport.save(sheet, "11-icon-styles");
    }

    @Test
    public void backgroundsAndRestyle() throws Exception {
        ActivityController<LauncherActivity> c = Robolectric.buildActivity(LauncherActivity.class).setup();
        final LauncherActivity a = c.get();
        TestSupport.waitFor(() -> !a.apps.all.isEmpty(), 10000);
        settle(1000);
        Sheet.dismissCurrent();
        String[] modes = {Prefs.BG_NEBULA, Prefs.BG_PARTICLES, Prefs.BG_BLACK};
        int[] accents = {Ui.CYAN, Ui.PINK, Ui.GREEN};
        String[] styles = {Prefs.STYLE_GRADIENT, Prefs.STYLE_GLASS, Prefs.STYLE_NEON};
        for (int i = 0; i < modes.length; i++) {
            a.prefs.putString("background", modes[i]);
            a.prefs.putString("iconStyle", styles[i]);
            a.prefs.setAccent(accents[i]);
            c.pause().stop().restart().start().resume();
            settle(1200);
            Sheet.dismissCurrent();
            idle(500);
            shot(a, "12-home-" + modes[i]);
        }
    }

    @Test
    public void settingsScreen() throws Exception {
        ActivityController<SettingsActivity> c = Robolectric.buildActivity(SettingsActivity.class).setup();
        SettingsActivity s = c.get();
        settle(1500);
        shot(s, "13-settings");
        ScrollView sv = find(s.getWindow().getDecorView(), ScrollView.class).get(0);
        sv.scrollTo(0, 1500);
        idle(200);
        shot(s, "14-settings-2");
        sv.scrollTo(0, 4000);
        idle(200);
        shot(s, "15-settings-3");

        // Stil wechseln
        int rev = Prefs.get(s).rev();
        TextView gradient = findText(s.getWindow().getDecorView(), "Verlauf");
        assertNotNull(gradient);
        gradient.performClick();
        idle(300);
        assertEquals(Prefs.STYLE_GRADIENT, Prefs.get(s).iconStyle());
        assertTrue(Prefs.get(s).rev() > rev);
        TextView five = findText(s.getWindow().getDecorView(), "5 Spalten");
        five.performClick();
        idle(300);
        assertEquals(5, Prefs.get(s).drawerColumns());
    }

    @Test
    public void weatherParsing() throws Exception {
        Weather.Data d = Weather.parse(TestSupport.WEATHER_JSON);
        assertEquals(11.4, d.temp, 0.001);
        assertEquals(2, d.code);
        assertFalse(d.day);
        assertEquals(81, d.humidity);
        assertEquals(4, d.days.length);
        assertEquals(61, d.dayCodes[1]);
        assertEquals("Teils bewölkt", Weather.describe(2));
        assertEquals("cloud_moon", Weather.glyph(2, false));
        assertEquals("11°", Weather.temp(11.4));
        assertEquals("-3°", Weather.temp(-2.6));
    }

    @Test
    public void searchRanking() {
        Apps.App a1 = app("Telegram"), a2 = app("Google Telefon"), a3 = app("Hotel Finder"), a4 = app("Google Maps");
        List<Apps.App> r = DrawerView.filter(java.util.Arrays.asList(a3, a2, a1, a4), "tel");
        assertEquals("Telegram", r.get(0).label);
        assertEquals("Google Telefon", r.get(1).label);
        assertEquals("Hotel Finder", r.get(2).label);
        assertEquals(3, r.size());
        assertEquals("Google Maps", DrawerView.filter(java.util.Arrays.asList(a1, a2, a3, a4), "gm").get(0).label);
    }

    private static Apps.App app(String label) {
        return new Apps.App(new android.content.ComponentName("p." + label.hashCode(), "C"), label, false, false, null);
    }
}

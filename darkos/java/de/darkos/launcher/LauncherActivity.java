package de.darkos.launcher;

import android.app.Activity;
import android.app.ActivityOptions;
import android.app.AlarmManager;
import android.app.SearchManager;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.LauncherApps;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Rect;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.UserHandle;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.view.View;
import android.view.ViewParent;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Der Startbildschirm von DarkOS. */
public final class LauncherActivity extends Activity implements DrawerView.Host, HomePage.Host,
        PagerLayout.Listener, WidgetHost.Callback {
    private static final int REQ_ROLE = 51;

    Prefs prefs;
    final Status status = new Status();
    Apps apps = Apps.empty();
    WidgetHost widgetHost;

    Icons icons;
    Menus menus;
    private FrameLayout root;
    private NeonBackground background;
    PagerLayout pager;
    HomePage home;
    WidgetsPage widgetsPage;
    DrawerView drawer;
    private FrameLayout sheetHost;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newFixedThreadPool(2);
    private int appliedRev = -1;
    private boolean started, resumed, launchedApp, introPending, loadPending;
    private long roleRequestTime;
    private int insetTop, insetNav, insetBottom;
    private LauncherApps.Callback packageCallback;

    private final BroadcastReceiver timeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            home.tick();
            widgetsPage.onMinute();
        }
    };

    private final BroadcastReceiver batteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            status.readBattery(i, (BatteryManager) getSystemService(BATTERY_SERVICE));
            updateStatusViews();
        }
    };

    private final Runnable reloadApps = new Runnable() {
        @Override
        public void run() {
            loadApps();
        }
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Ui.init(this);
        Ui.display(this, true);
        prefs = Prefs.get(this);
        icons = new Icons(this, Ui.dp(64));
        widgetHost = new WidgetHost(this, this);
        if (saved != null) widgetHost.restorePending(saved.getInt("pendingWidget", -1));

        Window w = getWindow();
        w.setStatusBarColor(0);
        w.setNavigationBarColor(0);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                readInsets(insets);
                applyInsets();
                return insets;
            }
        });
        setContentView(root);
        buildUi();

        loadCachedWeather();
        registerPackageCallback();
        loadApps();
    }

    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets sys = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            insetTop = sys.top;
            insetNav = sys.bottom;
            insetBottom = Math.max(sys.bottom, ime.bottom);
        } else {
            insetTop = insets.getSystemWindowInsetTop();
            insetNav = Math.min(insets.getStableInsetBottom(), insets.getSystemWindowInsetBottom());
            insetBottom = insets.getSystemWindowInsetBottom();
        }
    }

    private void applyInsets() {
        if (home == null) return;
        home.setInsets(insetTop, insetNav);
        widgetsPage.setInsets(insetTop, insetBottom);
        drawer.setInsets(insetTop, insetBottom);
        boolean ime = insetBottom > insetNav + Ui.dp(40);
        Sheet.onInsetsChanged(insetNav, ime ? insetBottom : 0);
    }

    /** Baut die ganze Oberfläche (auch nach Design-Änderungen in den Einstellungen). */
    private void buildUi() {
        if (widgetsPage != null) widgetsPage.stop();
        Sheet.dismissCurrent();
        appliedRev = prefs.rev();
        Ui.init(this);
        icons.invalidateAll();
        icons.setApps(apps);
        root.removeAllViews();

        background = new NeonBackground(this);
        background.configure(prefs.background(), prefs.accent(), Ui.animationsEnabled(this));
        root.addView(background, new FrameLayout.LayoutParams(-1, -1));

        pager = new PagerLayout(this);
        pager.setListener(this);
        widgetsPage = new WidgetsPage(this);
        home = new HomePage(this, this);
        pager.addView(widgetsPage.root);
        pager.addView(home.root);
        root.addView(pager, new FrameLayout.LayoutParams(-1, -1));

        drawer = new DrawerView(this, this);
        root.addView(drawer, new FrameLayout.LayoutParams(-1, -1));

        sheetHost = new FrameLayout(this);
        sheetHost.setVisibility(View.GONE);
        root.addView(sheetHost, new FrameLayout.LayoutParams(-1, -1));
        menus = new Menus(this, sheetHost);

        home.restyle();
        widgetsPage.rebuild();
        if (started) {
            widgetsPage.start();
            background.setRunning(true);
            home.startAmbient(Ui.animationsEnabled(this));
        }
        home.tick();
        updateStatusViews();
        reloadLists();
        applyInsets();
        root.requestApplyInsets();
    }

    @Override
    protected void onStart() {
        super.onStart();
        started = true;
        if (prefs.rev() != appliedRev) buildUi();
        widgetHost.start();
        IntentFilter time = new IntentFilter(Intent.ACTION_TIME_TICK);
        time.addAction(Intent.ACTION_TIME_CHANGED);
        time.addAction(Intent.ACTION_TIMEZONE_CHANGED);
        time.addAction(AlarmManager.ACTION_NEXT_ALARM_CLOCK_CHANGED);
        register(timeReceiver, time);
        register(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        home.tick();
        widgetsPage.start();
        widgetsPage.onMinute();
        background.setRunning(drawer.progress() < 1f);
        home.startAmbient(Ui.animationsEnabled(this));
        refreshWeather(false);
        if (loadPending) {
            loadPending = false;
            loadApps();
        }
    }

    private void register(BroadcastReceiver r, IntentFilter f) {
        // Nur System-Broadcasts; ab Android 13 muss trotzdem ein Export-Flag angegeben werden
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, 2 /* Context.RECEIVER_EXPORTED */);
        else registerReceiver(r, f);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        introPending = true;
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (introPending && pager.page() == PagerLayout.PAGE_HOME && drawer.progress() == 0f && Ui.animationsEnabled(this)) {
            home.playIntro();
        }
        introPending = false;
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
    }

    @Override
    protected void onStop() {
        super.onStop();
        started = false;
        try {
            unregisterReceiver(timeReceiver);
            unregisterReceiver(batteryReceiver);
        } catch (IllegalArgumentException ignored) {
            // war nicht registriert
        }
        widgetHost.stop();
        widgetsPage.stop();
        background.setRunning(false);
        home.startAmbient(false);
        if (launchedApp) {
            launchedApp = false;
            Sheet.dismissCurrent();
            drawer.close(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (packageCallback != null) {
            LauncherApps la = (LauncherApps) getSystemService(LAUNCHER_APPS_SERVICE);
            if (la != null) la.unregisterCallback(packageCallback);
        }
        icons.shutdown();
        bg.shutdownNow();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("pendingWidget", widgetHost.pendingId());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!Intent.ACTION_MAIN.equals(intent.getAction())) return;
        boolean alreadyOnHome = hasWindowFocus()
            && (intent.getFlags() & Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT) != Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT;
        if (alreadyOnHome) {
            // Home-Taste auf dem Startbildschirm: Menü/App-Menü schließen, sonst zur Startseite
            if (Sheet.dismissCurrent()) return;
            if (drawer.progress() > 0f) {
                drawer.close(true);
                return;
            }
            if (pager.page() != PagerLayout.PAGE_HOME) pager.setPage(PagerLayout.PAGE_HOME, true);
        } else {
            Sheet.dismissCurrent();
            drawer.close(false);
            pager.setPage(PagerLayout.PAGE_HOME, false);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Sheet.dismissCurrent()) return;
        if (drawer.progress() > 0f) {
            drawer.close(true);
            return;
        }
        if (pager.page() != PagerLayout.PAGE_HOME) pager.setPage(PagerLayout.PAGE_HOME, true);
        // Ein Launcher wird mit "Zurück" nicht beendet
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (widgetHost.onResult(request, result, data)) return;
        if (request == REQ_ROLE && !isDefaultLauncher(this) && SystemClock.elapsedRealtime() - roleRequestTime < 700) {
            // Der System-Dialog wurde gar nicht erst angezeigt (früher abgelehnt) -> Einstellungen öffnen
            startSafely(new Intent(Settings.ACTION_HOME_SETTINGS));
        }
    }

    // ------------------------------------------------------------ Apps laden

    private void registerPackageCallback() {
        LauncherApps la = (LauncherApps) getSystemService(LAUNCHER_APPS_SERVICE);
        if (la == null) return;
        packageCallback = new LauncherApps.Callback() {
            @Override
            public void onPackageRemoved(String packageName, UserHandle user) {
                scheduleReload();
            }

            @Override
            public void onPackageAdded(String packageName, UserHandle user) {
                scheduleReload();
            }

            @Override
            public void onPackageChanged(String packageName, UserHandle user) {
                scheduleReload();
            }

            @Override
            public void onPackagesAvailable(String[] packageNames, UserHandle user, boolean replacing) {
                scheduleReload();
            }

            @Override
            public void onPackagesUnavailable(String[] packageNames, UserHandle user, boolean replacing) {
                scheduleReload();
            }
        };
        try {
            la.registerCallback(packageCallback, main);
        } catch (RuntimeException e) {
            packageCallback = null;
        }
    }

    private void scheduleReload() {
        main.removeCallbacks(reloadApps);
        main.postDelayed(reloadApps, 600);
    }

    private void loadApps() {
        final Context ctx = getApplicationContext();
        bg.execute(new Runnable() {
            @Override
            public void run() {
                final Apps loaded = Apps.load(ctx);
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        onAppsLoaded(loaded);
                    }
                });
            }
        });
    }

    private void onAppsLoaded(Apps loaded) {
        if (isDestroyed()) return;
        apps = loaded;
        icons.setApps(apps);
        icons.invalidateAll();
        if (!prefs.defaultsDone()) applyDefaults();
        reloadLists();
        icons.prewarm(new ArrayList<>(apps.visible(prefs.hidden())));
        if (!prefs.welcomeDone()) {
            prefs.setWelcomeDone();
            if (!isDefaultLauncher(this)) {
                main.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (!isFinishing() && started) menus.welcome();
                    }
                }, 600);
            }
        }
    }

    /** Erste Einrichtung: sinnvolles Dock, Favoriten und Widgets. */
    private void applyDefaults() {
        List<String> dock = new ArrayList<>();
        for (String role : new String[] {"phone", "sms", "browser", "camera", "gallery"}) {
            Apps.App a = apps.forPackage(apps.rolePackages.get(role));
            if (role.equals("camera") && a == null) a = apps.forPackage(apps.rolePackages.get("camera2"));
            if (a != null && !dock.contains(a.key)) dock.add(a.key);
        }
        List<String> favs = new ArrayList<>();
        List<String> wanted = new ArrayList<>(Arrays.asList(
            apps.rolePackages.get("market"), "com.whatsapp", "com.google.android.youtube", "com.spotify.music",
            "com.instagram.android", apps.rolePackages.get("maps"), apps.rolePackages.get("mail"),
            apps.rolePackages.get("calendar"), apps.rolePackages.get("clock"), apps.rolePackages.get("settings"),
            apps.rolePackages.get("calculator"), apps.rolePackages.get("music")));
        for (String pkg : wanted) {
            Apps.App a = apps.forPackage(pkg);
            if (a != null && !dock.contains(a.key) && !favs.contains(a.key) && favs.size() < 8) favs.add(a.key);
        }
        if (prefs.dock().isEmpty()) prefs.setDock(dock);
        if (prefs.favorites().isEmpty()) prefs.setFavorites(favs);
        if (prefs.widgets().isEmpty()) {
            prefs.setWidgets(new ArrayList<>(Arrays.asList(Widgets.BUILT_IN)));
            widgetsPage.rebuild();
            if (started) widgetsPage.start();
        }
        prefs.setDefaultsDone();
    }

    /** Startbildschirm, Dock und App-Menü mit den aktuellen Listen füllen. */
    void reloadLists() {
        if (home == null) return;
        Set<String> hidden = prefs.hidden();
        List<Apps.App> visible = apps.visible(hidden);
        boolean loaded = !apps.all.isEmpty();
        List<Apps.App> favApps = resolve(prefs.favorites(), loaded, true);
        List<Apps.App> dockApps = resolve(prefs.dock(), loaded, false);
        home.bind(favApps, dockApps);
        drawer.setApps(visible, frequent(visible));
    }

    private List<Apps.App> resolve(List<String> keys, boolean loaded, boolean favorites) {
        List<Apps.App> out = new ArrayList<>();
        List<String> kept = new ArrayList<>();
        for (String k : keys) {
            Apps.App a = apps.find(k);
            if (a != null) {
                out.add(a);
                kept.add(k);
            } else if (!loaded) {
                kept.add(k);
            }
        }
        // Deinstallierte Apps verschwinden auch vom Startbildschirm
        if (loaded && kept.size() != keys.size()) {
            if (favorites) prefs.setFavorites(kept);
            else prefs.setDock(kept);
        }
        return out;
    }

    private List<Apps.App> frequent(List<Apps.App> visible) {
        List<Apps.App> used = new ArrayList<>();
        for (Apps.App a : visible) if (prefs.launchCount(a.key) >= 2) used.add(a);
        Collections.sort(used, new Comparator<Apps.App>() {
            @Override
            public int compare(Apps.App a, Apps.App b) {
                return prefs.launchCount(b.key) - prefs.launchCount(a.key);
            }
        });
        return used.size() > 5 ? new ArrayList<>(used.subList(0, 5)) : used;
    }

    void refreshHome() {
        reloadLists();
    }

    void refreshIcons(String key) {
        icons.invalidate(key);
        reloadLists();
    }

    // ------------------------------------------------------------ Hosts

    @Override
    public Icons icons() {
        return icons;
    }

    @Override
    public void launch(Apps.App app, View from) {
        if (app.internal) {
            openSettings();
            return;
        }
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(app.component)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        Bundle opts = null;
        if (from != null && from.getWidth() > 0) {
            int[] loc = new int[2];
            from.getLocationOnScreen(loc);
            i.setSourceBounds(new Rect(loc[0], loc[1], loc[0] + from.getWidth(), loc[1] + from.getHeight()));
            if (Ui.animationsEnabled(this)) {
                opts = ActivityOptions.makeScaleUpAnimation(from, 0, 0, from.getWidth(), from.getHeight()).toBundle();
            }
        }
        try {
            startActivity(i, opts);
            prefs.countLaunch(app.key);
            launchedApp = true;
        } catch (ActivityNotFoundException | SecurityException e) {
            toast("„" + app.label + "“ lässt sich nicht öffnen");
            scheduleReload();
        }
    }

    @Override
    public void showAppMenu(Apps.App app, View from) {
        String where = isInside(from, drawer) ? "drawer" : home.isDock(from) ? "dock" : "home";
        menus.appMenu(app, from, where);
    }

    private static boolean isInside(View v, View parent) {
        ViewParent p = v == null ? null : v.getParent();
        while (p != null) {
            if (p == parent) return true;
            p = p.getParent();
        }
        return false;
    }

    @Override
    public void openSettings() {
        startSafely(new Intent(this, SettingsActivity.class));
    }

    @Override
    public void webSearch(String query) {
        Intent i = new Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, query);
        if (!tryStart(i)) {
            try {
                startSafely(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + URLEncoder.encode(query, "UTF-8"))));
            } catch (java.io.UnsupportedEncodingException ignored) {
                // UTF-8 gibt es immer
            }
        }
    }

    @Override
    public void storeSearch(String query) {
        try {
            String q = URLEncoder.encode(query, "UTF-8");
            if (!tryStart(new Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=" + q)))) {
                startSafely(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/search?q=" + q + "&c=apps")));
            }
        } catch (java.io.UnsupportedEncodingException ignored) {
            // UTF-8 gibt es immer
        }
    }

    @Override
    public void onDrawerProgress(float p) {
        if (Build.VERSION.SDK_INT >= 31) {
            float r = Ui.dp(22) * p;
            pager.setRenderEffect(r > 0.5f ? RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP) : null);
        }
        pager.setScaleX(1f - 0.05f * p);
        pager.setScaleY(1f - 0.05f * p);
        pager.setAlpha(1f - 0.6f * p);
        background.setRunning(started && p < 1f);
    }

    @Override
    public void openDrawer() {
        drawer.setProgress(Math.max(drawer.progress(), 0.001f));
        drawer.open();
    }

    @Override
    public void openDrawerSearch() {
        openDrawer();
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (drawer.progress() > 0f) drawer.focusSearch();
            }
        }, 200);
    }

    @Override
    public void openClock() {
        startSafely(new Intent(AlarmClock.ACTION_SHOW_ALARMS));
    }

    @Override
    public void openCalendarAt(long millis) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("content://com.android.calendar/time/" + millis));
        if (!tryStart(i)) startSafely(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR));
    }

    @Override
    public void showWeatherPage() {
        if (prefs.city().isEmpty()) askCity();
        else showWidgetsPage(Widgets.WEATHER);
    }

    @Override
    public void openBatterySettings() {
        startSafely(new Intent(Intent.ACTION_POWER_USAGE_SUMMARY));
    }

    void showWidgetsPage(String id) {
        pager.setPage(PagerLayout.PAGE_WIDGETS, true);
        widgetsPage.scrollTo(id);
    }

    // PagerLayout.Listener

    @Override
    public void onPageOffset(float position) {
        background.setOffset(position);
        home.dots.setPosition(position);
    }

    @Override
    public void onPageSelected(int page) {
        drawer.hideKeyboard();
    }

    @Override
    public void onDrawerDrag(float dy) {
        float h = Math.max(1, root.getHeight());
        drawer.setProgress(-dy / (h * 0.55f));
    }

    @Override
    public void onDrawerRelease(float velocityY, boolean cancelled) {
        if (!cancelled && (velocityY < -Ui.dp(500) || (drawer.progress() > 0.25f && velocityY < Ui.dp(500)))) drawer.animateTo(1f, velocityY);
        else drawer.close(true);
    }

    @Override
    public void onSwipeDown() {
        if (!prefs.swipeDown()) return;
        try {
            Object sb = getSystemService("statusbar");
            Class.forName("android.app.StatusBarManager").getMethod("expandNotificationsPanel").invoke(sb);
        } catch (Exception e) {
            // Auf manchen Geräten nicht erlaubt – dann passiert einfach nichts
        }
    }

    @Override
    public void onEmptyLongPress() {
        menus.homeMenu();
    }

    // WidgetHost.Callback

    @Override
    public void onWidgetAdded(int appWidgetId) {
        List<String> list = prefs.widgets();
        list.add("a:" + appWidgetId);
        prefs.setWidgets(list);
        rebuildWidgets();
        showWidgetsPage("a:" + appWidgetId);
    }

    // ------------------------------------------------------------ Widgets & Wetter

    void showWidgetMenu(String id) {
        menus.widgetMenu(id);
    }

    void showAddWidget() {
        menus.showAddWidget();
    }

    void addWidget(String id) {
        List<String> list = prefs.widgets();
        if (!list.contains(id)) list.add(id);
        prefs.setWidgets(list);
        rebuildWidgets();
        showWidgetsPage(id);
        if (Widgets.WEATHER.equals(id) && prefs.city().isEmpty()) askCity();
    }

    void rebuildWidgets() {
        widgetsPage.rebuild();
        if (started) widgetsPage.start();
    }

    void askCity() {
        menus.askCity();
    }

    void setCity(final String query) {
        toast("Suche „" + query + "“ …");
        bg.execute(new Runnable() {
            @Override
            public void run() {
                Weather.Place place = null;
                String error = null;
                try {
                    place = Weather.geocode(query);
                } catch (Exception e) {
                    error = "Keine Verbindung – bitte später erneut versuchen";
                }
                final Weather.Place found = place;
                final String err = error;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (found == null) {
                            toast(err != null ? err : "Ort „" + query + "“ nicht gefunden");
                            return;
                        }
                        prefs.setPlace(found.name, found.lat, found.lon);
                        status.weather = null;
                        status.weatherTime = 0;
                        refreshWeather(true);
                    }
                });
            }
        });
    }

    private void loadCachedWeather() {
        String json = prefs.weatherJson();
        if (json == null || prefs.city().isEmpty()) return;
        try {
            status.weather = Weather.parse(json);
            status.weatherTime = prefs.weatherTime();
        } catch (Exception ignored) {
            status.weather = null;
        }
    }

    void refreshWeather(boolean force) {
        if (prefs.city().isEmpty()) {
            status.weather = null;
            updateStatusViews();
            return;
        }
        if (status.weatherLoading) return;
        if (!force && System.currentTimeMillis() - prefs.weatherTime() < Weather.MAX_AGE_MS && status.weather != null) return;
        status.weatherLoading = true;
        status.weatherError = null;
        updateStatusViews();
        final double lat = prefs.lat(), lon = prefs.lon();
        bg.execute(new Runnable() {
            @Override
            public void run() {
                String json = null;
                Weather.Data data = null;
                String error = null;
                try {
                    json = Weather.fetch(lat, lon);
                    data = Weather.parse(json);
                } catch (Exception e) {
                    error = e.getClass().getSimpleName();
                }
                final String j = json;
                final Weather.Data d = data;
                final String err = error;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        status.weatherLoading = false;
                        if (d != null) {
                            long now = System.currentTimeMillis();
                            prefs.setWeather(j, now);
                            status.weather = d;
                            status.weatherTime = now;
                        } else {
                            status.weatherError = err;
                        }
                        updateStatusViews();
                    }
                });
            }
        });
    }

    private void updateStatusViews() {
        if (home == null) return;
        home.updateStatus(status);
        widgetsPage.update(status);
    }

    // ------------------------------------------------------------ Hilfen

    void startSafely(Intent i) {
        if (!tryStart(i)) toast("Dafür ist keine passende App installiert");
    }

    private boolean tryStart(Intent i) {
        try {
            if (!(i.getComponent() != null && getPackageName().equals(i.getComponent().getPackageName()))) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    static boolean isDefaultLauncher(Context c) {
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo r = c.getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
        return r != null && r.activityInfo != null && c.getPackageName().equals(r.activityInfo.packageName);
    }

    void requestDefaultLauncher() {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = getSystemService(RoleManager.class);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                try {
                    roleRequestTime = SystemClock.elapsedRealtime();
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_ROLE);
                    return;
                } catch (RuntimeException ignored) {
                    // weiter mit den Einstellungen
                }
            }
        }
        if (!tryStart(new Intent(Settings.ACTION_HOME_SETTINGS))) startSafely(new Intent(Settings.ACTION_SETTINGS));
    }
}

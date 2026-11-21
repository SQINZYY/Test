package de.darkos.launcher;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Einstellungen: Farben, Hintergrund, Icons, Startbildschirm, Widgets, Apps. */
public final class SettingsActivity extends Activity {
    private static final int REQ_ROLE = 7;

    private Prefs prefs;
    private int accent;
    private FrameLayout root;
    private NeonBackground background;
    private ScrollView scroll;
    private LinearLayout list;
    private FrameLayout sheetHost;
    private LinearLayout previewRow;
    private Apps apps;
    private final Handler main = new Handler(Looper.getMainLooper());
    private int insetTop, insetBottom, insetNav;
    private long roleRequestTime;
    private boolean resumedOnce;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Ui.init(this);
        prefs = Prefs.get(this);
        Window w = getWindow();
        w.setStatusBarColor(0);
        w.setNavigationBarColor(0);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
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
            @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets sys = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
                    insetTop = sys.top;
                    insetNav = sys.bottom;
                    insetBottom = Math.max(sys.bottom, ime.bottom);
                } else {
                    insetTop = in.getSystemWindowInsetTop();
                    insetNav = Math.min(in.getStableInsetBottom(), in.getSystemWindowInsetBottom());
                    insetBottom = in.getSystemWindowInsetBottom();
                }
                applyInsets();
                return in;
            }
        });
        setContentView(root);
        build();
        loadApps();
    }

    private void applyInsets() {
        if (list == null) return;
        list.setPadding(Ui.dp(16), insetTop + Ui.dp(8), Ui.dp(16), insetNav + Ui.dp(40));
        boolean ime = insetBottom > insetNav + Ui.dp(40);
        Sheet.onInsetsChanged(insetNav, ime ? insetBottom : 0);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (background != null) background.setRunning(true);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (background != null) background.setRunning(false);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Sheet.dismissCurrent()) return;
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_ROLE) {
            if (!LauncherActivity.isDefaultLauncher(this) && SystemClock.elapsedRealtime() - roleRequestTime < 700) {
                start(new Intent(Settings.ACTION_HOME_SETTINGS));
            }
            build();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Nach Rückkehr aus den System-Einstellungen den Launcher-Status auffrischen
        if (resumedOnce) build();
        resumedOnce = true;
    }

    private void loadApps() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final Apps a = Apps.load(getApplicationContext());
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (isDestroyed()) return;
                        apps = a;
                        paintPreview();
                    }
                });
            }
        }).start();
    }

    /** Baut die Seite neu (z. B. nach Wechsel der Akzentfarbe). */
    private void build() {
        int scrollY = scroll != null ? scroll.getScrollY() : 0;
        Sheet.dismissCurrent();
        accent = prefs.accent();
        root.removeAllViews();
        background = new NeonBackground(this);
        background.configure(Prefs.BG_BLACK.equals(prefs.background()) ? Prefs.BG_BLACK : Prefs.BG_NEBULA, accent, Ui.animationsEnabled(this));
        background.setRunning(true);
        root.addView(background, new FrameLayout.LayoutParams(-1, -1));

        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        list = Ui.column(this);
        scroll.addView(list, new FrameLayout.LayoutParams(-1, -2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        sheetHost = new FrameLayout(this);
        sheetHost.setVisibility(View.GONE);
        root.addView(sheetHost, new FrameLayout.LayoutParams(-1, -1));

        // Kopf
        LinearLayout head = Ui.row(this);
        ImageView back = new ImageView(this);
        back.setImageDrawable(Ui.glyph(this, "left", Ui.TEXT));
        back.setPadding(Ui.dp(10), Ui.dp(10), Ui.dp(10), Ui.dp(10));
        back.setBackground(Ui.ripple(accent, null, 22));
        back.setContentDescription("Zurück");
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        head.addView(back, Ui.lp(Ui.dp(44), Ui.dp(44)));
        LinearLayout titles = Ui.column(this);
        TextView title = Ui.title(this, "Einstellungen", 24);
        Ui.glow(title, Ui.alpha(accent, 0.7f), 12);
        titles.addView(title);
        titles.addView(Ui.text(this, "DarkOS " + version(), 12.5f, Ui.TEXT3), Ui.margins(Ui.lp(-2, -2), 0, 5, 0, 0));
        head.addView(titles, Ui.margins(Ui.lp(0, -2, 1), 8, 0, 0, 0));
        list.addView(head, Ui.margins(Ui.lp(-1, -2), 0, 6, 0, 18));

        launcherCard();

        // Design
        LinearLayout design = section("Design");
        design.addView(caption("Akzentfarbe"));
        design.addView(Menus.colorRow(this, prefs.accentIndex(), false, new Menus.ColorPick() {
            @Override
            public void onPick(int index) {
                prefs.setAccent(index);
                build();
            }
        }), Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 6));
        design.addView(caption("Hintergrund"));
        design.addView(chips("background", prefs.background(),
            new String[] {Prefs.BG_GRID, Prefs.BG_NEBULA, Prefs.BG_PARTICLES, Prefs.BG_BLACK},
            new String[] {"Neon-Grid", "Nebel", "Partikel", "Schwarz"}, false));
        design.addView(toggle("Animationen", "Bewegter Hintergrund, Übergänge, Leuchten", "animations", prefs.animations(), true));

        // Icons
        LinearLayout icons = section("App-Icons");
        previewRow = Ui.row(this);
        previewRow.setPadding(0, Ui.dp(4), 0, Ui.dp(10));
        icons.addView(previewRow, Ui.lp(-1, -2));
        paintPreview();
        icons.addView(caption("Stil"));
        icons.addView(chips("iconStyle", prefs.iconStyle(),
            new String[] {Prefs.STYLE_NEON, Prefs.STYLE_GRADIENT, Prefs.STYLE_GLASS, Prefs.STYLE_ORIGINAL},
            new String[] {"Neon", "Verlauf", "Glas", "Original"}, true));
        icons.addView(caption("Form"));
        icons.addView(chips("iconShape", prefs.iconShape(),
            new String[] {Prefs.SHAPE_ROUNDED, Prefs.SHAPE_CIRCLE, Prefs.SHAPE_SQUARE},
            new String[] {"Abgerundet", "Kreis", "Eckig"}, true));
        icons.addView(caption("Farben"));
        icons.addView(chips("iconColors", prefs.iconColors(),
            new String[] {Prefs.COLORS_MULTI, Prefs.COLORS_ACCENT}, new String[] {"Bunt", "Akzentfarbe"}, true));
        icons.addView(toggle("App-Namen anzeigen", null, "labels", prefs.labels(), false));
        icons.addView(caption("Spalten im App-Menü"));
        icons.addView(chips("columns", String.valueOf(prefs.drawerColumns()), new String[] {"4", "5"}, new String[] {"4 Spalten", "5 Spalten"}, false));

        // Startbildschirm
        LinearLayout homeSec = section("Startbildschirm");
        homeSec.addView(valueRow("Name für die Begrüßung", prefs.name().isEmpty() ? "nicht gesetzt" : prefs.name(), new Runnable() {
            @Override
            public void run() {
                Sheet.create(SettingsActivity.this, sheetHost).title("Dein Name", "Erscheint in der Begrüßung auf dem Startbildschirm")
                    .input("Name", prefs.name(), new Sheet.TextResult() {
                        @Override
                        public void onText(String text) {
                            prefs.putString("name", text.trim());
                            build();
                        }
                    }).show();
            }
        }));
        homeSec.addView(toggle("Mini-Widgets", "Akku, Wetter und Speicher unter der Uhr", "miniWidgets", prefs.miniWidgets(), false));
        homeSec.addView(toggle("Nach unten wischen", "Öffnet die Benachrichtigungen", "swipeDown", prefs.swipeDown(), false));

        // Widgets
        LinearLayout widgets = section("Widgets");
        widgets.addView(valueRow("Ort für das Wetter", prefs.city().isEmpty() ? "nicht gesetzt" : prefs.city(), new Runnable() {
            @Override
            public void run() {
                askCity();
            }
        }));

        // Apps
        LinearLayout appsSec = section("Apps");
        int hidden = prefs.hidden().size();
        appsSec.addView(valueRow("Ausgeblendete Apps", hidden == 0 ? "keine" : String.valueOf(hidden), new Runnable() {
            @Override
            public void run() {
                showHidden();
            }
        }));
        appsSec.addView(valueRow("Startbildschirm zurücksetzen", "Dock, Favoriten, Widgets", new Runnable() {
            @Override
            public void run() {
                Sheet.create(SettingsActivity.this, sheetHost).title("Zurücksetzen?", null)
                    .text("Dock, Startbildschirm-Apps und Widgets werden auf den Anfangszustand gesetzt. Farben und Icons bleiben.")
                    .buttons("Zurücksetzen", new Runnable() {
                        @Override
                        public void run() {
                            prefs.resetLayout();
                            toast("Startbildschirm zurückgesetzt");
                        }
                    }, "Abbrechen", null).show();
            }
        }));

        // Über
        LinearLayout about = section("Über DarkOS");
        TextView credits = Ui.text(this, "Futuristischer Launcher mit Neon-Design, Widgets und eigenen App-Icons.\n\n"
            + "Symbole: Lucide (ISC-Lizenz)\nSchrift: Orbitron (SIL Open Font License)\n"
            + "Wetterdaten: Open-Meteo.com (CC BY 4.0)\n\nAlle Einstellungen bleiben auf dem Gerät.", 13.5f, Ui.TEXT2);
        credits.setLineSpacing(Ui.dp(3), 1f);
        about.addView(credits, Ui.margins(Ui.lp(-1, -2), 4, 0, 4, 4));

        applyInsets();
        final int y = scrollY;
        scroll.post(new Runnable() {
            @Override
            public void run() {
                scroll.scrollTo(0, y);
            }
        });
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private void launcherCard() {
        LinearLayout card = Ui.column(this);
        card.setBackground(Ui.glass(accent, 24));
        card.setPadding(Ui.dp(18), Ui.dp(16), Ui.dp(18), Ui.dp(18));
        boolean isDefault = LauncherActivity.isDefaultLauncher(this);
        LinearLayout row = Ui.row(this);
        row.addView(Ui.glyphView(this, isDefault ? "check" : "house", isDefault ? Ui.NEON[Ui.GREEN] : accent, 24),
            Ui.margins(Ui.lp(Ui.dp(24), Ui.dp(24)), 0, 0, 14, 0));
        LinearLayout texts = Ui.column(this);
        TextView t = Ui.text(this, isDefault ? "DarkOS ist dein Startbildschirm" : "DarkOS ist noch nicht dein Startbildschirm", 15.5f, Ui.TEXT);
        t.setTypeface(Ui.sans("sans-serif-medium"));
        texts.addView(t);
        texts.addView(Ui.text(this, isDefault ? "Die Home-Taste öffnet DarkOS." : "Lege DarkOS fest, damit die Home-Taste ihn öffnet.", 13, Ui.TEXT2),
            Ui.margins(Ui.lp(-2, -2), 0, 4, 0, 0));
        row.addView(texts, Ui.lp(0, -2, 1));
        card.addView(row);
        TextView b = Ui.button(this, isDefault ? "Startbildschirm ändern" : "Als Startbildschirm festlegen", accent, !isDefault);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                requestDefault();
            }
        });
        card.addView(b, Ui.margins(Ui.lp(-1, -2), 0, 14, 0, 0));
        list.addView(card, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 10));
    }

    private void requestDefault() {
        if (Build.VERSION.SDK_INT >= 29 && !LauncherActivity.isDefaultLauncher(this)) {
            RoleManager rm = getSystemService(RoleManager.class);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                try {
                    roleRequestTime = SystemClock.elapsedRealtime();
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_ROLE);
                    return;
                } catch (RuntimeException ignored) {
                    // weiter mit den Einstellungen
                }
            }
        }
        if (!start(new Intent(Settings.ACTION_HOME_SETTINGS))) start(new Intent(Settings.ACTION_SETTINGS));
    }

    private boolean start(Intent i) {
        try {
            startActivity(i);
            return true;
        } catch (RuntimeException e) {
            toast("Dafür ist keine passende App installiert");
            return false;
        }
    }

    // ------------------------------------------------------------ Bausteine

    private LinearLayout section(String name) {
        list.addView(Ui.label(this, name), Ui.margins(Ui.lp(-2, -2), 6, 22, 0, 10));
        LinearLayout card = Ui.column(this);
        card.setBackground(Ui.glass(accent, 24));
        card.setPadding(Ui.dp(16), Ui.dp(10), Ui.dp(12), Ui.dp(12));
        list.addView(card, Ui.lp(-1, -2));
        return card;
    }

    private TextView caption(String s) {
        TextView t = Ui.text(this, s, 14, Ui.TEXT2);
        t.setPadding(Ui.dp(2), Ui.dp(12), 0, Ui.dp(8));
        return t;
    }

    /** Auswahl als Neon-Pillen. */
    private View chips(final String key, String current, final String[] values, String[] labels, final boolean icons) {
        LinearLayout row = Ui.row(this);
        for (int i = 0; i < values.length; i++) {
            final String value = values[i];
            boolean on = value.equals(current);
            TextView c = Ui.text(this, labels[i], 13.5f, on ? 0xFF0A0710 : Ui.TEXT);
            c.setTypeface(Ui.sans("sans-serif-medium"));
            c.setGravity(Gravity.CENTER);
            c.setPadding(Ui.dp(6), Ui.dp(10), Ui.dp(6), Ui.dp(10));
            Ui.singleLine(c);
            c.setBackground(on ? Ui.rounded(accent, 14, Ui.mix(accent, 0xFFFFFFFF, 0.3f), 1)
                : Ui.ripple(accent, Ui.rounded(0x0FFFFFFF, 14, 0x26FFFFFF, 1), 14));
            if (on && Build.VERSION.SDK_INT >= 28) {
                c.setElevation(Ui.dp(6));
                c.setOutlineAmbientShadowColor(accent);
                c.setOutlineSpotShadowColor(accent);
            }
            c.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (key.equals("columns")) prefs.putInt(key, Integer.parseInt(value));
                    else prefs.putString(key, value);
                    build();
                }
            });
            row.addView(c, Ui.margins(Ui.lp(0, -2, 1), i == 0 ? 0 : 4, 0, i == values.length - 1 ? 0 : 4, 0));
        }
        row.setPadding(0, 0, 0, Ui.dp(6));
        return row;
    }

    private View toggle(String title, String sub, final String key, boolean value, final boolean rebuild) {
        LinearLayout row = Ui.row(this);
        row.setPadding(Ui.dp(2), Ui.dp(10), 0, Ui.dp(10));
        LinearLayout texts = Ui.column(this);
        texts.addView(Ui.text(this, title, 15.5f, Ui.TEXT));
        if (sub != null) texts.addView(Ui.text(this, sub, 12.5f, Ui.TEXT3), Ui.margins(Ui.lp(-2, -2), 0, 4, 0, 0));
        row.addView(texts, Ui.lp(0, -2, 1));
        final NeonSwitch sw = new NeonSwitch(this, accent, value);
        sw.setListener(new NeonSwitch.Listener() {
            @Override
            public void onChanged(boolean on) {
                prefs.putBool(key, on);
                if (rebuild) build();
            }
        });
        row.addView(sw);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sw.performClick();
            }
        });
        return row;
    }

    private View valueRow(String title, String value, final Runnable onClick) {
        LinearLayout row = Ui.row(this);
        row.setPadding(Ui.dp(2), Ui.dp(14), 0, Ui.dp(14));
        row.setBackground(Ui.ripple(accent, null, 12));
        TextView t = Ui.text(this, title, 15.5f, Ui.TEXT);
        row.addView(t, Ui.lp(0, -2, 1));
        TextView v = Ui.text(this, value, 13.5f, Ui.TEXT2);
        Ui.singleLine(v);
        v.setMaxWidth(Ui.dp(150));
        row.addView(v, Ui.margins(Ui.lp(-2, -2), 8, 0, 4, 0));
        row.addView(Ui.glyphView(this, "right", Ui.TEXT3, 18));
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                onClick.run();
            }
        });
        return row;
    }

    private void paintPreview() {
        if (previewRow == null) return;
        previewRow.removeAllViews();
        if (apps == null) return;
        List<Apps.App> sample = new ArrayList<>();
        for (String k : prefs.dock()) {
            Apps.App a = apps.find(k);
            if (a != null && sample.size() < 5) sample.add(a);
        }
        for (String k : prefs.favorites()) {
            Apps.App a = apps.find(k);
            if (a != null && sample.size() < 5 && !sample.contains(a)) sample.add(a);
        }
        for (Apps.App a : apps.all) if (sample.size() < 5 && !sample.contains(a)) sample.add(a);
        IconFactory.Spec spec = IconFactory.Spec.from(prefs);
        for (Apps.App a : sample) {
            ImageView iv = new ImageView(this);
            iv.setImageBitmap(IconFactory.render(this, a, apps, spec, Ui.dp(58)));
            iv.setContentDescription(a.label);
            previewRow.addView(iv, Ui.lp(0, Ui.dp(58), 1));
        }
    }

    private void askCity() {
        Sheet.create(this, sheetHost).title("Ort für das Wetter", "Stadt oder Ort eingeben, z. B. „Berlin“")
            .input("Ort", prefs.city(), new Sheet.TextResult() {
                @Override
                public void onText(final String text) {
                    if (text.trim().isEmpty()) return;
                    toast("Suche „" + text.trim() + "“ …");
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            Weather.Place p = null;
                            boolean failed = false;
                            try {
                                p = Weather.geocode(text);
                            } catch (Exception e) {
                                failed = true;
                            }
                            final Weather.Place place = p;
                            final boolean error = failed;
                            main.post(new Runnable() {
                                @Override
                                public void run() {
                                    if (isDestroyed()) return;
                                    if (place == null) {
                                        toast(error ? "Keine Verbindung – bitte später erneut versuchen" : "Ort nicht gefunden");
                                        return;
                                    }
                                    prefs.setPlace(place.name, place.lat, place.lon);
                                    prefs.bump();
                                    toast("Wetter-Ort: " + place.name);
                                    build();
                                }
                            });
                        }
                    }).start();
                }
            }).show();
    }

    private void showHidden() {
        final Set<String> hidden = prefs.hidden();
        Sheet s = Sheet.create(this, sheetHost).title("Ausgeblendete Apps",
            hidden.isEmpty() ? "Keine App ist ausgeblendet" : "Antippen zum Einblenden");
        for (final String key : hidden) {
            Apps.App a = apps != null ? apps.find(key) : null;
            String label = a != null ? a.label : key;
            s.action("eye", label, new Runnable() {
                @Override
                public void run() {
                    Set<String> h = prefs.hidden();
                    h.remove(key);
                    prefs.setHidden(h);
                    prefs.bump();
                    build();
                }
            });
        }
        s.show();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}

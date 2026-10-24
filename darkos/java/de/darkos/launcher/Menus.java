package de.darkos.launcher;

import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.pm.LauncherApps;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Alle Neon-Menüs: App lange drücken, Icon-Editor, Widgets, Startbildschirm. */
final class Menus {
    private final LauncherActivity act;
    private final FrameLayout host;

    Menus(LauncherActivity a, FrameLayout host) {
        act = a;
        this.host = host;
    }

    private Sheet sheet() {
        return Sheet.create(act, host);
    }

    // ------------------------------------------------------------ App-Menü

    void appMenu(final Apps.App app, final View from, String where) {
        final Prefs p = act.prefs;
        final List<String> favs = p.favorites();
        final List<String> dock = p.dock();
        Bitmap icon = act.icons().cached(app);
        String sub = app.internal ? "Launcher-Einstellungen" : app.pkg;
        Sheet s = sheet().header(icon, app.label, sub);

        if (app.internal) {
            s.action("sliders", "Einstellungen öffnen", new Runnable() {
                @Override
                public void run() {
                    act.openSettings();
                }
            });
        }

        addShortcuts(s, app, from);

        final boolean inHome = favs.contains(app.key);
        final boolean inDock = dock.contains(app.key);
        if ("home".equals(where) && inHome) {
            final int idx = favs.indexOf(app.key);
            if (idx > 0) s.action("left", "Nach vorne schieben", new Runnable() {
                @Override
                public void run() {
                    move(favs, idx, -1);
                    p.setFavorites(favs);
                    act.refreshHome();
                }
            });
            if (idx < favs.size() - 1) s.action("right", "Nach hinten schieben", new Runnable() {
                @Override
                public void run() {
                    move(favs, idx, 1);
                    p.setFavorites(favs);
                    act.refreshHome();
                }
            });
        }
        if ("dock".equals(where) && inDock) {
            final int idx = dock.indexOf(app.key);
            if (idx > 0) s.action("left", "Im Dock nach links", new Runnable() {
                @Override
                public void run() {
                    move(dock, idx, -1);
                    p.setDock(dock);
                    act.refreshHome();
                }
            });
            if (idx < dock.size() - 1) s.action("right", "Im Dock nach rechts", new Runnable() {
                @Override
                public void run() {
                    move(dock, idx, 1);
                    p.setDock(dock);
                    act.refreshHome();
                }
            });
        }
        if (inHome) {
            s.action("x", "Vom Startbildschirm entfernen", new Runnable() {
                @Override
                public void run() {
                    favs.remove(app.key);
                    p.setFavorites(favs);
                    act.refreshHome();
                }
            });
        } else {
            s.action("home_star", "Zum Startbildschirm", new Runnable() {
                @Override
                public void run() {
                    if (favs.size() >= Prefs.MAX_FAVORITES) {
                        act.toast("Startbildschirm ist voll (" + Prefs.MAX_FAVORITES + " Apps)");
                        return;
                    }
                    favs.add(app.key);
                    p.setFavorites(favs);
                    act.refreshHome();
                    act.toast(app.label + " liegt jetzt auf dem Startbildschirm");
                }
            });
        }
        if (inDock) {
            s.action("dock", "Aus dem Dock entfernen", new Runnable() {
                @Override
                public void run() {
                    dock.remove(app.key);
                    p.setDock(dock);
                    act.refreshHome();
                }
            });
        } else {
            s.action("dock", "Zum Dock", dock.size() >= Prefs.MAX_DOCK ? "voll" : null, act.prefs.accent(), new Runnable() {
                @Override
                public void run() {
                    if (dock.size() >= Prefs.MAX_DOCK) {
                        act.toast("Im Dock ist Platz für " + Prefs.MAX_DOCK + " Apps – entferne zuerst eine.");
                        return;
                    }
                    dock.add(app.key);
                    p.setDock(dock);
                    act.refreshHome();
                }
            });
        }
        s.action("palette", "Icon anpassen", new Runnable() {
            @Override
            public void run() {
                iconEditor(app);
            }
        });
        s.action("rename", "Umbenennen", new Runnable() {
            @Override
            public void run() {
                rename(app);
            }
        });
        if (!app.internal) {
            s.action("eye_off", "Im App-Menü ausblenden", new Runnable() {
                @Override
                public void run() {
                    Set<String> hidden = p.hidden();
                    hidden.add(app.key);
                    p.setHidden(hidden);
                    act.reloadLists();
                    act.toast(app.label + " ausgeblendet – wieder einblenden in den Einstellungen");
                }
            });
            s.action("info", "App-Info", new Runnable() {
                @Override
                public void run() {
                    act.startSafely(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + app.pkg)));
                }
            });
            if (!app.system) {
                s.action("trash", "Deinstallieren", null, Ui.NEON[Ui.RED], new Runnable() {
                    @Override
                    public void run() {
                        act.startSafely(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + app.pkg)));
                    }
                });
            }
        }
        s.show();
    }

    private static void move(List<String> list, int idx, int delta) {
        int to = Math.max(0, Math.min(list.size() - 1, idx + delta));
        String item = list.remove(idx);
        list.add(to, item);
    }

    /** App-Verknüpfungen ("Neuer Chat" …) – nur möglich, wenn DarkOS der Standard-Launcher ist. */
    private void addShortcuts(Sheet s, Apps.App app, final View from) {
        if (Build.VERSION.SDK_INT < 25 || app.internal) return;
        final LauncherApps la = (LauncherApps) act.getSystemService(Context.LAUNCHER_APPS_SERVICE);
        if (la == null) return;
        List<ShortcutInfo> list;
        try {
            if (!la.hasShortcutHostPermission()) return;
            LauncherApps.ShortcutQuery q = new LauncherApps.ShortcutQuery();
            q.setPackage(app.pkg);
            q.setActivity(app.component);
            q.setQueryFlags(LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC | LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST);
            list = la.getShortcuts(q, Process.myUserHandle());
        } catch (RuntimeException e) {
            return;
        }
        if (list == null || list.isEmpty()) return;
        List<ShortcutInfo> sorted = new ArrayList<>(list);
        java.util.Collections.sort(sorted, new java.util.Comparator<ShortcutInfo>() {
            @Override
            public int compare(ShortcutInfo a, ShortcutInfo b) {
                if (a.isDeclaredInManifest() != b.isDeclaredInManifest()) return a.isDeclaredInManifest() ? -1 : 1;
                return a.getRank() - b.getRank();
            }
        });
        int n = 0;
        for (final ShortcutInfo si : sorted) {
            if (n++ >= 4) break;
            CharSequence label = si.getShortLabel() != null ? si.getShortLabel() : si.getLongLabel();
            if (label == null) continue;
            s.action("external", label.toString(), new Runnable() {
                @Override
                public void run() {
                    try {
                        Rect r = new Rect();
                        if (from != null) from.getGlobalVisibleRect(r);
                        la.startShortcut(si, r, null);
                    } catch (RuntimeException e) {
                        act.toast("Verknüpfung lässt sich nicht öffnen");
                    }
                }
            });
        }
    }

    private void rename(final Apps.App app) {
        sheet().title("Umbenennen", "Leer lassen für den Originalnamen „" + app.originalLabel + "“")
            .input(app.originalLabel, app.label.equals(app.originalLabel) ? "" : app.label, new Sheet.TextResult() {
                @Override
                public void onText(String text) {
                    act.prefs.setLabelOverride(app.key, text);
                    app.setLabel(text.trim().isEmpty() ? app.originalLabel : text.trim());
                    act.reloadLists();
                }
            }).show();
    }

    // ------------------------------------------------------------ Icon-Editor

    void iconEditor(final Apps.App app) {
        final Prefs p = act.prefs;
        final Sheet s = sheet();
        final ImageView preview = new ImageView(act);
        LinearLayout head = Ui.row(act);
        head.addView(preview, Ui.margins(Ui.lp(Ui.dp(76), Ui.dp(76)), 0, 0, 14, 0));
        LinearLayout texts = Ui.column(act);
        TextView t = Ui.text(act, "Icon anpassen", 20, Ui.TEXT);
        t.setTypeface(Ui.sans("sans-serif-medium"));
        texts.addView(t);
        TextView st = Ui.text(act, app.label, 13, Ui.TEXT2);
        Ui.singleLine(st);
        texts.addView(st, Ui.margins(Ui.lp(-2, -2), 0, 5, 0, 0));
        head.addView(texts, Ui.lp(0, -2, 1));
        s.view(head, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 12));

        final Runnable repaint = new Runnable() {
            @Override
            public void run() {
                act.icons().invalidate(app.key);
                preview.setImageBitmap(IconFactory.render(act, app, act.apps, IconFactory.Spec.from(p), Ui.dp(76)));
            }
        };
        repaint.run();

        LinearLayout modes = Ui.row(act);
        TextView auto = Ui.button(act, "Automatisch", p.accent(), false);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                p.setIconOverride(app.key, "auto");
                p.setColorOverride(app.key, -1);
                repaint.run();
                act.refreshIcons(app.key);
            }
        });
        modes.addView(auto, Ui.margins(Ui.lp(0, -2, 1), 0, 0, 10, 0));
        TextView orig = Ui.button(act, "Original-Icon", p.accent(), false);
        orig.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                p.setIconOverride(app.key, "original");
                repaint.run();
                act.refreshIcons(app.key);
            }
        });
        modes.addView(orig, Ui.lp(0, -2, 1));
        s.view(modes);

        s.section("Farbe");
        s.view(colorRow(act, p.colorOverride(app.key), true, new ColorPick() {
            @Override
            public void onPick(int index) {
                p.setColorOverride(app.key, index);
                if ("original".equals(p.iconOverride(app.key))) p.setIconOverride(app.key, "auto");
                repaint.run();
                act.refreshIcons(app.key);
            }
        }));

        s.section("Symbol");
        LinearLayout grid = Ui.column(act);
        LinearLayout row = null;
        final List<ImageView> cells = new ArrayList<>();
        String[] names = Glyphs.APP_NAMES;
        for (int i = 0; i < names.length; i++) {
            if (i % 6 == 0) {
                row = Ui.row(act);
                grid.addView(row, Ui.lp(-1, -2));
            }
            final String name = names[i];
            final ImageView g = new ImageView(act);
            g.setPadding(Ui.dp(13), Ui.dp(13), Ui.dp(13), Ui.dp(13));
            g.setContentDescription(name);
            g.setTag(name);
            g.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    p.setIconOverride(app.key, "g:" + name);
                    paintGlyphCells(cells, name);
                    repaint.run();
                    act.refreshIcons(app.key);
                }
            });
            cells.add(g);
            row.addView(g, Ui.lp(0, Ui.dp(52), 1));
        }
        for (int i = names.length % 6; i > 0 && i < 6; i++) row.addView(new View(act), Ui.lp(0, 1, 1));
        String cur = p.iconOverride(app.key);
        paintGlyphCells(cells, cur.startsWith("g:") ? cur.substring(2) : null);
        s.view(grid);
        s.show();
    }

    private void paintGlyphCells(List<ImageView> cells, String selected) {
        int accent = act.prefs.accent();
        for (ImageView g : cells) {
            boolean on = g.getTag().equals(selected);
            g.setImageDrawable(Ui.glyph(act, (String) g.getTag(), on ? accent : Ui.TEXT2));
            g.setBackground(on ? Ui.rounded(Ui.alpha(accent, 0.14f), 14, accent, 1.2f) : Ui.ripple(accent, null, 14));
        }
    }

    interface ColorPick {
        void onPick(int index);
    }

    /** Reihe mit Neon-Farbpunkten; mit withAuto zusätzlich "Auto" (-1). */
    static View colorRow(Context act, final int selected, final boolean withAuto, final ColorPick pick) {
        final LinearLayout row = Ui.row(act);
        final List<View> dots = new ArrayList<>();
        int count = Ui.NEON.length + (withAuto ? 1 : 0);
        for (int i = 0; i < count; i++) {
            final int index = withAuto ? i - 1 : i;
            FrameLayout f = new FrameLayout(act);
            View dot = new View(act);
            int color = index < 0 ? 0xFF2A2838 : Ui.NEON[index];
            dot.setBackground(Ui.rounded(color, 20, index < 0 ? Ui.TEXT3 : 0, index < 0 ? 1 : 0));
            f.addView(dot, new FrameLayout.LayoutParams(Ui.dp(26), Ui.dp(26), Gravity.CENTER));
            if (index < 0) {
                TextView a = Ui.text(act, "A", 11, Ui.TEXT2);
                a.setGravity(Gravity.CENTER);
                f.addView(a, new FrameLayout.LayoutParams(Ui.dp(26), Ui.dp(26), Gravity.CENTER));
            }
            f.setTag(index);
            f.setContentDescription(index < 0 ? "Automatisch" : Ui.NEON_NAMES[index]);
            f.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    markColor(dots, index);
                    pick.onPick(index);
                }
            });
            dots.add(f);
            row.addView(f, Ui.lp(0, Ui.dp(40), 1));
        }
        markColor(dots, selected);
        return row;
    }

    private static void markColor(List<View> dots, int selected) {
        for (View d : dots) {
            int index = (Integer) d.getTag();
            int color = index < 0 ? Ui.TEXT2 : Ui.NEON[index];
            d.setBackground(index == selected ? Ui.rounded(0, 20, color, 2) : null);
            if (android.os.Build.VERSION.SDK_INT >= 28) {
                d.setElevation(index == selected ? Ui.dp(6) : 0);
                d.setOutlineSpotShadowColor(color);
                d.setOutlineAmbientShadowColor(color);
            }
        }
    }

    // ------------------------------------------------------------ Startbildschirm

    void homeMenu() {
        sheet().title("Startbildschirm", null)
            .action("palette", "Design & Farben", new Runnable() {
                @Override
                public void run() {
                    act.openSettings();
                }
            })
            .action("widget", "Widget hinzufügen", new Runnable() {
                @Override
                public void run() {
                    showAddWidget();
                }
            })
            .action("layers", "Widget-Seite zeigen", new Runnable() {
                @Override
                public void run() {
                    act.showWidgetsPage(null);
                }
            })
            .action("grid", "Alle Apps", new Runnable() {
                @Override
                public void run() {
                    act.openDrawer();
                }
            })
            .action("settings", "Android-Einstellungen", new Runnable() {
                @Override
                public void run() {
                    act.startSafely(new Intent(Settings.ACTION_SETTINGS));
                }
            })
            .show();
    }

    // ------------------------------------------------------------ Widgets

    void showAddWidget() {
        List<String> current = act.prefs.widgets();
        Sheet s = sheet().title("Widget hinzufügen", "Erscheint auf der Widget-Seite (links vom Startbildschirm)");
        s.section("DarkOS-Widgets");
        boolean any = false;
        for (final String id : Widgets.BUILT_IN) {
            if (current.contains(id)) continue;
            any = true;
            s.action(Widgets.glyph(id), Widgets.title(id), null, act.prefs.accent(), new Runnable() {
                @Override
                public void run() {
                    act.addWidget(id);
                }
            });
        }
        if (!any) s.text("Alle DarkOS-Widgets sind schon da.");
        s.section("Android-Widgets");
        s.action("app", "Widgets deiner Apps …", new Runnable() {
            @Override
            public void run() {
                androidWidgetPicker();
            }
        });
        s.show();
    }

    private void androidWidgetPicker() {
        List<AppWidgetProviderInfo> providers = act.widgetHost.providers();
        Sheet s = sheet().title("Android-Widgets", providers.isEmpty() ? "Keine Widgets gefunden" : providers.size() + " Widgets verfügbar");
        PackageManager pm = act.getPackageManager();
        String lastApp = null;
        int iconPx = Ui.dp(36);
        for (final AppWidgetProviderInfo info : providers) {
            String appName = WidgetHost.appLabel(pm, info);
            if (!appName.equals(lastApp)) {
                s.section(appName);
                lastApp = appName;
            }
            LinearLayout row = Ui.row(act);
            row.setPadding(Ui.dp(8), Ui.dp(8), Ui.dp(8), Ui.dp(8));
            row.setBackground(Ui.ripple(act.prefs.accent(), null, 14));
            ImageView iv = new ImageView(act);
            try {
                Drawable d = info.loadIcon(act, act.getResources().getDisplayMetrics().densityDpi);
                iv.setImageDrawable(d);
            } catch (RuntimeException ignored) {
                iv.setImageDrawable(Ui.glyph(act, "widget", Ui.TEXT2));
            }
            row.addView(iv, Ui.margins(Ui.lp(iconPx, iconPx), 0, 0, 14, 0));
            LinearLayout texts = Ui.column(act);
            TextView l = Ui.text(act, info.loadLabel(pm), 15.5f, Ui.TEXT);
            Ui.singleLine(l);
            texts.addView(l);
            int cw = Math.max(1, (int) Math.ceil((info.minWidth / Ui.density + 30) / 74f));
            int ch = Math.max(1, (int) Math.ceil((info.minHeight / Ui.density + 30) / 74f));
            if (Build.VERSION.SDK_INT >= 31 && info.targetCellWidth > 0) {
                cw = info.targetCellWidth;
                ch = info.targetCellHeight;
            }
            texts.addView(Ui.text(act, cw + " × " + ch, 12, Ui.TEXT3), Ui.margins(Ui.lp(-2, -2), 0, 4, 0, 0));
            row.addView(texts, Ui.lp(0, -2, 1));
            final Sheet sheet = s;
            row.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    sheet.dismiss();
                    act.widgetHost.add(info);
                }
            });
            s.view(row);
        }
        s.show();
    }

    void widgetMenu(final String id) {
        final Prefs p = act.prefs;
        final List<String> list = p.widgets();
        final int idx = list.indexOf(id);
        if (idx < 0) return;
        String name = Widgets.title(id);
        final boolean android = id.startsWith("a:");
        int appWidgetId = -1;
        if (android) {
            appWidgetId = Integer.parseInt(id.substring(2));
            AppWidgetProviderInfo info = act.widgetHost.info(appWidgetId);
            name = info != null ? info.loadLabel(act.getPackageManager()) : "Widget";
        }
        final int awId = appWidgetId;
        Sheet s = sheet().title(name, android ? "Android-Widget" : "DarkOS-Widget");
        if (idx > 0) s.action("arrow_up", "Nach oben", new Runnable() {
            @Override
            public void run() {
                move(list, idx, -1);
                p.setWidgets(list);
                act.rebuildWidgets();
            }
        });
        if (idx < list.size() - 1) s.action("arrow_down", "Nach unten", new Runnable() {
            @Override
            public void run() {
                move(list, idx, 1);
                p.setWidgets(list);
                act.rebuildWidgets();
            }
        });
        if (android) {
            s.action("plus", "Höher", new Runnable() {
                @Override
                public void run() {
                    resize(awId, 40);
                }
            });
            s.action("down", "Niedriger", new Runnable() {
                @Override
                public void run() {
                    resize(awId, -40);
                }
            });
        }
        if (Widgets.WEATHER.equals(id)) s.action("pin", "Ort ändern", new Runnable() {
            @Override
            public void run() {
                askCity();
            }
        });
        s.action("trash", "Entfernen", null, Ui.NEON[Ui.RED], new Runnable() {
            @Override
            public void run() {
                list.remove(id);
                p.setWidgets(list);
                if (android) act.widgetHost.delete(awId);
                act.rebuildWidgets();
            }
        });
        s.show();
    }

    private void resize(int appWidgetId, int deltaDp) {
        AppWidgetProviderInfo info = act.widgetHost.info(appWidgetId);
        int h = act.prefs.widgetHeight(appWidgetId);
        if (h <= 0) h = info != null ? WidgetHost.defaultHeightDp(info, Ui.density) : 160;
        act.prefs.setWidgetHeight(appWidgetId, Math.max(60, Math.min(600, h + deltaDp)));
        act.rebuildWidgets();
    }

    void askCity() {
        sheet().title("Ort für das Wetter", "Stadt oder Ort eingeben, z. B. „Berlin“ oder „Hamburg“")
            .input("Ort", act.prefs.city(), new Sheet.TextResult() {
                @Override
                public void onText(String text) {
                    if (!text.trim().isEmpty()) act.setCity(text.trim());
                }
            }).show();
    }

    // ------------------------------------------------------------ Willkommen

    void welcome() {
        Sheet s = sheet();
        TextView logo = Ui.title(act, "DarkOS", 34);
        logo.setGravity(Gravity.CENTER);
        Ui.glow(logo, act.prefs.accent(), 16);
        s.view(logo, Ui.margins(Ui.lp(-1, -2), 0, 6, 0, 10));
        s.text("Willkommen! Wische nach oben für alle Apps, nach rechts für Widgets und drücke Apps lange, "
            + "um sie auf den Startbildschirm oder ins Dock zu legen.\n\nDamit die Home-Taste DarkOS öffnet, lege DarkOS als Startbildschirm fest.");
        s.buttons("Als Startbildschirm festlegen", new Runnable() {
            @Override
            public void run() {
                act.requestDefaultLauncher();
            }
        }, "Später", null);
        s.show();
    }
}

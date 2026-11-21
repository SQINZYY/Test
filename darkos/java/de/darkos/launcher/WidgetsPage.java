package de.darkos.launcher;

import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetProviderInfo;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Linke Seite: eingebaute DarkOS-Widgets und Android-Widgets untereinander. */
final class WidgetsPage {
    final FrameLayout root;
    private final LauncherActivity act;
    private final ScrollView scroll;
    private final LinearLayout list;
    private final List<Widgets.Widget> widgets = new ArrayList<>();
    private boolean started;

    WidgetsPage(LauncherActivity a) {
        act = a;
        root = new FrameLayout(a);
        scroll = new ScrollView(a);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setClipToPadding(false);
        scroll.setFillViewport(true);
        list = Ui.column(a);
        list.setPadding(Ui.dp(16), Ui.dp(12), Ui.dp(16), Ui.dp(40));
        scroll.addView(list, new FrameLayout.LayoutParams(-1, -2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    void setInsets(int top, int bottom) {
        root.setPadding(0, top, 0, bottom);
    }

    void rebuild() {
        boolean wasStarted = started;
        stop();
        widgets.clear();
        list.removeAllViews();
        int accent = act.prefs.accent();

        LinearLayout head = Ui.row(act);
        LinearLayout texts = Ui.column(act);
        TextView title = Ui.title(act, "Widgets", 26);
        Ui.glow(title, Ui.alpha(accent, 0.7f), 12);
        texts.addView(title);
        texts.addView(Ui.text(act, "Antippen öffnet · ⋮ oder lange drücken bearbeitet", 12.5f, Ui.TEXT3),
            Ui.margins(Ui.lp(-2, -2), 0, 6, 0, 0));
        head.addView(texts, Ui.lp(0, -2, 1));
        TextView add = Ui.button(act, "+", accent, false);
        add.setTextSize(22);
        add.setPadding(0, 0, 0, Ui.dp(2));
        add.setContentDescription("Widget hinzufügen");
        add.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                act.showAddWidget();
            }
        });
        head.addView(add, Ui.lp(Ui.dp(48), Ui.dp(48)));
        list.addView(head, Ui.margins(Ui.lp(-1, -2), 8, 8, 0, 18));

        for (String id : act.prefs.widgets()) {
            View v = null;
            if (id.startsWith("a:")) {
                v = androidWidget(id);
            } else {
                Widgets.Widget w = Widgets.create(act, id);
                if (w != null) {
                    widgets.add(w);
                    w.update(act.status);
                    v = w.card;
                }
            }
            if (v != null) list.addView(v, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 14));
        }

        if (act.prefs.widgets().isEmpty()) {
            TextView empty = Ui.text(act, "Noch keine Widgets. Füge Wetter, Akku, Kalender oder Widgets deiner Apps hinzu.", 14.5f, Ui.TEXT2);
            empty.setGravity(Gravity.CENTER);
            list.addView(empty, Ui.margins(Ui.lp(-1, -2), 12, 30, 12, 20));
        }
        TextView addBottom = Ui.button(act, "Widget hinzufügen", accent, false);
        addBottom.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                act.showAddWidget();
            }
        });
        list.addView(addBottom, Ui.margins(Ui.lp(-1, -2), 0, 6, 0, 0));
        if (wasStarted) start();
    }

    private View androidWidget(final String id) {
        final int appWidgetId;
        try {
            appWidgetId = Integer.parseInt(id.substring(2));
        } catch (NumberFormatException e) {
            return null;
        }
        AppWidgetProviderInfo info = act.widgetHost.info(appWidgetId);
        AppWidgetHostView hv = info != null ? act.widgetHost.createView(act, appWidgetId) : null;
        if (hv == null) return null;
        int hDp = act.prefs.widgetHeight(appWidgetId);
        if (hDp <= 0) hDp = WidgetHost.defaultHeightDp(info, Ui.density);
        Widgets.LongPressFrame frame = new Widgets.LongPressFrame(act, new Runnable() {
            @Override
            public void run() {
                act.showWidgetMenu(id);
            }
        });
        frame.setBackground(Ui.glass(act.prefs.accent(), 26));
        frame.setPadding(Ui.dp(6), Ui.dp(6), Ui.dp(6), Ui.dp(6));
        frame.setClipToOutline(true);
        frame.addView(hv, new FrameLayout.LayoutParams(-1, Ui.dp(hDp)));
        int wDp = Math.round(act.getResources().getDisplayMetrics().widthPixels / Ui.density) - 44;
        WidgetHost.setSize(hv, wDp, hDp);
        return frame;
    }

    void update(Status s) {
        for (Widgets.Widget w : widgets) w.update(s);
    }

    void onMinute() {
        for (Widgets.Widget w : widgets) w.onMinute();
    }

    void start() {
        started = true;
        for (Widgets.Widget w : widgets) w.start();
    }

    void stop() {
        if (!started) return;
        started = false;
        for (Widgets.Widget w : widgets) w.stop();
    }

    void scrollTo(final String id) {
        for (final Widgets.Widget w : widgets) {
            if (w.id.equals(id)) {
                scroll.post(new Runnable() {
                    @Override
                    public void run() {
                        scroll.smoothScrollTo(0, Math.max(0, w.card.getTop() - Ui.dp(12)));
                    }
                });
                return;
            }
        }
        scroll.post(new Runnable() {
            @Override
            public void run() {
                scroll.smoothScrollTo(0, 0);
            }
        });
    }
}

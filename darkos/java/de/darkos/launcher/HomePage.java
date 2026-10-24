package de.darkos.launcher;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.AlarmManager;
import android.content.Context;
import android.graphics.LinearGradient;
import android.graphics.Shader;
import android.os.Build;
import android.text.format.DateFormat;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Startseite: Begrüßung, Uhr, Mini-Widgets, Favoriten und Dock. */
final class HomePage {
    interface Host {
        Icons icons();

        void launch(Apps.App app, View from);

        void showAppMenu(Apps.App app, View from);

        void openDrawer();

        void openDrawerSearch();

        void openSettings();

        void openClock();

        void openCalendarAt(long millis);

        void showWeatherPage();

        void openBatterySettings();
    }

    final FrameLayout root;
    private final Context c;
    private final Host host;
    private final Prefs prefs;
    private int accent;

    private final LinearLayout column;
    private final TextView greeting;
    private final TextView time, ampm, date, alarm;
    private final LinearLayout chips;
    private final RingView batteryRing;
    private final TextView batteryText, batterySub;
    private final ImageView weatherIcon;
    private final TextView weatherText, weatherSub;
    private final RingView storageRing;
    private final TextView storageText;
    private final Favorites favorites;
    private final LinearLayout hint;
    private final ImageView hintArrow;
    final PageDots dots;
    private final LinearLayout dock;
    private ObjectAnimator bob;
    private String lastWeatherGlyph;

    HomePage(Context c, Host host) {
        this.c = c;
        this.host = host;
        prefs = Prefs.get(c);
        accent = prefs.accent();
        root = new FrameLayout(c);
        column = Ui.column(c);
        root.addView(column, new FrameLayout.LayoutParams(-1, -1));

        // Kopfzeile
        LinearLayout top = Ui.row(c);
        top.setPadding(Ui.dp(24), Ui.dp(14), Ui.dp(10), 0);
        greeting = Ui.text(c, "", 15, Ui.TEXT2);
        greeting.setTypeface(Ui.sans("sans-serif-medium"));
        Ui.singleLine(greeting);
        top.addView(greeting, Ui.lp(0, -2, 1));
        ImageView gear = new ImageView(c);
        gear.setImageDrawable(Ui.glyph(c, "sliders", Ui.TEXT2));
        gear.setPadding(Ui.dp(12), Ui.dp(12), Ui.dp(12), Ui.dp(12));
        gear.setContentDescription("DarkOS Einstellungen");
        gear.setBackground(Ui.ripple(accent, null, 22));
        gear.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HomePage.this.host.openSettings();
            }
        });
        top.addView(gear, Ui.lp(Ui.dp(46), Ui.dp(46)));
        column.addView(top, Ui.lp(-1, -2));

        // Uhr
        LinearLayout clock = Ui.column(c);
        clock.setPadding(Ui.dp(24), Ui.dp(2), Ui.dp(24), 0);
        LinearLayout timeRow = Ui.row(c);
        timeRow.setGravity(Gravity.BOTTOM);
        time = Ui.title(c, "00:00", 68);
        time.setLetterSpacing(0.02f);
        time.setPadding(0, Ui.dp(6), Ui.dp(6), Ui.dp(4));
        timeRow.addView(time);
        ampm = Ui.title(c, "", 18);
        ampm.setPadding(0, 0, 0, Ui.dp(14));
        timeRow.addView(ampm);
        timeRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HomePage.this.host.openClock();
            }
        });
        clock.addView(timeRow);
        date = Ui.text(c, "", 17, Ui.TEXT);
        date.setTypeface(Ui.sans("sans-serif-light"));
        date.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HomePage.this.host.openCalendarAt(System.currentTimeMillis());
            }
        });
        clock.addView(date, Ui.margins(Ui.lp(-2, -2), 0, 2, 0, 0));
        alarm = Ui.text(c, "", 13, Ui.TEXT2);
        alarm.setCompoundDrawablePadding(Ui.dp(6));
        clock.addView(alarm, Ui.margins(Ui.lp(-2, -2), 0, 8, 0, 0));
        column.addView(clock, Ui.lp(-1, -2));

        // Mini-Widgets
        chips = Ui.row(c);
        chips.setPadding(Ui.dp(16), Ui.dp(18), Ui.dp(16), 0);
        batteryRing = new RingView(c, 3.5f, 9);
        batteryText = Ui.title(c, "–", 14);
        batterySub = Ui.text(c, "Akku", 11.5f, Ui.TEXT2);
        chips.addView(chip(batteryRing, batteryText, batterySub, new Runnable() {
            @Override
            public void run() {
                HomePage.this.host.openBatterySettings();
            }
        }), Ui.lp(0, Ui.dp(62), 1));

        weatherIcon = new ImageView(c);
        weatherText = Ui.title(c, "–", 14);
        weatherSub = Ui.text(c, "Wetter", 11.5f, Ui.TEXT2);
        chips.addView(chip(weatherIcon, weatherText, weatherSub, new Runnable() {
            @Override
            public void run() {
                HomePage.this.host.showWeatherPage();
            }
        }), Ui.margins(Ui.lp(0, Ui.dp(62), 1), 8, 0, 8, 0));

        storageRing = new RingView(c, 3.5f, 9);
        storageText = Ui.title(c, "–", 14);
        chips.addView(chip(storageRing, storageText, Ui.text(c, "Speicher", 11.5f, Ui.TEXT2), new Runnable() {
            @Override
            public void run() {
                ((LauncherActivity) HomePage.this.c).startSafely(new android.content.Intent(android.provider.Settings.ACTION_INTERNAL_STORAGE_SETTINGS));
            }
        }), Ui.lp(0, Ui.dp(62), 1));
        column.addView(chips, Ui.lp(-1, -2));

        // Favoriten füllen den Rest (von unten nach oben)
        favorites = new Favorites(c);
        column.addView(favorites, Ui.lp(-1, 0, 1));

        // Suchleiste: öffnet das App-Menü mit Tastatur
        hint = Ui.row(c);
        hint.setPadding(Ui.dp(16), 0, Ui.dp(12), 0);
        hint.setClickable(true);
        hint.addView(Ui.glyphView(c, "search", Ui.alpha(accent, 0.9f), 19));
        TextView ht = Ui.text(c, "Apps durchsuchen", 14.5f, Ui.TEXT3);
        Ui.singleLine(ht);
        hint.addView(ht, Ui.margins(Ui.lp(0, -2, 1), 12, 0, 8, 0));
        hintArrow = Ui.glyphView(c, "up", Ui.alpha(accent, 0.9f), 18);
        hint.addView(hintArrow);
        hint.setContentDescription("Apps durchsuchen");
        hint.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HomePage.this.host.openDrawerSearch();
            }
        });
        Ui.pressEffect(hint);
        column.addView(hint, Ui.margins(Ui.lp(-1, Ui.dp(46)), 18, 2, 18, 6));

        dots = new PageDots(c);
        dots.setAccent(accent);
        column.addView(dots, Ui.lp(-1, Ui.dp(16)));

        dock = Ui.row(c);
        dock.setPadding(Ui.dp(6), Ui.dp(8), Ui.dp(6), Ui.dp(8));
        column.addView(dock, Ui.margins(Ui.lp(-1, Ui.dp(84)), 14, 8, 14, 10));
        styleDock();
        styleSearch();
    }

    /** Mini-Widget: Symbol/Ring links, Wert und Beschriftung rechts. */
    private LinearLayout chip(View icon, TextView value, TextView sub, final Runnable onClick) {
        LinearLayout l = Ui.row(c);
        l.setPadding(Ui.dp(9), Ui.dp(8), Ui.dp(6), Ui.dp(8));
        l.setBackground(Ui.ripple(accent, Ui.glass(accent, 20), 20));
        l.setClickable(true);
        l.addView(icon, Ui.lp(Ui.dp(36), Ui.dp(36)));
        LinearLayout texts = Ui.column(c);
        Ui.singleLine(value);
        Ui.singleLine(sub);
        texts.addView(value);
        texts.addView(sub, Ui.margins(Ui.lp(-2, -2), 0, 4, 0, 0));
        l.addView(texts, Ui.margins(Ui.lp(0, -2, 1), 7, 0, 0, 0));
        l.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onClick.run();
            }
        });
        Ui.pressEffect(l);
        return l;
    }

    private void styleSearch() {
        hint.setBackground(Ui.ripple(accent, Ui.glass(accent, 23), 23));
    }

    private void styleDock() {
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] {Ui.mix(0xE6100E1A, accent, 0.10f), 0xE6060509});
        bg.setCornerRadius(Ui.dp(30));
        bg.setStroke(Math.max(1, Ui.dp(1.2f)), Ui.alpha(accent, 0.55f));
        dock.setBackground(bg);
        if (Build.VERSION.SDK_INT >= 28) {
            dock.setElevation(Ui.dp(14));
            dock.setOutlineAmbientShadowColor(accent);
            dock.setOutlineSpotShadowColor(accent);
        }
    }

    void setInsets(int top, int bottom) {
        column.setPadding(0, top, 0, bottom);
    }

    void restyle() {
        accent = prefs.accent();
        dots.setAccent(accent);
        hintArrow.setImageDrawable(Ui.glyph(c, "up", Ui.alpha(accent, 0.9f)));
        styleDock();
        styleSearch();
        for (int i = 0; i < chips.getChildCount(); i++) {
            chips.getChildAt(i).setBackground(Ui.ripple(accent, Ui.glass(accent, 20), 20));
        }
        chips.setVisibility(prefs.miniWidgets() ? View.VISIBLE : View.GONE);
        lastWeatherGlyph = null;
        paintTime();
    }

    // --- Inhalte ---

    void bind(List<Apps.App> favs, List<Apps.App> dockApps) {
        favorites.set(favs);
        dock.removeAllViews();
        if (dockApps.isEmpty()) {
            TextView t = Ui.text(c, "Apps im App-Menü lange drücken → „Zum Dock“", 12.5f, Ui.TEXT3);
            t.setGravity(Gravity.CENTER);
            dock.addView(t, Ui.lp(0, -1, 1));
        }
        for (Apps.App a : dockApps) {
            AppCell cell = cell(Ui.dp(58), false);
            cell.bind(a, host.icons());
            dock.addView(cell, Ui.lp(0, -1, 1));
        }
    }

    private AppCell cell(int iconPx, boolean label) {
        final AppCell cell = new AppCell(c, iconPx, label);
        cell.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (cell.app != null) host.launch(cell.app, cell.icon);
            }
        });
        cell.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                if (cell.app == null) return false;
                v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                host.showAppMenu(cell.app, cell.icon);
                return true;
            }
        });
        return cell;
    }

    boolean isDock(View v) {
        android.view.ViewParent p = v == null ? null : v.getParent();
        while (p != null) {
            if (p == dock) return true;
            p = p.getParent();
        }
        return false;
    }

    void tick() {
        paintTime();
    }

    private void paintTime() {
        Date now = new Date();
        boolean h24 = DateFormat.is24HourFormat(c);
        time.setText(DateFormat.format(h24 ? "HH:mm" : "h:mm", now));
        ampm.setText(h24 ? "" : DateFormat.format("a", now).toString().toUpperCase(Locale.ROOT));
        String pattern = DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEEdMMMM");
        date.setText(DateFormat.format(pattern, now));
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        String g = hour < 5 ? "Gute Nacht" : hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : hour < 22 ? "Guten Abend" : "Gute Nacht";
        String name = prefs.name().trim();
        greeting.setText(name.isEmpty() ? g : g + ", " + name);

        // Neon-Verlauf über die Ziffern
        time.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
        float w = Math.max(1, time.getMeasuredWidth());
        time.getPaint().setShader(new LinearGradient(0, 0, w, 0,
            new int[] {0xFFFFFFFF, Ui.mix(accent, 0xFFFFFFFF, 0.35f), Ui.partner(accent)}, new float[] {0f, 0.55f, 1f},
            Shader.TileMode.CLAMP));
        Ui.glow(time, Ui.alpha(accent, 0.85f), 18);
        ampm.setTextColor(Ui.partner(accent));
        time.invalidate();

        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        AlarmManager.AlarmClockInfo next = am != null ? am.getNextAlarmClock() : null;
        if (next != null && next.getTriggerTime() - System.currentTimeMillis() < 24L * 3600 * 1000) {
            alarm.setText("Wecker " + DateFormat.getTimeFormat(c).format(new Date(next.getTriggerTime())));
            android.graphics.drawable.Drawable d = Ui.glyph(c, "alarm", Ui.alpha(accent, 0.9f));
            d.setBounds(0, 0, Ui.dp(15), Ui.dp(15));
            alarm.setCompoundDrawables(d, null, null, null);
            alarm.setVisibility(View.VISIBLE);
        } else {
            alarm.setVisibility(View.GONE);
        }
    }

    void updateStatus(Status s) {
        int bc = s.batteryColor(accent);
        batteryRing.set(s.level / 100f, bc, "", "", s.charging);
        batteryText.setText(s.level >= 0 ? s.level + "%" : "–");
        batterySub.setText(s.full ? "Voll" : s.charging ? "Lädt" : "Akku");

        Weather.Data d = s.weather;
        if (d != null) {
            weatherText.setText(Weather.temp(d.temp));
            String city = prefs.city();
            int comma = city.indexOf(',');
            weatherSub.setText(comma > 0 ? city.substring(0, comma) : city);
            String g = Weather.glyph(d.code, d.day);
            if (!g.equals(lastWeatherGlyph)) {
                weatherIcon.setImageBitmap(IconFactory.glowGlyph(c, g, Ui.partner(accent), Ui.dp(40)));
                lastWeatherGlyph = g;
            }
        } else {
            weatherText.setText(prefs.city().isEmpty() ? "–" : "…");
            weatherSub.setText(prefs.city().isEmpty() ? "Ort wählen" : "Wetter");
            if (!"cloud".equals(lastWeatherGlyph)) {
                weatherIcon.setImageBitmap(IconFactory.glowGlyph(c, "weather", Ui.partner(accent), Ui.dp(40)));
                lastWeatherGlyph = "cloud";
            }
        }
        try {
            android.os.StatFs fs = new android.os.StatFs(android.os.Environment.getDataDirectory().getPath());
            float used = 1f - fs.getAvailableBytes() / (float) Math.max(1L, fs.getTotalBytes());
            storageRing.set(used, Ui.NEON[Ui.CYAN], "", "", false);
            storageText.setText(Math.round(used * 100) + "%");
        } catch (RuntimeException e) {
            storageText.setText("–");
        }
    }

    // --- Animationen ---

    void startAmbient(boolean on) {
        if (bob != null) {
            bob.cancel();
            bob = null;
            hintArrow.setTranslationY(0);
        }
        if (!on) return;
        bob = ObjectAnimator.ofFloat(hintArrow, View.TRANSLATION_Y, 0f, -Ui.dp(5));
        bob.setDuration(900);
        bob.setRepeatCount(ValueAnimator.INFINITE);
        bob.setRepeatMode(ValueAnimator.REVERSE);
        bob.setInterpolator(new DecelerateInterpolator());
        bob.start();
    }

    /** Inhalte gleiten beim Zurückkehren nacheinander herein. */
    void playIntro() {
        List<View> parts = new ArrayList<>();
        for (int i = 0; i < column.getChildCount(); i++) parts.add(column.getChildAt(i));
        for (int i = 0; i < parts.size(); i++) {
            View v = parts.get(i);
            v.setAlpha(0f);
            v.setTranslationY(Ui.dp(18));
            v.animate().alpha(1f).translationY(0).setStartDelay(i * 35L).setDuration(380)
                .setInterpolator(new DecelerateInterpolator(2f)).start();
        }
        for (int i = 0; i < favorites.getChildCount(); i++) {
            View v = favorites.getChildAt(i);
            v.setScaleX(0.6f);
            v.setScaleY(0.6f);
            v.animate().scaleX(1f).scaleY(1f).setStartDelay(80 + i * 22L).setDuration(360)
                .setInterpolator(new android.view.animation.OvershootInterpolator(1.4f)).start();
        }
    }

    /** Favoriten-Raster: 4 Spalten, so viele Reihen wie Platz ist, unten ausgerichtet. */
    private final class Favorites extends ViewGroup {
        private final List<Apps.App> items = new ArrayList<>();
        private final TextView empty;

        Favorites(Context c) {
            super(c);
            empty = Ui.text(c, "Leg deine Lieblings-Apps hier ab:\nim App-Menü lange drücken → „Zum Startbildschirm“", 13, Ui.TEXT3);
            empty.setGravity(Gravity.CENTER);
            empty.setLineSpacing(Ui.dp(3), 1f);
        }

        void set(List<Apps.App> list) {
            items.clear();
            items.addAll(list);
            removeAllViews();
            if (items.isEmpty()) {
                addView(empty);
                return;
            }
            for (Apps.App a : items) {
                AppCell cell = cell(Ui.dp(60), prefs.labels());
                cell.bind(a, host.icons());
                addView(cell);
            }
        }

        private int cellHeight() {
            return Ui.dp(prefs.labels() ? 94 : 76);
        }

        @Override
        protected void onMeasure(int wSpec, int hSpec) {
            int w = MeasureSpec.getSize(wSpec), h = MeasureSpec.getSize(hSpec);
            int cw = (w - Ui.dp(16)) / 4;
            for (int i = 0; i < getChildCount(); i++) {
                View v = getChildAt(i);
                if (v == empty) v.measure(MeasureSpec.makeMeasureSpec(w - Ui.dp(48), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.AT_MOST));
                else v.measure(MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(cellHeight(), MeasureSpec.EXACTLY));
            }
            setMeasuredDimension(w, h);
        }

        @Override
        protected void onLayout(boolean changed, int l, int t, int r, int b) {
            int w = r - l, h = b - t;
            if (getChildCount() == 1 && getChildAt(0) == empty) {
                int eh = empty.getMeasuredHeight();
                empty.layout(Ui.dp(24), h - eh - Ui.dp(12), w - Ui.dp(24), h - Ui.dp(12));
                return;
            }
            int cw = (w - Ui.dp(16)) / 4, ch = cellHeight();
            int rowsFit = Math.max(0, h / ch);
            int rows = Math.min(rowsFit, (getChildCount() + 3) / 4);
            int y0 = h - rows * ch;
            for (int i = 0; i < getChildCount(); i++) {
                View v = getChildAt(i);
                int row = i / 4, col = i % 4;
                if (row >= rows) {
                    v.layout(0, 0, 0, 0);
                    v.setVisibility(INVISIBLE);
                    continue;
                }
                v.setVisibility(VISIBLE);
                int x = Ui.dp(8) + col * cw, y = y0 + row * ch;
                v.layout(x, y, x + cw, y + ch);
            }
        }
    }
}

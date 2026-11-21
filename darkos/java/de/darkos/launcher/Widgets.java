package de.darkos.launcher;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.format.DateFormat;
import android.text.format.Formatter;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Die eingebauten DarkOS-Widgets. */
final class Widgets {
    private Widgets() {}

    static final String WEATHER = "weather", BATTERY = "battery", QUICK = "quick", CALENDAR = "calendar",
        NOTE = "note", SYSTEM = "system";
    static final String[] BUILT_IN = {WEATHER, BATTERY, QUICK, CALENDAR, NOTE, SYSTEM};

    static String title(String id) {
        switch (id) {
            case WEATHER: return "Wetter";
            case BATTERY: return "Akku";
            case QUICK: return "Schnellzugriff";
            case CALENDAR: return "Kalender";
            case NOTE: return "Notiz";
            case SYSTEM: return "System";
            default: return "Widget";
        }
    }

    static String glyph(String id) {
        switch (id) {
            case WEATHER: return "weather";
            case BATTERY: return "battery_full";
            case QUICK: return "zap";
            case CALENDAR: return "calendar";
            case NOTE: return "note";
            case SYSTEM: return "cpu";
            default: return "widget";
        }
    }

    static String describe(String id) {
        switch (id) {
            case WEATHER: return "Temperatur und Vorhersage für deinen Ort";
            case BATTERY: return "Ladestand, Temperatur, Restladezeit";
            case QUICK: return "Taschenlampe, WLAN, Bluetooth, Ton …";
            case CALENDAR: return "Monatsübersicht";
            case NOTE: return "Schnelle Notiz auf dem Startbildschirm";
            case SYSTEM: return "Speicher, Arbeitsspeicher, Laufzeit";
            default: return "";
        }
    }

    static Widget create(LauncherActivity a, String id) {
        switch (id) {
            case WEATHER: return new WeatherWidget(a);
            case BATTERY: return new BatteryWidget(a);
            case QUICK: return new QuickWidget(a);
            case CALENDAR: return new CalendarWidget(a);
            case NOTE: return new NoteWidget(a);
            case SYSTEM: return new SystemWidget(a);
            default: return null;
        }
    }

    /** Grundgerüst: Glas-Karte mit Kopfzeile. */
    abstract static class Widget {
        final LauncherActivity act;
        final String id;
        final int accent;
        final LinearLayout card;
        final LinearLayout header;
        final LinearLayout body;

        Widget(final LauncherActivity a, final String id) {
            this.act = a;
            this.id = id;
            this.accent = a.prefs.accent();
            card = Ui.column(a);
            card.setBackground(Ui.glass(accent, 26));
            card.setPadding(Ui.dp(18), Ui.dp(14), Ui.dp(12), Ui.dp(18));
            if (Build.VERSION.SDK_INT >= 28) {
                card.setElevation(Ui.dp(4));
                card.setOutlineAmbientShadowColor(accent);
                card.setOutlineSpotShadowColor(accent);
            }
            header = Ui.row(a);
            header.addView(Ui.glyphView(a, glyph(id), accent, 17), Ui.margins(Ui.lp(Ui.dp(17), Ui.dp(17)), 0, 0, 10, 0));
            header.addView(Ui.label(a, title(id)), Ui.lp(0, -2, 1));
            ImageView more = new ImageView(a);
            more.setImageDrawable(Ui.glyph(a, "more", Ui.TEXT3));
            more.setPadding(Ui.dp(8), Ui.dp(8), Ui.dp(8), Ui.dp(8));
            more.setBackground(Ui.ripple(accent, null, 16));
            more.setContentDescription("Widget bearbeiten");
            more.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    act.showWidgetMenu(id);
                }
            });
            header.addView(more, Ui.lp(Ui.dp(34), Ui.dp(34)));
            card.addView(header, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 8));
            body = Ui.column(a);
            card.addView(body, Ui.margins(Ui.lp(-1, -2), 0, 0, 6, 0));
            card.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                    act.showWidgetMenu(id);
                    return true;
                }
            });
        }

        void addToHeader(View v) {
            header.addView(v, header.getChildCount() - 1);
        }

        void update(Status s) {
        }

        void onMinute() {
        }

        void start() {
        }

        void stop() {
        }
    }

    // ---------------------------------------------------------------- Wetter

    static final class WeatherWidget extends Widget {
        private final TextView city;

        WeatherWidget(LauncherActivity a) {
            super(a, WEATHER);
            city = Ui.text(a, "", 12.5f, Ui.TEXT3);
            Ui.singleLine(city);
            addToHeader(city);
            ImageView refresh = new ImageView(a);
            refresh.setImageDrawable(Ui.glyph(a, "refresh", Ui.TEXT3));
            refresh.setPadding(Ui.dp(8), Ui.dp(8), Ui.dp(8), Ui.dp(8));
            refresh.setBackground(Ui.ripple(accent, null, 16));
            refresh.setContentDescription("Wetter aktualisieren");
            refresh.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    v.animate().rotationBy(360).setDuration(600).start();
                    act.refreshWeather(true);
                }
            });
            addToHeader(refresh);
        }

        @Override
        void update(Status s) {
            body.removeAllViews();
            Context c = act;
            String place = act.prefs.city();
            city.setText(place);
            if (place.isEmpty()) {
                body.addView(Ui.text(c, "Lege einen Ort fest, um Temperatur und Vorhersage zu sehen.", 14.5f, Ui.TEXT2),
                    Ui.margins(Ui.lp(-1, -2), 0, 4, 6, 14));
                TextView b = Ui.button(c, "Ort festlegen", accent, false);
                b.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        act.askCity();
                    }
                });
                body.addView(b, Ui.margins(Ui.lp(-1, -2), 0, 0, 6, 0));
                return;
            }
            Weather.Data d = s.weather;
            if (d == null) {
                String msg = s.weatherLoading ? "Wetter wird geladen …"
                    : s.weatherError != null ? "Keine Verbindung zum Wetterdienst. Tippe auf ↻, um es erneut zu versuchen." : "Noch keine Daten.";
                body.addView(Ui.text(c, msg, 14.5f, Ui.TEXT2), Ui.margins(Ui.lp(-1, -2), 0, 6, 6, 6));
                return;
            }
            LinearLayout now = Ui.row(c);
            ImageView icon = new ImageView(c);
            icon.setImageBitmap(IconFactory.glowGlyph(c, Weather.glyph(d.code, d.day), Ui.NEON[weatherColor(d)], Ui.dp(84)));
            now.addView(icon, Ui.margins(Ui.lp(Ui.dp(84), Ui.dp(84)), -10, -6, 4, -6));
            TextView temp = Ui.title(c, Weather.temp(d.temp), 42);
            Ui.glow(temp, accent, 14);
            now.addView(temp, Ui.margins(Ui.lp(-2, -2), 0, 0, 14, 0));
            LinearLayout info = Ui.column(c);
            TextView desc = Ui.text(c, Weather.describe(d.code), 16, Ui.TEXT);
            desc.setTypeface(Ui.sans("sans-serif-medium"));
            Ui.singleLine(desc);
            info.addView(desc);
            String details = "Gefühlt " + Weather.temp(d.feels) + " · " + Math.round(d.wind) + " km/h";
            if (d.humidity >= 0) details += " · " + d.humidity + " %";
            TextView det = Ui.text(c, details, 12.5f, Ui.TEXT2);
            det.setMaxLines(2);
            info.addView(det, Ui.margins(Ui.lp(-2, -2), 0, 5, 0, 0));
            now.addView(info, Ui.lp(0, -2, 1));
            body.addView(now, Ui.lp(-1, -2));

            if (d.days.length > 1) {
                LinearLayout days = Ui.row(c);
                days.setPadding(0, Ui.dp(10), 0, 0);
                SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
                SimpleDateFormat out = new SimpleDateFormat("EE", Locale.GERMAN);
                for (int i = 0; i < Math.min(4, d.days.length); i++) {
                    LinearLayout col = Ui.column(c);
                    col.setGravity(Gravity.CENTER_HORIZONTAL);
                    String name = i == 0 ? "Heute" : d.days[i];
                    try {
                        if (i > 0) name = out.format(in.parse(d.days[i])).replace(".", "");
                    } catch (java.text.ParseException ignored) {
                        // Datum bleibt wie geliefert
                    }
                    col.addView(Ui.text(c, name, 12, Ui.TEXT2));
                    ImageView g = Ui.glyphView(c, Weather.glyph(d.dayCodes[i], true), Ui.alpha(accent, 0.95f), 22);
                    col.addView(g, Ui.margins(Ui.lp(Ui.dp(22), Ui.dp(22)), 0, 6, 0, 6));
                    TextView t = Ui.text(c, Weather.temp(d.max[i]) + " " + Weather.temp(d.min[i]), 12.5f, Ui.TEXT);
                    col.addView(t);
                    days.addView(col, Ui.lp(0, -2, 1));
                }
                View line = new View(c);
                line.setBackgroundColor(Ui.LINE);
                body.addView(line, Ui.margins(Ui.lp(-1, 1), 0, 12, 6, 0));
                body.addView(days, Ui.lp(-1, -2));
            }
            String updated = s.weatherTime > 0 ? "Stand " + DateFormat.getTimeFormat(c).format(new Date(s.weatherTime)) + " · " : "";
            TextView credit = Ui.text(c, updated + "Wetterdaten: Open-Meteo.com", 10.5f, Ui.TEXT3);
            body.addView(credit, Ui.margins(Ui.lp(-2, -2), 0, 12, 0, 0));
        }

        private static int weatherColor(Weather.Data d) {
            if (d.code == 0 || d.code == 1 || d.code == 2) return d.day ? Ui.YELLOW : Ui.VIOLET;
            if (d.code >= 95) return Ui.VIOLET;
            if ((d.code >= 71 && d.code <= 77) || d.code == 85 || d.code == 86) return Ui.CYAN;
            if (d.code >= 51) return Ui.BLUE;
            return Ui.CYAN;
        }
    }

    // ---------------------------------------------------------------- Akku

    static final class BatteryWidget extends Widget {
        private final RingView ring;
        private final TextView state, detail;

        BatteryWidget(LauncherActivity a) {
            super(a, BATTERY);
            LinearLayout row = Ui.row(a);
            ring = new RingView(a, 9, 26);
            row.addView(ring, Ui.lp(Ui.dp(112), Ui.dp(112)));
            LinearLayout info = Ui.column(a);
            state = Ui.text(a, "", 17, Ui.TEXT);
            state.setTypeface(Ui.sans("sans-serif-medium"));
            info.addView(state);
            detail = Ui.text(a, "", 13, Ui.TEXT2);
            detail.setLineSpacing(Ui.dp(4), 1f);
            info.addView(detail, Ui.margins(Ui.lp(-2, -2), 0, 6, 0, 0));
            row.addView(info, Ui.margins(Ui.lp(0, -2, 1), 16, 0, 0, 0));
            body.addView(row, Ui.lp(-1, -2));
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    act.startSafely(new Intent(Intent.ACTION_POWER_USAGE_SUMMARY));
                }
            });
        }

        @Override
        void update(Status s) {
            int color = s.batteryColor(accent);
            ring.set(s.level / 100f, color, s.level >= 0 ? s.level + "%" : "–", s.charging ? "lädt" : "", s.charging);
            String st = s.full ? "Voll geladen" : s.charging ? "Wird geladen" : "Akkubetrieb";
            if (s.charging && !s.plugText().isEmpty()) st += " · " + s.plugText();
            state.setText(st);
            StringBuilder b = new StringBuilder();
            if (s.chargeLeftMs > 0) b.append("Voll in ca. ").append(Status.duration(s.chargeLeftMs)).append('\n');
            if (!Float.isNaN(s.tempC)) b.append(String.format(Locale.GERMAN, "Temperatur %.1f °C", s.tempC)).append('\n');
            if (!Float.isNaN(s.volt)) b.append(String.format(Locale.GERMAN, "Spannung %.2f V", s.volt)).append('\n');
            b.append("Zustand ").append(s.healthText());
            detail.setText(b.toString());
        }
    }

    // ---------------------------------------------------------------- Schnellzugriff

    static final class QuickWidget extends Widget {
        private final CameraManager cameras;
        private String torchId;
        private boolean torchOn;
        private ImageView torchIcon;
        private View torchButton;
        private CameraManager.TorchCallback callback;

        QuickWidget(final LauncherActivity a) {
            super(a, QUICK);
            cameras = (CameraManager) a.getSystemService(Context.CAMERA_SERVICE);
            torchId = findTorch();
            LinearLayout r1 = Ui.row(a), r2 = Ui.row(a);
            torchButton = tile(r1, "flashlight", "Lampe", new Runnable() {
                @Override
                public void run() {
                    toggleTorch();
                }
            });
            torchIcon = (ImageView) ((LinearLayout) torchButton).getChildAt(0);
            tile(r1, "wifi", "WLAN", open(Build.VERSION.SDK_INT >= 29 ? new Intent(Settings.Panel.ACTION_WIFI) : new Intent(Settings.ACTION_WIFI_SETTINGS)));
            tile(r1, "bluetooth", "Bluetooth", open(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
            tile(r1, "globe", "Internet", open(Build.VERSION.SDK_INT >= 29
                ? new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY) : new Intent(Settings.ACTION_WIRELESS_SETTINGS)));
            tile(r2, "volume", "Ton", open(Build.VERSION.SDK_INT >= 29 ? new Intent(Settings.Panel.ACTION_VOLUME) : new Intent(Settings.ACTION_SOUND_SETTINGS)));
            tile(r2, "brightness", "Display", open(new Intent(Settings.ACTION_DISPLAY_SETTINGS)));
            tile(r2, "alarm", "Wecker", open(new Intent(AlarmClock.ACTION_SHOW_ALARMS)));
            tile(r2, "camera", "Kamera", open(new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)));
            body.addView(r1, Ui.lp(-1, -2));
            body.addView(r2, Ui.margins(Ui.lp(-1, -2), 0, 12, 0, 0));
            if (torchId == null) torchButton.setAlpha(0.35f);
            paintTorch();
        }

        private Runnable open(final Intent i) {
            return new Runnable() {
                @Override
                public void run() {
                    act.startSafely(i);
                }
            };
        }

        private View tile(LinearLayout row, String glyph, String label, final Runnable r) {
            LinearLayout t = Ui.column(act);
            t.setGravity(Gravity.CENTER_HORIZONTAL);
            ImageView icon = new ImageView(act);
            icon.setImageDrawable(Ui.glyph(act, glyph, accent));
            icon.setPadding(Ui.dp(15), Ui.dp(15), Ui.dp(15), Ui.dp(15));
            icon.setBackground(Ui.rounded(Ui.alpha(accent, 0.08f), 27, Ui.alpha(accent, 0.45f), 1.2f));
            t.addView(icon, Ui.lp(Ui.dp(54), Ui.dp(54)));
            TextView l = Ui.text(act, label, 11.5f, Ui.TEXT2);
            Ui.singleLine(l);
            t.addView(l, Ui.margins(Ui.lp(-2, -2), 0, 6, 0, 0));
            t.setClickable(true);
            t.setContentDescription(label);
            Ui.pressEffect(t);
            t.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    r.run();
                }
            });
            row.addView(t, Ui.lp(0, -2, 1));
            return t;
        }

        private String findTorch() {
            if (cameras == null) return null;
            try {
                for (String id : cameras.getCameraIdList()) {
                    Boolean flash = cameras.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    if (flash != null && flash) return id;
                }
            } catch (CameraAccessException | RuntimeException ignored) {
                // Keine Kamera erreichbar
            }
            return null;
        }

        private void toggleTorch() {
            if (torchId == null) {
                act.toast("Keine Taschenlampe gefunden");
                return;
            }
            try {
                cameras.setTorchMode(torchId, !torchOn);
                torchOn = !torchOn;
                paintTorch();
            } catch (CameraAccessException | RuntimeException e) {
                act.toast("Taschenlampe ist gerade nicht verfügbar");
            }
        }

        private void paintTorch() {
            torchIcon.setImageDrawable(Ui.glyph(act, torchOn ? "flashlight" : "flashlight_off", torchOn ? 0xFF0A0710 : accent));
            torchIcon.setBackground(torchOn
                ? Ui.rounded(accent, 27, Ui.mix(accent, 0xFFFFFFFF, 0.3f), 1.2f)
                : Ui.rounded(Ui.alpha(accent, 0.08f), 27, Ui.alpha(accent, 0.45f), 1.2f));
            if (Build.VERSION.SDK_INT >= 28) {
                torchIcon.setElevation(torchOn ? Ui.dp(8) : 0);
                torchIcon.setOutlineAmbientShadowColor(accent);
                torchIcon.setOutlineSpotShadowColor(accent);
            }
        }

        @Override
        void start() {
            if (cameras == null || torchId == null) return;
            callback = new CameraManager.TorchCallback() {
                @Override
                public void onTorchModeChanged(String cameraId, boolean enabled) {
                    if (cameraId.equals(torchId) && enabled != torchOn) {
                        torchOn = enabled;
                        paintTorch();
                    }
                }
            };
            try {
                cameras.registerTorchCallback(callback, new Handler(Looper.getMainLooper()));
            } catch (RuntimeException ignored) {
                callback = null;
            }
        }

        @Override
        void stop() {
            if (callback != null) {
                cameras.unregisterTorchCallback(callback);
                callback = null;
            }
        }
    }

    // ---------------------------------------------------------------- Kalender

    static final class CalendarWidget extends Widget {
        private final TextView month;
        private final MonthView grid;

        CalendarWidget(LauncherActivity a) {
            super(a, CALENDAR);
            LinearLayout nav = Ui.row(a);
            month = Ui.title(a, "", 17);
            nav.addView(month, Ui.lp(0, -2, 1));
            grid = new MonthView(a, accent);
            nav.addView(arrow("left", -1));
            nav.addView(arrow("right", 1));
            body.addView(nav, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 8));
            body.addView(grid, Ui.lp(-1, Ui.dp(26 + 6 * 36)));
            month.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    grid.today();
                    paint();
                }
            });
            paint();
        }

        private View arrow(String glyph, final int delta) {
            ImageView v = new ImageView(act);
            v.setImageDrawable(Ui.glyph(act, glyph, Ui.TEXT2));
            v.setPadding(Ui.dp(8), Ui.dp(8), Ui.dp(8), Ui.dp(8));
            v.setBackground(Ui.ripple(accent, null, 18));
            v.setContentDescription(delta < 0 ? "Vorheriger Monat" : "Nächster Monat");
            v.setLayoutParams(Ui.lp(Ui.dp(38), Ui.dp(38)));
            v.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    grid.shift(delta);
                    paint();
                }
            });
            return v;
        }

        private void paint() {
            month.setText(new SimpleDateFormat("LLLL yyyy", Locale.GERMAN).format(grid.month.getTime()));
        }

        @Override
        void onMinute() {
            grid.invalidate();
        }
    }

    /** Monatsraster mit hervorgehobenem Heute; Tippen öffnet den Tag im Kalender. */
    static final class MonthView extends View {
        final Calendar month = Calendar.getInstance();
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int accent;
        private static final String[] DAYS = {"Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"};

        MonthView(Context c, int accent) {
            super(c);
            this.accent = accent;
            paint.setTextAlign(Paint.Align.CENTER);
            if (Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
            today();
        }

        void today() {
            month.setTimeInMillis(System.currentTimeMillis());
            month.set(Calendar.DAY_OF_MONTH, 1);
            invalidate();
        }

        void shift(int delta) {
            month.add(Calendar.MONTH, delta);
            invalidate();
        }

        private int offset() {
            // Montag als erster Wochentag
            return (month.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        }

        @Override
        protected void onDraw(Canvas c) {
            float cw = getWidth() / 7f, top = Ui.dp(26), rh = (getHeight() - top) / 6f;
            paint.setTypeface(Ui.sans("sans-serif-medium"));
            paint.setTextSize(Ui.dp(11));
            paint.clearShadowLayer();
            for (int i = 0; i < 7; i++) {
                paint.setColor(i >= 5 ? Ui.alpha(accent, 0.8f) : Ui.TEXT3);
                c.drawText(DAYS[i], cw * i + cw / 2f, Ui.dp(12), paint);
            }
            Calendar now = Calendar.getInstance();
            boolean thisMonth = now.get(Calendar.YEAR) == month.get(Calendar.YEAR) && now.get(Calendar.MONTH) == month.get(Calendar.MONTH);
            int days = month.getActualMaximum(Calendar.DAY_OF_MONTH);
            int off = offset();
            paint.setTypeface(Ui.display(getContext(), false));
            paint.setTextSize(Ui.dp(12.5f));
            Paint.FontMetrics fm = paint.getFontMetrics();
            for (int d = 1; d <= days; d++) {
                int idx = off + d - 1;
                float cx = cw * (idx % 7) + cw / 2f, cy = top + rh * (idx / 7) + rh / 2f;
                boolean today = thisMonth && d == now.get(Calendar.DAY_OF_MONTH);
                if (today) {
                    paint.setColor(accent);
                    paint.setShadowLayer(Ui.dp(9), 0, 0, accent);
                    c.drawCircle(cx, cy, Math.min(cw, rh) * 0.42f, paint);
                    paint.clearShadowLayer();
                    paint.setColor(0xFF0A0710);
                } else {
                    paint.setColor(idx % 7 >= 5 ? Ui.TEXT2 : Ui.TEXT);
                }
                c.drawText(String.valueOf(d), cx, cy - (fm.ascent + fm.descent) / 2f, paint);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) return true;
            if (e.getActionMasked() != MotionEvent.ACTION_UP) return true;
            float cw = getWidth() / 7f, top = Ui.dp(26), rh = (getHeight() - top) / 6f;
            if (e.getY() < top) return true;
            int idx = (int) ((e.getY() - top) / rh) * 7 + (int) (e.getX() / cw);
            int day = idx - offset() + 1;
            if (day >= 1 && day <= month.getActualMaximum(Calendar.DAY_OF_MONTH)) {
                Calendar target = (Calendar) month.clone();
                target.set(Calendar.DAY_OF_MONTH, day);
                target.set(Calendar.HOUR_OF_DAY, 9);
                ((LauncherActivity) getContext()).openCalendarAt(target.getTimeInMillis());
            }
            return true;
        }
    }

    // ---------------------------------------------------------------- Notiz

    static final class NoteWidget extends Widget {
        private final EditText edit;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final Runnable save = new Runnable() {
            @Override
            public void run() {
                act.prefs.setNote(edit.getText().toString());
            }
        };

        NoteWidget(LauncherActivity a) {
            super(a, NOTE);
            edit = new EditText(a);
            edit.setText(a.prefs.note());
            edit.setHint("Schreib dir etwas auf …");
            edit.setHintTextColor(Ui.TEXT3);
            edit.setTextColor(Ui.TEXT);
            edit.setTextSize(15.5f);
            edit.setGravity(Gravity.TOP);
            edit.setMinLines(3);
            edit.setLineSpacing(Ui.dp(3), 1f);
            edit.setBackground(null);
            edit.setPadding(0, Ui.dp(2), Ui.dp(6), 0);
            edit.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int st, int c, int af) {
                }

                @Override
                public void onTextChanged(CharSequence s, int st, int b, int c) {
                }

                @Override
                public void afterTextChanged(Editable s) {
                    handler.removeCallbacks(save);
                    handler.postDelayed(save, 600);
                }
            });
            body.addView(edit, Ui.lp(-1, -2));
        }

        @Override
        void stop() {
            handler.removeCallbacks(save);
            save.run();
        }
    }

    // ---------------------------------------------------------------- System

    static final class SystemWidget extends Widget {
        private final TextView storageText, ramText, info;
        private final Bar storage, ram;

        SystemWidget(LauncherActivity a) {
            super(a, SYSTEM);
            storageText = Ui.text(a, "", 13.5f, Ui.TEXT);
            storage = new Bar(a, accent);
            ramText = Ui.text(a, "", 13.5f, Ui.TEXT);
            ram = new Bar(a, Ui.partner(accent));
            info = Ui.text(a, "", 12.5f, Ui.TEXT2);
            info.setLineSpacing(Ui.dp(3), 1f);
            body.addView(storageText);
            body.addView(storage, Ui.margins(Ui.lp(-1, Ui.dp(14)), 0, 8, 6, 14));
            body.addView(ramText);
            body.addView(ram, Ui.margins(Ui.lp(-1, Ui.dp(14)), 0, 8, 6, 14));
            body.addView(info);
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    refresh();
                }
            });
        }

        @Override
        void start() {
            refresh();
        }

        @Override
        void onMinute() {
            refresh();
        }

        void refresh() {
            Context c = act;
            try {
                StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
                long total = fs.getTotalBytes(), free = fs.getAvailableBytes();
                storageText.setText("Speicher · " + Formatter.formatShortFileSize(c, total - free) + " von "
                    + Formatter.formatShortFileSize(c, total));
                storage.set(total > 0 ? (total - free) / (float) total : 0);
            } catch (RuntimeException e) {
                storageText.setText("Speicher · unbekannt");
            }
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                ramText.setText("Arbeitsspeicher · " + Formatter.formatShortFileSize(c, mi.totalMem - mi.availMem) + " von "
                    + Formatter.formatShortFileSize(c, mi.totalMem));
                ram.set(mi.totalMem > 0 ? (mi.totalMem - mi.availMem) / (float) mi.totalMem : 0);
            }
            long up = SystemClock.elapsedRealtime() / 60000;
            String uptime = up >= 1440 ? (up / 1440) + " T " + (up % 1440 / 60) + " Std" : (up / 60) + " Std " + (up % 60) + " min";
            info.setText("Laufzeit seit Neustart: " + uptime + "\nAndroid " + Build.VERSION.RELEASE + " · " + Build.MODEL);
        }
    }

    /** Leuchtender Balken. */
    static final class Bar extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF();
        private final int color;
        private float value;

        Bar(Context c, int color) {
            super(c);
            this.color = color;
            if (Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
        }

        void set(float v) {
            value = Math.max(0f, Math.min(1f, v));
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float h = Ui.dp(6), pad = Ui.dp(4);
            float y = (getHeight() - h) / 2f;
            r.set(pad, y, getWidth() - pad, y + h);
            paint.setShader(null);
            paint.clearShadowLayer();
            paint.setColor(0x1AFFFFFF);
            c.drawRoundRect(r, h / 2f, h / 2f, paint);
            r.right = pad + (getWidth() - 2 * pad) * value;
            if (value <= 0f) return;
            paint.setShader(new LinearGradient(r.left, 0, r.right, 0, Ui.partner(color), color, Shader.TileMode.CLAMP));
            paint.setShadowLayer(Ui.dp(5), 0, 0, color);
            c.drawRoundRect(r, h / 2f, h / 2f, paint);
        }
    }

    /** Hält Android-Widgets und erkennt langes Drücken, ohne dem Widget Klicks wegzunehmen. */
    static final class LongPressFrame extends FrameLayout {
        private final Runnable onLong;
        private final int slop;
        private float downX, downY;
        private boolean fired;
        private final Runnable check = new Runnable() {
            @Override
            public void run() {
                fired = true;
                performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                onLong.run();
            }
        };

        LongPressFrame(Context c, Runnable onLong) {
            super(c);
            this.onLong = onLong;
            slop = android.view.ViewConfiguration.get(c).getScaledTouchSlop();
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    fired = false;
                    downX = e.getX();
                    downY = e.getY();
                    postDelayed(check, android.view.ViewConfiguration.getLongPressTimeout());
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (Math.abs(e.getX() - downX) > slop || Math.abs(e.getY() - downY) > slop) removeCallbacks(check);
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    removeCallbacks(check);
                    break;
                default:
                    break;
            }
            return fired;
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) removeCallbacks(check);
            return fired || super.onTouchEvent(e);
        }
    }
}

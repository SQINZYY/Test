package de.darkos.launcher;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Farben, Schriften und kleine Bausteine für die Oberfläche. */
final class Ui {
    private Ui() {}

    // Neon-Palette (auf Schwarz gut leuchtend)
    static final int[] NEON = {
        0xFFA855F7, // Violett
        0xFF22D3EE, // Cyan
        0xFFF472B6, // Pink
        0xFF4ADE80, // Grün
        0xFFFB923C, // Orange
        0xFF60A5FA, // Blau
        0xFFF87171, // Rot
        0xFFFACC15, // Gelb
    };
    static final String[] NEON_NAMES = {"Violett", "Cyan", "Pink", "Grün", "Orange", "Blau", "Rot", "Gelb"};
    static final int VIOLET = 0, CYAN = 1, PINK = 2, GREEN = 3, ORANGE = 4, BLUE = 5, RED = 6, YELLOW = 7;

    static final int BG = 0xFF000000;
    static final int SURFACE = 0xD90C0B14;
    static final int SURFACE_SOLID = 0xFF0C0B14;
    static final int TEXT = 0xFFF4F2FA;
    static final int TEXT2 = 0xFFA8A6BC;
    static final int TEXT3 = 0xFF6E6C84;
    static final int LINE = 0x1FFFFFFF;

    static float density = 3f;
    private static Typeface displayBold, displayMedium;

    static void init(Context c) {
        density = c.getResources().getDisplayMetrics().density;
    }

    static int dp(float v) {
        return Math.round(v * density);
    }

    static int neon(int index) {
        return NEON[((index % NEON.length) + NEON.length) % NEON.length];
    }

    /** Zweite Farbe für Verläufe (z. B. Violett -> Pink). */
    static int partner(int color) {
        float[] hsv = new float[3];
        Color.colorToHSV(color, hsv);
        hsv[0] = (hsv[0] + 42f) % 360f;
        return Color.HSVToColor(Color.alpha(color), hsv);
    }

    static int alpha(int color, float a) {
        return (Math.round(Math.max(0f, Math.min(1f, a)) * 255) << 24) | (color & 0x00FFFFFF);
    }

    static int mix(int a, int b, float t) {
        float u = 1f - t;
        return Color.argb(
            Math.round(Color.alpha(a) * u + Color.alpha(b) * t),
            Math.round(Color.red(a) * u + Color.red(b) * t),
            Math.round(Color.green(a) * u + Color.green(b) * t),
            Math.round(Color.blue(a) * u + Color.blue(b) * t));
    }

    /** Orbitron (futuristische Schrift) für Uhr, Zahlen und Überschriften. */
    static Typeface display(Context c, boolean bold) {
        if (displayBold == null) {
            try {
                displayBold = Typeface.createFromAsset(c.getAssets(), "fonts/Orbitron-Bold.ttf");
                displayMedium = Typeface.createFromAsset(c.getAssets(), "fonts/Orbitron-Medium.ttf");
            } catch (RuntimeException e) {
                displayBold = Typeface.DEFAULT_BOLD;
                displayMedium = Typeface.DEFAULT;
            }
        }
        return bold ? displayBold : displayMedium;
    }

    static Typeface sans(String family) {
        return Typeface.create(family, Typeface.NORMAL);
    }

    static TextView text(Context c, CharSequence s, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setIncludeFontPadding(false);
        return t;
    }

    static TextView label(Context c, CharSequence s) {
        TextView t = text(c, s, 11.5f, TEXT3);
        t.setTypeface(sans("sans-serif-medium"));
        t.setLetterSpacing(0.14f);
        t.setAllCaps(true);
        return t;
    }

    static TextView title(Context c, CharSequence s, float sp) {
        TextView t = text(c, s, sp, TEXT);
        t.setTypeface(display(c, true));
        t.setLetterSpacing(0.06f);
        return t;
    }

    static void singleLine(TextView t) {
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
    }

    static GradientDrawable rounded(int fill, float radiusDp, int stroke, float strokeDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) g.setStroke(Math.max(1, Math.round(strokeDp * density)), stroke);
        return g;
    }

    /** Dunkle Glasfläche mit feinem Neon-Rand. */
    static GradientDrawable glass(int accent, float radiusDp) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[] {mix(SURFACE, alpha(accent, 0.85f), 0.07f), SURFACE});
        g.setCornerRadius(dp(radiusDp));
        g.setStroke(Math.max(1, dp(1)), alpha(accent, 0.32f));
        return g;
    }

    static Drawable ripple(int accent, Drawable content, float radiusDp) {
        GradientDrawable mask = rounded(0xFFFFFFFF, radiusDp, 0, 0);
        return new RippleDrawable(ColorStateList.valueOf(alpha(accent, 0.22f)), content, mask);
    }

    static Drawable glyph(Context c, String name, int color) {
        int id = Glyphs.id(name);
        if (id == 0) return null;
        Drawable d = c.getDrawable(id).mutate();
        d.setTint(color);
        d.setTintMode(PorterDuff.Mode.SRC_IN);
        return d;
    }

    static ImageView glyphView(Context c, String name, int color, int sizeDp) {
        ImageView v = new ImageView(c);
        v.setImageDrawable(glyph(c, name, color));
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return v;
    }

    /** Leuchtender Text (Neon-Schein über einen Schatten). */
    static void glow(TextView t, int color, float radiusDp) {
        t.setShadowLayer(dp(radiusDp), 0, 0, color);
    }

    static LinearLayout row(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    static LinearLayout column(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    static LinearLayout.LayoutParams lp(int w, int h) {
        return new LinearLayout.LayoutParams(w, h);
    }

    static LinearLayout.LayoutParams lp(int w, int h, float weight) {
        return new LinearLayout.LayoutParams(w, h, weight);
    }

    static LinearLayout.LayoutParams margins(LinearLayout.LayoutParams p, int l, int t, int r, int b) {
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    /** Neon-Knopf mit Umriss oder gefüllt. */
    static TextView button(Context c, String text, int accent, boolean filled) {
        TextView b = text(c, text, 15, filled ? 0xFF0A0710 : accent);
        b.setTypeface(sans("sans-serif-medium"));
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(18), dp(13), dp(18), dp(13));
        GradientDrawable bg = filled
            ? new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[] {accent, partner(accent)})
            : rounded(alpha(accent, 0.08f), 16, alpha(accent, 0.7f), 1.2f);
        bg.setCornerRadius(dp(16));
        b.setBackground(ripple(accent, bg, 16));
        if (Build.VERSION.SDK_INT >= 28 && filled) {
            b.setElevation(dp(6));
            b.setOutlineAmbientShadowColor(accent);
            b.setOutlineSpotShadowColor(accent);
        }
        b.setClickable(true);
        b.setFocusable(true);
        pressEffect(b);
        return b;
    }

    /** Leichtes Eindrücken beim Antippen (klickt trotzdem normal). */
    static void pressEffect(final View v) {
        v.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        view.animate().scaleX(0.92f).scaleY(0.92f).setDuration(110)
                            .setInterpolator(new DecelerateInterpolator()).start();
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        view.animate().scaleX(1f).scaleY(1f).setDuration(320)
                            .setInterpolator(new OvershootInterpolator(2.2f)).start();
                        break;
                    default:
                        break;
                }
                return false;
            }
        });
    }

    static boolean animationsEnabled(Context c) {
        // Respektiert auch "Animationen entfernen" in den Bedienungshilfen
        return Prefs.get(c).animations() && (Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled());
    }
}

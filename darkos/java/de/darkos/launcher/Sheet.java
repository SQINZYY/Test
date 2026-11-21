package de.darkos.launcher;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Neon-Panel, das von unten hereinfährt (Menüs, Auswahl, Eingaben). */
final class Sheet {
    interface TextResult {
        void onText(String text);
    }

    private static Sheet current;
    static int navInset, imeInset;

    final Activity activity;
    final int accent;
    private final FrameLayout host;
    private final FrameLayout root;
    private final View scrim;
    private final LinearLayout panel;
    private final LinearLayout body;
    private Runnable onDismiss;
    private boolean dismissing;

    private Sheet(Activity a, FrameLayout host) {
        this.activity = a;
        this.host = host;
        this.accent = Prefs.get(a).accent();
        root = new FrameLayout(a);
        scrim = new View(a);
        scrim.setBackgroundColor(0x99000000);
        scrim.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismiss();
            }
        });
        root.addView(scrim, new FrameLayout.LayoutParams(-1, -1));

        panel = Ui.column(a);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] {Ui.mix(Ui.SURFACE_SOLID, accent, 0.10f), Ui.SURFACE_SOLID});
        float r = Ui.dp(28);
        bg.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        bg.setStroke(Math.max(1, Ui.dp(1)), Ui.alpha(accent, 0.45f));
        panel.setBackground(bg);
        panel.setClickable(true);
        panel.setPadding(Ui.dp(20), Ui.dp(10), Ui.dp(20), Ui.dp(16) + navInset);

        View handle = new View(a);
        handle.setBackground(Ui.rounded(Ui.alpha(accent, 0.6f), 3, 0, 0));
        LinearLayout.LayoutParams hp = Ui.lp(Ui.dp(40), Ui.dp(4));
        hp.gravity = Gravity.CENTER_HORIZONTAL;
        hp.bottomMargin = Ui.dp(14);
        panel.addView(handle, hp);

        body = Ui.column(a);
        MaxScroll scroll = new MaxScroll(a);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.addView(body, new FrameLayout.LayoutParams(-1, -2));
        panel.addView(scroll, Ui.lp(-1, -2));

        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(panel, pp);
        root.setPadding(0, 0, 0, imeInset);
    }

    static Sheet create(Activity a, FrameLayout host) {
        if (current != null) current.dismissNow();
        return new Sheet(a, host);
    }

    static boolean dismissCurrent() {
        if (current == null) return false;
        current.dismiss();
        return true;
    }

    static boolean isShowing() {
        return current != null;
    }

    static void onInsetsChanged(int nav, int ime) {
        navInset = nav;
        imeInset = ime;
        if (current != null) {
            current.root.setPadding(0, 0, 0, ime);
            current.panel.setPadding(Ui.dp(20), Ui.dp(10), Ui.dp(20), Ui.dp(16) + (ime > 0 ? 0 : nav));
        }
    }

    Context context() {
        return activity;
    }

    Sheet onDismiss(Runnable r) {
        onDismiss = r;
        return this;
    }

    Sheet header(Bitmap icon, String title, String subtitle) {
        LinearLayout row = Ui.row(activity);
        if (icon != null) {
            ImageView iv = new ImageView(activity);
            iv.setImageBitmap(icon);
            row.addView(iv, Ui.margins(Ui.lp(Ui.dp(56), Ui.dp(56)), 0, 0, 12, 0));
        }
        LinearLayout texts = Ui.column(activity);
        TextView t = Ui.text(activity, title, 20, Ui.TEXT);
        t.setTypeface(Ui.sans("sans-serif-medium"));
        Ui.singleLine(t);
        texts.addView(t);
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView s = Ui.text(activity, subtitle, 13, Ui.TEXT2);
            Ui.singleLine(s);
            texts.addView(s, Ui.margins(Ui.lp(-2, -2), 0, 5, 0, 0));
        }
        row.addView(texts, Ui.lp(0, -2, 1));
        body.addView(row, Ui.margins(Ui.lp(-1, -2), 0, 0, 0, 12));
        return this;
    }

    Sheet title(String title, String subtitle) {
        return header(null, title, subtitle);
    }

    Sheet section(String label) {
        TextView l = Ui.label(activity, label);
        body.addView(l, Ui.margins(Ui.lp(-2, -2), 4, 14, 0, 8));
        return this;
    }

    Sheet action(String glyph, String label, final Runnable r) {
        return action(glyph, label, null, accent, r);
    }

    Sheet action(String glyph, String label, String detail, int color, final Runnable r) {
        LinearLayout row = Ui.row(activity);
        row.setPadding(Ui.dp(10), 0, Ui.dp(10), 0);
        row.setMinimumHeight(Ui.dp(52));
        row.setBackground(Ui.ripple(accent, null, 14));
        if (glyph != null) row.addView(Ui.glyphView(activity, glyph, color, 22), Ui.margins(Ui.lp(Ui.dp(22), Ui.dp(22)), 0, 0, 16, 0));
        TextView t = Ui.text(activity, label, 16, Ui.TEXT);
        row.addView(t, Ui.lp(0, -2, 1));
        if (detail != null) {
            TextView d = Ui.text(activity, detail, 13, Ui.TEXT2);
            row.addView(d, Ui.margins(Ui.lp(-2, -2), 8, 0, 0, 0));
        }
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismiss();
                if (r != null) r.run();
            }
        });
        body.addView(row, Ui.lp(-1, -2));
        return this;
    }

    Sheet text(String s) {
        TextView t = Ui.text(activity, s, 14.5f, Ui.TEXT2);
        t.setLineSpacing(Ui.dp(3), 1f);
        body.addView(t, Ui.margins(Ui.lp(-1, -2), 2, 0, 2, 14));
        return this;
    }

    Sheet view(View v) {
        body.addView(v, Ui.lp(-1, -2));
        return this;
    }

    Sheet view(View v, LinearLayout.LayoutParams lp) {
        body.addView(v, lp);
        return this;
    }

    Sheet buttons(String primary, final Runnable onPrimary, String secondary, final Runnable onSecondary) {
        LinearLayout row = Ui.row(activity);
        if (secondary != null) {
            TextView b2 = Ui.button(activity, secondary, accent, false);
            b2.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    dismiss();
                    if (onSecondary != null) onSecondary.run();
                }
            });
            row.addView(b2, Ui.margins(Ui.lp(0, -2, 1), 0, 0, 10, 0));
        }
        TextView b = Ui.button(activity, primary, accent, true);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismiss();
                if (onPrimary != null) onPrimary.run();
            }
        });
        row.addView(b, Ui.lp(0, -2, 1));
        body.addView(row, Ui.margins(Ui.lp(-1, -2), 0, 10, 0, 0));
        return this;
    }

    /** Eingabefeld mit OK-Knopf. */
    Sheet input(String hint, String value, final TextResult result) {
        final EditText e = new EditText(activity);
        e.setText(value);
        e.setHint(hint);
        e.setTextColor(Ui.TEXT);
        e.setHintTextColor(Ui.TEXT3);
        e.setTextSize(17);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        e.setImeOptions(EditorInfo.IME_ACTION_DONE);
        e.setPadding(Ui.dp(16), Ui.dp(14), Ui.dp(16), Ui.dp(14));
        e.setBackground(Ui.rounded(0x14FFFFFF, 14, Ui.alpha(accent, 0.6f), 1.2f));
        e.setSelection(e.getText().length());
        body.addView(e, Ui.margins(Ui.lp(-1, -2), 0, 4, 0, 6));
        final Runnable submit = new Runnable() {
            @Override
            public void run() {
                String text = e.getText().toString();
                hideKeyboard(e);
                dismiss();
                result.onText(text);
            }
        };
        e.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                submit.run();
                return true;
            }
        });
        buttons("Übernehmen", submit, "Abbrechen", new Runnable() {
            @Override
            public void run() {
                hideKeyboard(e);
            }
        });
        e.requestFocus();
        e.postDelayed(new Runnable() {
            @Override
            public void run() {
                InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(e, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 250);
        return this;
    }

    private void hideKeyboard(View v) {
        InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
    }

    Sheet show() {
        current = this;
        host.addView(root, new FrameLayout.LayoutParams(-1, -1));
        host.setVisibility(View.VISIBLE);
        scrim.setAlpha(0f);
        scrim.animate().alpha(1f).setDuration(200).start();
        panel.setTranslationY(Ui.dp(500));
        panel.post(new Runnable() {
            @Override
            public void run() {
                panel.setTranslationY(panel.getHeight());
                panel.animate().translationY(0).setDuration(300).setInterpolator(new DecelerateInterpolator(2.2f)).start();
            }
        });
        return this;
    }

    void dismiss() {
        if (dismissing) return;
        dismissing = true;
        if (current == this) current = null;
        View focus = root.findFocus();
        if (focus != null) hideKeyboard(focus);
        scrim.animate().alpha(0f).setDuration(180).start();
        panel.animate().translationY(panel.getHeight() + Ui.dp(20)).setDuration(200)
            .setInterpolator(new DecelerateInterpolator()).setListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    remove();
                }
            }).start();
        if (onDismiss != null) onDismiss.run();
    }

    private void dismissNow() {
        if (current == this) current = null;
        if (!dismissing && onDismiss != null) onDismiss.run();
        dismissing = true;
        panel.animate().cancel();
        remove();
    }

    private void remove() {
        ViewGroup parent = (ViewGroup) root.getParent();
        if (parent != null) parent.removeView(root);
        if (host.getChildCount() == 0) host.setVisibility(View.GONE);
    }

    /** ScrollView mit Maximalhöhe (75 % des Bildschirms). */
    private static final class MaxScroll extends ScrollView {
        MaxScroll(Context c) {
            super(c);
        }

        @Override
        protected void onMeasure(int wSpec, int hSpec) {
            int max = (int) (getResources().getDisplayMetrics().heightPixels * 0.72f);
            int h = MeasureSpec.getSize(hSpec);
            if (MeasureSpec.getMode(hSpec) == MeasureSpec.UNSPECIFIED || h > max) hSpec = MeasureSpec.makeMeasureSpec(max, MeasureSpec.AT_MOST);
            super.onMeasure(wSpec, hSpec);
        }
    }
}

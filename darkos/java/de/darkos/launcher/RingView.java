package de.darkos.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;

/** Leuchtender Fortschrittsring (Akku, Speicher …) mit Wert in der Mitte. */
final class RingView extends View {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();
    private final Matrix rotate = new Matrix();
    private float progress;
    private int color = Ui.NEON[0];
    private float strokeDp;
    private String value = "", caption = "";
    private boolean pulsing;
    private boolean animations = true;

    RingView(Context c, float strokeDp, float textSp) {
        super(c);
        this.strokeDp = strokeDp;
        track.setStyle(Paint.Style.STROKE);
        track.setColor(0x1AFFFFFF);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        text.setTextAlign(Paint.Align.CENTER);
        text.setColor(Ui.TEXT);
        text.setTypeface(Ui.display(c, true));
        text.setTextSize(textSp * getResources().getDisplayMetrics().scaledDensity);
        sub.setTextAlign(Paint.Align.CENTER);
        sub.setColor(Ui.TEXT2);
        sub.setTextSize(textSp * 0.42f * getResources().getDisplayMetrics().scaledDensity);
        // Leuchtende Bögen brauchen vor Android 9 Software-Rendering
        if (Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    void set(float progress, int color, String value, String caption, boolean pulsing) {
        this.progress = Math.max(0f, Math.min(1f, progress));
        this.color = color;
        this.value = value == null ? "" : value;
        this.caption = caption == null ? "" : caption;
        this.pulsing = pulsing;
        animations = Ui.animationsEnabled(getContext());
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float s = Ui.dp(strokeDp);
        float pad = s / 2f + Ui.dp(4);
        oval.set(pad, pad, getWidth() - pad, getHeight() - pad);
        track.setStrokeWidth(s);
        c.drawArc(oval, 0, 360, false, track);

        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        SweepGradient g = new SweepGradient(cx, cy, new int[] {Ui.partner(color), color, Ui.partner(color)}, null);
        rotate.setRotate(-90, cx, cy);
        g.setLocalMatrix(rotate);
        arc.setShader(g);
        arc.setStrokeWidth(s);
        float glow = Ui.dp(6);
        if (pulsing && animations) {
            float t = (SystemClock.uptimeMillis() % 1600) / 1600f;
            glow = Ui.dp(4 + 6 * (0.5f + 0.5f * (float) Math.sin(t * Math.PI * 2)));
        }
        arc.setShadowLayer(glow, 0, 0, color);
        if (progress > 0f) c.drawArc(oval, -90, Math.max(1f, progress * 360f), false, arc);

        Paint.FontMetrics fm = text.getFontMetrics();
        float ty = caption.isEmpty() ? cy - (fm.ascent + fm.descent) / 2f : cy - (fm.ascent + fm.descent) / 2f - sub.getTextSize() * 0.45f;
        text.setShadowLayer(Ui.dp(8), 0, 0, Ui.alpha(color, 0.8f));
        c.drawText(value, cx, ty, text);
        if (!caption.isEmpty()) c.drawText(caption, cx, ty + sub.getTextSize() * 1.5f, sub);

        if (pulsing && animations && isShown()) postInvalidateDelayed(40);
    }
}

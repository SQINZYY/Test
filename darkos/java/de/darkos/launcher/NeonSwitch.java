package de.darkos.launcher;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.view.View;

/** Schalter im Neon-Stil. */
final class NeonSwitch extends View {
    interface Listener {
        void onChanged(boolean on);
    }

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private final int accent;
    private boolean on;
    private float pos;
    private Listener listener;

    NeonSwitch(Context c, int accent, boolean initial) {
        super(c);
        this.accent = accent;
        on = initial;
        pos = on ? 1f : 0f;
        setClickable(true);
        setFocusable(true);
        if (Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
        setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                setOn(!on, true);
                if (listener != null) listener.onChanged(on);
            }
        });
    }

    void setListener(Listener l) {
        listener = l;
    }

    boolean isOn() {
        return on;
    }

    void setOn(boolean value, boolean animated) {
        on = value;
        if (!animated) {
            pos = on ? 1f : 0f;
            invalidate();
            return;
        }
        ValueAnimator a = ValueAnimator.ofFloat(pos, on ? 1f : 0f);
        a.setDuration(180);
        a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator va) {
                pos = (Float) va.getAnimatedValue();
                invalidate();
            }
        });
        a.start();
    }

    @Override
    protected void onMeasure(int w, int h) {
        setMeasuredDimension(Ui.dp(54), Ui.dp(34));
    }

    @Override
    protected void onDraw(Canvas c) {
        float h = Ui.dp(26), w = Ui.dp(46);
        float left = (getWidth() - w) / 2f, top = (getHeight() - h) / 2f;
        r.set(left, top, left + w, top + h);
        paint.clearShadowLayer();
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Ui.mix(0x1AFFFFFF, Ui.alpha(accent, 0.35f), pos));
        c.drawRoundRect(r, h / 2f, h / 2f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Ui.dp(1.2f));
        paint.setColor(Ui.mix(0x33FFFFFF, accent, pos));
        c.drawRoundRect(r, h / 2f, h / 2f, paint);
        paint.setStyle(Paint.Style.FILL);
        float knob = h - Ui.dp(8);
        float cx = left + Ui.dp(4) + knob / 2f + (w - knob - Ui.dp(8)) * pos;
        paint.setColor(Ui.mix(0xFF8E8BA3, 0xFFFFFFFF, pos));
        if (pos > 0.5f) paint.setShadowLayer(Ui.dp(8), 0, 0, accent);
        c.drawCircle(cx, top + h / 2f, knob / 2f, paint);
    }
}

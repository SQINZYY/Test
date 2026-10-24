package de.darkos.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** Seitenanzeige: der aktive Punkt wird zur leuchtenden Pille. */
final class PageDots extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private int count = 2;
    private float position = 1f;
    private int accent = Ui.NEON[0];

    PageDots(Context c) {
        super(c);
        if (android.os.Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    void setAccent(int a) {
        accent = a;
        invalidate();
    }

    void setPosition(float p) {
        position = p;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float dot = Ui.dp(6), gap = Ui.dp(8), wide = Ui.dp(20);
        float total = dot * (count - 1) + wide + gap * (count - 1);
        float x = (getWidth() - total) / 2f, cy = getHeight() / 2f;
        for (int i = 0; i < count; i++) {
            float a = Math.max(0f, 1f - Math.abs(position - i));
            float w = dot + (wide - dot) * a;
            r.set(x, cy - dot / 2f, x + w, cy + dot / 2f);
            paint.setColor(Ui.mix(0x40FFFFFF, accent, a));
            if (a > 0.5f) paint.setShadowLayer(Ui.dp(6), 0, 0, accent);
            else paint.clearShadowLayer();
            c.drawRoundRect(r, dot / 2f, dot / 2f, paint);
            x += w + gap;
        }
    }
}

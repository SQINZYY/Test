package de.darkos.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

import java.util.Random;

/** Animierter Hintergrund: Neon-Grid, Nebel, Partikel oder reines Schwarz. */
final class NeonBackground extends View {
    private static final int FRAME_MS = 33;
    private static final int STARS = 70;
    private static final int PARTICLES = 42;

    private String mode = Prefs.BG_GRID;
    private int accent = Ui.NEON[0];
    private boolean animate = true;
    private boolean running;
    private float offset = 1f;
    private final long start = SystemClock.uptimeMillis();

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Matrix matrix = new Matrix();
    private final float[] starX = new float[STARS], starY = new float[STARS], starR = new float[STARS], starP = new float[STARS];
    private final float[] px = new float[PARTICLES], py = new float[PARTICLES], vx = new float[PARTICLES], vy = new float[PARTICLES];
    private RadialGradient[] blobs;
    private LinearGradient floorShader;
    private RadialGradient horizonGlow;
    private long lastParticleTime;

    NeonBackground(Context c) {
        super(c);
        Random r = new Random(7);
        for (int i = 0; i < STARS; i++) {
            starX[i] = r.nextFloat();
            starY[i] = r.nextFloat();
            starR[i] = 0.5f + r.nextFloat() * 1.1f;
            starP[i] = r.nextFloat() * 6.28f;
        }
        for (int i = 0; i < PARTICLES; i++) {
            px[i] = r.nextFloat();
            py[i] = r.nextFloat();
            vx[i] = (r.nextFloat() - 0.5f) * 0.012f;
            vy[i] = -0.006f - r.nextFloat() * 0.014f;
        }
        linePaint.setStyle(Paint.Style.STROKE);
    }

    void configure(String mode, int accent, boolean animate) {
        this.mode = mode;
        this.accent = accent;
        this.animate = animate;
        blobs = null;
        floorShader = null;
        horizonGlow = null;
        invalidate();
    }

    /** Läuft nur, solange der Startbildschirm sichtbar ist (spart Akku). */
    void setRunning(boolean run) {
        if (running == run) return;
        running = run;
        lastParticleTime = SystemClock.uptimeMillis();
        invalidate();
    }

    /** Seitenposition (0 = Widgets, 1 = Start) für einen leichten Parallax-Effekt. */
    void setOffset(float o) {
        offset = o;
        if (!running || !animate) invalidate();
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        blobs = null;
        floorShader = null;
        horizonGlow = null;
    }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        c.drawColor(Ui.BG);
        if (w == 0 || h == 0 || Prefs.BG_BLACK.equals(mode)) return;
        boolean live = running && animate;
        float t = live ? (SystemClock.uptimeMillis() - start) / 1000f : 12f;

        if (Prefs.BG_NEBULA.equals(mode)) drawNebula(c, w, h, t);
        else if (Prefs.BG_PARTICLES.equals(mode)) drawParticles(c, w, h, t, live);
        else drawGrid(c, w, h, t);

        if (live) postInvalidateDelayed(FRAME_MS);
    }

    private void drawStars(Canvas c, int w, float maxY, float t) {
        paint.setShader(null);
        for (int i = 0; i < STARS; i++) {
            float y = starY[i] * maxY;
            float tw = 0.35f + 0.65f * (0.5f + 0.5f * (float) Math.sin(t * 1.3f + starP[i]));
            paint.setColor(Ui.alpha(i % 5 == 0 ? accent : 0xFFFFFFFF, 0.55f * tw));
            c.drawCircle(starX[i] * w, y, starR[i] * Ui.density * 0.6f, paint);
        }
    }

    /** Synthwave-Boden: Fluchtpunkt-Linien und heranfahrende Querlinien. */
    private void drawGrid(Canvas c, int w, int h, float t) {
        float horizon = h * 0.56f;
        float vp = w / 2f + (offset - 1f) * w * 0.12f;
        drawStars(c, w, horizon * 0.95f, t);

        if (horizonGlow == null) {
            horizonGlow = new RadialGradient(0, 0, w * 0.85f,
                new int[] {Ui.alpha(accent, 0.42f), Ui.alpha(Ui.partner(accent), 0.12f), 0x00000000},
                new float[] {0f, 0.45f, 1f}, Shader.TileMode.CLAMP);
            floorShader = new LinearGradient(0, horizon, 0, h,
                new int[] {Ui.alpha(accent, 0.0f), Ui.alpha(accent, 0.22f), Ui.alpha(accent, 0.55f)},
                new float[] {0f, 0.35f, 1f}, Shader.TileMode.CLAMP);
        }
        float pulse = 0.9f + 0.1f * (float) Math.sin(t * 0.8f);
        matrix.setScale(1f, 0.45f * pulse);
        matrix.postTranslate(vp, horizon);
        horizonGlow.setLocalMatrix(matrix);
        paint.setShader(horizonGlow);
        c.drawRect(0, 0, w, h, paint);
        paint.setShader(null);

        // Horizontlinie
        paint.setShader(new LinearGradient(0, 0, w, 0,
            new int[] {0x00000000, Ui.alpha(accent, 0.9f), 0x00000000}, null, Shader.TileMode.CLAMP));
        c.drawRect(0, horizon - Ui.dp(0.75f), w, horizon + Ui.dp(0.75f), paint);
        paint.setShader(null);

        linePaint.setShader(floorShader);
        linePaint.setStrokeWidth(Math.max(1f, Ui.dp(1.1f)));
        int lines = 22;
        for (int i = -lines; i <= lines; i++) {
            float bx = vp + i * w * 0.16f;
            c.drawLine(vp + i * w * 0.012f, horizon, bx, h, linePaint);
        }
        float phase = (t * 0.22f) % 1f;
        int rows = 14;
        for (int i = 0; i < rows; i++) {
            float d = (i + phase) / rows;
            float y = horizon + (h - horizon) * d * d * d;
            c.drawLine(0, y, w, y, linePaint);
        }
        linePaint.setShader(null);
    }

    /** Langsam wandernde Farbwolken. */
    private void drawNebula(Canvas c, int w, int h, float t) {
        drawStars(c, w, h, t);
        if (blobs == null) {
            int[] colors = {accent, Ui.partner(accent), Ui.NEON[Ui.CYAN]};
            float[] alphas = {0.34f, 0.24f, 0.14f};
            blobs = new RadialGradient[3];
            for (int i = 0; i < 3; i++) {
                blobs[i] = new RadialGradient(0, 0, w * 0.8f,
                    new int[] {Ui.alpha(colors[i], alphas[i]), Ui.alpha(colors[i], alphas[i] * 0.35f), 0x00000000},
                    new float[] {0f, 0.5f, 1f}, Shader.TileMode.CLAMP);
            }
        }
        float par = (offset - 1f) * w * 0.08f;
        float[][] path = {{0.25f, 0.3f, 0.11f, 0.07f}, {0.8f, 0.62f, 0.07f, 0.09f}, {0.45f, 0.9f, 0.05f, 0.06f}};
        for (int i = 0; i < 3; i++) {
            float x = w * (path[i][0] + 0.18f * (float) Math.sin(t * path[i][2] + i * 2.1f)) + par;
            float y = h * (path[i][1] + 0.12f * (float) Math.cos(t * path[i][3] + i * 1.3f));
            matrix.setTranslate(x, y);
            blobs[i].setLocalMatrix(matrix);
            paint.setShader(blobs[i]);
            c.drawRect(0, 0, w, h, paint);
        }
        paint.setShader(null);
    }

    /** Aufsteigende Lichtpunkte, nahe Punkte werden verbunden. */
    private void drawParticles(Canvas c, int w, int h, float t, boolean live) {
        long now = SystemClock.uptimeMillis();
        float dt = live ? Math.min(0.1f, (now - lastParticleTime) / 1000f) : 0f;
        lastParticleTime = now;
        float par = (offset - 1f) * w * 0.06f;
        for (int i = 0; i < PARTICLES; i++) {
            px[i] += vx[i] * dt;
            py[i] += vy[i] * dt;
            if (py[i] < -0.05f) py[i] += 1.1f;
            if (px[i] < -0.05f) px[i] += 1.1f;
            if (px[i] > 1.05f) px[i] -= 1.1f;
        }
        float maxD = w * 0.28f;
        linePaint.setStrokeWidth(Math.max(1f, Ui.dp(0.8f)));
        for (int i = 0; i < PARTICLES; i++) {
            float ax = px[i] * w + par, ay = py[i] * h;
            for (int j = i + 1; j < PARTICLES; j++) {
                float bx = px[j] * w + par, by = py[j] * h;
                float dx = ax - bx, dy = ay - by;
                float d2 = dx * dx + dy * dy;
                if (d2 < maxD * maxD) {
                    float a = 1f - (float) Math.sqrt(d2) / maxD;
                    linePaint.setColor(Ui.alpha(accent, 0.30f * a));
                    c.drawLine(ax, ay, bx, by, linePaint);
                }
            }
        }
        paint.setShader(null);
        for (int i = 0; i < PARTICLES; i++) {
            float x = px[i] * w + par, y = py[i] * h;
            float tw = 0.6f + 0.4f * (float) Math.sin(t * 2f + i);
            int col = i % 4 == 0 ? Ui.partner(accent) : accent;
            paint.setColor(Ui.alpha(col, 0.18f * tw));
            c.drawCircle(x, y, Ui.dp(6), paint);
            paint.setColor(Ui.alpha(Ui.mix(col, 0xFFFFFFFF, 0.5f), 0.9f * tw));
            c.drawCircle(x, y, Ui.dp(1.6f), paint);
        }
    }
}

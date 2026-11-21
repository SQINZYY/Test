package de.darkos.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Zeichnet App-Icons im Hintergrund und hält sie im Speicher. */
final class Icons {
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService exec = Executors.newFixedThreadPool(2);
    private final Map<ImageView, String> pending = new WeakHashMap<>();
    private final LruCache<String, Bitmap> cache;
    private Apps apps = Apps.empty();
    private IconFactory.Spec spec;
    private int generation;
    final int size;

    Icons(Context c, int sizePx) {
        context = c.getApplicationContext();
        size = sizePx;
        spec = IconFactory.Spec.from(Prefs.get(c));
        int max = (int) Math.min(Runtime.getRuntime().maxMemory() / 6, 64L * 1024 * 1024);
        cache = new LruCache<String, Bitmap>(max) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return value.getByteCount();
            }
        };
    }

    void setApps(Apps a) {
        apps = a;
    }

    /** Nach Änderungen am Design: alle Icons neu zeichnen. */
    void invalidateAll() {
        generation++;
        spec = IconFactory.Spec.from(Prefs.get(context));
        cache.evictAll();
    }

    /** Nach Änderungen an einer App (Icon-Editor, Umbenennen). */
    void invalidate(String appKey) {
        cache.remove(appKey + "#" + generation);
    }

    Bitmap cached(Apps.App app) {
        return cache.get(app.key + "#" + generation);
    }

    void load(final Apps.App app, final ImageView target) {
        final String k = app.key + "#" + generation;
        Bitmap b = cache.get(k);
        pending.put(target, k);
        if (b != null) {
            target.setImageBitmap(b);
            return;
        }
        target.setImageDrawable(null);
        final Apps snapshot = apps;
        final IconFactory.Spec s = spec;
        final int gen = generation;
        exec.execute(new Runnable() {
            @Override
            public void run() {
                Bitmap cachedNow = cache.get(k);
                final Bitmap bm = cachedNow != null ? cachedNow : safeRender(app, snapshot, s);
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (gen == generation) cache.put(k, bm);
                        if (k.equals(pending.get(target))) {
                            target.setImageBitmap(bm);
                            target.setAlpha(0f);
                            target.animate().alpha(1f).setDuration(180).start();
                        }
                    }
                });
            }
        });
    }

    /** Icons schon einmal vorbereiten, damit das App-Menü sofort fertig aussieht. */
    void prewarm(final Iterable<Apps.App> list) {
        final Apps snapshot = apps;
        final IconFactory.Spec s = spec;
        final int gen = generation;
        exec.execute(new Runnable() {
            @Override
            public void run() {
                for (final Apps.App app : list) {
                    if (gen != generation) return;
                    final String k = app.key + "#" + gen;
                    if (cache.get(k) != null) continue;
                    final Bitmap bm = safeRender(app, snapshot, s);
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            if (gen == generation && cache.get(k) == null) cache.put(k, bm);
                        }
                    });
                }
            }
        });
    }

    private Bitmap safeRender(Apps.App app, Apps snapshot, IconFactory.Spec s) {
        try {
            return IconFactory.render(context, app, snapshot, s, size);
        } catch (RuntimeException | OutOfMemoryError e) {
            // Defekte Icons einzelner Apps sollen nicht den ganzen Launcher stören
            return Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        }
    }

    void shutdown() {
        exec.shutdownNow();
    }
}

package androidx.tracing;

/** Ersatz für androidx.tracing (Tracing ist im Test unnötig). */
public final class Trace {
    private Trace() {
    }

    public static void beginSection(String label) {
    }

    public static void endSection() {
    }

    public static void forceEnableAppTracing() {
    }

    public static boolean isEnabled() {
        return false;
    }
}

// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.runner.intent;

public final class IntentStubberRegistry {
    private static IntentStubber instance;

    private IntentStubberRegistry() {}

    public static void load(IntentStubber s) {
        instance = s;
    }

    public static boolean isLoaded() {
        return instance != null;
    }

    public static IntentStubber getInstance() {
        return instance;
    }

    public static void reset() {
        instance = null;
    }
}

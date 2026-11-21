// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.runner.intent;

public final class IntentMonitorRegistry {
    private static IntentMonitor instance;

    private IntentMonitorRegistry() {}

    public static void registerInstance(IntentMonitor m) {
        instance = m;
    }

    public static IntentMonitor getInstance() {
        return instance;
    }
}

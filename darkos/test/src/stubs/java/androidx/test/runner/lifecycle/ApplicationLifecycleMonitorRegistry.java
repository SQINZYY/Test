// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.runner.lifecycle;

public final class ApplicationLifecycleMonitorRegistry {
    private static ApplicationLifecycleMonitor instance;

    private ApplicationLifecycleMonitorRegistry() {}

    public static void registerInstance(ApplicationLifecycleMonitor m) {
        instance = m;
    }

    public static ApplicationLifecycleMonitor getInstance() {
        return instance;
    }
}

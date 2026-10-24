// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.platform.app;

import android.app.Instrumentation;
import android.os.Bundle;

public final class InstrumentationRegistry {
    private static Instrumentation instrumentation;
    private static Bundle arguments = new Bundle();

    private InstrumentationRegistry() {}

    public static void registerInstance(Instrumentation i, Bundle args) {
        instrumentation = i;
        arguments = args == null ? new Bundle() : args;
    }

    public static Instrumentation getInstrumentation() {
        if (instrumentation == null) throw new IllegalStateException("No instrumentation registered");
        return instrumentation;
    }

    public static Bundle getArguments() {
        return arguments;
    }
}

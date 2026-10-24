// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.internal.runner.lifecycle;

import android.app.Application;

import androidx.test.runner.lifecycle.ApplicationLifecycleMonitor;
import androidx.test.runner.lifecycle.ApplicationStage;

public final class ApplicationLifecycleMonitorImpl implements ApplicationLifecycleMonitor {
    public ApplicationLifecycleMonitorImpl() {}

    public void signalLifecycleChange(Application app, ApplicationStage stage) {
    }
}

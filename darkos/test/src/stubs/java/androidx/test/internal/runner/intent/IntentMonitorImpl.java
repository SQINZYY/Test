// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.internal.runner.intent;

import android.content.Intent;

import androidx.test.runner.intent.IntentMonitor;

public final class IntentMonitorImpl implements IntentMonitor {
    public IntentMonitorImpl() {}

    public void signalIntent(Intent intent) {
    }
}

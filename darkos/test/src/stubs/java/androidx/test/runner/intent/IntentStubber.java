// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.runner.intent;

import android.app.Instrumentation;
import android.content.Intent;

public interface IntentStubber {
    Instrumentation.ActivityResult getActivityResultForIntent(Intent intent);
}

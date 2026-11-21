// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.runner.lifecycle;

import android.app.Activity;

public interface ActivityLifecycleCallback {
    void onActivityLifecycleChanged(Activity activity, Stage stage);
}

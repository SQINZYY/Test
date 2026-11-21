// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.espresso;

public interface IdlingResource {
    String getName();

    boolean isIdleNow();

    void registerIdleTransitionCallback(ResourceCallback callback);

    interface ResourceCallback {
        void onTransitionToIdle();
    }
}

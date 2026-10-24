// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.internal.platform.util;

public final class TestOutputEmitter {
    private TestOutputEmitter() {}

    public static void dumpThreadStates(String name) {
    }
}

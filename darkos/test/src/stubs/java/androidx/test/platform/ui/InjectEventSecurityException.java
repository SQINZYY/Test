// Minimaler Ersatz für androidx.test:monitor (liegt nur im Google-Maven-Repo), nur für die Robolectric-Tests.
package androidx.test.platform.ui;

public class InjectEventSecurityException extends Exception {
    public InjectEventSecurityException(String message) {
        super(message);
    }

    public InjectEventSecurityException(Throwable cause) {
        super(cause);
    }
}

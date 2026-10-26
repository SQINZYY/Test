package androidx.annotation;

/** Ersatz für androidx.annotation (nur zum Übersetzen von androidx.test:monitor für Robolectric). */
public @interface RestrictTo {
    Scope[] value();

    enum Scope { LIBRARY, LIBRARY_GROUP, LIBRARY_GROUP_PREFIX, GROUP_ID, TESTS, SUBCLASSES }
}

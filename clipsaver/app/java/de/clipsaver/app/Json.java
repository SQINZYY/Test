package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Null-sicheres Lesen von JSON. Android-org.json und das org.json der Tests behandeln JSON-null
 * unterschiedlich (optString liefert einmal "null", einmal den Standardwert), daher alles über diese Helfer.
 */
final class Json {

    private Json() {
    }

    static String str(JSONObject o, String key) {
        if (o == null || !o.has(key) || o.isNull(key)) return null;
        String s = String.valueOf(o.opt(key));
        return s.length() == 0 ? null : s;
    }

    static String str(JSONObject o, String key, String fallback) {
        String s = str(o, key);
        return s == null ? fallback : s;
    }

    static double num(JSONObject o, String key) {
        if (o == null || !o.has(key) || o.isNull(key)) return 0;
        Object v = o.opt(key);
        if (v instanceof Number) return ((Number) v).doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static long lng(JSONObject o, String key) {
        return (long) num(o, key);
    }

    /** Folgt einem Pfad aus Objekt-Schlüsseln, z. B. obj(item, "video", "playAddr"). */
    static JSONObject obj(JSONObject o, String... path) {
        JSONObject cur = o;
        for (String k : path) {
            if (cur == null) return null;
            cur = cur.optJSONObject(k);
        }
        return cur;
    }

    static JSONArray arr(JSONObject o, String key) {
        return o == null ? null : o.optJSONArray(key);
    }

    /** Erster nicht leerer String eines JSON-Arrays von Strings. */
    static String first(JSONArray a) {
        if (a == null) return null;
        for (int i = 0; i < a.length(); i++) {
            if (!a.isNull(i) && a.optString(i, "").length() > 0) return a.optString(i);
        }
        return null;
    }
}

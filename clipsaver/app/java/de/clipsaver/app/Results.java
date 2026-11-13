package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Führt die Ergebnisse der verschiedenen Ausleser für einen Link zusammen: yt-dlp (Video mit Qualitätsstufen),
 * gallery-dl bzw. die eigenen Ausleser (Bilder, Galerien, direkte Videos). Ein Beitrag mit Video und Bildern
 * zeigt so beides. (Ohne Android-Klassen, damit testbar.)
 */
final class Results {

    private Results() {
    }

    /** Von zwei Medien-Ergebnissen das mit mehr Dateien; bei Gleichstand das erste (eigener Ausleser). */
    static JSONObject richer(JSONObject a, JSONObject b) {
        if (a == null) return b;
        if (b == null) return a;
        return count(b) > count(a) ? b : a;
    }

    static int count(JSONObject r) {
        if (r == null) return 0;
        JSONArray images = r.optJSONArray("images");
        JSONArray videos = r.optJSONArray("videos");
        int n = images == null ? 0 : images.length();
        if ("video".equals(r.optString("kind")) && videos != null && videos.length() > 0) n++;
        return n;
    }

    /**
     * video: Ergebnis von yt-dlp (oder null), media: Bilder/Galerie/direktes Video (oder null).
     * Liefert das Ergebnis für die Oberfläche oder null, wenn beide nichts haben.
     */
    static JSONObject merge(JSONObject video, JSONObject media) throws Exception {
        String kind = video == null ? null : video.optString("kind");
        if ("video".equals(kind) || "audio".equals(kind)) {
            JSONArray images = new JSONArray();
            JSONArray list = media == null ? null : media.optJSONArray("images");
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject item = list.optJSONObject(i);
                // Videos lädt yt-dlp in der gewählten Qualität; Vorschaubilder des Videos sind keine Beitragsbilder
                if (item != null && "image".equals(item.optString("type", "image")) && !item.optBoolean("videoPoster")) images.put(item);
            }
            if (images.length() > 0) {
                video.put("images", images);
                video.put("headers", media.optJSONObject("headers") != null ? media.optJSONObject("headers") : new JSONObject());
                if (media.has("gdlUrl")) {
                    video.put("gdlUrl", media.optString("gdlUrl"));
                    video.put("gdlRange", media.optBoolean("gdlRange"));
                }
            }
            return video;
        }
        // Galerie (z. B. Instagram-Karussell, Beitrag mit mehreren Videos): die Einzelteile samt Bildern zeigen
        if ("playlist".equals(kind) && count(media) > 0 && !"video".equals(media.optString("kind"))) return media;
        if ("playlist".equals(kind)) return video;
        if (count(media) > 0) return media;
        return null;
    }

    /** Bevorzugte Fehlermeldung: eine mit Anmelde-Hinweis, sonst die erste vorhandene. */
    static String pickError(String... messages) {
        String first = null;
        for (String m : messages) {
            if (m == null || m.length() == 0) continue;
            if (first == null) first = m;
            String l = m.toLowerCase(java.util.Locale.ROOT);
            if (l.contains("anmeld") || l.contains("privat") || l.contains("altersbeschränkt")) return m;
        }
        return first;
    }
}

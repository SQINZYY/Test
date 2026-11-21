package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Bilder aus YouTube-Community-Beiträgen (youtube.com/post/…), auch Beiträge mit mehreren Bildern.
 * yt-dlp lädt nur Videos, deshalb wird die Seite hier selbst gelesen: Sie enthält ytInitialData mit allen
 * Bildern (backstageImageRenderer). (Ohne Android-Klassen, damit testbar.)
 */
final class YouTubePosts {

    private YouTubePosts() {
    }

    static JSONObject extract(String url, Http http) throws Exception {
        String id = Links.youTubePostId(url);
        if (id == null) throw new IOException("Kein YouTube-Beitrag im Link gefunden");
        String pageUrl = "https://www.youtube.com/post/" + id;
        // Überspringt die Einwilligungsseite (consent.youtube.com), die in der EU sonst zuerst kommt
        http.setCookie("youtube.com", "SOCS", "CAI");
        Http.Response r = http.get(pageUrl + "?hl=de", null);
        JSONObject data = initialData(r.body);
        if (data == null) throw new IOException("YouTube-Beitrag konnte nicht gelesen werden (HTTP " + r.code + ")");
        return parse(data, pageUrl);
    }

    /** Sucht "ytInitialData = {…};" im HTML und liest das JSON-Objekt. */
    static JSONObject initialData(String html) {
        if (html == null) return null;
        for (String marker : new String[]{"var ytInitialData = ", "window[\"ytInitialData\"] = ", "ytInitialData = "}) {
            int i = html.indexOf(marker);
            if (i < 0) continue;
            String json = jsonObjectAt(html, html.indexOf('{', i));
            if (json == null) continue;
            try {
                return new JSONObject(json);
            } catch (Exception ignored) {
                // nächste Schreibweise probieren
            }
        }
        return null;
    }

    /** Schneidet ein JSON-Objekt ab der Position einer "{" aus (berücksichtigt Strings und Escapes). */
    static String jsonObjectAt(String s, int start) {
        if (start < 0) return null;
        int depth = 0;
        boolean inString = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inString) {
                if (c == '\\') i++;
                else if (c == '"') inString = false;
            } else if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}' && --depth == 0) {
                return s.substring(start, i + 1);
            }
        }
        return null;
    }

    static JSONObject parse(JSONObject data, String pageUrl) throws Exception {
        Map<String, JSONObject> images = new LinkedHashMap<>();
        JSONObject[] post = new JSONObject[1];
        String[] videoId = new String[1];
        walk(data, images, post, videoId);

        JSONObject res = new JSONObject();
        res.put("source", "youtube-post");
        res.put("platform", "youtube");
        res.put("pageUrl", pageUrl);
        res.put("kind", "images");
        String text = post[0] == null ? null : text(post[0].optJSONObject("contentText"));
        res.put("title", text == null || text.length() == 0 ? "YouTube-Beitrag" : shorten(text, 100));
        String author = post[0] == null ? null : text(post[0].optJSONObject("authorText"));
        if (author != null) res.put("uploader", author);
        JSONArray list = new JSONArray();
        for (JSONObject img : images.values()) list.put(img);
        res.put("images", list);
        if (list.length() > 0) res.put("thumbnail", list.getJSONObject(0).getString("url"));
        if (videoId[0] != null) res.put("videoId", videoId[0]);
        if (list.length() == 0 && videoId[0] == null) throw new IOException("In diesem Beitrag sind keine Bilder");
        return res;
    }

    private static void walk(Object node, Map<String, JSONObject> images, JSONObject[] post, String[] videoId) throws Exception {
        if (node instanceof JSONArray) {
            JSONArray a = (JSONArray) node;
            for (int i = 0; i < a.length(); i++) walk(a.opt(i), images, post, videoId);
            return;
        }
        if (!(node instanceof JSONObject)) return;
        JSONObject o = (JSONObject) node;
        JSONObject img = o.optJSONObject("backstageImageRenderer");
        if (img != null) addImage(Json.arr(Json.obj(img, "image"), "thumbnails"), images);
        JSONObject p = o.optJSONObject("backstagePostRenderer");
        if (p != null && post[0] == null) post[0] = p;
        JSONObject attachment = o.optJSONObject("backstageAttachment");
        if (attachment != null && videoId[0] == null) {
            videoId[0] = Json.str(Json.obj(attachment, "videoRenderer"), "videoId");
        }
        Iterator<String> keys = o.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            // Kommentare und Empfehlungen enthalten keine Beitragsbilder
            if (k.equals("frameworkUpdates") || k.equals("responseContext")) continue;
            Object v = o.opt(k);
            if (v instanceof JSONObject || v instanceof JSONArray) walk(v, images, post, videoId);
        }
    }

    private static void addImage(JSONArray thumbs, Map<String, JSONObject> images) throws Exception {
        if (thumbs == null) return;
        JSONObject best = null;
        for (int i = 0; i < thumbs.length(); i++) {
            JSONObject t = thumbs.optJSONObject(i);
            if (t != null && Json.str(t, "url") != null && (best == null || Json.num(t, "width") > Json.num(best, "width"))) best = t;
        }
        if (best == null) return;
        String url = best.getString("url");
        if (url.startsWith("//")) url = "https:" + url;
        String full = fullSize(url);
        String key = full;
        if (images.containsKey(key)) return;
        JSONObject o = new JSONObject();
        o.put("url", full);
        o.put("fallback", full.equals(url) ? new JSONArray() : new JSONArray().put(url));
        o.put("width", Json.lng(best, "width"));
        o.put("height", Json.lng(best, "height"));
        images.put(key, o);
    }

    /**
     * Bilder auf yt3.ggpht.com / googleusercontent.com tragen die Größe hinter dem "=" (z. B. "=s1080-c-…").
     * "=s0" liefert das Original in voller Auflösung.
     */
    static String fullSize(String url) {
        String h = Links.host(url);
        if (!(h.endsWith("ggpht.com") || h.endsWith("googleusercontent.com"))) return url;
        // Größenangabe beginnt beim ersten "=" im letzten Pfadteil ("…/ID=s1080-c-fcrop64=1,…")
        int slash = url.lastIndexOf('/');
        int eq = url.indexOf('=', slash);
        return (eq < 0 ? url : url.substring(0, eq)) + "=s0";
    }

    private static String text(JSONObject t) {
        if (t == null) return null;
        String simple = Json.str(t, "simpleText");
        if (simple != null) return simple;
        JSONArray runs = t.optJSONArray("runs");
        if (runs == null) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < runs.length(); i++) {
            JSONObject r = runs.optJSONObject(i);
            if (r != null) sb.append(Json.str(r, "text", ""));
        }
        return sb.toString().trim();
    }

    private static String shorten(String s, int max) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() <= max ? s : s.substring(0, max - 1).trim() + "…";
    }
}

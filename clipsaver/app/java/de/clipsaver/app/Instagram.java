package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bilder (auch Karussells mit mehreren Bildern) und Videos eines Instagram-Beitrags über die öffentliche
 * Einbettungsseite (instagram.com/p/…/embed/captioned/) – ohne Anmeldung. Die Seite enthält die Beitragsdaten
 * (shortcode_media) als JSON, sonst wenigstens das erste Bild als &lt;img class="EmbeddedMediaImage"&gt;.
 * (Ohne Android-Klassen, damit testbar.)
 */
final class Instagram {

    private static final Pattern EMBED_IMG = Pattern.compile("<img[^>]*class=\"[^\"]*EmbeddedMediaImage[^\"]*\"[^>]*>", Pattern.CASE_INSENSITIVE);

    private Instagram() {
    }

    static JSONObject extract(String code, Http http) throws Exception {
        String page = "https://www.instagram.com/p/" + code + "/";
        Http.Response r = http.get(page + "embed/captioned/", null);
        if (r.code >= 400) throw new IOException("Instagram hat die Anfrage abgelehnt (HTTP " + r.code + ")");
        return parseEmbed(r.body, page);
    }

    static JSONObject parseEmbed(String html, String pageUrl) throws Exception {
        JSONObject media = shortcodeMedia(html);
        JSONArray items = new JSONArray();
        String title = null, uploader = null;
        if (media != null) {
            JSONArray edges = Json.arr(Json.obj(media, "edge_sidecar_to_children"), "edges");
            if (edges != null && edges.length() > 0) {
                for (int i = 0; i < edges.length(); i++) {
                    JSONObject node = Json.obj(edges.optJSONObject(i), "node");
                    if (node != null) addNode(node, items);
                }
            } else {
                addNode(media, items);
            }
            JSONArray caption = Json.arr(Json.obj(media, "edge_media_to_caption"), "edges");
            if (caption != null && caption.length() > 0) title = Json.str(Json.obj(caption.optJSONObject(0), "node"), "text");
            uploader = Json.str(Json.obj(media, "owner"), "username");
        }
        if (items.length() == 0) {
            // Ersatz: das sichtbare Bild der Einbettung, größte Fassung aus srcset
            Matcher m = EMBED_IMG.matcher(html);
            if (m.find()) {
                String best = largestFromSrcset(PageMedia.attr(m.group(), "srcset"));
                if (best == null) best = PageMedia.attr(m.group(), "src");
                if (best != null) {
                    items.put(new JSONObject().put("type", "image").put("url", best).put("fallback", new JSONArray()).put("via", "files"));
                }
                if (title == null) title = PageMedia.attr(m.group(), "alt");
            }
        }
        if (items.length() == 0) throw new IOException("Instagram zeigt diesen Beitrag nur angemeldet");

        JSONObject res = new JSONObject();
        res.put("source", "instagram-web");
        res.put("platform", "instagram");
        res.put("pageUrl", pageUrl);
        String t = title == null ? "" : title.replaceAll("\\s+", " ").trim();
        res.put("title", t.length() > 0 ? (t.length() > 100 ? t.substring(0, 99).trim() + "…" : t)
                : uploader != null ? "Beitrag von @" + uploader : "Instagram-Beitrag");
        if (uploader != null) res.put("uploader", "@" + uploader);
        JSONObject first = items.getJSONObject(0);
        res.put("thumbnail", first.optString("thumb", first.getString("url")));
        res.put("headers", new JSONObject());
        for (int i = 0; i < items.length(); i++) {
            if (items.getJSONObject(i).optBoolean("videoPoster")) {
                res.put("note", "Das Video zeigt Instagram ohne Anmeldung nur als Vorschaubild. Melde dich unter „Mehr → Anmeldung“ bei Instagram an.");
                break;
            }
        }
        boolean onlyVideo = items.length() == 1 && "video".equals(first.getString("type"));
        if (onlyVideo) {
            res.put("kind", "video");
            res.put("videos", new JSONArray().put(new JSONObject().put("url", first.getString("url")).put("fallback", new JSONArray())
                    .put("width", first.optLong("width")).put("height", first.optLong("height"))
                    .put("res", Math.min(first.optLong("width"), first.optLong("height")))));
        } else {
            res.put("kind", "images");
            res.put("images", items);
        }
        return res;
    }

    private static void addNode(JSONObject node, JSONArray items) throws Exception {
        JSONObject dim = node.optJSONObject("dimensions");
        String image = bestResource(node.optJSONArray("display_resources"));
        if (image == null) image = Json.str(node, "display_url", Json.str(node, "display_src"));
        String video = Json.str(node, "video_url");
        JSONObject o = new JSONObject();
        if (node.optBoolean("is_video") && video != null) {
            o.put("type", "video");
            o.put("url", video);
            if (image != null) o.put("thumb", image);
        } else if (image != null) {
            o.put("type", "image");
            o.put("url", image);
            // Video, dessen Adresse die Einbettung nicht verrät: nur das Vorschaubild ist bekannt
            if (node.optBoolean("is_video")) o.put("videoPoster", true);
        } else {
            return;
        }
        o.put("fallback", new JSONArray());
        o.put("width", Json.lng(dim, "width"));
        o.put("height", Json.lng(dim, "height"));
        o.put("via", "files");
        items.put(o);
    }

    private static String bestResource(JSONArray resources) {
        String best = null;
        double bestW = -1;
        for (int i = 0; resources != null && i < resources.length(); i++) {
            JSONObject r = resources.optJSONObject(i);
            String src = Json.str(r, "src");
            if (src != null && Json.num(r, "config_width") > bestW) {
                best = src;
                bestW = Json.num(r, "config_width");
            }
        }
        return best;
    }

    /** "url 640w, url 1080w" → Adresse mit der größten Breite. */
    static String largestFromSrcset(String srcset) {
        if (srcset == null) return null;
        String best = null;
        int bestW = -1;
        for (String part : srcset.split(",\\s*(?=https?:)")) {
            String[] p = part.trim().split("\\s+");
            if (p.length == 0 || !p[0].startsWith("http")) continue;
            int w = 0;
            if (p.length > 1 && p[1].endsWith("w")) {
                try {
                    w = Integer.parseInt(p[1].substring(0, p[1].length() - 1));
                } catch (NumberFormatException ignored) {
                    // ohne Breite
                }
            }
            if (w > bestW) {
                bestW = w;
                best = p[0];
            }
        }
        return best;
    }

    /** Sucht shortcode_media in contextJSON (Text mit JSON), __additionalDataLoaded(…) oder direkt im HTML. */
    static JSONObject shortcodeMedia(String html) {
        int ctx = html.indexOf("\"contextJSON\":\"");
        if (ctx >= 0) {
            String literal = stringLiteralAt(html, ctx + "\"contextJSON\":".length());
            try {
                JSONObject c = new JSONObject(new JSONArray("[" + literal + "]").getString(0));
                JSONObject m = Json.obj(c, "gql_data", "shortcode_media");
                if (m == null) m = Json.obj(c, "context", "media");
                if (m != null) return m;
            } catch (Exception ignored) {
                // nächste Schreibweise
            }
        }
        int add = html.indexOf("__additionalDataLoaded(");
        if (add >= 0) {
            String json = YouTubePosts.jsonObjectAt(html, html.indexOf('{', add));
            try {
                JSONObject o = new JSONObject(json);
                JSONObject m = o.optJSONObject("shortcode_media");
                if (m == null) m = Json.obj(o, "graphql", "shortcode_media");
                if (m != null) return m;
            } catch (Exception ignored) {
                // nächste Schreibweise
            }
        }
        int sm = html.indexOf("\"shortcode_media\":{");
        if (sm >= 0) {
            try {
                return new JSONObject(YouTubePosts.jsonObjectAt(html, html.indexOf('{', sm)));
            } catch (Exception ignored) {
                // nichts gefunden
            }
        }
        return null;
    }

    /** JSON-String-Literal ab der Position des öffnenden Anführungszeichens (mit Escapes). */
    private static String stringLiteralAt(String s, int start) {
        if (start >= s.length() || s.charAt(start) != '"') return "\"\"";
        for (int i = start + 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\') i++;
            else if (c == '"') return s.substring(start, i + 1);
        }
        return "\"\"";
    }
}

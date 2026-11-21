package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bilder und Videos eines Beitrags auf X/Twitter ohne Anmeldung: über den öffentlichen Einbettungs-Endpunkt
 * (cdn.syndication.twimg.com, wie in yt-dlp), ersatzweise über FxTwitter/vxTwitter. Bilder kommen in
 * Originalgröße (name=orig), Videos in allen MP4-Fassungen. (Ohne Android-Klassen, damit testbar.)
 */
final class Twitter {

    private static final Pattern VARIANT_SIZE = Pattern.compile("/(\\d{2,5})x(\\d{2,5})/");
    private static final String ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

    private Twitter() {
    }

    /** Meldung, wenn X einen Beitrag nur angemeldet zeigt (sensibel/ab 18, geschützt …) */
    static final String LOGIN_NEEDED = "X zeigt diesen Beitrag nur angemeldet (z. B. als sensibel bzw. ab 18 markiert). Melde dich unter "
            + "„Mehr → Anmeldung“ bei X an – im X-Konto muss „Inhalte anzeigen, die möglicherweise sensibel sind“ eingeschaltet sein.";

    /**
     * Medien eines Beitrags: zuerst der Einbettungs-Endpunkt von X, dann die öffentlichen Vorschau-Dienste
     * FxTwitter und vxTwitter (die Discord & Co. für X-Vorschauen nutzen; sie liefern oft auch sensible Beiträge).
     */
    static JSONObject extractAny(String tweetId, String user) throws Exception {
        Exception first;
        try {
            return extract(tweetId, new Http());
        } catch (Exception e) {
            first = e;
        }
        try {
            return extractFx(tweetId, user, new Http());
        } catch (Exception ignored) {
            // nächste Quelle
        }
        try {
            return extractVx(tweetId, user, new Http());
        } catch (Exception ignored) {
            // nichts gefunden
        }
        throw first;
    }

    static JSONObject extract(String tweetId, Http http) throws Exception {
        http.userAgent = "Googlebot";
        Http.Response r = http.get("https://cdn.syndication.twimg.com/tweet-result?id=" + tweetId + "&lang=de&token=" + token(tweetId),
                java.util.Collections.singletonMap("Accept", "application/json"));
        if (r.code == 404 || r.body.trim().equals("{}") || r.body.trim().length() == 0) {
            throw new IOException("Beitrag auf X nicht gefunden – gelöscht, privat oder nur angemeldet sichtbar");
        }
        if (r.code >= 400) throw new IOException("X hat die Anfrage abgelehnt (HTTP " + r.code + ")");
        JSONObject tweet = new JSONObject(r.body);
        if ("TweetTombstone".equals(Json.str(tweet, "__typename"))) throw new IOException(tombstoneMessage(tweet));
        return parse(tweet, "https://x.com/i/status/" + tweetId);
    }

    /** Grund, warum X den Beitrag nicht zeigt: sensibel/ab 18 bzw. Anmeldung nötig → Anmelde-Hinweis. */
    static String tombstoneMessage(JSONObject tweet) {
        String text = Json.str(Json.obj(tweet, "tombstone", "text"), "text", "").toLowerCase(Locale.ROOT);
        if (text.contains("age-restricted") || text.contains("adult") || text.contains("sensitive") || text.contains("log in")
                || text.contains("protected") || text.length() == 0) {
            return LOGIN_NEEDED;
        }
        return "Dieser Beitrag auf X ist nicht verfügbar (gelöscht oder gesperrt)";
    }

    static JSONObject extractFx(String tweetId, String user, Http http) throws Exception {
        Http.Response r = http.get("https://api.fxtwitter.com/" + (user == null ? "i" : user) + "/status/" + tweetId,
                java.util.Collections.singletonMap("Accept", "application/json"));
        JSONObject root = new JSONObject(r.body);
        JSONObject tweet = root.optJSONObject("tweet");
        if (tweet == null) throw new IOException("FxTwitter: " + Json.str(root, "message", "HTTP " + r.code));
        return parseFx(tweet, "https://x.com/i/status/" + tweetId);
    }

    static JSONObject extractVx(String tweetId, String user, Http http) throws Exception {
        Http.Response r = http.get("https://api.vxtwitter.com/" + (user == null ? "Twitter" : user) + "/status/" + tweetId,
                java.util.Collections.singletonMap("Accept", "application/json"));
        if (r.code >= 400) throw new IOException("vxTwitter: HTTP " + r.code);
        return parseVx(new JSONObject(r.body), "https://x.com/i/status/" + tweetId);
    }

    /**
     * Token für den Endpunkt: ((id / 1e15) * π).toString(36) ohne Nullen und Punkt – wie in yt-dlp
     * (_generate_syndication_token / js_number_to_string), also JavaScripts Zahl-zu-Text in Basis 36.
     */
    static String token(String id) {
        return jsToString36(Double.parseDouble(id) / 1e15 * Math.PI).replace("0", "").replace(".", "");
    }

    static String jsToString36(double val) {
        if (val == 0) return "0";
        boolean negative = val < 0;
        val = Math.abs(val);
        double integer = Math.floor(val);
        double fraction = val - integer;
        double delta = Math.max(Double.MIN_VALUE, Math.ulp(val) / 2);
        List<Integer> result = new ArrayList<>();
        if (fraction >= delta) result.add(-2); // "."
        while (fraction >= delta) {
            delta *= 36;
            double x = fraction * 36;
            double digit = Math.floor(x);
            fraction = x - digit;
            result.add((int) digit);
            boolean round = fraction > 0.5 || (fraction == 0.5 && (((int) digit) & 1) == 1);
            if (round && fraction + delta > 1) {
                boolean carried = false;
                for (int i = result.size() - 1; i >= 1; i--) {
                    if (result.get(i) + 1 < 36) {
                        result.set(i, result.get(i) + 1);
                        carried = true;
                        break;
                    }
                    result.remove(result.size() - 1);
                }
                if (!carried) integer += 1;
                break;
            }
        }
        long whole = (long) integer;
        List<Integer> head = new ArrayList<>();
        head.add((int) (whole % 36));
        whole /= 36;
        while (whole > 0) {
            head.add(0, (int) (whole % 36));
            whole /= 36;
        }
        StringBuilder sb = new StringBuilder(negative ? "-" : "");
        for (int d : head) sb.append(ALPHABET.charAt(d));
        for (int d : result) sb.append(d == -2 ? '.' : ALPHABET.charAt(d));
        return sb.toString();
    }

    /** Antwort des Einbettungs-Endpunkts (mediaDetails). */
    static JSONObject parse(JSONObject tweet, String pageUrl) throws Exception {
        JSONArray details = tweet.optJSONArray("mediaDetails");
        JSONObject source = tweet;
        // Zitierter Beitrag mit den Medien, wenn der Beitrag selbst keine hat
        if ((details == null || details.length() == 0) && tweet.optJSONObject("quoted_tweet") != null) {
            source = tweet.optJSONObject("quoted_tweet");
            details = source.optJSONArray("mediaDetails");
        }
        Media media = new Media();
        for (int i = 0; details != null && i < details.length(); i++) {
            JSONObject m = details.optJSONObject(i);
            if (m == null) continue;
            String mediaUrl = Json.str(m, "media_url_https", Json.str(m, "media_url"));
            JSONObject orig = m.optJSONObject("original_info");
            if ("photo".equals(Json.str(m, "type", "photo"))) {
                media.photo(mediaUrl, Json.lng(orig, "width"), Json.lng(orig, "height"));
            } else {
                JSONObject info = m.optJSONObject("video_info");
                media.video(variants(Json.arr(info, "variants"), Json.lng(orig, "width"), Json.lng(orig, "height")), mediaUrl,
                        Json.num(info, "duration_millis") / 1000);
            }
        }
        return media.result("twitter-web", pageUrl, Json.str(source, "text", ""), Json.str(source.optJSONObject("user"), "screen_name"));
    }

    /** Antwort von FxTwitter (api.fxtwitter.com): tweet.media.all[{type photo/video/gif, url, width, height, variants}]. */
    static JSONObject parseFx(JSONObject tweet, String pageUrl) throws Exception {
        JSONObject source = tweet;
        JSONArray all = Json.arr(Json.obj(tweet, "media"), "all");
        if ((all == null || all.length() == 0) && tweet.optJSONObject("quote") != null) {
            source = tweet.optJSONObject("quote");
            all = Json.arr(Json.obj(source, "media"), "all");
        }
        Media media = new Media();
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m == null) continue;
            long w = Json.lng(m, "width"), h = Json.lng(m, "height");
            if ("photo".equals(Json.str(m, "type"))) {
                media.photo(Json.str(m, "url"), w, h);
            } else {
                JSONArray list = m.optJSONArray("variants");
                if (list == null || list.length() == 0) list = new JSONArray().put(new JSONObject().put("url", Json.str(m, "url", "")).put("content_type", "video/mp4"));
                media.video(variants(list, w, h), Json.str(m, "thumbnail_url"), Json.num(m, "duration"));
            }
        }
        return media.result("twitter-fx", pageUrl, Json.str(source, "text", ""), Json.str(source.optJSONObject("author"), "screen_name"));
    }

    /** Antwort von vxTwitter (api.vxtwitter.com): media_extended[{type image/video/gif, url, thumbnail_url, size}]. */
    static JSONObject parseVx(JSONObject tweet, String pageUrl) throws Exception {
        JSONArray all = tweet.optJSONArray("media_extended");
        Media media = new Media();
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m == null) continue;
            JSONObject size = m.optJSONObject("size");
            long w = Json.lng(size, "width"), h = Json.lng(size, "height");
            if ("image".equals(Json.str(m, "type"))) {
                media.photo(Json.str(m, "url"), w, h);
            } else {
                JSONArray list = new JSONArray().put(new JSONObject().put("url", Json.str(m, "url", "")).put("content_type", "video/mp4"));
                media.video(variants(list, w, h), Json.str(m, "thumbnail_url"), Json.num(m, "duration_millis") / 1000);
            }
        }
        return media.result("twitter-vx", pageUrl, Json.str(tweet, "text", ""), Json.str(tweet, "user_screen_name"));
    }

    /** Sammelt Bilder und Videos eines Beitrags und baut daraus das Ergebnis der App. */
    private static final class Media {
        final JSONArray items = new JSONArray();
        JSONArray firstVideo;
        double duration;
        String thumb;

        void photo(String mediaUrl, long w, long h) throws Exception {
            if (mediaUrl == null) return;
            if (thumb == null) thumb = mediaUrl;
            JSONObject o = new JSONObject();
            o.put("type", "image");
            o.put("url", sized(mediaUrl, "orig"));
            o.put("fallback", new JSONArray().put(sized(mediaUrl, "4096x4096")).put(sized(mediaUrl, "large")).put(mediaUrl));
            o.put("width", w);
            o.put("height", h);
            o.put("via", "files");
            items.put(o);
        }

        void video(JSONArray variants, String poster, double seconds) throws Exception {
            if (variants.length() == 0) return;
            if (thumb == null && poster != null) thumb = poster;
            if (firstVideo == null) {
                firstVideo = variants;
                duration = seconds;
            }
            JSONObject best = variants.getJSONObject(0);
            JSONObject o = new JSONObject();
            o.put("type", "video");
            o.put("url", best.getString("url"));
            JSONArray fb = new JSONArray();
            for (int v = 1; v < variants.length(); v++) fb.put(variants.getJSONObject(v).getString("url"));
            o.put("fallback", fb);
            o.put("width", best.optLong("width"));
            o.put("height", best.optLong("height"));
            if (poster != null) o.put("thumb", poster);
            o.put("via", "files");
            items.put(o);
        }

        JSONObject result(String source, String pageUrl, String rawText, String name) throws Exception {
            if (items.length() == 0) throw new IOException("In diesem Beitrag auf X sind keine Bilder oder Videos");
            JSONObject res = new JSONObject();
            res.put("source", source);
            res.put("platform", "twitter");
            res.put("pageUrl", pageUrl);
            String text = rawText.replaceAll("\\s*https?://t\\.co/\\S+", "").replaceAll("\\s+", " ").trim();
            res.put("title", text.length() > 0 ? shorten(text, 100) : name != null ? "Beitrag von @" + name : "Beitrag auf X");
            if (name != null) res.put("uploader", "@" + name);
            if (thumb != null) res.put("thumbnail", thumb.contains("pbs.twimg.com/media/") || thumb.contains("_thumb/") ? sized(thumb, "large") : thumb);
            res.put("headers", new JSONObject());
            if (items.length() == 1 && firstVideo != null) {
                res.put("kind", "video");
                res.put("videos", firstVideo);
                if (duration > 0) res.put("duration", duration);
            } else {
                res.put("kind", "images");
                res.put("images", items);
            }
            return res;
        }
    }

    /** MP4-Fassungen eines Videos, beste zuerst: {url, width, height, res, bitrate}. */
    private static JSONArray variants(JSONArray list, long origW, long origH) throws Exception {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject v = list.optJSONObject(i);
            String url = Json.str(v, "url");
            if (url == null || !"video/mp4".equals(Json.str(v, "content_type", "video/mp4"))) continue;
            long w = origW, h = origH;
            Matcher m = VARIANT_SIZE.matcher(url);
            if (m.find()) {
                w = Long.parseLong(m.group(1));
                h = Long.parseLong(m.group(2));
            }
            JSONObject o = new JSONObject();
            o.put("url", url);
            o.put("fallback", new JSONArray());
            o.put("width", w);
            o.put("height", h);
            o.put("res", Math.min(w, h) > 0 ? Math.min(w, h) : Math.max(w, h));
            o.put("bitrate", Json.num(v, "bitrate"));
            o.put("codec", "h264");
            out.add(o);
        }
        Collections.sort(out, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                int c = Long.compare(b.optLong("res"), a.optLong("res"));
                return c != 0 ? c : Double.compare(b.optDouble("bitrate", 0), a.optDouble("bitrate", 0));
            }
        });
        JSONArray arr = new JSONArray();
        for (JSONObject o : out) arr.put(o);
        return arr;
    }

    /** pbs.twimg.com/media/ABC.jpg → pbs.twimg.com/media/ABC?format=jpg&name=orig */
    static String sized(String mediaUrl, String name) {
        String base = mediaUrl;
        int q = base.indexOf('?');
        if (q >= 0) base = base.substring(0, q);
        // alte Schreibweise der Größe: …/ABC.jpg:large
        base = base.replaceAll(":(?:large|medium|small|thumb|orig)$", "");
        int dot = base.lastIndexOf('.');
        int slash = base.lastIndexOf('/');
        if (dot <= slash) {
            // Format steht schon als Parameter (…/media/ABC?format=jpg&name=small)
            String format = Links.param(mediaUrl, "format");
            return base + (format != null ? "?format=" + format + "&name=" : "?name=") + name;
        }
        String ext = base.substring(dot + 1).toLowerCase(Locale.ROOT);
        return base.substring(0, dot) + "?format=" + ext + "&name=" + name;
    }

    private static String shorten(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1).trim() + "…";
    }
}

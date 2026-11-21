package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Liest TikTok-Beiträge direkt von der Webseite: Foto-Posts (Slideshows) mit allen Bildern in voller Größe,
 * Videos in allen angebotenen Auflösungen und die Musik. yt-dlp kann keine Foto-Posts, deshalb gibt es das
 * zusätzlich; bei Videos dient es als Ersatz, falls yt-dlp scheitert. (Ohne Android-Klassen, damit testbar.)
 *
 * Aufbau wie in yt-dlp (extractor/tiktok.py): Die Seite enthält ein Skript __UNIVERSAL_DATA_FOR_REHYDRATION__
 * mit allen Daten. Manchmal kommt vorher eine kleine Rechenaufgabe (SHA-256), deren Lösung als Cookie
 * zurückgeschickt wird.
 */
final class TikTok {

    private static final Pattern URL_KEY = Pattern.compile("_(h264|h265|bytevc1|bytevc2|hevc|avc1?)_(\\d{3,4})p_", Pattern.CASE_INSENSITIVE);
    private static final Pattern GEAR = Pattern.compile("_(\\d{3,4})_");

    private TikTok() {
    }

    static JSONObject extract(String url, Http http) throws Exception {
        String resolved = url;
        if (Links.isTikTokShort(url) || Links.tikTokId(url) == null) resolved = http.get(url, null).url;
        String id = Links.tikTokId(resolved);
        if (id == null) throw new IOException("Kein TikTok-Beitrag im Link gefunden");
        String user = Links.tikTokUser(resolved);
        String type = resolved.contains("/photo/") ? "photo" : "video";
        String pageUrl = "https://www.tiktok.com/@" + (user == null ? "_" : user) + "/" + type + "/" + id;

        Http.Response r = http.get(pageUrl, null);
        JSONObject scope = universalData(r.body);
        if (scope == null) {
            String[][] challenge = solveChallenge(r.body);
            if (challenge == null) throw new IOException("TikTok hat die Seite nicht ausgeliefert (HTTP " + r.code + ")");
            for (String[] c : challenge) http.setCookie("tiktok.com", c[0], c[1]);
            r = http.get(pageUrl, null);
            scope = universalData(r.body);
            if (scope == null) throw new IOException("TikTok-Seite konnte nicht gelesen werden");
        }
        JSONObject detail = scope.optJSONObject("webapp.video-detail");
        int status = detail == null ? -1 : (int) Json.num(detail, "statusCode");
        JSONObject item = Json.obj(detail, "itemInfo", "itemStruct");
        if (item == null || status != 0) throw new IOException(statusMessage(status));

        JSONObject res = parseItem(item, pageUrl);
        JSONObject headers = new JSONObject();
        headers.put("Referer", "https://www.tiktok.com/");
        headers.put("User-Agent", http.userAgent);
        String cookie = http.cookieHeader("https://www.tiktok.com/");
        if (cookie.length() > 0) headers.put("Cookie", cookie);
        res.put("headers", headers);
        return res;
    }

    static String statusMessage(int status) {
        switch (status) {
            case 10216:
            case 10222:
                return "Dieser TikTok-Beitrag ist privat";
            case 10204:
                return "TikTok blockiert gerade Anfragen von dieser Internetverbindung";
            case 10231:
                return "Dieser TikTok-Beitrag ist in deinem Land nicht verfügbar";
            case 10000:
            case 10101:
            case 10202:
                return "TikTok-Beitrag wurde gelöscht oder ist nicht verfügbar";
            default:
                return "TikTok-Beitrag nicht verfügbar (Code " + status + ")";
        }
    }

    /** Inhalt von __UNIVERSAL_DATA_FOR_REHYDRATION__ → __DEFAULT_SCOPE__ */
    static JSONObject universalData(String html) {
        if (html == null) return null;
        int i = html.indexOf("id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"");
        if (i < 0) return null;
        int start = html.indexOf('>', i);
        int end = html.indexOf("</script>", start);
        if (start < 0 || end < 0) return null;
        try {
            return new JSONObject(html.substring(start + 1, end)).optJSONObject("__DEFAULT_SCOPE__");
        } catch (Exception e) {
            return null;
        }
    }

    /** Wandelt den Beitrag (itemStruct) in das gemeinsame Ergebnisformat der App um. */
    static JSONObject parseItem(JSONObject item, String pageUrl) throws Exception {
        JSONObject res = new JSONObject();
        res.put("source", "tiktok-web");
        res.put("platform", "tiktok");
        res.put("id", Json.str(item, "id"));
        res.put("pageUrl", pageUrl);
        String desc = Json.str(item, "desc", "");
        res.put("title", desc.length() > 0 ? shorten(desc, 100) : "TikTok " + Json.str(item, "id", ""));
        JSONObject author = item.optJSONObject("author");
        String uploader = author != null ? Json.str(author, "uniqueId", Json.str(author, "nickname")) : Json.str(item, "author");
        if (uploader != null) res.put("uploader", "@" + uploader);

        JSONObject video = item.optJSONObject("video");
        JSONObject imagePost = item.optJSONObject("imagePost");
        JSONArray images = new JSONArray();
        if (imagePost != null && imagePost.optJSONArray("images") != null) {
            JSONArray list = imagePost.optJSONArray("images");
            for (int i = 0; i < list.length(); i++) {
                JSONObject img = list.optJSONObject(i);
                List<String> urls = imageUrls(img == null ? null : img.optJSONObject("imageURL"));
                if (urls.isEmpty()) continue;
                JSONObject o = new JSONObject();
                o.put("url", urls.get(0));
                o.put("fallback", new JSONArray(urls.subList(1, urls.size())));
                o.put("width", Json.lng(img, "imageWidth"));
                o.put("height", Json.lng(img, "imageHeight"));
                images.put(o);
            }
        }
        res.put("images", images);

        JSONArray videos = images.length() > 0 ? new JSONArray() : videoFormats(video);
        res.put("videos", videos);
        res.put("kind", images.length() > 0 ? "images" : "video");
        if (images.length() == 0 && videos.length() == 0) throw new IOException("In diesem TikTok-Beitrag wurde kein Video gefunden");

        String thumb = null;
        if (video != null) thumb = firstNonNull(Json.str(video, "originCover"), Json.str(video, "cover"));
        if (thumb == null && imagePost != null) thumb = Json.first(Json.arr(Json.obj(imagePost, "cover", "imageURL"), "urlList"));
        if (thumb == null && images.length() > 0) thumb = images.getJSONObject(0).getString("url");
        if (thumb != null) res.put("thumbnail", thumb);
        if (video != null && Json.num(video, "duration") > 0) res.put("duration", Json.num(video, "duration"));

        JSONObject music = item.optJSONObject("music");
        String audio = Json.str(music, "playUrl");
        if (audio != null) {
            res.put("audioUrl", audio);
            res.put("audioTitle", Json.str(music, "title", "TikTok-Sound"));
        }
        return res;
    }

    /** JPEG-Adressen zuerst (passen in jede Galerie), danach die übrigen als Ersatz. */
    private static List<String> imageUrls(JSONObject imageUrl) {
        List<String> jpeg = new ArrayList<>();
        List<String> other = new ArrayList<>();
        JSONArray list = Json.arr(imageUrl, "urlList");
        if (list == null) return jpeg;
        for (int i = 0; i < list.length(); i++) {
            String u = list.optString(i, "");
            if (u.length() == 0) continue;
            if (u.contains(".jpeg") || u.contains(".jpg")) jpeg.add(u);
            else other.add(u);
        }
        jpeg.addAll(other);
        return jpeg;
    }

    /** Alle Videofassungen, beste zuerst: {url, fallback[], width, height, res, codec, size} */
    static JSONArray videoFormats(JSONObject video) throws Exception {
        List<JSONObject> list = new ArrayList<>();
        if (video == null) return new JSONArray();
        double vw = Json.num(video, "width"), vh = Json.num(video, "height");
        JSONArray bitrates = video.optJSONArray("bitrateInfo");
        if (bitrates != null) {
            for (int i = 0; i < bitrates.length(); i++) {
                JSONObject b = bitrates.optJSONObject(i);
                JSONObject play = b == null ? null : b.optJSONObject("PlayAddr");
                JSONArray urls = Json.arr(play, "UrlList");
                if (urls == null || urls.length() == 0) continue;
                String key = Json.str(play, "UrlKey", "");
                String codec = Json.str(b, "CodecType", "");
                int res = 0;
                Matcher m = URL_KEY.matcher(key);
                if (m.find()) {
                    if (codec.length() == 0) codec = m.group(1);
                    res = Integer.parseInt(m.group(2));
                }
                // bytevc2 (H.266) spielt kein Handy ab
                if (codec.toLowerCase(Locale.ROOT).contains("bytevc2") || codec.toLowerCase(Locale.ROOT).contains("266")) continue;
                double w = Json.num(play, "Width"), h = Json.num(play, "Height");
                if (w <= 0 || h <= 0) {
                    if (res == 0) {
                        Matcher g = GEAR.matcher(Json.str(b, "GearName", ""));
                        if (g.find()) res = Integer.parseInt(g.group(1));
                    }
                    if (res == 540) res = 576; // "540p" ist bei TikTok eigentlich 576p
                    if (res > 0 && vw > 0 && vh > 0) {
                        // res ist die kürzere Seite
                        double ratio = vw / vh;
                        if (ratio < 1) {
                            w = res;
                            h = Math.round(res / ratio);
                        } else {
                            h = res;
                            w = Math.round(res * ratio);
                        }
                    }
                }
                JSONObject f = format(urls, w, h, codec, Json.lng(play, "DataSize"));
                f.put("bitrate", Json.num(b, "Bitrate"));
                if (res > 0 && f.optInt("res") == 0) f.put("res", res);
                list.add(f);
            }
        }
        Object play = video.opt("playAddr");
        if (play instanceof String && ((String) play).length() > 0) {
            list.add(format(new JSONArray().put(play), vw, vh, "h264", 0));
        }
        Collections.sort(list, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                int c = Integer.compare(b.optInt("res"), a.optInt("res"));
                if (c != 0) return c;
                // gleiche Auflösung: H.264 läuft überall, danach höhere Bitrate
                c = Boolean.compare(isH264(b), isH264(a));
                return c != 0 ? c : Double.compare(b.optDouble("bitrate", 0), a.optDouble("bitrate", 0));
            }
        });
        JSONArray out = new JSONArray();
        for (JSONObject f : list) out.put(f);
        return out;
    }

    private static boolean isH264(JSONObject f) {
        String c = f.optString("codec", "").toLowerCase(Locale.ROOT);
        return c.contains("264") || c.startsWith("avc");
    }

    private static JSONObject format(JSONArray urls, double w, double h, String codec, long size) throws Exception {
        JSONObject f = new JSONObject();
        f.put("url", urls.getString(0));
        JSONArray fb = new JSONArray();
        for (int i = 1; i < urls.length(); i++) fb.put(urls.getString(i));
        f.put("fallback", fb);
        f.put("width", (long) w);
        f.put("height", (long) h);
        f.put("res", (long) (w > 0 && h > 0 ? Math.min(w, h) : Math.max(w, h)));
        f.put("codec", codec);
        if (size > 0) f.put("size", size);
        return f;
    }

    /**
     * Löst die Rechenaufgabe der TikTok-Firewall wie yt-dlp: sha256(a + n) == c für ein n bis 1.000.000.
     * Liefert die zu setzenden Cookies {name, wert} oder null, wenn die Seite keine Aufgabe enthält.
     */
    static String[][] solveChallenge(String html) throws Exception {
        String data = attrById(html, "cs", "class");
        String cookieName = attrById(html, "wci", "class");
        if (data == null || cookieName == null) return null;
        String json = new String(b64decode(data), "UTF-8").trim();
        JSONObject v = new JSONObject(json).optJSONObject("v");
        if (v == null) return null;
        byte[] a = b64decode(v.getString("a"));
        byte[] expected = b64decode(v.getString("c"));
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (int i = 0; i <= 1000000; i++) {
            md.reset();
            md.update(a);
            md.update(Integer.toString(i).getBytes("UTF-8"));
            if (MessageDigest.isEqual(md.digest(), expected)) {
                String d = b64encode(Integer.toString(i).getBytes("UTF-8"));
                // Lösung als Feld "d" ergänzen, sonst bleibt das JSON unverändert
                String solved = json.substring(0, json.lastIndexOf('}')) + ",\"d\":\"" + d + "\"}";
                String value = b64encode(solved.getBytes("UTF-8"));
                String rciName = attrById(html, "rci", "class");
                String rciValue = attrById(html, "rs", "class");
                if (rciName != null && rciValue != null) {
                    return new String[][]{{cookieName, value}, {rciName, rciValue}};
                }
                return new String[][]{{cookieName, value}};
            }
        }
        throw new IOException("TikTok-Sicherheitsprüfung konnte nicht gelöst werden");
    }

    /** Wert eines Attributs des Elements mit der angegebenen id. */
    static String attrById(String html, String id, String attr) {
        if (html == null) return null;
        Matcher m = Pattern.compile("<[a-zA-Z][^>]*\\sid=[\"']" + Pattern.quote(id) + "[\"'][^>]*>").matcher(html);
        if (!m.find()) return null;
        Matcher a = Pattern.compile("\\s" + Pattern.quote(attr) + "=[\"']([^\"']*)[\"']").matcher(m.group());
        return a.find() ? a.group(1) : null;
    }

    private static String shorten(String s, int max) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() <= max ? s : s.substring(0, max - 1).trim() + "…";
    }

    private static String firstNonNull(String a, String b) {
        return a != null ? a : b;
    }

    // Base64 ohne java.util.Base64 (gibt es erst ab Android 8) und ohne android.util (testbar auf dem PC)
    private static final String B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    static byte[] b64decode(String s) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buf = 0, bits = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '-') ch = '+';
            else if (ch == '_') ch = '/';
            int v = B64.indexOf(ch);
            if (v < 0) continue; // Padding, Leerzeichen
            buf = (buf << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write((buf >> bits) & 0xFF);
            }
        }
        return out.toByteArray();
    }

    static String b64encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < data.length; i += 3) {
            int n = (data[i] & 0xFF) << 16;
            if (i + 1 < data.length) n |= (data[i + 1] & 0xFF) << 8;
            if (i + 2 < data.length) n |= data[i + 2] & 0xFF;
            sb.append(B64.charAt((n >> 18) & 63)).append(B64.charAt((n >> 12) & 63));
            sb.append(i + 1 < data.length ? B64.charAt((n >> 6) & 63) : '=');
            sb.append(i + 2 < data.length ? B64.charAt(n & 63) : '=');
        }
        return sb.toString();
    }
}

package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URL;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Medien einer beliebigen Webseite ohne eigenen Ausleser: Vorschaubild und Video aus den Meta-Angaben
 * (og:image, og:video, twitter:image …) und &lt;video&gt;-Tags. Das ist der letzte Versuch vor dem Browser –
 * so klappt es z. B. bei Nachrichtenseiten, Blogs, Threads oder öffentlichen Facebook-Seiten. (Ohne Android-Klassen.)
 */
final class PageMedia {

    private static final Pattern META = Pattern.compile("<meta\\s[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern VIDEO_TAG = Pattern.compile("<(?:video|source)\\s[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>([^<]*)</title>", Pattern.CASE_INSENSITIVE);
    private static final Pattern MEDIA_FILE = Pattern.compile("\\.(mp4|m4v|webm|mov|m3u8)(\\?|$)", Pattern.CASE_INSENSITIVE);

    private PageMedia() {
    }

    static JSONObject extract(String url, Http http) throws Exception {
        Http.Response r = http.get(url, null);
        if (r.code >= 400) throw new IOException("Die Seite hat geantwortet mit HTTP " + r.code);
        return parse(r.body, r.url);
    }

    static JSONObject parse(String html, String pageUrl) throws Exception {
        Set<String> images = new LinkedHashSet<>();
        Set<String> videos = new LinkedHashSet<>();
        Set<String> embeds = new LinkedHashSet<>();
        String title = null;
        Matcher m = META.matcher(html);
        while (m.find()) {
            String tag = m.group();
            String key = attr(tag, "property");
            if (key == null) key = attr(tag, "name");
            String content = attr(tag, "content");
            if (key == null || content == null || content.length() == 0) continue;
            key = key.toLowerCase(Locale.ROOT);
            String abs = absolute(pageUrl, content);
            switch (key) {
                case "og:image":
                case "og:image:url":
                case "og:image:secure_url":
                case "twitter:image":
                case "twitter:image:src":
                    if (abs != null) images.add(abs);
                    break;
                case "og:video":
                case "og:video:url":
                case "og:video:secure_url":
                case "twitter:player:stream":
                    if (abs == null) break;
                    if (MEDIA_FILE.matcher(abs).find()) videos.add(abs);
                    else embeds.add(abs);
                    break;
                case "twitter:player":
                    if (abs != null) embeds.add(abs);
                    break;
                case "og:title":
                case "twitter:title":
                    if (title == null) title = unescape(content).trim();
                    break;
                default:
                    break;
            }
        }
        Matcher v = VIDEO_TAG.matcher(html);
        while (v.find()) {
            String src = attr(v.group(), "src");
            String abs = src == null ? null : absolute(pageUrl, src);
            if (abs != null && abs.startsWith("http")) videos.add(abs);
        }
        if (title == null) {
            Matcher t = TITLE.matcher(html);
            if (t.find()) title = unescape(t.group(1)).trim();
        }

        JSONObject res = new JSONObject();
        res.put("source", "page");
        res.put("platform", Links.platform(pageUrl));
        res.put("pageUrl", pageUrl);
        res.put("title", title == null || title.length() == 0 ? Links.host(pageUrl) : shorten(title, 100));
        res.put("headers", new JSONObject().put("Referer", pageUrl));
        JSONArray emb = new JSONArray();
        for (String e : embeds) emb.put(e);
        res.put("embeds", emb);
        JSONArray imgs = new JSONArray();
        for (String i : images) imgs.put(new JSONObject().put("type", "image").put("url", i).put("fallback", new JSONArray()).put("via", "files"));
        if (!images.isEmpty()) res.put("thumbnail", images.iterator().next());
        if (videos.size() == 1) {
            String only = videos.iterator().next();
            res.put("kind", "video");
            res.put("videos", new JSONArray().put(new JSONObject().put("url", only).put("fallback", new JSONArray()).put("res", 0)));
        } else {
            for (String vid : videos) imgs.put(new JSONObject().put("type", "video").put("url", vid).put("fallback", new JSONArray()).put("via", "files"));
            res.put("kind", "images");
            res.put("images", imgs);
        }
        if (videos.isEmpty() && images.isEmpty() && embeds.isEmpty()) throw new IOException("Auf der Seite wurden keine Bilder oder Videos gefunden");
        return res;
    }

    /** Wert eines Attributs in einem einzelnen Tag (doppelte oder einfache Anführungszeichen). */
    static String attr(String tag, String name) {
        Matcher m = Pattern.compile("\\s" + Pattern.quote(name) + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", Pattern.CASE_INSENSITIVE).matcher(tag);
        if (!m.find()) return null;
        return unescape(m.group(1) != null ? m.group(1) : m.group(2));
    }

    static String absolute(String base, String url) {
        try {
            return new URL(new URL(base), url.trim()).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** HTML-Entitäten (&amp;amp; &amp;quot; &amp;#39; &amp;#x27; …) in Attributen auflösen. */
    static String unescape(String s) {
        if (s == null || s.indexOf('&') < 0) return s;
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            int semi = c == '&' ? s.indexOf(';', i) : -1;
            if (semi > i && semi - i <= 10) {
                String ent = s.substring(i + 1, semi);
                String rep = null;
                if (ent.equals("amp")) rep = "&";
                else if (ent.equals("quot")) rep = "\"";
                else if (ent.equals("apos")) rep = "'";
                else if (ent.equals("lt")) rep = "<";
                else if (ent.equals("gt")) rep = ">";
                else if (ent.equals("nbsp")) rep = " ";
                else if (ent.startsWith("#x") || ent.startsWith("#X")) rep = codePoint(ent.substring(2), 16);
                else if (ent.startsWith("#")) rep = codePoint(ent.substring(1), 10);
                if (rep != null) {
                    out.append(rep);
                    i = semi + 1;
                    continue;
                }
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    private static String codePoint(String digits, int radix) {
        try {
            return new String(Character.toChars(Integer.parseInt(digits, radix)));
        } catch (Exception e) {
            return null;
        }
    }

    private static String shorten(String s, int max) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() <= max ? s : s.substring(0, max - 1).trim() + "…";
    }
}

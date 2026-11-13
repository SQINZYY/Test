package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

/**
 * Wertet die Ausgabe von "gallery-dl -J" aus: eine JSON-Liste von Nachrichten
 * [2, {Beitrag}] (Verzeichnis), [3, "url", {Datei}] (Datei), [6, "url", {…}] (nicht aufgelöster Link),
 * [-1, {"error": …, "message": …}] (Fehler). Daraus wird das gemeinsame Ergebnisformat der App.
 * (Ohne Android-Klassen, damit testbar.)
 */
final class GalleryList {

    private static final String[] VIDEO_EXT = {"mp4", "webm", "mov", "m4v", "mkv", "m3u8", "avi", "ts"};
    private static final String[] TITLE_KEYS = {"title", "content", "description", "caption", "text", "name"};
    private static final String[] USER_KEYS = {"author", "user", "uploader", "username", "owner", "artist", "creator"};

    private GalleryList() {
    }

    static JSONObject parse(String output, String pageUrl) throws Exception {
        int start = output == null ? -1 : output.indexOf('[');
        if (start < 0) throw new IOException("gallery-dl hat nichts geliefert");
        JSONArray messages = new JSONArray(output.substring(start));
        JSONArray items = new JSONArray();
        String title = null, uploader = null, error = null, category = null;
        boolean sameExtractor = true;
        int fileIndex = 0;
        for (int i = 0; i < messages.length(); i++) {
            JSONArray msg = messages.optJSONArray(i);
            if (msg == null || msg.length() < 2) continue;
            int type = msg.optInt(0);
            if (type == -1) {
                JSONObject e = msg.optJSONObject(1);
                error = Json.str(e, "message", Json.str(e, "error"));
                continue;
            }
            if (type == 6) {
                sameExtractor = false;
                continue;
            }
            JSONObject meta = msg.optJSONObject(type == 3 ? 2 : 1);
            if (title == null) title = firstText(meta, TITLE_KEYS);
            if (uploader == null) uploader = user(meta);
            if (type != 3) continue;
            String url = msg.optString(1, "");
            if (url.length() == 0) continue;
            fileIndex++;
            String cat = Json.str(meta, "category", "") + "/" + Json.str(meta, "subcategory", "");
            if (category == null) category = cat;
            else if (!category.equals(cat)) sameExtractor = false;

            boolean ytdl = url.startsWith("ytdl:");
            String ext = Json.str(meta, "extension", "").toLowerCase(Locale.ROOT);
            JSONObject o = new JSONObject();
            o.put("type", ytdl || isVideo(ext, url) ? "video" : "image");
            o.put("url", ytdl ? url.substring(5) : url);
            o.put("fallback", new JSONArray());
            o.put("width", Json.lng(meta, "width"));
            o.put("height", Json.lng(meta, "height"));
            o.put("index", fileIndex);
            o.put("via", ytdl ? "ytdlp" : "gdl");
            if (ext.length() > 0) o.put("ext", ext);
            items.put(o);
        }
        if (items.length() == 0) throw new IOException(error != null ? error : "gallery-dl hat hier keine Dateien gefunden");

        JSONObject res = new JSONObject();
        res.put("source", "gallery-dl");
        String site = category == null ? "" : category.substring(0, category.indexOf('/'));
        String platform = Links.platform(pageUrl);
        res.put("platform", "other".equals(platform) && site.length() > 0 ? site : platform);
        res.put("pageUrl", pageUrl);
        res.put("kind", "images");
        res.put("images", items);
        res.put("gdlUrl", pageUrl);
        // --range zählt pro Ausleser; bei aufgelösten Unter-Links passt die Nummerierung nicht → alles laden
        res.put("gdlRange", sameExtractor);
        String t = title == null ? "" : title.replaceAll("\\s+", " ").trim();
        res.put("title", t.length() > 0 ? (t.length() > 100 ? t.substring(0, 99).trim() + "…" : t)
                : uploader != null ? "Beitrag von " + uploader : Links.host(pageUrl));
        if (uploader != null) res.put("uploader", uploader);
        for (int i = 0; i < items.length(); i++) {
            if ("image".equals(items.getJSONObject(i).getString("type"))) {
                res.put("thumbnail", items.getJSONObject(i).getString("url"));
                break;
            }
        }
        return res;
    }

    private static boolean isVideo(String ext, String url) {
        for (String v : VIDEO_EXT) {
            if (v.equals(ext)) return true;
        }
        return ext.length() == 0 && url.toLowerCase(Locale.ROOT).matches(".*\\.(mp4|webm|mov|m3u8)(\\?.*)?$");
    }

    private static String firstText(JSONObject meta, String[] keys) {
        for (String k : keys) {
            Object v = meta == null ? null : meta.opt(k);
            if (v instanceof String && ((String) v).trim().length() > 0) return ((String) v).trim();
        }
        return null;
    }

    /** Nutzername aus "author"/"user" (Text oder Objekt mit name/nick/username). */
    private static String user(JSONObject meta) {
        for (String k : USER_KEYS) {
            Object v = meta == null ? null : meta.opt(k);
            if (v instanceof String && ((String) v).trim().length() > 0) return ((String) v).trim();
            if (v instanceof JSONObject) {
                JSONObject o = (JSONObject) v;
                String n = Json.str(o, "username", Json.str(o, "screen_name", Json.str(o, "name", Json.str(o, "nick"))));
                if (n != null) return n;
            }
        }
        return null;
    }

    /** Verständliche Meldung aus den Fehlerzeilen von gallery-dl ("[instagram][error] …"). */
    static String friendlyError(String err, String fallback) {
        String e = err == null ? "" : err;
        String l = e.toLowerCase(java.util.Locale.ROOT);
        if (l.contains("unsupported url") || l.contains("no suitable extractor")) return "Dieser Link wird nicht unterstützt.";
        if (l.contains("login required") || l.contains("authrequired") || l.contains("authentication") || l.contains("authorization")
                || l.contains("cookies")) {
            return "Diese Seite zeigt den Beitrag nur angemeldet. Melde dich unter „Mehr → Anmeldung“ an.";
        }
        if (l.contains("404") || l.contains("not found") || l.contains("notfounderror")) return "Beitrag nicht gefunden (gelöscht oder privat).";
        if (l.contains("429") || l.contains("rate limit")) return "Zu viele Anfragen – bitte später erneut versuchen.";
        int i = e.lastIndexOf("[error]");
        if (i >= 0) {
            String rest = e.substring(i + 7).trim();
            int nl = rest.indexOf('\n');
            return nl > 0 ? rest.substring(0, nl) : rest;
        }
        return fallback;
    }
}

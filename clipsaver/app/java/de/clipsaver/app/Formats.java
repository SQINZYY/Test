package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Wählt aus den Infos von yt-dlp (-J) die Formate für die Stufen 1080p / 1440p / 4K aus: welches Video-
 * und welches Tonformat geladen wird, ob es die Stufe überhaupt gibt und wie groß die Datei ungefähr wird.
 * Die gewählten Format-IDs bekommt yt-dlp beim Download direkt (-f 137+140), damit Anzeige und Download
 * übereinstimmen; {@link #sortFor(int)} ist nur der Ersatz, falls es die IDs nicht mehr gibt. (Ohne Android-Klassen.)
 *
 * Stufe eines Formats: kürzere Bildseite, bei sehr breiten/hohen Videos die längere Seite umgerechnet auf
 * 16:9. So ist 1080×1920 (Hochkant) 1080p und 3840×1600 (Kino-Breitbild) 4K.
 */
final class Formats {

    static final int[] TARGETS = {1080, 1440, 2160};

    private Formats() {
    }

    /**
     * Ersatz-Sortierung für yt-dlp (-S), falls die gewählten IDs fehlen. res = kürzere Bildseite.
     * Bis 1080p wird H.264 bevorzugt (läuft auf jedem Handy und in jeder Schnitt-App), darüber VP9, weil
     * YouTube 1440p/4K nur als VP9 oder AV1 anbietet und VP9 deutlich mehr Handys flüssig abspielen.
     * Ton bevorzugt AAC (m4a), damit alles in eine MP4-Datei passt.
     */
    static String sortFor(int target) {
        return "res:" + target + ",vcodec:" + (target <= 1080 ? "h264" : "vp9") + ",acodec:m4a";
    }

    static JSONObject summarize(JSONObject info) throws Exception {
        JSONObject out = new JSONObject();
        out.put("source", "ytdlp");
        out.put("platform", platform(info));
        out.put("id", Json.str(info, "id"));
        out.put("title", Json.str(info, "title", Json.str(info, "id", "Video")));
        String uploader = Json.str(info, "uploader", Json.str(info, "channel", Json.str(info, "creator")));
        if (uploader != null) out.put("uploader", uploader);
        double duration = Json.num(info, "duration");
        if (duration > 0) out.put("duration", duration);
        out.put("pageUrl", Json.str(info, "webpage_url", Json.str(info, "original_url", Json.str(info, "url"))));
        String thumb = bestThumbnail(info);
        if (thumb != null) {
            out.put("thumbnail", thumb);
            out.put("thumbnailFallback", thumbnailFallbacks(info, thumb));
        }

        if ("playlist".equals(Json.str(info, "_type"))) {
            out.put("kind", "playlist");
            JSONArray entries = new JSONArray();
            JSONArray list = info.optJSONArray("entries");
            for (int i = 0; list != null && i < list.length() && entries.length() < 200; i++) {
                JSONObject e = list.optJSONObject(i);
                String url = Json.str(e, "url", Json.str(e, "webpage_url"));
                if (url == null) continue;
                JSONObject o = new JSONObject();
                o.put("url", url);
                o.put("title", Json.str(e, "title", "Video " + (i + 1)));
                if (Json.num(e, "duration") > 0) o.put("duration", Json.num(e, "duration"));
                entries.put(o);
            }
            out.put("entries", entries);
            out.put("count", Math.max(entries.length(), (long) Json.num(info, "playlist_count")));
            return out;
        }

        List<JSONObject> videos = new ArrayList<>();
        List<JSONObject> audios = new ArrayList<>();
        JSONArray formats = info.optJSONArray("formats");
        if (formats == null) formats = new JSONArray().put(info);
        // TikTok: das Tonformat "audio" ist nur die Hintergrundmusik, nicht der Ton des Videos
        boolean tiktok = "tiktok".equals(out.optString("platform"));
        for (int i = 0; i < formats.length(); i++) {
            JSONObject f = formats.optJSONObject(i);
            if (f == null || isStoryboard(f)) continue;
            if (hasVideo(f)) videos.add(f);
            else if (hasAudio(f) && !(tiktok && "audio".equals(Json.str(f, "format_id")))) audios.add(f);
        }
        int maxRes = 0;
        for (JSONObject f : videos) maxRes = Math.max(maxRes, tier(f));
        out.put("maxRes", maxRes);
        out.put("kind", videos.isEmpty() ? (audios.isEmpty() ? "none" : "audio") : "video");

        JSONObject audio = bestAudio(audios);
        long audioSize = audio == null ? 0 : size(audio, duration);
        JSONArray qualities = new JSONArray();
        for (int target : TARGETS) {
            JSONObject q = new JSONObject();
            q.put("target", target);
            JSONObject v = pick(videos, target);
            q.put("available", v != null && tier(v) >= target * 0.9);
            if (v != null) describe(q, v, audio, audioSize, duration);
            qualities.put(q);
        }
        out.put("qualities", qualities);
        // Video kleiner als 1080p (z. B. 720p): beste vorhandene Fassung
        if (maxRes > 0 && maxRes < TARGETS[0]) {
            JSONObject low = new JSONObject();
            low.put("target", maxRes);
            describe(low, pick(videos, maxRes), audio, audioSize, duration);
            out.put("low", low);
        }
        if (audio != null) {
            out.put("audioSize", audioSize);
            out.put("audioFormat", Json.str(audio, "format_id"));
        }
        return out;
    }

    /** Auflösung, Codec, Größe und die Format-IDs für yt-dlp ("137+140" bzw. "18", wenn das Video Ton hat). */
    private static void describe(JSONObject q, JSONObject v, JSONObject audio, long audioSize, double duration) throws Exception {
        q.put("res", tier(v));
        q.put("width", Json.lng(v, "width"));
        q.put("height", Json.lng(v, "height"));
        q.put("fps", Json.num(v, "fps"));
        q.put("vcodec", Json.str(v, "vcodec", ""));
        boolean merge = !hasAudio(v) && audio != null;
        String id = Json.str(v, "format_id");
        // Video ohne Ton und kein passendes Tonformat: yt-dlp selbst wählen lassen statt stumm zu laden
        if (id != null && (hasAudio(v) || merge)) q.put("format", merge ? id + "+" + Json.str(audio, "format_id") : id);
        long s = size(v, duration);
        if (s > 0) q.put("size", s + (merge ? audioSize : 0));
    }

    static String platform(JSONObject info) {
        String key = Json.str(info, "extractor_key", Json.str(info, "ie_key", "")).toLowerCase(Locale.ROOT);
        if (key.startsWith("youtube")) return "youtube";
        if (key.startsWith("tiktok")) return "tiktok";
        String url = Json.str(info, "webpage_url", "");
        if (Links.isYouTube(url)) return "youtube";
        if (Links.isTikTok(url)) return "tiktok";
        return key.length() > 0 ? key : "other";
    }

    static boolean hasVideo(JSONObject f) {
        String v = Json.str(f, "vcodec");
        if ("none".equals(v)) return false;
        return v != null || Json.num(f, "height") > 0 || Json.num(f, "width") > 0;
    }

    static boolean hasAudio(JSONObject f) {
        String a = Json.str(f, "acodec");
        return a != null && !"none".equals(a);
    }

    private static boolean isStoryboard(JSONObject f) {
        return "mhtml".equals(Json.str(f, "ext")) || Json.str(f, "format_id", "").startsWith("sb");
    }

    /** Kürzere Bildseite; ersatzweise Höhe, "1920x1080" oder "1080p" aus der Formatbeschreibung. */
    static int res(JSONObject f) {
        int w = (int) Json.num(f, "width"), h = (int) Json.num(f, "height");
        if (w > 0 && h > 0) return Math.min(w, h);
        if (h > 0) return h;
        String r = Json.str(f, "resolution", "");
        int x = r.indexOf('x');
        if (x > 0) {
            try {
                return Math.min(Integer.parseInt(r.substring(0, x)), Integer.parseInt(r.substring(x + 1)));
            } catch (NumberFormatException ignored) {
                // weiter unten
            }
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d{3,4})p").matcher(Json.str(f, "format_note", ""));
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    /** Stufe: kürzere Seite, aber mindestens die längere Seite auf 16:9 umgerechnet (3840×1600 → 2160). */
    static int tier(JSONObject f) {
        int w = (int) Json.num(f, "width"), h = (int) Json.num(f, "height");
        if (w > 0 && h > 0) return Math.max(Math.min(w, h), Math.round(Math.max(w, h) * 9f / 16f));
        return res(f);
    }

    /** Beste Fassung bis zur Stufe (kleine Toleranz für krumme Größen), sonst die kleinste darüber. */
    static JSONObject pick(List<JSONObject> videos, int target) {
        JSONObject best = null;
        for (JSONObject f : videos) {
            if (tier(f) <= target * 1.05 && better(f, best, target, false)) best = f;
        }
        if (best != null) return best;
        for (JSONObject f : videos) {
            if (better(f, best, target, true)) best = f;
        }
        return best;
    }

    private static boolean better(JSONObject f, JSONObject best, int target, boolean above) {
        if (best == null) return true;
        int c = Integer.compare(tier(f), tier(best));
        if (above) c = -c;
        if (c != 0) return c > 0;
        // gleiche Stufe: Fassung mit Ton zuerst (TikTok hat auch stumme HEVC-Fassungen)
        c = Boolean.compare(hasAudio(f), hasAudio(best));
        if (c != 0) return c > 0;
        c = Integer.compare(codecRank(Json.str(f, "vcodec", ""), target), codecRank(Json.str(best, "vcodec", ""), target));
        if (c != 0) return c > 0;
        c = Double.compare(Json.num(f, "fps"), Json.num(best, "fps"));
        if (c != 0) return c > 0;
        return Json.num(f, "tbr") > Json.num(best, "tbr");
    }

    static int codecRank(String vcodec, int target) {
        String c = vcodec.toLowerCase(Locale.ROOT);
        boolean vp9 = c.startsWith("vp9") || c.startsWith("vp09");
        boolean hdrVp9 = c.startsWith("vp09.02") || c.startsWith("vp9.2");
        boolean hevc = c.startsWith("hev") || c.startsWith("hvc") || c.contains("h265") || c.contains("bytevc1");
        boolean avc = c.startsWith("avc") || c.contains("h264");
        if (target <= 1080) {
            if (avc) return 5;
            if (hevc) return 4;
            if (vp9 && !hdrVp9) return 3;
            if (hdrVp9) return 2;
            return c.startsWith("av01") ? 1 : 0;
        }
        if (vp9 && !hdrVp9) return 5;
        if (hevc) return 4;
        if (avc) return 3;
        if (hdrVp9) return 2;
        return c.startsWith("av01") ? 1 : 0;
    }

    /**
     * Ton: zuerst die Originalsprache (yt-dlp: language_preference), keine "DRC"-Fassung (komprimierte
     * Lautstärke), dann AAC/m4a vor Opus und zuletzt die höhere Bitrate.
     */
    static JSONObject bestAudio(List<JSONObject> audios) {
        JSONObject best = null;
        for (JSONObject f : audios) {
            if (best == null || audioBetter(f, best)) best = f;
        }
        return best;
    }

    private static boolean audioBetter(JSONObject f, JSONObject best) {
        int c = Double.compare(Json.num(f, "language_preference"), Json.num(best, "language_preference"));
        if (c != 0) return c > 0;
        c = Boolean.compare(!isDrc(f), !isDrc(best));
        if (c != 0) return c > 0;
        c = Boolean.compare(Json.str(f, "acodec", "").startsWith("mp4a"), Json.str(best, "acodec", "").startsWith("mp4a"));
        if (c != 0) return c > 0;
        return Json.num(f, "abr") + Json.num(f, "tbr") > Json.num(best, "abr") + Json.num(best, "tbr");
    }

    private static boolean isDrc(JSONObject f) {
        return Json.str(f, "format_id", "").contains("drc") || Json.str(f, "format_note", "").toLowerCase(Locale.ROOT).contains("drc");
    }

    static long size(JSONObject f, double duration) {
        double s = Json.num(f, "filesize");
        if (s <= 0) s = Json.num(f, "filesize_approx");
        if (s <= 0 && duration > 0) s = Json.num(f, "tbr") * 1000 / 8 * duration;
        return (long) s;
    }

    /** yt-dlp setzt "thumbnail" auf das beste Vorschaubild (= letztes der Liste). */
    static String bestThumbnail(JSONObject info) {
        String t = Json.str(info, "thumbnail");
        if (t != null) return t;
        JSONArray thumbs = info.optJSONArray("thumbnails");
        for (int i = thumbs == null ? -1 : thumbs.length() - 1; i >= 0; i--) {
            String url = Json.str(thumbs.optJSONObject(i), "url");
            if (url != null) return url;
        }
        return null;
    }

    /** Weitere Vorschaubilder als Ersatz, falls das beste nicht existiert (z. B. maxresdefault.jpg bei alten Videos). */
    static JSONArray thumbnailFallbacks(JSONObject info, String best) {
        JSONArray out = new JSONArray();
        JSONArray thumbs = info.optJSONArray("thumbnails");
        for (int i = thumbs == null ? -1 : thumbs.length() - 1; i >= 0 && out.length() < 4; i--) {
            String url = Json.str(thumbs.optJSONObject(i), "url");
            if (url != null && !url.equals(best) && !url.contains(".webp")) out.put(url);
        }
        return out;
    }
}

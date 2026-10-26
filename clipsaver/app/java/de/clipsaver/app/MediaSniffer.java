package de.clipsaver.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Erkennt im eingebauten Browser, welche geladenen Adressen Videos, Bilder, HLS-Streams oder eingebettete
 * YouTube-Videos sind – so lassen sich z. B. Anzeigen aus der TikTok-Werbebibliothek oder dem
 * Google-Anzeigen-Transparenzcenter speichern, auch reine Bild-Werbung. (Ohne Android-Klassen, damit testbar.)
 */
final class MediaSniffer {

    static final String VIDEO = "video";
    static final String IMAGE = "image";
    static final String HLS = "hls";
    static final String YOUTUBE = "youtube";

    private static final Pattern YT = Pattern.compile(
            "(?:youtube(?:-nocookie)?\\.com/(?:embed/|watch\\?(?:.*&)?v=|shorts/)|youtu\\.be/|ytimg\\.com/vi(?:_webp)?/)([\\w-]{11})(?![\\w-])");
    private static final Pattern IMAGE_EXT = Pattern.compile("\\.(jpe?g|png|webp|gif|avif|heic|bmp)$");
    private static final Pattern VIDEO_EXT = Pattern.compile("\\.(mp4|m4v|webm|mov|mkv)$");

    private MediaSniffer() {
    }

    /** {art, adresse, schlüssel zum Entdoppeln} oder null, wenn die Adresse kein brauchbares Medium ist. */
    static String[] classify(String url, String accept) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return null;
        String lower = url.toLowerCase(Locale.ROOT);
        String id = youTubeId(url);
        if (id != null) return new String[]{YOUTUBE, "https://www.youtube.com/watch?v=" + id, "yt:" + id};
        if (isNoise(lower)) return null;
        String path = pathOf(lower);
        String host = Links.host(lower);
        String kind = null;
        if (path.endsWith(".m3u8")) kind = HLS;
        else if (VIDEO_EXT.matcher(path).find()) kind = VIDEO;
        else if (IMAGE_EXT.matcher(path).find()) kind = IMAGE;
        else if (lower.contains("mime_type=video") || lower.contains("/video/tos/")) kind = VIDEO;
        else if (lower.contains("googlesyndication.com/simgad/") || lower.contains("/archive/simgad/") || lower.contains("~tplv-")
                || host.endsWith("ggpht.com") || (host.endsWith("googleusercontent.com") && host.startsWith("lh"))) kind = IMAGE;
        else if (accept != null && accept.startsWith("image/")) kind = IMAGE;
        else if (accept != null && accept.startsWith("video/")) kind = VIDEO;
        if (kind == null) return null;
        // YouTube-Videoteile (googlevideo.com) sind einzelne Bruchstücke ohne Ton – unbrauchbar
        if (host.endsWith("googlevideo.com")) return null;
        String full = IMAGE.equals(kind) ? YouTubePosts.fullSize(url) : url;
        return new String[]{kind, full, key(kind, full)};
    }

    static String youTubeId(String url) {
        if (url == null) return null;
        Matcher m = YT.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    /** Signierte CDN-Adressen (TikTok) unterscheiden sich bei jeder Anfrage nur in den Parametern. */
    static String key(String kind, String url) {
        String h = Links.host(url);
        if (h.contains("tiktok") || h.contains("byteoversea") || h.contains("ibyteimg") || h.contains("muscdn")) {
            return kind + ":" + pathOf(url);
        }
        int hash = url.indexOf('#');
        return kind + ":" + (hash >= 0 ? url.substring(0, hash) : url);
    }

    private static String pathOf(String url) {
        int s = url.indexOf("://");
        int slash = url.indexOf('/', s < 0 ? 0 : s + 3);
        if (slash < 0) return "/";
        int q = url.indexOf('?', slash);
        return url.substring(slash, q < 0 ? url.length() : q);
    }

    /** Icons, Zählpixel und Werbe-Tracking. Kleine Bilder filtert zusätzlich die Oberfläche nach dem Laden. */
    static boolean isNoise(String lower) {
        String path = pathOf(lower);
        if (path.endsWith(".svg") || path.endsWith(".ico") || path.contains("favicon")) return true;
        if (path.contains("/pixel") || path.contains("1x1") || path.contains("spacer") || path.contains("sprite")) return true;
        String h = Links.host(lower);
        return h.contains("google-analytics") || h.contains("doubleclick.net") || h.contains("googletagmanager")
                || h.contains("facebook.com") || h.contains("bat.bing") || h.contains("analytics")
                || path.contains("/pagead/") || path.contains("/collect") || path.contains("/beacon");
    }
}

package de.clipsaver.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Erkennt Links in geteiltem Text und ordnet sie TikTok, YouTube oder Werbebibliotheken zu. (Ohne Android-Klassen, damit testbar.) */
final class Links {

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"'`]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIKTOK_ID = Pattern.compile("/(?:video|photo|v)/(\\d{8,})");
    private static final Pattern TIKTOK_USER = Pattern.compile("/@([\\w.-]+)");
    private static final Pattern YT_ID = Pattern.compile(
            "(?:[?&]v=|youtu\\.be/|/shorts/|/embed/|/live/|/v/|/e/)([\\w-]{11})(?![\\w-])");
    private static final Pattern YT_POST = Pattern.compile("(?:/post/|[?&]lb=)(Ug[\\w-]{10,})");

    private Links() {
    }

    /** Erste http(s)-Adresse im Text, z. B. aus "Schau dir das an! https://vm.tiktok.com/ZM.../ #fyp". */
    static String findUrl(String text) {
        if (text == null) return null;
        Matcher m = URL.matcher(text.trim());
        if (m.find()) return trimUrl(m.group());
        // Link ohne Schema, z. B. "www.tiktok.com/@a/video/1" oder "youtu.be/abc"
        Matcher bare = Pattern.compile("(?:www\\.|m\\.|vm\\.|vt\\.)?(?:tiktok\\.com|youtube\\.com|youtu\\.be)/[^\\s<>\"']+",
                Pattern.CASE_INSENSITIVE).matcher(text);
        return bare.find() ? "https://" + trimUrl(bare.group()) : null;
    }

    private static String trimUrl(String url) {
        // Satzzeichen am Ende gehören fast nie zum Link
        while (url.length() > 0 && ".,;:!?)]}…".indexOf(url.charAt(url.length() - 1)) >= 0) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    static String host(String url) {
        if (url == null) return "";
        String u = url.toLowerCase(Locale.ROOT);
        int s = u.indexOf("://");
        if (s >= 0) u = u.substring(s + 3);
        int end = u.length();
        for (char c : new char[]{'/', '?', '#', ':'}) {
            int i = u.indexOf(c);
            if (i >= 0 && i < end) end = i;
        }
        u = u.substring(0, end);
        int at = u.lastIndexOf('@');
        return at >= 0 ? u.substring(at + 1) : u;
    }

    private static boolean hostIs(String url, String domain) {
        String h = host(url);
        return h.equals(domain) || h.endsWith("." + domain);
    }

    static boolean isTikTok(String url) {
        return hostIs(url, "tiktok.com") && !isAdLibrary(url);
    }

    static boolean isYouTube(String url) {
        return hostIs(url, "youtube.com") || hostIs(url, "youtu.be") || hostIs(url, "youtube-nocookie.com");
    }

    static String platform(String url) {
        if (isAdLibrary(url)) return "ads";
        if (isTikTok(url)) return "tiktok";
        if (isYouTube(url)) return "youtube";
        return "other";
    }

    /** vm.tiktok.com/…, vt.tiktok.com/…, tiktok.com/t/… leiten erst auf den eigentlichen Beitrag weiter. */
    static boolean isTikTokShort(String url) {
        String h = host(url);
        if (h.equals("vm.tiktok.com") || h.equals("vt.tiktok.com")) return true;
        return isTikTok(url) && url.matches("(?i)https?://[^/]+/t/\\w+.*");
    }

    static boolean isTikTokPhoto(String url) {
        return isTikTok(url) && url.contains("/photo/");
    }

    static String tikTokId(String url) {
        if (url == null) return null;
        Matcher m = TIKTOK_ID.matcher(url);
        if (m.find()) return m.group(1);
        Matcher q = Pattern.compile("[?&](?:item_id|share_item_id|aweme_id)=(\\d{8,})").matcher(url);
        return q.find() ? q.group(1) : null;
    }

    static String tikTokUser(String url) {
        Matcher m = TIKTOK_USER.matcher(url == null ? "" : url);
        return m.find() ? m.group(1) : null;
    }

    static String youTubeVideoId(String url) {
        if (url == null || !isYouTube(url)) return null;
        Matcher m = YT_ID.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    /** Community-Beitrag: youtube.com/post/Ug… oder …/community?lb=Ug… */
    static String youTubePostId(String url) {
        if (url == null || !isYouTube(url)) return null;
        Matcher m = YT_POST.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    /**
     * Werbebibliotheken, in denen man Anzeigen von TikTok und YouTube/Google findet. Diese Seiten werden im
     * eingebauten Browser geöffnet, der die Videos und Bilder der Anzeigen erkennt.
     */
    static boolean isAdLibrary(String url) {
        String h = host(url);
        String u = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return h.equals("library.tiktok.com")
                || (h.equals("ads.tiktok.com") && u.contains("creativecenter"))
                || h.equals("adstransparency.google.com");
    }
}

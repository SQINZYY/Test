package de.clipsaver.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Erkennt Links in geteiltem Text und ordnet sie Plattformen (TikTok, YouTube, Instagram, X …) zu. (Ohne Android-Klassen, damit testbar.) */
final class Links {

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"'`]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIKTOK_ID = Pattern.compile("/(?:video|photo|v)/(\\d{8,})");
    private static final Pattern TIKTOK_USER = Pattern.compile("/@([\\w.-]+)");
    private static final Pattern YT_ID = Pattern.compile(
            "(?:[?&]v=|youtu\\.be/|/shorts/|/embed/|/live/|/v/|/e/)([\\w-]{11})(?![\\w-])");
    private static final Pattern YT_POST = Pattern.compile("(?:/post/|[?&]lb=)(Ug[\\w-]{10,})");
    private static final Pattern TWEET_ID = Pattern.compile("/status(?:es)?/(\\d{5,})");
    private static final Pattern INSTA_CODE = Pattern.compile("instagram\\.com/(?:[\\w.-]+/)?(?:p|reels?|tv)/([\\w-]{5,})", Pattern.CASE_INSENSITIVE);

    /** Domain → Plattform-Kürzel (für Anzeige, Anmelde-Hinweise und eigene Auslese). */
    private static final String[][] PLATFORMS = {
            {"instagram.com", "instagram"}, {"instagr.am", "instagram"},
            {"x.com", "twitter"}, {"twitter.com", "twitter"}, {"fxtwitter.com", "twitter"}, {"vxtwitter.com", "twitter"},
            {"fixupx.com", "twitter"}, {"fixvx.com", "twitter"},
            {"facebook.com", "facebook"}, {"fb.watch", "facebook"}, {"fb.com", "facebook"},
            {"reddit.com", "reddit"}, {"redd.it", "reddit"},
            {"pinterest.com", "pinterest"}, {"pinterest.de", "pinterest"}, {"pin.it", "pinterest"},
            {"snapchat.com", "snapchat"}, {"threads.net", "threads"}, {"threads.com", "threads"},
            {"bsky.app", "bluesky"}, {"vimeo.com", "vimeo"}, {"twitch.tv", "twitch"}, {"tumblr.com", "tumblr"},
            {"linkedin.com", "linkedin"}, {"dailymotion.com", "dailymotion"}, {"dai.ly", "dailymotion"},
            {"soundcloud.com", "soundcloud"}, {"imgur.com", "imgur"}, {"flickr.com", "flickr"}, {"vk.com", "vk"},
            {"bilibili.com", "bilibili"}, {"kick.com", "kick"}, {"9gag.com", "9gag"}, {"likee.video", "likee"},
    };
    /** Kurzlinks, die erst auf die eigentliche Seite weiterleiten. */
    private static final String[] SHORTENERS = {"t.co", "pin.it", "redd.it", "bit.ly", "tinyurl.com", "ow.ly", "buff.ly",
            "dlvr.it", "goo.gl", "is.gd", "lnkd.in", "instagr.am", "fb.me", "trib.al", "shorturl.at", "rb.gy", "cutt.ly"};

    private Links() {
    }

    /** Erste http(s)-Adresse im Text, z. B. aus "Schau dir das an! https://vm.tiktok.com/ZM.../ #fyp". */
    static String findUrl(String text) {
        if (text == null) return null;
        Matcher m = URL.matcher(text.trim());
        if (m.find()) return trimUrl(m.group());
        // Link ohne Schema, z. B. "www.instagram.com/p/abc" oder "youtu.be/abc"
        Matcher bare = Pattern.compile("(?<![\\w@.-])(?:[a-z0-9-]+\\.)+[a-z]{2,}/[^\\s<>\"']+", Pattern.CASE_INSENSITIVE).matcher(text);
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
        for (String[] p : PLATFORMS) {
            if (hostIs(url, p[0])) return p[1];
        }
        return "other";
    }

    static boolean isShortener(String url) {
        String h = host(url);
        if (h.startsWith("www.")) h = h.substring(4);
        for (String s : SHORTENERS) {
            if (h.equals(s)) return true;
        }
        return false;
    }

    /** Beitrags-ID auf X/Twitter: x.com/nutzer/status/123… (auch fxtwitter, vxtwitter …). */
    static String tweetId(String url) {
        if (!"twitter".equals(platform(url))) return null;
        Matcher m = TWEET_ID.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    /** Kürzel eines Instagram-Beitrags: instagram.com/p/…, /reel/…, /tv/… */
    static String instagramCode(String url) {
        if (url == null || !"instagram".equals(platform(url))) return null;
        Matcher m = INSTA_CODE.matcher(url);
        return m.find() ? m.group(1) : null;
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
     * Werbebibliotheken, in denen man Anzeigen von TikTok, YouTube/Google und Instagram/Facebook (Meta) findet. Diese Seiten werden im
     * eingebauten Browser geöffnet, der die Videos und Bilder der Anzeigen erkennt.
     */
    static boolean isAdLibrary(String url) {
        String h = host(url);
        String u = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return h.equals("library.tiktok.com")
                || (h.equals("ads.tiktok.com") && u.contains("creativecenter"))
                || h.equals("adstransparency.google.com")
                || (h.endsWith("facebook.com") && u.contains("/ads/library"));
    }
}

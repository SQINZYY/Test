package de.clipsaver.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Erkennt Links in geteiltem oder eingefügtem Text und ordnet sie Plattformen (TikTok, YouTube, Instagram, X …) zu:
 * sucht alle Links im Text und nimmt den passendsten (Beitrag vor Profil), entfernt angehängte Satzzeichen, Emojis
 * und Anführungszeichen, packt Weiterleitungen aus (google.com/url, l.instagram.com …), entfernt Tracking-Anhängsel
 * und erkennt Teilen-/Kurzlinks, die erst aufgelöst werden müssen. (Ohne Android-Klassen, damit testbar.)
 */
final class Links {

    /**
     * Zeichen, die nie zu einer Adresse gehören: Leerraum (auch geschützte und unsichtbare Leerzeichen), Emojis und
     * Symbole, Steuerzeichen, Anführungszeichen aller Sprachen, spitze/geschweifte Klammern, Satzzeichen voller Breite.
     */
    private static final String STOP = "\\s\\p{Z}\\p{So}\\p{Cc}\\p{Cf}<>\"'`“”„‚‘’«»‹›「」『』【】〈〉《》|{}\\\\^\\u3000-\\u303F\\uFF00-\\uFFEF\\uFE0F";
    private static final Pattern URL = Pattern.compile("(?:https?://|(?<![\\w@.:/-])www\\.)[^" + STOP + "]+", Pattern.CASE_INSENSITIVE);
    /** Link ohne Schema, z. B. "instagram.com/p/abc" oder "youtu.be/abc" (nicht in E-Mail-Adressen) */
    private static final Pattern BARE = Pattern.compile("(?<![\\w@.:/-])(?:[a-z0-9-]+\\.)+[a-z]{2,24}/[^" + STOP + "]*", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIKTOK_ID = Pattern.compile("/(?:video|photo|v|embed(?:/v2)?)/(\\d{8,})");
    private static final Pattern TIKTOK_USER = Pattern.compile("/@([\\w.-]+)");
    private static final Pattern YT_ID = Pattern.compile(
            "(?:[?&]v=|youtu\\.be/|/shorts/|/embed/|/live/|/v/|/e/)([\\w-]{11})(?![\\w-])");
    private static final Pattern YT_POST = Pattern.compile("(?:/post/|[?&]lb=)(Ug[\\w-]{10,})");
    private static final Pattern TWEET_ID = Pattern.compile("/status(?:es)?/(\\d{5,})");
    private static final Pattern INSTA_CODE = Pattern.compile("instagram\\.com/(?:[\\w.-]+/)?(?:p|reels?|tv)/([\\w-]{5,})", Pattern.CASE_INSENSITIVE);
    private static final Pattern PINTEREST = Pattern.compile("(?:^|\\.)pinterest\\.(?:com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})$");
    /** Pfade, die auf einen einzelnen Beitrag zeigen (für die Auswahl unter mehreren Links) */
    private static final Pattern CONTENT_PATH = Pattern.compile(
            "/(?:video|videos|watch|reel|reels|p|tv|pin|comments|post|posts|status|clip|clips|spotlight|story|stories|photo|photos|shorts|embed|media)(?:/|\\?|$)",
            Pattern.CASE_INSENSITIVE);

    /** Domain → Plattform-Kürzel (für Anzeige, Anmelde-Hinweise und eigene Auslese). */
    private static final String[][] PLATFORMS = {
            {"instagram.com", "instagram"}, {"instagr.am", "instagram"},
            {"x.com", "twitter"}, {"twitter.com", "twitter"}, {"fxtwitter.com", "twitter"}, {"vxtwitter.com", "twitter"},
            {"fixupx.com", "twitter"}, {"fixvx.com", "twitter"},
            {"facebook.com", "facebook"}, {"fb.watch", "facebook"}, {"fb.com", "facebook"}, {"fb.gg", "facebook"},
            {"reddit.com", "reddit"}, {"redd.it", "reddit"},
            {"pin.it", "pinterest"},
            {"snapchat.com", "snapchat"}, {"threads.net", "threads"}, {"threads.com", "threads"},
            {"bsky.app", "bluesky"}, {"vimeo.com", "vimeo"}, {"twitch.tv", "twitch"}, {"tumblr.com", "tumblr"},
            {"linkedin.com", "linkedin"}, {"lnkd.in", "linkedin"}, {"dailymotion.com", "dailymotion"}, {"dai.ly", "dailymotion"},
            {"soundcloud.com", "soundcloud"}, {"imgur.com", "imgur"}, {"flickr.com", "flickr"}, {"flic.kr", "flickr"},
            {"vk.com", "vk"}, {"bilibili.com", "bilibili"}, {"b23.tv", "bilibili"}, {"douyin.com", "douyin"},
            {"kick.com", "kick"}, {"9gag.com", "9gag"}, {"likee.video", "likee"},
    };
    private static final String[][] NAMES = {
            {"tiktok", "TikTok"}, {"youtube", "YouTube"}, {"instagram", "Instagram"}, {"twitter", "X"}, {"facebook", "Facebook"},
            {"reddit", "Reddit"}, {"pinterest", "Pinterest"}, {"snapchat", "Snapchat"}, {"threads", "Threads"}, {"bluesky", "Bluesky"},
            {"vimeo", "Vimeo"}, {"twitch", "Twitch"}, {"tumblr", "Tumblr"}, {"linkedin", "LinkedIn"}, {"dailymotion", "Dailymotion"},
            {"soundcloud", "SoundCloud"}, {"imgur", "Imgur"}, {"flickr", "Flickr"}, {"vk", "VK"}, {"bilibili", "Bilibili"},
            {"douyin", "Douyin"}, {"kick", "Kick"}, {"9gag", "9GAG"}, {"likee", "Likee"},
    };
    /** Kurzlinks, die erst auf die eigentliche Seite weiterleiten. */
    private static final String[] SHORTENERS = {"t.co", "pin.it", "redd.it", "bit.ly", "tinyurl.com", "ow.ly", "buff.ly",
            "dlvr.it", "goo.gl", "is.gd", "lnkd.in", "instagr.am", "fb.me", "trib.al", "shorturl.at", "rb.gy", "cutt.ly", "t.ly",
            "tiny.cc", "s.id", "b23.tv", "v.douyin.com", "on.soundcloud.com", "t.snapchat.com", "flic.kr", "fb.watch"};
    /** Tracking-Anhängsel, die überall wegkommen (dazu alle utm_…) */
    private static final Set<String> TRACKING = set("fbclid", "gclid", "dclid", "igsh", "igshid", "_branch_match_id", "_branch_referrer");
    /** … und je Plattform; nur Parameter, die nie für den Inhalt gebraucht werden */
    private static final String[][] TRACKING_BY_PLATFORM = {
            {"youtube", "si", "feature", "pp", "ab_channel", "embeds_referring_euri", "source_ve_path"},
            {"twitter", "s", "t", "ref_src", "ref_url", "xmt"},
            {"tiktok", "_r", "_t", "is_from_webapp", "sender_device", "sender_web_id", "web_id", "share_app_id", "share_link_id",
                    "u_code", "preview_pb", "timestamp", "user_id", "social_share_type", "checksum", "tt_from", "source", "enter_from",
                    "is_copy_url", "lang", "_d"},
            {"facebook", "mibextid", "rdid", "share_url", "sfnsn", "ref"},
            {"pinterest", "sender", "invite_code", "slof"},
            {"reddit", "share_id", "ref", "ref_source"},
            {"snapchat", "share_id", "sender_web_id", "locale"},
            {"threads", "xmt", "slof"},
    };

    private Links() {
    }

    private static Set<String> set(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }

    /** Der passendste Link im Text (Beitrag vor Profil/Startseite; bei Gleichstand der erste), bereinigt. */
    static String findUrl(String text) {
        List<String> all = findUrls(text);
        String best = null;
        int bestScore = -1;
        for (String u : all) {
            int s = score(u);
            if (s > bestScore) {
                best = u;
                bestScore = s;
            }
        }
        return best;
    }

    /**
     * Für die Anzeige unter dem Eingabefeld: {links: [{url, label, platform}], best: Index des passendsten Links}.
     * Ohne Link im Text ist links leer und best -1.
     */
    static JSONObject detect(String text) {
        JSONObject o = new JSONObject();
        try {
            List<String> all = findUrls(text);
            String best = findUrl(text);
            JSONArray links = new JSONArray();
            for (String u : all) {
                links.put(new JSONObject().put("url", u).put("label", describe(u)).put("platform", platform(u)));
            }
            o.put("links", links);
            o.put("best", best == null ? -1 : all.indexOf(best));
        } catch (Exception ignored) {
            // nur bei ungültigem JSON
        }
        return o;
    }

    /** Alle Links im Text in ihrer Reihenfolge, bereinigt und ohne Doppelte. */
    static List<String> findUrls(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        // unsichtbare Zeichen entfernen, HTML-&amp; aus kopiertem Quelltext auflösen
        String t = text.replaceAll("[\\u200B-\\u200D\\u2060\\uFEFF]", "").replace("&amp;", "&");
        List<int[]> spans = new ArrayList<>();
        Matcher m = URL.matcher(t);
        while (m.find()) {
            spans.add(new int[]{m.start(), m.end()});
            add(out, m.group());
        }
        Matcher b = BARE.matcher(t);
        while (b.find()) {
            boolean inside = false;
            for (int[] s : spans) {
                if (b.start() < s[1] && b.end() > s[0]) inside = true;
            }
            if (!inside) add(out, b.group());
        }
        return out;
    }

    private static void add(List<String> out, String raw) {
        String u = trimUrl(raw);
        if (u.length() < 4) return;
        if (!u.matches("(?i)^https?://.*")) u = "https://" + u;
        // Schema und Domain klein (HTTPS://WWW.YOUTUBE.COM/… → https://www.youtube.com/…), Pfad bleibt
        int s = u.indexOf("://") + 3;
        int end = s;
        while (end < u.length() && "/?#".indexOf(u.charAt(end)) < 0) end++;
        u = u.substring(0, end).toLowerCase(Locale.ROOT) + u.substring(end);
        if (host(u).indexOf('.') < 0) return;
        u = clean(u);
        if (!out.contains(u)) out.add(u);
    }

    /** Satzzeichen am Ende gehören fast nie zum Link; schließende Klammern nur, wenn keine passende öffnende im Link ist. */
    static String trimUrl(String url) {
        String u = url;
        while (u.length() > 0) {
            char c = u.charAt(u.length() - 1);
            if (".,;:!?…*~".indexOf(c) >= 0) {
                u = u.substring(0, u.length() - 1);
            } else if (c == ')' && count(u, '(') < count(u, ')')) {
                u = u.substring(0, u.length() - 1);
            } else if (c == ']' && count(u, '[') < count(u, ']')) {
                u = u.substring(0, u.length() - 1);
            } else {
                break;
            }
        }
        return u;
    }

    private static int count(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++;
        return n;
    }

    /** Weiterleitungen auspacken und Tracking-Anhängsel entfernen. */
    static String clean(String url) {
        String u = url;
        for (int i = 0; i < 4; i++) {
            String inner = unwrap(u);
            if (inner == null || inner.equals(u)) break;
            u = inner;
        }
        return stripTracking(u);
    }

    /** Adresse hinter einer Weiterleitung (google.com/url?q=…, l.instagram.com/?u=…, Anmeldeseite mit next=…) oder null. */
    static String unwrap(String url) {
        String h = host(url);
        String path = path(url);
        String target = null;
        if (h.matches("(?:www\\.)?google\\.[a-z.]+") && path.equals("/url")) target = firstParam(url, "q", "url");
        else if (h.matches("(?:www\\.)?google\\.[a-z.]+") && path.startsWith("/amp/s/")) target = "https://" + path.substring(7);
        else if (h.equals("l.facebook.com") || h.equals("lm.facebook.com") || h.equals("l.instagram.com") || h.equals("l.messenger.com")
                || h.equals("l.threads.net") || h.equals("l.threads.com")) target = param(url, "u");
        else if (hostIs(url, "youtube.com") && path.equals("/redirect")) target = param(url, "q");
        else if (hostIs(url, "youtube.com") && path.equals("/attribution_link")) {
            String rel = param(url, "u");
            if (rel != null && rel.startsWith("/")) target = "https://www.youtube.com" + rel;
        } else if (h.equals("t.umblr.com")) target = param(url, "z");
        else if (h.equals("out.reddit.com")) target = param(url, "url");
        else if (hostIs(url, "vk.com") && path.equals("/away.php")) target = param(url, "to");
        else if (hostIs(url, "linkedin.com") && path.startsWith("/redir/")) target = param(url, "url");
        else if (h.equals("href.li")) target = url.substring(url.indexOf('?') + 1);
        else if ((h.startsWith("consent.youtube.") || h.startsWith("consent.google.")) && param(url, "continue") != null) target = param(url, "continue");
        else if (path.toLowerCase(Locale.ROOT).contains("login") && param(url, "next") != null) {
            // Anmeldeseite (Instagram, Facebook, Threads …) mit dem eigentlichen Beitrag in next=
            String next = param(url, "next");
            target = next.startsWith("/") ? origin(url) + next : next;
        }
        if (target == null || !target.matches("(?i)^https?://[^/\\s]+\\..*")) return null;
        return target;
    }

    private static String stripTracking(String url) {
        int q = url.indexOf('?');
        if (q < 0) return url;
        int hash = url.indexOf('#', q);
        String base = url.substring(0, q);
        String query = hash < 0 ? url.substring(q + 1) : url.substring(q + 1, hash);
        String frag = hash < 0 ? "" : url.substring(hash);
        String plat = platform(url);
        Set<String> extra = new HashSet<>();
        for (String[] t : TRACKING_BY_PLATFORM) {
            if (t[0].equals(plat)) extra.addAll(Arrays.asList(t).subList(1, t.length));
        }
        StringBuilder kept = new StringBuilder();
        for (String p : query.split("&")) {
            if (p.length() == 0) continue;
            int eq = p.indexOf('=');
            String k = (eq < 0 ? p : p.substring(0, eq)).toLowerCase(Locale.ROOT);
            if (k.startsWith("utm_") || TRACKING.contains(k) || extra.contains(k)) continue;
            if (kept.length() > 0) kept.append('&');
            kept.append(p);
        }
        return base + (kept.length() > 0 ? "?" + kept : "") + frag;
    }

    /** Wert eines Parameters, URL-dekodiert, oder null. */
    static String param(String url, String name) {
        int q = url.indexOf('?');
        if (q < 0) return null;
        int hash = url.indexOf('#', q);
        String query = hash < 0 ? url.substring(q + 1) : url.substring(q + 1, hash);
        for (String p : query.split("&")) {
            int eq = p.indexOf('=');
            if (eq > 0 && p.substring(0, eq).equals(name)) {
                try {
                    return URLDecoder.decode(p.substring(eq + 1), "UTF-8");
                } catch (Exception e) {
                    return p.substring(eq + 1);
                }
            }
        }
        return null;
    }

    private static String firstParam(String url, String... names) {
        for (String n : names) {
            String v = param(url, n);
            if (v != null) return v;
        }
        return null;
    }

    /** Schema und Server ohne Pfad, z. B. "https://www.instagram.com" */
    static String origin(String url) {
        int s = url.indexOf("://");
        int slash = url.indexOf('/', s < 0 ? 0 : s + 3);
        return slash < 0 ? url : url.substring(0, slash);
    }

    /** Pfad ohne Parameter, z. B. "/p/abc/" */
    static String path(String url) {
        if (url == null) return "/";
        int s = url.indexOf("://");
        int slash = url.indexOf('/', s < 0 ? 0 : s + 3);
        if (slash < 0) return "/";
        int end = url.length();
        for (char c : new char[]{'?', '#'}) {
            int i = url.indexOf(c, slash);
            if (i >= 0 && i < end) end = i;
        }
        return url.substring(slash, end);
    }

    /** Wie gut passt der Link als Ziel: Beitrag (4) › Kurz-/Teilen-Link (3) › Seite mit Pfad (2) › Profil/Startseite. */
    static int score(String url) {
        if (isAdLibrary(url)) return 3;
        if (tikTokId(url) != null || youTubeVideoId(url) != null || youTubePostId(url) != null || tweetId(url) != null
                || instagramCode(url) != null) return 4;
        if (needsResolve(url)) return 3;
        String p = path(url);
        if (CONTENT_PATH.matcher(p).find()) return 3;
        if (!"other".equals(platform(url))) return p.length() > 1 ? 2 : 1;
        return p.length() > 1 ? 2 : 0;
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
        return (hostIs(url, "tiktok.com") || hostIs(url, "tiktokv.com")) && !isAdLibrary(url);
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
        if (PINTEREST.matcher(host(url)).find()) return "pinterest";
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

    /**
     * Links, die erst auf den eigentlichen Beitrag weiterleiten: Kurzlinks (t.co, pin.it, bit.ly …) und die
     * Teilen-Links der Apps (instagram.com/share/…, facebook.com/share/…, reddit.com/r/…/s/…, TikTok-Kurzlinks).
     */
    static boolean needsResolve(String url) {
        if (isShortener(url) || isTikTokShort(url)) return true;
        String p = path(url);
        String plat = platform(url);
        if ("instagram".equals(plat) && p.startsWith("/share/")) return true;
        if ("facebook".equals(plat) && p.startsWith("/share/")) return true;
        if ("reddit".equals(plat) && p.matches("/r/[^/]+/s/[^/]+/?")) return true;
        return "snapchat".equals(plat) && p.startsWith("/t/");
    }

    /**
     * Folgt einem Kurz-/Teilen-Link und liefert die bereinigte Zieladresse. Leitet die Seite nicht per HTTP weiter,
     * hilft die kanonische Adresse (og:url / link rel=canonical). Bei Fehlern bleibt der Link, wie er war.
     */
    static String resolve(String url, Http http) {
        try {
            Http.Response r = http.get(url, null);
            String target = r.url;
            if (stripTracking(target).equals(stripTracking(url)) && r.body != null) {
                String canon = canonical(r.body);
                if (canon != null) target = PageMedia.absolute(r.url, canon);
            }
            return target == null ? url : clean(target);
        } catch (Exception e) {
            return url;
        }
    }

    private static String canonical(String html) {
        Matcher m = Pattern.compile("<(?:link[^>]+rel=[\"']canonical[\"']|meta[^>]+property=[\"']og:url[\"'])[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
        while (m.find()) {
            String v = PageMedia.attr(m.group(), m.group().toLowerCase(Locale.ROOT).startsWith("<link") ? "href" : "content");
            if (v != null && v.length() > 0) return v;
        }
        return null;
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
        if (url == null || !isTikTok(url)) return null;
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

    static String platformName(String platform) {
        for (String[] n : NAMES) {
            if (n[0].equals(platform)) return n[1];
        }
        return null;
    }

    /** Kurze Beschreibung für die Anzeige unter dem Eingabefeld, z. B. "Instagram · Reel" oder "Link auf example.com". */
    static String describe(String url) {
        String plat = platform(url);
        String p = path(url).toLowerCase(Locale.ROOT);
        String name = platformName(plat);
        if ("ads".equals(plat)) return "Werbebibliothek";
        String what = null;
        switch (plat) {
            case "tiktok":
                what = isTikTokPhoto(url) ? "Foto-Post" : tikTokId(url) != null ? "Video" : isTikTokShort(url) ? "geteilter Link"
                        : p.startsWith("/@") ? "Profil" : null;
                break;
            case "youtube":
                what = youTubePostId(url) != null ? "Community-Beitrag" : p.startsWith("/shorts/") ? "Short"
                        : youTubeVideoId(url) != null ? "Video" : param(url, "list") != null ? "Playlist"
                        : p.startsWith("/@") || p.startsWith("/channel/") || p.startsWith("/c/") ? "Kanal" : null;
                break;
            case "instagram":
                what = p.startsWith("/share/") ? "geteilter Link" : p.contains("/reel") ? "Reel" : p.contains("/p/") ? "Beitrag"
                        : p.contains("/tv/") ? "Video" : p.startsWith("/stories/") ? "Story" : p.length() > 1 ? "Profil" : null;
                break;
            case "twitter":
                what = tweetId(url) != null ? "Beitrag" : p.length() > 1 ? "Profil" : null;
                break;
            case "facebook":
                what = p.startsWith("/share/") || hostIs(url, "fb.watch") ? "geteilter Link" : p.contains("/reel") ? "Reel"
                        : p.contains("/watch") || p.contains("/videos/") ? "Video" : p.contains("/photo") ? "Foto"
                        : p.contains("/posts/") || p.contains("/permalink") || p.contains("story.php") ? "Beitrag" : null;
                break;
            case "reddit":
                what = p.contains("/comments/") ? "Beitrag" : p.matches("/r/[^/]+/s/.*") || hostIs(url, "redd.it") ? "geteilter Link" : null;
                break;
            case "pinterest":
                what = p.startsWith("/pin/") ? "Pin" : hostIs(url, "pin.it") ? "geteilter Link" : null;
                break;
            default:
                if (CONTENT_PATH.matcher(p).find()) what = "Beitrag";
                break;
        }
        if (name == null) {
            String h = host(url);
            if (h.startsWith("www.")) h = h.substring(4);
            return isShortener(url) ? "Kurzlink (" + h + ")" : "Link auf " + h;
        }
        return what == null ? name : name + " · " + what;
    }
}

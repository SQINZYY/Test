package de.clipsaver.app;

import com.sun.net.httpserver.HttpServer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Tests für die Teile ohne Android-Klassen (Link-Erkennung, TikTok/YouTube-Auslese, Qualitätsauswahl,
 * Medien-Erkennung, Cookies). Aufruf: ./tools/test/run.sh
 */
public class Tests {

    private static int passed, failed;
    private static String fixtures;

    public static void main(String[] args) throws Exception {
        fixtures = args[0];
        links();
        tiktokParse();
        tiktokChallenge();
        youtubePost();
        formatsYouTube();
        formatsPortraitAndTikTok();
        formatsPlaylist();
        sniffer();
        cookies();
        httpRedirectCookies();
        linksPlatforms();
        linkRecognition();
        linkResolve();
        twitter();
        xUserLink();
        instagram();
        pageMedia();
        galleryList();
        merge();
        System.out.println(passed + " Prüfungen ok, " + failed + " fehlgeschlagen");
        if (failed > 0) System.exit(1);
    }

    static void eq(Object expected, Object actual, String what) {
        if (expected == null ? actual == null : expected.equals(actual)) {
            passed++;
        } else {
            failed++;
            System.out.println("FEHLER " + what + ": erwartet <" + expected + ">, bekommen <" + actual + ">");
        }
    }

    static void yes(boolean v, String what) {
        eq(true, v, what);
    }

    static String read(String name) throws Exception {
        return new String(Files.readAllBytes(Paths.get(fixtures, name)), StandardCharsets.UTF_8);
    }

    static void links() {
        eq("https://vm.tiktok.com/ZMabc123/", Links.findUrl("Schau mal! https://vm.tiktok.com/ZMabc123/ #fyp"), "URL aus Teilen-Text");
        eq("https://youtu.be/dQw4w9WgXcQ", Links.findUrl("https://youtu.be/dQw4w9WgXcQ."), "Punkt am Ende");
        eq("https://www.tiktok.com/@a/video/123456789012", Links.findUrl("www.tiktok.com/@a/video/123456789012"), "ohne https");
        eq(null, Links.findUrl("kein link hier"), "kein Link");
        eq("tiktok", Links.platform("https://www.tiktok.com/@user/video/7300000000000000000"), "TikTok");
        eq("tiktok", Links.platform("https://vt.tiktok.com/ZSe4FqkKd/"), "TikTok Kurzlink");
        eq("youtube", Links.platform("https://m.youtube.com/shorts/abcdefghijk"), "YouTube mobil");
        eq("ads", Links.platform("https://library.tiktok.com/ads/detail/?ad_id=123"), "TikTok-Werbebibliothek");
        eq("ads", Links.platform("https://ads.tiktok.com/business/creativecenter/topads/123/pc/de"), "Creative Center");
        eq("ads", Links.platform("https://adstransparency.google.com/advertiser/AR1?region=DE"), "Google-Transparenzcenter");
        eq("ads", Links.platform("https://www.facebook.com/ads/library/?id=123"), "Meta-Werbebibliothek");
        eq("other", Links.platform("https://www.example.com/video/123"), "andere Seite");
        eq("other", Links.platform("https://evil.com/tiktok.com/video/123"), "TikTok nur im Pfad");
        yes(Links.isTikTokShort("https://vm.tiktok.com/ZMabc/"), "vm-Kurzlink");
        yes(Links.isTikTokShort("https://www.tiktok.com/t/ZTabc/"), "/t/-Kurzlink");
        yes(!Links.isTikTokShort("https://www.tiktok.com/@a/video/123456789"), "kein Kurzlink");
        yes(Links.isTikTokPhoto("https://www.tiktok.com/@a/photo/7300000000000000001"), "Foto-Post");
        eq("7300000000000000001", Links.tikTokId("https://www.tiktok.com/@a.b/photo/7300000000000000001?is_from_webapp=1"), "TikTok-ID");
        eq("7300000000000000002", Links.tikTokId("https://m.tiktok.com/v/7300000000000000002.html"), "TikTok-ID m.");
        eq("a.b", Links.tikTokUser("https://www.tiktok.com/@a.b/video/7300000000000000001"), "TikTok-Nutzer");
        eq("dQw4w9WgXcQ", Links.youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "YouTube-ID");
        eq("dQw4w9WgXcQ", Links.youTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?si=x"), "Shorts-ID");
        eq("UgkxAbCdEfGhIjKlMnOp", Links.youTubePostId("https://www.youtube.com/post/UgkxAbCdEfGhIjKlMnOp"), "Post-ID");
        eq("UgkxAbCdEfGhIjKlMnOp", Links.youTubePostId("https://www.youtube.com/@kanal/community?lb=UgkxAbCdEfGhIjKlMnOp"), "Post-ID lb=");
    }

    static void tiktokParse() throws Exception {
        JSONObject scope = TikTok.universalData(read("tiktok-video.html"));
        yes(scope != null, "Video: Seitendaten gefunden");
        JSONObject item = Json.obj(scope, "webapp.video-detail", "itemInfo", "itemStruct");
        JSONObject r = TikTok.parseItem(item, "https://www.tiktok.com/@creator.name/video/7300000000000000000");
        eq("video", r.getString("kind"), "Video: Art");
        eq("@creator.name", r.getString("uploader"), "Video: Nutzer");
        JSONArray v = r.getJSONArray("videos");
        eq(1080L, v.getJSONObject(0).getLong("res"), "Video: beste Auflösung zuerst");
        eq("h264", v.getJSONObject(0).getString("codec"), "Video: bei gleicher Auflösung H.264 zuerst");
        eq(1, v.getJSONObject(0).getJSONArray("fallback").length(), "Video: Ersatz-CDN");
        boolean bytevc2 = false;
        for (int i = 0; i < v.length(); i++) bytevc2 |= v.getJSONObject(i).getString("codec").contains("bytevc2");
        yes(!bytevc2, "Video: bytevc2 (H.266) aussortiert");
        eq(720L, v.getJSONObject(v.length() - 2).getLong("res"), "Video: playAddr (720p)");
        eq(576L, v.getJSONObject(v.length() - 1).getLong("res"), "Video: 540p ohne Größe → 576p aus Seitenverhältnis");
        eq("https://sf16-ies-music.tiktokcdn.com/obj/music.mp3", r.getString("audioUrl"), "Video: Musik");
        eq(34.0, r.getDouble("duration"), "Video: Dauer");

        JSONObject p = TikTok.parseItem(Json.obj(TikTok.universalData(read("tiktok-photo.html")), "webapp.video-detail", "itemInfo", "itemStruct"),
                "https://www.tiktok.com/@travel.diary/photo/7300000000000000001");
        eq("images", p.getString("kind"), "Foto: Art");
        JSONArray imgs = p.getJSONArray("images");
        eq(3, imgs.length(), "Foto: Anzahl Bilder");
        yes(imgs.getJSONObject(0).getString("url").contains(".jpeg"), "Foto: JPEG zuerst");
        yes(imgs.getJSONObject(0).getJSONArray("fallback").getString(0).contains(".webp"), "Foto: WebP als Ersatz");
        eq(1440L, imgs.getJSONObject(1).getLong("height"), "Foto: Größe");
        eq(0, p.getJSONArray("videos").length(), "Foto: keine Videos");
        yes(p.getString("thumbnail").startsWith("https://"), "Foto: Vorschaubild");

        eq("Dieser TikTok-Beitrag ist privat", TikTok.statusMessage(10216), "Status privat");
    }

    static void tiktokChallenge() throws Exception {
        // Aufgabe wie bei TikTok bauen: sha256(a + "4711") == c
        byte[] a = "salt-1234".getBytes(StandardCharsets.UTF_8);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(a);
        md.update("4711".getBytes(StandardCharsets.UTF_8));
        String json = "{\"v\":{\"a\":\"" + TikTok.b64encode(a) + "\",\"c\":\"" + TikTok.b64encode(md.digest()) + "\"},\"s\":\"x\"}";
        String b64 = TikTok.b64encode(json.getBytes(StandardCharsets.UTF_8)).replace("=", "");
        String html = "<html><head><title>Please wait...</title></head><body><div id=\"cs\" class=\"" + b64 + "\"></div>"
                + "<p class=\"_wafchallengeid\" id=\"wci\"></p><span id=\"rci\" class=\"waforiginalreid\"></span><span id=\"rs\" class=\"abc123\"></span></body></html>";
        String[][] cookies = TikTok.solveChallenge(html);
        yes(cookies != null, "Aufgabe gelöst");
        eq("_wafchallengeid", cookies[0][0], "Cookie-Name");
        JSONObject solved = new JSONObject(new String(TikTok.b64decode(cookies[0][1]), StandardCharsets.UTF_8));
        eq("4711", new String(TikTok.b64decode(solved.getString("d")), StandardCharsets.UTF_8), "Lösung d");
        eq("x", solved.getString("s"), "übrige Felder erhalten");
        eq("waforiginalreid", cookies[1][0], "rci-Cookie");
        eq("abc123", cookies[1][1], "rci-Wert");
        eq(null, TikTok.solveChallenge("<html>normale Seite</html>"), "keine Aufgabe");
        eq("aGFsbG8=", TikTok.b64encode("hallo".getBytes(StandardCharsets.UTF_8)), "Base64 kodieren");
        eq("hallo", new String(TikTok.b64decode("aGFsbG8"), StandardCharsets.UTF_8), "Base64 ohne Padding");
    }

    static void youtubePost() throws Exception {
        JSONObject data = YouTubePosts.initialData(read("youtube-post.html"));
        yes(data != null, "Post: ytInitialData gefunden");
        JSONObject r = YouTubePosts.parse(data, "https://www.youtube.com/post/UgkxAAAA");
        eq("images", r.getString("kind"), "Post: Art");
        eq("Kanalname", r.getString("uploader"), "Post: Kanal");
        eq("Neues Merch ist da! Welche Farbe? \"Rot\" oder {Blau}", r.getString("title"), "Post: Text (mit Klammern/Anführungszeichen)");
        JSONArray imgs = r.getJSONArray("images");
        eq(2, imgs.length(), "Post: Bilder ohne Doppelte");
        eq("https://yt3.ggpht.com/AAA111=s0", imgs.getJSONObject(0).getString("url"), "Post: Originalgröße");
        eq("https://yt3.ggpht.com/AAA111=s1080-c-fcrop64=1,00000000ffffffff-rj", imgs.getJSONObject(0).getJSONArray("fallback").getString(0), "Post: Ersatz");
        eq("vid12345678", r.optString("videoId"), "Post: Video-Anhang");
        eq("https://lh3.googleusercontent.com/abc=s0", YouTubePosts.fullSize("https://lh3.googleusercontent.com/abc=w1200-h630-p-k-no-nu"), "fullSize w/h");
        eq("https://i.ytimg.com/vi/x/hq.jpg", YouTubePosts.fullSize("https://i.ytimg.com/vi/x/hq.jpg"), "fullSize andere Hosts");
        eq("{\"a\":\"}\\\"{\"}", YouTubePosts.jsonObjectAt("x = {\"a\":\"}\\\"{\"};", 4), "JSON-Ausschnitt mit Klammern in Strings");
    }

    static void formatsYouTube() throws Exception {
        JSONObject s = Formats.summarize(new JSONObject(read("ytdlp-youtube.json")));
        eq("youtube", s.getString("platform"), "YT: Plattform");
        eq("video", s.getString("kind"), "YT: Art");
        eq(2160, s.getInt("maxRes"), "YT: max. Auflösung");
        JSONArray q = s.getJSONArray("qualities");
        eq(1080, q.getJSONObject(0).getInt("res"), "YT 1080: Auflösung");
        eq("avc1.640028", q.getJSONObject(0).getString("vcodec"), "YT 1080: H.264");
        eq(400000000L + 12100000L, q.getJSONObject(0).getLong("size"), "YT 1080: Größe inkl. AAC-Ton");
        eq("vp9", q.getJSONObject(1).getString("vcodec"), "YT 1440: VP9");
        eq(1440, q.getJSONObject(1).getInt("res"), "YT 1440: Auflösung");
        eq("vp9", q.getJSONObject(2).getString("vcodec"), "YT 4K: VP9 statt HDR/AV1");
        yes(q.getJSONObject(2).getBoolean("available"), "YT 4K verfügbar");
        eq(12100000L, s.getLong("audioSize"), "YT: Tongröße (m4a)");
        eq("137+140", q.getJSONObject(0).getString("format"), "YT 1080: Format-IDs");
        eq("271+140", q.getJSONObject(1).getString("format"), "YT 1440: Format-IDs");
        eq("313+140", q.getJSONObject(2).getString("format"), "YT 4K: Format-IDs");
        eq("140", s.getString("audioFormat"), "YT: Tonformat für MP3");
        eq("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg", s.getString("thumbnail"), "YT: Vorschaubild");
        eq("https://i.ytimg.com/vi/abcdefghijk/sddefault.jpg", s.getJSONArray("thumbnailFallback").getString(0), "YT: Ersatz-Vorschaubild ohne WebP");
        eq("res:1080,vcodec:h264,acodec:m4a", Formats.sortFor(1080), "Sortierung 1080");
        eq("res:2160,vcodec:vp9,acodec:m4a", Formats.sortFor(2160), "Sortierung 4K");
    }

    static void formatsPortraitAndTikTok() throws Exception {
        JSONObject info = new JSONObject();
        info.put("extractor_key", "Youtube").put("id", "s").put("title", "Short").put("duration", 30);
        info.put("formats", new JSONArray()
                .put(f("137", 1080, 1920, "avc1.640028", "none", 20e6))
                .put(f("315", 2160, 3840, "vp09.00.51.08", "none", 90e6))
                .put(f("140", 0, 0, "none", "mp4a.40.2", 1e6)));
        JSONObject s = Formats.summarize(info);
        eq(2160, s.getInt("maxRes"), "Short hochkant: 2160×3840 ist 4K");
        eq(1080, s.getJSONArray("qualities").getJSONObject(0).getInt("res"), "Short hochkant: 1080×1920 ist 1080p");
        yes(!s.getJSONArray("qualities").getJSONObject(1).getBoolean("available"), "Short ohne 1440p: Stufe nicht verfügbar");
        eq(1080, s.getJSONArray("qualities").getJSONObject(1).getInt("res"), "Short 1440: würde 1080p laden");
        eq("315+140", s.getJSONArray("qualities").getJSONObject(2).getString("format"), "Short 4K: Format-IDs");

        JSONObject tt = new JSONObject();
        tt.put("extractor_key", "TikTok").put("id", "t").put("title", "TikTok").put("duration", 20);
        tt.put("formats", new JSONArray()
                .put(f("download", 720, 1280, "h264", "aac", 3e6))
                .put(f("bytevc1_1080p", 1080, 1920, "h265", "aac", 6e6))
                .put(f("h264_720p", 720, 1280, "h264", "aac", 4e6))
                .put(f("audio", 0, 0, "none", "aac", 0.3e6)));
        JSONObject t = Formats.summarize(tt);
        eq("tiktok", t.getString("platform"), "TikTok: Plattform");
        eq(1080, t.getInt("maxRes"), "TikTok: max 1080p");
        JSONObject q1080 = t.getJSONArray("qualities").getJSONObject(0);
        eq("bytevc1_1080p", q1080.getString("format"), "TikTok 1080: Video mit Ton, ohne Hintergrundmusik");
        yes(!t.has("audioFormat"), "TikTok: Hintergrundmusik nicht als Tonformat für MP3");

        JSONObject tt2 = new JSONObject().put("extractor_key", "TikTok").put("title", "x").put("duration", 5);
        tt2.put("formats", new JSONArray()
                .put(f("hvc1_1080p", 1080, 1920, "h265", "none", 5e6))
                .put(f("h264_1080p", 1080, 1920, "h264", "aac", 6e6))
                .put(f("audio", 0, 0, "none", "aac", 0.3e6)));
        eq("h264_1080p", Formats.summarize(tt2).getJSONArray("qualities").getJSONObject(0).getString("format"),
                "TikTok: Fassung mit Ton vor stummer HEVC-Fassung");
        JSONObject tt3 = new JSONObject().put("extractor_key", "TikTok").put("title", "x");
        tt3.put("formats", new JSONArray().put(f("hvc1_1080p", 1080, 1920, "h265", "none", 5e6)).put(f("audio", 0, 0, "none", "aac", 1)));
        yes(!Formats.summarize(tt3).getJSONArray("qualities").getJSONObject(0).has("format"), "stummes Video ohne Ton: yt-dlp wählt selbst");
        eq(6000000L, q1080.getLong("size"), "TikTok 1080: Video hat Ton, Musik nicht dazugezählt");
        yes(!t.getJSONArray("qualities").getJSONObject(1).getBoolean("available"), "TikTok: 1440 nicht verfügbar");
        yes(!t.getJSONArray("qualities").getJSONObject(2).getBoolean("available"), "TikTok: 4K nicht verfügbar");

        JSONObject low = new JSONObject();
        low.put("extractor_key", "Generic").put("title", "alt").put("duration", 10);
        low.put("formats", new JSONArray().put(f("18", 640, 360, "avc1.42001E", "mp4a.40.2", 2e6)));
        JSONObject l = Formats.summarize(low);
        eq(360, l.getInt("maxRes"), "niedrig: 360p");
        eq(2000000L, l.getJSONObject("low").getLong("size"), "niedrig: Größe der besten Fassung");
        eq("18", l.getJSONObject("low").getString("format"), "niedrig: Format mit Ton ohne Zusammenfügen");

        JSONObject wide = new JSONObject().put("extractor_key", "Vimeo").put("title", "Kino").put("duration", 60);
        wide.put("formats", new JSONArray()
                .put(f("w4k", 3840, 1600, "avc1.640033", "none", 300e6))
                .put(f("w1440", 2560, 1066, "avc1.640032", "none", 150e6))
                .put(f("w1080", 1920, 800, "avc1.640028", "none", 80e6))
                .put(f("a", 0, 0, "none", "mp4a.40.2", 2e6)));
        JSONObject w = Formats.summarize(wide);
        eq(2160, w.getInt("maxRes"), "Breitbild 3840×1600 ist 4K");
        eq("w1080+a", w.getJSONArray("qualities").getJSONObject(0).getString("format"), "Breitbild 1080: 1920×800");
        eq("w1440+a", w.getJSONArray("qualities").getJSONObject(1).getString("format"), "Breitbild 1440: 2560×1066");
        yes(w.getJSONArray("qualities").getJSONObject(2).getBoolean("available"), "Breitbild 4K verfügbar");

        List<JSONObject> audios = new ArrayList<>();
        audios.add(f("140-0", 0, 0, "none", "mp4a.40.2", 1e6).put("language_preference", -1).put("abr", 129));
        audios.add(f("140-1", 0, 0, "none", "mp4a.40.2", 1e6).put("language_preference", 10).put("abr", 129));
        audios.add(f("140-1-drc", 0, 0, "none", "mp4a.40.2", 1e6).put("language_preference", 10).put("abr", 130));
        audios.add(f("251-1", 0, 0, "none", "opus", 1e6).put("language_preference", 10).put("abr", 150));
        eq("140-1", Formats.bestAudio(audios).getString("format_id"), "Ton: Originalsprache, ohne DRC, AAC");

        JSONObject audioOnly = new JSONObject().put("extractor_key", "Soundcloud").put("title", "Lied")
                .put("formats", new JSONArray().put(f("mp3", 0, 0, "none", "mp3", 4e6)));
        eq("audio", Formats.summarize(audioOnly).getString("kind"), "nur Ton");
    }

    static void formatsPlaylist() throws Exception {
        JSONObject pl = new JSONObject().put("_type", "playlist").put("extractor_key", "YoutubeTab").put("title", "Mix").put("playlist_count", 3);
        pl.put("entries", new JSONArray()
                .put(new JSONObject().put("url", "https://www.youtube.com/watch?v=a").put("title", "A").put("duration", 60))
                .put(new JSONObject().put("url", "https://www.youtube.com/watch?v=b").put("title", JSONObject.NULL))
                .put(new JSONObject().put("title", "ohne url")));
        JSONObject s = Formats.summarize(pl);
        eq("playlist", s.getString("kind"), "Playlist: Art");
        eq(2, s.getJSONArray("entries").length(), "Playlist: Einträge mit Link");
        eq("Video 2", s.getJSONArray("entries").getJSONObject(1).getString("title"), "Playlist: Titel bei null");
        eq(3L, s.getLong("count"), "Playlist: Anzahl");
    }

    static JSONObject f(String id, int w, int h, String vcodec, String acodec, double size) throws Exception {
        JSONObject o = new JSONObject().put("format_id", id).put("vcodec", vcodec).put("acodec", acodec).put("filesize", (long) size);
        if (w > 0) o.put("width", w).put("height", h);
        else o.put("width", JSONObject.NULL).put("height", JSONObject.NULL);
        return o;
    }

    static void sniffer() {
        eq("youtube", kind("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"), "YouTube-Embed");
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ", MediaSniffer.classify("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", null)[1], "YouTube-Vorschaubild → Video");
        eq("image", kind("https://tpc.googlesyndication.com/archive/simgad/1234567890"), "Google-Bildanzeige");
        eq("image", kind("https://p16-sign-va.tiktokcdn.com/tos-maliva-i/abc~tplv-photomode-image.jpeg?x-expires=1"), "TikTok-Bild");
        eq("video", kind("https://v16-webapp-prime.tiktok.com/video/tos/useast2a/tos-useast2a-pve-0068/abc/?mime_type=video_mp4"), "TikTok-Video");
        eq("video", kind("https://library.tiktok.com/api/v1/cdn/123/video.mp4?x=1"), "MP4");
        eq("hls", kind("https://cdn.example.com/master.m3u8?token=1"), "HLS");
        eq("image", kind("https://cdn.example.com/x/y", "image/avif,image/webp,*/*"), "Bild über Accept");
        eq(null, kind("https://www.google-analytics.com/collect?v=1"), "Tracking");
        eq(null, kind("https://example.com/favicon.ico"), "Favicon");
        eq(null, kind("https://example.com/logo.svg"), "SVG");
        eq(null, kind("https://rr1---sn-abc.googlevideo.com/videoplayback?itag=137"), "YouTube-Bruchstücke");
        eq(null, kind("https://displayads-formats.googleusercontent.com/ads/preview/content.js?x"), "Skript auf googleusercontent");
        eq(null, kind("blob:https://x/1"), "blob");
        eq(MediaSniffer.key("video", "https://v16.tiktok.com/video/tos/a/b/?sig=1"), MediaSniffer.key("video", "https://v16.tiktok.com/video/tos/a/b/?sig=2"),
                "TikTok-Adressen entdoppeln");
    }

    static String kind(String url) {
        return kind(url, null);
    }

    static String kind(String url, String accept) {
        String[] r = MediaSniffer.classify(url, accept);
        return r == null ? null : r[0];
    }

    static void cookies() {
        Cookies c = Cookies.parse("# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tabc\n"
                + "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\t__Secure-3PSID\tdef\n"
                + "www.tiktok.com\tFALSE\t/\tTRUE\t0\tsessionid\txyz\nkaputt\n");
        eq(3, c.rows.size(), "cookies.txt: Zeilen inkl. #HttpOnly_");
        eq("SID=abc; __Secure-3PSID=def", c.headerFor("https://www.youtube.com/watch?v=1"), "Cookie-Header YouTube");
        eq("sessionid=xyz", c.headerFor("https://www.tiktok.com/@a"), "Cookie-Header TikTok");
        eq("", c.headerFor("https://example.com/"), "fremde Seite bekommt nichts");
        c.replaceDomain("youtube.com", "A=1; B=2");
        eq("A=1; B=2", c.headerFor("https://m.youtube.com/"), "Anmeldung ersetzt alte Cookies");
        yes(c.domains().contains("tiktok.com") && c.domains().contains("youtube.com"), "Domains");
        Cookies back = Cookies.parse(c.toText());
        eq(c.rows.size(), back.rows.size(), "cookies.txt schreiben/lesen");
    }

    static void linksPlatforms() {
        eq("instagram", Links.platform("https://www.instagram.com/p/CxAbC123/?igsh=x"), "Instagram");
        eq("twitter", Links.platform("https://x.com/max/status/1932498346298290497"), "X");
        eq("twitter", Links.platform("https://mobile.twitter.com/max/status/1"), "Twitter mobil");
        eq("facebook", Links.platform("https://fb.watch/abc/"), "fb.watch");
        eq("reddit", Links.platform("https://www.reddit.com/r/pics/comments/abc/x/"), "Reddit");
        eq("pinterest", Links.platform("https://pin.it/1a2b3c"), "pin.it");
        eq("threads", Links.platform("https://www.threads.net/@user/post/Cabc"), "Threads");
        eq("bluesky", Links.platform("https://bsky.app/profile/a.bsky.social/post/3k"), "Bluesky");
        eq("other", Links.platform("https://t.co/abc"), "t.co ist keine Plattform");
        yes(Links.isShortener("https://t.co/abc") && Links.isShortener("https://bit.ly/x") && Links.isShortener("https://pin.it/x"), "Kurzlinks");
        yes(!Links.isShortener("https://www.instagram.com/p/x/"), "kein Kurzlink");
        eq("1932498346298290497", Links.tweetId("https://x.com/max_konzert/status/1932498346298290497/photo/1"), "Tweet-ID");
        eq("1932498346298290497", Links.tweetId("https://vxtwitter.com/a/status/1932498346298290497"), "Tweet-ID vxtwitter");
        eq(null, Links.tweetId("https://example.com/status/1932498346298290497"), "keine Tweet-ID fremder Seiten");
        eq("CxAbC123", Links.instagramCode("https://www.instagram.com/p/CxAbC123/"), "Instagram-Kürzel");
        eq("DAbCdEf_1-2", Links.instagramCode("https://instagram.com/reel/DAbCdEf_1-2/?utm=x"), "Reel-Kürzel");
        eq("CxAbC123", Links.instagramCode("https://www.instagram.com/reise.tagebuch/p/CxAbC123/"), "Kürzel mit Nutzer");
        eq(null, Links.instagramCode("https://www.instagram.com/reise.tagebuch/"), "Profil ohne Kürzel");
        eq("https://instagram.com/p/CxAbC123/", Links.findUrl("Schau: instagram.com/p/CxAbC123/ !"), "ohne https (beliebige Domain)");
        eq(null, Links.findUrl("mail an max@gmx.de/x"), "keine E-Mail als Link");
    }

    /** Echte Teilen-Texte der Apps und Sonderfälle beim Einfügen. */
    static void linkRecognition() {
        // TikTok-App: Text, Hashtags, Kurzlink
        eq("https://vm.tiktok.com/ZMabc123/", Links.findUrl("Schau dir das Video von @max an! #fyp #viral https://vm.tiktok.com/ZMabc123/ Lade TikTok herunter"),
                "TikTok-Teilen-Text");
        eq("https://www.tiktok.com/@max/video/7300000000000000000",
                Links.findUrl("https://www.tiktok.com/@max/video/7300000000000000000?is_from_webapp=1&sender_device=pc&web_id=7312345678901234567"),
                "TikTok: Tracking entfernt");
        eq("https://www.tiktokv.com/share/video/7300000000000000000/", Links.findUrl("https://www.tiktokv.com/share/video/7300000000000000000/"), "TikTok Lite");
        eq("tiktok", Links.platform("https://www.tiktokv.com/share/video/7300000000000000000/"), "tiktokv ist TikTok");
        eq("7300000000000000000", Links.tikTokId("https://www.tiktokv.com/share/video/7300000000000000000/"), "TikTok-Lite-ID");
        eq("7300000000000000000", Links.tikTokId("https://www.tiktok.com/embed/v2/7300000000000000000"), "TikTok-Embed-ID");
        // Instagram
        eq("https://www.instagram.com/reel/DAbC123xyz/", Links.findUrl("https://www.instagram.com/reel/DAbC123xyz/?igsh=MWZ0Y2x5bWQ0"), "Instagram: igsh weg");
        yes(Links.needsResolve("https://www.instagram.com/share/reel/BAxyz123AbC"), "Instagram-Teilen-Link wird aufgelöst");
        eq("Instagram · Reel", Links.describe("https://www.instagram.com/reel/DAbC123xyz/"), "Beschreibung Reel");
        eq("Instagram · geteilter Link", Links.describe("https://www.instagram.com/share/p/BAxyz/"), "Beschreibung Teilen-Link");
        eq("Instagram · Profil", Links.describe("https://www.instagram.com/max/"), "Beschreibung Profil");
        // X
        eq("https://x.com/max/status/1932498346298290497", Links.findUrl("Krass 😳 https://x.com/max/status/1932498346298290497?s=46&t=AbCdEfGh"), "X: s/t weg");
        eq("X · Beitrag", Links.describe("https://x.com/max/status/1932498346298290497"), "Beschreibung X");
        // X: alle Formen landen bei x.com/nutzer/status/ID
        String tweet = "https://x.com/max/status/1932498346298290497";
        for (String in : new String[]{"https://twitter.com/max/status/1932498346298290497", "https://mobile.twitter.com/max/status/1932498346298290497",
                "https://mobile.x.com/max/status/1932498346298290497?s=20", "x.com/max/status/1932498346298290497",
                "https://xcancel.com/max/status/1932498346298290497#m", "https://nitter.net/max/status/1932498346298290497",
                "https://fxtwitter.com/max/status/1932498346298290497", "https://vxtwitter.com/max/status/1932498346298290497",
                "https://x.com/max/status/1932498346298290497?ref_src=twsrc%5Etfw%7Ctwcamp%5Etweetembed&lang=de"}) {
            eq(tweet, Links.findUrl(in), "X-Form: " + in);
        }
        eq("https://x.com/i/status/1932498346298290497", Links.findUrl("https://platform.twitter.com/embed/Tweet.html?id=1932498346298290497"), "X eingebettet");
        eq("https://x.com/i/status/1932498346298290497", Links.findUrl("https://twitter.com/i/videos/tweet/1932498346298290497"), "X /i/videos/tweet/");
        eq("https://x.com/i/status/1932498346298290497", Links.findUrl("https://x.com/i/web/status/1932498346298290497"), "X /i/web/status/");
        eq(tweet + "/photo/2", Links.findUrl(tweet + "/photo/2?s=46"), "X: Foto-Nummer bleibt");
        eq("X · Beitrag (Foto)", Links.describe(tweet + "/photo/2"), "Beschreibung X-Foto");
        eq(tweet, Links.findUrl("Neues Video! https://youtu.be/dQw4w9WgXcQ https://t.co/abc123 — " + tweet), "X-Beitrag vor Links aus seinem Text");
        eq(tweet, Links.findUrl(tweet + " Link im Post: https://youtu.be/dQw4w9WgXcQ"), "X-Beitrag auch, wenn er zuerst steht");
        eq("X · Profil", Links.describe("https://x.com/max"), "X-Profil");
        eq("X", Links.describe("https://x.com/hashtag/Fussball"), "Hashtag ist kein Profil");
        eq("X · Livestream", Links.describe("https://x.com/i/broadcasts/1ZkJzjBbVeExv"), "X-Livestream");
        yes(Links.needsResolve("https://pic.x.com/AbCdEf") && Links.needsResolve("https://t.co/AbCdEf"), "pic.x.com und t.co werden aufgelöst");
        eq("X · Bild-Link", Links.describe("https://pic.x.com/AbCdEf"), "Beschreibung pic.x.com");
        eq("X-Kurzlink (t.co)", Links.describe("https://t.co/AbCdEf"), "Beschreibung t.co");
        eq("X · Bild", Links.describe("https://pbs.twimg.com/media/GxAbC.jpg?name=orig"), "X-Bilddatei");
        eq("twitter", Links.platform("https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/a.mp4"), "X-Videodatei");
        // YouTube
        eq("https://youtu.be/dQw4w9WgXcQ", Links.findUrl("https://youtu.be/dQw4w9WgXcQ?si=AbCdEf123"), "YouTube: si weg");
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42", Links.findUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&pp=ygUF&t=42&feature=shared"),
                "YouTube: v, list, t bleiben");
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ", Links.findUrl("HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ"), "Großbuchstaben");
        eq("YouTube · Short", Links.describe("https://youtube.com/shorts/dQw4w9WgXcQ"), "Beschreibung Short");
        eq("YouTube · Playlist", Links.describe("https://www.youtube.com/playlist?list=PL123"), "Beschreibung Playlist");
        eq("dQw4w9WgXcQ", Links.youTubeVideoId(Links.findUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x")), "YouTube Music");
        // Facebook, Reddit, Pinterest, Snapchat
        eq("https://www.facebook.com/share/r/1AbCdEfGh/", Links.findUrl("https://www.facebook.com/share/r/1AbCdEfGh/?mibextid=wwXIfr"), "Facebook: mibextid weg");
        yes(Links.needsResolve("https://www.facebook.com/share/v/1AbCdEfGh/"), "Facebook-Teilen-Link wird aufgelöst");
        yes(Links.needsResolve("https://www.reddit.com/r/pics/s/AbCdEf123"), "Reddit-Teilen-Link wird aufgelöst");
        yes(!Links.needsResolve("https://www.reddit.com/r/pics/comments/abc/titel/"), "Reddit-Beitrag direkt");
        eq("pinterest", Links.platform("https://www.pinterest.de/pin/123456/"), "Pinterest .de");
        eq("pinterest", Links.platform("https://pinterest.co.uk/pin/1/"), "Pinterest .co.uk");
        eq("Pinterest · Pin", Links.describe("https://www.pinterest.de/pin/123456/"), "Beschreibung Pin");
        yes(Links.needsResolve("https://t.snapchat.com/AbCdEf"), "Snapchat-Kurzlink");
        eq("facebook", Links.platform("https://m.facebook.com/watch/?v=123"), "Facebook mobil");
        // Sonderzeichen rund um den Link
        eq("https://youtu.be/dQw4w9WgXcQ", Links.findUrl("Video:\u00A0https://youtu.be/dQw4w9WgXcQ\u00A0super"), "geschütztes Leerzeichen");
        eq("https://youtu.be/dQw4w9WgXcQ", Links.findUrl("https://you\u200Btu.be/dQw4w9WgXcQ"), "unsichtbares Zeichen im Link");
        eq("https://youtu.be/dQw4w9WgXcQ", Links.findUrl("https://youtu.be/dQw4w9WgXcQ🔥🔥"), "Emoji direkt dahinter");
        eq("https://x.com/a/status/123456", Links.findUrl("„https://x.com/a/status/123456“"), "deutsche Anführungszeichen");
        eq("https://x.com/a/status/123456", Links.findUrl("«https://x.com/a/status/123456»"), "Guillemets");
        eq("https://de.wikipedia.org/wiki/Test_(Begriff)", Links.findUrl("(siehe https://de.wikipedia.org/wiki/Test_(Begriff))"), "Klammern im Link");
        eq("https://example.com/video", Links.findUrl("[Video](https://example.com/video)"), "Markdown-Link");
        eq("https://example.com/a", Links.findUrl("**https://example.com/a**"), "fett markiert");
        eq("https://v.douyin.com/abc/", Links.findUrl("复制此链接https://v.douyin.com/abc/，打开抖音"), "chinesische Satzzeichen");
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", Links.findUrl("<a href=\"https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=1\">x</a>"), "&amp; aus HTML");
        eq("https://www.instagram.com/p/CxAbC123/", Links.findUrl("www.instagram.com/p/CxAbC123/"), "www ohne https");
        eq(null, Links.findUrl("Schreib mir an max@gmx.de oder ruf an"), "E-Mail ist kein Link");
        eq(null, Links.findUrl("   "), "leer");
        // mehrere Links: der Beitrag gewinnt, nicht das Profil oder die Startseite
        eq("https://www.instagram.com/p/CxAbC123/", Links.findUrl("Folgt mir https://www.instagram.com/max/ – neuer Post: https://www.instagram.com/p/CxAbC123/"),
                "Beitrag vor Profil");
        eq("https://www.tiktok.com/@max/video/7300000000000000000",
                Links.findUrl("https://www.tiktok.com/ https://www.tiktok.com/@max/video/7300000000000000000"), "Video vor Startseite");
        eq(java.util.Arrays.asList("https://youtu.be/dQw4w9WgXcQ", "https://x.com/a/status/123456"),
                Links.findUrls("1) https://youtu.be/dQw4w9WgXcQ?si=1 2) https://x.com/a/status/123456 3) https://youtu.be/dQw4w9WgXcQ"),
                "alle Links ohne Doppelte");
        // Weiterleitungen auspacken
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ", Links.findUrl("https://www.google.com/url?sa=t&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&ved=2a"),
                "Google-Weiterleitung");
        eq("https://example.com/clip.mp4", Links.findUrl("https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fclip.mp4&e=AT0x"), "Instagram-Weiterleitung");
        eq("https://example.com/x", Links.findUrl("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fx%3Ffbclid%3Dabc&h=AT1"), "Facebook-Weiterleitung + fbclid");
        eq("https://www.youtube.com/watch?v=dQw4w9WgXcQ", Links.findUrl("https://www.youtube.com/attribution_link?a=x&u=%2Fwatch%3Fv%3DdQw4w9WgXcQ%26feature%3Dshare"),
                "YouTube attribution_link");
        eq("https://www.instagram.com/reel/DAbC123xyz/", Links.clean("https://www.instagram.com/accounts/login/?next=%2Freel%2FDAbC123xyz%2F%3Figsh%3Dx"),
                "Anmeldeseite mit next=");
        eq("https://www.theguardian.com/world/1", Links.findUrl("https://www.google.com/amp/s/www.theguardian.com/world/1"), "Google AMP");
        eq("Kurzlink (bit.ly)", Links.describe("https://bit.ly/3abc"), "Beschreibung Kurzlink");
        eq("Link auf example.com", Links.describe("https://www.example.com/seite"), "Beschreibung fremde Seite");
        JSONObject d = Links.detect("Profil https://www.instagram.com/max/ und Reel https://www.instagram.com/reel/DAbC123xyz/?igsh=1");
        eq(2, d.optJSONArray("links").length(), "detect: zwei Links");
        eq(1, d.optInt("best"), "detect: Reel ist der passendste");
        eq("Instagram · Reel", d.optJSONArray("links").optJSONObject(1).optString("label"), "detect: Beschreibung");
        eq(-1, Links.detect("kein Link").optInt("best"), "detect: ohne Link");
    }

    /** Auflösen von Teilen-Links über HTTP-Weiterleitung und über die kanonische Adresse der Seite. */
    static void linkResolve() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final String[] base = new String[1];
        server.createContext("/share/reel/abc", ex -> {
            ex.getResponseHeaders().add("Location", "/accounts/login/?next=%2Freel%2FDAbC123xyz%2F%3Figsh%3Dx");
            ex.sendResponseHeaders(302, -1);
            ex.close();
        });
        server.createContext("/accounts/login/", ex -> {
            byte[] body = "<html>Bitte anmelden</html>".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        // t.co im Browser: kein HTTP-Redirect, sondern meta refresh + location.replace
        server.createContext("/tco", ex -> {
            byte[] body = ("<head><meta name=\"referrer\" content=\"always\"><noscript><META http-equiv=\"refresh\" content=\"0;URL=https://x.com/max/status/1932498346298290497/photo/1\">"
                    + "</noscript><title>https://x.com/max/status/1932498346298290497/photo/1</title></head>"
                    + "<script>window.opener = null; location.replace(\"https:\\/\\/x.com\\/max\\/status\\/1932498346298290497\\/photo\\/1\")</script>").getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        server.createContext("/tcojs", ex -> {
            byte[] body = "<script>location.replace(\"https:\\/\\/youtu.be\\/dQw4w9WgXcQ?si=x\")</script>".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        server.createContext("/s/xyz", ex -> {
            byte[] body = ("<html><head><link rel=\"canonical\" href=\"https://www.reddit.com/r/pics/comments/1abc/titel/?share_id=q\"></head></html>")
                    .getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        server.start();
        try {
            base[0] = "http://127.0.0.1:" + server.getAddress().getPort();
            eq("http://127.0.0.1:" + server.getAddress().getPort() + "/reel/DAbC123xyz/", Links.resolve(base[0] + "/share/reel/abc", new Http()),
                    "Teilen-Link → Anmeldeseite → eigentlicher Beitrag");
            eq("https://www.reddit.com/r/pics/comments/1abc/titel/", Links.resolve(base[0] + "/s/xyz", new Http()), "kanonische Adresse der Seite");
            eq("https://x.com/max/status/1932498346298290497/photo/1", Links.resolve(base[0] + "/tco", new Http()), "t.co: meta refresh");
            eq("https://youtu.be/dQw4w9WgXcQ", Links.resolve(base[0] + "/tcojs", new Http()), "t.co: location.replace");
            eq("http://127.0.0.1:1/nix", Links.resolve("http://127.0.0.1:1/nix", new Http()), "nicht erreichbar → Link bleibt");
        } finally {
            server.stop(0);
        }
    }

    static void twitter() throws Exception {
        // Erwartete Werte von JavaScript: ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
        eq("4on4ewe14gx", Twitter.token("1932498346298290497"), "Token 1");
        eq("45fhqezna5p", Twitter.token("1712345678901234567"), "Token 2");
        eq("3iu6crkhv5", Twitter.token("1453459127363645444"), "Token mit Null in der Mitte");
        eq("6dq1a2xwd93", Twitter.token("20"), "Token kleine Zahl");
        eq("3iu.6crkh0v5", Twitter.jsToString36(1453459127363645444.0 / 1e15 * Math.PI), "Basis 36 wie JavaScript");

        JSONObject p = Twitter.parse(new JSONObject(read("twitter-photos.json")), "https://x.com/i/status/1932498346298290497");
        eq("images", p.getString("kind"), "X Fotos: Art");
        eq("@max_konzert", p.getString("uploader"), "X: Nutzer");
        eq("Zwei Bilder vom Konzert gestern 🎸", p.getString("title"), "X: Text ohne t.co-Link");
        JSONArray imgs = p.getJSONArray("images");
        eq(2, imgs.length(), "X: zwei Bilder");
        eq("https://pbs.twimg.com/media/GxPhoto1?format=jpg&name=orig", imgs.getJSONObject(0).getString("url"), "X: Originalgröße");
        eq("https://pbs.twimg.com/media/GxPhoto1?format=jpg&name=4096x4096", imgs.getJSONObject(0).getJSONArray("fallback").getString(0), "X: Ersatzgröße");
        eq(1600L, imgs.getJSONObject(1).getLong("height"), "X: Bildhöhe");

        JSONObject v = Twitter.parse(new JSONObject(read("twitter-video.json")), "https://x.com/i/status/1712345678901234567");
        eq("video", v.getString("kind"), "X Video: Art");
        JSONArray vids = v.getJSONArray("videos");
        eq(3, vids.length(), "X Video: nur MP4-Fassungen");
        eq(1080L, vids.getJSONObject(0).getLong("res"), "X Video: 1080p zuerst");
        eq(720L, vids.getJSONObject(1).getLong("res"), "X Video: dann 720p");
        eq(30.5, v.getDouble("duration"), "X Video: Dauer");
        yes(v.getString("thumbnail").contains("name=large"), "X Video: Vorschaubild");
        JSONObject quoted = new JSONObject().put("text", "Zitat").put("quoted_tweet", new JSONObject(read("twitter-photos.json")));
        eq(2, Twitter.parse(quoted, "x").getJSONArray("images").length(), "X: Medien aus zitiertem Beitrag");
        try {
            Twitter.parse(new JSONObject().put("text", "nur Text"), "x");
            yes(false, "X ohne Medien: Fehler");
        } catch (java.io.IOException e) {
            yes(e.getMessage().contains("keine Bilder"), "X ohne Medien: Fehler");
        }
    }

    /**
     * Der Link aus der Nutzer-Meldung: X-Beitrag, dessen Vorschau nur das Profilbild zeigt. Erkannt werden muss der
     * Beitrag; das Profilbild darf nie als Ergebnis erscheinen; FxTwitter/vxTwitter liefern die echten Medien.
     */
    static void xUserLink() throws Exception {
        String link = "https://x.com/kujo_alya88282/status/2121268063530070048?a=JvDA9NAJOO_O1BQeshU&s=19";
        eq("https://x.com/kujo_alya88282/status/2121268063530070048", Links.findUrl(link), "Nutzer-Link: bereinigt");
        eq("X · Beitrag", Links.describe(Links.findUrl(link)), "Nutzer-Link: als Beitrag erkannt");
        eq("2121268063530070048", Links.tweetId(Links.findUrl(link)), "Nutzer-Link: ID");
        eq("kujo_alya88282", Links.tweetUser(Links.findUrl(link)), "Nutzer-Link: Nutzername");
        eq(null, Links.tweetUser("https://x.com/i/status/2121268063530070048"), "ohne Nutzername");
        eq("5545rkn5rtv", Twitter.token("2121268063530070048"), "Nutzer-Link: Token wie JavaScript");

        // Seite zeigt nur Profilbild/Logo → kein Ergebnis statt falschem Bild
        try {
            PageMedia.parse(read("x-page-profilbild.html"), "https://x.com/kujo_alya88282/status/2121268063530070048");
            yes(false, "Profilbild-Seite: kein Ergebnis");
        } catch (java.io.IOException e) {
            yes(true, "Profilbild-Seite: kein Ergebnis");
        }
        JSONObject img = PageMedia.parse(read("x-page-bild.html"), "https://x.com/a/status/1");
        eq("https://pbs.twimg.com/media/HAbC1?format=jpg&name=orig", img.getJSONArray("images").getJSONObject(0).getString("url"),
                "Seite mit Beitragsbild: Originalgröße");
        yes(PageMedia.isProfileImage("https://pbs.twimg.com/profile_images/1890/AbCd_400x400.jpg"), "Profilbild X");
        yes(PageMedia.isProfileImage("https://scontent.cdninstagram.com/v/t51.2885-19/123_n.jpg"), "Profilbild Instagram");
        yes(PageMedia.isProfileImage("https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/abc~c5_100x100.jpeg"), "Profilbild TikTok");
        yes(PageMedia.isProfileImage("https://example.com/img/avatar.png"), "Avatar allgemein");
        yes(!PageMedia.isProfileImage("https://pbs.twimg.com/media/HAbC1.jpg"), "Beitragsbild ist kein Profilbild");
        eq(null, MediaSniffer.classify("https://pbs.twimg.com/profile_images/1/a_400x400.jpg", null), "Werbe-Browser ignoriert Profilbilder");

        // Gesperrter/sensibler Beitrag beim Einbettungs-Endpunkt → Anmelde-Hinweis
        JSONObject tomb = new JSONObject().put("__typename", "TweetTombstone").put("tombstone", new JSONObject().put("text",
                new JSONObject().put("text", "Age-restricted adult content. This content might not be appropriate for people under 18 years old. To view this media, you’ll need to log in to X.")));
        eq(Twitter.LOGIN_NEEDED, Twitter.tombstoneMessage(tomb), "sensibler Beitrag: Anmelde-Hinweis");
        yes(Results.pickError(Twitter.LOGIN_NEEDED, "No video could be found in this tweet", null) == Twitter.LOGIN_NEEDED, "Anmelde-Hinweis wird angezeigt");

        // FxTwitter: zwei Bilder + Video
        JSONObject fx = Twitter.parseFx(new JSONObject(read("fxtwitter.json")).getJSONObject("tweet"), "https://x.com/i/status/2121268063530070048");
        eq("images", fx.getString("kind"), "FxTwitter: Galerie");
        JSONArray items = fx.getJSONArray("images");
        eq(3, items.length(), "FxTwitter: alle Medien");
        eq("https://pbs.twimg.com/media/HAbC1?format=jpg&name=orig", items.getJSONObject(0).getString("url"), "FxTwitter: Bild in Originalgröße");
        eq("https://pbs.twimg.com/media/HAbC2?format=png&name=orig", items.getJSONObject(1).getString("url"), "FxTwitter: PNG in Originalgröße");
        eq("https://video.twimg.com/amplify_video/2/vid/avc1/1080x1920/c.mp4?tag=16", items.getJSONObject(2).getString("url"), "FxTwitter: bestes Video");
        eq("@kujo_alya88282", fx.getString("uploader"), "FxTwitter: Nutzer");
        yes(!fx.toString().contains("profile_images"), "FxTwitter: kein Profilbild im Ergebnis");

        // vxTwitter: einzelnes Video
        JSONObject vx = Twitter.parseVx(new JSONObject(read("vxtwitter.json")), "https://x.com/i/status/2121268063530070048");
        eq("video", vx.getString("kind"), "vxTwitter: Video");
        eq(720L, vx.getJSONArray("videos").getJSONObject(0).getLong("res"), "vxTwitter: Auflösung aus der Adresse");
        eq(30.5, vx.getDouble("duration"), "vxTwitter: Dauer");
    }

    static void instagram() throws Exception {
        JSONObject r = Instagram.parseEmbed(read("instagram-embed-carousel.html"), "https://www.instagram.com/p/CxAbC123/");
        eq("images", r.getString("kind"), "IG Karussell: Art");
        eq("@reise.tagebuch", r.getString("uploader"), "IG: Nutzer");
        eq("Sommer am Meer 🌊 \"Teil 1\" {Strand}", r.getString("title"), "IG: Bildtext");
        JSONArray items = r.getJSONArray("images");
        eq(4, items.length(), "IG: alle Teile des Karussells");
        eq("https://scontent.cdninstagram.com/v/t51/img1_1080.jpg", items.getJSONObject(0).getString("url"), "IG: größte Fassung");
        eq("video", items.getJSONObject(2).getString("type"), "IG: Video im Karussell");
        eq("https://scontent.cdninstagram.com/o1/v/t16/video.mp4?efg=x", items.getJSONObject(2).getString("url"), "IG: Video-Adresse");
        yes(items.getJSONObject(3).optBoolean("videoPoster"), "IG: Video ohne Adresse als Vorschaubild markiert");
        yes(r.has("note"), "IG: Hinweis zur Anmeldung");

        JSONObject one = Instagram.parseEmbed(read("instagram-embed-image.html"), "https://www.instagram.com/p/X/");
        eq(1, one.getJSONArray("images").length(), "IG Einzelbild aus srcset");
        eq("https://scontent.cdninstagram.com/v/t51/cat_1080.jpg?a=1&b=2", one.getJSONArray("images").getJSONObject(0).getString("url"),
                "IG: größte srcset-Breite, &amp; aufgelöst");
        eq("Foto von @katzen", one.getString("title"), "IG: alt-Text als Titel");
        try {
            Instagram.parseEmbed("<html>Login</html>", "x");
            yes(false, "IG ohne Daten: Fehler");
        } catch (java.io.IOException e) {
            yes(e.getMessage().contains("angemeldet"), "IG ohne Daten: Anmelde-Hinweis");
        }
    }

    static void pageMedia() throws Exception {
        JSONObject r = PageMedia.parse(read("page-og.html"), "https://news.example.com/artikel/1");
        eq("Großer Bericht & Bilder", r.getString("title"), "Seite: og:title mit Entität");
        eq("images", r.getString("kind"), "Seite: mehrere Medien als Galerie");
        JSONArray items = r.getJSONArray("images");
        eq(4, items.length(), "Seite: 2 Bilder (ohne Doppelte) + 2 Videos");
        eq("https://news.example.com/bilder/haupt.jpg", items.getJSONObject(0).getString("url"), "Seite: relative Adresse aufgelöst");
        eq("https://cdn.example.com/clip.mp4?sig=1&e=2", items.getJSONObject(2).getString("url"), "Seite: og:video");
        eq("https://news.example.com/media/zweites.webm", items.getJSONObject(3).getString("url"), "Seite: <video src>");
        JSONObject e = PageMedia.parse(read("page-embed.html"), "https://blog.example.com/x");
        eq("https://www.youtube.com/embed/dQw4w9WgXcQ", e.getJSONArray("embeds").getString(0), "Seite: eingebetteter Player");
        eq("ä & \" '", PageMedia.unescape("&#228; &amp; &quot; &#x27;"), "HTML-Entitäten");
    }

    static void galleryList() throws Exception {
        JSONObject r = GalleryList.parse("Vorspann\n" + read("gallerydl-tweet.json"), "https://x.com/max_konzert/status/1");
        eq("gallery-dl", r.getString("source"), "gdl: Quelle");
        eq("twitter", r.getString("platform"), "gdl: Plattform");
        eq("Drei Medien in einem Beitrag", r.getString("title"), "gdl: Titel aus content");
        eq("max_konzert", r.getString("uploader"), "gdl: Nutzer aus author.name");
        JSONArray items = r.getJSONArray("images");
        eq(4, items.length(), "gdl: alle Dateien");
        eq("image", items.getJSONObject(1).getString("type"), "gdl: PNG ist Bild");
        eq("video", items.getJSONObject(2).getString("type"), "gdl: MP4 ist Video");
        eq(3, items.getJSONObject(2).getInt("index"), "gdl: Nummer für --range");
        eq("ytdlp", items.getJSONObject(3).getString("via"), "gdl: ytdl:-Adressen lädt yt-dlp");
        eq("https://v.redd.it/abc123", items.getJSONObject(3).getString("url"), "gdl: ytdl:-Präfix entfernt");
        yes(r.getBoolean("gdlRange"), "gdl: ein Ausleser → --range möglich");
        eq("https://pbs.twimg.com/media/A1.jpg?name=orig", r.getString("thumbnail"), "gdl: Vorschaubild");

        JSONObject m = GalleryList.parse(read("gallerydl-mixed.json"), "https://www.reddit.com/r/garten/comments/1/");
        yes(!m.getBoolean("gdlRange"), "gdl: aufgelöste Unter-Links → alles laden");
        eq("Mein Garten", m.getString("title"), "gdl: Titel");
        try {
            GalleryList.parse(read("gallerydl-error.json"), "x");
            yes(false, "gdl Fehler");
        } catch (java.io.IOException e) {
            eq("Login required", e.getMessage(), "gdl: Fehlermeldung");
        }
        eq("Diese Seite zeigt den Beitrag nur angemeldet. Melde dich unter „Mehr → Anmeldung“ an.",
                GalleryList.friendlyError("[instagram][error] AuthRequired: Login required", "x"), "gdl: Anmelde-Fehler verständlich");
        eq("Dieser Link wird nicht unterstützt.", GalleryList.friendlyError("[gallery-dl][error] Unsupported URL 'https://x'", "x"), "gdl: nicht unterstützt");
        eq("Irgendwas kaputt", GalleryList.friendlyError("[foo][info] a\n[foo][error] Irgendwas kaputt\n", "x"), "gdl: letzte Fehlerzeile");
        eq("Ersatz", GalleryList.friendlyError("", "Ersatz"), "gdl: Ersatzmeldung");
    }

    static void merge() throws Exception {
        JSONObject video = new JSONObject().put("kind", "video").put("title", "Video");
        JSONObject media = new JSONObject().put("kind", "images").put("headers", new JSONObject().put("Referer", "r"))
                .put("gdlUrl", "u").put("gdlRange", true).put("images", new JSONArray()
                        .put(new JSONObject().put("type", "image").put("url", "a.jpg"))
                        .put(new JSONObject().put("type", "video").put("url", "b.mp4"))
                        .put(new JSONObject().put("type", "image").put("url", "poster.jpg").put("videoPoster", true)));
        JSONObject m = Results.merge(video, media);
        eq("video", m.getString("kind"), "Zusammenführen: Video bleibt Video");
        eq(1, m.getJSONArray("images").length(), "Zusammenführen: nur Beitragsbilder dazu");
        eq("r", m.getJSONObject("headers").getString("Referer"), "Zusammenführen: Header der Bilder");
        eq("u", m.getString("gdlUrl"), "Zusammenführen: gallery-dl-Link");
        JSONObject playlist = new JSONObject().put("kind", "playlist");
        eq("images", Results.merge(playlist, media).getString("kind"), "Karussell: Galerie statt Playlist");
        eq("playlist", Results.merge(playlist, null).getString("kind"), "Playlist ohne Galerie");
        eq("images", Results.merge(null, media).getString("kind"), "nur Bilder");
        eq(null, Results.merge(null, null), "nichts gefunden");
        JSONObject small = new JSONObject().put("images", new JSONArray().put(new JSONObject()));
        eq(media, Results.richer(small, media), "mehr Dateien gewinnt");
        eq(small, Results.richer(small, new JSONObject().put("images", new JSONArray().put(1))), "Gleichstand: eigener Ausleser");
        eq("Bitte anmelden", Results.pickError(null, "Fehler A", "Bitte anmelden"), "Fehler mit Anmelde-Hinweis zuerst");
        eq("Fehler A", Results.pickError(null, "Fehler A", "Fehler B"), "sonst erster Fehler");
    }

    /** Http folgt Weiterleitungen selbst und behält Cookies aus jeder Zwischenantwort. */
    static void httpRedirectCookies() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final List<String> seen = new ArrayList<>();
        server.createContext("/short", ex -> {
            ex.getResponseHeaders().add("Set-Cookie", "tt_chain_token=abc; Domain=127.0.0.1; Path=/; HttpOnly");
            ex.getResponseHeaders().add("Location", "/@user/video/7300000000000000000?_r=1");
            ex.sendResponseHeaders(301, -1);
            ex.close();
        });
        server.createContext("/@user", ex -> {
            seen.add(ex.getRequestHeaders().getFirst("Cookie"));
            byte[] body = "<html>ok</html>".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            Http http = new Http();
            Http.Response r = http.get(base + "/short", null);
            eq(200, r.code, "HTTP: Ziel erreicht");
            eq(base + "/@user/video/7300000000000000000?_r=1", r.url, "HTTP: Ziel-Adresse");
            yes(r.url.endsWith("/@user/video/7300000000000000000?_r=1"), "HTTP: Pfad aus Weiterleitung");
            eq("tt_chain_token=abc", seen.get(0), "HTTP: Cookie aus Weiterleitung mitgeschickt");
            eq("<html>ok</html>", r.body, "HTTP: Inhalt");
        } finally {
            server.stop(0);
        }
    }
}

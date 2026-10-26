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
        eq("other", Links.platform("https://vimeo.com/123"), "andere Seite");
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
            eq("7300000000000000000", Links.tikTokId(r.url), "HTTP: ID aus Weiterleitung");
            eq("tt_chain_token=abc", seen.get(0), "HTTP: Cookie aus Weiterleitung mitgeschickt");
            eq("<html>ok</html>", r.body, "HTTP: Inhalt");
        } finally {
            server.stop(0);
        }
    }
}

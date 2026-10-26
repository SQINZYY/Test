package de.clipsaver.app;

import android.content.Context;

import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Prüft einen eingefügten Link und liefert, was sich daraus laden lässt (Video mit Qualitätsstufen,
 * Bilder, Playlist oder "im Browser öffnen"). Reihenfolge je Plattform:
 * <ul>
 *   <li>TikTok-Video: yt-dlp → eigene Auslese der Seite → unsichtbarer Browser</li>
 *   <li>TikTok-Foto-Post: eigene Auslese → unsichtbarer Browser</li>
 *   <li>YouTube-Video/Short: yt-dlp</li>
 *   <li>YouTube-Community-Beitrag: eigene Auslese → unsichtbarer Browser</li>
 *   <li>Werbebibliotheken: eingebauter Browser mit Medien-Erkennung</li>
 *   <li>alle anderen Seiten: yt-dlp (über 1000 Seiten), sonst Browser</li>
 * </ul>
 */
final class Analyzer {

    /** Unsichtbare WebView: lädt die Seite wie ein echter Browser und führt js aus (Ergebnis als String). */
    interface Grabber {
        String grab(String url, String js, AtomicBoolean cancel) throws Exception;

        String cookies(String url);
    }

    static final String TIKTOK_JS = "(function(){try{var e=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');"
            + "if(!e)return null;var d=JSON.parse(e.textContent).__DEFAULT_SCOPE__['webapp.video-detail'];"
            + "return d&&d.itemInfo&&d.itemInfo.itemStruct?JSON.stringify(d.itemInfo.itemStruct):null}catch(x){return null}})()";
    static final String YT_JS = "(function(){try{return window.ytInitialData?JSON.stringify(window.ytInitialData):null}catch(x){return null}})()";

    static final class Canceled extends Exception {
        Canceled() {
            super("abgebrochen");
        }
    }

    private Analyzer() {
    }

    static JSONObject analyze(Context c, String input, String processId, AtomicBoolean cancel, Grabber grabber) throws Exception {
        String url = Links.findUrl(input);
        if (url == null) return error("Im Text wurde kein Link gefunden.");
        switch (Links.platform(url)) {
            case "ads":
                return browse(url, "ads", "Werbebibliothek erkannt – die Seite öffnet sich im Browser. Tippe dort die Anzeige an; "
                        + "Videos und Bilder werden automatisch erkannt.");
            case "tiktok":
                return tikTok(c, url, processId, cancel, grabber);
            case "youtube":
                if (Links.youTubePostId(url) != null) return youTubePost(c, url, processId, cancel, grabber);
                return ytDlp(c, url, processId);
            default:
                try {
                    return ytDlp(c, url, processId);
                } catch (YoutubeDL.CanceledException e) {
                    throw e;
                } catch (Exception e) {
                    check(cancel);
                    return browse(url, "other", "Hier wurde kein Video erkannt (" + Engine.friendlyError(e)
                            + "). Im Browser öffnen, um Videos und Bilder der Seite zu finden?");
                }
        }
    }

    private static JSONObject tikTok(Context c, String url, String processId, AtomicBoolean cancel, Grabber grabber) throws Exception {
        Http http = http(c, "tiktok.com", "https://www.tiktok.com/");
        String resolved = url;
        if (Links.isTikTokShort(url)) {
            try {
                resolved = http.get(url, null).url;
            } catch (Exception ignored) {
                // yt-dlp folgt Kurzlinks auch selbst
            }
        }
        check(cancel);
        Exception first = null;
        if (!Links.isTikTokPhoto(resolved)) {
            try {
                JSONObject s = ytDlp(c, resolved, processId);
                if ("video".equals(s.optString("kind"))) return s;
                // nur Ton: wahrscheinlich ein Foto-Post, der über /video/ verlinkt war
            } catch (YoutubeDL.CanceledException e) {
                throw e;
            } catch (Exception e) {
                first = e;
            }
        }
        check(cancel);
        try {
            return ok(TikTok.extract(resolved, http));
        } catch (Exception e) {
            if (first == null) first = e;
        }
        check(cancel);
        String id = Links.tikTokId(resolved);
        if (id != null) {
            String page = "https://www.tiktok.com/@" + (Links.tikTokUser(resolved) == null ? "_" : Links.tikTokUser(resolved))
                    + (resolved.contains("/photo/") ? "/photo/" : "/video/") + id;
            String json = grabber.grab(page, TIKTOK_JS, cancel);
            if (json != null) {
                JSONObject r = TikTok.parseItem(new JSONObject(json), page);
                JSONObject headers = new JSONObject();
                headers.put("Referer", "https://www.tiktok.com/");
                headers.put("User-Agent", Http.UA_DESKTOP);
                String cookie = grabber.cookies("https://www.tiktok.com/");
                if (cookie != null) headers.put("Cookie", cookie);
                r.put("headers", headers);
                return ok(r);
            }
        }
        check(cancel);
        return error(Engine.friendlyError(first));
    }

    private static JSONObject youTubePost(Context c, String url, String processId, AtomicBoolean cancel, Grabber grabber) throws Exception {
        JSONObject r = null;
        Exception err = null;
        try {
            r = YouTubePosts.extract(url, http(c, "youtube.com", "https://www.youtube.com/"));
        } catch (Exception e) {
            err = e;
        }
        check(cancel);
        if (r == null) {
            String page = "https://www.youtube.com/post/" + Links.youTubePostId(url);
            String json = grabber.grab(page, YT_JS, cancel);
            if (json != null) {
                try {
                    r = YouTubePosts.parse(new JSONObject(json), page);
                } catch (Exception e) {
                    err = e;
                }
            }
        }
        if (r == null) return error(err == null ? "YouTube-Beitrag konnte nicht gelesen werden." : err.getMessage());
        // Beitrag ohne Bilder, aber mit Video: das Video laden
        if (r.optJSONArray("images") == null || r.optJSONArray("images").length() == 0) {
            return ytDlp(c, "https://www.youtube.com/watch?v=" + r.optString("videoId"), processId);
        }
        return ok(r);
    }

    private static JSONObject ytDlp(Context c, String url, String processId) throws Exception {
        JSONObject info = Engine.info(c, url, processId);
        JSONObject s = Formats.summarize(info);
        if ("none".equals(s.optString("kind"))) throw new Exception("Keine Videos oder Töne unter diesem Link gefunden.");
        s.put("infoFile", info.optString("_infoFile"));
        s.put("url", url);
        return ok(s);
    }

    /** HTTP-Client mit den gespeicherten Anmelde-Cookies der Plattform. */
    private static Http http(Context c, String domain, String url) {
        Http http = new Http();
        File f = Engine.cookiesFile(c);
        if (f.length() > 0) {
            try {
                Cookies cookies = Cookies.parse(new String(Http.readAll(new FileInputStream(f), 4 << 20), "UTF-8"));
                http.addCookieHeader(domain, cookies.headerFor(url));
            } catch (Exception ignored) {
                // ohne Anmeldung weiter
            }
        }
        return http;
    }

    private static void check(AtomicBoolean cancel) throws Canceled {
        if (cancel.get()) throw new Canceled();
    }

    static JSONObject ok(JSONObject r) throws Exception {
        r.put("ok", true);
        return r;
    }

    static JSONObject error(String message) throws Exception {
        JSONObject r = new JSONObject();
        r.put("ok", false);
        r.put("error", message);
        return r;
    }

    private static JSONObject browse(String url, String why, String message) throws Exception {
        JSONObject r = new JSONObject();
        r.put("ok", true);
        r.put("kind", "browse");
        r.put("why", why);
        r.put("url", url);
        r.put("message", message);
        return r;
    }
}

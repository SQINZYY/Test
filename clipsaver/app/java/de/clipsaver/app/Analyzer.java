package de.clipsaver.app;

import android.content.Context;

import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Prüft einen eingefügten Link und liefert, was sich daraus laden lässt (Video mit Qualitätsstufen,
 * Bilder, Galerie, Playlist oder "im Browser öffnen"). Reihenfolge je Plattform:
 * <ul>
 *   <li>TikTok-Video: yt-dlp → eigene Auslese der Seite → gallery-dl → unsichtbarer Browser</li>
 *   <li>TikTok-Foto-Post: eigene Auslese → gallery-dl → unsichtbarer Browser</li>
 *   <li>YouTube-Video/Short: yt-dlp</li>
 *   <li>YouTube-Community-Beitrag: eigene Auslese → unsichtbarer Browser</li>
 *   <li>Werbebibliotheken: eingebauter Browser mit Medien-Erkennung</li>
 *   <li>alle anderen Seiten (Instagram, X, Facebook, Reddit, Pinterest …): gleichzeitig yt-dlp (Videos, über 1800
 *       Seiten), gallery-dl (Bilder und Galerien, über 300 Seiten) und bei X/Instagram die eigene Auslese ohne
 *       Anmeldung; danach Bilder/Video aus den Meta-Angaben der Seite; zuletzt der Browser</li>
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

    private static final ExecutorService POOL = Executors.newCachedThreadPool();
    /** Plattformen, die Beiträge oft nur angemeldet zeigen: Fehlermeldung bekommt einen Anmelde-Knopf */
    private static final String[] LOGIN_PLATFORMS = {"instagram", "facebook", "twitter", "threads", "tiktok", "reddit", "snapchat", "pinterest"};

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
                return universal(c, url, processId, cancel);
        }
    }

    /** Jede andere Plattform: alle Ausleser gleichzeitig, dann zusammenführen. */
    private static JSONObject universal(final Context c, String input, final String processId, AtomicBoolean cancel) throws Exception {
        // Kurz- und Teilen-Links (t.co, pin.it, instagram.com/share/…, facebook.com/share/…) erst auflösen;
        // klappt das nicht, folgen yt-dlp und gallery-dl ihnen meist selbst
        String url = Links.needsResolve(input) ? Links.resolve(input, new Http()) : input;
        check(cancel);
        final String target = url;
        final String platform = Links.platform(target);
        Future<JSONObject> video = POOL.submit(new Callable<JSONObject>() {
            @Override
            public JSONObject call() throws Exception {
                return ytDlp(c, target, processId);
            }
        });
        Future<JSONObject> gallery = POOL.submit(new Callable<JSONObject>() {
            @Override
            public JSONObject call() throws Exception {
                return Gallery.list(c, target, processId + "-g");
            }
        });
        Future<JSONObject> own = null;
        final String tweet = Links.tweetId(target);
        final String insta = Links.instagramCode(target);
        if (tweet != null) {
            own = POOL.submit(new Callable<JSONObject>() {
                @Override
                public JSONObject call() throws Exception {
                    return Twitter.extract(tweet, new Http());
                }
            });
        } else if (insta != null) {
            own = POOL.submit(new Callable<JSONObject>() {
                @Override
                public JSONObject call() throws Exception {
                    return Instagram.extract(insta, http(c, "instagram.com", "https://www.instagram.com/"));
                }
            });
        }
        String[] errors = new String[4];
        JSONObject v = await(video, cancel, processId, errors, 0);
        JSONObject g = await(gallery, cancel, processId, errors, 1);
        JSONObject o = own == null ? null : await(own, cancel, processId, errors, 2);
        JSONObject merged = Results.merge(v, Results.richer(o, g));
        if (merged != null) return ok(merged);

        // Letzter Versuch ohne Ausleser: Bild/Video aus den Meta-Angaben der Seite
        try {
            JSONObject page = PageMedia.extract(target, http(c, Links.host(target), target));
            JSONArray embeds = page.optJSONArray("embeds");
            if (Results.count(page) == 0 && embeds != null && embeds.length() > 0) {
                // eingebetteter Player (YouTube, Vimeo …): den Player-Link mit yt-dlp versuchen
                return ytDlp(c, embeds.getString(0), processId);
            }
            if (Results.count(page) > 0) return ok(page);
        } catch (YoutubeDL.CanceledException e) {
            throw e;
        } catch (Exception e) {
            errors[3] = e.getMessage();
        }
        check(cancel);
        String message = Results.pickError(errors[2], errors[0], errors[1]);
        JSONObject err = error(message == null || message.equals("Dieser Link wird nicht unterstützt.")
                ? "Hier wurden keine Videos oder Bilder gefunden." : message);
        err.put("url", target);
        for (String p : LOGIN_PLATFORMS) {
            if (p.equals(platform)) err.put("login", platform);
        }
        return err;
    }

    /** Wartet auf einen Ausleser; Fehler landen in errors[i], Abbruch beendet alle Prozesse. */
    private static JSONObject await(Future<JSONObject> f, AtomicBoolean cancel, String processId, String[] errors, int i) throws Exception {
        while (true) {
            if (cancel.get()) {
                Engine.cancel(processId);
                Gallery.cancel(processId + "-g");
                throw new Canceled();
            }
            try {
                return f.get(200, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (java.util.concurrent.TimeoutException e) {
                // weiter warten
            } catch (ExecutionException e) {
                Throwable t = e.getCause();
                errors[i] = i == 0 ? Engine.friendlyError(t) : t.getMessage();
                return null;
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
        try {
            return ok(Gallery.list(c, resolved, processId + "-g"));
        } catch (InterruptedException e) {
            throw new Canceled();
        } catch (Exception ignored) {
            // weiter mit dem unsichtbaren Browser
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

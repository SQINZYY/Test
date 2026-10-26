package de.clipsaver.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;

import com.sun.net.httpserver.HttpServer;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowWebView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

/** Startet die Android-Teile in Robolectric: App-Start, Oberfläche, Download-Dienst, Browser. */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34)
public class AppTest {

    private HttpServer server;
    private String base;

    @Before
    public void startServer() throws Exception {
        // Warteschlange ist statisch und überlebt zwischen den Tests
        DownloadService.clearFinished();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/bild.jpg", ex -> {
            byte[] body = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4, 5, 6, 7, 8};
            ex.getResponseHeaders().add("Content-Type", "image/jpeg");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream o = ex.getResponseBody()) {
                o.write(body);
            }
        });
        server.createContext("/fehlt.jpg", ex -> {
            ex.sendResponseHeaders(404, -1);
            ex.close();
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @After
    public void stopServer() {
        server.stop(0);
    }

    private static WebView findWebView(View v) {
        if (v instanceof WebView) return (WebView) v;
        if (v instanceof ViewGroup) {
            for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
                WebView w = findWebView(((ViewGroup) v).getChildAt(i));
                if (w != null) return w;
            }
        }
        return null;
    }

    private static Object call(Object target, String name, Object... args) throws Exception {
        for (Method m : target.getClass().getMethods()) {
            if (m.getName().equals(name) && m.getParameterTypes().length == args.length) return m.invoke(target, args);
        }
        throw new NoSuchMethodException(name);
    }

    private static WebResourceRequest request(final String url) {
        return new WebResourceRequest() {
            public Uri getUrl() { return Uri.parse(url); }
            public boolean isForMainFrame() { return false; }
            public boolean isRedirect() { return false; }
            public boolean hasGesture() { return false; }
            public String getMethod() { return "GET"; }
            public Map<String, String> getRequestHeaders() { return new HashMap<>(); }
        };
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    @Test
    public void mainActivityStartsAndServesUi() throws Exception {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        WebView web = findWebView(a.getWindow().getDecorView());
        assertNotNull(web);
        ShadowWebView sw = shadowOf(web);
        assertEquals("https://appassets.androidplatform.net/www/index.html", sw.getLastLoadedUrl());

        // Oberfläche kommt aus den Assets über die feste https-Adresse
        WebResourceResponse r = sw.getWebViewClient().shouldInterceptRequest(web, request("https://appassets.androidplatform.net/www/index.html"));
        assertEquals("text/html", r.getMimeType());
        assertTrue(read(r.getData()).contains("app.js"));
        r = sw.getWebViewClient().shouldInterceptRequest(web, request("https://appassets.androidplatform.net/www/app.js"));
        assertTrue(read(r.getData()).contains("window.CS"));
        assertEquals(null, sw.getWebViewClient().shouldInterceptRequest(web, request("https://i.ytimg.com/vi/x/hq.jpg")));
        r = sw.getWebViewClient().shouldInterceptRequest(web, request("https://appassets.androidplatform.net/thumb?uri=content%3A%2F%2Fmedia%2Fexternal%2Fimages%2Fmedia%2F999"));
        assertEquals(404, r.getStatusCode());

        Object bridge = sw.getJavascriptInterface("Android");
        assertNotNull(bridge);
        JSONObject engine = new JSONObject((String) call(bridge, "engineInfo"));
        assertTrue(engine.has("state"));
        assertEquals("[]", call(bridge, "history"));
        assertEquals("[]", call(bridge, "jobs"));
        assertEquals("{\"domains\":[]}", call(bridge, "cookiesInfo"));
        call(bridge, "save", "quality", "2160");
        assertEquals("2160", call(bridge, "load", "quality"));
        ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("x", "https://vm.tiktok.com/ZMabc/"));
        assertEquals("https://vm.tiktok.com/ZMabc/", call(bridge, "getClipboard"));
        assertEquals("1.0", call(bridge, "appVersion"));

        // Browser öffnen → BrowserActivity mit Adresse und Modus
        call(bridge, "browse", "https://library.tiktok.com/ads", "sniff", "");
        shadowOf(Looper.getMainLooper()).idle();
        Intent next = shadowOf(a).getNextStartedActivity();
        assertEquals(BrowserActivity.class.getName(), next.getComponent().getClassName());
        assertEquals("https://library.tiktok.com/ads", next.getStringExtra(BrowserActivity.EXTRA_URL));
        c.pause().stop().destroy();
    }

    /** Link prüfen über die Brücke: Ergebnis kommt als CS.onAnalyzed(...) zurück in die Oberfläche. */
    @Test
    public void analyzeReportsBackToUi() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        WebView web = findWebView(a.getWindow().getDecorView());
        ShadowWebView sw = shadowOf(web);
        sw.getWebViewClient().onPageFinished(web, "https://appassets.androidplatform.net/www/index.html");
        Object bridge = sw.getJavascriptInterface("Android");

        call(bridge, "analyze", "r1", "hier ist kein Link");
        String js = waitForJs(sw, "\"r1\"");
        assertTrue(js, js.contains("CS.onAnalyzed(\"r1\"") && js.contains("kein Link gefunden"));

        call(bridge, "analyze", "r2", "Werbung: https://library.tiktok.com/ads/detail/?ad_id=123");
        js = waitForJs(sw, "\"r2\"");
        assertTrue(js, js.contains("\"kind\":\"browse\"") && js.contains("\"why\":\"ads\""));
    }

    private static String waitForJs(ShadowWebView sw, String marker) throws Exception {
        for (int i = 0; i < 100; i++) {
            shadowOf(Looper.getMainLooper()).idle();
            String js = sw.getLastEvaluatedJavascript();
            if (js != null && js.contains(marker)) return js;
            Thread.sleep(50);
        }
        return String.valueOf(sw.getLastEvaluatedJavascript());
    }

    @Test
    public void sharedLinkIsKeptForUi() throws Exception {
        Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Guck mal https://vm.tiktok.com/ZMabc/");
        MainActivity a = Robolectric.buildActivity(MainActivity.class, share).setup().get();
        java.lang.reflect.Field f = MainActivity.class.getDeclaredField("pendingShared");
        f.setAccessible(true);
        // Seite ist in Robolectric noch nicht "fertig" geladen → Link wartet auf die Oberfläche
        assertEquals("Guck mal https://vm.tiktok.com/ZMabc/", f.get(a));
    }

    @Test
    public void downloadServiceSavesFilesAndHistory() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        final JSONObject[] last = new JSONObject[1];
        DownloadService.listener = job -> last[0] = job;
        JSONObject job = new JSONObject();
        job.put("kind", "files").put("title", "Urlaub").put("platform", "tiktok").put("pageUrl", "https://www.tiktok.com/@a/photo/1");
        job.put("items", new JSONArray()
                .put(new JSONObject().put("urls", new JSONArray().put(base + "/fehlt.jpg").put(base + "/bild.jpg")).put("type", "image").put("name", "Urlaub (1)"))
                .put(new JSONObject().put("urls", new JSONArray().put(base + "/bild.jpg")).put("type", "image").put("name", "Urlaub (2)")));
        String id = DownloadService.enqueue(ctx, job);
        Intent started = shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService();
        assertEquals(DownloadService.class.getName(), started.getComponent().getClassName());
        DownloadService service = Robolectric.buildService(DownloadService.class, started).create().get();
        service.onStartCommand(started, 0, 1);
        assertNotNull("Vordergrund-Benachrichtigung", shadowOf(service).getLastForegroundNotification());

        String state = "";
        for (int i = 0; i < 200 && !(state.equals("done") || state.equals("error")); i++) {
            Thread.sleep(50);
            shadowOf(Looper.getMainLooper()).idle();
            JSONArray jobs = DownloadService.jobs();
            for (int j = 0; j < jobs.length(); j++) {
                if (jobs.getJSONObject(j).getString("id").equals(id)) state = jobs.getJSONObject(j).getString("state");
            }
        }
        JSONObject done = null;
        JSONArray jobs = DownloadService.jobs();
        for (int j = 0; j < jobs.length(); j++) if (jobs.getJSONObject(j).getString("id").equals(id)) done = jobs.getJSONObject(j);
        assertEquals(done == null ? "" : done.toString(), "done", state);
        assertEquals(2, done.getJSONArray("results").length());
        assertEquals("image/jpeg", done.getJSONArray("results").getJSONObject(0).getString("mime"));
        JSONArray history = Saver.history(ctx);
        assertEquals(2, history.length());
        assertEquals("Urlaub (2)", history.getJSONObject(0).getString("title"));
        assertEquals("image", history.getJSONObject(0).getString("kind"));
        assertNotNull(last[0]);
        DownloadService.listener = null;
    }

    @Test
    public void browserActivityCollectsAndReturnsMedia() throws Exception {
        Intent i = new Intent(RuntimeEnvironment.getApplication(), BrowserActivity.class)
                .putExtra(BrowserActivity.EXTRA_URL, "https://adstransparency.google.com/?region=DE").putExtra(BrowserActivity.EXTRA_MODE, "sniff");
        ActivityController<BrowserActivity> c = Robolectric.buildActivity(BrowserActivity.class, i).setup();
        BrowserActivity a = c.get();
        WebView web = findWebView(a.getWindow().getDecorView());
        ShadowWebView sw = shadowOf(web);
        assertEquals("https://adstransparency.google.com/?region=DE", sw.getLastLoadedUrl());

        // Netzwerkanfragen der Seite (auch aus iframes) werden erkannt
        sw.getWebViewClient().shouldInterceptRequest(web, request("https://tpc.googlesyndication.com/archive/simgad/123456"));
        sw.getWebViewClient().shouldInterceptRequest(web, request("https://www.youtube.com/embed/dQw4w9WgXcQ"));
        sw.getWebViewClient().shouldInterceptRequest(web, request("https://www.google-analytics.com/collect?v=1"));
        shadowOf(Looper.getMainLooper()).idle();

        Button action = findButton(a.getWindow().getDecorView(), "gefunden");
        assertNotNull("Knopf zeigt Anzahl", action);
        assertEquals("1 Video · 1 Bild gefunden – anzeigen", action.getText().toString());
        action.performClick();
        assertTrue(a.isFinishing());
        assertEquals(Activity.RESULT_OK, shadowOf(a).getResultCode());
        JSONObject res = new JSONObject(shadowOf(a).getResultIntent().getStringExtra(BrowserActivity.RESULT));
        assertEquals(2, res.getJSONArray("items").length());
        assertEquals("image", res.getJSONArray("items").getJSONObject(0).getString("kind"));
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", res.getJSONArray("items").getJSONObject(1).getString("url"));
        assertTrue(res.getString("userAgent").length() > 0);
        assertTrue(res.has("cookies"));
    }

    @Test
    public void loginModeReturnsCookies() throws Exception {
        Intent i = new Intent(RuntimeEnvironment.getApplication(), BrowserActivity.class)
                .putExtra(BrowserActivity.EXTRA_URL, "https://www.tiktok.com/login").putExtra(BrowserActivity.EXTRA_MODE, "login")
                .putExtra(BrowserActivity.EXTRA_DOMAIN, "tiktok.com");
        BrowserActivity a = Robolectric.buildActivity(BrowserActivity.class, i).setup().get();
        android.webkit.CookieManager.getInstance().setCookie("https://www.tiktok.com/", "sessionid=abc");
        Button done = findButton(a.getWindow().getDecorView(), "Fertig");
        done.performClick();
        JSONObject res = new JSONObject(shadowOf(a).getResultIntent().getStringExtra(BrowserActivity.RESULT));
        assertEquals("tiktok.com", res.getString("domain"));
        assertTrue(res.getString("cookies").contains("sessionid=abc"));
    }

    private static Button findButton(View v, String text) {
        if (v instanceof Button && ((Button) v).getText().toString().contains(text)) return (Button) v;
        if (v instanceof ViewGroup) {
            for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
                Button b = findButton(((ViewGroup) v).getChildAt(i), text);
                if (b != null) return b;
            }
        }
        return null;
    }
}

package de.klangwelt.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;

/**
 * Hält die Web-Oberfläche (assets/www) in einer WebView. Der Spotify-Player (iFrame) spielt die Vorschauen,
 * die App stellt Cover-Abruf (open.spotify.com/oembed), Zwischenablage, das Öffnen der Spotify-App und die
 * optionale Spotify-Anmeldung (Browser + Rückkehr über klangwelt://callback) bereit.
 */
public class MainActivity extends Activity {

    // Feste https-Adresse für die Oberfläche: sicherer Kontext und saubere Herkunft für den Spotify-Player
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final String OEMBED = "https://open.spotify.com/oembed?";
    private static final String TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final int BG = 0xFF121212;

    private WebView web;
    private boolean pageReady;
    private String pendingAuth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Der Spotify-Player soll nach einem Tipp auf einen Song sofort losspielen
        s.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                if (!request.isForMainFrame()) return false;
                if ("klangwelt".equals(url.getScheme())) {
                    receiveAuth(url.toString());
                    return true;
                }
                openExternal(url.toString());
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                return assetResponse(url.getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverPending();
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        handleIntent(getIntent());
        web.loadUrl(START);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /** Spotify leitet nach der Anmeldung auf klangwelt://callback?code=…&state=… um. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "klangwelt".equals(data.getScheme())) receiveAuth(data.toString());
    }

    private void receiveAuth(String url) {
        pendingAuth = url;
        deliverPending();
    }

    private void deliverPending() {
        if (!pageReady || pendingAuth == null) return;
        String js = "window.KW && KW.onAuthCallback(" + JSONObject.quote(pendingAuth) + ")";
        pendingAuth = null;
        web.evaluateJavascript(js, null);
    }

    /** Anmeldung in einem Chrome Custom Tab (ohne Bibliothek: über die Intent-Extras), sonst im Browser. */
    private void openAuth(String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        i.putExtras(extras);
        i.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", BG);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Kein Browser gefunden", Toast.LENGTH_LONG).show();
        }
    }

    private WebResourceResponse assetResponse(String path) {
        if (path == null || path.contains("..")) return null;
        String file = path.startsWith("/") ? path.substring(1) : path;
        try {
            InputStream in = getAssets().open(file);
            String mime = mimeOf(file);
            boolean text = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") || mime.endsWith("svg+xml");
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            HashMap<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeOf(String file) {
        if (file.endsWith(".html")) return "text/html";
        if (file.endsWith(".js")) return "application/javascript";
        if (file.endsWith(".css")) return "text/css";
        if (file.endsWith(".svg")) return "image/svg+xml";
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.KW ? KW.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                // Wie bei Musik-Apps üblich: in den Hintergrund statt beenden
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (pageReady) web.evaluateJavascript("window.KW && KW.onResume && KW.onResume()", null);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Link kann nicht geöffnet werden", Toast.LENGTH_SHORT).show();
        }
    }

    /** Öffnet einen Song in der Spotify-App. false, wenn sie fehlt (dann öffnet die Oberfläche den Browser). */
    private boolean openSpotify(String uri) {
        if (uri == null || !uri.startsWith("spotify:")) return false;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            i.putExtra(Intent.EXTRA_REFERRER, Uri.parse("android-app://" + getPackageName()));
            startActivity(i);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /** GET (body == null) oder POST mit Formular-Daten; Antwort geht an Platform._http in der Oberfläche. */
    private void request(final String id, final String url, final String body) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int status = 0;
                String text = "";
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(15000);
                    if (body != null) {
                        c.setRequestMethod("POST");
                        c.setDoOutput(true);
                        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                        byte[] data = body.getBytes("UTF-8");
                        c.setFixedLengthStreamingMode(data.length);
                        OutputStream out = c.getOutputStream();
                        out.write(data);
                        out.close();
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    text = in == null ? "" : new String(readAll(in), "UTF-8");
                } catch (Exception e) {
                    status = 0;
                    if (body != null) text = "{\"error\":\"network\",\"error_description\":\"Keine Verbindung zu Spotify\"}";
                } finally {
                    if (c != null) c.disconnect();
                }
                final String js = "Platform._http(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(text) + ")";
                web.post(new Runnable() {
                    @Override
                    public void run() {
                        web.evaluateJavascript(js, null);
                    }
                });
            }
        }).start();
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    /** Wird von web/platform.js als window.Android benutzt. Läuft auf einem Hintergrund-Thread. */
    private class Bridge {
        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("spotify:"))) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openExternal(url);
                }
            });
        }

        @JavascriptInterface
        public boolean openSpotify(String uri) {
            return MainActivity.this.openSpotify(uri);
        }

        @JavascriptInterface
        public void get(String id, String url) {
            if (id == null || url == null || !url.startsWith(OEMBED)) return;
            MainActivity.this.request(id, url, null);
        }

        @JavascriptInterface
        public void post(String id, String url, String body) {
            if (id == null || body == null || !TOKEN_URL.equals(url)) return;
            MainActivity.this.request(id, url, body);
        }

        @JavascriptInterface
        public void openAuth(final String url) {
            if (url == null || !url.startsWith("https://accounts.spotify.com/")) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.openAuth(url);
                }
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            final String t = text == null ? "" : text;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Klangwelt", t));
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return p.versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}

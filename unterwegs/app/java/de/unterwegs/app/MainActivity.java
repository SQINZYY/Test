package de.unterwegs.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hält die Oberfläche (assets/www) in einer WebView und stellt ihr bereit:
 * Internet-Anfragen an die Routing-Dienste (mit eigenem User-Agent, ohne CORS),
 * Standort (GPS), Teilen und Links im Browser öffnen.
 */
public class MainActivity extends Activity {

    // Die Oberfläche läuft unter einer festen https-Adresse (sicherer Kontext für den Standort,
    // gültiger Referer für die OpenStreetMap-Kacheln). Die Dateien kommen aus den Assets.
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final String USER_AGENT = "Unterwegs/1.0 (Android-Routenplaner; +https://github.com/sqinzyy/test)";
    private static final int REQ_LOCATION = 7;
    private static final int MAX_BODY = 12 * 1024 * 1024;
    private static final String GMAPS_PACKAGE = "com.google.android.apps.maps";

    /** Nur diese Dienste darf die Oberfläche über die Brücke abfragen. */
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
            "api.transitous.org",
            "photon.komoot.io",
            "nominatim.openstreetmap.org",
            "valhalla1.openstreetmap.de",
            "routing.openstreetmap.de"
    ));

    private WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private final Map<String, String> bodies = new ConcurrentHashMap<>();
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF1F5F9);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " " + USER_AGENT);
        web.addJavascriptInterface(new Bridge(), "Android");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                openExternal(request.getUrl().toString());
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                return assetResponse(url.getPath());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                geoOrigin = origin;
                geoCallback = callback;
                if (Build.VERSION.SDK_INT >= 23) {
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                } else {
                    callback.invoke(origin, true, false);
                }
            }
        });

        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        web.loadUrl(START);
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_LOCATION || geoCallback == null) return;
        boolean granted = false;
        for (int r : grantResults) if (r == PackageManager.PERMISSION_GRANTED) granted = true;
        geoCallback.invoke(geoOrigin, granted, false);
        geoCallback = null;
        geoOrigin = null;
    }

    private WebResourceResponse assetResponse(String path) {
        if (path == null || path.contains("..")) return null;
        String file = path.startsWith("/") ? path.substring(1) : path;
        try {
            InputStream in = getAssets().open(file);
            String mime = mimeOf(file);
            boolean text = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json");
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
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".svg")) return "image/svg+xml";
        if (file.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /**
     * Öffnet einen Link in der Google-Maps-App (Route oder "google.navigation:" für die Navigation).
     * Ist Google Maps nicht installiert, kommt der Web-Link (Browser oder andere Karten-App) dran.
     */
    private void openMaps(String primary, String fallback) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(primary));
            i.setPackage(GMAPS_PACKAGE);
            startActivity(i);
            return;
        } catch (ActivityNotFoundException e) {
            // Google Maps fehlt – weiter mit dem Web-Link
        } catch (RuntimeException e) {
            // ungültiger Link – weiter mit dem Web-Link
        }
        if (fallback != null && fallback.startsWith("https://")) openExternal(fallback);
        else Toast.makeText(this, "Google Maps ist nicht installiert", Toast.LENGTH_SHORT).show();
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Kein Browser gefunden", Toast.LENGTH_SHORT).show();
        }
    }

    /** Lädt eine URL im Hintergrund; das Ergebnis holt sich die Seite mit httpBody(id). */
    private void fetch(final String id, final String url, final int timeoutMs) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                int status;
                String body;
                HttpURLConnection con = null;
                try {
                    URL u = new URL(url);
                    if (!"https".equals(u.getProtocol()) || !ALLOWED_HOSTS.contains(u.getHost())) {
                        throw new IOException("Adresse nicht erlaubt");
                    }
                    con = (HttpURLConnection) u.openConnection();
                    con.setConnectTimeout(Math.min(timeoutMs, 15000));
                    con.setReadTimeout(timeoutMs);
                    con.setRequestProperty("User-Agent", USER_AGENT);
                    con.setRequestProperty("Accept", "application/json");
                    con.setRequestProperty("Accept-Language", "de-DE,de;q=0.9,en;q=0.5");
                    status = con.getResponseCode();
                    InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
                    body = in == null ? "" : new String(readAll(in, MAX_BODY), "UTF-8");
                } catch (Exception e) {
                    status = 0;
                    body = e.getMessage() == null ? "Keine Verbindung" : e.getMessage();
                } finally {
                    if (con != null) con.disconnect();
                }
                bodies.put(id, body);
                final String js = "window.U && U.api && U.api._done(" + JSONObject.quote(id) + "," + status + ")";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (web != null) web.evaluateJavascript(js, null);
                    }
                });
            }
        });
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > max) throw new IOException("Antwort zu groß");
            }
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.U && U.app ? U.app.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Wird von JavaScript als window.Android aufgerufen. */
    public class Bridge {
        @JavascriptInterface
        public void httpGet(String id, String url, int timeoutMs) {
            fetch(id, url, timeoutMs > 0 ? timeoutMs : 30000);
        }

        @JavascriptInterface
        public String httpBody(String id) {
            String b = bodies.remove(id);
            return b == null ? "" : b;
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    try {
                        startActivity(Intent.createChooser(send, "Route teilen"));
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "Keine App zum Teilen gefunden", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void openMaps(final String primary, final String fallback) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.openMaps(primary, fallback);
                }
            });
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openExternal(url);
                }
            });
        }
    }
}

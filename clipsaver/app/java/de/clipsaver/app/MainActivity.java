package de.clipsaver.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Size;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import com.yausername.youtubedl_android.YoutubeDL;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Hält die Web-Oberfläche (assets/www) in einer WebView und verbindet sie mit Android:
 * Links prüfen (Analyzer), Downloads starten (DownloadService), eingebauter Browser für Werbung,
 * Anmeldung/Cookies, Engine-Update, Öffnen und Teilen fertiger Dateien.
 */
public class MainActivity extends Activity implements DownloadService.Listener, Analyzer.Grabber {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final int REQ_BROWSER = 1;
    private static final int REQ_LOGIN = 2;
    private static final int REQ_COOKIES = 3;
    private static final int BG = 0xFF0B0B12;
    private static final long UPDATE_INTERVAL = 24 * 60 * 60 * 1000L;

    private FrameLayout root;
    private WebView web;
    private SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Map<String, AtomicBoolean> analyses = new ConcurrentHashMap<>();
    private String pendingShared;
    private String pendingTab;
    private boolean pageReady;
    private volatile String engineState = "init";
    private volatile String engineError;
    private boolean askedPermissions;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("clipsaver", Context.MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
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
                if ("/thumb".equals(url.getPath())) return thumbResponse(url.getQueryParameter("uri"));
                return assetResponse(url.getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverPending();
            }
        });
        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        DownloadService.listener = this;
        handleIntent(getIntent());
        web.loadUrl(START);
        startEngine();
    }

    /** Richtet beim ersten Start Python/yt-dlp/FFmpeg ein (einmalig einige Sekunden) und prüft auf Updates. */
    private void startEngine() {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Engine.init(MainActivity.this);
                    engineState = "ready";
                } catch (Throwable e) {
                    engineState = "error";
                    engineError = String.valueOf(e.getMessage());
                }
                sendEngineState();
                if ("ready".equals(engineState) && prefs.getBoolean("autoUpdate", true)
                        && System.currentTimeMillis() - prefs.getLong("lastUpdateCheck", 0) > UPDATE_INTERVAL
                        && !DownloadService.isBusy()) {
                    updateEngine(prefs.getBoolean("nightly", false), true);
                }
            }
        });
    }

    private void updateEngine(boolean nightly, boolean auto) {
        JSONObject r = new JSONObject();
        try {
            boolean updated = Engine.update(this, nightly);
            prefs.edit().putLong("lastUpdateCheck", System.currentTimeMillis()).apply();
            r.put("ok", true);
            r.put("updated", updated);
        } catch (Throwable e) {
            try {
                r.put("ok", false);
                r.put("error", Engine.friendlyError(e));
            } catch (Exception ignored) {
                // nur bei ungültigem JSON
            }
        }
        try {
            r.put("auto", auto);
            r.put("version", Engine.version(this));
        } catch (Exception ignored) {
            // nur bei ungültigem JSON
        }
        js("CS.onEngineUpdate(" + r + ")");
    }

    private void sendEngineState() {
        js("CS.onEngine(" + engineInfo() + ")");
    }

    private String engineInfo() {
        JSONObject o = new JSONObject();
        try {
            o.put("state", engineState);
            if (engineError != null) o.put("error", engineError);
            if ("ready".equals(engineState)) o.put("version", Engine.version(this));
            o.put("autoUpdate", prefs.getBoolean("autoUpdate", true));
            o.put("nightly", prefs.getBoolean("nightly", false));
            o.put("lastCheck", prefs.getLong("lastUpdateCheck", 0));
        } catch (Exception ignored) {
            // nur bei ungültigem JSON
        }
        return o.toString();
    }

    private WebResourceResponse assetResponse(String path) {
        if (path == null || path.contains("..")) return null;
        String file = path.startsWith("/") ? path.substring(1) : path;
        try {
            InputStream in = getAssets().open(file);
            String mime = mimeOf(file);
            WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("javascript") ? "utf-8" : null, in);
            HashMap<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    /** Kleines Vorschaubild einer gespeicherten Datei (Bild oder Video) für den Verlauf. */
    private WebResourceResponse thumbResponse(String uri) {
        Bitmap bmp = null;
        try {
            Uri u = Uri.parse(uri);
            if (Build.VERSION.SDK_INT >= 29) {
                bmp = getContentResolver().loadThumbnail(u, new Size(240, 240), null);
            } else if (uri.contains("/video/")) {
                bmp = MediaStore.Video.Thumbnails.getThumbnail(getContentResolver(), ContentUris.parseId(u), MediaStore.Video.Thumbnails.MINI_KIND, null);
            } else {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = 8;
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    bmp = BitmapFactory.decodeStream(in, null, o);
                }
            }
        } catch (Exception ignored) {
            // Datei gelöscht oder kein Vorschaubild möglich
        }
        if (bmp == null) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
                    new ByteArrayInputStream(new byte[0]));
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 80, out);
        return new WebResourceResponse("image/jpeg", null, new ByteArrayInputStream(out.toByteArray()));
    }

    private static String mimeOf(String file) {
        if (file.endsWith(".html")) return "text/html";
        if (file.endsWith(".js")) return "application/javascript";
        if (file.endsWith(".css")) return "text/css";
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        deliverPending();
    }

    /** Links, die per "Teilen" aus TikTok/YouTube kommen, und Tipp auf die Download-Benachrichtigung. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() > 0) pendingShared = text;
        } else if ("downloads".equals(intent.getAction())) {
            pendingTab = "downloads";
        }
    }

    private void deliverPending() {
        if (!pageReady) return;
        if (pendingShared != null) {
            js("CS.onShared(" + JSONObject.quote(pendingShared) + ")");
            pendingShared = null;
        }
        if (pendingTab != null) {
            js("CS.showTab(" + JSONObject.quote(pendingTab) + ")");
            pendingTab = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (DownloadService.listener == this) DownloadService.listener = null;
        for (Map.Entry<String, AtomicBoolean> a : analyses.entrySet()) {
            a.getValue().set(true);
            Engine.cancel("an-" + a.getKey());
        }
        pool.shutdown();
        super.onDestroy();
    }

    @Override
    public void onJob(JSONObject job) {
        js("CS.onJob(" + job + ")");
    }

    /** Führt JavaScript in der Oberfläche aus (von jedem Thread). */
    private void js(final String code) {
        web.post(new Runnable() {
            @Override
            public void run() {
                if (pageReady) web.evaluateJavascript("window.CS && " + code, null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.CS ? CS.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "Link kann nicht geöffnet werden", Toast.LENGTH_SHORT).show();
        }
    }

    /** Beim ersten Download: Benachrichtigungen (Android 13+) bzw. Speichern (Android 7–9) erlauben. */
    private void askPermissions() {
        if (askedPermissions || Build.VERSION.SDK_INT < 23) return;
        askedPermissions = true;
        String perm = null;
        if (Build.VERSION.SDK_INT >= 33) perm = "android.permission.POST_NOTIFICATIONS";
        else if (Build.VERSION.SDK_INT < 29) perm = "android.permission.WRITE_EXTERNAL_STORAGE";
        if (perm != null && checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{perm}, 10);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_BROWSER) {
            String res = resultCode == RESULT_OK && data != null ? data.getStringExtra(BrowserActivity.RESULT) : null;
            js("CS.onBrowserResult(" + (res == null ? "null" : res) + ")");
        } else if (requestCode == REQ_LOGIN) {
            String res = resultCode == RESULT_OK && data != null ? data.getStringExtra(BrowserActivity.RESULT) : null;
            if (res != null) {
                try {
                    JSONObject o = new JSONObject(res);
                    Cookies c = readCookies();
                    c.replaceDomain(o.getString("domain"), o.optString("cookies"));
                    writeCookies(c);
                } catch (Exception e) {
                    Toast.makeText(this, "Anmeldung konnte nicht übernommen werden", Toast.LENGTH_SHORT).show();
                }
            }
            js("CS.onCookies(" + cookiesInfo() + ")");
        } else if (requestCode == REQ_COOKIES && resultCode == RESULT_OK && data != null && data.getData() != null) {
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                if (in == null) throw new IOException("leer");
                Cookies imported = Cookies.parse(new String(Http.readAll(in, 4 << 20), "UTF-8"));
                if (imported.isEmpty()) throw new IOException("keine Cookies");
                writeCookies(imported);
                Toast.makeText(this, "Cookies übernommen: " + join(imported.domains()), Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "Keine gültige cookies.txt (Netscape-Format)", Toast.LENGTH_LONG).show();
            }
            js("CS.onCookies(" + cookiesInfo() + ")");
        }
    }

    private Cookies readCookies() {
        File f = Engine.cookiesFile(this);
        if (!f.isFile()) return new Cookies();
        try {
            return Cookies.parse(new String(Http.readAll(new FileInputStream(f), 4 << 20), "UTF-8"));
        } catch (IOException e) {
            return new Cookies();
        }
    }

    private void writeCookies(Cookies c) throws IOException {
        File f = Engine.cookiesFile(this);
        if (c.isEmpty()) {
            f.delete();
            return;
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(c.toText().getBytes("UTF-8"));
        }
    }

    private String cookiesInfo() {
        JSONObject o = new JSONObject();
        try {
            o.put("domains", new JSONArray(readCookies().domains()));
        } catch (Exception ignored) {
            // nur bei ungültigem JSON
        }
        return o.toString();
    }

    private static String join(java.util.List<String> list) {
        StringBuilder sb = new StringBuilder();
        for (String s : list) sb.append(sb.length() > 0 ? ", " : "").append(s);
        return sb.toString();
    }

    // ---- Unsichtbarer Browser (Ersatz, wenn TikTok/YouTube die direkte Abfrage blockieren) ----

    @Override
    public String grab(final String url, final String script, final AtomicBoolean cancel) throws Exception {
        final String[] result = new String[1];
        final CountDownLatch latch = new CountDownLatch(1);
        final WebView[] holder = new WebView[1];
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final WebView w = new WebView(MainActivity.this);
                holder[0] = w;
                WebSettings s = w.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                s.setUserAgentString(Http.UA_DESKTOP);
                CookieManager.getInstance().setCookie("https://www.youtube.com", "SOCS=CAI; domain=.youtube.com; path=/");
                w.setWebViewClient(new WebViewClient() {
                    int tries;

                    @Override
                    public void onPageFinished(WebView view, String u) {
                        poll();
                    }

                    void poll() {
                        if (latch.getCount() == 0) return;
                        w.evaluateJavascript(script, new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                if (value != null && !value.equals("null")) {
                                    try {
                                        result[0] = new JSONArray("[" + value + "]").getString(0);
                                    } catch (Exception ignored) {
                                        // ungültig – weiter versuchen
                                    }
                                }
                                if (result[0] != null || ++tries > 12 || cancel.get()) latch.countDown();
                                else w.postDelayed(new Runnable() {
                                    @Override
                                    public void run() {
                                        poll();
                                    }
                                }, 1000);
                            }
                        });
                    }
                });
                w.setAlpha(0f);
                root.addView(w, 0, new FrameLayout.LayoutParams(4, 4));
                w.loadUrl(url);
            }
        });
        latch.await(30, TimeUnit.SECONDS);
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (holder[0] != null) {
                    root.removeView(holder[0]);
                    holder[0].destroy();
                }
            }
        });
        return result[0];
    }

    @Override
    public String cookies(String url) {
        return CookieManager.getInstance().getCookie(url);
    }

    /** Wird von JavaScript als window.Android aufgerufen. */
    public class Bridge {

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString("ui." + key, null);
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString("ui." + key, value).apply();
        }

        @JavascriptInterface
        public String getClipboard() {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return null;
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return null;
            CharSequence t = clip.getItemAt(0).coerceToText(MainActivity.this);
            return t == null ? null : t.toString();
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void analyze(final String reqId, final String text) {
            final AtomicBoolean cancel = new AtomicBoolean();
            analyses.put(reqId, cancel);
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    JSONObject r;
                    try {
                        r = Analyzer.analyze(MainActivity.this, text, "an-" + reqId, cancel, MainActivity.this);
                    } catch (Analyzer.Canceled | YoutubeDL.CanceledException e) {
                        r = null;
                    } catch (Throwable e) {
                        try {
                            r = cancel.get() ? null : Analyzer.error(Engine.friendlyError(e));
                        } catch (Exception ignored) {
                            r = null;
                        }
                    }
                    analyses.remove(reqId);
                    if (r != null && !cancel.get()) js("CS.onAnalyzed(" + JSONObject.quote(reqId) + "," + r + ")");
                }
            });
        }

        @JavascriptInterface
        public void cancelAnalyze(String reqId) {
            AtomicBoolean c = analyses.get(reqId);
            if (c != null) c.set(true);
            Engine.cancel("an-" + reqId);
        }

        @JavascriptInterface
        public String enqueue(String json) {
            try {
                String id = DownloadService.enqueue(MainActivity.this, new JSONObject(json));
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        askPermissions();
                    }
                });
                return id;
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public void cancelJob(String id) {
            DownloadService.cancel(id);
        }

        @JavascriptInterface
        public String jobs() {
            return DownloadService.jobs().toString();
        }

        @JavascriptInterface
        public void clearFinished() {
            DownloadService.clearFinished();
        }

        @JavascriptInterface
        public String history() {
            return Saver.history(MainActivity.this).toString();
        }

        @JavascriptInterface
        public void removeHistory(String id, boolean deleteFile) {
            Saver.removeHistory(MainActivity.this, id, deleteFile);
        }

        @JavascriptInterface
        public void clearHistory() {
            Saver.clearHistory(MainActivity.this);
        }

        @JavascriptInterface
        public void open(final String uri, final String mime) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(view);
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "Keine App zum Öffnen gefunden", Toast.LENGTH_SHORT).show();
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Datei nicht mehr vorhanden", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void share(final String uri, final String mime) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND).setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(Intent.createChooser(send, "Teilen"));
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Teilen nicht möglich", Toast.LENGTH_SHORT).show();
                    }
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

        /** Eingebauter Browser mit Medien-Erkennung ("sniff") oder zum Anmelden ("login"). */
        @JavascriptInterface
        public void browse(final String url, final String mode, final String domain) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(MainActivity.this, BrowserActivity.class)
                            .putExtra(BrowserActivity.EXTRA_URL, url)
                            .putExtra(BrowserActivity.EXTRA_MODE, mode)
                            .putExtra(BrowserActivity.EXTRA_DOMAIN, domain);
                    startActivityForResult(i, "login".equals(mode) ? REQ_LOGIN : REQ_BROWSER);
                }
            });
        }

        @JavascriptInterface
        public String engineInfo() {
            return MainActivity.this.engineInfo();
        }

        @JavascriptInterface
        public void setEngineOptions(boolean autoUpdate, boolean nightly) {
            prefs.edit().putBoolean("autoUpdate", autoUpdate).putBoolean("nightly", nightly).apply();
        }

        @JavascriptInterface
        public void updateEngine() {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.updateEngine(prefs.getBoolean("nightly", false), false);
                }
            });
        }

        @JavascriptInterface
        public String cookiesInfo() {
            return MainActivity.this.cookiesInfo();
        }

        @JavascriptInterface
        public void importCookies() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                    try {
                        startActivityForResult(pick, REQ_COOKIES);
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "Kein Dateimanager gefunden", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void clearCookies() {
            Engine.cookiesFile(MainActivity.this).delete();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                }
            });
        }
    }
}

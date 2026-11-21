package de.setupbuilder.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Hält die Web-Oberfläche (assets/www) in einer WebView und stellt ihr
 * Teilen, Zwischenablage, Speicher, Laden von Links und Bildauswahl von Android bereit.
 */
public class MainActivity extends Activity {

    // Die Oberfläche läuft unter einer festen https-Adresse, damit Web Worker und WebAssembly
    // (Texterkennung) funktionieren. Die Dateien kommen direkt aus den Assets der App.
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final int PICK_FILES = 1;
    private static final int BG = 0xFF071116;
    // Liest die Seite im eingebauten Browser aus: HTML + sichtbarer Text
    private static final String EXTRACT_JS = "(function(){return document.documentElement.outerHTML+'\\n<!--SB-TEXT-->\\n'+(document.body?document.body.innerText:'')})()";

    private FrameLayout root;
    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    // Eingebauter Browser für Geizhals-Listen und Preisabfragen
    private LinearLayout browserBox;
    private WebView browser;
    private String browseId;
    // "PC verbinden": kleiner Server im WLAN, über den der PC seine Hardware schickt
    private PcLinkServer pcLink;
    private SharedPreferences prefs;
    private String pendingImport;
    private final List<String> pendingImages = new ArrayList<>();
    private boolean pageReady;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("setupbuilder", Context.MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
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

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverPending();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Screenshots wählen"), PICK_FILES);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        handleIntent(getIntent());
        web.loadUrl(START);
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

    private static String mimeOf(String file) {
        if (file.endsWith(".html")) return "text/html";
        if (file.endsWith(".js")) return "application/javascript";
        if (file.endsWith(".css")) return "text/css";
        if (file.endsWith(".wasm")) return "application/wasm";
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".svg")) return "image/svg+xml";
        if (file.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        deliverPending();
    }

    /** Text, Links oder Screenshots, die per "Teilen" an die App geschickt wurden. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (Intent.ACTION_SEND.equals(action) && type != null && type.startsWith("image/")) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) addPendingImage(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action) && type != null && type.startsWith("image/")) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null) for (Uri u : uris) addPendingImage(u);
        } else if (Intent.ACTION_SEND.equals(action)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() > 0) pendingImport = text;
        }
    }

    private void addPendingImage(Uri uri) {
        if (pendingImages.size() >= 10) return;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return;
            byte[] data = readAll(in, 20 * 1024 * 1024);
            String mime = getContentResolver().getType(uri);
            if (mime == null || !mime.startsWith("image/")) mime = "image/png";
            pendingImages.add("data:" + mime + ";base64," + Base64.encodeToString(data, Base64.NO_WRAP));
        } catch (Exception e) {
            Toast.makeText(this, "Bild konnte nicht gelesen werden", Toast.LENGTH_SHORT).show();
        }
    }

    private void deliverPending() {
        if (!pageReady) return;
        if (pendingImport != null) {
            String js = "window.SB && SB.receiveImport(" + JSONObject.quote(pendingImport) + ")";
            pendingImport = null;
            web.evaluateJavascript(js, null);
        }
        if (!pendingImages.isEmpty()) {
            StringBuilder arr = new StringBuilder("[");
            for (int i = 0; i < pendingImages.size(); i++) {
                if (i > 0) arr.append(',');
                arr.append(JSONObject.quote(pendingImages.get(i)));
            }
            arr.append(']');
            pendingImages.clear();
            web.evaluateJavascript("window.SB && SB.receiveImages(" + arr + ")", null);
        }
    }

    @Override
    protected void onDestroy() {
        stopPcLink();
        super.onDestroy();
    }

    private String startPcLink() {
        stopPcLink();
        try {
            String ip = PcLinkServer.findLanAddress();
            if (ip == null) return "{\"ok\":false,\"error\":\"wlan\"}";
            String script = new String(readAll(getAssets().open("pclink.ps1"), 1024 * 1024), "UTF-8");
            pcLink = new PcLinkServer(script, new PcLinkServer.Listener() {
                @Override
                public void onScriptFetched() {
                    sendPcEvent("fetched", "null");
                }

                @Override
                public void onScan(String json) {
                    sendPcEvent("scan", JSONObject.quote(json));
                }
            });
            pcLink.start(ip);
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("ip", pcLink.getIp());
            o.put("port", pcLink.getPort());
            o.put("token", pcLink.getToken());
            return o.toString();
        } catch (Exception e) {
            pcLink = null;
            return "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
        }
    }

    private void stopPcLink() {
        if (pcLink != null) pcLink.stop();
        pcLink = null;
    }

    private void sendPcEvent(final String type, final String data) {
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.SB && SB.onPcLink(" + JSONObject.quote(type) + "," + data + ")", null);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILES || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                ClipData clip = data.getClipData();
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (browser != null) {
            cancelBrowser();
            return;
        }
        web.evaluateJavascript("window.SB ? SB.back() : false", new ValueCallback<String>() {
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

    private static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new IOException("zu groß");
        }
        return out.toByteArray();
    }

    /**
     * Öffnet eine Seite (z. B. eine Geizhals-Wunschliste) im eingebauten Browser. Er verhält sich wie
     * ein normaler Browser (JavaScript, Cookies, Weiterleitungen wie bei gh.de-Kurzlinks) und schickt
     * den Inhalt nach dem Laden an die Oberfläche. Sichtbar, damit z. B. ein Cookie-Hinweis bestätigt
     * werden kann; unsichtbar für Preisabfragen.
     */
    private void openBrowser(String id, String url, boolean visible) {
        closeBrowser();
        browseId = id;
        browser = new WebView(this);
        WebSettings s = browser.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("http".equals(scheme) || "https".equals(scheme));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                for (int delay : new int[]{800, 2500, 5000, 9000}) scheduleExtract(delay);
            }
        });

        browserBox = new LinearLayout(this);
        browserBox.setOrientation(LinearLayout.VERTICAL);
        browserBox.setBackgroundColor(BG);
        TextView hint = new TextView(this);
        hint.setText("Liste wird gelesen … Falls ein Cookie-Hinweis erscheint, bitte kurz bestätigen.");
        hint.setTextColor(0xFFE7F4F2);
        hint.setTextSize(14);
        int pad = dp(12);
        hint.setPadding(pad, pad, pad, pad);
        browserBox.addView(hint);
        browserBox.addView(browser, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER);
        bar.setPadding(pad, pad / 2, pad, pad / 2);
        Button cancel = new Button(this);
        cancel.setText("Abbrechen");
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                cancelBrowser();
            }
        });
        Button take = new Button(this);
        take.setText("Teile übernehmen");
        take.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                extract(true);
            }
        });
        bar.addView(cancel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(take, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        browserBox.addView(bar);
        // Unsichtbar bleibt die WebView trotzdem im Fenster, damit die Seite normal lädt
        browserBox.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
        root.addView(browserBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        browser.loadUrl(url);
    }

    private void scheduleExtract(int delay) {
        final String id = browseId;
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (browser != null && id != null && id.equals(browseId)) extract(false);
            }
        }, delay);
    }

    private void extract(final boolean fin) {
        if (browser == null) return;
        final String id = browseId;
        final String url = browser.getUrl();
        browser.evaluateJavascript(EXTRACT_JS, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String json) {
                // json ist bereits ein JavaScript-String-Literal
                web.evaluateJavascript("window.SB && SB.onBrowse(" + JSONObject.quote(id) + "," + JSONObject.quote(url == null ? "" : url)
                        + "," + (json == null ? "null" : json) + "," + fin + ")", null);
            }
        });
    }

    private void cancelBrowser() {
        String id = browseId;
        closeBrowser();
        if (id != null) web.evaluateJavascript("window.SB && SB.onBrowseCancel(" + JSONObject.quote(id) + ")", null);
    }

    private void closeBrowser() {
        browseId = null;
        if (browserBox != null) root.removeView(browserBox);
        if (browser != null) browser.destroy();
        browser = null;
        browserBox = null;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /** Teilt ein Bild (PNG als Base64) zusammen mit Text, z. B. die Build-Karte mit Import-Code. */
    private void shareImage(String base64, String text, String title) {
        try {
            File dir = new File(getCacheDir(), ShareProvider.DIR);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Ordner");
            File file = new File(dir, "setupbuilder-build.png");
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + file.getName());
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, text);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "Build teilen"));
        } catch (Exception e) {
            Toast.makeText(this, "Bild konnte nicht geteilt werden", Toast.LENGTH_SHORT).show();
        }
    }

    /** Wird von JavaScript als window.Android aufgerufen. */
    public class Bridge {

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void share(final String text, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    send.putExtra(Intent.EXTRA_SUBJECT, title);
                    startActivity(Intent.createChooser(send, "Build teilen"));
                }
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("SetupBuilder", text));
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
        public void browse(final String id, final String url, final boolean visible) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openBrowser(id, url, visible);
                }
            });
        }

        @JavascriptInterface
        public String startPcLink() {
            return MainActivity.this.startPcLink();
        }

        @JavascriptInterface
        public void stopPcLink() {
            MainActivity.this.stopPcLink();
        }

        @JavascriptInterface
        public void closeBrowser() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.closeBrowser();
                }
            });
        }

        @JavascriptInterface
        public void shareImage(final String base64, final String text, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.shareImage(base64, text, title);
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

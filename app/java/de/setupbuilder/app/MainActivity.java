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
import android.util.Base64;
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
import java.net.HttpURLConnection;
import java.net.URL;
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
    private static final int MAX_DOWNLOAD = 6 * 1024 * 1024;

    private WebView web;
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
        web.setBackgroundColor(0xFF071116);
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
        setContentView(web);

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

    /** Lädt eine Seite (z. B. eine Geizhals-Wunschliste) im Hintergrund. */
    private void download(final String id, final String address) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int status = 0;
                String body = "";
                HttpURLConnection con = null;
                try {
                    URL url = new URL(address);
                    String protocol = url.getProtocol();
                    if (!"https".equals(protocol) && !"http".equals(protocol)) throw new IOException("Ungültiger Link");
                    con = (HttpURLConnection) url.openConnection();
                    con.setConnectTimeout(15000);
                    con.setReadTimeout(20000);
                    con.setInstanceFollowRedirects(true);
                    con.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
                    con.setRequestProperty("Accept", "text/html,application/xhtml+xml");
                    con.setRequestProperty("Accept-Language", "de-DE,de;q=0.9");
                    status = con.getResponseCode();
                    InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
                    if (in != null) {
                        body = new String(readAll(in, MAX_DOWNLOAD), "UTF-8");
                        in.close();
                    }
                } catch (Exception e) {
                    body = String.valueOf(e.getMessage());
                } finally {
                    if (con != null) con.disconnect();
                }
                final String js = "window.SB && SB.onFetch(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")";
                web.post(new Runnable() {
                    @Override
                    public void run() {
                        web.evaluateJavascript(js, null);
                    }
                });
            }
        }).start();
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
        public void fetchUrl(String id, String url) {
            download(id, url);
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

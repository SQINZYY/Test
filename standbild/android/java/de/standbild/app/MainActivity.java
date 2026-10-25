package de.standbild.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;

/**
 * Hält die Web-Oberfläche (assets/www) in einer WebView. Android liefert Videoauswahl,
 * geteilte Videos und das Speichern der Poster in der Galerie (Bilder/Standbild).
 * Die Videoanalyse läuft komplett in der WebView, nichts wird hochgeladen.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final String SHARED_PATH = "/shared/video";
    private static final int PICK_VIDEO = 1;
    private static final int ASK_STORAGE = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean pageReady;
    // Per "Teilen" empfangenes Video: wartet auf die Seite, danach wird es unter SHARED_PATH ausgeliefert
    private Uri pendingVideo;
    private String pendingName;
    private String pendingType;
    private volatile Uri servedVideo;
    private volatile String servedType;
    private int sharedCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                if (SHARED_PATH.equals(url.getPath())) return sharedResponse();
                return assetResponse(url.getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverShared();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("video/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Video wählen"), PICK_VIDEO);
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
        if (path == null || path.contains("..")) return notFound();
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
            return notFound();
        }
    }

    private WebResourceResponse sharedResponse() {
        Uri uri = servedVideo;
        if (uri == null) return notFound();
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return notFound();
            return new WebResourceResponse(servedType != null ? servedType : "video/mp4", null, in);
        } catch (Exception e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeOf(String file) {
        if (file.endsWith(".html")) return "text/html";
        if (file.endsWith(".js")) return "application/javascript";
        if (file.endsWith(".css")) return "text/css";
        if (file.endsWith(".woff2")) return "font/woff2";
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        deliverShared();
    }

    /** Ein Video, das per "Teilen" oder "Öffnen mit" an die App geschickt wurde. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        if (uri == null) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("video/")) type = getContentResolver().getType(uri);
        pendingVideo = uri;
        pendingType = type;
        pendingName = displayName(uri);
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && n.length() > 0) return n;
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "Video.mp4";
    }

    private void deliverShared() {
        if (pageReady && pendingVideo != null) {
            web.evaluateJavascript("window.Standbild && Standbild.openShared && Standbild.openShared()", null);
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.Standbild && Standbild.back ? Standbild.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_VIDEO || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    /** Speichert ein Bild in Bilder/Standbild, damit es in der Galerie auftaucht. */
    private String saveToGallery(byte[] data, String name, String mime) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put("relative_path", Environment.DIRECTORY_PICTURES + "/Standbild");
            v.put("is_pending", 1);
            Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return "error";
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) return "error";
                out.write(data);
            }
            v.clear();
            v.put("is_pending", 0);
            getContentResolver().update(uri, v, null, null);
            return "ok";
        }
        if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, ASK_STORAGE);
                }
            });
            return "permission";
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Standbild");
        if (!dir.isDirectory() && !dir.mkdirs()) return "error";
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(data);
        }
        MediaScannerConnection.scanFile(this, new String[]{file.getPath()}, new String[]{mime}, null);
        return "ok";
    }

    private class Bridge {
        @JavascriptInterface
        public String saveImage(String base64, String name, String mime) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                return saveToGallery(Base64.decode(base64, Base64.DEFAULT), safe, mime != null ? mime : "image/jpeg");
            } catch (Exception e) {
                return "error";
            }
        }

        /** Liefert das geteilte Video einmalig als {url, name, type} oder "" */
        @JavascriptInterface
        public String sharedVideo() {
            Uri uri = pendingVideo;
            if (uri == null) return "";
            servedVideo = uri;
            servedType = pendingType;
            pendingVideo = null;
            try {
                JSONObject o = new JSONObject();
                o.put("url", "https://" + HOST + SHARED_PATH + "?n=" + (++sharedCount));
                o.put("name", pendingName);
                o.put("type", pendingType != null ? pendingType : "video/mp4");
                return o.toString();
            } catch (Exception e) {
                return "";
            }
        }
    }
}

package de.diashowstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.view.WindowManager;
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
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hält die Oberfläche (assets/www) in einer WebView und stellt ihr Bildauswahl,
 * Speichern in der Galerie, Teilen und das Anfügen von Musik an Videos bereit.
 */
public class MainActivity extends Activity {

    // Die Oberfläche läuft unter einer festen https-Adresse (sicherer Kontext für WebCodecs,
    // IndexedDB und ES-Module). Die Dateien kommen direkt aus der App, nichts aus dem Internet.
    static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final int REQ_FILES = 1;
    private static final int REQ_IMAGES = 2;
    private static final int REQ_PERMISSION = 3;
    private static final int BG = 0xFF0E0E13;

    private WebView web;
    private boolean pageReady;
    private ValueCallback<Uri[]> fileCallback;
    private String pickId;
    private final List<Uri> sharedImages = new ArrayList<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private Files files;
    private Runnable afterPermission;
    private Runnable permissionDenied;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        files = new Files(this);
        worker.execute(new Runnable() {
            @Override
            public void run() {
                files.cleanup();
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                openExternal(request.getUrl());
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Alles außerhalb der App wird blockiert – Bilder und Videos verlassen das Handy nicht.
                if (!HOST.equals(url.getHost())) return empty(403, "Forbidden");
                return localResponse(url.getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                announceShared();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                String type = "*/*";
                String[] accept = params.getAcceptTypes();
                if (accept != null && accept.length > 0 && accept[0] != null && accept[0].length() > 0) {
                    type = accept[0].contains("audio") ? "audio/*" : accept[0].contains("image") ? "image/*" : accept[0];
                }
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType(type);
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(pick, type.startsWith("audio") ? "Musik wählen" : "Datei wählen"), REQ_FILES);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        handleIntent(getIntent());
        web.loadUrl(START);
    }

    private WebResourceResponse localResponse(String path) {
        if (path == null || path.contains("..")) return empty(404, "Not Found");
        String file = path.startsWith("/") ? path.substring(1) : path;
        try {
            InputStream in;
            if (file.startsWith("import/")) {
                in = new FileInputStream(files.importFile(file.substring(7)));
            } else if (file.startsWith("out/")) {
                // Fertiges Video/GIF zur Vorschau in der App
                in = new FileInputStream(files.file(Uri.decode(file.substring(4))));
            } else {
                in = getAssets().open(file);
            }
            String mime = mimeOf(file);
            boolean text = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json");
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            HashMap<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "https://" + HOST);
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return empty(404, "Not Found");
        }
    }

    private static WebResourceResponse empty(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<String, String>(),
                new ByteArrayInputStream(new byte[0]));
    }

    static String mimeOf(String file) {
        String f = file.toLowerCase();
        if (f.endsWith(".html")) return "text/html";
        if (f.endsWith(".js") || f.endsWith(".mjs")) return "application/javascript";
        if (f.endsWith(".css")) return "text/css";
        if (f.endsWith(".json")) return "application/json";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
        if (f.endsWith(".gif")) return "image/gif";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".woff2")) return "font/woff2";
        if (f.endsWith(".mp4")) return "video/mp4";
        if (f.endsWith(".webm")) return "video/webm";
        if (f.endsWith(".txt") || f.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        announceShared();
    }

    /** Bilder, die aus der Galerie per „Teilen“ an die App geschickt wurden. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                sharedImages.clear();
                sharedImages.add(uri);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null && !uris.isEmpty()) {
                sharedImages.clear();
                sharedImages.addAll(uris);
            }
        }
    }

    private void announceShared() {
        if (!pageReady || sharedImages.isEmpty()) return;
        js("window.NativeBus && NativeBus.shared(" + sharedImages.size() + ")");
    }

    /** Führt JavaScript im UI-Thread aus. */
    void js(final String code) {
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(code, null);
            }
        });
    }

    void callback(String id, JSONObject result) {
        js("window.NativeBus && NativeBus.callback(" + JSONObject.quote(id) + "," + result.toString() + ")");
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (pageReady) web.evaluateJavascript("window.NativeBus && NativeBus.pause()", null);
    }

    @Override
    protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        List<Uri> uris = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        if (requestCode == REQ_FILES && fileCallback != null) {
            fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
            fileCallback = null;
        } else if (requestCode == REQ_IMAGES && pickId != null) {
            String id = pickId;
            pickId = null;
            importImages(id, uris);
        }
    }

    /** Öffnet die Fotoauswahl von Android (ab Android 13 bzw. mit Play-Systemupdate) oder die Dateiauswahl. */
    private void pickImages(String id, boolean multiple) {
        if (pickId != null) importImages(pickId, new ArrayList<Uri>());
        pickId = id;
        Intent pick;
        if (photoPickerAvailable()) {
            pick = new Intent("android.provider.action.PICK_IMAGES");
            pick.setType("image/*");
            if (multiple) pick.putExtra("android.provider.extra.PICK_IMAGES_MAX", pickLimit());
        } else {
            pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            pick = Intent.createChooser(pick, "Bilder wählen");
        }
        try {
            startActivityForResult(pick, REQ_IMAGES);
        } catch (ActivityNotFoundException e) {
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("image/*");
            fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            try {
                startActivityForResult(Intent.createChooser(fallback, "Bilder wählen"), REQ_IMAGES);
            } catch (ActivityNotFoundException e2) {
                pickId = null;
                importImages(id, new ArrayList<Uri>());
            }
        }
    }

    private static boolean photoPickerAvailable() {
        if (Build.VERSION.SDK_INT >= 33) return true;
        if (Build.VERSION.SDK_INT < 30) return false;
        try {
            Class<?> ext = Class.forName("android.os.ext.SdkExtensions");
            int v = (Integer) ext.getMethod("getExtensionVersion", int.class).invoke(null, 30);
            return v >= 2;
        } catch (Exception e) {
            return false;
        }
    }

    private static int pickLimit() {
        try {
            int max = (Integer) MediaStore.class.getMethod("getPickImagesMaxLimit").invoke(null);
            return Math.max(2, Math.min(max, 200));
        } catch (Exception e) {
            return 50;
        }
    }

    /** Bilder im Hintergrund verkleinern, drehen (EXIF) und als JPEG bereitstellen. Meldet jedes Bild einzeln. */
    private void importImages(final String id, final List<Uri> uris) {
        final List<Uri> list = new ArrayList<>(uris);
        worker.execute(new Runnable() {
            @Override
            public void run() {
                event(id, "start", "{\"total\":" + list.size() + "}");
                for (int i = 0; i < list.size(); i++) {
                    JSONObject o;
                    try {
                        o = ImageImport.run(MainActivity.this, list.get(i), files.importDir(), id + "_" + i);
                    } catch (Throwable t) {
                        o = new JSONObject();
                        try {
                            o.put("error", String.valueOf(t.getMessage()));
                        } catch (Exception ignored) {
                        }
                    }
                    try {
                        o.put("index", i);
                        o.put("total", list.size());
                    } catch (Exception ignored) {
                    }
                    event(id, "item", o.toString());
                }
                event(id, "done", "{\"total\":" + list.size() + "}");
            }
        });
    }

    private void event(String id, String type, String json) {
        js("window.NativeBus && NativeBus.importEvent(" + JSONObject.quote(id) + "," + JSONObject.quote(type) + "," + json + ")");
    }

    /** Ab Android 10 braucht das Speichern in der Galerie keine Berechtigung, davor schon. */
    private void withStoragePermission(Runnable granted, Runnable denied) {
        if (Build.VERSION.SDK_INT >= 29
                || checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            granted.run();
            return;
        }
        afterPermission = granted;
        permissionDenied = denied;
        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERMISSION);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_PERMISSION) return;
        Runnable r = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED ? afterPermission : permissionDenied;
        afterPermission = null;
        permissionDenied = null;
        if (r != null) r.run();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.DS ? DS.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    private void openExternal(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (Exception e) {
            toast("Link kann nicht geöffnet werden");
        }
    }

    void toast(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static JSONObject result(boolean ok, String key, String value) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            if (key != null) o.put(key, value);
        } catch (Exception ignored) {
        }
        return o;
    }

    /** Wird von JavaScript als window.Android aufgerufen. */
    public class Bridge {

        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
                o.put("model", Build.MODEL);
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        @JavascriptInterface
        public void pickImages(final String id, final boolean multiple) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.pickImages(id, multiple);
                }
            });
        }

        /** Übernimmt die per „Teilen“ empfangenen Bilder (gleiche Ereignisse wie bei pickImages). */
        @JavascriptInterface
        public void takeShared(final String id) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    List<Uri> list = new ArrayList<>(sharedImages);
                    sharedImages.clear();
                    importImages(id, list);
                }
            });
        }

        @JavascriptInterface
        public void discardShared() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    sharedImages.clear();
                }
            });
        }

        @JavascriptInterface
        public void clearImports() {
            worker.execute(new Runnable() {
                @Override
                public void run() {
                    files.clearImports();
                }
            });
        }

        // --- Ausgabedateien (Video, GIF, Bild) stückweise schreiben ---

        @JavascriptInterface
        public String fileOpen(String name) {
            return files.open(name);
        }

        /** Schreibt Base64-Daten an die Position pos (pos < 0: anhängen). */
        @JavascriptInterface
        public boolean fileWrite(String id, String base64, double pos) {
            return files.write(id, base64, (long) pos);
        }

        @JavascriptInterface
        public double fileClose(String id) {
            return files.close(id);
        }

        @JavascriptInterface
        public void fileDelete(String id) {
            files.delete(id);
        }

        @JavascriptInterface
        public void saveToGallery(final String id, final String mime, final String displayName, final String cb) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    withStoragePermission(new Runnable() {
                        @Override
                        public void run() {
                            worker.execute(new Runnable() {
                                @Override
                                public void run() {
                                    try {
                                        String where = files.saveToGallery(id, mime, displayName);
                                        callback(cb, result(true, "where", where));
                                    } catch (Throwable t) {
                                        callback(cb, result(false, "error", String.valueOf(t.getMessage())));
                                    }
                                }
                            });
                        }
                    }, new Runnable() {
                        @Override
                        public void run() {
                            callback(cb, result(false, "error", "Keine Berechtigung zum Speichern"));
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void shareFile(final String id, final String mime, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Uri uri = files.contentUri(id);
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(mime);
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        if (text != null && text.length() > 0) send.putExtra(Intent.EXTRA_TEXT, text);
                        send.setClipData(ClipData.newRawUri("", uri));
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "Teilen"));
                    } catch (Exception e) {
                        toast("Teilen nicht möglich");
                    }
                }
            });
        }

        @JavascriptInterface
        public void viewFile(final String id, final String mime) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Uri uri = files.contentUri(id);
                        Intent view = new Intent(Intent.ACTION_VIEW);
                        view.setDataAndType(uri, mime);
                        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(view);
                    } catch (Exception e) {
                        toast("Keine App zum Öffnen gefunden");
                    }
                }
            });
        }

        /**
         * Fügt die Musik (rohes PCM, 16 Bit, verschränkt) als AAC-Spur an ein Video ohne Ton an.
         * Wird nur genutzt, wenn die WebView selbst kein AAC kodieren kann.
         */
        @JavascriptInterface
        public void muxAudio(final String videoId, final String pcmId, final int sampleRate, final int channels,
                             final String outId, final String cb) {
            worker.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        AudioMux.run(files.file(videoId), files.file(pcmId), sampleRate, channels, files.file(outId));
                        JSONObject r = result(true, null, null);
                        r.put("size", files.file(outId).length());
                        callback(cb, r);
                    } catch (Throwable t) {
                        callback(cb, result(false, "error", String.valueOf(t.getMessage())));
                    }
                }
            });
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void toast(String text) {
            MainActivity.this.toast(text);
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}

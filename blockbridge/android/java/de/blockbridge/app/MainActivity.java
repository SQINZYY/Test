package de.blockbridge.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.ViewGroup;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Hält die Oberfläche (assets/www) in einer WebView und stellt ihr Android-Funktionen bereit:
 * Dateien auswählen, empfangen ("Öffnen mit", "Teilen"), speichern, an Minecraft übergeben und teilen.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private static final String MINECRAFT = "com.mojang.minecraftpe";
    private static final int PICK_FILES = 1;
    private static final int SAVE_FILE = 2;
    private static final int MAX_IN = 300 * 1024 * 1024;

    private WebView web;
    private boolean pageReady;
    private ValueCallback<Uri[]> fileCallback;

    /** Datei, die die Oberfläche gerade (in Stücken) schickt */
    private static class OutFile {
        String id, name, action;
        File file;
        OutputStream stream;
    }

    private final HashMap<String, OutFile> outs = new HashMap<>();
    private int outCounter;
    private OutFile pendingSave;

    /** Dateien, die von anderen Apps kommen */
    private static class InFile {
        String name;
        byte[] data;
    }

    private final List<InFile> incoming = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        deleteRecursive(new File(getCacheDir(), FilesProvider.DIR));

        web = new WebView(this);
        web.setBackgroundColor(0xFF0E1411);
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
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception e) {
                    toast("Link kann nicht geöffnet werden");
                }
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
                notifyIncoming();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Datei wählen"), PICK_FILES);
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
        if (file.endsWith(".png")) return "image/png";
        if (file.endsWith(".svg")) return "image/svg+xml";
        if (file.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    // ---------- Dateien von anderen Apps ----------
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        notifyIncoming();
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            addIncoming(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (p instanceof Uri) addIncoming((Uri) p);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) for (Parcelable p : list) if (p instanceof Uri) addIncoming((Uri) p);
        }
    }

    private void addIncoming(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return;
            InFile f = new InFile();
            f.data = readAll(in, MAX_IN);
            f.name = displayName(uri);
            synchronized (incoming) {
                incoming.add(f);
            }
        } catch (Exception e) {
            toast("Datei konnte nicht gelesen werden");
        }
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
        }
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "Datei";
        int slash = name.lastIndexOf('/');
        return slash >= 0 ? name.substring(slash + 1) : name;
    }

    private void notifyIncoming() {
        synchronized (incoming) {
            if (!pageReady || incoming.isEmpty()) return;
        }
        web.evaluateJavascript("window.__bbIncoming && window.__bbIncoming()", null);
    }

    // ---------- Antworten an die Oberfläche ----------
    private void done(final String id, final JSONObject result) {
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__bbDone && window.__bbDone(" + JSONObject.quote(id) + "," + JSONObject.quote(result.toString()) + ")", null);
            }
        });
    }

    private static JSONObject res(boolean ok, String key, Object value) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            if (key != null) o.put(key, value);
        } catch (Exception ignored) {
        }
        return o;
    }

    private void finishOut(final OutFile out) {
        if ("save".equals(out.action)) {
            pendingSave = out;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(FilesProvider.mimeOf(out.name));
            i.putExtra(Intent.EXTRA_TITLE, out.name);
            try {
                startActivityForResult(i, SAVE_FILE);
            } catch (ActivityNotFoundException e) {
                pendingSave = null;
                done(out.id, res(false, "error", "Kein Speichern-Dialog verfügbar"));
            }
            return;
        }
        Uri uri = FilesProvider.uriFor(out.id, out.name);
        if ("open".equals(out.action)) {
            Intent v = new Intent(Intent.ACTION_VIEW);
            v.setDataAndType(uri, "application/octet-stream");
            v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setClipData(ClipData.newRawUri(out.name, uri));
            v.setPackage(MINECRAFT);
            try {
                startActivity(v);
                done(out.id, res(true, null, null));
                return;
            } catch (ActivityNotFoundException e) {
                // weiter unten: Auswahl anzeigen
            }
            v.setPackage(null);
            Intent chooser = Intent.createChooser(v, "Öffnen mit");
            chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new ComponentName[]{new ComponentName(this, MainActivity.class)});
            try {
                startActivity(chooser);
                done(out.id, res(true, "note", "Minecraft wurde nicht direkt gefunden – bitte in der Liste auswählen."));
            } catch (ActivityNotFoundException e2) {
                done(out.id, res(false, "error", "Minecraft (Bedrock Edition) ist auf diesem Gerät nicht installiert."));
            }
            return;
        }
        // Teilen
        Intent s = new Intent(Intent.ACTION_SEND);
        s.setType(FilesProvider.mimeOf(out.name));
        s.putExtra(Intent.EXTRA_STREAM, uri);
        s.setClipData(ClipData.newRawUri(out.name, uri));
        s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(s, "Teilen");
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new ComponentName[]{new ComponentName(this, MainActivity.class)});
        try {
            startActivity(chooser);
            done(out.id, res(true, null, null));
        } catch (ActivityNotFoundException e) {
            done(out.id, res(false, "error", "Keine App zum Teilen gefunden"));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILES) {
            if (fileCallback == null) return;
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
        } else if (requestCode == SAVE_FILE) {
            OutFile out = pendingSave;
            pendingSave = null;
            if (out == null) return;
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                done(out.id, res(false, "canceled", true));
                return;
            }
            Uri target = data.getData();
            try (InputStream in = new FileInputStream(out.file); OutputStream os = getContentResolver().openOutputStream(target)) {
                if (os == null) throw new IOException("Ziel nicht beschreibbar");
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                done(out.id, res(true, "path", displayName(target)));
            } catch (Exception e) {
                done(out.id, res(false, "error", String.valueOf(e.getMessage())));
            }
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.BB ? BB.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    // ---------- Schnittstelle für JavaScript ----------
    private class Bridge {
        @JavascriptInterface
        public String outBegin(String name, String action) {
            synchronized (outs) {
                OutFile o = new OutFile();
                o.id = "a" + (++outCounter);
                o.name = cleanName(name);
                o.action = action;
                File dir = new File(new File(getCacheDir(), FilesProvider.DIR), o.id);
                dir.mkdirs();
                o.file = new File(dir, o.name);
                try {
                    o.stream = new FileOutputStream(o.file);
                } catch (IOException e) {
                    o.stream = null;
                }
                outs.put(o.id, o);
                return o.id;
            }
        }

        @JavascriptInterface
        public void outChunk(String id, String b64) {
            OutFile o;
            synchronized (outs) {
                o = outs.get(id);
            }
            if (o == null || o.stream == null) return;
            try {
                o.stream.write(Base64.decode(b64, Base64.DEFAULT));
            } catch (IOException e) {
                try {
                    o.stream.close();
                } catch (IOException ignored) {
                }
                o.stream = null;
            }
        }

        @JavascriptInterface
        public void outFinish(String id) {
            final OutFile o;
            synchronized (outs) {
                o = outs.remove(id);
            }
            if (o == null) return;
            if (o.stream == null) {
                done(id, res(false, "error", "Datei konnte nicht geschrieben werden"));
                return;
            }
            try {
                o.stream.close();
            } catch (IOException e) {
                done(id, res(false, "error", "Datei konnte nicht geschrieben werden"));
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finishOut(o);
                }
            });
        }

        @JavascriptInterface
        public String inInfo() {
            JSONArray a = new JSONArray();
            synchronized (incoming) {
                for (InFile f : incoming) {
                    JSONObject o = new JSONObject();
                    try {
                        o.put("name", f.name);
                        o.put("size", f.data.length);
                    } catch (Exception ignored) {
                    }
                    a.put(o);
                }
            }
            return a.toString();
        }

        @JavascriptInterface
        public String inChunk(int index, int offset, int length) {
            synchronized (incoming) {
                if (index < 0 || index >= incoming.size()) return "";
                byte[] d = incoming.get(index).data;
                int end = Math.min(d.length, offset + length);
                if (offset >= end) return "";
                return Base64.encodeToString(d, offset, end - offset, Base64.NO_WRAP);
            }
        }

        @JavascriptInterface
        public void inClear() {
            synchronized (incoming) {
                incoming.clear();
            }
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }

    // ---------- Hilfen ----------
    private static String cleanName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "BlockBridge";
        return n.length() > 120 ? n.substring(0, 120) : n;
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new IOException("zu groß");
        }
        return out.toByteArray();
    }

    private static void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] list = f.listFiles();
            if (list != null) for (File c : list) deleteRecursive(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}

package de.setupbuilder.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Hält die Web-Oberfläche (assets/www) in einer WebView und stellt ihr
 * Teilen, Zwischenablage und Speicher von Android bereit.
 */
public class MainActivity extends Activity {

    private WebView web;
    private SharedPreferences prefs;
    private String pendingImport;
    private boolean pageReady;

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
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                openExternal(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverImport();
            }
        });
        setContentView(web);

        handleIntent(getIntent());
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        deliverImport();
    }

    /** Text, der per "Teilen" an die App geschickt wurde (z. B. ein Build-Code aus WhatsApp). */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() > 0) pendingImport = text;
        }
    }

    private void deliverImport() {
        if (!pageReady || pendingImport == null) return;
        String js = "window.SB && SB.receiveImport(" + JSONObject.quote(pendingImport) + ")";
        pendingImport = null;
        web.evaluateJavascript(js, null);
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
    }
}

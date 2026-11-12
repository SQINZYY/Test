package de.arbeitszeit.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Zeigt die Oberfläche aus assets/www in einer WebView und stellt ihr
 * Speicher (SharedPreferences), Teilen, Zwischenablage und das Hell/Dunkel-Design von Android bereit.
 */
public class MainActivity extends Activity {

    private static final String START = "file:///android_asset/www/index.html";
    private static final int BG_LIGHT = 0xFFF2F4F7;
    private static final int BG_DARK = 0xFF0E1014;
    private static final int NAV_LIGHT = 0xFFFFFFFF;
    private static final int NAV_DARK = 0xFF181B21;

    private WebView web;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("arbeitszeit", Context.MODE_PRIVATE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("file".equals(url.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    // kein Browser installiert
                }
                return true;
            }
        });
        applyBars(systemDark());
        setContentView(web);
        web.loadUrl(START);
    }

    private boolean systemDark() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Status- und Navigationsleiste an das Design der Oberfläche anpassen */
    private void applyBars(boolean dark) {
        Window w = getWindow();
        w.setStatusBarColor(dark ? BG_DARK : BG_LIGHT);
        w.setNavigationBarColor(dark ? NAV_DARK : NAV_LIGHT);
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) {
            if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            else flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
        w.getDecorView().setBackgroundColor(dark ? BG_DARK : BG_LIGHT);
        if (web != null) web.setBackgroundColor(dark ? BG_DARK : BG_LIGHT);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (web != null) web.evaluateJavascript("window.AZ && AZ.systemTheme(" + systemDark() + ")", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Uhrzeit-Anzeige und Datum aktualisieren, wenn die App wieder geöffnet wird
        if (web != null) web.evaluateJavascript("window.AZ && AZ.refresh()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.AZ ? AZ.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    /** Wird von JavaScript als "Android" aufgerufen */
    private class Bridge {
        @JavascriptInterface
        public String load(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public boolean isDark() {
            return systemDark();
        }

        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applyBars(dark);
                }
            });
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
                    try {
                        startActivity(Intent.createChooser(send, title));
                    } catch (ActivityNotFoundException ignored) {
                        // keine App zum Teilen vorhanden
                    }
                }
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Arbeitszeit", text));
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

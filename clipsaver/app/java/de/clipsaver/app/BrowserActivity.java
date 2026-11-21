package de.clipsaver.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;

/**
 * Eingebauter Browser mit Medien-Erkennung. Er zeichnet alle Videos, Bilder, HLS-Streams und eingebetteten
 * YouTube-Videos auf, die eine Seite lädt (auch in iframes von Werbeanzeigen), und gibt sie an die App zurück.
 * Im Modus "login" dient er nur zum Anmelden bei TikTok/YouTube; danach werden die Cookies übernommen.
 *
 * Die Seite bekommt bewusst keine JavaScript-Schnittstelle zur App: Die Erkennung läuft über die Netzwerk-
 * anfragen und über evaluateJavascript, dessen Ergebnis nur gelesen wird.
 */
public class BrowserActivity extends Activity {

    static final String EXTRA_URL = "url";
    static final String EXTRA_MODE = "mode";
    static final String EXTRA_DOMAIN = "domain";
    static final String RESULT = "result";

    private static final int BG = 0xFF0B0B12;
    private static final int SURFACE = 0xFF171722;
    private static final int TEXT = 0xFFF2F2F7;
    private static final int MUTED = 0xFF9A9AAD;
    private static final int ACCENT = 0xFFFF3D6E;
    private static final int MAX_ITEMS = 300;

    // Liest Medien aus der Seite: <video>, <img> (ab 120 px), iframes, og:-Angaben und TikTok-Seitendaten
    private static final String SCAN_JS = "(function(){var out=[],seen={};"
            + "function add(k,u,w,h,p){if(!u||typeof u!=='string')return;try{u=new URL(u,location.href).href}catch(x){return}"
            + "if(u.indexOf('http')!==0||seen[k+u])return;seen[k+u]=1;"
            + "out.push({k:k,u:u,w:w||0,h:h||0,p:p||''})}"
            + "document.querySelectorAll('video').forEach(function(v){var u=v.currentSrc||v.src;"
            + "if(u&&u.indexOf('blob:')!==0)add('video',u,v.videoWidth,v.videoHeight,v.poster);"
            + "v.querySelectorAll('source').forEach(function(s){if(s.src)add((s.type||'').toLowerCase().indexOf('mpegurl')>=0?'hls':'video',s.src,0,0,v.poster)});"
            + "if(v.poster)add('image',v.poster)});"
            + "document.querySelectorAll('img').forEach(function(i){if(i.naturalWidth>=120&&i.naturalHeight>=120)add('image',i.currentSrc||i.src,i.naturalWidth,i.naturalHeight)});"
            + "document.querySelectorAll('iframe').forEach(function(f){if(f.src)add('frame',f.src)});"
            + "['og:image','og:video','og:video:url','og:video:secure_url','twitter:image'].forEach(function(n){"
            + "var m=document.querySelector('meta[property=\"'+n+'\"],meta[name=\"'+n+'\"]');if(m&&m.content)add(n.indexOf('video')>=0?'video':'image',m.content)});"
            + "try{var e=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');if(e){"
            + "var it=JSON.parse(e.textContent).__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct;"
            + "if(it.imagePost)it.imagePost.images.forEach(function(im){add('image',im.imageURL.urlList[0],im.imageWidth,im.imageHeight)});"
            + "else if(it.video&&it.video.playAddr)add('video',it.video.playAddr,it.video.width,it.video.height,it.video.cover)}}catch(x){}"
            + "return JSON.stringify(out.slice(0," + MAX_ITEMS + "))})()";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final LinkedHashMap<String, JSONObject> media = new LinkedHashMap<>();
    private WebView web;
    private EditText address;
    private Button action;
    private ProgressBar loading;
    private boolean login;
    private String domain;
    private String userAgent;

    private final Runnable scanLoop = new Runnable() {
        @Override
        public void run() {
            scanDom();
            handler.postDelayed(this, 1500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        login = "login".equals(getIntent().getStringExtra(EXTRA_MODE));
        domain = getIntent().getStringExtra(EXTRA_DOMAIN);
        String url = getIntent().getStringExtra(EXTRA_URL);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(BG);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(6), dp(6), dp(6), dp(6));
        Button close = flatButton("✕");
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        top.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(14);
        address.setTextColor(TEXT);
        address.setHintTextColor(MUTED);
        address.setHint("Adresse");
        address.setSelectAllOnFocus(true);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setPadding(dp(12), dp(8), dp(12), dp(8));
        address.setBackground(rounded(SURFACE, dp(12)));
        address.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                go(address.getText().toString());
                return true;
            }
        });
        top.addView(address, new LinearLayout.LayoutParams(0, dp(42), 1f));
        Button reload = flatButton("↻");
        reload.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                web.reload();
            }
        });
        top.addView(reload, new LinearLayout.LayoutParams(dp(44), dp(44)));
        box.addView(top);

        loading = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loading.setMax(100);
        loading.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        box.addView(loading, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        TextView hint = new TextView(this);
        hint.setTextColor(MUTED);
        hint.setTextSize(13);
        hint.setPadding(dp(14), dp(6), dp(14), dp(6));
        hint.setText(login
                ? "Melde dich ganz normal an und tippe danach unten auf „Fertig“. Passwörter sieht ClipSaver nicht – übernommen werden nur die Anmelde-Cookies."
                : "Öffne die Anzeige bzw. das Video und spiele es kurz ab – alle Videos und Bilder der Seite werden unten gesammelt.");
        box.addView(hint);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // Ohne "; wv" sehen Seiten einen normalen Chrome und liefern die volle Seite statt "In App öffnen"
        userAgent = s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+\\.\\d+ ", "");
        s.setUserAgentString(userAgent);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                // Links in fremde Apps (tiktok://, intent://, market://) bleiben hier
                return !("http".equals(scheme) || "https".equals(scheme));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!address.hasFocus()) address.setText(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!address.hasFocus()) address.setText(url);
                scanDom();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (login) return null;
                String accept = request.getRequestHeaders() == null ? null : request.getRequestHeaders().get("Accept");
                final String[] found = MediaSniffer.classify(request.getUrl().toString(), accept);
                if (found != null) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            add(found[0], found[1], found[2], 0, 0, null);
                        }
                    });
                }
                return null;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                loading.setProgress(progress);
                loading.setVisibility(progress >= 100 ? View.INVISIBLE : View.VISIBLE);
            }
        });
        box.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setPadding(dp(12), dp(8), dp(12), dp(10));
        action = new Button(this);
        action.setAllCaps(false);
        action.setTextSize(15);
        action.setTypeface(Typeface.DEFAULT_BOLD);
        action.setTextColor(0xFFFFFFFF);
        action.setBackground(rounded(ACCENT, dp(14)));
        action.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (login) finishLogin();
                else finishWithMedia();
            }
        });
        bottom.addView(action, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50)));
        box.addView(bottom);
        setContentView(box);

        updateAction();
        if (url != null) go(url);
    }

    private void go(String url) {
        String u = url.trim();
        if (u.length() == 0) return;
        if (!u.matches("(?i)^https?://.*")) {
            u = u.contains(".") && !u.contains(" ") ? "https://" + u
                    : "https://www.google.com/search?q=" + android.net.Uri.encode(u);
        }
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(address.getWindowToken(), 0);
        address.clearFocus();
        web.loadUrl(u);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (!login) handler.postDelayed(scanLoop, 1500);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(scanLoop);
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void scanDom() {
        if (login || web == null) return;
        web.evaluateJavascript(SCAN_JS, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || value.equals("null")) return;
                try {
                    // value ist ein JavaScript-String-Literal mit dem JSON darin
                    JSONArray list = new JSONArray(new JSONArray("[" + value + "]").getString(0));
                    for (int i = 0; i < list.length(); i++) {
                        JSONObject o = list.getJSONObject(i);
                        String kind = o.optString("k"), url = o.optString("u");
                        if (kind.equals("frame")) {
                            String id = MediaSniffer.youTubeId(url);
                            if (id != null) add(MediaSniffer.YOUTUBE, "https://www.youtube.com/watch?v=" + id, "yt:" + id, 0, 0, null);
                            continue;
                        }
                        String[] c = MediaSniffer.classify(url, kind.equals("image") ? "image/*" : kind.equals("video") ? "video/*" : null);
                        // Aus der Seite gelesene <video>/<img> sind sicher Medien, auch ohne Dateiendung
                        if (c == null && !MediaSniffer.isNoise(url.toLowerCase(java.util.Locale.ROOT))) {
                            String k = kind.equals("hls") ? MediaSniffer.HLS : kind;
                            c = new String[]{k, url, MediaSniffer.key(k, url)};
                        }
                        if (c != null) add(c[0], c[1], c[2], o.optInt("w"), o.optInt("h"), o.optString("p", null));
                    }
                } catch (Exception ignored) {
                    // Seite hat etwas Unerwartetes geliefert
                }
            }
        });
    }

    private void add(String kind, String url, String key, int w, int h, String poster) {
        if (media.size() >= MAX_ITEMS && !media.containsKey(key)) return;
        try {
            JSONObject o = media.get(key);
            if (o == null) {
                o = new JSONObject();
                o.put("kind", kind);
                o.put("url", url);
                media.put(key, o);
            }
            if (w * h > o.optInt("width") * o.optInt("height")) {
                o.put("width", w);
                o.put("height", h);
            }
            if (poster != null && poster.startsWith("http")) o.put("poster", poster);
        } catch (Exception ignored) {
            // ungültige Zahl
        }
        updateAction();
    }

    private void updateAction() {
        if (login) {
            action.setText("Fertig – Anmeldung übernehmen");
            return;
        }
        int videos = 0, images = 0;
        for (JSONObject o : media.values()) {
            if (o.optString("kind").equals(MediaSniffer.IMAGE)) images++;
            else videos++;
        }
        if (videos + images == 0) {
            action.setText("Noch keine Medien gefunden");
            action.setAlpha(0.55f);
        } else {
            StringBuilder s = new StringBuilder();
            if (videos > 0) s.append(videos).append(videos == 1 ? " Video" : " Videos");
            if (images > 0) s.append(s.length() > 0 ? " · " : "").append(images).append(images == 1 ? " Bild" : " Bilder");
            action.setText(s.append(" gefunden – anzeigen").toString());
            action.setAlpha(1f);
        }
    }

    private void finishWithMedia() {
        if (media.isEmpty()) return;
        try {
            String page = web.getUrl() == null ? "" : web.getUrl();
            JSONObject res = new JSONObject();
            res.put("pageUrl", page);
            res.put("title", web.getTitle() == null ? "" : web.getTitle());
            res.put("userAgent", userAgent);
            // Cookies je Host statt je Eintrag, damit das Ergebnis klein bleibt (Intent-Grenze ~1 MB)
            JSONObject cookies = new JSONObject();
            JSONArray items = new JSONArray();
            CookieManager cm = CookieManager.getInstance();
            for (JSONObject o : media.values()) {
                String url = o.getString("url");
                String host = android.net.Uri.parse(url).getHost();
                if (host != null && !cookies.has(host)) {
                    String cookie = cm.getCookie(url);
                    if (cookie != null && cookie.length() > 0) cookies.put(host, cookie);
                }
                items.put(o);
            }
            res.put("cookies", cookies);
            res.put("items", items);
            setResult(RESULT_OK, new Intent().putExtra(RESULT, res.toString()));
        } catch (Exception ignored) {
            setResult(RESULT_CANCELED);
        }
        finish();
    }

    private void finishLogin() {
        CookieManager cm = CookieManager.getInstance();
        cm.flush();
        try {
            JSONObject res = new JSONObject();
            res.put("login", true);
            res.put("domain", domain);
            String cookies = cm.getCookie("https://www." + domain + "/");
            res.put("cookies", cookies == null ? "" : cookies);
            setResult(RESULT_OK, new Intent().putExtra(RESULT, res.toString()));
        } catch (Exception e) {
            setResult(RESULT_CANCELED);
        }
        finish();
    }

    private Button flatButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18);
        b.setTextColor(TEXT);
        b.setBackgroundColor(0);
        b.setPadding(0, 0, 0, 0);
        return b;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}

package de.weckton.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Hält die Oberfläche (assets/www) in einer WebView und gibt ihr Zugriff auf die Wecker der Uhr-App,
 * die Dateiauswahl, das Probehören und die Android-Einstellungen.
 */
public class MainActivity extends Activity {

    private static final String START = "file:///android_asset/www/index.html";
    private static final int PICK_SOUND = 1;
    private static final int BG = 0xFF0F0B07;

    private WebView web;
    private SharedPreferences prefs;
    private ClockAlarms clock;
    private MediaPlayer player;
    private boolean pageReady;
    private Uri pendingShare;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("weckton", Context.MODE_PRIVATE);
        clock = new ClockAlarms(this, prefs);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingShare != null) {
                    Uri u = pendingShare;
                    pendingShare = null;
                    importSound(u);
                }
            }
        });
        setContentView(web);
        handleIntent(getIntent());
        web.loadUrl(START);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u == null) return;
        if (pageReady) importSound(u);
        else pendingShare = u;
    }

    @Override
    protected void onResume() {
        super.onResume();
        // z. B. nach dem Erteilen einer Berechtigung oder dem Wechsel aus der Uhr-App neu einlesen
        if (pageReady) call("W.onResume()");
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopPreview();
    }

    @Override
    protected void onDestroy() {
        stopPreview();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.W ? W.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_SOUND) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            call("W.onSoundCancel()");
            return;
        }
        importSound(data.getData());
    }

    private void pickSound() {
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("audio/*");
        try {
            startActivityForResult(pick, PICK_SOUND);
        } catch (ActivityNotFoundException e) {
            Intent get = new Intent(Intent.ACTION_GET_CONTENT);
            get.addCategory(Intent.CATEGORY_OPENABLE);
            get.setType("audio/*");
            try {
                startActivityForResult(Intent.createChooser(get, "MP3 auswählen"), PICK_SOUND);
            } catch (ActivityNotFoundException e2) {
                call("W.onError(" + JSONObject.quote("Auf dem Handy ist keine Dateiauswahl vorhanden.") + ")");
            }
        }
    }

    /** Kopiert die Datei im Hintergrund in den Weckton-Ordner und meldet das Ergebnis an die Oberfläche. */
    private void importSound(final Uri source) {
        call("W.onSoundLoading()");
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Uri u = Sounds.importAlarm(MainActivity.this, source);
                    String title = Sounds.title(MainActivity.this, u.toString());
                    JSONObject o = new JSONObject();
                    o.put("uri", u.toString());
                    o.put("title", title.isEmpty() ? "Eigener Ton" : title);
                    prefs.edit().putString("sound", o.toString()).apply();
                    call("W.onSound(" + o + ")");
                } catch (Exception e) {
                    call("W.onError(" + JSONObject.quote("Die Datei konnte nicht übernommen werden: " + e.getMessage()) + ")");
                }
            }
        }).start();
    }

    private void preview(String uri) {
        stopPreview();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setDataSource(this, Uri.parse(uri));
            player.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    stopPreview();
                }
            });
            player.prepare();
            player.start();
        } catch (Exception e) {
            stopPreview();
            call("W.onError(" + JSONObject.quote("Die Datei lässt sich nicht abspielen.") + ")");
        }
    }

    private void stopPreview() {
        if (player == null) return;
        try {
            player.release();
        } catch (RuntimeException ignored) {
            // schon freigegeben
        }
        player = null;
        call("W.onPreviewEnd()");
    }

    /** Zustand für die Oberfläche: Wecker der Uhr-App, gewählter Ton, Berechtigungen. */
    private String state() {
        JSONObject o = new JSONObject();
        try {
            if (!ClockAlarms.isInstalled(this)) {
                o.put("status", "no_samsung");
            } else {
                try {
                    o.put("alarms", clock.list());
                    o.put("status", "ok");
                } catch (Exception e) {
                    o.put("status", e.getMessage());
                }
                o.put("clockAudio", ClockAlarms.audioPermission(this));
            }
            o.put("backup", clock.backupCount());
            o.put("canWriteSettings", Settings.System.canWrite(this));
            o.put("defaultAlarm", Sounds.defaultAlarmTitle(this));
            String sound = prefs.getString("sound", null);
            if (sound != null) o.put("sound", new JSONObject(sound));
        } catch (JSONException e) {
            // kann bei einfachen Werten nicht passieren
        }
        return o.toString();
    }

    private void runInBackground(final String callback, final Job job) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String result;
                try {
                    result = job.run().toString();
                } catch (Exception e) {
                    JSONObject err = new JSONObject();
                    try {
                        err.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                    } catch (JSONException ignored) {
                        // kann nicht passieren
                    }
                    result = err.toString();
                }
                call(callback + "(" + result + ")");
            }
        }).start();
    }

    private interface Job {
        Object run() throws Exception;
    }

    /** Öffnet die Uhr-App frisch, damit sie den nächsten Wecker mit dem neuen Ton neu plant. */
    private void openClock() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        try {
            if (am != null) am.killBackgroundProcesses(ClockAlarms.PKG);
        } catch (RuntimeException ignored) {
            // nicht schlimm, dann wird die Uhr-App nur in den Vordergrund geholt
        }
        Intent show = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
        show.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(show);
            return;
        } catch (RuntimeException e) {
            // keine Uhr-App für SHOW_ALARMS oder fehlende Berechtigung → normal starten
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(ClockAlarms.PKG);
        try {
            if (launch == null) throw new ActivityNotFoundException();
            startActivity(launch);
        } catch (RuntimeException e) {
            call("W.onError(" + JSONObject.quote("Die Uhr-App ließ sich nicht öffnen.") + ")");
        }
    }

    private void openSettings(String action, String pkg) {
        Intent i = new Intent(action, Uri.parse("package:" + pkg));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            call("W.onError(" + JSONObject.quote("Die Einstellungen lassen sich nicht öffnen.") + ")");
        }
    }

    private void call(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.W && " + js, null);
            }
        });
    }

    private void ui(Runnable r) {
        runOnUiThread(r);
    }

    private class Bridge {
        @JavascriptInterface
        public String load() {
            return state();
        }

        @JavascriptInterface
        public void pickSound() {
            ui(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.pickSound();
                }
            });
        }

        @JavascriptInterface
        public void preview(final String uri) {
            ui(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.preview(uri);
                }
            });
        }

        @JavascriptInterface
        public void stopPreview() {
            ui(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.stopPreview();
                }
            });
        }

        @JavascriptInterface
        public void apply(final String idsJson, final String uri) {
            runInBackground("W.onApplied", new Job() {
                @Override
                public Object run() throws Exception {
                    return clock.apply(new JSONArray(idsJson), Uri.parse(uri));
                }
            });
        }

        @JavascriptInterface
        public void restore() {
            runInBackground("W.onRestored", new Job() {
                @Override
                public Object run() throws Exception {
                    return clock.restore();
                }
            });
        }

        /** "ok", oder "permission", wenn Android erst nach der Erlaubnis fragen muss. */
        @JavascriptInterface
        public String setDefault(String uri) {
            if (!Settings.System.canWrite(MainActivity.this)) {
                openSettings(Settings.ACTION_MANAGE_WRITE_SETTINGS, getPackageName());
                return "permission";
            }
            try {
                Sounds.setDefaultAlarm(MainActivity.this, Uri.parse(uri));
                return "ok";
            } catch (RuntimeException e) {
                return "error";
            }
        }

        @JavascriptInterface
        public void openClock() {
            ui(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.openClock();
                }
            });
        }

        @JavascriptInterface
        public void openClockSettings() {
            openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, ClockAlarms.PKG);
        }
    }
}

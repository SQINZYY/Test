package de.darkos.launcher;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Android-Widgets anderer Apps (Wetter, Musik, Kalender …) auf der Widget-Seite. */
final class WidgetHost {
    interface Callback {
        void onWidgetAdded(int appWidgetId);
    }

    static final int REQ_BIND = 41, REQ_CONFIGURE = 42;
    private static final int HOST_ID = 0xDA05;

    private final Activity activity;
    private final AppWidgetManager manager;
    private final AppWidgetHost host;
    private final Callback callback;
    private int pendingId = -1;

    WidgetHost(Activity a, Callback cb) {
        activity = a;
        callback = cb;
        manager = AppWidgetManager.getInstance(a);
        host = new AppWidgetHost(a.getApplicationContext(), HOST_ID);
    }

    void start() {
        try {
            host.startListening();
        } catch (RuntimeException ignored) {
            // Kann bei sehr vielen Widgets oder während eines System-Updates scheitern
        }
    }

    void stop() {
        try {
            host.stopListening();
        } catch (RuntimeException ignored) {
            // egal
        }
    }

    AppWidgetProviderInfo info(int id) {
        return manager.getAppWidgetInfo(id);
    }

    AppWidgetHostView createView(Context c, int id) {
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(id);
        if (info == null) return null;
        AppWidgetHostView v = host.createView(c, id, info);
        v.setPadding(0, 0, 0, 0);
        return v;
    }

    /** Teilt dem Widget mit, wie groß es angezeigt wird (in dp). */
    @SuppressWarnings("deprecation")
    static void setSize(AppWidgetHostView v, int widthDp, int heightDp) {
        try {
            v.updateAppWidgetSize(new Bundle(), widthDp, heightDp, widthDp, heightDp);
        } catch (RuntimeException ignored) {
            // Ältere Widgets ignorieren die Größe
        }
    }

    /** Empfohlene Höhe in dp. */
    static int defaultHeightDp(AppWidgetProviderInfo info, float density) {
        int dp = Math.round(info.minHeight / density);
        if (Build.VERSION.SDK_INT >= 31 && info.targetCellHeight > 0) dp = Math.max(dp, info.targetCellHeight * 76);
        return Math.max(90, Math.min(420, dp));
    }

    List<AppWidgetProviderInfo> providers() {
        List<AppWidgetProviderInfo> list = new ArrayList<>();
        try {
            list.addAll(manager.getInstalledProvidersForProfile(Process.myUserHandle()));
        } catch (RuntimeException ignored) {
            // leer lassen
        }
        final Collator col = Collator.getInstance(Locale.getDefault());
        final android.content.pm.PackageManager pm = activity.getPackageManager();
        Collections.sort(list, new Comparator<AppWidgetProviderInfo>() {
            @Override
            public int compare(AppWidgetProviderInfo a, AppWidgetProviderInfo b) {
                int r = col.compare(appLabel(pm, a), appLabel(pm, b));
                return r != 0 ? r : col.compare(a.loadLabel(pm), b.loadLabel(pm));
            }
        });
        return list;
    }

    static String appLabel(android.content.pm.PackageManager pm, AppWidgetProviderInfo info) {
        try {
            return pm.getApplicationLabel(pm.getApplicationInfo(info.provider.getPackageName(), 0)).toString();
        } catch (Exception e) {
            return info.provider.getPackageName();
        }
    }

    /** Fragt bei Bedarf die Erlaubnis an und startet ggf. die Einrichtung des Widgets. */
    void add(AppWidgetProviderInfo info) {
        pendingId = host.allocateAppWidgetId();
        boolean bound;
        try {
            bound = manager.bindAppWidgetIdIfAllowed(pendingId, info.getProfile(), info.provider, null);
        } catch (RuntimeException e) {
            bound = false;
        }
        if (bound) {
            configure(pendingId);
            return;
        }
        Intent i = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendingId)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, info.provider)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER_PROFILE, info.getProfile());
        try {
            activity.startActivityForResult(i, REQ_BIND);
        } catch (ActivityNotFoundException e) {
            host.deleteAppWidgetId(pendingId);
            pendingId = -1;
        }
    }

    private void configure(int id) {
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(id);
        boolean optional = Build.VERSION.SDK_INT >= 31 && info != null
            && (info.widgetFeatures & AppWidgetProviderInfo.WIDGET_FEATURE_CONFIGURATION_OPTIONAL) != 0;
        if (info != null && info.configure != null && !optional) {
            try {
                host.startAppWidgetConfigureActivityForResult(activity, id, 0, REQ_CONFIGURE, null);
                return;
            } catch (RuntimeException e) {
                // Einrichtung nicht startbar – Widget trotzdem hinzufügen
            }
        }
        finish(id);
    }

    private void finish(int id) {
        pendingId = -1;
        callback.onWidgetAdded(id);
    }

    /** Ergebnis aus onActivityResult; true, wenn es zu uns gehörte. */
    boolean onResult(int request, int result, Intent data) {
        if (request != REQ_BIND && request != REQ_CONFIGURE) return false;
        int id = data != null ? data.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendingId) : pendingId;
        if (id < 0) return true;
        if (result != Activity.RESULT_OK) {
            host.deleteAppWidgetId(id);
            pendingId = -1;
            return true;
        }
        if (request == REQ_BIND) configure(id);
        else finish(id);
        return true;
    }

    void delete(int id) {
        try {
            host.deleteAppWidgetId(id);
        } catch (RuntimeException ignored) {
            // schon weg
        }
    }

    int pendingId() {
        return pendingId;
    }

    void restorePending(int id) {
        pendingId = id;
    }
}

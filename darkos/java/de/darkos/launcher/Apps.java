package de.darkos.launcher;

import android.app.SearchManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import android.provider.Settings;

import java.text.Collator;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Liste aller startbaren Apps plus Rollen (Telefon, Kamera …) für Standard-Symbole. */
final class Apps {
    /** Eine startbare App (bzw. die DarkOS-Einstellungen als eigener Eintrag). */
    static final class App {
        final ComponentName component;
        final String key;
        final String pkg;
        final String originalLabel;
        final boolean system;
        final boolean internal;
        final ActivityInfo activity;
        String label;
        String normalized;
        char section;

        App(ComponentName cn, String label, boolean system, boolean internal, ActivityInfo activity) {
            this.component = cn;
            this.key = cn.flattenToShortString();
            this.pkg = cn.getPackageName();
            this.originalLabel = label;
            this.system = system;
            this.internal = internal;
            this.activity = activity;
            setLabel(label);
        }

        void setLabel(String l) {
            label = l;
            normalized = normalize(l);
            char c = normalized.isEmpty() ? '#' : Character.toUpperCase(normalized.charAt(0));
            section = c >= 'A' && c <= 'Z' ? c : '#';
        }
    }

    static final String SETTINGS_KEY = "de.darkos.launcher/.SettingsActivity";

    final List<App> all;
    final Map<String, App> byKey = new HashMap<>();
    /** Paketname -> Symbol aus erkannten System-Rollen (Telefon, SMS, Kamera …). */
    final Map<String, String> roleGlyphs;
    /** Rolle -> Paketname der Standard-App. */
    final Map<String, String> rolePackages;

    private Apps(List<App> all, Map<String, String> roleGlyphs, Map<String, String> rolePackages) {
        this.all = all;
        this.roleGlyphs = roleGlyphs;
        this.rolePackages = rolePackages;
        for (App a : all) byKey.put(a.key, a);
    }

    static Apps empty() {
        return new Apps(new ArrayList<App>(), new HashMap<String, String>(), new HashMap<String, String>());
    }

    App find(String key) {
        return key == null ? null : byKey.get(key);
    }

    /** Erste startbare Activity eines Pakets. */
    App forPackage(String pkg) {
        if (pkg == null) return null;
        for (App a : all) if (a.pkg.equals(pkg) && !a.internal) return a;
        return null;
    }

    List<App> visible(Set<String> hidden) {
        List<App> out = new ArrayList<>();
        for (App a : all) if (!hidden.contains(a.key)) out.add(a);
        return out;
    }

    static String normalize(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s.replace("ß", "ss"), Normalizer.Form.NFD);
        return n.replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT).trim();
    }

    /** Lädt alle Apps – dauert je nach Gerät einige hundert Millisekunden, daher im Hintergrund aufrufen. */
    static Apps load(Context c) {
        PackageManager pm = c.getPackageManager();
        Prefs prefs = Prefs.get(c);
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> infos = pm.queryIntentActivities(main, 0);
        List<App> apps = new ArrayList<>();
        Set<String> seen = new java.util.HashSet<>();
        for (ResolveInfo ri : infos) {
            ActivityInfo ai = ri.activityInfo;
            if (ai == null || ai.packageName.equals(c.getPackageName())) continue;
            ComponentName cn = new ComponentName(ai.packageName, ai.name);
            if (!seen.add(cn.flattenToShortString())) continue;
            CharSequence l = ri.loadLabel(pm);
            String label = l == null ? ai.packageName : l.toString().trim();
            boolean system = (ai.applicationInfo.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
            App a = new App(cn, label, system, false, ai);
            String renamed = prefs.labelOverride(a.key);
            if (renamed != null) a.setLabel(renamed);
            apps.add(a);
        }
        App settings = new App(ComponentName.unflattenFromString(SETTINGS_KEY), "DarkOS", false, true, null);
        String renamed = prefs.labelOverride(settings.key);
        if (renamed != null) settings.setLabel(renamed);
        apps.add(settings);

        final Collator collator = Collator.getInstance(Locale.getDefault());
        collator.setStrength(Collator.PRIMARY);
        Collections.sort(apps, new Comparator<App>() {
            @Override
            public int compare(App a, App b) {
                int r = collator.compare(a.label, b.label);
                return r != 0 ? r : a.key.compareTo(b.key);
            }
        });

        Map<String, String> roleGlyphs = new HashMap<>();
        Map<String, String> rolePackages = new HashMap<>();
        role(pm, new Intent(Intent.ACTION_DIAL), "phone", "phone", roleGlyphs, rolePackages);
        role(pm, new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")), "sms", "messages", roleGlyphs, rolePackages);
        role(pm, new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE),
            "browser", "globe", roleGlyphs, rolePackages);
        role(pm, new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), "camera", "camera", roleGlyphs, rolePackages);
        role(pm, new Intent(MediaStore.ACTION_IMAGE_CAPTURE), "camera2", "camera", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_GALLERY), "gallery", "images", roleGlyphs, rolePackages);
        role(pm, new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")), "mail", "mail", roleGlyphs, rolePackages);
        role(pm, new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=Berlin")), "maps", "map", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CONTACTS), "contacts", "contact", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR), "calendar", "calendar", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALCULATOR), "calculator", "calculator", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MUSIC), "music", "music", roleGlyphs, rolePackages);
        role(pm, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MARKET), "market", "bag", roleGlyphs, rolePackages);
        role(pm, new Intent(AlarmClock.ACTION_SHOW_ALARMS), "clock", "alarm", roleGlyphs, rolePackages);
        role(pm, new Intent(Settings.ACTION_SETTINGS), "settings", "settings", roleGlyphs, rolePackages);
        role(pm, new Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, "x"), "search", "search", roleGlyphs, rolePackages);
        return new Apps(apps, roleGlyphs, rolePackages);
    }

    /** Merkt sich die Standard-App für eine Rolle; System-Apps, die die Rolle erfüllen, bekommen das passende Symbol. */
    private static void role(PackageManager pm, Intent intent, String role, String glyph,
                             Map<String, String> glyphs, Map<String, String> packages) {
        try {
            ResolveInfo def = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            String defPkg = def != null && def.activityInfo != null && !"android".equals(def.activityInfo.packageName)
                ? def.activityInfo.packageName : null;
            List<ResolveInfo> all = pm.queryIntentActivities(intent, 0);
            for (ResolveInfo ri : all) {
                if (ri.activityInfo == null) continue;
                boolean system = (ri.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                if (system && !glyphs.containsKey(ri.activityInfo.packageName)) glyphs.put(ri.activityInfo.packageName, glyph);
                if (defPkg == null && system) defPkg = ri.activityInfo.packageName;
            }
            if (defPkg == null && all.size() == 1) defPkg = all.get(0).activityInfo.packageName;
            if (defPkg != null) {
                packages.put(role, defPkg);
                if (!glyphs.containsKey(defPkg)) glyphs.put(defPkg, glyph);
            }
        } catch (RuntimeException ignored) {
            // Einzelne Hersteller-ROMs werfen hier gelegentlich – dann eben ohne diese Rolle
        }
    }
}

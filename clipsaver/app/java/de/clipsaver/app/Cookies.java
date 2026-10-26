package de.clipsaver.app;

import java.util.ArrayList;
import java.util.List;

/**
 * Cookies im Netscape-Format (cookies.txt), wie yt-dlp sie mit --cookies liest. Kommen entweder aus der
 * Anmeldung im eingebauten Browser oder aus einer importierten cookies.txt. Damit klappen private oder
 * altersbeschränkte Inhalte und die "Bist du ein Bot?"-Abfrage von YouTube. (Ohne Android-Klassen.)
 */
final class Cookies {

    private static final long FAR_FUTURE = 2051222400L; // 2035-01-01

    /** {domain, includeSubdomains, path, secure, expiry, name, value} */
    final List<String[]> rows = new ArrayList<>();

    static Cookies parse(String text) {
        Cookies c = new Cookies();
        if (text == null) return c;
        for (String line : text.split("\r?\n")) {
            String l = line;
            // "#HttpOnly_" ist bei manchen Exporten ein Präfix der Domain, keine Kommentarzeile
            if (l.startsWith("#HttpOnly_")) l = l.substring(10);
            else if (l.startsWith("#") || l.trim().length() == 0) continue;
            String[] f = l.split("\t");
            if (f.length >= 7) c.rows.add(new String[]{f[0], f[1], f[2], f[3], f[4], f[5], f[6]});
        }
        return c;
    }

    boolean isEmpty() {
        return rows.isEmpty();
    }

    /** Ersetzt alle Cookies einer Domain (z. B. "youtube.com") durch "a=1; b=2" aus der WebView. */
    void replaceDomain(String domain, String header) {
        for (int i = rows.size() - 1; i >= 0; i--) {
            if (matches(rows.get(i)[0], domain)) rows.remove(i);
        }
        if (header == null) return;
        for (String part : header.split(";")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            rows.add(new String[]{"." + domain, "TRUE", "/", "TRUE", String.valueOf(FAR_FUTURE),
                    part.substring(0, eq).trim(), part.substring(eq + 1).trim()});
        }
    }

    /** Cookie-Header für eine Adresse, z. B. für eigene Anfragen an tiktok.com. */
    String headerFor(String url) {
        String host = Links.host(url);
        StringBuilder sb = new StringBuilder();
        for (String[] r : rows) {
            String d = r[0].startsWith(".") ? r[0].substring(1) : r[0];
            if (host.equals(d) || host.endsWith("." + d)) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(r[5]).append('=').append(r[6]);
            }
        }
        return sb.toString();
    }

    /** Domains mit Cookies, z. B. für die Anzeige "Angemeldet bei youtube.com, tiktok.com". */
    List<String> domains() {
        List<String> out = new ArrayList<>();
        for (String[] r : rows) {
            String d = r[0].startsWith(".") ? r[0].substring(1) : r[0];
            if (d.startsWith("www.")) d = d.substring(4);
            if (!out.contains(d)) out.add(d);
        }
        return out;
    }

    private static boolean matches(String cookieDomain, String domain) {
        String d = cookieDomain.startsWith(".") ? cookieDomain.substring(1) : cookieDomain;
        return d.equals(domain) || d.endsWith("." + domain);
    }

    String toText() {
        StringBuilder sb = new StringBuilder("# Netscape HTTP Cookie File\n# Erstellt von ClipSaver\n\n");
        for (String[] r : rows) {
            for (int i = 0; i < r.length; i++) {
                if (i > 0) sb.append('\t');
                sb.append(r[i]);
            }
            sb.append('\n');
        }
        return sb.toString();
    }
}

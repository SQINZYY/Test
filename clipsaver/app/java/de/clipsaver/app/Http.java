package de.clipsaver.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Kleiner HTTP-Client für das Auslesen von TikTok- und YouTube-Seiten: eigener Cookie-Speicher und
 * Weiterleitungen von Hand, damit Cookies aus jeder Zwischenantwort erhalten bleiben. (Ohne Android-Klassen.)
 */
final class Http {

    static final String UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    private static final int TIMEOUT = 20000;
    private static final int MAX_BODY = 12 * 1024 * 1024;

    static final class Response {
        final int code;
        final String url;
        final String body;

        Response(int code, String url, String body) {
            this.code = code;
            this.url = url;
            this.body = body;
        }
    }

    /** Schlüssel "domain|name" → {domain, name, value} */
    private final Map<String, String[]> cookies = new LinkedHashMap<>();
    String userAgent = UA_DESKTOP;

    void setCookie(String domain, String name, String value) {
        String d = domain.startsWith(".") ? domain.substring(1) : domain;
        cookies.put(d + "|" + name, new String[]{d, name, value});
    }

    /** Übernimmt Cookies im Format "a=1; b=2" (z. B. aus der WebView oder einer cookies.txt) für eine Domain. */
    void addCookieHeader(String domain, String header) {
        if (header == null) return;
        for (String part : header.split(";")) {
            int eq = part.indexOf('=');
            if (eq > 0) setCookie(domain, part.substring(0, eq).trim(), part.substring(eq + 1).trim());
        }
    }

    String cookieHeader(String url) {
        String host = Links.host(url);
        StringBuilder sb = new StringBuilder();
        for (String[] c : cookies.values()) {
            if (host.equals(c[0]) || host.endsWith("." + c[0])) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(c[1]).append('=').append(c[2]);
            }
        }
        return sb.toString();
    }

    Response get(String url, Map<String, String> headers) throws IOException {
        String current = url;
        for (int hop = 0; hop < 10; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(TIMEOUT);
            c.setReadTimeout(TIMEOUT);
            c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            c.setRequestProperty("Accept-Language", "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7");
            if (headers != null) {
                for (Map.Entry<String, String> h : headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
            }
            String cookie = cookieHeader(current);
            if (cookie.length() > 0) c.setRequestProperty("Cookie", cookie);
            int code = c.getResponseCode();
            storeCookies(current, c.getHeaderFields());
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                current = new URL(new URL(current), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            String body = in == null ? "" : new String(readAll(in, MAX_BODY), "UTF-8");
            c.disconnect();
            return new Response(code, current, body);
        }
        throw new IOException("Zu viele Weiterleitungen");
    }

    private void storeCookies(String url, Map<String, List<String>> fields) {
        String host = Links.host(url);
        for (Map.Entry<String, List<String>> e : fields.entrySet()) {
            if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String raw : e.getValue()) {
                String[] parts = raw.split(";");
                int eq = parts[0].indexOf('=');
                if (eq <= 0) continue;
                String domain = host;
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase(Locale.ROOT).startsWith("domain=")) domain = p.substring(7).trim();
                }
                setCookie(domain, parts[0].substring(0, eq).trim(), parts[0].substring(eq + 1).trim());
            }
        }
    }

    static byte[] readAll(InputStream in, int max) throws IOException {
        try (InputStream input = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = input.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > max) throw new IOException("Antwort zu groß");
            }
            return out.toByteArray();
        }
    }
}

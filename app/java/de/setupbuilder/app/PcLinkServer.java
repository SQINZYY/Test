package de.setupbuilder.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.SecureRandom;
import java.util.Collections;

/**
 * Kleiner HTTP-Server im WLAN für "PC verbinden":
 * GET  /TOKEN       liefert das PowerShell-Skript (mit eingetragener Rücksende-Adresse),
 * POST /TOKEN/scan  nimmt die ausgelesene Hardware (JSON) entgegen.
 * Ohne das zufällige Token antwortet der Server mit 404. Nur reines Java, damit er sich auch ohne Android testen lässt.
 */
public class PcLinkServer {

    public interface Listener {
        void onScriptFetched();

        void onScan(String json);
    }

    private static final int MAX_BODY = 2 * 1024 * 1024;

    private final String scriptTemplate;
    private final Listener listener;
    private final String token;
    private ServerSocket server;
    private volatile boolean running;
    private String ip;
    private int port;

    public PcLinkServer(String scriptTemplate, Listener listener) {
        this.scriptTemplate = scriptTemplate;
        this.listener = listener;
        this.token = randomToken();
    }

    public String getToken() { return token; }

    public String getIp() { return ip; }

    public int getPort() { return port; }

    /** Startet den Server auf der WLAN-Adresse; Ports 8765–8774 werden der Reihe nach probiert. */
    public void start(String address) throws IOException {
        ip = address;
        IOException last = null;
        for (int p = 8765; p < 8775 && server == null; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s;
                port = p;
            } catch (IOException e) {
                last = e;
            }
        }
        if (server == null) throw last != null ? last : new IOException("Kein freier Port");
        running = true;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptLoop();
            }
        }, "pclink");
        t.setDaemon(true);
        t.start();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
            // schon geschlossen
        }
        server = null;
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket socket = server.accept();
                Thread t = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        handle(socket);
                    }
                }, "pclink-client");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(20000);
            InputStream in = socket.getInputStream();
            String requestLine = readLine(in);
            if (requestLine == null) return;
            int length = 0;
            String line;
            while ((line = readLine(in)) != null && line.length() > 0) {
                int colon = line.indexOf(':');
                if (colon > 0 && line.substring(0, colon).trim().equalsIgnoreCase("Content-Length")) {
                    length = Integer.parseInt(line.substring(colon + 1).trim());
                }
            }
            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "";
            String path = parts.length > 1 ? parts[1] : "";
            OutputStream out = socket.getOutputStream();
            if ("GET".equals(method) && path.equals("/" + token)) {
                String upload = "http://" + ip + ":" + port + "/" + token + "/scan";
                respond(out, 200, "text/plain; charset=utf-8", scriptTemplate.replace("{{UPLOAD}}", upload));
                listener.onScriptFetched();
            } else if ("POST".equals(method) && path.equals("/" + token + "/scan")) {
                if (length <= 0 || length > MAX_BODY) {
                    respond(out, 413, "text/plain", "Zu gross");
                    return;
                }
                byte[] body = new byte[length];
                int read = 0;
                while (read < length) {
                    int n = in.read(body, read, length - read);
                    if (n < 0) break;
                    read += n;
                }
                respond(out, 200, "text/plain", "OK");
                listener.onScan(new String(body, 0, read, "UTF-8"));
            } else {
                respond(out, 404, "text/plain", "Not Found");
            }
        } catch (Exception ignored) {
            // Verbindung abgebrochen – nichts zu tun
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
                // egal
            }
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') buf.write(c);
            if (buf.size() > 8192) throw new IOException("Zeile zu lang");
        }
        if (c == -1 && buf.size() == 0) return null;
        return buf.toString("ISO-8859-1");
    }

    private static void respond(OutputStream out, int status, String type, String text) throws IOException {
        byte[] body = text.getBytes("UTF-8");
        String head = "HTTP/1.1 " + status + (status == 200 ? " OK" : " Error") + "\r\nContent-Type: " + type
                + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes("ISO-8859-1"));
        out.write(body);
        out.flush();
    }

    private static String randomToken() {
        String chars = "abcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }

    /** IPv4-Adresse im lokalen Netz (WLAN bevorzugt), sonst null. */
    public static String findLanAddress() {
        String fallback = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    String name = ni.getName();
                    if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) return a.getHostAddress();
                    if (fallback == null) fallback = a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
            // keine Netzwerkinfos
        }
        return fallback;
    }
}

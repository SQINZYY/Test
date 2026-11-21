package de.darkos.launcher;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;

/** Wetter von Open-Meteo.com (kostenlos, ohne Konto, Daten unter CC BY 4.0). */
final class Weather {
    private Weather() {}

    static final long MAX_AGE_MS = 30 * 60 * 1000L;

    static final class Place {
        final String name;
        final double lat, lon;

        Place(String name, double lat, double lon) {
            this.name = name;
            this.lat = lat;
            this.lon = lon;
        }
    }

    static final class Data {
        double temp, wind, feels;
        int code;
        boolean day;
        int humidity;
        String[] days = new String[0];
        int[] dayCodes = new int[0];
        double[] max = new double[0], min = new double[0];
    }

    static Place geocode(String query) throws IOException, JSONException {
        String url = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&format=json&name="
            + URLEncoder.encode(query.trim(), "UTF-8");
        JSONObject o = new JSONObject(get(url));
        JSONArray r = o.optJSONArray("results");
        if (r == null || r.length() == 0) return null;
        JSONObject p = r.getJSONObject(0);
        String name = p.optString("name", query);
        String country = p.optString("country_code", "");
        if (!country.isEmpty() && !"DE".equalsIgnoreCase(country)) name += ", " + country.toUpperCase(Locale.ROOT);
        return new Place(name, p.getDouble("latitude"), p.getDouble("longitude"));
    }

    static String fetch(double lat, double lon) throws IOException {
        String url = String.format(Locale.US, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
            + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4", lat, lon);
        return get(url);
    }

    static Data parse(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        JSONObject cur = o.getJSONObject("current");
        Data d = new Data();
        d.temp = cur.getDouble("temperature_2m");
        d.feels = cur.optDouble("apparent_temperature", d.temp);
        d.humidity = cur.optInt("relative_humidity_2m", -1);
        d.code = cur.optInt("weather_code", 0);
        d.day = cur.optInt("is_day", 1) == 1;
        d.wind = cur.optDouble("wind_speed_10m", 0);
        JSONObject daily = o.optJSONObject("daily");
        if (daily != null) {
            JSONArray t = daily.getJSONArray("time");
            JSONArray c = daily.getJSONArray("weather_code");
            JSONArray mx = daily.getJSONArray("temperature_2m_max");
            JSONArray mn = daily.getJSONArray("temperature_2m_min");
            int n = Math.min(Math.min(t.length(), c.length()), Math.min(mx.length(), mn.length()));
            d.days = new String[n];
            d.dayCodes = new int[n];
            d.max = new double[n];
            d.min = new double[n];
            for (int i = 0; i < n; i++) {
                d.days[i] = t.getString(i);
                d.dayCodes[i] = c.optInt(i, 0);
                d.max[i] = mx.optDouble(i, 0);
                d.min[i] = mn.optDouble(i, 0);
            }
        }
        return d;
    }

    /** WMO-Wettercode -> Beschreibung. */
    static String describe(int code) {
        switch (code) {
            case 0: return "Klar";
            case 1: return "Überwiegend klar";
            case 2: return "Teils bewölkt";
            case 3: return "Bedeckt";
            case 45: case 48: return "Nebel";
            case 51: case 53: case 55: return "Nieselregen";
            case 56: case 57: return "Gefrierender Niesel";
            case 61: return "Leichter Regen";
            case 63: return "Regen";
            case 65: return "Starker Regen";
            case 66: case 67: return "Gefrierender Regen";
            case 71: return "Leichter Schnee";
            case 73: return "Schnee";
            case 75: return "Starker Schnee";
            case 77: return "Schneegriesel";
            case 80: case 81: return "Regenschauer";
            case 82: return "Starke Schauer";
            case 85: case 86: return "Schneeschauer";
            case 95: return "Gewitter";
            case 96: case 99: return "Gewitter mit Hagel";
            default: return "Wetter";
        }
    }

    /** WMO-Wettercode -> Symbolname. */
    static String glyph(int code, boolean day) {
        if (code == 0) return day ? "sun" : "moon";
        if (code == 1 || code == 2) return day ? "weather" : "cloud_moon";
        if (code == 3) return "cloudy";
        if (code == 45 || code == 48) return "fog";
        if (code >= 51 && code <= 57) return "drizzle";
        if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "snow";
        if (code == 96 || code == 99) return "hail";
        if (code >= 95) return "storm";
        return "cloud";
    }

    static String temp(double t) {
        return Math.round(t) + "°";
    }

    private static String get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        c.setRequestProperty("User-Agent", "DarkOS-Launcher/1.0 (Android)");
        try {
            int status = c.getResponseCode();
            if (status != 200) throw new IOException("HTTP " + status);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}

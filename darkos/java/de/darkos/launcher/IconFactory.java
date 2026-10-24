package de.darkos.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;

import java.util.HashMap;
import java.util.Map;

/**
 * Zeichnet die eigenen DarkOS-App-Icons: Neon-Symbole für bekannte Apps,
 * das Monochrom-Icon der App (Android 13+) oder ein leuchtendes Monogramm.
 */
final class IconFactory {
    private IconFactory() {}

    /** Darstellung, wie sie in den Einstellungen gewählt ist. */
    static final class Spec {
        final String style;
        final String shape;
        final String colors;
        final int accentIndex;

        Spec(String style, String shape, String colors, int accentIndex) {
            this.style = style;
            this.shape = shape;
            this.colors = colors;
            this.accentIndex = accentIndex;
        }

        static Spec from(Prefs p) {
            return new Spec(p.iconStyle(), p.iconShape(), p.iconColors(), p.accentIndex());
        }
    }

    // Bekannte Apps: Paketname -> Symbol
    private static final Map<String, String> PACKAGES = new HashMap<>();
    // Standardfarbe je Symbol (Index in Ui.NEON)
    private static final Map<String, Integer> GLYPH_COLORS = new HashMap<>();
    // Stichwörter in App-Namen / Paketnamen -> Symbol (Reihenfolge = Priorität)
    private static final String[][] KEYWORDS = {
        {"music", "music", "musik", "spotify", "deezer", "soundcloud", "tidal", "shazam"},
        {"phone", "telefon", "phone", "dialer", "anrufe", "telephony"},
        {"contact", "kontakte", "contacts", "contact", "adressbuch"},
        {"messages", "nachrichten", "messages", "messaging", "sms", "mms"},
        {"chat", "whatsapp", "signal", "threema", "messenger", "chat", "element"},
        {"send", "telegram"},
        {"mail", "mail", "gmail", "email", "outlook", "posteingang", "inbox", "thunderbird", "gmx", "web.de"},
        {"camera", "kamera", "camera", "cam", "snapseed"},
        {"images", "galerie", "gallery", "fotos", "photos", "bilder", "album", "photo", "screenshots"},
        {"alarm", "uhr", "wecker", "clock", "alarm", "deskclock", "clockpackage"},
        {"calendar", "kalender", "calendar", "termine"},
        {"calculator", "rechner", "taschenrechner", "calculator", "calc", "popupcalculator"},
        {"settings", "einstellungen", "settings"},
        {"folder", "dateien", "files", "dateimanager", "filemanager", "explorer", "myfiles", "documentsui", "fileexplorer", "ordner"},
        {"globe", "browser", "chrome", "firefox", "opera", "brave", "internet", "edge", "vivaldi", "duckduckgo", "sbrowser"},
        {"play", "youtube", "video", "videos", "player", "vlc", "videoplayer"},
        {"film", "netflix", "filme", "movies", "kino", "cinema"},
        {"tv", "tv", "prime", "disney", "twitch", "joyn", "zattoo", "waipu", "mediathek", "zdf", "ard", "rtl", "dazn"},
        {"navigation", "waze", "navi", "navigation"},
        {"map", "maps", "karten", "here", "osmand", "komoot"},
        {"weather", "wetter", "weather", "daemonapp"},
        {"note", "notizen", "notes", "keep", "memo", "notiz", "notepad"},
        {"notebook", "notion", "evernote", "onenote", "obsidian"},
        {"todo", "tasks", "aufgaben", "todo", "todoist", "reminders", "erinnerungen"},
        {"languages", "translate", "ubersetzer", "deepl", "dolmetscher"},
        {"compass", "kompass", "compass"},
        {"flashlight", "taschenlampe", "flashlight", "torch"},
        {"bag", "store", "market", "playstore", "vending", "samsungapps", "appgallery"},
        {"cart", "amazon", "shop", "shopping", "otto", "zalando", "temu", "aliexpress", "kaufland", "wish", "shein"},
        {"tag", "ebay", "kleinanzeigen", "vinted", "willhaben"},
        {"wallet", "wallet", "pay", "paypal", "geldborse", "klarna"},
        {"bank", "bank", "banking", "sparkasse", "volksbank", "commerzbank", "comdirect", "dkb", "ing", "postbank", "finanz", "raiffeisen", "consorsbank", "trade"},
        {"card", "n26", "revolut", "vivid", "kreditkarte", "amex"},
        {"bitcoin", "bitcoin", "crypto", "binance", "coinbase", "bitpanda"},
        {"key", "authenticator", "passwort", "password", "passwords", "bitwarden", "1password", "keepass", "lastpass", "proton", "pass"},
        {"vpn", "vpn", "nordvpn", "surfshark"},
        {"shield", "security", "sicherheit", "secure", "sicherer", "antivirus", "defender", "lool", "safety", "gerateschutz", "geratewartung"},
        {"gamepad", "game", "games", "spiel", "spiele", "steam", "playstation", "xbox", "roblox", "minecraft", "fortnite", "clash", "brawl", "discord", "gamehome", "supercell", "epic"},
        {"ghost", "snapchat"},
        {"aperture", "instagram", "lightroom", "vsco"},
        {"users", "facebook", "teams", "community", "members", "familylink", "family"},
        {"at", "twitter", "threads", "mastodon", "bluesky"},
        {"chats", "reddit", "slack", "discourse"},
        {"briefcase", "linkedin", "xing", "office", "indeed", "stepstone"},
        {"file", "docs", "word", "pdf", "acrobat", "dokumente", "documents", "sheets", "excel", "slides", "powerpoint", "wps"},
        {"drive", "drive", "speicher", "storage"},
        {"box", "dropbox", "box"},
        {"cloud", "cloud", "onedrive", "icloud", "backup", "nextcloud"},
        {"video", "meet", "zoom", "duo", "skype", "webex", "facetime", "tachyon", "jitsi"},
        {"mic", "recorder", "rekorder", "sprachmemo", "diktiergerat", "voice", "diktier", "aufnahme", "sprachaufnahme", "sprachrekorder", "voicenote", "soundrecorder"},
        {"radio", "radio", "podcast", "podcasts", "pocketcasts", "castbox"},
        {"headphones", "audible", "horbuch", "audiobook", "buds", "wearable", "headphones", "kopfhorer"},
        {"book", "kindle", "books", "bucher", "tolino", "reader", "lesen", "wattpad", "manga", "comic"},
        {"news", "news", "zeitung", "spiegel", "tagesschau", "bild", "welt", "faz", "magazines", "heise", "zeit"},
        {"school", "duolingo", "classroom", "learn", "lernen", "schule", "uni", "babbel", "anki", "moodle", "khan"},
        {"health", "health", "gesundheit", "shealth", "clue", "doctolib", "arzt"},
        {"fitness", "fitness", "workout", "gym", "training", "freeletics", "fitbit"},
        {"activity", "strava", "runtastic", "running", "wellbeing", "steps", "pedometer", "schritte"},
        {"food", "lieferando", "wolt", "eats", "essen", "food", "rezepte", "chefkoch", "takeaway", "foodora", "hellofresh", "mcdonald", "burger"},
        {"coffee", "starbucks", "coffee", "kaffee"},
        {"taxi", "uber", "bolt", "freenow", "taxi", "mtakso", "lyft"},
        {"train", "bahn", "db", "hafas", "hvv", "bvg", "mvg", "rail", "train", "vvs", "vrr", "rmv", "kvb", "sbb", "obb", "oebb"},
        {"bus", "bus", "flixbus", "flix"},
        {"plane", "flug", "flight", "lufthansa", "ryanair", "eurowings", "airline", "flights", "skyscanner", "booking", "airbnb", "check24"},
        {"fuel", "tanken", "sprit", "fuel"},
        {"car", "auto", "car", "carsharing", "sharenow", "tesla", "bmw", "mercedes", "volkswagen", "vw", "adac"},
        {"house", "home", "smartthings", "alexa", "hue", "homey", "tado", "nest", "oneconnect", "chromecast"},
        {"bot", "chatgpt", "gpt", "openai", "character", "replika"},
        {"sparkles", "gemini", "assistant", "googleassistant", "bixby", "claude", "copilot", "perplexity", "ai", "bard", "grok", "mistral"},
        {"scan", "lens", "scanner", "scan", "camscanner"},
        {"qr", "qr", "barcode"},
        {"palette", "themes", "theme", "design", "wallpaper", "wallpapers", "hintergrund", "thememanager", "canva", "paint"},
        {"keyboard", "keyboard", "tastatur", "gboard", "swiftkey", "honeyboard"},
        {"smartphone", "smartswitch", "switch", "migrate", "pixelmigrate", "clone", "phoneclone"},
        {"download", "download", "downloads", "torrent"},
        {"printer", "print", "drucker", "printer", "printspooler"},
        {"idea", "tips", "tipps", "hilfe", "help", "ideas"},
        {"flame", "tinder"},
        {"heart", "dating", "bumble", "lovoo", "hinge", "parship", "love"},
        {"ticket", "ticket", "tickets", "eventim", "dticket", "deutschlandticket"},
        {"package", "dhl", "hermes", "dpd", "ups", "paket", "sendung", "gls", "parcel"},
        {"wifi", "wifi", "wlan", "fritz", "router"},
        {"bluetooth", "bluetooth"},
        {"volume", "sound", "equalizer", "lautstarke"},
        {"terminal", "terminal", "termux", "adb", "shell"},
        {"code", "code", "github", "gitlab", "dev", "developer"},
        {"cpu", "cpuz", "aida", "hardware", "deviceinfo", "devcheck"},
        {"gauge", "speedtest", "benchmark", "antutu", "geekbench"},
        {"pin", "pokemon", "nianticlabs", "foursquare", "swarm"},
        {"timer", "timer", "stoppuhr", "pomodoro", "forest", "focus"},
        {"moon", "schlaf", "sleep", "sleepasandroid"},
        {"leaf", "meditation", "headspace", "calm", "7mind", "balloon"},
        {"trophy", "sport", "kicker", "sportschau", "fussball", "onefootball", "fifa", "transfermarkt"},
        {"monitor", "remote", "teamviewer", "anydesk", "desktop", "vnc", "rdp"},
        {"cast", "cast", "smartview", "miracast"},
        {"smile", "kids", "kinder", "emoji"},
        {"brush", "draw", "sketch", "procreate", "ibis", "zeichnen"},
        {"star", "favoriten", "rating", "rewards", "payback", "deutschlandcard"},
        {"gift", "gutschein", "gift", "geschenk", "coupons"},
    };

    static {
        String[][] pk = {
            {"com.whatsapp", "chat"}, {"com.whatsapp.w4b", "chat"}, {"org.telegram.messenger", "send"},
            {"org.thoughtcrime.securesms", "chat"}, {"ch.threema.app", "chat"}, {"com.facebook.orca", "chat"},
            {"com.google.android.youtube", "play"}, {"com.google.android.apps.youtube.music", "music"},
            {"com.google.android.apps.youtube.kids", "play"}, {"com.spotify.music", "music"},
            {"com.instagram.android", "aperture"}, {"com.zhiliaoapp.musically", "music"}, {"com.ss.android.ugc.trill", "music"},
            {"com.snapchat.android", "ghost"}, {"com.discord", "gamepad"}, {"com.reddit.frontpage", "chats"},
            {"com.twitter.android", "at"}, {"com.facebook.katana", "users"}, {"com.netflix.mediaclient", "film"},
            {"com.amazon.mShop.android.shopping", "cart"}, {"com.amazon.avod.thirdpartyclient", "tv"},
            {"com.disney.disneyplus", "tv"}, {"tv.twitch.android.app", "tv"}, {"com.valvesoftware.android.steam.community", "gamepad"},
            {"com.paypal.android.p2pmobile", "wallet"}, {"com.google.android.apps.maps", "map"}, {"com.google.android.gm", "mail"},
            {"com.google.android.apps.photos", "images"}, {"com.android.chrome", "globe"}, {"org.mozilla.firefox", "globe"},
            {"com.brave.browser", "globe"}, {"com.opera.browser", "globe"}, {"com.opera.gx", "globe"},
            {"com.sec.android.app.sbrowser", "globe"}, {"com.microsoft.emmx", "globe"},
            {"com.google.android.googlequicksearchbox", "search"}, {"com.google.android.apps.bard", "sparkles"},
            {"com.openai.chatgpt", "bot"}, {"com.anthropic.claude", "sparkles"}, {"com.microsoft.copilot", "sparkles"},
            {"com.google.android.keep", "note"}, {"com.google.android.apps.docs.editors.docs", "file"},
            {"com.google.android.apps.docs.editors.sheets", "grid"}, {"com.google.android.apps.docs.editors.slides", "monitor"},
            {"com.google.android.apps.docs", "drive"}, {"com.google.android.apps.translate", "languages"},
            {"com.google.android.calendar", "calendar"}, {"com.google.android.deskclock", "alarm"},
            {"com.google.android.calculator", "calculator"}, {"com.google.android.contacts", "contact"},
            {"com.google.android.dialer", "phone"}, {"com.google.android.apps.messaging", "messages"},
            {"com.android.vending", "bag"}, {"com.google.android.apps.walletnfcrel", "wallet"},
            {"com.google.android.apps.fitness", "health"}, {"com.sec.android.app.shealth", "health"},
            {"com.google.android.apps.nbu.files", "folder"}, {"com.sec.android.app.myfiles", "folder"},
            {"com.google.android.documentsui", "folder"}, {"com.android.documentsui", "folder"},
            {"com.google.android.GoogleCamera", "camera"}, {"com.sec.android.app.camera", "camera"},
            {"com.sec.android.gallery3d", "images"}, {"com.miui.gallery", "images"},
            {"com.google.android.apps.recorder", "mic"}, {"com.sec.android.app.voicenote", "mic"},
            {"com.google.android.apps.googleassistant", "sparkles"}, {"com.google.ar.lens", "scan"},
            {"com.google.android.apps.tachyon", "video"}, {"com.google.android.apps.meetings", "video"},
            {"us.zoom.videomeetings", "video"}, {"com.microsoft.teams", "users"}, {"com.microsoft.office.outlook", "mail"},
            {"com.ebay.mobile", "tag"}, {"de.hafas.android.db", "train"}, {"com.ubercab", "taxi"}, {"ee.mtakso.client", "taxi"},
            {"com.takeaway.android", "food"}, {"de.number26.android", "card"}, {"com.revolut.revolut", "card"},
            {"com.starfinanz.smob.android.sfinanzstatus", "bank"}, {"com.google.android.apps.authenticator2", "key"},
            {"com.azure.authenticator", "key"}, {"com.duolingo", "school"}, {"com.google.android.apps.classroom", "school"},
            {"com.adobe.reader", "file"}, {"com.microsoft.office.word", "file"}, {"com.microsoft.office.officehubrow", "briefcase"},
            {"com.shazam.android", "waves"}, {"com.soundcloud.android", "waves"}, {"deezer.android.app", "music"},
            {"com.audible.application", "headphones"}, {"com.amazon.kindle", "book"}, {"com.pinterest", "image"},
            {"com.linkedin.android", "briefcase"}, {"com.tinder", "flame"}, {"com.bumble.app", "heart"},
            {"com.mojang.minecraftpe", "gamepad"}, {"com.roblox.client", "gamepad"}, {"com.epicgames.fortnite", "gamepad"},
            {"com.google.android.play.games", "gamepad"}, {"com.nianticlabs.pokemongo", "pin"}, {"com.strava", "activity"},
            {"com.samsung.android.app.notes", "note"}, {"com.samsung.android.oneconnect", "house"},
            {"com.sec.android.app.samsungapps", "bag"}, {"com.samsung.android.spay", "wallet"},
            {"com.samsung.android.bixby.agent", "sparkles"}, {"com.samsung.android.lool", "shield"},
            {"com.samsung.android.voc", "users"}, {"com.samsung.android.game.gamehome", "gamepad"},
            {"com.samsung.android.app.watchmanager", "headphones"}, {"com.samsung.android.calendar", "calendar"},
            {"com.sec.android.app.clockpackage", "alarm"}, {"com.sec.android.app.popupcalculator", "calculator"},
            {"com.samsung.android.dialer", "phone"}, {"com.samsung.android.messaging", "messages"},
            {"com.samsung.android.app.contacts", "contact"}, {"com.samsung.android.email.provider", "mail"},
            {"com.google.android.apps.tips", "idea"}, {"com.google.android.apps.safetyhub", "shield"},
            {"com.google.android.apps.podcasts", "radio"}, {"com.google.android.apps.magazines", "news"},
            {"com.google.android.apps.chromecast.app", "house"}, {"com.google.android.apps.subscriptions.red", "cloud"},
            {"com.google.android.apps.wellbeing", "activity"}, {"com.google.android.apps.tasks", "todo"},
            {"com.microsoft.todos", "todo"}, {"com.todoist", "todo"}, {"notion.id", "notebook"}, {"com.evernote", "notebook"},
            {"com.dropbox.android", "box"}, {"com.microsoft.skydrive", "cloud"}, {"com.miui.securitycenter", "shield"},
            {"com.mi.android.globalFileexplorer", "folder"}, {"com.miui.notes", "note"}, {"com.miui.weather2", "weather"},
            {"com.miui.calculator", "calculator"}, {"com.android.thememanager", "palette"}, {"com.xiaomi.market", "bag"},
            {"com.miui.player", "music"}, {"com.miui.videoplayer", "play"}, {"com.android.deskclock", "alarm"},
            {"com.android.calendar", "calendar"}, {"com.android.settings", "settings"}, {"com.android.contacts", "contact"},
            {"com.android.mms", "messages"}, {"com.miui.compass", "compass"}, {"com.miui.screenrecorder", "video"},
            {"com.android.soundrecorder", "mic"}, {"com.android.camera", "camera"}, {"com.android.camera2", "camera"},
            {"com.android.gallery3d", "images"}, {"com.android.dialer", "phone"}, {"com.android.messaging", "messages"},
            {"com.android.email", "mail"}, {"com.android.music", "music"}, {"com.android.calculator2", "calculator"},
            {"com.android.browser", "globe"}, {"com.oneplus.camera", "camera"}, {"com.oneplus.gallery", "images"},
            {"com.coloros.gallery3d", "images"}, {"com.oplus.camera", "camera"}, {"com.huawei.camera", "camera"},
            {"com.android.stk", "card"}, {"com.google.android.apps.nbu.paisa.user", "wallet"},
            {"com.google.android.apps.youtube.creator", "play"}, {"com.google.android.videos", "film"},
            {"com.google.android.apps.books", "book"}, {"com.google.android.apps.photosgo", "images"},
            {"com.google.android.apps.searchlite", "search"}, {"com.google.android.apps.kids.familylink", "users"},
        };
        for (String[] e : pk) PACKAGES.put(e[0], e[1]);

        Object[][] colors = {
            {"phone", Ui.GREEN}, {"chat", Ui.GREEN}, {"messages", Ui.BLUE}, {"chats", Ui.ORANGE}, {"mail", Ui.RED},
            {"send", Ui.CYAN}, {"globe", Ui.BLUE}, {"play", Ui.RED}, {"tv", Ui.VIOLET}, {"film", Ui.RED},
            {"music", Ui.GREEN}, {"headphones", Ui.VIOLET}, {"camera", Ui.PINK}, {"aperture", Ui.PINK}, {"images", Ui.YELLOW},
            {"image", Ui.RED}, {"settings", Ui.CYAN}, {"alarm", Ui.ORANGE}, {"calendar", Ui.BLUE}, {"calculator", Ui.ORANGE},
            {"folder", Ui.YELLOW}, {"note", Ui.YELLOW}, {"notebook", Ui.YELLOW}, {"map", Ui.GREEN}, {"navigation", Ui.CYAN},
            {"pin", Ui.RED}, {"weather", Ui.YELLOW}, {"bag", Ui.GREEN}, {"cart", Ui.ORANGE}, {"tag", Ui.YELLOW},
            {"wallet", Ui.BLUE}, {"bank", Ui.CYAN}, {"card", Ui.VIOLET}, {"key", Ui.YELLOW}, {"shield", Ui.GREEN},
            {"vpn", Ui.GREEN}, {"gamepad", Ui.VIOLET}, {"ghost", Ui.YELLOW}, {"sparkles", Ui.VIOLET}, {"bot", Ui.GREEN},
            {"search", Ui.BLUE}, {"contact", Ui.CYAN}, {"users", Ui.BLUE}, {"at", Ui.BLUE}, {"mic", Ui.RED},
            {"video", Ui.GREEN}, {"file", Ui.BLUE}, {"drive", Ui.YELLOW}, {"box", Ui.BLUE}, {"cloud", Ui.BLUE},
            {"languages", Ui.BLUE}, {"school", Ui.GREEN}, {"flame", Ui.RED}, {"heart", Ui.PINK}, {"health", Ui.RED},
            {"fitness", Ui.ORANGE}, {"activity", Ui.ORANGE}, {"train", Ui.RED}, {"bus", Ui.GREEN}, {"taxi", Ui.YELLOW},
            {"plane", Ui.CYAN}, {"food", Ui.ORANGE}, {"coffee", Ui.ORANGE}, {"house", Ui.CYAN}, {"palette", Ui.PINK},
            {"book", Ui.ORANGE}, {"news", Ui.BLUE}, {"todo", Ui.BLUE}, {"compass", Ui.RED}, {"flashlight", Ui.YELLOW},
            {"scan", Ui.BLUE}, {"qr", Ui.CYAN}, {"waves", Ui.CYAN}, {"radio", Ui.PINK}, {"briefcase", Ui.BLUE},
            {"package", Ui.YELLOW}, {"ticket", Ui.PINK}, {"code", Ui.GREEN}, {"terminal", Ui.GREEN}, {"trophy", Ui.YELLOW},
            {"bitcoin", Ui.ORANGE}, {"keyboard", Ui.CYAN}, {"cast", Ui.BLUE}, {"monitor", Ui.BLUE}, {"sliders", Ui.VIOLET},
        };
        for (Object[] e : colors) GLYPH_COLORS.put((String) e[0], (Integer) e[1]);
    }

    /** Das Symbol, das DarkOS automatisch für eine App wählt (oder null). */
    static String autoGlyph(Apps.App app, Apps apps) {
        if (app.internal) return "sliders";
        String g = PACKAGES.get(app.pkg);
        if (g != null) return g;
        g = keywordGlyph(app.normalized, false);
        if (g != null) return g;
        g = apps.roleGlyphs.get(app.pkg);
        if (g != null) return g;
        return null;
    }

    private static String keywordGlyph(String text, boolean packageName) {
        String[] tokens = text.split(packageName ? "[^a-z0-9]+" : "[^a-z0-9.]+");
        for (String[] rule : KEYWORDS) {
            for (int i = 1; i < rule.length; i++) {
                String k = rule[i];
                for (String t : tokens) {
                    if (t.isEmpty()) continue;
                    // Kurze Stichwörter nur exakt, längere auch als Wortanfang ("Spiele" -> "spiel")
                    if (k.length() <= 3 ? t.equals(k) : t.startsWith(k)) return rule[0];
                }
            }
        }
        return null;
    }

    static int colorFor(Apps.App app, String glyph, Spec spec, Prefs prefs) {
        int o = prefs.colorOverride(app.key);
        if (o >= 0) return Ui.neon(o);
        if (app.internal || Prefs.COLORS_ACCENT.equals(spec.colors)) return Ui.neon(spec.accentIndex);
        if (glyph != null && GLYPH_COLORS.containsKey(glyph)) return Ui.neon(GLYPH_COLORS.get(glyph));
        return Ui.neon(Math.abs(app.pkg.hashCode() % Ui.NEON.length));
    }

    static Drawable original(Context c, Apps.App app) {
        try {
            if (app.internal) return c.getDrawable(R.mipmap.ic_launcher);
            return app.activity.loadIcon(c.getPackageManager());
        } catch (RuntimeException e) {
            return c.getPackageManager().getDefaultActivityIcon();
        }
    }

    /** Erzeugt das Icon als Bitmap (size x size Pixel, inkl. Rand für den Leuchteffekt). */
    static Bitmap render(Context c, Apps.App app, Apps apps, Spec spec, int size) {
        Prefs prefs = Prefs.get(c);
        String override = prefs.iconOverride(app.key);
        String style = "original".equals(override) ? Prefs.STYLE_ORIGINAL : spec.style;

        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float pad = size * 0.09f;
        RectF tile = new RectF(pad, pad, size - pad, size - pad);
        Path shape = shape(tile, spec.shape);

        if (Prefs.STYLE_ORIGINAL.equals(style) || Prefs.STYLE_GLASS.equals(style)) {
            Drawable icon = original(c, app);
            String glyph = autoGlyph(app, apps);
            int color = colorFor(app, glyph, spec, prefs);
            if (Prefs.STYLE_ORIGINAL.equals(style)) {
                float inset = size * 0.06f;
                icon.setBounds(Math.round(inset), Math.round(inset), Math.round(size - inset), Math.round(size - inset));
                icon.draw(cv);
            } else {
                drawGlassTile(cv, tile, shape, color);
                float s = tile.width() * 0.62f;
                icon.setBounds(Math.round(tile.centerX() - s / 2), Math.round(tile.centerY() - s / 2),
                    Math.round(tile.centerX() + s / 2), Math.round(tile.centerY() + s / 2));
                icon.draw(cv);
            }
            return bmp;
        }

        // Inhalt bestimmen: gewähltes/automatisches Symbol, Monochrom-Icon oder Monogramm
        String glyph = override.startsWith("g:") ? override.substring(2) : autoGlyph(app, apps);
        Drawable content = glyph != null ? Ui.glyph(c, glyph, 0xFFFFFFFF) : null;
        boolean adaptiveLayer = false;
        if (content == null) {
            Drawable mono = monochrome(original(c, app));
            if (mono != null) {
                content = mono;
                adaptiveLayer = true;
            } else {
                glyph = keywordGlyph(Apps.normalize(app.pkg), true);
                content = glyph != null ? Ui.glyph(c, glyph, 0xFFFFFFFF) : null;
            }
        }
        int color = colorFor(app, glyph, spec, prefs);
        Bitmap mask = mask(c, size, tile, content, adaptiveLayer, app.label);

        if (Prefs.STYLE_GRADIENT.equals(style)) {
            drawGradientTile(cv, tile, shape, color);
            drawShadowed(cv, mask, size);
        } else {
            drawNeonTile(cv, tile, shape, color);
            drawGlowing(cv, mask, color, size);
        }
        mask.recycle();
        return bmp;
    }

    static Drawable monochrome(Drawable d) {
        if (Build.VERSION.SDK_INT >= 33 && d instanceof AdaptiveIconDrawable) {
            Drawable m;
            try {
                // AdaptiveIconDrawable.getMonochrome() gibt es erst ab Android 13
                m = (Drawable) AdaptiveIconDrawable.class.getMethod("getMonochrome").invoke(d);
            } catch (ReflectiveOperationException | RuntimeException e) {
                return null;
            }
            if (m != null) {
                m = m.mutate();
                m.setTint(0xFFFFFFFF);
                m.setTintMode(PorterDuff.Mode.SRC_IN);
            }
            return m;
        }
        return null;
    }

    static Path shape(RectF r, String shape) {
        Path p = new Path();
        float w = r.width();
        if (Prefs.SHAPE_CIRCLE.equals(shape)) p.addOval(r, Path.Direction.CW);
        else if (Prefs.SHAPE_SQUARE.equals(shape)) p.addRoundRect(r, w * 0.14f, w * 0.14f, Path.Direction.CW);
        else p.addRoundRect(r, w * 0.30f, w * 0.30f, Path.Direction.CW);
        return p;
    }

    /** Weißer Inhalt (Symbol/Monogramm) als Maske in Icon-Größe. */
    private static Bitmap mask(Context c, int size, RectF tile, Drawable content, boolean adaptiveLayer, String label) {
        Bitmap m = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(m);
        float cx = tile.centerX(), cy = tile.centerY(), w = tile.width();
        if (content != null) {
            // Adaptive Ebenen sind 108 Einheiten groß, davon 72 sichtbar; leicht verkleinert, damit nichts den Rand berührt
            float s = adaptiveLayer ? w * 1.5f * 0.86f : w * 0.5f;
            content.setBounds(Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(cx + s / 2), Math.round(cy + s / 2));
            cv.save();
            cv.clipRect(tile);
            content.draw(cv);
            cv.restore();
        } else {
            String letter = monogram(label);
            Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
            tp.setTypeface(Ui.display(c, true));
            tp.setTextSize(w * 0.42f);
            tp.setColor(0xFFFFFFFF);
            tp.setTextAlign(Paint.Align.CENTER);
            Rect b = new Rect();
            tp.getTextBounds(letter, 0, letter.length(), b);
            cv.drawText(letter, cx, cy - (b.top + b.bottom) / 2f, tp);
        }
        return m;
    }

    static String monogram(String label) {
        if (label != null) {
            for (int i = 0; i < label.length(); i++) {
                char ch = label.charAt(i);
                if (Character.isLetterOrDigit(ch)) return String.valueOf(Character.toUpperCase(ch));
            }
        }
        return "?";
    }

    private static void drawNeonTile(Canvas cv, RectF tile, Path shape, int color) {
        float w = tile.width();
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeWidth(w * 0.05f);
        glow.setColor(Ui.alpha(color, 0.55f));
        glow.setMaskFilter(new BlurMaskFilter(w * 0.09f, BlurMaskFilter.Blur.NORMAL));
        cv.drawPath(shape, glow);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(0, tile.top, 0, tile.bottom,
            Ui.mix(0xFF000000, color, 0.20f), Ui.mix(0xFF000000, color, 0.05f), Shader.TileMode.CLAMP));
        cv.drawPath(shape, fill);

        Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
        sheen.setShader(new RadialGradient(tile.centerX(), tile.top, w * 0.85f,
            Ui.alpha(color, 0.20f), 0x00000000, Shader.TileMode.CLAMP));
        cv.drawPath(shape, sheen);

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, w * 0.03f));
        border.setColor(Ui.mix(color, 0xFFFFFFFF, 0.12f));
        cv.drawPath(shape, border);
    }

    private static void drawGradientTile(Canvas cv, RectF tile, Path shape, int color) {
        float w = tile.width();
        int c2 = Ui.partner(color);
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setColor(Ui.alpha(color, 0.45f));
        glow.setMaskFilter(new BlurMaskFilter(w * 0.08f, BlurMaskFilter.Blur.NORMAL));
        cv.save();
        cv.translate(0, w * 0.04f);
        cv.drawPath(shape, glow);
        cv.restore();

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(tile.left, tile.top, tile.right, tile.bottom,
            Ui.mix(color, 0xFFFFFFFF, 0.08f), Ui.mix(c2, 0xFF000000, 0.12f), Shader.TileMode.CLAMP));
        cv.drawPath(shape, fill);

        cv.save();
        cv.clipPath(shape);
        Paint gloss = new Paint(Paint.ANTI_ALIAS_FLAG);
        gloss.setShader(new LinearGradient(0, tile.top, 0, tile.centerY(), 0x40FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        cv.drawRect(tile.left, tile.top, tile.right, tile.centerY(), gloss);
        cv.restore();

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, w * 0.02f));
        border.setColor(0x40FFFFFF);
        cv.drawPath(shape, border);
    }

    private static void drawGlassTile(Canvas cv, RectF tile, Path shape, int color) {
        float w = tile.width();
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeWidth(w * 0.05f);
        glow.setColor(Ui.alpha(color, 0.5f));
        glow.setMaskFilter(new BlurMaskFilter(w * 0.08f, BlurMaskFilter.Blur.NORMAL));
        cv.drawPath(shape, glow);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(0, tile.top, 0, tile.bottom, 0xFF17151F, 0xFF07070C, Shader.TileMode.CLAMP));
        cv.drawPath(shape, fill);

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, w * 0.025f));
        border.setColor(Ui.alpha(color, 0.9f));
        cv.drawPath(shape, border);
    }

    /** Neon-Röhre: farbiger Schein + hellerer Kern. */
    private static void drawGlowing(Canvas cv, Bitmap mask, int color, int size) {
        Bitmap alpha = mask.extractAlpha();
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        glow.setColor(color);
        glow.setMaskFilter(new BlurMaskFilter(size * 0.06f, BlurMaskFilter.Blur.NORMAL));
        cv.drawBitmap(alpha, 0, 0, glow);
        glow.setMaskFilter(new BlurMaskFilter(size * 0.02f, BlurMaskFilter.Blur.NORMAL));
        cv.drawBitmap(alpha, 0, 0, glow);
        Paint core = new Paint(Paint.FILTER_BITMAP_FLAG);
        core.setColorFilter(new PorterDuffColorFilter(Ui.mix(color, 0xFFFFFFFF, 0.45f), PorterDuff.Mode.SRC_IN));
        cv.drawBitmap(mask, 0, 0, core);
        alpha.recycle();
    }

    private static void drawShadowed(Canvas cv, Bitmap mask, int size) {
        Bitmap alpha = mask.extractAlpha();
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        shadow.setColor(0x55000000);
        shadow.setMaskFilter(new BlurMaskFilter(size * 0.025f, BlurMaskFilter.Blur.NORMAL));
        cv.drawBitmap(alpha, 0, size * 0.015f, shadow);
        Paint core = new Paint(Paint.FILTER_BITMAP_FLAG);
        core.setColorFilter(new PorterDuffColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_IN));
        cv.drawBitmap(mask, 0, 0, core);
        alpha.recycle();
    }

    /** Leuchtendes Symbol ohne Kachel (Wetter, Widgets). */
    static Bitmap glowGlyph(Context c, String glyph, int color, int size) {
        Bitmap mask = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Drawable d = Ui.glyph(c, glyph, 0xFFFFFFFF);
        if (d != null) {
            int inset = Math.round(size * 0.18f);
            d.setBounds(inset, inset, size - inset, size - inset);
            d.draw(new Canvas(mask));
        }
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        drawGlowing(new Canvas(out), mask, color, size);
        mask.recycle();
        return out;
    }

    /** Ein einzelnes Symbol als Neon-Kachel (z. B. für Vorschauen im Icon-Editor). */
    static Bitmap renderGlyph(Context c, String glyph, int color, Spec spec, int size) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float pad = size * 0.09f;
        RectF tile = new RectF(pad, pad, size - pad, size - pad);
        Path shape = shape(tile, spec.shape);
        Bitmap mask = mask(c, size, tile, Ui.glyph(c, glyph, 0xFFFFFFFF), false, glyph);
        if (Prefs.STYLE_GRADIENT.equals(spec.style)) {
            drawGradientTile(cv, tile, shape, color);
            drawShadowed(cv, mask, size);
        } else {
            drawNeonTile(cv, tile, shape, color);
            drawGlowing(cv, mask, color, size);
        }
        mask.recycle();
        return bmp;
    }
}

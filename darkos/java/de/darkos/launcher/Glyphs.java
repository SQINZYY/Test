// Erzeugt von darkos/tools/make_glyphs.js – nicht von Hand ändern.
package de.darkos.launcher;

/** Neon-Symbole (Lucide, ISC-Lizenz) für App-Icons und Oberfläche. */
final class Glyphs {
    private Glyphs() {}

    /** Symbole, die im Icon-Editor auswählbar sind. */
    static final String[] APP_NAMES = {
        "phone", "chat", "messages", "chats", "mail", "send", "at", "video",
        "users", "contact", "bell", "globe", "earth", "play", "tv", "film",
        "clapper", "popcorn", "music", "headphones", "radio", "mic", "waves", "disc",
        "camera", "aperture", "image", "images", "settings", "clock", "alarm", "timer",
        "calendar", "calculator", "folder", "file", "note", "notebook", "pen", "search",
        "scan", "qr", "languages", "compass", "flashlight", "map", "pin", "navigation",
        "cloud", "weather", "download", "drive", "printer", "key", "lock", "shield",
        "wallet", "card", "bank", "piggy", "bitcoin", "bag", "cart", "store",
        "package", "truck", "ticket", "gift", "tag", "car", "taxi", "bus",
        "train", "plane", "bike", "fuel", "food", "coffee", "pizza", "heart",
        "health", "fitness", "steps", "leaf", "flame", "sun", "moon", "star",
        "sparkles", "bot", "brain", "rocket", "gamepad", "joystick", "trophy", "ghost",
        "cat", "dog", "palette", "brush", "book", "news", "school", "briefcase",
        "house", "idea", "smartphone", "keyboard", "grid", "code", "terminal", "cpu",
        "zap", "atom", "orbit", "gem", "crown", "smile", "swords", "dice",
        "todo", "activity", "gauge", "monitor", "cast", "wifi", "bluetooth", "volume",
        "thermometer", "umbrella", "satellite", "fingerprint", "vpn", "box", "tool", "sliders",
        "layers", "translate",
    };

    static int id(String name) {
        if (name == null) return 0;
        switch (name) {
            case "phone": return R.drawable.g_phone;
            case "chat": return R.drawable.g_chat;
            case "messages": return R.drawable.g_messages;
            case "chats": return R.drawable.g_chats;
            case "mail": return R.drawable.g_mail;
            case "send": return R.drawable.g_send;
            case "at": return R.drawable.g_at;
            case "video": return R.drawable.g_video;
            case "users": return R.drawable.g_users;
            case "contact": return R.drawable.g_contact;
            case "bell": return R.drawable.g_bell;
            case "globe": return R.drawable.g_globe;
            case "earth": return R.drawable.g_earth;
            case "play": return R.drawable.g_play;
            case "tv": return R.drawable.g_tv;
            case "film": return R.drawable.g_film;
            case "clapper": return R.drawable.g_clapper;
            case "popcorn": return R.drawable.g_popcorn;
            case "music": return R.drawable.g_music;
            case "headphones": return R.drawable.g_headphones;
            case "radio": return R.drawable.g_radio;
            case "mic": return R.drawable.g_mic;
            case "waves": return R.drawable.g_waves;
            case "disc": return R.drawable.g_disc;
            case "camera": return R.drawable.g_camera;
            case "aperture": return R.drawable.g_aperture;
            case "image": return R.drawable.g_image;
            case "images": return R.drawable.g_images;
            case "settings": return R.drawable.g_settings;
            case "clock": return R.drawable.g_clock;
            case "alarm": return R.drawable.g_alarm;
            case "timer": return R.drawable.g_timer;
            case "calendar": return R.drawable.g_calendar;
            case "calculator": return R.drawable.g_calculator;
            case "folder": return R.drawable.g_folder;
            case "file": return R.drawable.g_file;
            case "note": return R.drawable.g_note;
            case "notebook": return R.drawable.g_notebook;
            case "pen": return R.drawable.g_pen;
            case "search": return R.drawable.g_search;
            case "scan": return R.drawable.g_scan;
            case "qr": return R.drawable.g_qr;
            case "languages": return R.drawable.g_languages;
            case "compass": return R.drawable.g_compass;
            case "flashlight": return R.drawable.g_flashlight;
            case "map": return R.drawable.g_map;
            case "pin": return R.drawable.g_pin;
            case "navigation": return R.drawable.g_navigation;
            case "cloud": return R.drawable.g_cloud;
            case "weather": return R.drawable.g_weather;
            case "download": return R.drawable.g_download;
            case "drive": return R.drawable.g_drive;
            case "printer": return R.drawable.g_printer;
            case "key": return R.drawable.g_key;
            case "lock": return R.drawable.g_lock;
            case "shield": return R.drawable.g_shield;
            case "wallet": return R.drawable.g_wallet;
            case "card": return R.drawable.g_card;
            case "bank": return R.drawable.g_bank;
            case "piggy": return R.drawable.g_piggy;
            case "bitcoin": return R.drawable.g_bitcoin;
            case "bag": return R.drawable.g_bag;
            case "cart": return R.drawable.g_cart;
            case "store": return R.drawable.g_store;
            case "package": return R.drawable.g_package;
            case "truck": return R.drawable.g_truck;
            case "ticket": return R.drawable.g_ticket;
            case "gift": return R.drawable.g_gift;
            case "tag": return R.drawable.g_tag;
            case "car": return R.drawable.g_car;
            case "taxi": return R.drawable.g_taxi;
            case "bus": return R.drawable.g_bus;
            case "train": return R.drawable.g_train;
            case "plane": return R.drawable.g_plane;
            case "bike": return R.drawable.g_bike;
            case "fuel": return R.drawable.g_fuel;
            case "food": return R.drawable.g_food;
            case "coffee": return R.drawable.g_coffee;
            case "pizza": return R.drawable.g_pizza;
            case "heart": return R.drawable.g_heart;
            case "health": return R.drawable.g_health;
            case "fitness": return R.drawable.g_fitness;
            case "steps": return R.drawable.g_steps;
            case "leaf": return R.drawable.g_leaf;
            case "flame": return R.drawable.g_flame;
            case "sun": return R.drawable.g_sun;
            case "moon": return R.drawable.g_moon;
            case "star": return R.drawable.g_star;
            case "sparkles": return R.drawable.g_sparkles;
            case "bot": return R.drawable.g_bot;
            case "brain": return R.drawable.g_brain;
            case "rocket": return R.drawable.g_rocket;
            case "gamepad": return R.drawable.g_gamepad;
            case "joystick": return R.drawable.g_joystick;
            case "trophy": return R.drawable.g_trophy;
            case "ghost": return R.drawable.g_ghost;
            case "cat": return R.drawable.g_cat;
            case "dog": return R.drawable.g_dog;
            case "palette": return R.drawable.g_palette;
            case "brush": return R.drawable.g_brush;
            case "book": return R.drawable.g_book;
            case "news": return R.drawable.g_news;
            case "school": return R.drawable.g_school;
            case "briefcase": return R.drawable.g_briefcase;
            case "house": return R.drawable.g_house;
            case "idea": return R.drawable.g_idea;
            case "smartphone": return R.drawable.g_smartphone;
            case "keyboard": return R.drawable.g_keyboard;
            case "grid": return R.drawable.g_grid;
            case "code": return R.drawable.g_code;
            case "terminal": return R.drawable.g_terminal;
            case "cpu": return R.drawable.g_cpu;
            case "zap": return R.drawable.g_zap;
            case "atom": return R.drawable.g_atom;
            case "orbit": return R.drawable.g_orbit;
            case "gem": return R.drawable.g_gem;
            case "crown": return R.drawable.g_crown;
            case "smile": return R.drawable.g_smile;
            case "swords": return R.drawable.g_swords;
            case "dice": return R.drawable.g_dice;
            case "todo": return R.drawable.g_todo;
            case "activity": return R.drawable.g_activity;
            case "gauge": return R.drawable.g_gauge;
            case "monitor": return R.drawable.g_monitor;
            case "cast": return R.drawable.g_cast;
            case "wifi": return R.drawable.g_wifi;
            case "bluetooth": return R.drawable.g_bluetooth;
            case "volume": return R.drawable.g_volume;
            case "thermometer": return R.drawable.g_thermometer;
            case "umbrella": return R.drawable.g_umbrella;
            case "satellite": return R.drawable.g_satellite;
            case "fingerprint": return R.drawable.g_fingerprint;
            case "vpn": return R.drawable.g_vpn;
            case "box": return R.drawable.g_box;
            case "tool": return R.drawable.g_tool;
            case "sliders": return R.drawable.g_sliders;
            case "layers": return R.drawable.g_layers;
            case "translate": return R.drawable.g_translate;
            case "x": return R.drawable.g_x;
            case "plus": return R.drawable.g_plus;
            case "check": return R.drawable.g_check;
            case "up": return R.drawable.g_up;
            case "down": return R.drawable.g_down;
            case "left": return R.drawable.g_left;
            case "right": return R.drawable.g_right;
            case "trash": return R.drawable.g_trash;
            case "eye_off": return R.drawable.g_eye_off;
            case "eye": return R.drawable.g_eye;
            case "info": return R.drawable.g_info;
            case "rename": return R.drawable.g_rename;
            case "arrow_up": return R.drawable.g_arrow_up;
            case "arrow_down": return R.drawable.g_arrow_down;
            case "refresh": return R.drawable.g_refresh;
            case "more": return R.drawable.g_more;
            case "reset": return R.drawable.g_reset;
            case "add": return R.drawable.g_add;
            case "edit": return R.drawable.g_edit;
            case "app": return R.drawable.g_app;
            case "external": return R.drawable.g_external;
            case "battery": return R.drawable.g_battery;
            case "battery_charging": return R.drawable.g_battery_charging;
            case "battery_full": return R.drawable.g_battery_full;
            case "battery_medium": return R.drawable.g_battery_medium;
            case "battery_low": return R.drawable.g_battery_low;
            case "flashlight_off": return R.drawable.g_flashlight_off;
            case "brightness": return R.drawable.g_brightness;
            case "memory": return R.drawable.g_memory;
            case "bell_off": return R.drawable.g_bell_off;
            case "wallpaper": return R.drawable.g_wallpaper;
            case "cloud_moon": return R.drawable.g_cloud_moon;
            case "cloudy": return R.drawable.g_cloudy;
            case "fog": return R.drawable.g_fog;
            case "drizzle": return R.drawable.g_drizzle;
            case "rain": return R.drawable.g_rain;
            case "snow": return R.drawable.g_snow;
            case "storm": return R.drawable.g_storm;
            case "hail": return R.drawable.g_hail;
            case "wind": return R.drawable.g_wind;
            case "droplets": return R.drawable.g_droplets;
            case "home_star": return R.drawable.g_home_star;
            case "dock": return R.drawable.g_dock;
            case "widget": return R.drawable.g_widget;
            case "move": return R.drawable.g_move;
            case "shapes": return R.drawable.g_shapes;
            case "power": return R.drawable.g_power;
            case "hourglass": return R.drawable.g_hourglass;
            default: return 0;
        }
    }
}

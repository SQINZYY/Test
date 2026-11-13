package de.diashowstudio.app;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.OpenableColumns;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Liest ein Bild speichersparend ein (auch HEIC und sehr große Fotos), dreht es laut EXIF richtig,
 * verkleinert es auf höchstens MAX Pixel Kantenlänge und legt es samt Vorschaubild im Cache ab.
 */
final class ImageImport {

    static final int MAX = 2400;
    static final int THUMB = 400;

    private ImageImport() {
    }

    static JSONObject run(Context ctx, Uri uri, File dir, String base) throws Exception {
        ContentResolver cr = ctx.getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) throw new IOException("Datei nicht lesbar");
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("Kein unterstütztes Bildformat");

        int orientation = ExifInterface.ORIENTATION_NORMAL;
        long taken = 0;
        try (InputStream in = cr.openInputStream(uri)) {
            if (in != null) {
                ExifInterface exif = new ExifInterface(in);
                orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                String dt = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                if (dt == null) dt = exif.getAttribute(ExifInterface.TAG_DATETIME);
                if (dt != null) {
                    Date d = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).parse(dt);
                    if (d != null) taken = d.getTime();
                }
            }
        } catch (Exception ignored) {
            // Kein EXIF (z. B. PNG) – egal
        }

        int sample = 1;
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        while (longest / (sample * 2) >= MAX) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bmp;
        try (InputStream in = cr.openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, opts);
        } catch (OutOfMemoryError e) {
            opts.inSampleSize = sample * 2;
            try (InputStream in = cr.openInputStream(uri)) {
                bmp = BitmapFactory.decodeStream(in, null, opts);
            }
        }
        if (bmp == null) throw new IOException("Bild konnte nicht gelesen werden");

        float scale = Math.min(1f, (float) MAX / Math.max(bmp.getWidth(), bmp.getHeight()));
        Matrix m = new Matrix();
        m.postScale(scale, scale);
        applyOrientation(m, orientation);
        Bitmap full = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
        if (full != bmp) bmp.recycle();

        boolean alpha = full.hasAlpha() && hasTransparency(full);
        String ext = alpha ? ".png" : ".jpg";
        File fullFile = new File(dir, base + ext);
        write(full, fullFile, alpha);

        float ts = Math.min(1f, (float) THUMB / Math.max(full.getWidth(), full.getHeight()));
        int tw = Math.max(1, Math.round(full.getWidth() * ts));
        int th = Math.max(1, Math.round(full.getHeight() * ts));
        Bitmap thumb = Bitmap.createScaledBitmap(full, tw, th, true);
        File thumbFile = new File(dir, base + "_t" + ext);
        write(thumb, thumbFile, alpha);

        JSONObject o = new JSONObject();
        o.put("url", "/import/" + fullFile.getName());
        o.put("thumb", "/import/" + thumbFile.getName());
        o.put("w", full.getWidth());
        o.put("h", full.getHeight());
        o.put("date", taken);
        o.put("name", displayName(cr, uri));
        if (thumb != full) thumb.recycle();
        full.recycle();
        return o;
    }

    private static void write(Bitmap bmp, File f, boolean png) throws IOException {
        Bitmap src = bmp;
        if (!png && bmp.hasAlpha()) {
            // JPEG kennt keine Transparenz: auf Weiß legen statt Schwarz
            src = Bitmap.createBitmap(bmp.getWidth(), bmp.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(src);
            c.drawColor(Color.WHITE);
            c.drawBitmap(bmp, 0, 0, null);
        }
        try (OutputStream out = new FileOutputStream(f)) {
            if (!src.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 90, out)) {
                throw new IOException("Speichern fehlgeschlagen");
            }
        } finally {
            if (src != bmp) src.recycle();
        }
    }

    /** Prüft stichprobenartig, ob das Bild wirklich durchsichtige Stellen hat. */
    private static boolean hasTransparency(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight();
        int step = Math.max(1, Math.min(w, h) / 64);
        for (int y = 0; y < h; y += step) {
            for (int x = 0; x < w; x += step) {
                if (Color.alpha(b.getPixel(x, y)) < 250) return true;
            }
        }
        return Color.alpha(b.getPixel(w - 1, h - 1)) < 250;
    }

    private static void applyOrientation(Matrix m, int orientation) {
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                m.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                m.postRotate(180);
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                m.postScale(1, -1);
                break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                m.postRotate(90);
                m.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_ROTATE_90:
                m.postRotate(90);
                break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                m.postRotate(-90);
                m.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                m.postRotate(-90);
                break;
            default:
                break;
        }
    }

    private static String displayName(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last == null ? "Bild" : last;
    }
}

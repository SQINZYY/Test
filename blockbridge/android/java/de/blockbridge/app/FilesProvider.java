package de.blockbridge.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/**
 * Gibt fertige Dateien (z. B. .mcpack) an Minecraft oder andere Apps weiter.
 * Adresse: content://de.blockbridge.app.files/<id>/<dateiname> -> cache/out/<id>/<dateiname>
 */
public class FilesProvider extends ContentProvider {

    public static final String AUTHORITY = "de.blockbridge.app.files";
    public static final String DIR = "out";

    public static Uri uriFor(String id, String name) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(id).appendPath(name).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        List<String> seg = uri.getPathSegments();
        if (seg.size() != 2) throw new FileNotFoundException();
        for (String s : seg) {
            if (s.contains("/") || s.contains("..")) throw new FileNotFoundException();
        }
        File f = new File(new File(new File(getContext().getCacheDir(), DIR), seg.get(0)), seg.get(1));
        if (!f.isFile()) throw new FileNotFoundException();
        return f;
    }

    public static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f;
        try {
            f = fileFor(uri);
        } catch (FileNotFoundException e) {
            return null;
        }
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return mimeOf(uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment());
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}

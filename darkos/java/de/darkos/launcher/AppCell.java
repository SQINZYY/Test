package de.darkos.launcher;

import android.content.Context;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Ein App-Icon mit Namen darunter (Startbildschirm, Dock, App-Menü). */
final class AppCell extends LinearLayout {
    final ImageView icon;
    final TextView label;
    Apps.App app;

    AppCell(Context c, int iconPx, boolean showLabel) {
        super(c);
        setOrientation(VERTICAL);
        setGravity(Gravity.CENTER_HORIZONTAL);
        setPadding(0, Ui.dp(4), 0, Ui.dp(4));
        icon = new ImageView(c);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        addView(icon, new LayoutParams(iconPx, iconPx));
        label = Ui.text(c, "", 12, 0xFFE9E7F2);
        label.setTypeface(Ui.sans("sans-serif-medium"));
        label.setGravity(Gravity.CENTER);
        label.setShadowLayer(Ui.dp(4), 0, Ui.dp(1), 0xCC000000);
        Ui.singleLine(label);
        LayoutParams lp = new LayoutParams(-1, -2);
        lp.topMargin = Ui.dp(2);
        lp.leftMargin = lp.rightMargin = Ui.dp(4);
        addView(label, lp);
        label.setVisibility(showLabel ? VISIBLE : GONE);
        setClickable(true);
        setLongClickable(true);
        setHapticFeedbackEnabled(true);
        Ui.pressEffect(this);
    }

    void bind(Apps.App a, Icons icons) {
        app = a;
        label.setText(a.label);
        setContentDescription(a.label);
        icons.load(a, icon);
    }
}

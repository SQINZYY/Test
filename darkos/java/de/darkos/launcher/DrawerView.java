package de.darkos.launcher;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.animation.AlphaAnimation;
import android.view.animation.AnimationSet;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.GridLayoutAnimationController;
import android.view.animation.ScaleAnimation;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Das App-Menü: Suche, häufig genutzte Apps, alle Apps alphabetisch und eine Buchstabenleiste. */
final class DrawerView extends FrameLayout {
    interface Host {
        Icons icons();

        void launch(Apps.App app, View from);

        void showAppMenu(Apps.App app, View from);

        void openSettings();

        void webSearch(String query);

        void storeSearch(String query);

        void onDrawerProgress(float progress);
    }

    private final Host host;
    private final int accent;
    private final EditText search;
    private final ImageView clear;
    private final LinearLayout frequentBlock;
    private final LinearLayout frequentRow;
    private final TextView countLabel;
    private final GridView grid;
    private final AlphabetBar alphabet;
    private final TextView bubble;
    private final LinearLayout empty;
    private final TextView emptyText;
    private final LinearLayout content;
    private final Adapter adapter = new Adapter();
    private final int touchSlop;

    private List<Apps.App> apps = new ArrayList<>();
    private List<Apps.App> shown = new ArrayList<>();
    private List<Apps.App> frequent = new ArrayList<>();
    private String query = "";
    private float progress;
    private ValueAnimator anim;
    private boolean dragging;
    private float downX, downY;
    private VelocityTracker velocity;
    private boolean labels;
    private int columns;

    DrawerView(Context c, Host host) {
        super(c);
        this.host = host;
        Prefs prefs = Prefs.get(c);
        accent = prefs.accent();
        labels = prefs.labels();
        columns = prefs.drawerColumns();
        touchSlop = ViewConfiguration.get(c).getScaledTouchSlop();
        setClickable(true);

        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] {0xF0050409, 0xF7020203});
        setBackground(bg);

        content = Ui.column(c);
        addView(content, new LayoutParams(-1, -1));

        // Kopfzeile: Suchfeld + Einstellungen
        LinearLayout header = Ui.row(c);
        header.setPadding(Ui.dp(16), Ui.dp(10), Ui.dp(12), Ui.dp(6));
        LinearLayout box = Ui.row(c);
        box.setBackground(Ui.glass(accent, 22));
        box.setPadding(Ui.dp(14), 0, Ui.dp(6), 0);
        box.addView(Ui.glyphView(c, "search", Ui.alpha(accent, 0.9f), 20));
        search = new EditText(c);
        search.setHint("Apps durchsuchen");
        search.setHintTextColor(Ui.TEXT3);
        search.setTextColor(Ui.TEXT);
        search.setTextSize(16);
        search.setSingleLine(true);
        search.setBackground(null);
        search.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        search.setImeOptions(EditorInfo.IME_ACTION_GO);
        search.setPadding(Ui.dp(10), Ui.dp(13), Ui.dp(4), Ui.dp(13));
        box.addView(search, Ui.lp(0, -2, 1));
        clear = new ImageView(c);
        clear.setImageDrawable(Ui.glyph(c, "x", Ui.TEXT2));
        clear.setPadding(Ui.dp(9), Ui.dp(9), Ui.dp(9), Ui.dp(9));
        clear.setVisibility(GONE);
        clear.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                search.setText("");
            }
        });
        box.addView(clear, Ui.lp(Ui.dp(38), Ui.dp(38)));
        header.addView(box, Ui.lp(0, -2, 1));
        ImageView settings = new ImageView(c);
        settings.setImageDrawable(Ui.glyph(c, "settings", Ui.TEXT2));
        settings.setPadding(Ui.dp(12), Ui.dp(12), Ui.dp(12), Ui.dp(12));
        settings.setBackground(Ui.ripple(accent, null, 22));
        settings.setContentDescription("DarkOS Einstellungen");
        settings.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                DrawerView.this.host.openSettings();
            }
        });
        header.addView(settings, Ui.margins(Ui.lp(Ui.dp(46), Ui.dp(46)), 6, 0, 0, 0));
        content.addView(header, Ui.lp(-1, -2));

        // Häufig genutzt
        frequentBlock = Ui.column(c);
        frequentBlock.setPadding(Ui.dp(16), Ui.dp(10), Ui.dp(16), 0);
        frequentBlock.addView(Ui.label(c, "Häufig genutzt"), Ui.margins(Ui.lp(-2, -2), 4, 0, 0, 6));
        frequentRow = Ui.row(c);
        frequentRow.setPadding(0, Ui.dp(6), 0, Ui.dp(6));
        frequentRow.setBackground(Ui.glass(accent, 22));
        frequentBlock.addView(frequentRow, Ui.lp(-1, -2));
        content.addView(frequentBlock, Ui.lp(-1, -2));

        countLabel = Ui.label(c, "Alle Apps");
        content.addView(countLabel, Ui.margins(Ui.lp(-2, -2), 20, 16, 0, 4));

        FrameLayout gridFrame = new FrameLayout(c);
        grid = new GridView(c);
        grid.setNumColumns(columns);
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setVerticalSpacing(Ui.dp(8));
        grid.setSelector(new android.graphics.drawable.ColorDrawable(0));
        grid.setClipToPadding(false);
        grid.setPadding(Ui.dp(8), Ui.dp(4), Ui.dp(26), Ui.dp(24));
        grid.setVerticalScrollBarEnabled(false);
        grid.setOverScrollMode(OVER_SCROLL_NEVER);
        grid.setVerticalFadingEdgeEnabled(true);
        grid.setFadingEdgeLength(Ui.dp(24));
        grid.setAdapter(adapter);
        grid.setOnScrollListener(new AbsListView.OnScrollListener() {
            @Override
            public void onScrollStateChanged(AbsListView view, int state) {
                if (state == SCROLL_STATE_TOUCH_SCROLL) hideKeyboard();
            }

            @Override
            public void onScroll(AbsListView view, int first, int visible, int total) {
            }
        });
        AnimationSet set = new AnimationSet(true);
        AlphaAnimation fade = new AlphaAnimation(0f, 1f);
        ScaleAnimation scale = new ScaleAnimation(0.7f, 1f, 0.7f, 1f,
            ScaleAnimation.RELATIVE_TO_SELF, 0.5f, ScaleAnimation.RELATIVE_TO_SELF, 0.5f);
        set.addAnimation(fade);
        set.addAnimation(scale);
        set.setDuration(260);
        set.setInterpolator(new DecelerateInterpolator(1.8f));
        GridLayoutAnimationController lac = new GridLayoutAnimationController(set, 0.08f, 0.12f);
        lac.setDirection(GridLayoutAnimationController.DIRECTION_TOP_TO_BOTTOM | GridLayoutAnimationController.DIRECTION_LEFT_TO_RIGHT);
        grid.setLayoutAnimation(lac);
        gridFrame.addView(grid, new LayoutParams(-1, -1));

        alphabet = new AlphabetBar(c);
        LayoutParams ap = new LayoutParams(Ui.dp(26), -1, Gravity.END);
        ap.topMargin = Ui.dp(8);
        ap.bottomMargin = Ui.dp(24);
        gridFrame.addView(alphabet, ap);

        bubble = Ui.title(c, "A", 30);
        bubble.setTextColor(Ui.TEXT);
        bubble.setGravity(Gravity.CENTER);
        bubble.setBackground(Ui.rounded(Ui.mix(Ui.SURFACE_SOLID, accent, 0.25f), 20, accent, 1.5f));
        Ui.glow(bubble, accent, 10);
        bubble.setVisibility(GONE);
        gridFrame.addView(bubble, new LayoutParams(Ui.dp(64), Ui.dp(64), Gravity.END | Gravity.TOP));

        empty = Ui.column(c);
        empty.setGravity(Gravity.CENTER_HORIZONTAL);
        empty.setPadding(Ui.dp(28), Ui.dp(40), Ui.dp(28), 0);
        empty.addView(Ui.glyphView(c, "search", Ui.alpha(accent, 0.8f), 40));
        emptyText = Ui.text(c, "", 15, Ui.TEXT2);
        emptyText.setGravity(Gravity.CENTER);
        empty.addView(emptyText, Ui.margins(Ui.lp(-2, -2), 0, 14, 0, 20));
        TextView web = Ui.button(c, "Im Web suchen", accent, true);
        web.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                DrawerView.this.host.webSearch(query);
            }
        });
        empty.addView(web, Ui.lp(-1, -2));
        TextView store = Ui.button(c, "Im Play Store suchen", accent, false);
        store.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                DrawerView.this.host.storeSearch(query);
            }
        });
        empty.addView(store, Ui.margins(Ui.lp(-1, -2), 0, 10, 0, 0));
        empty.setVisibility(GONE);
        gridFrame.addView(empty, new LayoutParams(-1, -2));

        content.addView(gridFrame, Ui.lp(-1, 0, 1));

        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                query = s.toString().trim();
                clear.setVisibility(query.isEmpty() ? GONE : VISIBLE);
                refresh();
            }
        });
        search.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                if (!shown.isEmpty()) DrawerView.this.host.launch(shown.get(0), grid.getChildCount() > 0 ? grid.getChildAt(0) : search);
                else if (!query.isEmpty()) DrawerView.this.host.webSearch(query);
                return true;
            }
        });

        setVisibility(INVISIBLE);
    }

    void setInsets(int top, int bottom) {
        content.setPadding(0, top, 0, 0);
        grid.setPadding(Ui.dp(8), Ui.dp(4), Ui.dp(26), Ui.dp(24) + bottom);
        ((LayoutParams) alphabet.getLayoutParams()).bottomMargin = Ui.dp(24) + bottom;
        alphabet.requestLayout();
    }

    void setApps(List<Apps.App> visible, List<Apps.App> freq) {
        apps = visible;
        frequent = freq;
        refresh();
    }

    void restyle() {
        Prefs p = Prefs.get(getContext());
        labels = p.labels();
        if (columns != p.drawerColumns()) {
            columns = p.drawerColumns();
            grid.setNumColumns(columns);
        }
        refresh();
    }

    private int iconPx() {
        return Ui.dp(columns >= 5 ? 50 : 58);
    }

    private void refresh() {
        boolean searching = !query.isEmpty();
        if (searching) {
            shown = filter(apps, query);
        } else {
            shown = apps;
        }
        frequentBlock.setVisibility(!searching && !frequent.isEmpty() ? VISIBLE : GONE);
        frequentRow.removeAllViews();
        for (Apps.App a : frequent) {
            AppCell cell = makeCell(Ui.dp(50));
            cell.bind(a, host.icons());
            frequentRow.addView(cell, Ui.lp(0, -2, 1));
        }
        for (int i = frequent.size(); i < 5 && !frequent.isEmpty(); i++) frequentRow.addView(new View(getContext()), Ui.lp(0, 1, 1));
        countLabel.setText(searching ? shown.size() + " Treffer" : "Alle Apps · " + apps.size());
        alphabet.setVisibility(searching ? GONE : VISIBLE);
        alphabet.setSections(shown);
        empty.setVisibility(searching && shown.isEmpty() ? VISIBLE : GONE);
        emptyText.setText("Keine App für „" + query + "“ gefunden.");
        adapter.notifyDataSetChanged();
    }

    /** Treffer zuerst am Anfang des Namens, dann am Wortanfang, dann irgendwo. */
    static List<Apps.App> filter(List<Apps.App> list, String q) {
        String n = Apps.normalize(q);
        List<Apps.App> start = new ArrayList<>(), word = new ArrayList<>(), any = new ArrayList<>();
        for (Apps.App a : list) {
            String l = a.normalized;
            if (l.startsWith(n)) start.add(a);
            else if (l.contains(" " + n) || l.contains("-" + n)) word.add(a);
            else if (l.contains(n) || initials(l).startsWith(n)) any.add(a);
        }
        start.addAll(word);
        start.addAll(any);
        return start;
    }

    private static String initials(String l) {
        StringBuilder b = new StringBuilder();
        for (String w : l.split("[^a-z0-9]+")) if (!w.isEmpty()) b.append(w.charAt(0));
        return b.toString();
    }

    private AppCell makeCell(int iconPx) {
        final AppCell cell = new AppCell(getContext(), iconPx, labels);
        cell.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                if (cell.app != null) host.launch(cell.app, cell.icon);
            }
        });
        cell.setOnLongClickListener(new OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                if (cell.app == null) return false;
                v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                hideKeyboard();
                host.showAppMenu(cell.app, cell.icon);
                return true;
            }
        });
        return cell;
    }

    // --- Öffnen / Schließen ---

    boolean isOpen() {
        return getVisibility() == VISIBLE && progress > 0.5f;
    }

    float progress() {
        return progress;
    }

    void setProgress(float p) {
        boolean wasHidden = progress <= 0f;
        progress = Math.max(0f, Math.min(1f, p));
        int h = getHeight() > 0 ? getHeight() : getResources().getDisplayMetrics().heightPixels;
        setTranslationY((1f - progress) * h * 0.92f);
        setAlpha(Math.min(1f, 0.25f + progress * 1.2f));
        if (progress > 0f && getVisibility() != VISIBLE) setVisibility(VISIBLE);
        if (wasHidden && progress > 0f && Ui.animationsEnabled(getContext())) grid.scheduleLayoutAnimation();
        if (progress <= 0f) setVisibility(INVISIBLE);
        host.onDrawerProgress(progress);
    }

    void animateTo(final float target, float velocity) {
        if (anim != null) anim.cancel();
        if (!Ui.animationsEnabled(getContext())) {
            setProgress(target);
            onSettled(target);
            return;
        }
        anim = ValueAnimator.ofFloat(progress, target);
        long dur = (long) (180 + 200 * Math.abs(target - progress));
        if (Math.abs(velocity) > Ui.dp(1500)) dur = (long) (dur * 0.7f);
        anim.setDuration(dur);
        anim.setInterpolator(new DecelerateInterpolator(1.8f));
        anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator a) {
                setProgress((Float) a.getAnimatedValue());
            }
        });
        anim.addListener(new AnimatorListenerAdapter() {
            private boolean cancelled;

            @Override
            public void onAnimationCancel(Animator animation) {
                cancelled = true;
            }

            @Override
            public void onAnimationEnd(Animator animation) {
                anim = null;
                if (!cancelled) onSettled(target);
            }
        });
        anim.start();
    }

    private void onSettled(float target) {
        if (target <= 0f) reset();
    }

    void open() {
        animateTo(1f, 0);
    }

    void close(boolean animated) {
        hideKeyboard();
        if (animated) {
            animateTo(0f, 0);
        } else {
            if (anim != null) anim.cancel();
            setProgress(0f);
            reset();
        }
    }

    /** Suche leeren und nach oben scrollen. */
    void reset() {
        if (!query.isEmpty()) search.setText("");
        search.clearFocus();
        grid.setSelection(0);
    }

    void focusSearch() {
        search.requestFocus();
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(search, InputMethodManager.SHOW_IMPLICIT);
    }

    void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(getWindowToken(), 0);
        search.clearFocus();
    }

    // --- Zum Schließen nach unten ziehen ---

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = e.getX();
                downY = e.getY();
                dragging = false;
                startVelocity(e);
                break;
            case MotionEvent.ACTION_MOVE:
                addVelocity(e);
                float dy = e.getY() - downY, dx = e.getX() - downX;
                if (dy > touchSlop && dy > Math.abs(dx) * 1.3f && !grid.canScrollVertically(-1)) {
                    dragging = true;
                    downY = e.getY();
                    hideKeyboard();
                    return true;
                }
                break;
            default:
                break;
        }
        return false;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!dragging) {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                downX = e.getX();
                downY = e.getY();
                startVelocity(e);
            } else if (e.getActionMasked() == MotionEvent.ACTION_MOVE) {
                addVelocity(e);
                float dy = e.getY() - downY;
                if (dy > touchSlop && dy > Math.abs(e.getX() - downX)) {
                    dragging = true;
                    downY = e.getY();
                }
            }
            return true;
        }
        addVelocity(e);
        float dy = Math.max(0f, e.getY() - downY);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                if (anim != null) anim.cancel();
                setProgress(1f - dy / Math.max(1f, getHeight() * 0.92f));
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                float vy = 0;
                if (velocity != null) {
                    velocity.computeCurrentVelocity(1000);
                    vy = velocity.getYVelocity();
                }
                dragging = false;
                if (vy > Ui.dp(800) || (progress < 0.72f && vy > -Ui.dp(300))) close(true);
                else animateTo(1f, vy);
                return true;
            default:
                return true;
        }
    }

    private void startVelocity(MotionEvent e) {
        if (velocity == null) velocity = VelocityTracker.obtain();
        velocity.clear();
        addVelocity(e);
    }

    private void addVelocity(MotionEvent e) {
        if (velocity == null) return;
        MotionEvent copy = MotionEvent.obtain(e);
        copy.setLocation(e.getRawX(), e.getRawY());
        velocity.addMovement(copy);
        copy.recycle();
    }

    // --- Raster ---

    private final class Adapter extends BaseAdapter {
        @Override
        public int getCount() {
            return shown.size();
        }

        @Override
        public Object getItem(int position) {
            return shown.get(position);
        }

        @Override
        public long getItemId(int position) {
            return shown.get(position).key.hashCode();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }

        @Override
        public View getView(int position, View convert, ViewGroup parent) {
            AppCell cell = convert instanceof AppCell ? (AppCell) convert : null;
            int iconPx = iconPx();
            if (cell == null || cell.icon.getLayoutParams().width != iconPx) cell = makeCell(iconPx);
            cell.label.setVisibility(labels ? VISIBLE : GONE);
            cell.bind(shown.get(position), host.icons());
            return cell;
        }
    }

    /** Buchstabenleiste rechts: antippen oder ziehen springt zum Buchstaben. */
    private final class AlphabetBar extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final List<Character> letters = new ArrayList<>();
        private final List<Integer> positions = new ArrayList<>();
        private int active = -1;

        AlphabetBar(Context c) {
            super(c);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(Ui.display(c, true));
            paint.setTextSize(Ui.dp(9.5f));
        }

        void setSections(List<Apps.App> list) {
            letters.clear();
            positions.clear();
            char last = 0;
            for (int i = 0; i < list.size(); i++) {
                char s = list.get(i).section;
                if (s != last) {
                    letters.add(s);
                    positions.add(i);
                    last = s;
                }
            }
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            int n = letters.size();
            if (n == 0) return;
            float step = Math.min(Ui.dp(18), getHeight() / (float) n);
            float top = (getHeight() - step * n) / 2f;
            for (int i = 0; i < n; i++) {
                boolean on = i == active;
                paint.setColor(on ? accent : Ui.TEXT3);
                if (on) paint.setShadowLayer(Ui.dp(6), 0, 0, accent);
                else paint.clearShadowLayer();
                c.drawText(String.valueOf(letters.get(i)), getWidth() / 2f, top + step * i + step * 0.7f, paint);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            int n = letters.size();
            if (n == 0) return false;
            getParent().requestDisallowInterceptTouchEvent(true);
            float step = Math.min(Ui.dp(18), getHeight() / (float) n);
            float top = (getHeight() - step * n) / 2f;
            int idx = Math.max(0, Math.min(n - 1, (int) ((e.getY() - top) / step)));
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                case MotionEvent.ACTION_MOVE:
                    if (idx != active) {
                        active = idx;
                        grid.setSelection(positions.get(idx));
                        performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK);
                        invalidate();
                    }
                    bubble.setText(String.valueOf(letters.get(idx)));
                    bubble.setVisibility(VISIBLE);
                    bubble.setTranslationX(-Ui.dp(40));
                    bubble.setTranslationY(Math.max(0, getTop() + top + step * idx - Ui.dp(26)));
                    return true;
                default:
                    active = -1;
                    bubble.setVisibility(GONE);
                    invalidate();
                    return true;
            }
        }
    }
}

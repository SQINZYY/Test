package de.darkos.launcher;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;

/**
 * Zwei Seiten nebeneinander (Widgets | Start). Waagerecht wischen wechselt die Seite,
 * auf der Startseite öffnet Hochwischen das App-Menü und Runterwischen die Benachrichtigungen.
 */
final class PagerLayout extends ViewGroup {
    interface Listener {
        void onPageOffset(float position);

        void onPageSelected(int page);

        void onDrawerDrag(float dy);

        void onDrawerRelease(float velocityY, boolean cancelled);

        void onSwipeDown();

        void onEmptyLongPress();
    }

    static final int PAGE_WIDGETS = 0, PAGE_HOME = 1;

    private static final int NONE = 0, HORIZONTAL = 1, UP = 2, DOWN = 3;

    private final int touchSlop;
    private final int minFling;
    private Listener listener;
    private int page = PAGE_HOME;
    private int mode = NONE;
    private float downX, downY, lastX;
    private VelocityTracker velocity;
    private ValueAnimator scroller;
    private boolean longPressPending, longPressFired;
    private final Runnable longPress = new Runnable() {
        @Override
        public void run() {
            longPressPending = false;
            if (mode == NONE && listener != null) {
                longPressFired = true;
                performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                listener.onEmptyLongPress();
            }
        }
    };

    PagerLayout(Context c) {
        super(c);
        ViewConfiguration vc = ViewConfiguration.get(c);
        touchSlop = vc.getScaledTouchSlop();
        minFling = Math.max(vc.getScaledMinimumFlingVelocity() * 4, Ui.dp(400));
    }

    void setListener(Listener l) {
        listener = l;
    }

    int page() {
        return page;
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        int w = MeasureSpec.getSize(wSpec), h = MeasureSpec.getSize(hSpec);
        for (int i = 0; i < getChildCount(); i++) {
            getChildAt(i).measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY));
        }
        setMeasuredDimension(w, h);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int w = r - l;
        for (int i = 0; i < getChildCount(); i++) getChildAt(i).layout(i * w, 0, (i + 1) * w, b - t);
        if (changed && (scroller == null || !scroller.isRunning())) scrollTo(page * w, 0);
    }

    @Override
    public void scrollTo(int x, int y) {
        super.scrollTo(x, y);
        if (listener != null && getWidth() > 0) listener.onPageOffset(x / (float) getWidth());
    }

    void setPage(int p, boolean animated) {
        p = Math.max(0, Math.min(getChildCount() - 1, p));
        boolean changed = p != page;
        page = p;
        int target = p * getWidth();
        if (scroller != null) scroller.cancel();
        if (!animated || getWidth() == 0) {
            scrollTo(target, 0);
        } else {
            scroller = ValueAnimator.ofInt(getScrollX(), target);
            scroller.setDuration(300);
            scroller.setInterpolator(new DecelerateInterpolator(2f));
            scroller.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                @Override
                public void onAnimationUpdate(ValueAnimator a) {
                    scrollTo((Integer) a.getAnimatedValue(), 0);
                }
            });
            scroller.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    scroller = null;
                }
            });
            scroller.start();
        }
        if (changed && listener != null) listener.onPageSelected(p);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        trackVelocity(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = lastX = e.getX();
                downY = e.getY();
                mode = NONE;
                longPressFired = false;
                if (scroller != null && scroller.isRunning()) {
                    scroller.cancel();
                    mode = HORIZONTAL;
                    return true;
                }
                return false;
            case MotionEvent.ACTION_MOVE:
                if (mode == NONE) decide(e);
                return mode != NONE;
            default:
                return mode != NONE;
        }
    }

    private void decide(MotionEvent e) {
        if (longPressFired) return;
        float dx = e.getX() - downX, dy = e.getY() - downY;
        float adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx > touchSlop && adx > ady * 1.2f) {
            mode = HORIZONTAL;
            lastX = e.getX();
        } else if (ady > touchSlop && ady > adx && page == PAGE_HOME) {
            mode = dy < 0 ? UP : DOWN;
        }
        if (mode != NONE) {
            cancelLongPress();
            getParent().requestDisallowInterceptTouchEvent(true);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        trackVelocity(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                // Niemand darunter wollte die Berührung: leerer Bereich
                downX = lastX = e.getX();
                downY = e.getY();
                mode = NONE;
                longPressFired = false;
                longPressPending = true;
                postDelayed(longPress, ViewConfiguration.getLongPressTimeout());
                return true;
            case MotionEvent.ACTION_MOVE:
                if (mode == NONE) decide(e);
                if (mode == HORIZONTAL) {
                    float dx = lastX - e.getX();
                    lastX = e.getX();
                    int max = (getChildCount() - 1) * getWidth();
                    float x = getScrollX() + dx;
                    // Am Rand nur noch gedämpft weiterziehen
                    if (x < 0 || x > max) x = getScrollX() + dx * 0.3f;
                    scrollTo(Math.round(x), 0);
                } else if (mode == UP && listener != null) {
                    listener.onDrawerDrag(Math.min(0f, e.getY() - downY));
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                cancelLongPress();
                boolean cancel = e.getActionMasked() == MotionEvent.ACTION_CANCEL;
                float vx = 0, vy = 0;
                if (velocity != null) {
                    velocity.computeCurrentVelocity(1000);
                    vx = velocity.getXVelocity();
                    vy = velocity.getYVelocity();
                }
                if (mode == HORIZONTAL) {
                    int target;
                    if (Math.abs(vx) > minFling) target = vx < 0 ? page + 1 : page - 1;
                    else target = Math.round(getScrollX() / (float) Math.max(1, getWidth()));
                    setPage(target, true);
                } else if (mode == UP && listener != null) {
                    listener.onDrawerRelease(vy, cancel);
                } else if (mode == DOWN && listener != null && !cancel) {
                    if (e.getY() - downY > Ui.dp(60) || vy > minFling) listener.onSwipeDown();
                }
                mode = NONE;
                if (velocity != null) {
                    velocity.recycle();
                    velocity = null;
                }
                return true;
            default:
                return true;
        }
    }

    private void trackVelocity(MotionEvent e) {
        if (velocity == null) velocity = VelocityTracker.obtain();
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) velocity.clear();
        // Rohe Bildschirmkoordinaten, damit das Verschieben der Seite die Messung nicht verfälscht
        MotionEvent copy = MotionEvent.obtain(e);
        copy.setLocation(e.getRawX(), e.getRawY());
        velocity.addMovement(copy);
        copy.recycle();
    }

    @Override
    public void cancelLongPress() {
        super.cancelLongPress();
        if (longPressPending) {
            removeCallbacks(longPress);
            longPressPending = false;
        }
    }

    @Override
    public boolean shouldDelayChildPressedState() {
        return true;
    }

    /** Für Kinder, die selbst lange Drücken wollen (z. B. Android-Widgets). */
    static boolean isInside(View v, float rawX, float rawY) {
        int[] loc = new int[2];
        v.getLocationOnScreen(loc);
        return rawX >= loc[0] && rawX < loc[0] + v.getWidth() && rawY >= loc[1] && rawY < loc[1] + v.getHeight();
    }
}

package de.darkos.launcher;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Läuft der Launcher auch auf älteren Android-Versionen (ohne APIs ab 29+)? */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 26, qualifiers = "w360dp-h640dp-xhdpi")
public class LegacySdkTest {
    @Test
    public void launcherAndSettingsOnAndroid8() throws Exception {
        TestSupport.resetStatics();
        Context c = RuntimeEnvironment.getApplication();
        TestSupport.installApps(c);
        TestSupport.stickyBattery(c);
        TestSupport.weatherCache(c);
        final LauncherActivity a = Robolectric.buildActivity(LauncherActivity.class).setup().get();
        TestSupport.waitFor(() -> !a.apps.all.isEmpty(), 10000);
        TestSupport.settle(800);
        Sheet.dismissCurrent();
        a.openDrawer();
        TestSupport.idle(800);
        assertTrue(a.drawer.isOpen());
        a.menus.appMenu(a.apps.forPackage("com.whatsapp"), null, "drawer");
        TestSupport.idle(500);
        Sheet.dismissCurrent();
        a.drawer.close(false);
        a.showWidgetsPage(null);
        TestSupport.idle(600);
        a.onBackPressed();
        TestSupport.idle(600);
        assertEquals(PagerLayout.PAGE_HOME, a.pager.page());
        Robolectric.buildActivity(SettingsActivity.class).setup();
        TestSupport.settle(600);
    }
}

package app.knowra.android;

import static org.junit.Assert.*;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsService;
import org.robolectric.Shadows;
import androidx.browser.customtabs.CustomTabsIntent;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35})
public class BrowserLauncherTest {
    @Test public void pinsBrowserAndKeepsVisibleBrowserUi() {
        CustomTabsIntent tab = BrowserLauncher.create("test.trusted.browser");
        assertEquals("test.trusted.browser", tab.intent.getPackage());
        assertEquals(Intent.ACTION_VIEW, tab.intent.getAction());
        assertFalse(tab.intent.hasExtra("com.android.browser.headers"));
        assertFalse(tab.intent.getBooleanExtra(CustomTabsIntent.EXTRA_ENABLE_URLBAR_HIDING, false));
        assertFalse(tab.intent.getBooleanExtra(CustomTabsIntent.EXTRA_ENABLE_INSTANT_APPS, true));
        assertEquals(CustomTabsIntent.SHARE_STATE_OFF, tab.intent.getIntExtra(CustomTabsIntent.EXTRA_SHARE_STATE, -1));
    }
    @Test public void launchesHttpsIntoDetectedBrowserWithoutHeaders() {
        var activity = org.robolectric.Robolectric.buildActivity(MainActivity.class).setup().get();
        var pm = Shadows.shadowOf(activity.getPackageManager());
        ResolveInfo browser = new ResolveInfo();
        browser.activityInfo = new ActivityInfo();
        browser.activityInfo.packageName = "test.trusted.browser";
        browser.activityInfo.name = "BrowserActivity";
        browser.activityInfo.applicationInfo = new android.content.pm.ApplicationInfo();
        browser.activityInfo.applicationInfo.packageName = "test.trusted.browser";
        pm.addResolveInfoForIntent(new Intent(Intent.ACTION_VIEW, Uri.parse("http://")), browser);
        ResolveInfo service = new ResolveInfo();
        service.serviceInfo = new ServiceInfo();
        service.serviceInfo.packageName = "test.trusted.browser";
        service.serviceInfo.name = "CustomTabsService";
        pm.addResolveInfoForIntent(new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION).setPackage("test.trusted.browser"), service);
        assertEquals(BrowserLauncher.Result.OPENED, BrowserLauncher.open(activity, ServiceOrigin.parse("https://knowra.test:8443")));
        Intent launched = Shadows.shadowOf(activity).getNextStartedActivity();
        assertEquals("https://knowra.test:8443/", launched.getDataString());
        assertEquals("test.trusted.browser", launched.getPackage());
        assertFalse(launched.hasExtra("com.android.browser.headers"));
    }
    @Test public void absentBrowserIsExplicitAndDoesNotSendGenericDeepLink() {
        assertEquals(BrowserLauncher.Result.MISSING_BROWSER,
                BrowserLauncher.open(RuntimeEnvironment.getApplication(), ServiceOrigin.parse("https://knowra.test")));
        assertNull(org.robolectric.Shadows.shadowOf(RuntimeEnvironment.getApplication()).getNextStartedActivity());
    }
}

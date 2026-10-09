package app.knowra.android;

import static org.junit.Assert.*;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.widget.EditText;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35})
public class MainActivityTest {
    @Test public void ignoresIncomingUrlAndNeverAutoConnects() {
        Intent incoming = new Intent(Intent.ACTION_VIEW, Uri.parse("https://attacker.test"));
        MainActivity activity = Robolectric.buildActivity(MainActivity.class, incoming).setup().get();
        assertEquals("", ((EditText) activity.findViewById(R.id.service_address)).getText().toString());
        assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
    }
    @Test public void invalidAddressCannotBeSavedOrOpened() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        EditText address = activity.findViewById(R.id.service_address);
        address.setText("https://user:password@knowra.test");
        activity.findViewById(R.id.open_service).performClick();
        assertNotNull(address.getError());
        assertTrue(activity.getPreferences(0).getAll().isEmpty());
        assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
    }
    @Test public void missingBrowserRetainsOnlyAddressAndAllowsRetry() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        ((EditText) activity.findViewById(R.id.service_address)).setText("https://knowra.test");
        activity.findViewById(R.id.open_service).performClick();
        activity.findViewById(R.id.open_service).performClick();
        assertEquals("https://knowra.test/", activity.getPreferences(0).getString("service_origin", ""));
        assertEquals(1, activity.getPreferences(0).getAll().size());
        assertEquals(activity.getString(R.string.missing_browser), ((TextView) activity.findViewById(R.id.status)).getText().toString());
        assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
    }
    @Test public void cancellingSwitchAndForgetPreservesSavedAddress() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        EditText address = activity.findViewById(R.id.service_address);
        address.setText("https://first.test");
        activity.findViewById(R.id.open_service).performClick();
        address.setText("https://second.test");
        activity.findViewById(R.id.open_service).performClick();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        assertEquals("https://first.test/", activity.getPreferences(0).getString("service_origin", ""));
        activity.findViewById(R.id.forget_service).performClick();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        assertEquals("https://first.test/", activity.getPreferences(0).getString("service_origin", ""));
        activity.findViewById(R.id.forget_service).performClick();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        assertTrue(activity.getPreferences(0).getAll().isEmpty());
        assertEquals("", address.getText().toString());
    }
    @Test public void approvedSwitchStoresNewAddressWithoutAccessingBrowserSession() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        EditText address = activity.findViewById(R.id.service_address);
        address.setText("https://first.test");
        activity.findViewById(R.id.open_service).performClick();
        address.setText("https://second.test:8443");
        activity.findViewById(R.id.open_service).performClick();
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        assertEquals("https://second.test:8443/", activity.getPreferences(0).getString("service_origin", ""));
        assertEquals(1, activity.getPreferences(0).getAll().size());
    }
}

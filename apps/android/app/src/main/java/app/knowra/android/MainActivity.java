package app.knowra.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

/** 只管理显式服务地址和浏览器启动；不接受外部 Intent 的自动跳转或凭据。 */
public final class MainActivity extends Activity {
    private EditText address;
    private TextView status;
    private Button forget;
    private boolean opening;
    private AlertDialog pending;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        findViewById(R.id.root).setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        address = findViewById(R.id.service_address);
        status = findViewById(R.id.status);
        forget = findViewById(R.id.forget_service);
        if (state == null) address.setText(savedOrigin());
        refreshForget();
        findViewById(R.id.open_service).setOnClickListener(unused -> open());
        forget.setOnClickListener(unused -> showConfirmation(new AlertDialog.Builder(this)
                .setTitle(R.string.forget_title).setMessage(R.string.forget_message)
                .setPositiveButton(R.string.forget_confirm, (dialog, which) -> {
                    getPreferences(MODE_PRIVATE).edit().clear().apply();
                    address.setText("");
                    status.setText(R.string.forgotten);
                    refreshForget();
                }).setNegativeButton(R.string.cancel, null)));
    }

    private void open() {
        if (opening || pending != null) return;
        final ServiceOrigin origin;
        try { origin = ServiceOrigin.parse(address.getText().toString()); }
        catch (IllegalArgumentException error) {
            address.setError(error.getMessage());
            address.requestFocus();
            return;
        }
        address.setError(null);
        if (!savedOrigin().isEmpty() && !savedOrigin().equals(origin.url())) {
            showConfirmation(new AlertDialog.Builder(this).setTitle(R.string.switch_title)
                    .setMessage(getString(R.string.switch_message, origin.display()))
                    .setPositiveButton(R.string.switch_confirm, (dialog, which) -> launch(origin))
                    .setNegativeButton(R.string.cancel, null));
        } else { launch(origin); }
    }

    private void launch(ServiceOrigin origin) {
        getPreferences(MODE_PRIVATE).edit().putString("service_origin", origin.url()).apply();
        address.setText(origin.url());
        refreshForget();
        opening = true;
        BrowserLauncher.Result result = BrowserLauncher.open(this, origin);
        if (result != BrowserLauncher.Result.OPENED) opening = false;
        status.setText(switch (result) {
            case OPENED -> R.string.opened;
            case MISSING_BROWSER -> R.string.missing_browser;
            case FAILED -> R.string.browser_failed;
        });
    }

    private void showConfirmation(AlertDialog.Builder builder) {
        if (pending != null || opening) return;
        pending = builder.create();
        pending.setOnDismissListener(unused -> pending = null);
        pending.show();
    }

    @Override protected void onResume() { super.onResume(); opening = false; }
    @Override protected void onDestroy() {
        if (pending != null) pending.dismiss();
        super.onDestroy();
    }

    private String savedOrigin() { return getPreferences(MODE_PRIVATE).getString("service_origin", ""); }
    private void refreshForget() { forget.setVisibility(savedOrigin().isEmpty() ? View.GONE : View.VISIBLE); }
}

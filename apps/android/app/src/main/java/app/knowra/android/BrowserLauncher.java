package app.knowra.android;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;

/** 无 WebView、请求代理或凭据交接；完整的网页安全上下文由用户浏览器拥有。 */
final class BrowserLauncher {
    enum Result { OPENED, MISSING_BROWSER, FAILED }

    static Result open(Context context, ServiceOrigin origin) {
        try {
            String provider = CustomTabsClient.getPackageName(context, null);
            if (provider == null) return Result.MISSING_BROWSER;
            CustomTabsIntent tab = create(provider);
            tab.launchUrl(context, Uri.parse(origin.url()));
            return Result.OPENED; // 仅证明 Intent 发出，不证明网络、登录或页面成功。
        } catch (ActivityNotFoundException | SecurityException error) {
            return Result.FAILED;
        }
    }

    static CustomTabsIntent create(String provider) {
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setInstantAppsEnabled(false)
                .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder()
                        .setToolbarColor(Color.rgb(249, 247, 242)).build())
                .build();
        // 限定已识别的浏览器 provider，避免目标域名被普通 deep-link Activity 接走。
        // 不隐藏地址栏，不传 Authorization、Cookie、token、JS 或 postMessage 通道。
        tab.intent.setPackage(provider);
        // AndroidX 会自动放入 Accept-Language bundle；本应用不传任何附加请求头。
        tab.intent.removeExtra(android.provider.Browser.EXTRA_HEADERS);
        return tab;
    }
}

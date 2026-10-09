package app.knowra.android;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** 只接受部署在根路径的 HTTPS V4 服务；凭据不能混进 URL 或偏好文件。 */
public final class ServiceOrigin {
    private final URI uri;

    private ServiceOrigin(URI uri) { this.uri = uri; }

    public static ServiceOrigin parse(String value) {
        try {
            URI candidate = new URI(value.trim());
            String path = candidate.getRawPath();
            if (!"https".equalsIgnoreCase(candidate.getScheme()) || candidate.getHost() == null
                    || candidate.getRawUserInfo() != null || candidate.getRawQuery() != null
                    || candidate.getRawFragment() != null || (path != null && !path.isEmpty() && !path.equals("/"))
                    || candidate.getPort() == 0 || candidate.getPort() > 65535) {
                throw invalid();
            }
            return new ServiceOrigin(new URI("https", null, candidate.getHost().toLowerCase(Locale.ROOT),
                    candidate.getPort() == 443 ? -1 : candidate.getPort(), "/", null, null));
        } catch (URISyntaxException | NullPointerException error) {
            throw invalid();
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("请输入完整 HTTPS 服务地址，只保留域名和可选端口，不含账号、密码或路径。");
    }

    public String url() { return uri.toASCIIString(); }
    public String display() { return uri.getRawAuthority(); }
}

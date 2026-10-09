package app.knowra.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class ServiceOriginTest {
    @Test public void normalizesHttpsRootAndDefaultPort() {
        assertEquals("https://example.com/", ServiceOrigin.parse(" HTTPS://Example.com:443/ ").url());
        assertEquals("https://example.com:8443/", ServiceOrigin.parse("https://example.com:8443").url());
        assertEquals("https://[::1]/", ServiceOrigin.parse("https://[::1]").url());
    }
    @Test public void rejectsAmbiguousOrCredentialBearingAddresses() {
        String[] invalid = {"http://example.com", "example.com", "https://a:b@example.com", "https://example.com/api",
                "https://example.com?token=secret", "https://example.com/#/notes", "file:///tmp/data", "javascript:alert(1)",
                "https://example.com:0", "https://example.com:65536", "https://example.com\\@evil.test", "", "https://"};
        for (String value : invalid) assertThrows(value, IllegalArgumentException.class, () -> ServiceOrigin.parse(value));
    }
    @Test public void retainsExplicitHttpsPortWithoutCredentials() {
        ServiceOrigin origin = ServiceOrigin.parse("https://Example.com:8443");
        assertEquals("https://example.com:8443/", origin.url());
        assertEquals("example.com:8443", origin.display());
    }
}

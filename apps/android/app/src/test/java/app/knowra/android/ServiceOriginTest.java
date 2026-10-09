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
    @Test public void isolatesSchemeHostAndEffectivePort() {
        ServiceOrigin origin = ServiceOrigin.parse("https://example.com");
        assertTrue(origin.contains("https://EXAMPLE.com:443/api/health"));
        assertTrue(origin.contains("https://example.com/#/notes"));
        for (String value : new String[]{"http://example.com", "https://example.com:8443/api", "https://evil.test", "https://example.com.evil.test",
                "https://user@example.com", "content://example.com", "https://example.com@evil.test", "data:text/html,test", "about:blank"}) {
            assertFalse(value, origin.contains(value));
        }
        assertFalse(ServiceOrigin.parse("https://example.com:8443").contains("https://example.com"));
    }
    @Test public void browserLinksAreCredentialFreeHttpsOnly() {
        assertTrue(ServiceOrigin.externalHttps("https://example.net/help?q=1#section"));
        for (String value : new String[]{"intent://foo", "javascript:alert(1)", "file:///x", "http://x", "https://u:p@x", "https://x:0", "https://x:65536"}) {
            assertFalse(value, ServiceOrigin.externalHttps(value));
        }
    }
}

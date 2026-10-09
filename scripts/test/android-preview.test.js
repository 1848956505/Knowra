import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(join(root, path), 'utf8');
const java = 'apps/android/app/src/main/java/app/knowra/android/';

test('Android launcher has no network permission or embedded credential surface', async () => {
  const manifest = await read('apps/android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /<uses-permission /);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  const activity = await read(`${java}MainActivity.java`);
  const launcher = await read(`${java}BrowserLauncher.java`);
  assert.doesNotMatch(activity, /WebView|CookieManager|HttpAuthHandler|setHttpAuthUsernamePassword/);
  assert.match(launcher, /CustomTabsClient.getPackageName/);
  assert.match(launcher, /intent.setPackage\(provider\)/);
  assert.doesNotMatch(launcher, /putExtra\(|setUrlBarHidingEnabled|enableUrlBarHiding|requestPostMessageChannel/);
});

test('Android preview does not create signing credentials or accept SDK licenses', async () => {
  const workflow = await read('.github/workflows/android-preview.yml');
  assert.match(workflow, /assembleRelease :app:lintRelease :app:testReleaseUnitTest/);
  assert.doesNotMatch(workflow, /run:.*(?:assembleDebug|keytool|sdkmanager)/);
  assert.match(await read('apps/android/gradle.properties'), /android.builder.sdkDownload=false/);
  assert.match(await read('apps/android/app/build.gradle'), /signingConfig null/);
});

test('HTTPS service policy executes with JDK and no Android SDK', async (t) => {
  let compiler = ['javac'];
  try { execFileSync('javac', ['-version'], { stdio: 'pipe' }); }
  catch {
    compiler = ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main'];
    try { execFileSync(compiler[0], [...compiler.slice(1), '-version'], { stdio: 'pipe' }); }
    catch { t.skip('JDK compiler is unavailable; Android CI runs the same policy tests'); return; }
  }
  const dir = await mkdtemp(join(tmpdir(), 'knowra-origin-'));
  try {
    await writeFile(join(dir, 'ServiceOriginSmoke.java'), `
import app.knowra.android.ServiceOrigin;
public class ServiceOriginSmoke {
  static void check(boolean ok) { if (!ok) throw new AssertionError(); }
  public static void main(String[] args) {
    var origin = ServiceOrigin.parse(" HTTPS://Example.COM:443/ ");
    check(origin.url().equals("https://example.com/"));
    check(origin.contains("https://example.com/api/health"));
    check(origin.contains("https://example.com:443/#/notes"));
    for (String value : new String[]{"http://example.com", "https://example.com:8443", "https://example.com.evil.test", "https://u:p@example.com", "file:///x", "intent://x"}) check(!origin.contains(value));
    for (String value : new String[]{"http://example.com", "https://u:p@example.com", "https://example.com/path", "https://example.com?key=x", "https://example.com/#x", "https://example.com:0", "https://example.com:65536"}) {
      boolean rejected = false;
      try { ServiceOrigin.parse(value); } catch (IllegalArgumentException expected) { rejected = true; }
      check(rejected);
    }
    check(!ServiceOrigin.externalHttps("https://u:p@example.com"));
    check(ServiceOrigin.externalHttps("https://other.test/help"));
  }
}`);
    execFileSync(compiler[0], [...compiler.slice(1), '-d', dir, join(root, java, 'ServiceOrigin.java'), join(dir, 'ServiceOriginSmoke.java')], { stdio: 'pipe' });
    execFileSync('java', ['-cp', dir, 'ServiceOriginSmoke'], { stdio: 'pipe' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');

test('default frontend commands and PM2 config point to V4 while V3 has no launch entry', () => {
  const packageJson = JSON.parse(readWorkspaceFile('package.json'));
  const legacyPackageJson = JSON.parse(readWorkspaceFile('apps/web/package.json'));
  const ecosystem = readWorkspaceFile('deploy/ecosystem.config.cjs');

  assert.match(packageJson.scripts['dev:web'], /@study-accelerator\/web-v4/);
  assert.equal(packageJson.scripts['dev:web:legacy'], undefined);
  assert.equal(legacyPackageJson.scripts.dev, undefined);
  assert.equal(legacyPackageJson.scripts['build:editor-bundle'], undefined);
  assert.match(packageJson.scripts['start:web'], /@study-accelerator\/web-v4/);
  assert.match(ecosystem, /script: 'apps\/web-v4\/server\.mjs'/);
  assert.doesNotMatch(ecosystem, /apps\/web\/src\/main\.js/);
});

test('API and default V4 Web listeners bind to loopback only', () => {
  const apiMain = readWorkspaceFile('apps/api/src/main.js');
  const webMain = readWorkspaceFile('apps/web-v4/server.mjs');
  const portListener = readWorkspaceFile('scripts/configured-port-listener.js');

  assert.match(portListener, /host = ['"]127\.0\.0\.1['"]/);
  assert.match(apiMain, /process\.env\.NODE_ENV !== ['"]production['"]/);
  assert.match(webMain, /process\.env\.NODE_ENV !== ['"]production['"]/);
  assert.match(apiMain, /listenOnConfiguredPort\(server, preferredPort, \{ allowPortFallback \}\)/);
  assert.match(webMain, /listenOnConfiguredPort\(server, preferredPort, \{ allowPortFallback \}\)/);
});

test('production Nginx template protects the site and keeps health public', () => {
  const nginxConfig = readWorkspaceFile('deploy/nginx/knowra.conf.example');

  assert.match(nginxConfig, /auth_basic\s+"Knowra";/);
  assert.match(nginxConfig, /auth_basic_user_file\s+\/etc\/nginx\/\.htpasswd-knowra;/);
  assert.match(
    nginxConfig,
    /location = \/api\/health\s*\{[\s\S]*?auth_basic off;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/
  );
  assert.match(
    nginxConfig,
    /location \/\s*\{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/
  );
  assert.match(nginxConfig, /gzip_comp_level\s+5;/);
  assert.match(
    nginxConfig,
    /gzip_types[\s\S]*?text\/css[\s\S]*?application\/javascript[\s\S]*?application\/json[\s\S]*?image\/svg\+xml;/
  );
});

test('post-deploy checks attachment integrity before reloading PM2', () => {
  const postDeploy = readWorkspaceFile('scripts/post-deploy.sh');

  const attachmentCheckIndex = postDeploy.indexOf('npm run check:attachments');
  const reloadIndex = postDeploy.indexOf('pm2 startOrReload');
  assert.notEqual(attachmentCheckIndex, -1);
  assert.notEqual(reloadIndex, -1);
  assert.ok(attachmentCheckIndex < reloadIndex);
});

function readWorkspaceFile(relativePath) {
  return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

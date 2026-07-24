import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');

test('API and Web listeners bind to loopback only', () => {
  const apiMain = readWorkspaceFile('apps/api/src/main.js');
  const webPortListener = readWorkspaceFile('apps/web/src/server/port-listener.js');

  assert.match(apiMain, /server\.listen\(currentPort,\s*['"]127\.0\.0\.1['"]/);
  assert.match(webPortListener, /server\.listen\(currentPort,\s*['"]127\.0\.0\.1['"]/);
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
});

function readWorkspaceFile(relativePath) {
  return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

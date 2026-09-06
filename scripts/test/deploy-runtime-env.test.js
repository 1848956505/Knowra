import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveDeploymentEnv } = require('../../deploy/runtime-env.cjs');

test('deployment API origin follows the API port unless explicitly overridden', () => {
  assert.deepEqual(resolveDeploymentEnv({}), {
    apiPort: '3001',
    webPort: '3000',
    apiOrigin: 'http://127.0.0.1:3001'
  });
  assert.deepEqual(resolveDeploymentEnv({ KNOWRA_API_PORT: '43123', KNOWRA_WEB_PORT: '43124' }), {
    apiPort: '43123',
    webPort: '43124',
    apiOrigin: 'http://127.0.0.1:43123'
  });
  assert.equal(resolveDeploymentEnv({
    KNOWRA_API_PORT: '43123',
    API_ORIGIN: 'https://api.example.test/base/'
  }).apiOrigin, 'https://api.example.test/base/');
});

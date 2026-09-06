const path = require('node:path');
const { resolveDeploymentEnv } = require('./runtime-env.cjs');

const workspaceRoot = path.resolve(__dirname, '..');
const runtimeEnv = resolveDeploymentEnv();

module.exports = {
  apps: [
    {
      name: 'knowra-api',
      cwd: workspaceRoot,
      script: 'apps/api/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: runtimeEnv.apiPort,
        KNOWRA_OWNER_ID: process.env.KNOWRA_OWNER_ID || 'demo'
      }
    },
    {
      name: 'knowra-web',
      cwd: workspaceRoot,
      script: 'apps/web-v4/server.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: runtimeEnv.webPort,
        API_ORIGIN: runtimeEnv.apiOrigin
      }
    }
  ]
};

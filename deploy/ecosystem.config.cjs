const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'knowra-api',
      cwd: workspaceRoot,
      script: 'apps/api/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.KNOWRA_API_PORT || '3001',
        KNOWRA_OWNER_ID: process.env.KNOWRA_OWNER_ID || 'demo'
      }
    },
    {
      name: 'knowra-web',
      cwd: workspaceRoot,
      script: 'apps/web-v4/server.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.KNOWRA_WEB_PORT || '3000',
        API_ORIGIN: process.env.API_ORIGIN || 'http://127.0.0.1:3001'
      }
    }
  ]
};

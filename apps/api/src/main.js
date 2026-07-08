import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPersistentAppContext } from './app.factory.js';
import { createServer } from './server.js';
import { parseCorsAllowedOrigins } from './http/cors.js';
import { writeRuntimePort } from '../../../scripts/dev-runtime-ports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

const app = createPersistentAppContext();
const server = createServer({
  appContext: app,
  cors: {
    allowedOrigins: parseCorsAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS)
  }
});
const preferredPort = Number(process.env.PORT || 3001);
const runtimePortsFile = process.env.STUDY_RUNTIME_PORTS_FILE || path.join(workspaceRoot, 'storage', 'runtime', 'dev-ports.json');

listenOnAvailablePort(preferredPort)
  .then((port) => {
    writeRuntimePort(runtimePortsFile, 'api', port);
    const suffix = port === preferredPort ? '' : ` (auto-selected from ${preferredPort})`;
    console.log(`知境·Knowra API running at http://localhost:${port}${suffix}`);
    console.log('Knowledge module ready:', Object.keys(app.modules.knowledge).join(', '));
  })
  .catch((error) => {
    console.error('Failed to start 知境·Knowra API:', error.message);
    process.exitCode = 1;
  });

async function listenOnAvailablePort(startPort, maxAttempts = 20) {
  let currentPort = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('error', onError);
          reject(error);
        };

        server.once('error', onError);
        server.listen(currentPort, () => {
          server.off('error', onError);
          resolve();
        });
      });

      return currentPort;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }

      currentPort += 1;
    }
  }

  throw new Error(`Unable to find an available port starting from ${startPort}`);
}

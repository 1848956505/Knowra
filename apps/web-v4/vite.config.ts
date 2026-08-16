import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { readRuntimePorts, resolveApiPort } from '../../scripts/dev-runtime-ports.js';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDirectory, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const webPort = toPort(env.PORT);
  const runtimePortsFile = env.STUDY_RUNTIME_PORTS_FILE
    || path.join(workspaceRoot, 'storage', 'runtime', 'dev-ports.json');
  const apiPort = resolveApiPort({
    envApiPort: env.API_PORT,
    runtimePorts: readRuntimePorts(runtimePortsFile),
    webPort
  });

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      ...(webPort ? { port: webPort } : {}),
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`
      }
    }
  };
});

function toPort(value: string | undefined): number | undefined {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}

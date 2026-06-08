import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

const entryFile = path.join(workspaceRoot, 'apps', 'web', 'lib', 'editor', 'milkdown-entry.js');
const outfile = path.join(workspaceRoot, 'apps', 'web', 'lib', 'editor', 'milkdown-bundle.js');

await build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile,
  sourcemap: true,
  logLevel: 'info'
});

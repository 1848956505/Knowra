import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const requireFromWeb = createRequire(path.join(workspaceRoot, 'apps', 'web', 'package.json'));
const { build } = requireFromWeb('esbuild');

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
  logLevel: 'info',
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

assert.match(
  mainJs,
  /'Cache-Control': 'no-store'/,
  'web dev server should disable browser caching for shell and module responses'
);
assert.match(
  mainJs,
  /url\.pathname\.startsWith\('\/src\/services\/'\)/,
  'web dev server should serve frontend service modules imported by client.js'
);

console.log('ok - web dev server disables cache for local assets');

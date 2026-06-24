import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');

assert.match(
  clientJs,
  /function safeRenderStep\(/,
  'client rendering should isolate failures to a single render step'
);
assert.match(
  clientJs,
  /safeRenderStep\('navigation'/,
  'navigation rendering should not be allowed to stop editor and sidebar rendering'
);
assert.match(
  clientJs,
  /window\.addEventListener\('error'/,
  'runtime errors should be surfaced in the workspace status area'
);

console.log('ok - client render recovery hooks are present');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');
const startDevSource = readFileSync(path.join(workspaceRoot, 'scripts', 'start-dev.mjs'), 'utf8');
const webV4Package = JSON.parse(readFileSync(path.join(workspaceRoot, 'apps', 'web-v4', 'package.json'), 'utf8'));

test('dev:all builds web-core before starting the V4 dev server', () => {
  const buildIndex = startDevSource.indexOf('await runNodeScript([webCoreCompiler');
  const v4StartIndex = startDevSource.indexOf('const webV4Process = spawnNode');

  assert.notEqual(buildIndex, -1, 'start-dev must build the shared web-core package');
  assert.notEqual(v4StartIndex, -1, 'start-dev must start the V4 development server');
  assert.ok(buildIndex < v4StartIndex, 'web-core must be built before V4 imports its package output');
});

test('V4 typecheck refreshes web-core declarations first', () => {
  assert.equal(
    webV4Package.scripts.pretypecheck,
    'npm run build -w @study-accelerator/web-core'
  );
});

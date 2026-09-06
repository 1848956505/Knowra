import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('V4 boundary checker exits non-zero for an isolated V3 import', () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'knowra-v4-boundary-'));
  try {
    mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
    mkdirSync(path.join(fixtureRoot, 'apps', 'web-v4', 'src'), { recursive: true });
    mkdirSync(path.join(fixtureRoot, 'packages', 'web-core', 'src'), { recursive: true });
    const checkerPath = path.join(fixtureRoot, 'scripts', 'check-v4-boundaries.mjs');
    copyFileSync(path.join(workspaceRoot, 'scripts', 'check-v4-boundaries.mjs'), checkerPath);
    writeFileSync(
      path.join(fixtureRoot, 'apps', 'web-v4', 'src', 'violation.ts'),
      "import legacy from '../../web/src/legacy.js';\nexport default legacy;\n"
    );

    const result = spawnSync(process.execPath, [checkerPath], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /V4 must not import V3 module or asset/);
    assert.match(result.stderr, /apps\/web-v4\/src\/violation\.ts/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

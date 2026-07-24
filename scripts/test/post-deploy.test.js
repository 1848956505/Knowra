import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');
const deployScript = path.join(workspaceRoot, 'scripts', 'post-deploy.sh');

test('post-deploy builds and restarts the production PM2 processes', () => {
  const fixture = createFixture();

  try {
    const result = runDeployScript(fixture);
    const calls = readFileSync(fixture.logFile, 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(calls, /^npm run build:editor-bundle -w @study-accelerator\/web$/m);
    assert.match(calls, /^pm2 describe knowra-api$/m);
    assert.match(calls, /^pm2 describe knowra-web$/m);
    assert.match(calls, /^pm2 restart knowra-api knowra-web --update-env$/m);
    assert.match(calls, /^pm2 save$/m);
    assert.doesNotMatch(calls, /study-web/);
  } finally {
    fixture.cleanup();
  }
});

test('post-deploy fails before restart when a production PM2 process is missing', () => {
  const fixture = createFixture({ missingProcess: 'knowra-api' });

  try {
    const result = runDeployScript(fixture);
    const calls = readFileSync(fixture.logFile, 'utf8');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未找到 PM2 进程 knowra-api/);
    assert.doesNotMatch(calls, /^pm2 restart /m);
  } finally {
    fixture.cleanup();
  }
});

function createFixture({ missingProcess = '' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'knowra-post-deploy-'));
  const binDir = path.join(root, 'bin');
  const logFile = path.join(root, 'calls.log');

  writeFileSync(logFile, '');
  writeExecutable(path.join(binDir, 'npm'), [
    '#!/usr/bin/env bash',
    'printf "npm %s\\n" "$*" >> "$DEPLOY_TEST_LOG"'
  ]);
  writeExecutable(path.join(binDir, 'pm2'), [
    '#!/usr/bin/env bash',
    'printf "pm2 %s\\n" "$*" >> "$DEPLOY_TEST_LOG"',
    'if [[ "$1" == "describe" && "$2" == "$DEPLOY_TEST_MISSING_PROCESS" ]]; then',
    '  exit 1',
    'fi'
  ]);

  return {
    binDir,
    logFile,
    missingProcess,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function writeExecutable(filePath, lines) {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true });
  writeFileSync(filePath, `${lines.join('\n')}\n`);
  chmodSync(filePath, 0o755);
}

function runDeployScript(fixture) {
  return spawnSync('bash', [deployScript], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_TEST_LOG: fixture.logFile,
      DEPLOY_TEST_MISSING_PROCESS: fixture.missingProcess,
      PATH: `${fixture.binDir}:${process.env.PATH}`
    }
  });
}

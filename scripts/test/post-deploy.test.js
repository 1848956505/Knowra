import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');
const deployScript = path.join(workspaceRoot, 'scripts', 'post-deploy.sh');
const deployScriptSource = readFileSync(deployScript, 'utf8');

test('post-deploy builds and restarts the production PM2 processes', () => {
  const fixture = createFixture();

  try {
    const result = runDeployScript(fixture);
    const calls = readFileSync(fixture.logFile, 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(calls, /^npm run build:editor-bundle -w @study-accelerator\/web$/m);
    assert.match(
      deployScriptSource,
      /NODE_ENV=production npm run build:editor-bundle -w @study-accelerator\/web/,
      'deployment must build Milkdown without production source maps'
    );
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
  const bashCommand = resolveBashCommand();
  const isWindows = process.platform === 'win32';
  const gitBashRoot = isWindows && path.isAbsolute(bashCommand)
    ? resolveGitBashRoot(bashCommand)
    : null;
  const shellPathEntries = [fixture.binDir];

  if (gitBashRoot) {
    shellPathEntries.push(path.join(gitBashRoot, 'usr', 'bin'), path.join(gitBashRoot, 'bin'));
  } else {
    shellPathEntries.push(process.env.PATH ?? '');
  }

  return spawnSync(bashCommand, [isWindows ? toGitBashPath(deployScript) : deployScript], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_TEST_LOG: isWindows ? toGitBashPath(fixture.logFile) : fixture.logFile,
      DEPLOY_TEST_MISSING_PROCESS: fixture.missingProcess,
      PATH: shellPathEntries
        .map((entry) => isWindows ? toGitBashPath(entry) : entry)
        .join(isWindows ? ':' : path.delimiter)
    }
  });
}

function resolveBashCommand() {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const candidates = [
    process.env.BASH_PATH,
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? 'bash';
}

function resolveGitBashRoot(bashCommand) {
  const bashDirectory = path.dirname(bashCommand);
  const parentDirectory = path.basename(path.dirname(bashDirectory)).toLowerCase();
  return parentDirectory === 'usr'
    ? path.resolve(bashDirectory, '..', '..')
    : path.resolve(bashDirectory, '..');
}

function toGitBashPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }

  const absolutePath = path.resolve(filePath).replaceAll('\\', '/');
  return `/${absolutePath[0].toLowerCase()}${absolutePath.slice(2)}`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'knowra lint runner '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tools = path.join(dir, 'scripts/lint');
  mkdirSync(tools, { recursive: true });
  copyFileSync(path.join(root, 'scripts/lint/run.mjs'), path.join(tools, 'run.mjs'));
  writeFileSync(path.join(tools, 'package-lock.json'), '{}');
  for (const bin of ['eslint/bin/eslint.js', 'prettier/bin/prettier.cjs']) {
    const file = path.join(tools, 'node_modules', bin);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      'console.log(JSON.stringify(process.argv.slice(2))); process.exit(Number(process.env.KNOWRA_LINT_TEST_EXIT ?? 1));\n'
    );
  }
  // 已安装的隔离工具链；故意不创建 .bin 或根 node_modules。
  writeFileSync(path.join(tools, 'node_modules/.package-lock.json'), '{}');
  return dir;
}

for (const [name, tool, args, status] of [
  ['lint', 'eslint', ['.'], 1],
  ['lint:fix', 'eslint', ['.', '--fix'], 1],
  ['format:check', 'prettier', ['.', '--check'], 1],
  ['format', 'prettier', ['.', '--write'], 1]
]) {
  test(`${name} uses the isolated runner and preserves its mode`, t => {
    const dir = fixture(t);
    const [node, runner, actualTool, ...cliArgs] = scripts[name].split(' ');
    assert.equal(node, 'node');
    assert.equal(runner, 'scripts/lint/run.mjs');
    assert.equal(actualTool, tool);
    const result = spawnSync(process.execPath, [runner, actualTool, ...cliArgs], {
      cwd: dir,
      encoding: 'utf8'
    });
    assert.equal(result.status, status, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  });
}

test('runner forwards arguments containing spaces without invoking a shell', t => {
  const dir = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/lint/run.mjs', 'eslint', 'a file with spaces.js', '--report'], {
    cwd: dir,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['a file with spaces.js']);
});

test('unknown tools fail before attempting an install', t => {
  const dir = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/lint/run.mjs', 'unknown', '--report'], {
    cwd: dir,
    encoding: 'utf8'
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /用法/);
});

for (const tool of ['eslint', 'prettier']) {
  test(`${tool} report mode identifies an incomplete scan`, t => {
    const dir = fixture(t);
    const result = spawnSync(process.execPath, ['scripts/lint/run.mjs', tool, '--report'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, KNOWRA_LINT_TEST_EXIT: '2' }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /检查未完成（退出码 2）/);
  });
}

// 从固定旧提交生成冻结结果：node packages/content-anchor/test/fixtures/generate-public-compatibility.js
// 需要该提交的 Git 对象与已安装的包依赖。不会读取当前 src 实现或提交旧源码副本。
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { BASELINE_COMMIT, publicCompatibilityCases } from './public-compatibility-cases.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: packageRoot, encoding: 'utf8' });
const oldFile = path => git('show', `${BASELINE_COMMIT}:packages/content-anchor/${path}`);
const temporary = mkdtempSync(join(packageRoot, 'test/.compatibility-baseline-'));
try {
  const files = git('ls-tree', '--full-tree', '--name-only', `${BASELINE_COMMIT}:packages/content-anchor/src`).trim().split('\n');
  for (const name of files.filter(name => /^[\w-]+\.js$/.test(name))) writeFileSync(join(temporary, name), oldFile(`src/${name}`));
  const api = await import(pathToFileURL(join(temporary, 'index.js')).href);
  const manifest = JSON.parse(oldFile('package.json'));
  const fixture = {
    baselineCommit: BASELINE_COMMIT,
    declarationsSha256: createHash('sha256').update(oldFile('src/index.d.ts')).digest('hex'),
    packageContract: Object.fromEntries(['name', 'type', 'exports', 'types'].map(key => [key, manifest[key]])),
    publicExports: Object.fromEntries(Object.keys(api).sort().map(name => [name, typeof api[name]])),
    cases: publicCompatibilityCases(api)
  };
  const target = new URL('./public-compatibility.json', import.meta.url);
  writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`已冻结 ${Object.keys(fixture.cases).length} 个旧版本兼容案例，${readFileSync(target).length} 字节。`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

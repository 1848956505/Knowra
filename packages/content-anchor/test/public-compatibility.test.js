import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as publicApi from '@study-accelerator/content-anchor';
import * as index from '../src/index.js';
import * as projection from '../src/projection.js';
import * as hash from '../src/hash.js';
import * as resolution from '../src/anchor-resolution.js';
import * as sourceEdit from '../src/source-edit.js';
import * as dynamic from '../src/dynamic.js';
import * as sourceDiff from '../src/source-diff.js';
import * as listAnchor from '../src/list-anchor.js';
import * as listFollow from '../src/list-follow.js';
import * as identity from '../src/identity-shadow.js';
import * as blockOffsets from '../src/block-offsets.js';
import * as identityBinding from '../src/identity-binding.js';
import * as links from '../src/internal-links.js';
import { BASELINE_COMMIT, publicCompatibilityCases } from './fixtures/public-compatibility-cases.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/public-compatibility.json', import.meta.url), 'utf8'));

test('公共导出集合、类型及包入口与冻结旧版本一致，不泄漏内部辅助函数', () => {
  assert.equal(fixture.baselineCommit, BASELINE_COMMIT);
  assert.deepEqual(Object.fromEntries(Object.keys(publicApi).sort().map(name => [name, typeof publicApi[name]])), fixture.publicExports);
  assert.deepEqual(Object.keys(index), Object.keys(publicApi));
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries(Object.keys(fixture.packageContract).map(key => [key, manifest[key]])), fixture.packageContract);
  const declaration = readFileSync(new URL('../src/index.d.ts', import.meta.url));
  assert.equal(createHash('sha256').update(declaration).digest('hex'), fixture.declarationsSha256, '公共类型声明不可随内部模块拆分改变');
});

test('公共入口与全部实现模块保持同一函数或常量引用，兼容 dynamic 的原导出', () => {
  const modules = { projection, hash, resolution, sourceEdit, dynamic, sourceDiff, listAnchor, listFollow, identity, blockOffsets, identityBinding, links };
  const covered = new Set();
  for (const [moduleName, implementation] of Object.entries(modules)) {
    for (const name of Object.keys(implementation).filter(name => Object.hasOwn(fixture.publicExports, name))) {
      assert.strictEqual(publicApi[name], implementation[name], `${moduleName}.${name} 必须直接重导出原实现`);
      assert.strictEqual(index[name], publicApi[name]);
      covered.add(name);
    }
  }
  assert.deepEqual([...covered].sort(), Object.keys(fixture.publicExports).sort(), '每个公共导出必须检查其实现引用');
  assert.strictEqual(dynamic.sourceEdit, sourceEdit.sourceEdit);
  assert.strictEqual(dynamic.applySourceEdit, sourceEdit.applySourceEdit);
});

// 快照来自重构前完整模块图；运行测试无需 Git 或任何旧源码副本。
const actual = publicCompatibilityCases(publicApi);
assert.deepEqual(Object.keys(actual), Object.keys(fixture.cases), '变更案例时必须显式重建旧版本冻结结果');
for (const [name, expected] of Object.entries(fixture.cases)) {
  test(`冻结旧输出：${name}`, () => assert.deepEqual(actual[name], expected));
}

for (const first of ['dynamic', 'list-follow', 'identity-shadow', 'identity-binding', 'index']) {
  test(`独立进程冷加载 ${first} → 公共入口，无 TDZ 或重复实例`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      await import(${JSON.stringify(new URL(`../src/${first}.js`, import.meta.url).href)});
      const api = await import('@study-accelerator/content-anchor');
      const entry = await import(${JSON.stringify(new URL('../src/index.js', import.meta.url).href)});
      assert.strictEqual(api, entry);
      for (const name of ['projection', 'hash', 'anchor-resolution', 'source-edit', 'dynamic', 'source-diff', 'list-anchor', 'list-follow', 'identity-shadow', 'block-offsets', 'identity-binding', 'internal-links']) {
        const module = await import(new URL(name + '.js', ${JSON.stringify(new URL('../src/', import.meta.url).href)}));
        for (const key of Object.keys(module).filter(key => Object.hasOwn(api, key))) assert.strictEqual(api[key], module[key]);
      }
      const { publicCompatibilityCases } = await import(${JSON.stringify(new URL('./fixtures/public-compatibility-cases.js', import.meta.url).href)});
      const fixture = JSON.parse(readFileSync(new URL(${JSON.stringify(new URL('./fixtures/public-compatibility.json', import.meta.url).href)}), 'utf8'));
      assert.deepEqual(publicCompatibilityCases(api), fixture.cases);
    `;
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000
    });
  });
}

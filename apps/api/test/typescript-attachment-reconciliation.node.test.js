import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  attachmentReconciliationContractCases,
  attachmentReconciliationFrozenSource,
  attachmentReconciliationParent,
  bytes,
  disk,
  hash,
  now,
  row
} from './attachment-reconciliation.contract-support.js';

const baseline = process.env.KNOWRA_ATTACHMENT_RECONCILIATION_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/infrastructure/attachment-record-reconciliation.js';
const sourceUrl = new URL(helper, root);
const expectedHash = '4e68682396bff9cbd0ee8092d3746e27af8dbab121c3cb200b23753bb7396cda';

function loadSource(source, label) {
  let rewritten = source;
  for (const dependency of ['./attachment-status.js', './local-attachment-store-utils.js']) {
    const quoted = `'${dependency}'`;
    assert.equal(source.split(quoted).length, 2, `Frozen dependency must occur exactly once: ${dependency}`);
    rewritten = rewritten.replace(quoted, JSON.stringify(new URL(dependency, sourceUrl).href));
  }
  return import(`data:text/javascript;base64,${Buffer.from(`${rewritten}\n// ${label}`).toString('base64')}`);
}

// 普通运行零 Git；显式历史模式只读准确父对象，缺失时直接失败，不回退固定正文或候选。
const historicalSource = baseline
  ? execFileSync('git', ['show', `${attachmentReconciliationParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historicalSource, 'exact-parent') : await import(sourceUrl);
const frozenApi = await loadSource(attachmentReconciliationFrozenSource, 'fixed-oracle');

for (const entry of attachmentReconciliationContractCases(api)) test(entry.name, entry.run);

test('fixed JS body matches the independently recorded exact-parent SHA256', () => {
  assert.equal(createHash('sha256').update(attachmentReconciliationFrozenSource).digest('hex'), expectedHash);
  if (baseline) assert.equal(historicalSource, attachmentReconciliationFrozenSource);
});

function executableAst(source) {
  const parsed = parse(source, { sourceType: 'module' });
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              'start',
              'end',
              'loc',
              'extra',
              'comments',
              'leadingComments',
              'trailingComments',
              'innerComments'
            ].includes(key)
        )
        .map(([key, nested]) => [key, normalize(nested)])
    );
  }
  return normalize(parsed.program);
}

test(
  'type erasure preserves the exact executable AST except the attachment-status bridge extension',
  { skip: baseline },
  () => {
    const source = readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8');
    const erased = stripTypeScriptTypes(source);
    assert.equal(erased.split("'./attachment-status.ts'").length, 2);
    const normalized = erased.replace("'./attachment-status.ts'", "'./attachment-status.js'");
    assert.deepEqual(executableAst(normalized), executableAst(attachmentReconciliationFrozenSource));
  }
);

test('JS bridge contains only the two same-identity TS re-exports', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), Object.keys(typed));
  for (const key of Object.keys(api)) assert.equal(api[key], typed[key]);
  const parsed = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.equal(parsed.body.length, 1);
  assert.deepEqual(parsed.directives, []);
  const statement = parsed.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './attachment-record-reconciliation.ts');
  assert.deepEqual(statement.specifiers.map(item => item.exported.name).sort(), Object.keys(api));
  assert.ok(
    statement.specifiers.every(item => item.type === 'ExportSpecifier' && item.local.name === item.exported.name)
  );
});

// 每个种子分别构造全新输入，记录所有有序读取、写入、磁盘动作、异常身份和最终实际字段。
function observe(subject, seed) {
  let state = (seed + 1) >>> 0;
  const random = max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  };
  const events = [];
  const sentinel = { seed };
  const values = [
    undefined,
    null,
    '',
    false,
    0,
    3,
    '3',
    9,
    hash,
    hash.toUpperCase(),
    '0'.repeat(64),
    'invalid',
    'ready',
    'missing',
    now,
    NaN,
    Symbol('metadata'),
    { synthetic: true }
  ];
  const fields = ['id', 'size', 'sha256', 'status', 'verifiedAt'];
  const backing = {
    id: [0, '', 'a', 1, true, Symbol('id')][random(6)],
    size: [3, '3', 9, undefined, null][random(5)],
    sha256: [hash, hash.toUpperCase(), '0'.repeat(64), null, undefined, 'invalid'][random(6)],
    status: ['ready', 'missing', null, undefined, false][random(5)],
    verifiedAt: [now, null, undefined, false, 'previous'][random(5)]
  };
  const getFailure = random(12);
  const failedRead = 1 + random(3);
  const setFailure = random(12);
  const ignoreWrites = random(5) === 0;
  const changeSha = random(4) === 0;
  const nextSha = values[random(values.length)];
  const fsFailure = random(14);
  const exists = random(5) !== 0;
  const isFile = random(5) !== 0;
  const statSize = [3, 4, 0][random(3)];
  const content = random(5) ? bytes : Buffer.from('different');
  const changeStatSize = random(5) === 0;
  const getters = new Map();
  function scalar(value) {
    if (typeof value === 'symbol') return { symbol: value.description };
    if (typeof value === 'bigint') return { bigint: String(value) };
    if (value !== null && typeof value === 'object') return { object: 'synthetic' };
    return value;
  }
  const attachment = new Proxy(backing, {
    get(target, key, receiver) {
      const count = (getters.get(key) ?? 0) + 1;
      getters.set(key, count);
      events.push(['get', key, count]);
      if (fields[getFailure] === key && count === failedRead) throw sentinel;
      return key === 'sha256' && count > 1 && changeSha ? nextSha : Reflect.get(target, key, receiver);
    },
    set(target, key, value) {
      events.push(['set', key, scalar(value)]);
      if (fields[setFailure] === key) throw sentinel;
      if (!ignoreWrites) Reflect.set(target, key, value);
      return true;
    }
  });
  const chosenPath = random(7);
  const filePath = [
    null,
    undefined,
    '',
    false,
    'synthetic-path',
    Buffer.from('synthetic-path'),
    new URL('file:///synthetic-path')
  ][chosenPath];
  const dateKind = random(7);
  const date = [
    now,
    'invalid',
    0,
    new Date(now),
    NaN,
    null,
    {
      [Symbol.toPrimitive](hint) {
        events.push(['date', hint]);
        if (random(2)) throw sentinel;
        return 1;
      }
    }
  ][dateKind];
  const nullOptions = random(30) === 0;
  const options = nullOptions
    ? null
    : {
        get now() {
          events.push(['option', 'now']);
          if (getFailure === 11) throw sentinel;
          return date;
        }
      };
  let statCalls = 0;
  let sizeReads = 0;
  const step = (label, index, p) => {
    events.push([label, ...(p === undefined ? [] : [p === filePath, chosenPath])]);
    if (fsFailure === index) throw sentinel;
  };
  let outcome;
  disk(
    () => {
      try {
        const value = subject.reconcileAttachmentIntegrity(attachment, filePath, options);
        outcome = { kind: 'return', value, asynchronous: value instanceof Promise };
      } catch (error) {
        outcome =
          error === sentinel
            ? { kind: 'throw', identity: 'sentinel' }
            : { kind: 'throw', name: error.name, message: error.message, code: error.code, keys: Object.keys(error) };
      }
    },
    {
      existsSync(p) {
        step('exists', 0, p);
        return exists;
      },
      statSync(p) {
        const first = ++statCalls === 1;
        step(first ? 'first stat' : 'second stat', first ? 1 : 4, p);
        return first
          ? {
              get isFile() {
                step('isFile lookup', 2);
                return () => {
                  step('isFile call', 3);
                  return isFile;
                };
              }
            }
          : {
              get size() {
                step('stat size', 6);
                return changeStatSize && ++sizeReads > 1 ? statSize + 1 : statSize;
              }
            };
      },
      readFileSync(p) {
        step('read', 5, p);
        return content;
      }
    }
  );
  return { outcome, events, fields: Object.fromEntries(fields.map(key => [key, scalar(backing[key])])) };
}

test('4096 fresh-input differentials preserve ordered actions, partial writes and exact exceptions', () => {
  const outcomes = new Map();
  for (let seed = 0; seed < 4096; seed++) {
    const expected = observe(frozenApi, seed);
    assert.deepEqual(observe(api, seed), expected, `Differential seed ${seed}`);
    const key =
      expected.outcome.identity ?? expected.outcome.name ?? `${expected.outcome.kind}:${expected.fields.status}`;
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  }
  for (const key of ['sentinel', 'TypeError', 'RangeError', 'return:ready', 'return:missing', 'return:corrupt'])
    assert.ok(outcomes.get(key) > 10, `Missing differential outcome: ${key}`);
});

const mutations = [
  [
    'id truthiness becomes string validation',
    'if (!attachment?.id)',
    "if (typeof attachment?.id !== 'string' || !attachment.id)"
  ],
  ['snapshot sha nullish becomes truthy', 'sha256: attachment.sha256 ?? null', 'sha256: attachment.sha256 || null'],
  [
    'snapshot status nullish becomes truthy',
    'status: attachment.status ?? ATTACHMENT_STATUS.READY',
    'status: attachment.status || ATTACHMENT_STATUS.READY'
  ],
  [
    'snapshot verifiedAt nullish becomes truthy',
    'verifiedAt: attachment.verifiedAt ?? null',
    'verifiedAt: attachment.verifiedAt || null'
  ],
  [
    'current sha nullish becomes truthy',
    '(attachment.sha256 ?? null) !== previous.sha256',
    '(attachment.sha256 || null) !== previous.sha256'
  ],
  [
    'current verifiedAt nullish becomes truthy',
    '(attachment.verifiedAt ?? null) !== previous.verifiedAt',
    '(attachment.verifiedAt || null) !== previous.verifiedAt'
  ],
  ['default now becomes lazy', '{ now = new Date().toISOString() } = {}', '{ now } = {}'],
  [
    'path truthiness becomes nullish check',
    '!filePath || !fs.existsSync(filePath)',
    'filePath == null || !fs.existsSync(filePath)'
  ],
  [
    'skip existence check',
    '!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()',
    '!filePath || !fs.statSync(filePath).isFile()'
  ],
  [
    'skip isFile check',
    '!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()',
    '!filePath || !fs.existsSync(filePath)'
  ],
  [
    'reuse the first stat result',
    '!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()',
    '!filePath || !fs.existsSync(filePath) || !(cachedStats = fs.statSync(filePath)).isFile()'
  ],
  [
    'read hash before content',
    'const actualSha256 = sha256FileSync(filePath);\n  const expectedSha256 = normalizeSha256(attachment.sha256);',
    'const expectedSha256 = normalizeSha256(attachment.sha256);\n  const actualSha256 = sha256FileSync(filePath);'
  ],
  ['reuse snapshotted hash', 'normalizeSha256(attachment.sha256);', 'normalizeSha256(previous.sha256);'],
  ['size comparison coerces numbers', 'attachment.size !== stats.size', 'Number(attachment.size) !== stats.size'],
  [
    'missing hash becomes corrupt',
    'expectedSha256 && (expectedSha256 !== actualSha256 || attachment.size !== stats.size)',
    '!expectedSha256 || (expectedSha256 !== actualSha256 || attachment.size !== stats.size)'
  ],
  [
    'mismatched hash no longer short-circuits size',
    'expectedSha256 !== actualSha256 || attachment.size !== stats.size',
    'attachment.size !== stats.size || expectedSha256 !== actualSha256'
  ],
  [
    'corrupt record overwrites trusted size',
    'attachment.status = ATTACHMENT_STATUS.CORRUPT;',
    'attachment.size = stats.size; attachment.status = ATTACHMENT_STATUS.CORRUPT;'
  ],
  [
    'corrupt record overwrites trusted hash',
    'attachment.status = ATTACHMENT_STATUS.CORRUPT;',
    'attachment.sha256 = actualSha256; attachment.status = ATTACHMENT_STATUS.CORRUPT;'
  ],
  [
    'missing record clears trusted hash',
    'attachment.status = ATTACHMENT_STATUS.MISSING;',
    'attachment.sha256 = null; attachment.status = ATTACHMENT_STATUS.MISSING;'
  ],
  [
    'missing writes are reordered',
    'attachment.status = ATTACHMENT_STATUS.MISSING;\n    attachment.verifiedAt = null;',
    'attachment.verifiedAt = null;\n    attachment.status = ATTACHMENT_STATUS.MISSING;'
  ],
  [
    'corrupt writes are reordered',
    'attachment.status = ATTACHMENT_STATUS.CORRUPT;\n    attachment.verifiedAt = null;',
    'attachment.verifiedAt = null;\n    attachment.status = ATTACHMENT_STATUS.CORRUPT;'
  ],
  [
    'ready writes are reordered',
    'attachment.size = stats.size;\n  attachment.sha256 = actualSha256;',
    'attachment.sha256 = actualSha256;\n  attachment.size = stats.size;'
  ],
  [
    'Date is eagerly converted before writes',
    'attachment.size = stats.size;\n  attachment.sha256 = actualSha256;',
    'const verified = new Date(now).toISOString();\n  attachment.size = stats.size;\n  attachment.sha256 = actualSha256;'
  ],
  [
    'read error is swallowed',
    'const actualSha256 = sha256FileSync(filePath);',
    "const actualSha256 = (() => { try { return sha256FileSync(filePath); } catch { return ''; } })();"
  ],
  [
    'read error is wrapped',
    'const actualSha256 = sha256FileSync(filePath);',
    "const actualSha256 = (() => { try { return sha256FileSync(filePath); } catch { throw Error('wrapped'); } })();"
  ],
  ['clone selected attachment', 'const previous = {', 'attachment = { ...attachment };\n  const previous = {'],
  [
    'changed result uses intended writes',
    'function hasChanged(attachment, previous) {',
    'function hasChanged(attachment, previous) { return true;\n'
  ],
  [
    'changed comparisons become eager',
    'return attachment.size !== previous.size\n    || (attachment.sha256 ?? null) !== previous.sha256\n    || attachment.status !== previous.status\n    || (attachment.verifiedAt ?? null) !== previous.verifiedAt;',
    'return [attachment.size !== previous.size, (attachment.sha256 ?? null) !== previous.sha256, attachment.status !== previous.status, (attachment.verifiedAt ?? null) !== previous.verifiedAt].some(Boolean);'
  ],
  [
    'normalizer trims',
    "if (typeof value !== 'string'",
    "if (typeof value === 'string') value = value.trim();\n  if (typeof value !== 'string'"
  ],
  [
    'normalizer coerces values',
    "if (typeof value !== 'string'",
    "value = String(value);\n  if (typeof value !== 'string'"
  ],
  ['normalizer drops lowercase', 'return value.toLowerCase();', 'return value;'],
  ['normalizer accepts only lowercase', '/^[a-f0-9]{64}$/i', '/^[a-f0-9]{64}$/'],
  ['normalizer accepts wrong length', '/^[a-f0-9]{64}$/i', '/^[a-f0-9]{63,65}$/i'],
  [
    'reconcile becomes async',
    'export function reconcileAttachmentIntegrity(',
    'export async function reconcileAttachmentIntegrity('
  ],
  ['normalizer becomes async', 'export function normalizeSha256(', 'export async function normalizeSha256(']
];

for (const [label, from, to] of mutations)
  test(`fixed runtime assertions kill executable mutation: ${label}`, async () => {
    assert.equal(attachmentReconciliationFrozenSource.split(from).length, 2, `Unique mutation anchor: ${label}`);
    let changed = attachmentReconciliationFrozenSource.replace(from, to);
    if (label === 'reuse the first stat result') {
      changed = changed
        .replace('  const previous = {', '  let cachedStats;\n  const previous = {')
        .replace('const stats = fs.statSync(filePath);', 'const stats = cachedStats;');
    }
    if (label === 'Date is eagerly converted before writes')
      changed = changed.replace(
        'attachment.verifiedAt = new Date(now).toISOString();',
        'attachment.verifiedAt = verified;'
      );
    const mutant = await loadSource(changed, label);
    let killed = false;
    for (const entry of attachmentReconciliationContractCases(mutant)) {
      try {
        await entry.run();
      } catch {
        killed = true;
        break;
      }
    }
    assert.equal(killed, true, `Live mutation: ${label}`);
  });

// 当前真实消费者，仅使用临时合成文件；历史模式不把当前依赖图冒充历史验收。
if (!baseline) {
  const { createLocalAttachmentStore } = await import('../src/infrastructure/local-attachment-store.js');
  const { inspectAttachmentFile } = await import('../src/infrastructure/attachment-recovery.js');
  const { attachmentIntegrityTests } = await import('./attachment-integrity.test.js');

  test('actual store startup reconciles healthy and missing records in place with one flush', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ts-reconcile-startup-'));
    try {
      const uploads = path.join(directory, 'uploads');
      fs.mkdirSync(uploads);
      fs.writeFileSync(path.join(uploads, 'a-a.txt'), bytes);
      const metadata = { nested: true };
      const good = { id: 'a', fileName: 'a.txt', noteId: 'n', size: 99, storagePath: 'uploads/a-a.txt', metadata };
      const missing = {
        id: 'b',
        fileName: 'b.txt',
        noteId: 'n',
        size: 2,
        sha256: hash,
        storagePath: 'uploads/b-b.txt'
      };
      let flushes = 0;
      const store = createLocalAttachmentStore({
        dataStore: {
          state: { attachments: [good, missing] },
          flush() {
            flushes++;
          }
        },
        storageRootDir: directory,
        uploadsDir: uploads
      });
      assert.equal(flushes, 1);
      assert.equal(store.getAttachment('a'), good);
      assert.equal(store.getAttachment('b'), missing);
      assert.equal(good.size, 3);
      assert.equal(good.sha256, hash);
      assert.equal(good.status, 'ready');
      assert.equal(new Date(good.verifiedAt).toISOString(), good.verifiedAt);
      assert.equal(good.metadata, metadata);
      assert.equal(missing.status, 'missing');
      assert.equal(missing.verifiedAt, null);
      assert.equal(missing.sha256, hash);
      assert.equal(missing.size, 2);
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('actual store rename preserves record identity, id, metadata and attachment bytes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ts-reconcile-rename-'));
    try {
      const uploads = path.join(directory, 'uploads');
      fs.mkdirSync(uploads);
      const originalPath = path.join(uploads, 'a-a.txt');
      fs.writeFileSync(originalPath, bytes);
      const metadata = {};
      const attachment = row({ fileName: 'a.txt', noteId: 'n', storagePath: 'uploads/a-a.txt', metadata });
      let flushes = 0;
      const store = createLocalAttachmentStore({
        dataStore: {
          state: { attachments: [attachment] },
          flush() {
            flushes++;
          }
        },
        storageRootDir: directory,
        uploadsDir: uploads
      });
      const previousFlushes = flushes;
      assert.equal(store.renameAttachment('a', 'new.txt'), attachment);
      assert.equal(attachment.id, 'a');
      assert.equal(attachment.fileName, 'new.txt');
      assert.equal(attachment.sha256, hash);
      assert.equal(attachment.size, 3);
      assert.equal(attachment.metadata, metadata);
      assert.equal(fs.readFileSync(path.join(directory, attachment.storagePath), 'utf8'), 'abc');
      assert.equal(fs.existsSync(originalPath), false);
      assert.equal(flushes, previousFlushes + 1);
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('actual recovery inspection accepts uppercase expected hash without mutating metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ts-reconcile-recovery-'));
    try {
      const file = path.join(directory, 'a');
      fs.writeFileSync(file, bytes);
      const attachment = row({ sha256: hash.toUpperCase() });
      const original = { ...attachment };
      const health = inspectAttachmentFile(attachment, {
        resolveReadableAttachmentPath() {
          return file;
        }
      });
      assert.equal(health.status, 'ready');
      assert.equal(health.verifiedAt, now);
      assert.deepEqual(health.content, bytes);
      assert.deepEqual(attachment, original);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  for (const name of [
    'attachment integrity inspection identifies repairable metadata',
    'attachment integrity inspection blocks a hash mismatch'
  ]) {
    test(`existing attachment contract actually runs: ${name}`, async () => {
      const selected = attachmentIntegrityTests.filter(entry => entry.name === name);
      assert.equal(selected.length, 1, `Exact existing test missing or duplicated: ${name}`);
      await selected[0].run();
    });
  }
}

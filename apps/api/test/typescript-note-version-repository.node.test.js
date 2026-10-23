import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const baseline = process.env.KNOWRA_NOTE_VERSION_REPOSITORY_BASELINE === '1';
const commit = 'a1de3b6ad5f35b57feac5e4d707dab436f520eaf';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
function original(path) {
  return execFileSync('git', ['show', `${commit}:apps/api/src/${path}`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
}
const errorUrl = new URL('../src/errors/app-error.js', import.meta.url).href;
const originalPage = baseline
  ? url(
      stripTypeScriptTypes(original('modules/knowledge/domain/note-version-page.ts')).replace(
        '../../../errors/app-error.js',
        errorUrl
      )
    )
  : null;
const module = baseline
  ? await import(
      url(
        original('modules/knowledge/infrastructure/note-version-repository.js')
          .replace('../../../errors/app-error.js', errorUrl)
          .replace('../domain/note-version-page.js', originalPage)
      )
    )
  : await import(new URL('infrastructure/note-version-repository.js', root));
const { createInMemoryNoteVersionRepository: create } = module;
const pageModule = baseline ? await import(originalPage) : await import(new URL('domain/note-version-page.js', root));
const { versionSummary, versionPage } = pageModule;
const date = '2026-01-01T00:00:00.000Z';
const row = (id, extra = {}) => ({
  id,
  noteId: 'n',
  content: `content-${id}`,
  contentHash: `hash-${id}`,
  createdAt: date,
  createdBy: 'user',
  ...extra
});
const ids = values => values.map(item => item.id);
const errorIs = expected => error => error === expected;

test('版本仓库兼容入口保留同一 TS 导出身份', { skip: baseline }, async () => {
  const ts = await import(new URL('infrastructure/note-version-repository.ts', root));
  assert.deepEqual(Object.keys(module), ['createInMemoryNoteVersionRepository']);
  assert.equal(create, ts.createInMemoryNoteVersionRepository);
});

test('默认集合、空值选项与原生非法输入错误不变', () => {
  for (const records of [undefined, null]) {
    const repo = create({ records });
    assert.deepEqual(repo.list(), []);
    assert.equal(repo.findById('missing'), null);
    const value = row('v');
    assert.equal(repo.save(value), value);
    assert.equal(repo.save(value).then, undefined);
  }
  assert.throws(() => create(null), TypeError);
  assert.throws(() => create({ records: false }).list(), TypeError);
  assert.throws(() => create().list(null), TypeError);
  assert.throws(() => create().listPage(), TypeError);
});

test('保存、外部数组写入与查询保持引用，不复制或冻结历史对象', () => {
  const records = [];
  const repo = create({ records });
  const value = row('first');
  assert.equal(repo.save(value), value);
  assert.equal(records[0], value);
  const external = row('external');
  records.push(external);
  assert.equal(repo.findById('external'), external);
  assert.equal(repo.list()[0], value);
  value.content = 'mutated';
  assert.equal(repo.findById('first').content, 'mutated');
  assert.equal(Object.isFrozen(value), false);
});

test('同 ID 保存返回原记录，只比较 noteId 和 contentHash 且不持久化', () => {
  const original = row('a');
  let writes = 0;
  const repo = create({
    records: [original],
    onChange() {
      writes += 1;
    }
  });
  assert.equal(repo.save(row('a', { content: 'different', createdBy: null })), original);
  assert.equal(writes, 0);
  for (const change of [{ noteId: 'other' }, { contentHash: 'other' }]) {
    assert.throws(() => repo.save(row('a', change)), {
      code: 'NOTE_VERSION_IMMUTABLE',
      statusCode: 409,
      message: 'NoteVersion cannot be changed'
    });
  }
  assert.equal(writes, 0);
});

test('复用不依赖新 ID，保存不承诺返回输入的扩展字段', () => {
  const existing = row('unrelated-id');
  const records = [existing];
  let writes = 0;
  const repo = create({
    records,
    onChange() {
      writes += 1;
    }
  });
  const input = row('new-uuid', { contentHash: existing.contentHash, marker: true });
  assert.equal(repo.save(input), existing);
  assert.equal('marker' in repo.save(input), false);
  assert.equal(records.length, 1);
  assert.equal(writes, 0);
});

test('canReuse 只在工厂创建时捕获，按真值判断且不绑定 options', () => {
  const a = row('a', { contentHash: 'h' });
  const b = row('b', { contentHash: 'h' });
  const calls = [];
  let gets = 0;
  const options = {
    records: [a, b],
    get canReuse() {
      gets += 1;
      return function (item) {
        calls.push([this, item]);
        return item === b ? {} : 0;
      };
    }
  };
  const repo = create(options);
  Object.defineProperty(options, 'canReuse', { value: () => false });
  assert.equal(repo.findByNoteIdAndContentHash('n', 'h'), b);
  assert.equal(gets, 1);
  assert.deepEqual(calls, [
    [undefined, a],
    [undefined, b]
  ]);
  assert.equal(repo.save(row('c', { contentHash: 'h' })), b);
});

test('canReuse 只访问匹配的候选，异常保持身份且不写入', () => {
  const failure = {};
  const records = [row('a')];
  let count = 0;
  const repo = create({
    records,
    canReuse() {
      count += 1;
      throw failure;
    }
  });
  assert.equal(repo.findByNoteIdAndContentHash('other', 'hash-a'), null);
  assert.equal(repo.findByNoteIdAndContentHash('n', 'other'), null);
  assert.equal(count, 0);
  assert.throws(() => repo.save(row('new', { contentHash: 'hash-a' })), errorIs(failure));
  assert.equal(count, 1);
  assert.equal(records.length, 1);
});

test('onChange 每次重读并使用 options 接收者和原数组', () => {
  const records = [];
  const calls = [];
  const options = {
    records,
    onChange(values) {
      calls.push(['first', this, values]);
    }
  };
  const repo = create(options);
  repo.save(row('a'));
  options.onChange = function (values) {
    calls.push(['second', this, values]);
  };
  repo.save(row('b'));
  options.onChange = null;
  repo.save(row('c'));
  assert.deepEqual(calls, [
    ['first', options, records],
    ['second', options, records]
  ]);
});

test('持久化抛错不回滚已完成保存或删除，并保留抛出值身份', () => {
  for (const operation of ['save', 'deleteById', 'deleteByNoteIds']) {
    const failure = Symbol(operation);
    const value = row('a');
    const records = operation === 'save' ? [] : [value];
    const repo = create({
      records,
      onChange() {
        throw failure;
      }
    });
    const run =
      operation === 'save'
        ? () => repo.save(value)
        : operation === 'deleteById'
          ? () => repo.deleteById('a')
          : () => repo.deleteByNoteIds(['n']);
    assert.throws(run, errorIs(failure));
    assert.deepEqual(records, operation === 'save' ? [value] : []);
  }
});

test('历史字段保留严格相等、对象身份、缺失和假值，不进行验证', () => {
  const id = {};
  const noteId = {};
  const hash = {};
  const value = { id, noteId, contentHash: hash, createdAt: null };
  const missing = {};
  const repo = create({ records: [value, missing] });
  assert.equal(repo.findById(id), value);
  assert.equal(repo.findById({}), null);
  assert.equal(repo.findById(undefined), missing);
  assert.equal(repo.findByNoteIdAndContentHash(noteId, hash), value);
  assert.equal(repo.findByNoteIdAndContentHash({}, hash), null);
  assert.deepEqual(repo.listIds(), [id, undefined]);
});

test('list 日期降序、同时间稳定顺序与记录别名不变', () => {
  const a = row('a');
  const b = row('b');
  const c = row('c', { createdAt: '2027-01-01' });
  const records = [a, b, c];
  const result = create({ records }).list();
  assert.deepEqual(ids(result), ['c', 'a', 'b']);
  assert.notEqual(result, records);
  assert.equal(result[0], c);
  assert.deepEqual(records, [a, b, c]);
});

test('list 与 listIds 使用真值 noteId 过滤，listIds 不读取正文日期或排序', () => {
  const records = [row('b', { noteId: 0 }), row('a', { noteId: 'n' })];
  Object.defineProperty(records[0], 'createdAt', {
    get() {
      throw new Error('date read');
    }
  });
  const repo = create({ records });
  for (const noteId of [undefined, null, false, 0, '']) assert.deepEqual(repo.listIds({ noteId }), ['b', 'a']);
  assert.deepEqual(repo.listIds({ noteId: 'n' }), ['a']);
  assert.deepEqual(ids(repo.list({ noteId: 'n' })), ['a']);
});

test('分页日期与 ID 降序后按哈希去重，游标不改变总数和当前版本', () => {
  const records = [
    row('a', { contentHash: 'same' }),
    row('c', { contentHash: 'same' }),
    row('b'),
    row('new', { createdAt: '2027-01-01' }),
    row('outside', { noteId: 'other' })
  ];
  const repo = create({ records });
  const first = repo.listPage({ noteId: 'n', limit: 2, currentContentHash: 'same' });
  assert.deepEqual(ids(first.items), ['new', 'c']);
  assert.equal(first.total, 3);
  assert.equal(first.currentVersionId, 'c');
  const after = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  assert.deepEqual(after, { createdAt: date, id: 'c' });
  const second = repo.listPage({ noteId: 'n', limit: 2, after, currentContentHash: 'same' });
  assert.deepEqual(ids(second.items), ['b']);
  assert.equal(second.total, 3);
  assert.equal(second.currentVersionId, 'c');
  assert.equal(second.nextCursor, null);
  assert.deepEqual(ids(records), ['a', 'c', 'b', 'new', 'outside']);
});

test('分页投影只复制五字段，历史字段和 currentVersionId 保留原值身份', () => {
  const id = {};
  const noteId = {};
  const contentHash = {};
  const createdBy = {};
  const source = { id, noteId, contentHash, createdAt: null, createdBy, content: 'not projected' };
  const summary = versionSummary(source);
  assert.deepEqual(Object.keys(summary), ['id', 'noteId', 'contentHash', 'createdAt', 'createdBy']);
  assert.equal(summary.id, id);
  assert.equal(summary.noteId, noteId);
  assert.equal(summary.contentHash, contentHash);
  assert.equal(summary.createdBy, createdBy);
  assert.equal(summary.createdAt, '1970-01-01T00:00:00.000Z');
  const page = create({ records: [source] }).listPage({ noteId, limit: 1, currentContentHash: contentHash });
  assert.equal(page.currentVersionId, id);
  assert.notEqual(page.items[0], source);
  assert.equal(page.items[0].id, id);
});

test('哈希去重使用 SameValueZero，但当前版本仍用严格相等', () => {
  const shared = {};
  const records = [
    row('g', { contentHash: NaN }),
    row('f', { contentHash: NaN }),
    row('e', { contentHash: 0 }),
    row('d', { contentHash: -0 }),
    row('c', { contentHash: shared }),
    row('b', { contentHash: shared }),
    row('a', { contentHash: {} })
  ];
  const page = create({ records }).listPage({ noteId: 'n', limit: 100, currentContentHash: NaN });
  assert.deepEqual(ids(page.items), ['g', 'e', 'c', 'a']);
  assert.equal(page.total, 4);
  assert.equal(page.currentVersionId, null);
});

test('分页保留 limit 加一的字符串拼接、切片负数和非法数值语义', () => {
  const records = Array.from({ length: 15 }, (_, index) => row(String(index).padStart(2, '0')));
  const repo = create({ records });
  assert.equal(repo.listPage({ noteId: 'n', limit: '-1' }).items.length, 3);
  assert.equal(repo.listPage({ noteId: 'n', limit: 1.5 }).items.length, 1);
  assert.equal(repo.listPage({ noteId: 'n', limit: NaN }).items.length, 0);
  assert.equal(repo.listPage({ noteId: 'n', limit: Infinity }).items.length, 15);
  for (const limit of [1n, Symbol('limit')]) assert.throws(() => repo.listPage({ noteId: 'n', limit }), TypeError);
});

test('limit 对象保留默认加法与后续数值转换的次数和顺序', () => {
  const hints = [];
  const limit = {
    [Symbol.toPrimitive](hint) {
      hints.push(hint);
      return 1;
    }
  };
  const result = create({ records: [row('b'), row('a')] }).listPage({ noteId: 'n', limit });
  assert.equal(result.items.length, 1);
  assert.notEqual(result.nextCursor, null);
  assert.deepEqual(hints, ['default', 'number', 'number']);
});

test('Date 的 Symbol、BigInt、无效日期与自定义转换错误不被吞掉', () => {
  for (const createdAt of [Symbol('date'), 1n]) {
    const repo = create({ records: [row('b', { createdAt }), row('a')] });
    assert.throws(() => repo.list(), TypeError);
    assert.throws(() => repo.listPage({ noteId: 'n', limit: 2 }), TypeError);
    assert.throws(() => versionSummary(row('a', { createdAt })), TypeError);
  }
  assert.throws(() => versionSummary(row('a', { createdAt: 'invalid' })), RangeError);
  const failure = {};
  const value = {
    [Symbol.toPrimitive]() {
      throw failure;
    }
  };
  assert.throws(() => versionSummary(row('a', { createdAt: value })), errorIs(failure));
});

test('日期无效时 list 稳定但分页仍执行 ID 比较或摘要错误', () => {
  const records = [row('a', { createdAt: 'invalid' }), row('b', { createdAt: 'invalid' })];
  assert.deepEqual(ids(create({ records }).list()), ['a', 'b']);
  assert.throws(() => create({ records }).listPage({ noteId: 'n', limit: 2 }), RangeError);
  const failure = {};
  const broken = row(
    {
      localeCompare() {
        throw failure;
      }
    },
    { createdAt: 'invalid' }
  );
  assert.throws(() => create({ records: [broken, records[0]] }).listPage({ noteId: 'n', limit: 2 }), errorIs(failure));
});

test('删除按原顺序返回记录别名，空操作不触发持久化', () => {
  const a = row('a');
  const b = row('b', { noteId: 'other' });
  const c = row('c');
  const records = [a, b, a, c];
  let writes = 0;
  const repo = create({
    records,
    onChange() {
      writes += 1;
    }
  });
  assert.equal(repo.deleteById('missing'), null);
  for (const noteIds of [[], null, undefined]) assert.deepEqual(repo.deleteByNoteIds(noteIds), []);
  assert.equal(writes, 0);
  assert.deepEqual(repo.deleteByNoteIds(new Set(['n'])), [a, a, c]);
  assert.deepEqual(records, [b]);
  assert.equal(writes, 1);
  assert.equal(repo.deleteById('b'), b);
  assert.equal(writes, 2);
});

test('批量删除中途失败保留已删部分，失败前不调用持久化', () => {
  const a = row('a');
  const b = row('b');
  const records = [a, b];
  const failure = {};
  let calls = 0;
  let writes = 0;
  records.splice = function (...args) {
    calls += 1;
    if (calls === 2) throw failure;
    return Array.prototype.splice.apply(this, args);
  };
  const repo = create({
    records,
    onChange() {
      writes += 1;
    }
  });
  assert.throws(() => repo.deleteByNoteIds(['n']), errorIs(failure));
  assert.equal(records.length, 1);
  assert.equal(records[0], b);
  assert.equal(writes, 0);
});

test('只读 getter 在原比较与投影位置重复读取，不提前缓存', () => {
  const reads = [];
  const source = row('a');
  Object.defineProperty(source, 'contentHash', {
    get() {
      reads.push('hash');
      return 'h';
    }
  });
  const page = create({ records: [source] }).listPage({ noteId: 'n', limit: 1, currentContentHash: 'h' });
  assert.equal(page.currentVersionId, 'a');
  assert.deepEqual(reads, ['hash', 'hash', 'hash', 'hash']);
  const projectionReads = [];
  const projection = Object.fromEntries(
    ['id', 'noteId', 'contentHash', 'createdAt', 'createdBy'].map(key => [key, source[key]])
  );
  for (const key of Object.keys(projection)) {
    const value = projection[key];
    Object.defineProperty(projection, key, {
      get() {
        projectionReads.push(key);
        return value;
      }
    });
  }
  versionPage([projection], { limit: 1, total: 1, currentVersionId: null });
  assert.deepEqual(projectionReads, ['id', 'noteId', 'contentHash', 'createdAt', 'createdBy']);
});

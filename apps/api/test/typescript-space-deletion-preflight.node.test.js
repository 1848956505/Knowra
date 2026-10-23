import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// 普通模式仅导入当前检出；显式基线必须读取真实主线 Git 对象，缺失即失败。
const baseline = process.env.KNOWRA_SPACE_PREFLIGHT_BASELINE === '1';
const parent = 'e290d384f50cc7113a7739de502070d2ddc50679';
const root = new URL('../../../', import.meta.url);
const preflightPath = 'apps/api/src/modules/knowledge/application/space-deletion-preflight.js';
const cache = new Map();
function moduleUrl(file) {
  if (!baseline) return new URL(file, root).href;
  if (!cache.has(file)) {
    const source = execFileSync('git', ['show', `${parent}:${file}`], { cwd: root, encoding: 'utf8' });
    const rewritten = source.replace(/from\s+(['"])(\.[^'"]+)\1/g, (match, quote, relative) => {
      const resolved = new URL(relative, new URL(file, root));
      const url = resolved.href === new URL(preflightPath, root).href ? moduleUrl(preflightPath) : resolved.href;
      return `from ${quote}${url}${quote}`;
    });
    cache.set(file, `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
  }
  return cache.get(file);
}
const { inspectSpaceDeletion: inspect, assertSpaceDeletionAllowed: allow } = await import(moduleUrl(preflightPath));
const { createSpaceAssetLifecycle } = await import(
  moduleUrl('apps/api/src/modules/knowledge/application/space-asset-lifecycle.js')
);
const { createAsyncSpaceAssetLifecycle } = await import(
  moduleUrl('apps/api/src/modules/knowledge/application/postgres-async/space-asset-lifecycle.js')
);
const space = () => ({ id: 's', updatedAt: 'stamp' });
const sameError = (operation, error) => assert.throws(operation, observed => Object.is(observed, error));
const lists = ['folders', 'notes', 'tags', 'tagGroups', 'annotations', 'analysisScopes'];
const coverage = {
  scopedAssets: true,
  globalKnowledgeAndTraining: 'not-owned-by-space',
  offlineDevices: 'pending-sync',
  backups: 'retention-managed'
};

test('JS bridge exposes only identical synchronous TS functions', { skip: baseline }, async () => {
  const js = await import(new URL(preflightPath, root));
  const ts = await import(new URL(preflightPath.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(js), ['assertSpaceDeletionAllowed', 'inspectSpaceDeletion']);
  assert.deepEqual(Object.keys(ts), Object.keys(js));
  assert.equal(js.inspectSpaceDeletion, ts.inspectSpaceDeletion);
  assert.equal(js.assertSpaceDeletionAllowed, ts.assertSpaceDeletionAllowed);
});
test('minimal output, key order, arities and synchronous void stay unchanged', () => {
  const preview = inspect({ space: space() });
  assert.equal(inspect.length, 1);
  assert.equal(allow.length, 2);
  assert.deepEqual(Object.keys(preview), [
    'asset',
    'operation',
    'decision',
    'expectedUpdatedAt',
    'references',
    'systemGroupIds',
    'coverage'
  ]);
  assert.deepEqual(preview, {
    asset: { type: 'knowledgeSpace', id: 's' },
    operation: 'delete-empty-container',
    decision: 'can-delete-empty-container',
    expectedUpdatedAt: 'stamp',
    references: [],
    systemGroupIds: [],
    coverage
  });
  assert.equal(allow(preview, 'stamp'), undefined);
  assert.equal(preview instanceof Promise, false);
});
for (const value of [undefined, null, false, 0, '', NaN])
  test(`missing falsey space: ${String(value)}`, () =>
    assert.throws(() => inspect({ space: value }), {
      name: 'AppError',
      code: 'KNOWLEDGE_SPACE_NOT_FOUND',
      statusCode: 404,
      message: '知识空间不存在。'
    }));
for (const value of [undefined, null])
  test(`missing argument is native TypeError: ${String(value)}`, () => assert.throws(() => inspect(value), TypeError));
test('argument destructuring reads all fields before missing-space guard', () => {
  const trace = [],
    input = {},
    error = {};
  for (const key of ['space', ...lists])
    Object.defineProperty(input, key, {
      get() {
        trace.push(key);
        if (key === 'analysisScopes') throw error;
        return undefined;
      }
    });
  sameError(() => inspect(input), error);
  assert.deepEqual(trace, ['space', ...lists]);
});
test('explicit undefined list fields keep defaults without changing getter order', () => {
  const trace = [],
    input = {};
  for (const key of ['space', ...lists])
    Object.defineProperty(input, key, {
      get() {
        trace.push(key);
        return key === 'space' ? space() : undefined;
      }
    });
  assert.equal(inspect(input).decision, 'can-delete-empty-container');
  assert.deepEqual(trace, ['space', ...lists]);
});
for (const key of lists)
  test(`null ${key} is not normalized, even for a protected shell`, () => {
    assert.throws(() => inspect({ space: { ...space(), defaultFlag: true }, [key]: null }), TypeError);
  });
test('six collections preserve order, duplicates, truthy retention and unvalidated IDs', () => {
  const preview = inspect({
    space: space(),
    folders: [{ id: 'f' }, { id: 'f' }],
    notes: [{ id: 'n', deleted: [] }],
    tags: [{ id: 't' }],
    tagGroups: [
      { id: 'sys', isSystem: {} },
      { id: 'custom', isSystem: 0 }
    ],
    annotations: [{}],
    analysisScopes: [{ id: 42, deletedAt: 'old' }]
  });
  assert.deepEqual(preview.references, [
    { collection: 'folders', id: 'f' },
    { collection: 'folders', id: 'f' },
    { collection: 'notes', id: 'n', retention: 'recycle-bin' },
    { collection: 'tags', id: 't' },
    { collection: 'tagGroups', id: 'custom' },
    { collection: 'contentAnnotations', id: undefined },
    { collection: 'analysisScopeSnapshots', id: 42, retention: 'recycle-bin' }
  ]);
  assert.equal(preview.decision, 'requires-content-action');
  assert.deepEqual(preview.systemGroupIds, ['sys']);
});
test('isSystem is read twice and id can appear in both output arrays', () => {
  const trace = [];
  let count = 0;
  const group = {
    get id() {
      trace.push('id');
      return 'g';
    },
    get isSystem() {
      trace.push('isSystem');
      return ++count === 2;
    }
  };
  const preview = inspect({ space: space(), tagGroups: [group] });
  assert.deepEqual(preview.references, [{ collection: 'tagGroups', id: 'g' }]);
  assert.deepEqual(preview.systemGroupIds, ['g']);
  assert.deepEqual(trace, ['isSystem', 'id', 'isSystem', 'id']);
});
test('complete field read order retains separate filter passes and return construction', () => {
  const trace = [];
  const record = (name, fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value]));
  const watched = (name, fields) => {
    const value = record(name, fields);
    for (const key of Object.keys(fields))
      Object.defineProperty(value, key, {
        get() {
          trace.push(`${name}.${key}`);
          return fields[key];
        }
      });
    return value;
  };
  const preview = inspect({
    space: watched('space', { id: 's', defaultFlag: false, updatedAt: 'stamp' }),
    folders: [watched('folder', { id: 'f' })],
    notes: [watched('note', { id: 'n', deleted: false })],
    tags: [watched('tag', { id: 't' })],
    tagGroups: [watched('custom', { id: 'c', isSystem: false }), watched('system', { id: 'g', isSystem: true })],
    annotations: [watched('annotation', { id: 'a' })],
    analysisScopes: [watched('scope', { id: 'q', deletedAt: false })]
  });
  assert.equal(preview.references.length, 6);
  assert.deepEqual(trace, [
    'folder.id',
    'note.id',
    'note.deleted',
    'tag.id',
    'custom.isSystem',
    'system.isSystem',
    'custom.id',
    'annotation.id',
    'scope.id',
    'scope.deletedAt',
    'space.id',
    'space.defaultFlag',
    'space.updatedAt',
    'custom.isSystem',
    'system.isSystem',
    'system.id'
  ]);
});
for (const value of [undefined, null, false, 0, '', NaN, true, 'false', [], {}, Symbol('flag'), 1n])
  test(`flags preserve truthiness without conversion: ${String(value)}`, () => {
    const preview = inspect({
      space: { ...space(), defaultFlag: value },
      notes: [{ id: 'n', deleted: value }],
      tagGroups: [{ id: 'g', isSystem: value }],
      analysisScopes: [{ id: 'q', deletedAt: value }]
    });
    assert.equal(preview.decision, value ? 'system-shell-protected' : 'requires-content-action');
    assert.equal(preview.references[0].retention, value ? 'recycle-bin' : 'current');
    assert.equal(preview.references.at(-1).retention, value ? 'recycle-bin' : 'current');
    assert.deepEqual(preview.systemGroupIds, value ? ['g'] : []);
  });
for (const error of [new Error('reference'), null, Symbol('reference')])
  test(`reference failure precedes protected-shell guard: ${String(error)}`, () => {
    const trace = [];
    sameError(
      () =>
        inspect({
          space: {
            id: 's',
            get defaultFlag() {
              trace.push('flag');
              return true;
            }
          },
          folders: [
            {
              get id() {
                trace.push('folder.id');
                throw error;
              }
            }
          ]
        }),
      error
    );
    assert.deepEqual(trace, ['folder.id']);
  });
test('opaque IDs/timestamps retain identity, are neither cloned nor converted', () => {
  const id = {},
    stamp = {},
    annotation = Symbol('a');
  const preview = inspect({ space: { id, updatedAt: stamp }, annotations: [{ id: annotation }] });
  assert.equal(preview.asset.id, id);
  assert.equal(preview.expectedUpdatedAt, stamp);
  assert.equal(preview.references[0].id, annotation);
  assert.throws(() => allow(preview, stamp), { code: 'KNOWLEDGE_SPACE_DELETE_BLOCKED' });
  assert.equal(allow({ expectedUpdatedAt: stamp, decision: 'can-delete-empty-container' }, stamp), undefined);
  assert.throws(() => allow(preview, {}), { code: 'KNOWLEDGE_SPACE_UPDATE_CONFLICT' });
});
test('inherited fields are read without own-property guards', () => {
  const preview = inspect(
    Object.create({ space: Object.create(space()), notes: [Object.create({ id: 'n', deleted: true })] })
  );
  assert.deepEqual(preview.references, [{ collection: 'notes', id: 'n', retention: 'recycle-bin' }]);
});
test('sparse map results become explicit undefined references, filter holes disappear', () => {
  const preview = inspect({ space: space(), folders: Array(2), tagGroups: Array(2) });
  assert.deepEqual(preview.references, [undefined, undefined]);
  assert.equal(Object.hasOwn(preview.references, 0), true);
  assert.deepEqual(preview.systemGroupIds, []);
  assert.equal(preview.decision, 'requires-content-action');
});
test('outputs stay mutable and independent without mutating frozen inputs', () => {
  const input = Object.freeze({ space: Object.freeze(space()), folders: Object.freeze([Object.freeze({ id: 'f' })]) });
  const preview = inspect(input),
    another = inspect(input);
  preview.references.push({ collection: 'notes', id: 'n' });
  preview.systemGroupIds.push('g');
  preview.asset.id = 'changed';
  preview.coverage.scopedAssets = false;
  assert.equal(another.references.length, 1);
  assert.deepEqual(another.systemGroupIds, []);
  assert.equal(another.asset.id, 's');
  assert.deepEqual(another.coverage, coverage);
  assert.equal(input.space.id, 's');
});
for (const expected of [undefined, null, false, 0, -0, 0n, NaN, ''])
  test(`falsey expected timestamp rejects before reading preflight: ${String(expected)}`, () => {
    let reads = 0;
    const preflight = {
      get expectedUpdatedAt() {
        reads++;
        throw new Error('must not read');
      }
    };
    assert.throws(() => allow(preflight, expected), {
      name: 'AppError',
      code: 'KNOWLEDGE_SPACE_UPDATE_CONFLICT',
      statusCode: 409,
      message: '空间已变化，请重新预检。'
    });
    assert.equal(reads, 0);
    assert.throws(() => allow(null, expected), { code: 'KNOWLEDGE_SPACE_UPDATE_CONFLICT' });
  });
test('conflict wins blocked decision and error factory discards preflight metadata', () => {
  let captured;
  try {
    allow(
      {
        expectedUpdatedAt: 'old',
        get decision() {
          throw new Error('must not read');
        }
      },
      'stamp'
    );
  } catch (error) {
    captured = error;
  }
  assert.equal(captured.code, 'KNOWLEDGE_SPACE_UPDATE_CONFLICT');
  assert.equal(Object.hasOwn(captured, 'preflight'), false);
  assert.equal(Object.hasOwn(captured, 'cause'), false);
  assert.deepEqual(Object.keys(captured), ['name', 'code', 'statusCode']);
});
for (const decision of [undefined, null, false, true, 'blocked', new String('can-delete-empty-container')])
  test(`matching stamp but nonexact decision blocks: ${String(decision)}`, () =>
    assert.throws(() => allow({ expectedUpdatedAt: 'stamp', decision }, 'stamp'), {
      code: 'KNOWLEDGE_SPACE_DELETE_BLOCKED',
      statusCode: 409,
      message: '请先处理空间中的资产；默认空间外壳受保护。'
    }));
for (const key of ['expectedUpdatedAt', 'decision'])
  for (const error of [new Error(key), null, Symbol(key)])
    test(`assert ${key} getter preserves thrown identity: ${String(error)}`, () => {
      const preflight = { expectedUpdatedAt: 'stamp', decision: 'can-delete-empty-container' };
      Object.defineProperty(preflight, key, {
        get() {
          throw error;
        }
      });
      sameError(() => allow(preflight, 'stamp'), error);
    });
test('truthy same opaque timestamp passes without value conversion and getters run once', () => {
  const trace = [],
    stamp = {
      [Symbol.toPrimitive]() {
        return assert.fail('no conversion');
      }
    };
  const preflight = {
    get expectedUpdatedAt() {
      trace.push('stamp');
      return stamp;
    },
    get decision() {
      trace.push('decision');
      return 'can-delete-empty-container';
    }
  };
  assert.equal(allow(preflight, stamp), undefined);
  assert.deepEqual(trace, ['stamp', 'decision']);
});

// 真实同步/异步服务只配内存端口；不连接数据库，不冒充真实 PostgreSQL 集成。
function lifecycle(asyncMode, { blocked = false, stamp = 'stamp', failDelete = false } = {}) {
  const events = [],
    groups = [
      { id: 'g1', isSystem: true },
      { id: 'g1', isSystem: true },
      { id: 'g2', isSystem: true }
    ];
  const call = (name, result) => {
    events.push(name);
    return asyncMode ? Promise.resolve(result) : result;
  };
  const ports = {
    knowledgeSpaceRepository: {
      findById: () => call('space.read', { id: 's', userId: 'owner', updatedAt: 'stamp' }),
      delete: id => {
        events.push(['space.delete', id]);
        if (failDelete) throw new Error('synthetic failure');
        return asyncMode ? Promise.resolve() : undefined;
      }
    },
    tagGroupRepository: { list: () => call('groups.read', groups), delete: id => call(`group.delete:${id}`, undefined) }
  };
  for (const name of ['folder', 'note', 'tag', 'contentAnnotation', 'analysisScope'])
    ports[`${name}Repository`] = {
      list: () => call(`${name}.read`, blocked && name === 'note' ? [{ id: 'n', deleted: true }] : [])
    };
  const runTransaction = operation => {
    events.push('begin');
    return operation(ports);
  };
  const service = (asyncMode ? createAsyncSpaceAssetLifecycle : createSpaceAssetLifecycle)({
    ...ports,
    runTransaction
  });
  return { service, events, remove: () => service.deleteEmptySpace('s', { expectedUpdatedAt: stamp }, 'owner') };
}
for (const asyncMode of [false, true]) {
  test(`actual lifecycle ${asyncMode ? 'async' : 'sync'} returns preview then deletes duplicate system IDs in order`, async () => {
    const fixture = lifecycle(asyncMode);
    const pending = fixture.service.inspectEmptySpaceDeletion('s', 'owner');
    assert.equal(pending instanceof Promise, asyncMode);
    assert.deepEqual((await pending).systemGroupIds, ['g1', 'g1', 'g2']);
    fixture.events.length = 0;
    const deleted = fixture.remove();
    assert.equal(deleted instanceof Promise, asyncMode);
    assert.deepEqual(await deleted, {
      status: 'empty-container-deleted',
      asset: { type: 'knowledgeSpace', id: 's' },
      offlineDevices: 'pending-sync',
      backups: 'retention-managed'
    });
    assert.deepEqual(fixture.events, [
      'begin',
      'space.read',
      'folder.read',
      'note.read',
      'tag.read',
      'groups.read',
      'contentAnnotation.read',
      'analysisScope.read',
      'group.delete:g1',
      'group.delete:g1',
      'group.delete:g2',
      ['space.delete', 's']
    ]);
  });
  for (const [options, code] of [
    [{ blocked: true, stamp: 'stale' }, 'KNOWLEDGE_SPACE_UPDATE_CONFLICT'],
    [{ blocked: true }, 'KNOWLEDGE_SPACE_DELETE_BLOCKED']
  ])
    test(`actual ${asyncMode ? 'async' : 'sync'} ${code} produces zero writes`, async () => {
      const fixture = lifecycle(asyncMode, options);
      if (asyncMode) await assert.rejects(fixture.remove(), { code });
      else assert.throws(fixture.remove, { code });
      assert.equal(
        fixture.events.some(event => Array.isArray(event) || event.startsWith('group.delete')),
        false
      );
    });
  test(`actual ${asyncMode ? 'async' : 'sync'} late delete failure propagates`, async () => {
    const fixture = lifecycle(asyncMode, { failDelete: true });
    if (asyncMode) await assert.rejects(fixture.remove(), { message: 'synthetic failure' });
    else assert.throws(fixture.remove, { message: 'synthetic failure' });
    assert.deepEqual(fixture.events.slice(-4), [
      'group.delete:g1',
      'group.delete:g1',
      'group.delete:g2',
      ['space.delete', 's']
    ]);
  });
}

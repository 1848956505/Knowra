import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const baseline = process.env.KNOWRA_KNOWLEDGE_QUERY_BASELINE === '1';
const commit = 'f9f0ef0a87e48d05b3c6dbd3f336fe8f1eab8aad';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
let queryModule;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-knowledge-query-'));
  try {
    let source = execFileSync(
      'git',
      ['show', `${commit}:apps/api/src/modules/knowledge/application/knowledge-workspace-query-service.js`],
      { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' }
    );
    for (const dependency of ['workspace-query-dto.js', 'workspace-query-utils.js']) {
      source = source.replace(`'./${dependency}'`, JSON.stringify(new URL(dependency, root).href));
    }
    const filename = join(directory, 'knowledge-workspace-query-service.mjs');
    writeFileSync(filename, source);
    queryModule = await import(pathToFileURL(filename).href);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  queryModule = await import(new URL('knowledge-workspace-query-service.js', root));
}
const { createKnowledgeWorkspaceQuery: create } = queryModule;
const methods = ['listKnowledgeItems', 'listLearningObjectives', 'getKnowledgeOverview'];
const errorIs = expected => actual => Object.is(actual, expected);
const timestamp = '2026-01-01T00:00:00.000Z';
function item(id = 'k', overrides = {}) {
  return {
    id,
    title: `Knowledge ${String(id)}`,
    reviewStatus: 'confirmed',
    knowledgeType: 'concept',
    updatedAt: timestamp,
    ...overrides
  };
}
function objective(id = 'o', overrides = {}) {
  return {
    id,
    knowledgeItemId: 'k',
    objective: `Objective ${String(id)}`,
    reviewStatus: 'confirmed',
    actionVerb: 'explain',
    cognitiveLevel: 'understand',
    updatedAt: timestamp,
    ...overrides
  };
}
function snapshot(overrides = {}) {
  return {
    knowledgeItems: [],
    objectives: [],
    evidence: [],
    indexes: {
      evidenceByItem: new Map(),
      objectivesByItem: new Map(),
      questionsByObjective: new Map(),
      noteById: new Map()
    },
    ...overrides
  };
}
function setup(value = snapshot()) {
  const calls = [];
  const snapshotReader = {
    load(...args) {
      calls.push({ receiver: this, args });
      return value;
    }
  };
  return { value, calls, snapshotReader, query: create({ snapshotReader }) };
}
function throwingProperty(object, key, failure) {
  Object.defineProperty(object, key, {
    configurable: true,
    get() {
      throw failure;
    }
  });
}
function ids(page) {
  return page.items.map(record => record.id);
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('knowledge query bridge preserves its sole function export and identity', { skip: baseline }, async () => {
  const ts = await import(new URL('knowledge-workspace-query-service.ts', root));
  assert.deepEqual(Object.keys(queryModule), ['createKnowledgeWorkspaceQuery']);
  assert.deepEqual(Object.keys(ts), Object.keys(queryModule));
  assert.equal(create, ts.createKnowledgeWorkspaceQuery);
});

test('factory defaults, null options and falsy load values preserve synchronous validation', () => {
  const required = error =>
    error instanceof TypeError && error.message === 'Knowledge workspace snapshot reader is required';
  for (const options of [undefined, {}, false, 1, 'text', 1n, Symbol('options')])
    assert.throws(() => create(options), required);
  assert.throws(() => create(null), TypeError);
  for (const snapshotReader of [undefined, null, false, 0, '', 1n, Symbol('reader')])
    assert.throws(() => create({ snapshotReader }), required);
  for (const load of [undefined, null, false, 0, -0, '', 0n, NaN])
    assert.throws(() => create({ snapshotReader: { load } }), required);
});

test('factory captures reader once, reads load once and preserves accessor failures', () => {
  const events = [];
  const snapshotReader = {
    get load() {
      events.push('load');
      return () => snapshot();
    }
  };
  const options = {
    get snapshotReader() {
      events.push('reader');
      return snapshotReader;
    }
  };
  assert.deepEqual(Object.keys(create(options)), methods);
  assert.deepEqual(events, ['reader', 'load']);
  for (const target of ['reader', 'load']) {
    const failure = { target };
    const options = { snapshotReader: {} };
    throwingProperty(
      target === 'reader' ? options : options.snapshotReader,
      target === 'reader' ? 'snapshotReader' : 'load',
      failure
    );
    assert.throws(() => create(options), errorIs(failure));
  }
});

test('truthy noncallable load passes construction and rejects each method asynchronously', async () => {
  for (const load of [true, 1, 1n, 'text', Symbol('load'), {}, []]) {
    const query = create({ snapshotReader: { load } });
    for (const method of methods) {
      let pending;
      assert.doesNotThrow(() => {
        pending = query[method]();
      });
      assert.ok(pending instanceof Promise);
      await assert.rejects(pending, TypeError);
    }
  }
});

test('detached methods preserve load receiver, no arguments and one fresh load per call', async () => {
  const fixture = setup();
  for (const method of methods) {
    const detached = fixture.query[method];
    await detached.call({ snapshotReader: null });
  }
  assert.equal(fixture.calls.length, 3);
  for (const call of fixture.calls) {
    assert.equal(call.receiver, fixture.snapshotReader);
    assert.deepEqual(call.args, []);
  }
});

test('list query validation precedes load while overview ignores every supplied argument', async () => {
  const fixture = setup();
  for (const method of methods.slice(0, 2)) {
    for (const [input, code] of [
      [{ limit: 0 }, 'WORKSPACE_LIMIT_INVALID'],
      [{ sort: 'title' }, 'WORKSPACE_SORT_INVALID'],
      [{ includeArchived: 'yes' }, 'WORKSPACE_BOOLEAN_INVALID'],
      [{ cursor: 'broken' }, 'WORKSPACE_CURSOR_INVALID']
    ]) {
      await assert.rejects(fixture.query[method](input), error => error.code === code);
    }
    await assert.rejects(fixture.query[method](null), TypeError);
    const failure = {};
    await assert.rejects(
      fixture.query[method]({
        get limit() {
          throw failure;
        }
      }),
      errorIs(failure)
    );
  }
  assert.equal(fixture.calls.length, 0);
  await fixture.query.getKnowledgeOverview(
    new Proxy(
      {},
      {
        get() {
          throw new Error('argument read');
        }
      }
    )
  );
  assert.equal(fixture.calls.length, 1);
});

test('load getter is reread live on every invocation without rereading options', async () => {
  let reads = 0;
  const snapshotReader = {
    get load() {
      const generation = ++reads;
      return function () {
        assert.equal(this, snapshotReader);
        return snapshot({ knowledgeItems: [item(generation)] });
      };
    }
  };
  const options = { snapshotReader };
  const query = create(options);
  options.snapshotReader = null;
  assert.equal((await query.listKnowledgeItems()).items[0].id, 2);
  assert.equal((await query.listKnowledgeItems()).items[0].id, 3);
  assert.equal((await query.getKnowledgeOverview()).recentItems[0].id, 4);
  assert.equal(reads, 4);
});

test('load awaits promise and thenable completion before inspecting the snapshot', async () => {
  for (const method of methods) {
    const gate = deferred();
    const fixture = setup(gate.promise);
    let settled = false;
    const pending = fixture.query[method]().then(result => {
      settled = true;
      return result;
    });
    await setImmediate();
    assert.equal(settled, false);
    gate.resolve(snapshot());
    await pending;
    assert.equal(settled, true);
    const thenable = {
      then(resolve) {
        assert.equal(this, thenable);
        resolve(snapshot());
      }
    };
    await setup(thenable).query[method]();
  }
});

test('load throws, rejections and then access errors preserve all rejection values', async () => {
  for (const failure of [undefined, null, false, 0, -0, '', NaN, 1n, Symbol('failure'), {}]) {
    for (const method of methods) {
      for (const mode of ['throw', 'reject', 'then getter', 'then body', 'load getter']) {
        const snapshotReader = {
          load() {
            if (mode === 'throw') throw failure;
            if (mode === 'reject') return Promise.reject(failure);
            if (mode === 'then getter')
              return {
                get then() {
                  throw failure;
                }
              };
            return {
              then() {
                throw failure;
              }
            };
          }
        };
        const query = create({ snapshotReader });
        if (mode === 'load getter') throwingProperty(snapshotReader, 'load', failure);
        await assert.rejects(query[method](), errorIs(failure));
      }
    }
  }
});

test('malformed snapshots fail asynchronously rather than receiving defensive defaults', async () => {
  for (const value of [null, undefined, false, 0, '', {}, { knowledgeItems: null, objectives: null }]) {
    for (const method of methods)
      await assert.rejects(create({ snapshotReader: { load: () => value } })[method](), TypeError);
  }
});

test('empty list responses retain exact pagination defaults and independent allocation', async () => {
  const fixture = setup();
  const expected = {
    items: [],
    pagination: { limit: 20, sort: 'updated-desc', total: 0, hasMore: false, nextCursor: null }
  };
  const first = await fixture.query.listKnowledgeItems();
  assert.deepEqual(first, expected);
  assert.deepEqual(await fixture.query.listKnowledgeItems(undefined), expected);
  const second = await fixture.query.listLearningObjectives();
  assert.deepEqual(second, expected);
  assert.notEqual(first.items, second.items);
  assert.notEqual(first.pagination, second.pagination);
});

test('knowledge lists use deletedAt truthiness and exact archived status rather than extra normalization', async () => {
  const knowledgeItems = [
    item('active'),
    item('archived', { reviewStatus: 'archived' }),
    item('legacy', { reviewStatus: 'ARCHIVED' }),
    item('deleted', { deletedAt: 'now' }),
    item('zero', { deletedAt: 0 }),
    item('false', { deletedAt: false }),
    item('null', { deletedAt: null })
  ];
  const fixture = setup(snapshot({ knowledgeItems }));
  assert.deepEqual(ids(await fixture.query.listKnowledgeItems()).sort(), ['active', 'false', 'legacy', 'null', 'zero']);
  assert.deepEqual(ids(await fixture.query.listKnowledgeItems({ includeArchived: 'true' })).sort(), [
    'active',
    'archived',
    'false',
    'legacy',
    'null',
    'zero'
  ]);
  assert.equal(knowledgeItems.length, 7);
});

test('knowledge filters use projected counts and statuses and search all three text fields', async () => {
  const value = snapshot({
    knowledgeItems: [
      item('a', { title: 'Alpha', canonicalStatement: 'Rare theorem', userExplanation: 'My explanation' }),
      item('b', { knowledgeType: 'procedure', reviewStatus: 'draft' })
    ]
  });
  value.indexes.evidenceByItem.set('a', [{ status: 'valid' }]);
  value.indexes.objectivesByItem.set('a', [objective()]);
  value.indexes.questionsByObjective.set('o', [{ id: 'q', reviewStatus: 'archived' }]);
  const query = setup(value).query;
  for (const text of [' ALPHA ', 'RARE THEOREM', 'my explanation'])
    assert.deepEqual(ids(await query.listKnowledgeItems({ query: text })), ['a']);
  assert.deepEqual(
    ids(await query.listKnowledgeItems({ reviewStatus: 'confirmed', knowledgeType: 'concept', sourceStatus: 'valid' })),
    ['a']
  );
  assert.deepEqual(
    ids(
      await query.listKnowledgeItems({
        evidenceStatus: 'insufficient',
        missingObjectives: true,
        missingQuestions: 'true'
      })
    ),
    ['b']
  );
  assert.deepEqual(ids(await query.listKnowledgeItems({ knowledgeType: 'Concept' })), []);
  assert.deepEqual(ids(await query.listKnowledgeItems({ actionVerb: 'ignored', hasQuestions: false })).sort(), [
    'a',
    'b'
  ]);
});

test('knowledge DTO contains active objective counts but questions include archived objectives and questions', async () => {
  const value = snapshot({ knowledgeItems: [item()] });
  value.indexes.objectivesByItem.set('k', [
    objective('active'),
    objective('draft', { reviewStatus: 'draft' }),
    objective('archived', { reviewStatus: 'archived' })
  ]);
  value.indexes.questionsByObjective.set('active', [{ id: 'q1', reviewStatus: 'archived' }]);
  value.indexes.questionsByObjective.set('archived', [{ id: 'q2', reviewStatus: 'archived' }]);
  const dto = (await setup(value).query.listKnowledgeItems()).items[0];
  assert.equal(dto.objectiveCount, 2);
  assert.equal(dto.confirmedObjectiveCount, 1);
  assert.equal(dto.questionCount, 2);
  assert.deepEqual(dto.noteIds, []);
});

test('objective filtering preserves archive-only removal and ignores deletedAt', async () => {
  const value = snapshot({
    objectives: [
      objective('active'),
      objective('archived', { reviewStatus: 'archived' }),
      objective('deleted', { deletedAt: 'now' })
    ]
  });
  const query = setup(value).query;
  assert.deepEqual(ids(await query.listLearningObjectives()), ['active', 'deleted']);
  assert.deepEqual(ids(await query.listLearningObjectives({ includeArchived: true })), [
    'active',
    'archived',
    'deleted'
  ]);
  assert.equal((await query.listLearningObjectives()).items[0].knowledgeItem, null);
});

test('objective filters use exact fields and active question counts with includeArchived override', async () => {
  const value = snapshot({
    objectives: [
      objective('a'),
      objective('b', { actionVerb: 'apply', cognitiveLevel: 'apply', knowledgeItemId: 'other', reviewStatus: 'draft' })
    ]
  });
  value.indexes.questionsByObjective.set('a', [{ id: 'old', reviewStatus: 'archived' }]);
  value.indexes.questionsByObjective.set('b', [{ id: 'new', reviewStatus: 'confirmed' }]);
  const query = setup(value).query;
  assert.deepEqual(
    ids(
      await query.listLearningObjectives({
        hasQuestions: false,
        reviewStatus: 'confirmed',
        actionVerb: 'explain',
        cognitiveLevel: 'understand',
        knowledgeItemId: 'k'
      })
    ),
    ['a']
  );
  assert.deepEqual(ids(await query.listLearningObjectives({ hasQuestions: 'true' })), ['b']);
  assert.deepEqual(ids(await query.listLearningObjectives({ includeArchived: true, hasQuestions: true })), ['a', 'b']);
  assert.deepEqual((await query.listLearningObjectives({ includeArchived: true })).items[0].questionIds, ['old']);
  assert.deepEqual(ids(await query.listLearningObjectives({ knowledgeType: 'ignored', missingQuestions: true })), [
    'a',
    'b'
  ]);
});

test('objective search uses title and objective but never canonicalStatement omitted by summary projection', async () => {
  const value = snapshot({
    knowledgeItems: [item('k', { title: 'Unique title', canonicalStatement: 'Hidden canonical' })],
    objectives: [objective('o', { objective: 'Visible action' })]
  });
  const query = setup(value).query;
  assert.deepEqual(ids(await query.listLearningObjectives({ query: 'unique' })), ['o']);
  assert.deepEqual(ids(await query.listLearningObjectives({ query: 'VISIBLE' })), ['o']);
  assert.deepEqual(ids(await query.listLearningObjectives({ query: 'hidden canonical' })), []);
  assert.deepEqual(Object.keys((await query.listLearningObjectives()).items[0].knowledgeItem), [
    'id',
    'title',
    'reviewStatus',
    'evidenceStatus'
  ]);
});

test('both list methods preserve sorting, cursor pagination, maximum limit and original collection order', async () => {
  for (const [method, key, factory] of [
    ['listKnowledgeItems', 'knowledgeItems', item],
    ['listLearningObjectives', 'objectives', objective]
  ]) {
    const records = [
      factory('c', { updatedAt: '2026-03-01' }),
      factory('b', { updatedAt: '2026-02-01' }),
      factory('a', { updatedAt: '2026-02-01' })
    ];
    const query = setup(snapshot({ [key]: records })).query;
    const page = await query[method]({ limit: '2' });
    assert.deepEqual(ids(page), ['c', 'a']);
    assert.deepEqual(page.pagination, {
      limit: 2,
      sort: 'updated-desc',
      total: 3,
      hasMore: true,
      nextCursor: Buffer.from(JSON.stringify({ updatedAt: '2026-02-01', id: 'a' })).toString('base64url')
    });
    const last = await query[method]({ limit: 2, cursor: page.pagination.nextCursor });
    assert.deepEqual(ids(last), ['b']);
    assert.equal(last.pagination.hasMore, false);
    assert.equal(last.pagination.nextCursor, null);
    assert.deepEqual(ids(await query[method]({ sort: 'updated-asc', limit: 100 })), ['a', 'b', 'c']);
    assert.deepEqual(
      records.map(record => record.id),
      ['c', 'b', 'a']
    );
  }
});

test('sparse filter skips holes in knowledge lists and overview but summary Map construction exposes holes', async () => {
  const sparse = new Array(4);
  sparse[2] = item();
  const fixture = setup(snapshot({ knowledgeItems: sparse }));
  assert.deepEqual(ids(await fixture.query.listKnowledgeItems()), ['k']);
  assert.equal((await fixture.query.getKnowledgeOverview()).knowledgeItems.total, 1);
  await assert.rejects(fixture.query.listLearningObjectives(), TypeError);
  const objectives = new Array(3);
  objectives[1] = objective();
  assert.deepEqual(ids(await setup(snapshot({ objectives })).query.listLearningObjectives()), ['o']);
});

test('Array species survives projection and overview while list pagination deliberately returns plain arrays', async () => {
  class Records extends Array {}
  const knowledgeItems = new Records(item('b'), item('a'));
  const fixture = setup(snapshot({ knowledgeItems }));
  assert.equal(Object.getPrototypeOf((await fixture.query.listKnowledgeItems()).items), Array.prototype);
  const overview = await fixture.query.getKnowledgeOverview();
  assert.ok(overview.recentItems instanceof Records);
  assert.equal(overview.recentItems.length, 2);
  assert.deepEqual(
    [...knowledgeItems].map(record => record.id),
    ['b', 'a']
  );
  class PlainRecords extends Array {
    static get [Symbol.species]() {
      return Array;
    }
  }
  assert.equal(
    Object.getPrototypeOf(
      (await setup(snapshot({ knowledgeItems: new PlainRecords(item()) })).query.getKnowledgeOverview()).recentItems
    ),
    Array.prototype
  );
});

test('knowledge custom filter-map-filter chain honors live receivers, callbacks and final iterable', async () => {
  const events = [];
  const record = item();
  let dto;
  const final = {
    *[Symbol.iterator]() {
      events.push('iterate');
      yield dto;
    }
  };
  const fourth = {
    get filter() {
      events.push('filter getter 3');
      return function (predicate) {
        assert.equal(this, fourth);
        assert.equal(predicate(dto), true);
        assert.equal(predicate({ ...dto, title: 'miss' }), false);
        events.push('filter 3');
        return final;
      };
    }
  };
  const third = {
    map(callback) {
      assert.equal(this, third);
      dto = callback(record);
      events.push('map');
      return fourth;
    }
  };
  const second = {
    filter(predicate) {
      assert.equal(this, second);
      assert.equal(predicate(record), true);
      assert.equal(predicate({ reviewStatus: 'archived' }), false);
      events.push('filter 2');
      return third;
    }
  };
  const first = {
    filter(predicate) {
      assert.equal(this, first);
      assert.equal(predicate(record), true);
      assert.equal(predicate({ deletedAt: 'yes' }), false);
      events.push('filter 1');
      return second;
    }
  };
  const page = await setup(snapshot({ knowledgeItems: first })).query.listKnowledgeItems({ query: 'knowledge' });
  assert.equal(page.items[0], dto);
  assert.deepEqual(events, ['filter 1', 'filter 2', 'map', 'filter getter 3', 'filter 3', 'iterate']);
});

test('objective custom map iterable builds summary Map and custom filter chain preserves result', async () => {
  const record = item();
  let dto;
  const knowledgeItems = {
    map(callback) {
      assert.equal(this, knowledgeItems);
      assert.deepEqual(callback(record), ['k', record]);
      return new Map([['ignored', ['k', record]]]).values();
    }
  };
  const final = new Set();
  const mapped = {
    filter(predicate) {
      assert.equal(this, mapped);
      assert.equal(predicate(dto), true);
      final.add(dto);
      return final;
    }
  };
  const filtered = {
    map(callback) {
      assert.equal(this, filtered);
      dto = callback(objective());
      return mapped;
    }
  };
  const objectives = {
    filter(predicate) {
      assert.equal(this, objectives);
      assert.equal(predicate(objective('archived', { reviewStatus: 'archived' })), false);
      return filtered;
    }
  };
  const page = await setup(snapshot({ knowledgeItems, objectives })).query.listLearningObjectives();
  assert.equal(page.items[0], dto);
  assert.equal(dto.knowledgeItem.title, record.title);
});

test('custom list final results retain iterator errors and noniterable failures without normalizing', async () => {
  for (const method of methods.slice(0, 2)) {
    for (const result of [undefined, null, false, 0, {}, { [Symbol.iterator]: null }]) {
      const mapped = { filter: () => result };
      const value = snapshot();
      if (method === 'listKnowledgeItems')
        value.knowledgeItems = { filter: () => ({ filter: () => ({ map: () => mapped }) }) };
      else value.objectives = { filter: () => ({ map: () => mapped }) };
      await assert.rejects(setup(value).query[method](), TypeError);
    }
    for (const stage of ['iterator getter', 'iterator call', 'next']) {
      const failure = { method, stage };
      const result = {
        [Symbol.iterator]() {
          if (stage === 'iterator call') throw failure;
          return {
            next() {
              throw failure;
            }
          };
        }
      };
      if (stage === 'iterator getter') throwingProperty(result, Symbol.iterator, failure);
      const mapped = { filter: () => result };
      const value = snapshot();
      if (method === 'listKnowledgeItems')
        value.knowledgeItems = { filter: () => ({ filter: () => ({ map: () => mapped }) }) };
      else value.objectives = { filter: () => ({ map: () => mapped }) };
      await assert.rejects(setup(value).query[method](), errorIs(failure));
    }
  }
});

test('overview uses custom map, reduce, filter, sort, slice and final map results without claiming arrays', async () => {
  const events = [];
  const token = Symbol('recent result');
  const countResult = { custom: 'counts' };
  const mapped = {
    length: 'custom total',
    reduce(callback, initial) {
      assert.equal(this, mapped);
      assert.deepEqual(initial, {});
      events.push('reduce');
      return countResult;
    },
    filter(predicate) {
      assert.equal(this, mapped);
      assert.equal(predicate({ confirmedObjectiveCount: 0, questionCount: 0 }), true);
      events.push('coverage');
      return { length: 'custom coverage' };
    },
    sort(compare) {
      assert.equal(this, mapped);
      assert.equal(typeof compare, 'function');
      events.push('sort');
      return sorted;
    }
  };
  const sorted = {
    slice(start, end) {
      assert.equal(this, sorted);
      assert.deepEqual([start, end], [0, 5]);
      events.push('slice');
      return sliced;
    }
  };
  const sliced = {
    map(callback) {
      assert.equal(this, sliced);
      assert.deepEqual(callback({ id: 1, title: 2, reviewStatus: 3, evidenceStatus: 4, updatedAt: 5, extra: 6 }), {
        id: 1,
        title: 2,
        reviewStatus: 3,
        evidenceStatus: 4,
        updatedAt: 5
      });
      events.push('recent map');
      return token;
    }
  };
  const filtered = {
    map(callback) {
      assert.equal(typeof callback, 'function');
      assert.equal(this, filtered);
      events.push('map');
      return mapped;
    }
  };
  const knowledgeItems = {
    filter(predicate) {
      assert.equal(predicate({ deletedAt: null }), true);
      events.push('filter');
      return filtered;
    }
  };
  const overview = await setup(snapshot({ knowledgeItems })).query.getKnowledgeOverview();
  assert.equal(overview.knowledgeItems.total, 'custom total');
  assert.equal(overview.knowledgeItems.byReviewStatus, countResult);
  assert.equal(overview.knowledgeItems.byKnowledgeType, countResult);
  assert.equal(overview.evidence.byHealth, countResult);
  assert.equal(overview.learningObjectives.withoutConfirmedObjective, 'custom coverage');
  assert.equal(overview.coverage.itemsWithoutQuestions, 'custom coverage');
  assert.equal(overview.recentItems, token);
  assert.deepEqual(events, [
    'filter',
    'map',
    'reduce',
    'reduce',
    'reduce',
    'coverage',
    'coverage',
    'coverage',
    'sort',
    'slice',
    'recent map'
  ]);
});

test('overview countBy preserves inherited keys, symbols and unknown buckets', async () => {
  const symbol = Symbol('status');
  const value = snapshot({
    knowledgeItems: [
      item('a', { reviewStatus: 'toString', knowledgeType: '__proto__' }),
      item('b', { reviewStatus: 'constructor', knowledgeType: null }),
      item('c', { reviewStatus: symbol, knowledgeType: undefined })
    ],
    evidence: [{ status: 'toString' }, { status: symbol }, { status: null }, {}]
  });
  const overview = await setup(value).query.getKnowledgeOverview();
  assert.equal(overview.knowledgeItems.byReviewStatus.toString, String(Object.prototype.toString) + '1');
  assert.equal(overview.knowledgeItems.byReviewStatus.constructor, String(Object) + '1');
  assert.equal(overview.knowledgeItems.byReviewStatus[symbol], 1);
  assert.equal(Object.hasOwn(overview.knowledgeItems.byKnowledgeType, '__proto__'), false);
  assert.equal(Object.getPrototypeOf(overview.knowledgeItems.byKnowledgeType), Object.prototype);
  assert.equal(overview.knowledgeItems.byKnowledgeType.unknown, 2);
  assert.equal(overview.evidence.byStatus.unknown, 2);
  assert.equal(overview.evidence.byStatus[symbol], 1);
});

test('overview counts include archived items and all raw evidence but exclude deleted items and archived objectives', async () => {
  const value = snapshot({
    knowledgeItems: [
      item('active'),
      item('archived', { reviewStatus: 'archived' }),
      item('deleted', { deletedAt: 'now' })
    ],
    objectives: [
      objective(),
      objective('archived', { reviewStatus: 'archived' }),
      objective('deleted', { deletedAt: 'now', reviewStatus: 'draft' })
    ],
    evidence: [
      { status: 'invalid', knowledgeItemId: 'deleted' },
      { status: 'stale', knowledgeItemId: 'orphan' }
    ]
  });
  const overview = await setup(value).query.getKnowledgeOverview();
  assert.deepEqual(overview.knowledgeItems, {
    total: 2,
    byReviewStatus: { confirmed: 1, archived: 1 },
    byKnowledgeType: { concept: 2 }
  });
  assert.deepEqual(overview.evidence, { byStatus: { invalid: 1, stale: 1 }, byHealth: { insufficient: 2 } });
  assert.deepEqual(overview.learningObjectives, {
    total: 2,
    byReviewStatus: { confirmed: 1, draft: 1 },
    withoutConfirmedObjective: 2
  });
  assert.deepEqual(overview.coverage, { itemsWithoutConfirmedObjective: 2, itemsWithoutQuestions: 2 });
});

test('overview generatedAt is fresh ISO time and recent items are sorted, limited and projected exactly', async () => {
  const knowledgeItems = Array.from({ length: 8 }, (_, index) =>
    item(String(index), { updatedAt: `2026-01-0${index + 1}` })
  );
  const value = snapshot({ knowledgeItems });
  const before = Date.now();
  const overview = await setup(value).query.getKnowledgeOverview();
  const after = Date.now();
  assert.equal(new Date(overview.generatedAt).toISOString(), overview.generatedAt);
  assert.ok(Date.parse(overview.generatedAt) >= before && Date.parse(overview.generatedAt) <= after);
  assert.deepEqual(
    overview.recentItems.map(record => record.id),
    ['7', '6', '5', '4', '3']
  );
  assert.deepEqual(Object.keys(overview.recentItems[0]), [
    'id',
    'title',
    'reviewStatus',
    'evidenceStatus',
    'updatedAt'
  ]);
  assert.deepEqual(
    knowledgeItems.map(record => record.id),
    ['0', '1', '2', '3', '4', '5', '6', '7']
  );
});

test('overview evaluates generatedAt before counts and does not sort until all counts finish', async () => {
  const events = [];
  const records = [];
  records.reduce = function () {
    events.push('count');
    return {};
  };
  records.filter = function () {
    events.push('coverage');
    return [];
  };
  records.sort = function () {
    events.push('sort');
    return [];
  };
  const value = snapshot({ knowledgeItems: { filter: () => ({ map: () => records }) } });
  const NativeDate = globalThis.Date;
  class ObservedDate extends NativeDate {
    constructor(...args) {
      super(...args);
      events.push(`date:${args.length}`);
    }
    toISOString() {
      events.push('iso');
      return super.toISOString();
    }
  }
  globalThis.Date = ObservedDate;
  try {
    await setup(value).query.getKnowledgeOverview();
  } finally {
    globalThis.Date = NativeDate;
  }
  assert.deepEqual(events, ['date:0', 'iso', 'count', 'count', 'count', 'coverage', 'coverage', 'coverage', 'sort']);
});

test('Date objects and invalid timestamps retain native sorting and string ID tie breaks', async () => {
  for (const method of ['listKnowledgeItems', 'getKnowledgeOverview']) {
    const dated = snapshot({
      knowledgeItems: [item('old', { updatedAt: new Date('2020-01-01') }), item('new', { updatedAt: '2030-01-01' })]
    });
    const result = await setup(dated).query[method]();
    assert.deepEqual(
      (result.items ?? result.recentItems).map(record => record.id),
      ['new', 'old']
    );
    const invalid = snapshot({
      knowledgeItems: [
        item('z', { updatedAt: 'invalid' }),
        item('a', { updatedAt: undefined }),
        item('m', { updatedAt: new Date(NaN) })
      ]
    });
    const resultWithInvalidDates = await setup(invalid).query[method]();
    assert.deepEqual(
      (resultWithInvalidDates.items ?? resultWithInvalidDates.recentItems).map(record => record.id),
      ['a', 'm', 'z']
    );
  }
});

test('Symbol and BigInt timestamps reject natively only when comparator actually runs', async () => {
  for (const updatedAt of [Symbol('time'), 1n]) {
    for (const method of ['listKnowledgeItems', 'getKnowledgeOverview']) {
      const single = await setup(snapshot({ knowledgeItems: [item('single', { updatedAt })] })).query[method]();
      assert.equal((single.items ?? single.recentItems)[0].updatedAt, updatedAt);
      await assert.rejects(
        setup(snapshot({ knowledgeItems: [item('a'), item('b', { updatedAt })] })).query[method](),
        TypeError
      );
    }
  }
  const value = snapshot({ knowledgeItems: [item(Symbol('z')), item(1n), item(Symbol('a'))] });
  assert.equal((await setup(value).query.getKnowledgeOverview()).recentItems.length, 3);
});

test('Date coercion and ID string conversion exceptions preserve identity', async () => {
  for (const field of ['updatedAt', 'id']) {
    for (const method of ['listKnowledgeItems', 'getKnowledgeOverview']) {
      const failure = { field, method };
      const bad = {
        [Symbol.toPrimitive]() {
          throw failure;
        }
      };
      const records = [item('a'), item('b', { [field]: bad })];
      await assert.rejects(setup(snapshot({ knowledgeItems: records })).query[method](), errorIs(failure));
    }
  }
});

test('question aggregation uses SameValueZero Map keys and reads every duplicate ID in encounter order', async () => {
  const objectKey = {};
  const symbol = Symbol('question');
  const seen = [];
  const records = [undefined, null, NaN, NaN, 0, -0, objectKey, objectKey, symbol].map((id, index) => ({
    get id() {
      seen.push(index);
      return id;
    },
    reviewStatus: 'archived'
  }));
  const value = snapshot({ knowledgeItems: [item()] });
  value.indexes.objectivesByItem.set('k', [objective('first'), objective('second', { reviewStatus: 'archived' })]);
  value.indexes.questionsByObjective.set('first', records.slice(0, 5));
  value.indexes.questionsByObjective.set('second', records.slice(5));
  const dto = (await setup(value).query.listKnowledgeItems()).items[0];
  assert.equal(dto.questionCount, 6);
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('summary Map uses last duplicate item for string, object, Symbol, NaN and zero keys', async () => {
  for (const key of ['same', {}, Symbol('key'), NaN, 0, undefined]) {
    const first = item('first', { id: key, title: 'first' });
    const last = item('last', { id: Object.is(key, 0) ? -0 : key, title: 'last' });
    const value = snapshot({ knowledgeItems: [first, last], objectives: [objective('o', { knowledgeItemId: key })] });
    const dto = (await setup(value).query.listLearningObjectives()).items[0];
    assert.equal(dto.knowledgeItem.title, 'last');
    assert.ok(Object.is(dto.knowledgeItem.id, last.id));
  }
});

test('summary cache reads item details and evidence once per key per call and returns fresh DTO summaries', async () => {
  let titles = 0;
  let evidenceReads = 0;
  const record = item();
  Object.defineProperty(record, 'title', {
    get() {
      return `title${++titles}`;
    }
  });
  const value = snapshot({
    knowledgeItems: [record],
    objectives: [
      objective('a'),
      objective('b'),
      objective('missing-a', { knowledgeItemId: 'missing' }),
      objective('missing-b', { knowledgeItemId: 'missing' })
    ]
  });
  value.indexes.evidenceByItem = {
    get(key) {
      assert.equal(key, 'k');
      evidenceReads++;
      return [];
    }
  };
  const fixture = setup(value);
  const first = await fixture.query.listLearningObjectives();
  assert.equal(titles, 1);
  assert.equal(evidenceReads, 1);
  assert.deepEqual(first.items[0].knowledgeItem, first.items[1].knowledgeItem);
  assert.notEqual(first.items[0].knowledgeItem, first.items[1].knowledgeItem);
  assert.equal(first.items[2].knowledgeItem, null);
  assert.equal(first.items[3].knowledgeItem, null);
  const second = await fixture.query.listLearningObjectives();
  assert.equal(second.items[0].knowledgeItem.title, 'title2');
  assert.equal(evidenceReads, 2);
});

test('objective summaries retain archived and deleted knowledge items without expansive DTO reads', async () => {
  const record = item('k', { reviewStatus: 'archived', deletedAt: 'now' });
  for (const field of [
    'canonicalStatement',
    'userExplanation',
    'knowledgeType',
    'importance',
    'sourceMode',
    'createdAt',
    'updatedAt'
  ])
    throwingProperty(record, field, new Error(`unneeded item field ${field}`));
  const evidence = {
    map(callback) {
      assert.equal(callback({ status: 'stale' }), 'stale');
      return ['stale'];
    }
  };
  const value = snapshot({ knowledgeItems: [record], objectives: [objective()] });
  value.indexes.evidenceByItem.set('k', evidence);
  for (const field of ['objectivesByItem', 'noteById'])
    throwingProperty(value.indexes, field, new Error(`unneeded index ${field}`));
  const dto = (await setup(value).query.listLearningObjectives()).items[0];
  assert.deepEqual(dto.knowledgeItem, {
    id: 'k',
    title: 'Knowledge k',
    reviewStatus: 'archived',
    evidenceStatus: 'stale'
  });
});

test('summary item id getters are reread for Map key, projection and evidence lookup', async () => {
  const reads = [];
  let index = 0;
  const record = item();
  Object.defineProperty(record, 'id', {
    get() {
      const value = ['lookup', 'projected', 'evidence'][index++];
      reads.push(value);
      return value;
    }
  });
  const value = snapshot({ knowledgeItems: [record], objectives: [objective('o', { knowledgeItemId: 'lookup' })] });
  value.indexes.evidenceByItem = {
    get(key) {
      assert.equal(key, 'evidence');
      return [{ status: 'valid' }];
    }
  };
  const dto = (await setup(value).query.listLearningObjectives()).items[0];
  assert.deepEqual(reads, ['lookup', 'projected', 'evidence']);
  assert.equal(dto.knowledgeItem.id, 'projected');
  assert.equal(dto.knowledgeItem.evidenceStatus, 'valid');
});

test('knowledge objective index is read twice and custom filter/map/forEach results are honored', async () => {
  const events = [];
  const value = snapshot({ knowledgeItems: [item()] });
  const ids = {
    forEach(callback) {
      assert.equal(this, ids);
      events.push('forEach');
      assert.equal(callback('o'), undefined);
    }
  };
  const filtered = {
    map(callback) {
      assert.equal(this, filtered);
      assert.equal(callback({ id: 'o' }), 'o');
      events.push('map ids');
      return ids;
    }
  };
  const aggregate = {
    filter(predicate) {
      assert.equal(this, aggregate);
      assert.equal(predicate({ reviewStatus: 'archived' }), true);
      events.push('aggregate filter');
      return filtered;
    }
  };
  const active = {
    length: 'active count',
    filter(predicate) {
      assert.equal(predicate({ reviewStatus: 'confirmed' }), true);
      return { length: 'confirmed count' };
    }
  };
  const projection = {
    filter(predicate) {
      assert.equal(predicate({ reviewStatus: 'archived' }), false);
      events.push('projection filter');
      return active;
    }
  };
  let gets = 0;
  value.indexes.objectivesByItem = {
    get(key) {
      assert.equal(key, 'k');
      return ++gets === 1 ? projection : aggregate;
    }
  };
  value.indexes.questionsByObjective = {
    get(key) {
      assert.equal(key, 'o');
      return new Set([{ id: 'q' }]);
    }
  };
  const dto = (await setup(value).query.listKnowledgeItems()).items[0];
  assert.equal(gets, 2);
  assert.equal(dto.objectiveCount, 'active count');
  assert.equal(dto.confirmedObjectiveCount, 'confirmed count');
  assert.equal(dto.questionCount, 1);
  assert.deepEqual(events, ['aggregate filter', 'map ids', 'forEach', 'projection filter']);
});

test('question iterator closes when record id access throws and forwards exact failure', async () => {
  const failure = {};
  let closed = 0;
  const record = {};
  throwingProperty(record, 'id', failure);
  const questions = {
    [Symbol.iterator]() {
      return {
        next() {
          return { done: false, value: record };
        },
        return() {
          closed++;
          return { done: true };
        }
      };
    }
  };
  const value = snapshot({ knowledgeItems: [item()] });
  value.indexes.objectivesByItem.set('k', [objective()]);
  value.indexes.questionsByObjective.set('o', questions);
  await assert.rejects(setup(value).query.listKnowledgeItems(), errorIs(failure));
  assert.equal(closed, 1);
});

test('indexed collection nullish fallbacks do not replace other malformed falsy values', async () => {
  for (const index of ['evidenceByItem', 'objectivesByItem', 'questionsByObjective']) {
    for (const result of [undefined, null, false, 0, '']) {
      const value = snapshot({ knowledgeItems: [item()] });
      value.indexes.objectivesByItem.set('k', [objective()]);
      value.indexes[index] = { get: () => result };
      const pending = setup(value).query.listKnowledgeItems();
      if (result == null || (index === 'questionsByObjective' && result === ''))
        assert.equal((await pending).items.length, 1);
      else await assert.rejects(pending, TypeError);
    }
  }
});

test('activeQuestions returns custom filter output with arbitrary length and map result unchanged', async () => {
  const questionIds = Symbol('ids');
  const length = { count: true };
  const filtered = {
    length,
    map(callback) {
      assert.equal(this, filtered);
      assert.equal(callback({ id: 'projected' }), 'projected');
      return questionIds;
    }
  };
  const questions = {
    filter(predicate) {
      assert.equal(this, questions);
      assert.equal(predicate({ reviewStatus: 'archived' }), false);
      assert.equal(predicate({ reviewStatus: 'draft' }), true);
      return filtered;
    }
  };
  const value = snapshot({ objectives: [objective()] });
  value.indexes.questionsByObjective.set('o', questions);
  const dto = (await setup(value).query.listLearningObjectives()).items[0];
  assert.equal(dto.questionCount, length);
  assert.equal(dto.questionIds, questionIds);
});

test('dynamic snapshot index access and get methods retain receivers and call order', async () => {
  const events = [];
  const value = snapshot({ knowledgeItems: [item()] });
  const indexes = value.indexes;
  Object.defineProperty(value, 'indexes', {
    get() {
      events.push('indexes');
      return indexes;
    }
  });
  for (const key of ['evidenceByItem', 'objectivesByItem']) {
    const map = indexes[key];
    Object.defineProperty(map, 'get', {
      get() {
        events.push(`${key} getter`);
        return function (id) {
          assert.equal(this, map);
          events.push(`${key}:${id}`);
          return [];
        };
      }
    });
  }
  await setup(value).query.listKnowledgeItems();
  assert.deepEqual(events, [
    'indexes',
    'evidenceByItem getter',
    'evidenceByItem:k',
    'indexes',
    'objectivesByItem getter',
    'objectivesByItem:k',
    'indexes',
    'objectivesByItem getter',
    'objectivesByItem:k',
    'indexes'
  ]);
});

test('record, collection and lookup failures propagate exact identity from each list phase', async () => {
  for (const method of methods.slice(0, 2)) {
    for (const stage of ['source', 'filter', 'projection', 'index']) {
      const failure = { method, stage };
      const isKnowledge = method === 'listKnowledgeItems';
      const value = snapshot({ knowledgeItems: [item()], objectives: [objective()] });
      if (stage === 'source') throwingProperty(value, isKnowledge ? 'knowledgeItems' : 'objectives', failure);
      if (stage === 'filter')
        throwingProperty(isKnowledge ? value.knowledgeItems : value.objectives, 'filter', failure);
      if (stage === 'projection')
        throwingProperty(
          isKnowledge ? value.knowledgeItems[0] : value.objectives[0],
          'title' in (isKnowledge ? value.knowledgeItems[0] : value.objectives[0]) ? 'title' : 'objective',
          failure
        );
      if (stage === 'index') throwingProperty(value.indexes, 'evidenceByItem', failure);
      await assert.rejects(setup(value).query[method](), errorIs(failure));
    }
  }
});

test('summary Map constructor preserves custom iterable, nullish empty entries and invalid entry errors', async () => {
  for (const result of [undefined, null]) {
    const dto = (
      await setup(
        snapshot({ knowledgeItems: { map: () => result }, objectives: [objective()] })
      ).query.listLearningObjectives()
    ).items[0];
    assert.equal(dto.knowledgeItem, null);
  }
  for (const result of [false, 1, {}, [null], [undefined], ['not entry']])
    await assert.rejects(
      setup(snapshot({ knowledgeItems: { map: () => result } })).query.listLearningObjectives(),
      TypeError
    );
  const failure = {};
  let closed = false;
  const entry = { 1: item() };
  throwingProperty(entry, '0', failure);
  const iterable = {
    [Symbol.iterator]() {
      return {
        next() {
          return { done: false, value: entry };
        },
        return() {
          closed = true;
          return {};
        }
      };
    }
  };
  await assert.rejects(
    setup(snapshot({ knowledgeItems: { map: () => iterable } })).query.listLearningObjectives(),
    errorIs(failure)
  );
  assert.equal(closed, true);
});

test('real snapshot reader integrates repository flags, duplicate links, evidence and objective projection', async () => {
  const { createWorkspaceSnapshotReader } = await import(new URL('workspace-query-snapshot.js', root));
  const rows = {
    notes: [{ id: 'n', title: 'Source note' }],
    noteVersions: [],
    knowledgeItems: [item()],
    evidence: [{ id: 'e', knowledgeItemId: 'k', noteId: 'n', status: 'valid' }],
    objectives: [objective('o'), objective('archived', { reviewStatus: 'archived' })],
    profiles: [],
    focuses: [],
    questions: [
      { id: 'q', reviewStatus: 'confirmed' },
      { id: 'archived-q', reviewStatus: 'archived' }
    ],
    questionObjectives: [
      { questionId: 'q', learningObjectiveId: 'o' },
      { questionId: 'q', learningObjectiveId: 'o' },
      { questionId: 'archived-q', learningObjectiveId: 'archived' }
    ],
    questionSources: []
  };
  const specs = [
    ['notes', 'noteRepository', 'list'],
    ['noteVersions', 'noteVersionRepository', 'list'],
    ['knowledgeItems', 'knowledgeItemRepository', 'list'],
    ['evidence', 'knowledgeEvidenceRepository', 'list'],
    ['objectives', 'learningObjectiveRepository', 'list'],
    ['profiles', 'examProfileRepository', 'list'],
    ['focuses', 'examFocusRepository', 'list'],
    ['questions', 'questionRepository', 'list'],
    ['questionObjectives', 'questionObjectiveRepository', 'listByQuestionIds'],
    ['questionSources', 'questionSourceRepository', 'list']
  ];
  const calls = [];
  const repositories = Object.fromEntries(
    specs.map(([key, name, method]) => [
      name,
      {
        async [method](...args) {
          calls.push({ key, args });
          return rows[key];
        }
      }
    ])
  );
  const query = create({ snapshotReader: createWorkspaceSnapshotReader({ repositories }) });
  const knowledge = (await query.listKnowledgeItems()).items[0];
  assert.equal(knowledge.questionCount, 2);
  assert.equal(knowledge.objectiveCount, 1);
  assert.equal(knowledge.confirmedObjectiveCount, 1);
  assert.equal(knowledge.evidenceSummary[0].noteTitle, 'Source note');
  assert.deepEqual(knowledge.noteIds, ['n']);
  const objectives = await query.listLearningObjectives();
  assert.equal(objectives.items[0].questionCount, 2);
  assert.deepEqual(objectives.items[0].questionIds, ['q', 'q']);
  assert.deepEqual(objectives.items[0].knowledgeItem, {
    id: 'k',
    title: 'Knowledge k',
    reviewStatus: 'confirmed',
    evidenceStatus: 'valid'
  });
  const overview = await query.getKnowledgeOverview();
  assert.equal(overview.knowledgeItems.total, 1);
  assert.equal(overview.coverage.itemsWithoutQuestions, 0);
  assert.equal(calls.length, 30);
  assert.deepEqual(calls.find(call => call.key === 'knowledgeItems').args, [
    { includeArchived: true, includeDeleted: true }
  ]);
  assert.deepEqual(calls.find(call => call.key === 'questionObjectives').args, [['q', 'archived-q']]);
});

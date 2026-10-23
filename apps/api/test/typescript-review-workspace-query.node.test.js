import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const baseline = process.env.KNOWRA_REVIEW_QUERY_BASELINE === '1';
const commit = '38fbd43bd68af5b9ccbe4ed26cf38d1ca75260a8';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
const infrastructure = new URL('../infrastructure/', root);
const names = ['review-queue-query-service', 'workspace-query-service'];
function original(name) {
  return execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/${name}.js`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
}
let reviewModule;
let workspaceModule;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-review-query-'));
  try {
    for (const name of names) {
      const source = original(name).replace(/(['"])\.\/(.+?\.js)\1/g, (_, quote, dependency) =>
        JSON.stringify(
          dependency === 'review-queue-query-service.js'
            ? pathToFileURL(join(directory, 'review-queue-query-service.mjs')).href
            : new URL(dependency, root).href
        )
      );
      writeFileSync(join(directory, `${name}.mjs`), source);
    }
    reviewModule = await import(pathToFileURL(join(directory, `${names[0]}.mjs`)));
    workspaceModule = await import(pathToFileURL(join(directory, `${names[1]}.mjs`)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  reviewModule = await import(new URL(`${names[0]}.js`, root));
  workspaceModule = await import(new URL(`${names[1]}.js`, root));
}
const { createReviewQueueQuery: create } = reviewModule;
const { createWorkspaceQueryService: createWorkspace } = workspaceModule;
const timestamp = '2026-01-01T00:00:00.000Z';
const errorIs = expected => actual => Object.is(actual, expected);
function record(id, overrides = {}) {
  return { id, updatedAt: timestamp, ...overrides };
}
function snapshot(overrides = {}) {
  return {
    knowledgeItems: [],
    objectives: [],
    evidence: [],
    questions: [],
    indexes: {
      linksByQuestion: new Map(),
      sourcesByQuestion: new Map()
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
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function throwingProperty(object, key, failure) {
  Object.defineProperty(object, key, {
    configurable: true,
    get() {
      throw failure;
    }
  });
}
const specifications = [
  ['notes', 'noteRepository', 'list', [{ includeDeleted: true }]],
  ['noteVersions', 'noteVersionRepository', 'list', []],
  ['knowledgeItems', 'knowledgeItemRepository', 'list', [{ includeArchived: true, includeDeleted: true }]],
  ['evidence', 'knowledgeEvidenceRepository', 'list', []],
  ['objectives', 'learningObjectiveRepository', 'list', [{ includeArchived: true }]],
  ['profiles', 'examProfileRepository', 'list', [{ includeArchived: true }]],
  ['focuses', 'examFocusRepository', 'list', [{ includeArchived: true }]],
  ['questions', 'questionRepository', 'list', [{ includeArchived: true }]],
  ['questionObjectives', 'questionObjectiveRepository', 'listByQuestionIds', [[]]],
  ['questionSources', 'questionSourceRepository', 'list', []]
];
const methodNames = [
  'listKnowledgeItems',
  'listLearningObjectives',
  'getKnowledgeOverview',
  'listQuestions',
  'listExamProfiles',
  'getTrainingOverview',
  'listReviewQueue'
];
function repositoriesFixture(overrides = {}) {
  const values = { ...Object.fromEntries(specifications.map(([key]) => [key, []])), ...overrides };
  const calls = [];
  const repositories = Object.fromEntries(
    specifications.map(([key, name, method]) => [
      name,
      {
        [method](...args) {
          calls.push({ key, name, method, args, receiver: this });
          return values[key];
        }
      }
    ])
  );
  return { values, calls, repositories, query: createWorkspace({ repositories }) };
}

test('both JS bridges preserve sole named exports and exact TS function identity', { skip: baseline }, async () => {
  for (const [name, module, exported] of [
    [names[0], reviewModule, 'createReviewQueueQuery'],
    [names[1], workspaceModule, 'createWorkspaceQueryService']
  ]) {
    const ts = await import(new URL(`${name}.ts`, root));
    assert.deepEqual(Object.keys(module), [exported]);
    assert.deepEqual(Object.keys(ts), [exported]);
    assert.equal(module[exported], ts[exported]);
  }
});

test('review factory defaults, primitive options and falsy reader/load retain synchronous validation', () => {
  const required = error => error instanceof TypeError && error.message === 'Review queue snapshot reader is required';
  for (const options of [undefined, {}, false, 1, 'x', 1n, Symbol('options')])
    assert.throws(() => create(options), required);
  assert.throws(() => create(null), TypeError);
  for (const snapshotReader of [null, false, 0, '', NaN, 1n, Symbol('reader')])
    assert.throws(() => create({ snapshotReader }), required);
  for (const load of [undefined, null, false, 0, -0, '', 0n, NaN])
    assert.throws(() => create({ snapshotReader: { load } }), required);
});

test('reader capture and live load getters retain evaluation order, receiver and detached methods', async () => {
  const events = [];
  let generation = 0;
  const reader = {
    get load() {
      events.push('load');
      const value = ++generation;
      return function (...args) {
        assert.equal(this, reader);
        assert.deepEqual(args, []);
        events.push('call');
        return snapshot({ questions: [record(value)] });
      };
    }
  };
  const options = {
    get snapshotReader() {
      events.push('reader');
      return reader;
    }
  };
  const query = create(options);
  assert.deepEqual(Object.keys(query), ['listReviewQueue']);
  assert.deepEqual(events, ['reader', 'load']);
  const { listReviewQueue } = query;
  assert.equal((await listReviewQueue.call(null)).items[0].id, 2);
  assert.equal((await listReviewQueue()).items[0].id, 3);
  assert.deepEqual(events, ['reader', 'load', 'load', 'call', 'load', 'call']);
  for (const key of ['snapshotReader', 'load']) {
    const failure = { key };
    const options = { snapshotReader: {} };
    throwingProperty(key === 'load' ? options.snapshotReader : options, key, failure);
    assert.throws(() => create(options), errorIs(failure));
  }
});

test('truthy noncallable load passes factory and fails asynchronously', async () => {
  for (const load of [true, 1, 'x', 1n, Symbol('load'), {}, []]) {
    const query = create({ snapshotReader: { load } });
    let pending;
    assert.doesNotThrow(() => {
      pending = query.listReviewQueue();
    });
    assert.ok(pending instanceof Promise);
    await assert.rejects(pending, TypeError);
  }
});

test('query parsing and coercion happen before loading, with exact getter failure identity', async () => {
  const fixture = setup();
  for (const [input, code] of [
    [{ limit: 0 }, 'WORKSPACE_LIMIT_INVALID'],
    [{ sort: 'name' }, 'WORKSPACE_SORT_INVALID'],
    [{ cursor: 'bad' }, 'WORKSPACE_CURSOR_INVALID'],
    [{ includeArchived: 'yes' }, 'WORKSPACE_BOOLEAN_INVALID']
  ])
    await assert.rejects(fixture.query.listReviewQueue(input), error => error.code === code);
  await assert.rejects(fixture.query.listReviewQueue(null), TypeError);
  for (const key of ['limit', 'sort', 'query', 'cursor', 'kind', 'reviewStatus', 'hasQuestions']) {
    const failure = { key };
    const input = {};
    throwingProperty(input, key, failure);
    await assert.rejects(fixture.query.listReviewQueue(input), errorIs(failure));
  }
  assert.equal(fixture.calls.length, 0);
});

test('load awaits promises and thenables, propagating arbitrary throws/rejections unchanged', async () => {
  const gate = deferred();
  let reads = 0;
  const value = snapshot();
  Object.defineProperty(value, 'knowledgeItems', {
    get() {
      reads++;
      return [];
    }
  });
  const fixture = setup(gate.promise);
  const pending = fixture.query.listReviewQueue();
  await setImmediate();
  assert.equal(reads, 0);
  gate.resolve(value);
  await pending;
  assert.equal(reads, 2);
  for (const reason of [undefined, null, false, 0, -0, '', NaN, 1n, Symbol('failure'), {}]) {
    for (const mode of ['throw', 'reject', 'then getter', 'then call']) {
      const reader = {
        load() {
          if (mode === 'throw') throw reason;
          if (mode === 'reject') return Promise.reject(reason);
          return {
            get then() {
              if (mode === 'then getter') throw reason;
              return () => {
                throw reason;
              };
            }
          };
        }
      };
      await assert.rejects(create({ snapshotReader: reader }).listReviewQueue(), errorIs(reason));
    }
  }
  for (const mode of ['normal', 'resolve twice', 'throw after resolve']) {
    const result = await setup({
      then(resolve) {
        resolve(snapshot());
        if (mode === 'resolve twice') resolve(null);
        if (mode === 'throw after resolve') throw new Error('ignored after resolve');
      }
    }).query.listReviewQueue();
    assert.deepEqual(result.items, []);
  }
});

test('knowledge entries retain exact field order, filters, fallback semantics and references', async () => {
  const summary = {};
  const title = {};
  const updatedAt = {};
  const records = [
    record('candidate', { reviewStatus: 'candidate', title, canonicalStatement: summary, updatedAt }),
    record('revision', { reviewStatus: 'needsRevision', title: '' }),
    record('deleted', { reviewStatus: 'candidate', deletedAt: 'yes' }),
    record('confirmed', { reviewStatus: 'confirmed' })
  ];
  const fixture = setup(snapshot({ knowledgeItems: records }));
  const result = await fixture.query.listReviewQueue({ kind: 'knowledgeItem' });
  assert.deepEqual(
    result.items.map(item => item.id),
    ['candidate', 'revision']
  );
  const entry = result.items[0];
  assert.deepEqual(Object.keys(entry), [
    'kind',
    'id',
    'resourceType',
    'resourceId',
    'title',
    'summary',
    'status',
    'reason',
    'updatedAt'
  ]);
  assert.equal(entry.title, title);
  assert.equal(entry.summary, summary);
  assert.equal(entry.updatedAt, updatedAt);
  assert.equal(entry.reason, '知识单元待确认');
  assert.equal(result.items[1].title, '未命名知识单元');
  assert.equal(result.items[1].reason, '知识单元需要修订');
  assert.notEqual(entry, records[0]);
  assert.equal(records[0].title, title);
});

test('evidence and objective duplicate IDs use last map value including deleted records', async () => {
  const fixture = setup(
    snapshot({
      knowledgeItems: [record('k', { title: 'old' }), record('k', { title: '', deletedAt: 'yes' })],
      evidence: ['stale', 'invalid', 'insufficient', 'valid'].map(status =>
        record(status, { status, knowledgeItemId: 'k', quoteText: '' })
      ),
      objectives: [
        record('o', { reviewStatus: 'candidate', knowledgeItemId: 'k', objective: '' }),
        record('skip', { reviewStatus: 'confirmed' })
      ]
    })
  );
  const result = await fixture.query.listReviewQueue();
  assert.deepEqual(
    result.items.map(entry => entry.id),
    ['insufficient', 'invalid', 'o', 'stale']
  );
  for (const entry of result.items) assert.equal(entry.title, '');
  assert.equal(result.items.find(entry => entry.id === 'o').summary, '目标内容尚未填写');
  assert.equal(result.items.find(entry => entry.id === 'stale').summary, '来源未提供引用文本');
  assert.deepEqual(
    result.items.filter(entry => entry.kind === 'knowledgeEvidence').map(entry => entry.reason),
    ['来源不足', '来源已失效', '来源待复核']
  );
});

test('question stale/missing/candidate precedence, archived filtering and first-link semantics remain exact', async () => {
  const objectives = [record('o', { objective: 'old' }), record('o', { objective: '' })];
  const questions = ['stale', 'missing', 'candidate', 'confirmed', 'archived'].map(id =>
    record(id, {
      stem: '',
      explanation: 'explanation',
      reviewStatus: id === 'candidate' || id === 'archived' ? id : 'confirmed'
    })
  );
  const sources = new Map([
    ['stale', [{ status: 'active' }, { status: 'stale' }]],
    ['candidate', [{ status: 'active' }]],
    ['confirmed', [{ status: 'active' }]],
    ['archived', []]
  ]);
  const links = new Map([
    [
      'stale',
      [
        { learningObjectiveId: 'o', isPrimary: false },
        { learningObjectiveId: 'other', isPrimary: true }
      ]
    ]
  ]);
  const result = await setup(
    snapshot({ objectives, questions, indexes: { sourcesByQuestion: sources, linksByQuestion: links } })
  ).query.listReviewQueue();
  assert.deepEqual(
    result.items.map(entry => entry.id),
    ['candidate', 'missing', 'stale']
  );
  assert.equal(result.items[2].summary, '');
  assert.equal(result.items[2].status, 'stale');
  assert.deepEqual(
    result.items.map(entry => entry.reason),
    ['题目待确认', '题目缺少来源', '题目来源待复核']
  );
  assert.equal(result.items[0].title, '未命名题目');
  assert.equal(result.items[0].summary, 'explanation');
});

test('nullish fallback differs from truthiness for item title, objective summary and source lookup', async () => {
  for (const value of [null, undefined, false, 0, '', NaN]) {
    const fixture = setup(
      snapshot({
        knowledgeItems: [record('k', { title: value })],
        objectives: [record('o', { objective: value })],
        evidence: [record('e', { status: 'stale', knowledgeItemId: 'k' })],
        questions: [record('q', { explanation: 'fallback' })],
        indexes: {
          sourcesByQuestion: new Map([['q', null]]),
          linksByQuestion: new Map([['q', [{ learningObjectiveId: 'o' }]]])
        }
      })
    );
    const result = await fixture.query.listReviewQueue();
    assert.equal(result.items[0].title, value ?? '知识来源');
    assert.equal(result.items[1].summary, value ?? 'fallback');
  }
});

test('kind/status/text filtering precedes two-stage sorting and pagination with cursor round trip', async () => {
  const fixture = setup(
    snapshot({
      questions: [
        record('a', { stem: 'Alpha', updatedAt: '2026-01-01' }),
        record('b', { stem: 'Beta', updatedAt: '2026-01-02' }),
        record('c', { stem: 'ALPHA', updatedAt: '2026-01-03' })
      ]
    })
  );
  assert.deepEqual(
    (await fixture.query.listReviewQueue({ query: ' alpha ', sort: 'updated-asc' })).items.map(entry => entry.id),
    ['a', 'c']
  );
  assert.equal((await fixture.query.listReviewQueue({ kind: 'unknown' })).pagination.total, 0);
  assert.equal((await fixture.query.listReviewQueue({ reviewStatus: 'confirmed' })).pagination.total, 0);
  const first = await fixture.query.listReviewQueue({ limit: 1 });
  assert.deepEqual(
    first.items.map(entry => entry.id),
    ['c']
  );
  assert.equal(first.pagination.hasMore, true);
  const next = await fixture.query.listReviewQueue({ limit: 1, cursor: first.pagination.nextCursor });
  assert.deepEqual(
    next.items.map(entry => entry.id),
    ['b']
  );
});

test('dynamic snapshots read maps first and reread collections during each builder', async () => {
  const events = [];
  let itemReads = 0;
  let objectiveReads = 0;
  const value = snapshot({
    evidence: [record('e', { status: 'stale', knowledgeItemId: 'k' })],
    questions: [record('q')]
  });
  Object.defineProperty(value, 'knowledgeItems', {
    get() {
      events.push('items');
      return ++itemReads === 1
        ? [record('k', { title: 'mapped title' })]
        : [record('shown', { reviewStatus: 'candidate', title: 'shown title' })];
    }
  });
  Object.defineProperty(value, 'objectives', {
    get() {
      events.push('objectives');
      return ++objectiveReads === 1 ? [record('o', { objective: 'mapped objective' })] : [];
    }
  });
  value.indexes.linksByQuestion.set('q', [{ learningObjectiveId: 'o' }]);
  const result = await setup(value).query.listReviewQueue();
  assert.deepEqual(events, ['items', 'objectives', 'items', 'objectives']);
  assert.equal(result.items.find(entry => entry.id === 'e').title, 'mapped title');
  assert.equal(result.items.find(entry => entry.id === 'q').summary, 'mapped objective');
  assert.equal(result.items.find(entry => entry.id === 'shown').title, 'shown title');
});

test('custom map iterators keep duplicate map keys, iterator closing and exact failures', async () => {
  const marker = {};
  const failure = {};
  const value = snapshot({ evidence: [record('e', { status: 'stale', knowledgeItemId: marker })] });
  value.knowledgeItems = {
    map(project) {
      assert.deepEqual(project({ id: marker }), [marker, { id: marker }]);
      return new Set([
        [marker, { title: 'first' }],
        [marker, { title: 'last' }]
      ]);
    },
    filter() {
      return {
        map() {
          return [];
        }
      };
    }
  };
  assert.equal((await setup(value).query.listReviewQueue()).items[0].title, 'last');
  let closed = false;
  value.knowledgeItems.map = () => ({
    [Symbol.iterator]() {
      return {
        next() {
          return {
            done: false,
            value: {
              get 0() {
                throw failure;
              }
            }
          };
        },
        return() {
          closed = true;
          throw new Error('closing must not replace original');
        }
      };
    }
  });
  await assert.rejects(setup(value).query.listReviewQueue(), errorIs(failure));
  assert.equal(closed, true);
});

test('custom collection filter/map/flatMap can bypass predicates and replace projected output without normalization', async () => {
  const opaque = { id: 'opaque', updatedAt: timestamp, title: {} };
  const events = [];
  const value = snapshot();
  value.knowledgeItems = {
    map(project) {
      events.push('index');
      assert.deepEqual(project({ id: 'k' }), ['k', { id: 'k' }]);
      return [];
    },
    filter(predicate) {
      events.push('filter');
      assert.equal(predicate({ reviewStatus: 'candidate' }), true);
      assert.equal(predicate({ reviewStatus: 'confirmed' }), false);
      return {
        map(project) {
          events.push('map');
          assert.equal(project(record('k', { reviewStatus: 'candidate' })).reason, '知识单元待确认');
          return new Set([opaque]);
        }
      };
    }
  };
  value.questions = {
    filter(predicate) {
      events.push('question-filter');
      assert.equal(predicate({ reviewStatus: 'archived' }), false);
      return {
        flatMap(project) {
          events.push('flatMap');
          assert.equal(project(record('q'))[0].reason, '题目缺少来源');
          return new Set();
        }
      };
    }
  };
  const result = await setup(value).query.listReviewQueue();
  assert.equal(result.items[0], opaque);
  assert.equal(result.items[0].title, opaque.title);
  assert.deepEqual(events, ['index', 'filter', 'map', 'question-filter', 'flatMap']);
});

test('custom source find result truthiness is not interpreted as a record and length is read even when stale', async () => {
  for (const found of [undefined, null, false, 0, '', NaN, true, 1n, Symbol('found'), {}]) {
    const events = [];
    const sources = {
      find(predicate) {
        events.push('find');
        assert.equal(predicate({ status: 'stale' }), true);
        return found;
      },
      get length() {
        events.push('length');
        return 7;
      }
    };
    const fixture = setup(
      snapshot({
        questions: [record('q', { reviewStatus: 'candidate' })],
        indexes: { sourcesByQuestion: new Map([['q', sources]]), linksByQuestion: new Map() }
      })
    );
    const entry = (await fixture.query.listReviewQueue()).items[0];
    assert.equal(entry.reason, found ? '题目来源待复核' : '题目待确认');
    assert.deepEqual(events, ['find', 'length']);
  }
});

test('inherited evidence label keys retain native prototype values and Symbol interpolation failures', async () => {
  for (const status of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty', 1n, null, undefined]) {
    const value = snapshot();
    value.evidence = {
      filter() {
        return {
          map(project) {
            return [project(record('e', { status }))];
          }
        };
      }
    };
    const entry = (await setup(value).query.listReviewQueue()).items[0];
    assert.equal(entry.status, status);
    assert.equal(entry.reason, `来源${{ stale: '待复核', invalid: '已失效', insufficient: '不足' }[status] ?? status}`);
  }
  const value = snapshot();
  value.evidence = {
    filter() {
      return {
        map(project) {
          return [project(record('e', { status: Symbol('status') }))];
        }
      };
    }
  };
  await assert.rejects(setup(value).query.listReviewQueue(), TypeError);
});

test('sparse arrays and species retain native holes, map iterator errors and projection order', async () => {
  for (const key of ['knowledgeItems', 'objectives']) {
    const value = snapshot();
    value[key] = new Array(2);
    value[key][1] = record('last');
    await assert.rejects(setup(value).query.listReviewQueue(), TypeError);
  }
  const events = [];
  class Exotic extends Array {
    static get [Symbol.species]() {
      events.push('species');
      return Exotic;
    }
  }
  const questions = new Exotic(3);
  questions[2] = record('q');
  const result = await setup(snapshot({ questions })).query.listReviewQueue();
  assert.deepEqual(
    result.items.map(entry => entry.id),
    ['q']
  );
  assert.deepEqual(events, ['species', 'species']);
});

test('native Date, id and text coercions retain throw identity and invalid-time tie ordering', async () => {
  for (const updatedAt of [Symbol('date'), 1n]) {
    await assert.rejects(
      setup(snapshot({ questions: [record('a', { updatedAt }), record('b')] })).query.listReviewQueue(),
      TypeError
    );
  }
  const failure = {};
  for (const target of ['updatedAt', 'id', 'stem']) {
    const recordValue = record('a', { updatedAt: 'not a date' });
    recordValue[target] = {
      [Symbol.toPrimitive]() {
        throw failure;
      }
    };
    await assert.rejects(
      setup(snapshot({ questions: [recordValue, record('b', { updatedAt: 'not a date' })] })).query.listReviewQueue(
        target === 'stem' ? { query: 'x' } : {}
      ),
      errorIs(failure)
    );
  }
  const result = await setup(
    snapshot({ questions: [record('b', { updatedAt: NaN }), record('a', { updatedAt: undefined })] })
  ).query.listReviewQueue();
  assert.deepEqual(
    result.items.map(entry => entry.id),
    ['a', 'b']
  );
});

test('field getter failures from each branch and lookup retain exact error identity', async () => {
  const branches = [
    [
      'knowledgeItems',
      { reviewStatus: 'candidate' },
      ['deletedAt', 'reviewStatus', 'id', 'title', 'canonicalStatement', 'updatedAt']
    ],
    ['evidence', { status: 'stale' }, ['status', 'knowledgeItemId', 'id', 'quoteText', 'updatedAt']],
    ['objectives', { reviewStatus: 'candidate' }, ['reviewStatus', 'id', 'knowledgeItemId', 'objective', 'updatedAt']],
    ['questions', {}, ['reviewStatus', 'id', 'stem', 'explanation', 'updatedAt']]
  ];
  for (const [collection, overrides, keys] of branches)
    for (const key of keys) {
      const failure = { collection, key };
      const item = record('one', overrides);
      throwingProperty(item, key, failure);
      await assert.rejects(setup(snapshot({ [collection]: [item] })).query.listReviewQueue(), errorIs(failure));
    }
  for (const key of ['sourcesByQuestion', 'linksByQuestion']) {
    const value = snapshot({ questions: [record('q')] });
    const failure = { key };
    value.indexes[key] = {
      get() {
        throw failure;
      }
    };
    await assert.rejects(setup(value).query.listReviewQueue(), errorIs(failure));
  }
});

test('workspace factory forwards defaults and captures repositories without reading them', async () => {
  const required = error => error instanceof TypeError && error.message === 'Workspace query repositories are required';
  for (const options of [undefined, {}, false, 1, 'x', Symbol('x'), 1n])
    assert.throws(() => createWorkspace(options), required);
  assert.throws(() => createWorkspace(null), TypeError);
  for (const repositories of [null, undefined, false, 0, '', 0n, NaN])
    assert.throws(() => createWorkspace({ repositories }), required);
  const fixture = repositoriesFixture();
  let reads = 0;
  const query = createWorkspace({
    get repositories() {
      reads++;
      return fixture.repositories;
    }
  });
  assert.deepEqual(Object.keys(query), methodNames);
  assert.equal(reads, 1);
  assert.equal(fixture.calls.length, 0);
  for (const repositories of [{}, [], true, 1, 'x', Symbol('x'), 1n]) {
    const query = createWorkspace({ repositories });
    assert.deepEqual(Object.keys(query), methodNames);
    await assert.rejects(query.listReviewQueue(), TypeError);
  }
});

test('workspace exposes seven detached methods, each loading all repositories in exact order/options', async () => {
  const fixture = repositoriesFixture();
  for (const name of methodNames) {
    fixture.calls.length = 0;
    const detached = fixture.query[name];
    await detached.call(null);
    assert.deepEqual(
      fixture.calls.map(call => call.key),
      specifications.map(([key]) => key)
    );
    for (let i = 0; i < specifications.length; i++) {
      const [, repository, , args] = specifications[i];
      assert.equal(fixture.calls[i].receiver, fixture.repositories[repository]);
      assert.deepEqual(fixture.calls[i].args, args);
    }
  }
});

test('workspace validates list input before repository access and overview ignores supplied input', async () => {
  const fixture = repositoriesFixture();
  for (const method of methodNames.filter(name => name.startsWith('list'))) {
    await assert.rejects(fixture.query[method]({ limit: 0 }), error => error.code === 'WORKSPACE_LIMIT_INVALID');
  }
  assert.equal(fixture.calls.length, 0);
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error('argument must be ignored');
      }
    }
  );
  await fixture.query.getKnowledgeOverview(poison);
  await fixture.query.getTrainingOverview(poison);
  assert.equal(fixture.calls.length, 20);
});

test('workspace preserves two-phase async barrier, fresh reloads and rejection/throw short-circuit order', async () => {
  const gate = deferred();
  const fixture = repositoriesFixture({ notes: gate.promise });
  const pending = fixture.query.listReviewQueue();
  assert.equal(fixture.calls.length, 8);
  await setImmediate();
  assert.equal(fixture.calls.length, 8);
  gate.resolve([]);
  await pending;
  assert.equal(fixture.calls.length, 10);
  fixture.values.questions = [record('fresh')];
  assert.equal((await fixture.query.listReviewQueue()).items[0].id, 'fresh');
  for (const index of [0, 3, 7, 8, 9])
    for (const mode of ['throw', 'reject', 'thenable']) {
      const failure = { index, mode };
      const fixture = repositoriesFixture();
      const [key, name, method] = specifications[index];
      fixture.repositories[name][method] = function () {
        fixture.calls.push({ key });
        if (mode === 'throw') throw failure;
        if (mode === 'reject') return Promise.reject(failure);
        return {
          then(resolve, reject) {
            reject(failure);
          }
        };
      };
      await assert.rejects(fixture.query.listReviewQueue(), errorIs(failure));
      assert.deepEqual(
        fixture.calls.map(call => call.key),
        specifications.slice(0, mode === 'throw' ? index + 1 : index < 8 ? 8 : 10).map(([key]) => key)
      );
    }
});

test('workspace accepts mixed synchronous/promise/thenable repositories without cloning records', async () => {
  const fixture = repositoriesFixture({ knowledgeItems: [record('k', { reviewStatus: 'candidate', title: 'Title' })] });
  for (let i = 0; i < specifications.length; i++) {
    const [key, name, method] = specifications[i];
    const value = fixture.values[key];
    fixture.repositories[name][method] = () =>
      i % 3 === 0
        ? value
        : i % 3 === 1
          ? Promise.resolve(value)
          : {
              then(resolve) {
                resolve(value);
              }
            };
  }
  assert.equal((await fixture.query.listReviewQueue()).items[0].title, 'Title');
  fixture.values.knowledgeItems[0].title = 'Changed';
  assert.equal((await fixture.query.listReviewQueue()).items[0].title, 'Changed');
});

test('actual local repository factories compose through all seven workspace methods', async () => {
  const data = {
    notes: [record('n', { title: 'Note', rawMarkdown: '' })],
    noteVersions: [record('v', { noteId: 'n' })],
    knowledgeItems: [record('k', { title: 'Item', canonicalStatement: 'Statement', reviewStatus: 'candidate' })],
    evidence: [record('e', { knowledgeItemId: 'k', noteId: 'n', status: 'stale', quoteText: 'Quote' })],
    objectives: [record('o', { knowledgeItemId: 'k', objective: 'Objective', reviewStatus: 'candidate' })],
    profiles: [record('p', { name: 'Profile', scope: [] })],
    focuses: [record('f', { examProfileId: 'p', learningObjectiveId: 'o', reviewStatus: 'confirmed' })],
    questions: [
      record('q', { stem: 'Question', reviewStatus: 'candidate' }),
      record('deleted', { deletedAt: timestamp })
    ],
    questionObjectives: [record('l', { questionId: 'q', learningObjectiveId: 'o' })],
    questionSources: [record('s', { questionId: 'q', sourceType: 'knowledgeItem', sourceId: 'k', status: 'stale' })]
  };
  const repositories = {};
  for (const [key, name] of specifications) {
    const stem = name.replace(/Repository$/, '').replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const module = await import(new URL(`${stem}-repository.js`, infrastructure));
    repositories[name] = module[`createInMemory${name[0].toUpperCase()}${name.slice(1)}`]({ records: data[key] });
  }
  const query = createWorkspace({ repositories });
  assert.deepEqual(
    (await query.listReviewQueue()).items.map(entry => entry.id),
    ['e', 'k', 'o', 'q']
  );
  assert.equal((await query.listKnowledgeItems()).items[0].id, 'k');
  assert.equal((await query.listLearningObjectives()).items[0].id, 'o');
  assert.equal((await query.listQuestions()).items[0].id, 'q');
  assert.equal((await query.listExamProfiles()).items[0].id, 'p');
  assert.equal((await query.getKnowledgeOverview()).recentItems[0].id, 'k');
  assert.equal((await query.getTrainingOverview()).recentQuestions[0].id, 'q');
  const originalList = repositories.questionRepository.list;
  repositories.questionRepository.list = (...args) => Promise.resolve(originalList(...args));
  assert.deepEqual(
    (await query.listReviewQueue()).items.map(entry => entry.id),
    ['e', 'k', 'o', 'q']
  );
});

// 独立导入替身只观察组合器的导入调用与对象展开，不替换任何生产模块。
test('workspace factory order and object spread preserve key order, symbols, getters and overwrite identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-workspace-spread-'));
  const stateKey = `__knowra_workspace_spread_${Date.now()}`;
  const events = [];
  const symbol = Symbol('copied');
  const sharedReader = {};
  const repositories = {};
  const knowledge = Object.create({ inherited: 'not copied' });
  const functionValue = () => {};
  Object.defineProperties(knowledge, {
    shared: {
      enumerable: true,
      get() {
        events.push('knowledge shared');
        return 'knowledge';
      }
    },
    hidden: { value: 'not copied' },
    first: { enumerable: true, value: functionValue }
  });
  knowledge[symbol] = 'symbol';
  const training = {
    get shared() {
      events.push('training shared');
      return 'training';
    },
    middle: functionValue
  };
  const review = {
    get shared() {
      events.push('review shared');
      return functionValue;
    },
    last: functionValue
  };
  globalThis[stateKey] = {
    factory(name, options) {
      events.push(name);
      if (name === 'snapshot') {
        assert.equal(options.repositories, repositories);
        return sharedReader;
      }
      assert.equal(options.snapshotReader, sharedReader);
      return { knowledge, training, review }[name];
    }
  };
  try {
    const dependencies = [
      ['workspace-query-snapshot.js', 'createWorkspaceSnapshotReader', 'snapshot'],
      ['knowledge-workspace-query-service.js', 'createKnowledgeWorkspaceQuery', 'knowledge'],
      ['training-workspace-query-service.js', 'createTrainingWorkspaceQuery', 'training'],
      ['review-queue-query-service.js', 'createReviewQueueQuery', 'review']
    ];
    let source = baseline
      ? original(names[1])
      : stripTypeScriptTypes(readFileSync(new URL(`${names[1]}.ts`, root), 'utf8'));
    for (const [file, exported, name] of dependencies) {
      const replacement = join(directory, file.replace('.js', '.mjs'));
      writeFileSync(
        replacement,
        `export function ${exported}(options) { return globalThis[${JSON.stringify(stateKey)}].factory(${JSON.stringify(name)}, options); }`
      );
      source = source.replace(`'./${file}'`, JSON.stringify(pathToFileURL(replacement).href));
    }
    const filename = join(directory, 'wrapper.mjs');
    writeFileSync(filename, source);
    const create = (await import(pathToFileURL(filename))).createWorkspaceQueryService;
    const result = create({ repositories });
    assert.deepEqual(events, [
      'snapshot',
      'knowledge',
      'training',
      'review',
      'knowledge shared',
      'training shared',
      'review shared'
    ]);
    assert.deepEqual(Reflect.ownKeys(result), ['shared', 'first', 'middle', 'last', symbol]);
    assert.equal(result.shared, functionValue);
    assert.equal(result.first, functionValue);
    assert.equal(result[symbol], 'symbol');
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, 'shared'), {
      value: functionValue,
      enumerable: true,
      configurable: true,
      writable: true
    });
    for (const stage of ['snapshot', 'knowledge', 'training', 'review']) {
      const failure = { stage };
      const calls = [];
      globalThis[stateKey].factory = name => {
        calls.push(name);
        if (name === stage) throw failure;
        return name === 'snapshot' ? sharedReader : {};
      };
      assert.throws(() => create({ repositories }), errorIs(failure));
      assert.deepEqual(
        calls,
        ['snapshot', 'knowledge', 'training', 'review'].slice(
          0,
          ['snapshot', 'knowledge', 'training', 'review'].indexOf(stage) + 1
        )
      );
    }
    const failure = {};
    globalThis[stateKey].factory = name =>
      name === 'snapshot'
        ? sharedReader
        : name === 'knowledge'
          ? {
              get poisoned() {
                throw failure;
              }
            }
          : {};
    assert.throws(() => create({ repositories }), errorIs(failure));
  } finally {
    delete globalThis[stateKey];
    rmSync(directory, { recursive: true, force: true });
  }
});

test('custom review projections preserve scalar items rather than inventing validated DTOs', async () => {
  for (const opaque of [17, false, '', 1n, Symbol('item'), {}, null, undefined]) {
    const value = snapshot();
    value.evidence = {
      filter() {
        return {
          map() {
            return [opaque];
          }
        };
      }
    };
    if (opaque === null || opaque === undefined) {
      await assert.rejects(setup(value).query.listReviewQueue(), TypeError);
      continue;
    }
    const result = await setup(value).query.listReviewQueue();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0], opaque);
    assert.equal(result.pagination.total, 1);
  }
});

test('composed overview countBy keeps inherited keys and property coercion without numeric promises', async () => {
  for (const key of ['__proto__', 'toString', 'constructor', 'valueOf', 'hasOwnProperty', Symbol('count'), 1n]) {
    const fixture = repositoriesFixture({
      knowledgeItems: [record('k', { reviewStatus: key, knowledgeType: key })],
      objectives: [record('o', { reviewStatus: key })],
      evidence: [record('e', { status: key })],
      questions: [record('q', { reviewStatus: key, questionType: key, difficulty: key })]
    });
    const expected = {};
    expected[key] = (expected[key] ?? 0) + 1;
    const knowledge = await fixture.query.getKnowledgeOverview();
    const training = await fixture.query.getTrainingOverview();
    for (const counts of [
      knowledge.knowledgeItems.byReviewStatus,
      knowledge.knowledgeItems.byKnowledgeType,
      knowledge.learningObjectives.byReviewStatus,
      knowledge.evidence.byStatus,
      training.questions.byReviewStatus,
      training.questions.byQuestionType,
      training.questions.byDifficulty
    ]) {
      assert.deepEqual(counts, expected);
      assert.equal(counts[key], expected[key]);
    }
  }
});

test('composed overviews preserve custom reduce/sort/slice/map/length sentinel outputs by identity', async () => {
  for (const sentinel of [undefined, null, false, 0, 1n, Symbol('sentinel'), {}]) {
    const events = [];
    const output = {
      get length() {
        events.push('length');
        return sentinel;
      },
      reduce(callback, initial) {
        events.push('reduce');
        assert.deepEqual(initial, {});
        assert.equal(typeof callback, 'function');
        return sentinel;
      },
      filter(callback) {
        events.push('filter');
        assert.equal(typeof callback, 'function');
        return { length: sentinel };
      },
      sort(compare) {
        events.push('sort');
        assert.equal(typeof compare, 'function');
        return {
          slice(start, end) {
            events.push('slice');
            assert.deepEqual([start, end], [0, 5]);
            return {
              map(callback) {
                events.push('recent-map');
                assert.equal(typeof callback, 'function');
                return sentinel;
              }
            };
          }
        };
      }
    };
    const chain = {
      filter() {
        return {
          map() {
            return output;
          }
        };
      }
    };
    const knowledge = await repositoriesFixture({ knowledgeItems: chain }).query.getKnowledgeOverview();
    for (const actual of [
      knowledge.knowledgeItems.total,
      knowledge.knowledgeItems.byReviewStatus,
      knowledge.knowledgeItems.byKnowledgeType,
      knowledge.evidence.byHealth,
      knowledge.coverage.itemsWithoutConfirmedObjective,
      knowledge.coverage.itemsWithoutQuestions,
      knowledge.recentItems
    ])
      assert.equal(actual, sentinel);
    const questions = {
      map() {
        return [];
      },
      ...chain
    };
    const training = await repositoriesFixture({
      questions,
      profiles: {
        filter() {
          return output;
        }
      }
    }).query.getTrainingOverview();
    for (const actual of [
      training.questions.total,
      training.questions.byReviewStatus,
      training.questions.byQuestionType,
      training.questions.byDifficulty,
      training.review.pendingValidation,
      training.review.pendingConfirmation,
      training.review.staleSources,
      training.review.insufficientSources,
      training.examProfiles.total,
      training.examProfiles.updatedRecently,
      training.recentQuestions
    ])
      assert.equal(actual, sentinel);
    assert.equal(events.filter(event => event === 'sort').length, 3);
    assert.equal(events.filter(event => event === 'slice').length, 3);
    assert.equal(events.filter(event => event === 'recent-map').length, 3);
  }
});

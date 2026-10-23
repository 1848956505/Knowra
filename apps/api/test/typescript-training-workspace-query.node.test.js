import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const baseline = process.env.KNOWRA_TRAINING_QUERY_BASELINE === '1';
const commit = '9577c198cda91d41da31597516e41a8c77325370';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
let queryModule;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-training-query-'));
  try {
    let source = execFileSync(
      'git',
      ['show', `${commit}:apps/api/src/modules/knowledge/application/training-workspace-query-service.js`],
      { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' }
    );
    for (const dependency of ['workspace-query-dto.js', 'workspace-query-utils.js']) {
      source = source.replace(`'./${dependency}'`, JSON.stringify(new URL(dependency, root).href));
    }
    const filename = join(directory, 'training-workspace-query-service.mjs');
    writeFileSync(filename, source);
    queryModule = await import(pathToFileURL(filename).href);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  queryModule = await import(new URL('training-workspace-query-service.js', root));
}
const { createTrainingWorkspaceQuery: create } = queryModule;
const methods = ['listQuestions', 'listExamProfiles', 'getTrainingOverview'];
const errorIs = expected => actual => Object.is(actual, expected);
const timestamp = '2026-01-01T00:00:00.000Z';
function question(id = 'q', overrides = {}) {
  return {
    id,
    stem: `Question ${String(id)}`,
    questionType: 'shortAnswer',
    reviewStatus: 'confirmed',
    difficulty: 'medium',
    updatedAt: timestamp,
    ...overrides
  };
}
function profile(id = 'p', overrides = {}) {
  return {
    id,
    name: `Profile ${String(id)}`,
    description: 'Description',
    scope: [],
    archivedAt: null,
    updatedAt: timestamp,
    ...overrides
  };
}
function snapshot(overrides = {}) {
  return {
    knowledgeItems: [],
    objectives: [],
    evidence: [],
    noteVersions: [],
    questions: [],
    profiles: [],
    indexes: {
      linksByQuestion: new Map(),
      sourcesByQuestion: new Map(),
      focusByProfile: new Map(),
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

test('training query bridge preserves its sole function export and identity', { skip: baseline }, async () => {
  const ts = await import(new URL('training-workspace-query-service.ts', root));
  assert.deepEqual(Object.keys(queryModule), ['createTrainingWorkspaceQuery']);
  assert.deepEqual(Object.keys(ts), Object.keys(queryModule));
  assert.equal(create, ts.createTrainingWorkspaceQuery);
});

test('factory defaults, null options and falsy load values preserve synchronous validation', () => {
  const required = error =>
    error instanceof TypeError && error.message === 'Training workspace snapshot reader is required';
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
  await fixture.query.getTrainingOverview(
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
        return snapshot({ questions: [question(generation)] });
      };
    }
  };
  const options = { snapshotReader };
  const query = create(options);
  options.snapshotReader = null;
  assert.equal((await query.listQuestions()).items[0].id, 2);
  assert.equal((await query.listQuestions()).items[0].id, 3);
  assert.equal((await query.getTrainingOverview()).recentQuestions[0].id, 4);
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
  for (const value of [null, undefined, false, 0, '', {}, { questions: null, objectives: null }]) {
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
  const first = await fixture.query.listQuestions();
  assert.deepEqual(first, expected);
  assert.deepEqual(await fixture.query.listQuestions(undefined), expected);
  const second = await fixture.query.listExamProfiles();
  assert.deepEqual(second, expected);
  assert.notEqual(first.items, second.items);
  assert.notEqual(first.pagination, second.pagination);
});

test('question archive filter uses exact status and does not hide deletedAt itself', async () => {
  const value = snapshot({
    questions: [
      question('active'),
      question('archived', { reviewStatus: 'archived' }),
      question('upper', { reviewStatus: 'ARCHIVED' }),
      question('deleted', { deletedAt: 'now' })
    ]
  });
  const query = setup(value).query;
  assert.deepEqual(ids(await query.listQuestions()), ['active', 'deleted', 'upper']);
  assert.deepEqual(ids(await query.listQuestions({ includeArchived: 'true' })), [
    'active',
    'archived',
    'deleted',
    'upper'
  ]);
  assert.equal((await query.getTrainingOverview()).questions.total, 3);
});

test('question filtering combines exact fields, objective IDs and derived source status', async () => {
  const value = snapshot({
    questions: [question('a'), question('b', { questionType: 'choice', difficulty: 'easy', reviewStatus: 'draft' })]
  });
  value.indexes.linksByQuestion.set('a', [{ learningObjectiveId: 'o', isPrimary: true, order: 0 }]);
  value.indexes.sourcesByQuestion.set('a', [{ sourceType: 'other', sourceId: 'x', status: 'stale' }]);
  const query = setup(value).query;
  assert.deepEqual(
    ids(
      await query.listQuestions({
        questionType: 'shortAnswer',
        difficulty: 'medium',
        reviewStatus: 'confirmed',
        learningObjectiveId: 'o',
        sourceStatus: 'stale'
      })
    ),
    ['a']
  );
  for (const input of [
    { questionType: 'ShortAnswer' },
    { difficulty: 'Medium' },
    { learningObjectiveId: 'absent' },
    { evidenceStatus: 'valid' }
  ])
    assert.deepEqual(ids(await query.listQuestions(input)), []);
  assert.deepEqual(
    ids(
      await query.listQuestions({
        knowledgeType: 'ignored',
        missingQuestions: true,
        hasQuestions: false,
        examProfileId: 'ignored'
      })
    ),
    ['a', 'b']
  );
});

test('question search includes stem explanation primary objective and source quote, not unrelated labels or objectives', async () => {
  const value = snapshot({
    questions: [question('q', { stem: 'Stem marker', explanation: 'Explanation marker' })],
    knowledgeItems: [{ id: 'k', title: 'Hidden title' }],
    objectives: [
      { id: 'primary', objective: 'Primary objective', knowledgeItemId: 'k' },
      { id: 'secondary', objective: 'Secondary hidden' }
    ]
  });
  value.indexes.linksByQuestion.set('q', [
    { learningObjectiveId: 'primary', isPrimary: true, order: 9 },
    { learningObjectiveId: 'secondary', order: 0 }
  ]);
  value.indexes.sourcesByQuestion.set('q', [
    {
      sourceType: 'knowledgeItem',
      sourceId: 'k',
      quote: 'Quoted passage',
      quoteText: 'Ignored input quoteText',
      status: 'active'
    }
  ]);
  const query = setup(value).query;
  for (const text of [' STEM ', 'EXPLANATION', 'primary objective', 'quoted passage'])
    assert.deepEqual(ids(await query.listQuestions({ query: text })), ['q']);
  for (const text of ['hidden title', 'secondary hidden', 'ignored input'])
    assert.deepEqual(ids(await query.listQuestions({ query: text })), []);
});

test('context Maps use last duplicate key while link projection retains duplicate IDs and original primary selection', async () => {
  const value = snapshot({
    questions: [question()],
    knowledgeItems: [
      { id: 'k', title: 'first' },
      { id: 'k', title: 'last', deletedAt: 'yes' }
    ],
    objectives: [
      { id: 'o', objective: 'first' },
      {
        id: 'o',
        objective: 'last',
        knowledgeItemId: 'k',
        reviewStatus: 'archived',
        actionVerb: 'explain',
        cognitiveLevel: 'apply'
      }
    ]
  });
  value.indexes.linksByQuestion.set('q', [
    { learningObjectiveId: 'missing', order: 0 },
    { learningObjectiveId: 'o', isPrimary: 'truthy', order: 5 },
    { learningObjectiveId: 'o', order: 2 }
  ]);
  const dto = (await setup(value).query.listQuestions()).items[0];
  assert.deepEqual(dto.learningObjectiveIds, ['missing', 'o', 'o']);
  assert.deepEqual(dto.primaryObjective, {
    id: 'o',
    objective: 'last',
    knowledgeItemId: 'k',
    knowledgeItemTitle: 'last'
  });
  assert.deepEqual(dto.objectives[0], {
    id: 'missing',
    isPrimary: false,
    order: 0,
    objective: '',
    actionVerb: '',
    cognitiveLevel: '',
    reviewStatus: null,
    knowledgeItemId: null,
    knowledgeItemTitle: ''
  });
  assert.equal(dto.objectives[1].reviewStatus, 'archived');
  assert.equal(dto.objectives[1].actionVerb, 'explain');
  assert.equal(dto.objectives[1].cognitiveLevel, 'apply');
});

test('missing item retains objective foreign key and falsy projected values remain unchanged', async () => {
  const value = snapshot({
    questions: [question()],
    objectives: [
      { id: 0, objective: 0, knowledgeItemId: false, actionVerb: false, cognitiveLevel: 0, reviewStatus: '' }
    ]
  });
  value.indexes.linksByQuestion.set('q', [{ learningObjectiveId: 0, order: 0 }]);
  const dto = (await setup(value).query.listQuestions()).items[0];
  assert.deepEqual(dto.primaryObjective, { id: 0, objective: 0, knowledgeItemId: false, knowledgeItemTitle: '' });
  assert.equal(dto.objectives[0].actionVerb, false);
  assert.equal(dto.objectives[0].reviewStatus, '');
});

test('source labels preserve overwrite order, nullish title and truthy evidence fallbacks', async () => {
  const value = snapshot({
    questions: [question()],
    knowledgeItems: [
      { id: 'k', title: 'first' },
      { id: 'k', title: '' },
      { id: 1, title: 'number' },
      { id: '1', title: 'string collision' }
    ],
    objectives: [{ id: 'o', objective: false }],
    noteVersions: [
      { id: 'v', noteId: 'n' },
      { id: 'missing', noteId: 'absent' }
    ],
    evidence: [
      { id: 'e', quoteText: '' },
      { id: 'zero', quoteText: 0 },
      { id: 'truth', quoteText: { raw: true } }
    ]
  });
  value.indexes.noteById.set('n', { title: 0 });
  value.indexes.sourcesByQuestion.set(
    'q',
    [
      ['knowledgeItem', 'k'],
      ['knowledgeItem', 1],
      ['learningObjective', 'o'],
      ['noteVersion', 'v'],
      ['noteVersion', 'missing'],
      ['knowledgeEvidence', 'e'],
      ['knowledgeEvidence', 'zero'],
      ['knowledgeEvidence', 'truth'],
      ['other', null]
    ].map(([sourceType, sourceId]) => ({ sourceType, sourceId, status: 'active' }))
  );
  const dto = (await setup(value).query.listQuestions()).items[0];
  assert.deepEqual(
    dto.sources.map(source => source.label),
    ['', 'string collision', false, 0, '笔记版本', '知识证据', '知识证据', { raw: true }, 'other']
  );
  assert.equal(dto.sourceHealth, 'valid');
});

test('source status precedence remains stale then active or reanchored then insufficient', async () => {
  for (const [statuses, expected] of [
    [[], 'insufficient'],
    [['invalid'], 'insufficient'],
    [['active'], 'valid'],
    [['reanchored'], 'valid'],
    [['active', 'stale'], 'stale']
  ]) {
    const value = snapshot({ questions: [question()] });
    value.indexes.sourcesByQuestion.set(
      'q',
      statuses.map(status => ({ status }))
    );
    const dto = (await setup(value).query.listQuestions()).items[0];
    assert.equal(dto.sourceStatus, expected);
    assert.equal(dto.sourceHealth, expected);
  }
});

test('profile filtering uses archivedAt truthiness and applies archive filtering to focuses only', async () => {
  const value = snapshot({
    profiles: [
      profile('active'),
      profile('archived', { archivedAt: 'now' }),
      profile('zero', { archivedAt: 0 }),
      profile('deleted', { deletedAt: 'now' })
    ],
    objectives: [{ id: 'o', objective: 'Objective', reviewStatus: 'archived', knowledgeItemId: 'k' }]
  });
  value.indexes.focusByProfile.set('active', [
    { id: 'f', learningObjectiveId: 'o', reviewStatus: 'confirmed' },
    { id: 'old', learningObjectiveId: 'absent', reviewStatus: 'archived' },
    { id: 'draft', reviewStatus: 'draft' }
  ]);
  const query = setup(value).query;
  assert.deepEqual(ids(await query.listExamProfiles()), ['active', 'deleted', 'zero']);
  const dto = (await query.listExamProfiles()).items[0];
  assert.equal(dto.focusCount, 2);
  assert.equal(dto.confirmedFocusCount, 1);
  assert.deepEqual(dto.focuses[0].learningObjective, {
    id: 'o',
    objective: 'Objective',
    reviewStatus: 'archived',
    knowledgeItemId: 'k'
  });
  assert.equal(dto.focuses[1].learningObjective, null);
  const archived = await query.listExamProfiles({ includeArchived: true });
  assert.deepEqual(ids(archived), ['active', 'archived', 'deleted', 'zero']);
  assert.equal(archived.items[0].focusCount, 3);
});

test('profile search spreads scope even for empty query and ignores question filters', async () => {
  const query = setup(
    snapshot({
      profiles: [profile('p', { name: 'Named exam', description: 'Description area', scope: new Set(['Deep scope']) })]
    })
  ).query;
  for (const text of ['NAMED', 'description', 'deep scope'])
    assert.deepEqual(ids(await query.listExamProfiles({ query: text })), ['p']);
  assert.deepEqual(
    ids(
      await query.listExamProfiles({
        reviewStatus: 'nonexistent',
        questionType: 'none',
        learningObjectiveId: 'none',
        evidenceStatus: 'invalid'
      })
    ),
    ['p']
  );
  for (const scope of [undefined, null, false, 0, {}])
    await assert.rejects(setup(snapshot({ profiles: [profile('p', { scope })] })).query.listExamProfiles(), TypeError);
  assert.deepEqual(
    ids(await setup(snapshot({ profiles: [profile('p', { scope: 'abc' })] })).query.listExamProfiles({ query: 'b' })),
    ['p']
  );
});

test('both lists preserve sorting cursors maximum limit and original collection order', async () => {
  for (const [method, key, factory] of [
    ['listQuestions', 'questions', question],
    ['listExamProfiles', 'profiles', profile]
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
    assert.deepEqual(ids(await query[method]({ limit: 2, cursor: page.pagination.nextCursor })), ['b']);
    assert.deepEqual(ids(await query[method]({ sort: 'updated-asc', limit: 100 })), ['a', 'b', 'c']);
    assert.deepEqual(
      records.map(record => record.id),
      ['c', 'b', 'a']
    );
  }
});

test('custom list filter-map-filter chains preserve callback results receivers and final iterables', async () => {
  for (const [method, key, record] of [
    ['listQuestions', 'questions', question()],
    ['listExamProfiles', 'profiles', profile()]
  ]) {
    const events = [];
    let dto;
    const final = {
      *[Symbol.iterator]() {
        events.push('iterate');
        yield dto;
      }
    };
    const mapped = {
      get filter() {
        events.push('filter getter');
        return function (predicate) {
          assert.equal(this, mapped);
          assert.equal(predicate(dto), true);
          events.push('match');
          return final;
        };
      }
    };
    const filtered = {
      map(callback) {
        assert.equal(this, filtered);
        dto = callback(record);
        events.push('map');
        return mapped;
      }
    };
    const original = {
      filter(predicate) {
        assert.equal(this, original);
        assert.equal(predicate(record), true);
        assert.equal(predicate({ reviewStatus: 'archived', archivedAt: 'now' }), false);
        events.push('filter');
        return filtered;
      }
    };
    const page = await setup(snapshot({ [key]: original })).query[method]();
    assert.equal(page.items[0], dto);
    assert.deepEqual(events, ['filter', 'map', 'filter getter', 'match', 'iterate']);
  }
});

test('list final results preserve noniterable errors and iterator getter call and next failures', async () => {
  for (const [method, key] of [
    ['listQuestions', 'questions'],
    ['listExamProfiles', 'profiles']
  ]) {
    for (const result of [undefined, null, false, 0, {}, { [Symbol.iterator]: null }])
      await assert.rejects(
        setup(snapshot({ [key]: { filter: () => ({ map: () => ({ filter: () => result }) }) } })).query[method](),
        TypeError
      );
    for (const stage of ['getter', 'call', 'next']) {
      const failure = { stage };
      const result = {
        [Symbol.iterator]() {
          if (stage === 'call') throw failure;
          return {
            next() {
              throw failure;
            }
          };
        }
      };
      if (stage === 'getter') throwingProperty(result, Symbol.iterator, failure);
      await assert.rejects(
        setup(snapshot({ [key]: { filter: () => ({ map: () => ({ filter: () => result }) }) } })).query[method](),
        errorIs(failure)
      );
    }
  }
});

test('context Map construction accepts custom map results including nullish and iterable overrides', async () => {
  for (const result of [undefined, null]) {
    const value = snapshot({ questions: [question()], objectives: { map: () => result, forEach() {} } });
    value.indexes.linksByQuestion.set('q', [{ learningObjectiveId: 'o' }]);
    assert.equal((await setup(value).query.listQuestions()).items[0].primaryObjective.objective, '');
  }
  const objective = { id: 'o', objective: 'Injected', knowledgeItemId: 'k' };
  const item = { id: 'k', title: 'Injected item' };
  const value = snapshot({
    questions: [question()],
    objectives: { map: () => new Set([['o', objective]]), forEach() {} },
    knowledgeItems: { map: () => [['k', item]], forEach() {} }
  });
  value.indexes.linksByQuestion.set('q', [{ learningObjectiveId: 'o' }]);
  assert.deepEqual((await setup(value).query.listQuestions()).items[0].primaryObjective, {
    id: 'o',
    objective: 'Injected',
    knowledgeItemId: 'k',
    knowledgeItemTitle: 'Injected item'
  });
  for (const result of [false, 1, {}, [null], [undefined], ['not entry']])
    await assert.rejects(setup(snapshot({ objectives: { map: () => result } })).query.listExamProfiles(), TypeError);
});

test('Map constructor closes iterator after entry getter failure and preserves thrown identity', async () => {
  const failure = {};
  let closed = 0;
  const entry = { 1: {} };
  throwingProperty(entry, '0', failure);
  const iterable = {
    [Symbol.iterator]() {
      return {
        next: () => ({ done: false, value: entry }),
        return() {
          closed++;
          return {};
        }
      };
    }
  };
  await assert.rejects(
    setup(snapshot({ objectives: { map: () => iterable } })).query.listExamProfiles(),
    errorIs(failure)
  );
  assert.equal(closed, 1);
});

test('custom link map result retains find receiver primary override and independent iterator order', async () => {
  const events = [];
  const primary = { learningObjectiveId: 'external', objective: 99, knowledgeItemId: false, knowledgeItemTitle: 0 };
  const iterableLinks = [
    { learningObjectiveId: 'second', order: 5 },
    { learningObjectiveId: 'first', order: 0 }
  ];
  const projected = {
    find(predicate) {
      assert.equal(this, projected);
      assert.equal(predicate({ isPrimary: 'yes' }), 'yes');
      events.push('find');
      return primary;
    },
    *[Symbol.iterator]() {
      assert.equal(this, projected);
      events.push('iterate');
      yield* iterableLinks;
    }
  };
  const links = {
    map(callback) {
      assert.equal(this, links);
      assert.equal(callback({ learningObjectiveId: 'missing' }).objective, '');
      events.push('map');
      return projected;
    }
  };
  const value = snapshot({ questions: [question()] });
  value.indexes.linksByQuestion.set('q', links);
  const dto = (await setup(value).query.listQuestions()).items[0];
  assert.deepEqual(dto.learningObjectiveIds, ['first', 'second']);
  assert.deepEqual(dto.primaryObjective, {
    id: 'external',
    objective: 99,
    knowledgeItemId: false,
    knowledgeItemTitle: 0
  });
  assert.deepEqual(events, ['map', 'find', 'iterate']);
});

test('custom source map may return different status and summary collections', async () => {
  let calls = 0;
  const summary = {
    map(callback) {
      assert.equal(callback({ quoteText: 'custom quote' }), 'custom quote');
      return new Set(['custom quote']);
    }
  };
  const sources = {
    map(callback) {
      assert.equal(this, sources);
      if (++calls === 1) {
        assert.equal(callback({ status: 'active' }), 'active');
        return { includes: status => status === 'active' };
      }
      assert.equal(callback({ sourceType: 'custom' }).label, 'custom');
      return summary;
    }
  };
  const value = snapshot({ questions: [question()] });
  value.indexes.sourcesByQuestion.set('q', sources);
  const dto = (await setup(value).query.listQuestions({ query: 'custom quote' })).items[0];
  assert.equal(dto.sources, summary);
  assert.equal(dto.sourceStatus, 'valid');
  assert.equal(calls, 2);
});

test('profile focus custom filter results preserve unknown counts and map result on success', async () => {
  const focusCount = Symbol('focus count');
  const confirmedCount = { arbitrary: true };
  const projected = Symbol('focuses result');
  const filtered = {
    length: focusCount,
    filter(predicate) {
      assert.equal(this, filtered);
      assert.equal(predicate({ reviewStatus: 'confirmed' }), true);
      return { length: confirmedCount };
    },
    map(callback) {
      assert.equal(this, filtered);
      assert.equal(callback({ learningObjectiveId: 'missing' }).learningObjective, null);
      return projected;
    }
  };
  const focuses = {
    filter(predicate) {
      assert.equal(this, focuses);
      assert.equal(predicate({ reviewStatus: 'archived' }), false);
      return filtered;
    }
  };
  const value = snapshot({ profiles: [profile()] });
  value.indexes.focusByProfile.set('p', focuses);
  const dto = (await setup(value).query.listExamProfiles()).items[0];
  assert.equal(dto.focusCount, focusCount);
  assert.equal(dto.confirmedFocusCount, confirmedCount);
  assert.equal(dto.focuses, projected);
});

test('indexed collections default only nullish values, not all falsy values', async () => {
  for (const [index, method, key, factory] of [
    ['linksByQuestion', 'listQuestions', 'questions', question],
    ['sourcesByQuestion', 'listQuestions', 'questions', question],
    ['focusByProfile', 'listExamProfiles', 'profiles', profile]
  ])
    for (const result of [undefined, null, false, 0, '']) {
      const value = snapshot({ [key]: [factory()] });
      value.indexes[index] = { get: () => result };
      if (result == null) assert.equal((await setup(value).query[method]()).items.length, 1);
      else await assert.rejects(setup(value).query[method](), TypeError);
    }
});

test('sparse arrays skip filter holes but context map holes fail in original Map construction', async () => {
  for (const [key, method, factory] of [
    ['questions', 'listQuestions', question],
    ['profiles', 'listExamProfiles', profile]
  ]) {
    const rows = new Array(3);
    rows[1] = factory();
    assert.equal((await setup(snapshot({ [key]: rows })).query[method]()).items.length, 1);
  }
  for (const key of ['objectives', 'knowledgeItems']) {
    const rows = new Array(3);
    rows[1] = { id: 'x' };
    await assert.rejects(setup(snapshot({ [key]: rows })).query.listQuestions(), TypeError);
  }
});

test('Array species survives overview while pagination uses plain arrays', async () => {
  class Records extends Array {}
  const value = snapshot({
    questions: new Records(question('b'), question('a')),
    profiles: new Records(profile('b'), profile('a'))
  });
  const query = setup(value).query;
  assert.equal(Object.getPrototypeOf((await query.listQuestions()).items), Array.prototype);
  assert.equal(Object.getPrototypeOf((await query.listExamProfiles()).items), Array.prototype);
  const overview = await query.getTrainingOverview();
  assert.ok(overview.recentQuestions instanceof Records);
  assert.ok(overview.examProfiles.updatedRecently instanceof Records);
  assert.deepEqual(
    [...value.questions].map(row => row.id),
    ['b', 'a']
  );
  class Plain extends Array {
    static get [Symbol.species]() {
      return Array;
    }
  }
  assert.equal(
    Object.getPrototypeOf(
      (await setup(snapshot({ profiles: new Plain(profile()) })).query.getTrainingOverview()).examProfiles
        .updatedRecently
    ),
    Array.prototype
  );
});

test('overview retains successful arbitrary reduce filter length sort slice and map returns', async () => {
  const trace = [];
  const count = Symbol('count result');
  const recent = { questions: Symbol('recent questions'), profiles: 12n };
  function chain(kind) {
    const sliced = {
      map(callback) {
        assert.equal(this, sliced);
        const row =
          kind === 'questions'
            ? { id: 1, stem: 2, questionType: 3, reviewStatus: 4, sourceStatus: 5, updatedAt: 6, ignored: 7 }
            : { id: 1, name: 2, updatedAt: 3, ignored: 4 };
        assert.equal(Object.keys(callback(row)).length, kind === 'questions' ? 6 : 3);
        trace.push(`${kind}:map`);
        return recent[kind];
      }
    };
    const sorted = {
      slice(...args) {
        assert.equal(this, sorted);
        assert.deepEqual(args, [0, 5]);
        trace.push(`${kind}:slice`);
        return sliced;
      }
    };
    return {
      length: `${kind} length`,
      reduce(callback, initial) {
        assert.equal(this, records);
        assert.deepEqual(initial, {});
        assert.equal(typeof callback, 'function');
        trace.push('reduce');
        return count;
      },
      filter() {
        trace.push('review');
        return { length: Symbol.for('review length') };
      },
      sort(compare) {
        assert.equal(typeof compare, 'function');
        trace.push(`${kind}:sort`);
        return sorted;
      }
    };
  }
  const records = chain('questions');
  const profiles = chain('profiles');
  const value = snapshot({
    questions: { filter: () => ({ map: () => records }) },
    profiles: { filter: () => profiles }
  });
  const result = await setup(value).query.getTrainingOverview();
  assert.equal(result.questions.total, 'questions length');
  assert.equal(result.questions.byReviewStatus, count);
  assert.equal(result.questions.byQuestionType, count);
  assert.equal(result.questions.byDifficulty, count);
  assert.equal(result.review.pendingValidation, Symbol.for('review length'));
  assert.equal(result.review.pendingConfirmation, Symbol.for('review length'));
  assert.equal(result.review.staleSources, Symbol.for('review length'));
  assert.equal(result.review.insufficientSources, Symbol.for('review length'));
  assert.equal(result.examProfiles.total, 'profiles length');
  assert.equal(result.examProfiles.updatedRecently, 12n);
  assert.equal(result.recentQuestions, recent.questions);
  assert.deepEqual(trace, [
    'reduce',
    'reduce',
    'reduce',
    'review',
    'review',
    'review',
    'review',
    'profiles:sort',
    'profiles:slice',
    'profiles:map',
    'questions:sort',
    'questions:slice',
    'questions:map'
  ]);
});

test('overview countBy preserves inherited keys symbols BigInt keys and nullish buckets', async () => {
  const symbol = Symbol('status');
  const value = snapshot({
    questions: [
      question('a', { reviewStatus: 'toString', questionType: '__proto__', difficulty: null }),
      question('b', { reviewStatus: 'constructor', questionType: undefined, difficulty: undefined }),
      question('c', { reviewStatus: symbol, questionType: 4n, difficulty: false })
    ]
  });
  const result = await setup(value).query.getTrainingOverview();
  assert.equal(result.questions.byReviewStatus.toString, String(Object.prototype.toString) + '1');
  assert.equal(result.questions.byReviewStatus.constructor, String(Object) + '1');
  assert.equal(result.questions.byReviewStatus[symbol], 1);
  assert.equal(Object.hasOwn(result.questions.byQuestionType, '__proto__'), false);
  assert.equal(Object.getPrototypeOf(result.questions.byQuestionType), Object.prototype);
  assert.equal(result.questions.byQuestionType.unknown, 1);
  assert.equal(result.questions.byQuestionType['4'], 1);
  assert.deepEqual(result.questions.byDifficulty, { unset: 2, false: 1 });
});

test('overview excludes archived rows and counts exact pending statuses and source health', async () => {
  const value = snapshot({
    questions: [
      question('draft', { reviewStatus: 'draft' }),
      question('validating', { reviewStatus: 'validating' }),
      question('candidate', { reviewStatus: 'candidate' }),
      question('old', { reviewStatus: 'archived' })
    ],
    profiles: [profile(), profile('old', { archivedAt: 'now' })]
  });
  value.indexes.sourcesByQuestion.set('draft', [{ status: 'stale' }]);
  value.indexes.sourcesByQuestion.set('validating', [{ status: 'active' }]);
  const result = await setup(value).query.getTrainingOverview();
  assert.equal(result.questions.total, 3);
  assert.deepEqual(result.review, {
    pendingValidation: 2,
    pendingConfirmation: 1,
    staleSources: 1,
    insufficientSources: 1
  });
  assert.equal(result.examProfiles.total, 1);
});

test('overview generates fresh ISO time and sorts and projects at most five rows without mutating input', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => question(String(index), { updatedAt: `2026-01-0${index + 1}` }));
  const profiles = rows.map(row => profile(row.id, { updatedAt: row.updatedAt }));
  const before = Date.now();
  const result = await setup(snapshot({ questions: rows, profiles })).query.getTrainingOverview();
  const after = Date.now();
  assert.ok(Date.parse(result.generatedAt) >= before && Date.parse(result.generatedAt) <= after);
  assert.deepEqual(
    result.recentQuestions.map(row => row.id),
    ['7', '6', '5', '4', '3']
  );
  assert.deepEqual(
    result.examProfiles.updatedRecently.map(row => row.id),
    ['7', '6', '5', '4', '3']
  );
  assert.deepEqual(Object.keys(result.recentQuestions[0]), [
    'id',
    'stem',
    'questionType',
    'reviewStatus',
    'sourceStatus',
    'updatedAt'
  ]);
  assert.deepEqual(Object.keys(result.examProfiles.updatedRecently[0]), ['id', 'name', 'updatedAt']);
  assert.deepEqual(
    rows.map(row => row.id),
    ['0', '1', '2', '3', '4', '5', '6', '7']
  );
});

test('Symbol and BigInt timestamps throw only when the comparator actually runs', async () => {
  for (const updatedAt of [Symbol('time'), 1n])
    for (const [method, key, factory] of [
      ['listQuestions', 'questions', question],
      ['listExamProfiles', 'profiles', profile],
      ['getTrainingOverview', 'questions', question],
      ['getTrainingOverview', 'profiles', profile]
    ]) {
      const result = await setup(snapshot({ [key]: [factory('single', { updatedAt })] })).query[method]();
      assert.equal(
        (result.items ?? (key === 'questions' ? result.recentQuestions : result.examProfiles.updatedRecently))[0]
          .updatedAt,
        updatedAt
      );
      await assert.rejects(
        setup(snapshot({ [key]: [factory('a'), factory('b', { updatedAt })] })).query[method](),
        TypeError
      );
    }
});

test('Date values invalid timestamps and coercion errors retain native behavior', async () => {
  for (const [method, key, factory] of [
    ['listQuestions', 'questions', question],
    ['listExamProfiles', 'profiles', profile],
    ['getTrainingOverview', 'questions', question],
    ['getTrainingOverview', 'profiles', profile]
  ]) {
    const result = await setup(
      snapshot({ [key]: [factory('z', { updatedAt: 'invalid' }), factory('a', { updatedAt: new Date(NaN) })] })
    ).query[method]();
    assert.deepEqual(
      (result.items ?? (key === 'questions' ? result.recentQuestions : result.examProfiles.updatedRecently)).map(
        row => row.id
      ),
      ['a', 'z']
    );
    for (const field of ['id', 'updatedAt']) {
      const failure = { method, key, field };
      const bad = {
        [Symbol.toPrimitive]() {
          throw failure;
        }
      };
      await assert.rejects(
        setup(snapshot({ [key]: [factory('a'), factory('b', { [field]: bad })] })).query[method](),
        errorIs(failure)
      );
    }
  }
});

test('labels use template coercion with Symbol errors and BigInt support before question filtering', async () => {
  for (const key of ['knowledgeItems', 'objectives', 'noteVersions', 'evidence']) {
    await assert.rejects(setup(snapshot({ [key]: [{ id: Symbol('id') }] })).query.listQuestions(), TypeError);
    await setup(snapshot({ [key]: [{ id: 1n }] })).query.listQuestions();
  }
  const value = snapshot({ questions: [question()], knowledgeItems: [{ id: 1n, title: 'BigInt label' }] });
  value.indexes.sourcesByQuestion.set('q', [{ sourceType: 'knowledgeItem', sourceId: 1n }]);
  assert.equal((await setup(value).query.listQuestions()).items[0].sources[0].label, 'BigInt label');
});

test('context initialization and dynamic lookup getter receiver ordering remain exact', async () => {
  const events = [];
  const value = snapshot({ questions: [question()] });
  for (const key of ['objectives', 'knowledgeItems', 'noteVersions', 'evidence', 'questions']) {
    const original = value[key];
    Object.defineProperty(value, key, {
      get() {
        events.push(key);
        return original;
      }
    });
  }
  const indexes = value.indexes;
  Object.defineProperty(value, 'indexes', {
    get() {
      events.push('indexes');
      return indexes;
    }
  });
  for (const key of ['linksByQuestion', 'sourcesByQuestion']) {
    const map = indexes[key];
    Object.defineProperty(map, 'get', {
      get() {
        events.push(`${key}.get`);
        return function (id) {
          assert.equal(this, map);
          events.push(`${key}:${id}`);
          return [];
        };
      }
    });
  }
  await setup(value).query.listQuestions();
  assert.deepEqual(events, [
    'objectives',
    'knowledgeItems',
    'knowledgeItems',
    'objectives',
    'noteVersions',
    'evidence',
    'questions',
    'indexes',
    'linksByQuestion.get',
    'linksByQuestion:q',
    'indexes',
    'sourcesByQuestion.get',
    'sourcesByQuestion:q'
  ]);
});

test('projection reads links spread getters before contextual overwrite and retains thrown identity', async () => {
  const events = [];
  const failure = {};
  const link = {
    get learningObjectiveId() {
      events.push('objective id');
      return 'missing';
    },
    get extra() {
      events.push('spread extra');
      return 1;
    },
    get objective() {
      events.push('spread objective');
      throw failure;
    }
  };
  const value = snapshot({ questions: [question()] });
  value.indexes.linksByQuestion.set('q', [link]);
  await assert.rejects(setup(value).query.listQuestions(), errorIs(failure));
  assert.deepEqual(events, ['objective id', 'objective id', 'spread extra', 'spread objective']);
});

test('real snapshot and local repositories integrate training lists profiles links and source labels', async () => {
  const { createWorkspaceSnapshotReader } = await import(new URL('workspace-query-snapshot.js', root));
  const infrastructure = new URL('../infrastructure/', root);
  const specs = [
    ['note', 'Note', [{ id: 'n', title: 'Local note', updatedAt: timestamp }]],
    ['note-version', 'NoteVersion', [{ id: 'v', noteId: 'n', createdAt: timestamp }]],
    [
      'knowledge-item',
      'KnowledgeItem',
      [{ id: 'k', title: 'Local knowledge', reviewStatus: 'confirmed', updatedAt: timestamp }]
    ],
    [
      'knowledge-evidence',
      'KnowledgeEvidence',
      [{ id: 'e', knowledgeItemId: 'k', quoteText: 'Local evidence', status: 'valid' }]
    ],
    [
      'learning-objective',
      'LearningObjective',
      [
        {
          id: 'o',
          knowledgeItemId: 'k',
          objective: 'Explain local context',
          reviewStatus: 'confirmed',
          updatedAt: timestamp
        }
      ]
    ],
    ['exam-profile', 'ExamProfile', [profile()]],
    [
      'exam-focus',
      'ExamFocus',
      [{ id: 'f', examProfileId: 'p', learningObjectiveId: 'o', reviewStatus: 'confirmed', updatedAt: timestamp }]
    ],
    ['question', 'Question', [question(), question('old', { reviewStatus: 'archived' })]],
    [
      'question-objective',
      'QuestionObjective',
      [{ id: 'l', questionId: 'q', learningObjectiveId: 'o', isPrimary: true, order: 0, createdAt: timestamp }]
    ],
    [
      'question-source',
      'QuestionSource',
      [
        {
          id: 's',
          questionId: 'q',
          sourceType: 'noteVersion',
          sourceId: 'v',
          status: 'active',
          quote: 'From local note',
          createdAt: timestamp
        }
      ]
    ]
  ];
  const repositories = {};
  for (const [file, name, records] of specs) {
    const module = await import(new URL(`${file}-repository.js`, infrastructure));
    repositories[`${name[0].toLowerCase()}${name.slice(1)}Repository`] = module[`createInMemory${name}Repository`]({
      records
    });
  }
  const query = create({ snapshotReader: createWorkspaceSnapshotReader({ repositories }) });
  const dto = (await query.listQuestions()).items[0];
  assert.deepEqual(dto.learningObjectiveIds, ['o']);
  assert.deepEqual(dto.primaryObjective, {
    id: 'o',
    objective: 'Explain local context',
    knowledgeItemId: 'k',
    knowledgeItemTitle: 'Local knowledge'
  });
  assert.equal(dto.sources[0].label, 'Local note');
  assert.equal(dto.sourceStatus, 'valid');
  assert.equal((await query.listQuestions({ includeArchived: true })).items.length, 2);
  const exam = (await query.listExamProfiles()).items[0];
  assert.equal(exam.focusCount, 1);
  assert.equal(exam.confirmedFocusCount, 1);
  assert.equal(exam.focuses[0].learningObjective.objective, 'Explain local context');
  const overview = await query.getTrainingOverview();
  assert.equal(overview.questions.total, 1);
  assert.equal(overview.examProfiles.total, 1);
  assert.equal(overview.recentQuestions[0].sourceStatus, 'valid');
});

test('custom final list iterables can successfully return arbitrary values rather than DTO records', async () => {
  for (const [method, key] of [
    ['listQuestions', 'questions'],
    ['listExamProfiles', 'profiles']
  ]) {
    for (const value of [undefined, null, false, 0, 3n, Symbol('row'), { arbitrary: true }]) {
      const original = { filter: () => ({ map: () => ({ filter: () => new Set([value]) }) }) };
      const page = await setup(snapshot({ [key]: original })).query[method]();
      assert.equal(page.items.length, 1);
      assert.equal(page.items[0], value);
      assert.equal(page.pagination.total, 1);
      assert.equal(page.pagination.hasMore, false);
      assert.equal(page.pagination.nextCursor, null);
    }
  }
});

test('overview evaluates clock before counters and profiles before question recency', async () => {
  const events = [];
  const records = [];
  records.reduce = function () {
    events.push('count');
    return {};
  };
  records.filter = function () {
    events.push('review');
    return [];
  };
  records.sort = function () {
    events.push('questions sort');
    return [];
  };
  const profiles = [];
  profiles.sort = function () {
    events.push('profiles sort');
    return [];
  };
  const value = snapshot({
    questions: { filter: () => ({ map: () => records }) },
    profiles: { filter: () => profiles }
  });
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
    await setup(value).query.getTrainingOverview();
  } finally {
    globalThis.Date = NativeDate;
  }
  assert.deepEqual(events, [
    'date:0',
    'iso',
    'count',
    'count',
    'count',
    'review',
    'review',
    'review',
    'review',
    'profiles sort',
    'questions sort'
  ]);
});

test('labels preserve full getter call order and short-circuit fallback reads', async () => {
  const events = [];
  function watched(label, object) {
    return new Proxy(object, {
      get(target, key, receiver) {
        events.push(`${label}.${String(key)}`);
        return Reflect.get(target, key, receiver);
      }
    });
  }
  const value = snapshot({
    questions: [question()],
    knowledgeItems: [watched('item', { id: 'k', title: 'K' })],
    objectives: [watched('objective', { id: 'o', objective: 'O' })],
    noteVersions: [watched('version', { id: 'v', noteId: 'n' })],
    evidence: [watched('evidence', { id: 'e', quoteText: '' })]
  });
  value.indexes.noteById = {
    get(id) {
      events.push(`note:${id}`);
      return watched('note', { title: null });
    }
  };
  await setup(value).query.listQuestions();
  assert.deepEqual(events, [
    'objective.id',
    'item.id',
    'item.id',
    'item.title',
    'objective.id',
    'objective.objective',
    'version.id',
    'version.noteId',
    'note:n',
    'note.title',
    'evidence.id',
    'evidence.quoteText'
  ]);
});

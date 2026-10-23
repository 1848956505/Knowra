import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_ASSESSMENT_REPOSITORIES_BASELINE === '1';
const commit = 'd410c9b2fba664884012e94e40a43a3ef0f8639a';
const root = new URL('../src/modules/knowledge/infrastructure/', import.meta.url);
function original(name, replacements = []) {
  let source = stripTypeScriptTypes(
    execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/infrastructure/${name}.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    })
  );
  for (const [from, to] of replacements) source = source.replace(from, JSON.stringify(to));
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const identityUrl = baseline
  ? original('question-objective-identity')
  : new URL('question-objective-identity.js', root).href;
const repositoryUrl = baseline
  ? original('assessment-repository', [
      ["'./question-objective-identity.js'", identityUrl],
      ["'../../../errors/app-error.js'", new URL('../../../errors/app-error.js', root).href]
    ])
  : new URL('assessment-repository.js', root).href;
const { questionObjectiveRecords: identity } = await import(identityUrl);
const {
  createInMemoryLearningObjectiveRepository: learning,
  createInMemoryExamProfileRepository: profile,
  createInMemoryExamFocusRepository: focus,
  createInMemoryQuestionRepository: question,
  createInMemoryQuestionObjectiveRepository: objective,
  createInMemoryQuestionSourceRepository: source
} = await import(repositoryUrl);
const factories = [learning, profile, focus, question, objective, source];
function replace(object, key, value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  if (object === crypto) syncBuiltinESMExports();
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
    if (object === crypto) syncBuiltinESMExports();
  }
}
const row = (id, extra = {}) => ({ id, updatedAt: '2026-01-01', createdAt: '2026-01-01', ...extra });
const ids = rows => rows.map(item => item.id);
const errorIs = expected => error => error === expected;

test('assessment bridges and six unchanged facades preserve exported identities', { skip: baseline }, async () => {
  for (const name of ['assessment-repository', 'question-objective-identity']) {
    const js = await import(new URL(`${name}.js`, root));
    const ts = await import(new URL(`${name}.ts`, root));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
  const all = await import(repositoryUrl);
  for (const name of [
    'learning-objective',
    'exam-profile',
    'exam-focus',
    'question',
    'question-objective',
    'question-source'
  ]) {
    const facade = await import(new URL(`${name}-repository.js`, root));
    for (const key of Object.keys(facade)) assert.equal(facade[key], all[key]);
  }
});

test('all repositories retain storage and record identities and synchronous return contracts', () => {
  for (const create of factories) {
    const first = row('one');
    const records = [first];
    const options = { records };
    const repo = create(options);
    options.records = [];
    assert.equal(repo.findById('one'), first);
    const second = row('two');
    assert.equal(repo.create(second), second);
    assert.equal(repo.save(second), second);
    assert.equal(records[1], second);
    const replacement = row('one');
    assert.equal(repo.save(replacement), replacement);
    assert.equal(records[0], replacement);
    assert.equal(repo.delete('one'), replacement);
    assert.equal(repo.delete('missing'), null);
    assert.equal(repo.findById('missing'), null);
    const listed = repo.list();
    assert.notEqual(listed, records);
    assert.equal(listed[0], second);
    assert.equal(listed.then, undefined);
  }
});

test('ordinary writes capture initial callbacks and use an undefined receiver', () => {
  for (const create of factories) {
    const calls = [];
    const records = [];
    const options = {
      records,
      onChange(value) {
        calls.push([this, value, value.length]);
      }
    };
    const repo = create(options);
    options.onChange = () => {
      throw new Error('must not use live callback');
    };
    repo.create(row('a'));
    repo.save(row('a'));
    repo.delete('absent');
    repo.delete('a');
    assert.equal(calls.length, 3);
    assert.deepEqual(
      calls.map(call => call[2]),
      [1, 1, 0]
    );
    for (const [receiver, value] of calls) {
      assert.equal(receiver, undefined);
      assert.equal(value, records);
    }
  }
});

test('duplicate create and optimistic save preserve error code, message and no-write ordering', () => {
  for (const create of factories) {
    const first = row('x');
    const duplicate = row('x', { updatedAt: 'other' });
    const records = [first, duplicate];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    assert.throws(
      () => repo.create(row('x')),
      error =>
        error instanceof AppError &&
        error.code === 'ASSESSMENT_ASSET_ID_CONFLICT' &&
        error.statusCode === 409 &&
        error.message === 'An assessment asset with the same id already exists'
    );
    for (const record of [row('x'), row('missing')]) {
      assert.throws(
        () => repo.save(record, { expectedUpdatedAt: 'stale' }),
        error =>
          error instanceof AppError &&
          error.code ===
            (create === learning ? 'LEARNING_OBJECTIVE_UPDATE_CONFLICT' : 'ASSESSMENT_ASSET_UPDATE_CONFLICT') &&
          error.statusCode === 409 &&
          error.message === '学习资产已变化，请重新加载并核对。'
      );
    }
    assert.equal(calls, 0);
    assert.equal(records[0], first);
    assert.equal(records[1], duplicate);
    const next = row('x');
    repo.save(next, { expectedUpdatedAt: first.updatedAt });
    assert.equal(records[0], next);
    assert.equal(records[1], duplicate);
    for (const expectedUpdatedAt of [null, undefined, '', 0, false, NaN]) repo.save(row('x'), { expectedUpdatedAt });
    assert.equal(calls, 7);
  }
});

test('mutation precedes captured callback failure and is never rolled back', () => {
  for (const create of factories) {
    const failure = {};
    const records = [];
    const repo = create({
      records,
      onChange: () => {
        throw failure;
      }
    });
    const first = row('a');
    assert.throws(() => repo.create(first), errorIs(failure));
    assert.equal(records[0], first);
    const next = row('a');
    assert.throws(() => repo.save(next), errorIs(failure));
    assert.equal(records[0], next);
    assert.throws(() => repo.delete('a'), errorIs(failure));
    assert.equal(records.length, 0);
  }
});

test('deleteByQuestionId retains duplicate identity, removal order, absent no-op and one callback', () => {
  for (const create of factories) {
    const a = row('a', { questionId: 'q' });
    const b = row('b', { questionId: 'q' });
    const keep = row('k');
    const records = [a, keep, a, b];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    assert.deepEqual(repo.deleteByQuestionId('missing'), []);
    assert.equal(calls, 0);
    const removed = repo.deleteByQuestionId('q');
    assert.deepEqual(removed, [a, a, b]);
    assert.equal(removed[0], removed[1]);
    assert.deepEqual(records, [keep]);
    assert.equal(calls, 1);
  }
});

test('truthy filters, archived/deleted flags, and limits retain original Number semantics', () => {
  for (const create of [learning, focus, question]) {
    const records = [
      row('a', {
        order: 0,
        priority: 1,
        reviewStatus: 'candidate',
        knowledgeItemId: 'k',
        examProfileId: 'p',
        learningObjectiveId: 'o'
      }),
      row('b', { order: 1, priority: 2, reviewStatus: 'archived' }),
      row('c', { order: 2, priority: 3, deletedAt: 'yes' })
    ];
    const repo = create({ records });
    assert.deepEqual(ids(repo.list()), ['a']);
    assert.deepEqual(ids(repo.list({ includeArchived: 'false', includeDeleted: [] })), ['a', 'b', 'c']);
    assert.deepEqual(ids(repo.list({ reviewStatus: 'archived', includeArchived: true })), ['b']);
    assert.deepEqual(ids(repo.list({ includeArchived: true, includeDeleted: true, limit: '2' })), ['a', 'b']);
    assert.deepEqual(ids(repo.list({ includeArchived: true, includeDeleted: true, limit: 2n })), ['a', 'b']);
    for (const limit of [0, -1, 1.2, '', 'bad', Infinity])
      assert.equal(repo.list({ includeArchived: true, includeDeleted: true, limit }).length, 3);
    assert.throws(() => repo.list({ limit: Symbol() }), TypeError);
    assert.deepEqual(ids(records), ['a', 'b', 'c']);
  }
  const repo = profile({ records: [row('a'), row('b', { archivedAt: 'yes' }), row('c', { deletedAt: true })] });
  assert.deepEqual(ids(repo.list()), ['a']);
  assert.equal(repo.list({ includeArchived: 1, includeDeleted: 'false' }).length, 3);
});

test('profile/objective selectors use exact equality and focus lookup includes hidden rows', () => {
  const token = {};
  const item = row('a', {
    examProfileId: token,
    learningObjectiveId: token,
    reviewStatus: 'archived',
    deletedAt: true,
    priority: 1
  });
  const repo = focus({ records: [item] });
  assert.equal(repo.findByProfileAndObjective(token, token), item);
  assert.equal(repo.findByProfileAndObjective({}, token), null);
  assert.deepEqual(
    repo.list({ examProfileId: token, learningObjectiveId: token, includeArchived: true, includeDeleted: true }),
    [item]
  );
  assert.deepEqual(repo.list({ examProfileId: {}, includeArchived: true, includeDeleted: true }), []);
  const learningRepo = learning({ records: [row('k', { knowledgeItemId: token })] });
  assert.equal(learningRepo.list({ knowledgeItemId: token }).length, 1);
  assert.equal(learningRepo.list({ knowledgeItemId: {} }).length, 0);
});

test('numeric sorting keeps coercion order, string fields, equal BigInt fallback and native failures', () => {
  for (const [create, key] of [
    [learning, 'order'],
    [focus, 'priority']
  ]) {
    const a = row('a', { [key]: '2' });
    const b = row('b', { [key]: '1' });
    assert.deepEqual(ids(create({ records: [a, b] }).list()), ['b', 'a']);
    assert.equal(a[key], '2');
    assert.throws(() => create({ records: [row('a', { [key]: 1n }), row('b', { [key]: 2n })] }).list(), TypeError);
    assert.deepEqual(
      ids(create({ records: [row('a', { [key]: 1n }), row('b', { [key]: 1n, updatedAt: '2027-01-01' })] }).list()),
      ['b', 'a']
    );
    assert.throws(() => create({ records: [row('a', { [key]: 1 }), row('b', { [key]: Symbol() })] }).list(), TypeError);
    const events = [];
    const failure = {};
    const value = label => ({
      valueOf() {
        events.push(label);
        return 1;
      }
    });
    create({ records: [row('a', { [key]: value('right') }), row('b', { [key]: value('left') })] }).list();
    assert.deepEqual(events, ['left', 'right']);
    assert.throws(
      () =>
        create({
          records: [
            row('a'),
            row('b', {
              [key]: {
                valueOf() {
                  throw failure;
                }
              }
            })
          ]
        }).list(),
      errorIs(failure)
    );
  }
});

test('date sorting retains default-hint conversion order, invalid dates, Symbol/BigInt and thrown identity', () => {
  const events = [];
  const date = label => ({
    [Symbol.toPrimitive](hint) {
      events.push([label, hint]);
      return '2026-01-01';
    }
  });
  profile({ records: [row('a', { updatedAt: date('right') }), row('b', { updatedAt: date('left') })] }).list();
  assert.deepEqual(events, [
    ['right', 'default'],
    ['left', 'default']
  ]);
  for (const value of [1n, Symbol()])
    assert.throws(() => profile({ records: [row('a'), row('b', { updatedAt: value })] }).list(), TypeError);
  assert.deepEqual(ids(profile({ records: [row('a', { updatedAt: 'invalid' }), row('b')] }).list()), ['a', 'b']);
  const failure = {};
  assert.throws(
    () =>
      profile({
        records: [
          row('a', {
            updatedAt: {
              [Symbol.toPrimitive]() {
                throw failure;
              }
            }
          }),
          row('b')
        ]
      }).list(),
    errorIs(failure)
  );
});

test('source list overrides generic filtering and limit with chronological question filtering', () => {
  const a = row('a', { questionId: 'q', createdAt: '2027-01-01', deletedAt: true });
  const b = row('b', { questionId: 'q', createdAt: '2025-01-01' });
  const c = row('c', { questionId: 'other' });
  const records = [a, b, c];
  const repo = source({ records });
  assert.deepEqual(ids(repo.list({ questionId: 'q', limit: 1 })), ['b', 'a']);
  assert.equal(repo.list({ questionId: '' }).length, 3);
  assert.deepEqual(records, [a, b, c]);
  assert.throws(() => repo.list(null), TypeError);
});

test('identity retains last duplicate previous row, nullish fallback and exact unvalidated values', () => {
  const id = {};
  const time = {};
  const obj = {};
  const q = {};
  const previous = [
    { learningObjectiveId: obj, id: 'first', createdAt: 'old' },
    { learningObjectiveId: obj, id, createdAt: time },
    { learningObjectiveId: NaN, id: '', createdAt: 0 }
  ];
  const next = identity(q, [obj, obj, NaN, NaN], previous, 'fallback');
  assert.equal(next.length, 2);
  assert.equal(next[0].id, id);
  assert.equal(next[0].createdAt, time);
  assert.equal(next[0].questionId, q);
  assert.equal(next[0].learningObjectiveId, obj);
  assert.equal(next[0].isPrimary, true);
  assert.equal(next[1].isPrimary, false);
  assert.equal(next[1].order, 1);
  assert.equal(next[1].id, '');
  assert.equal(next[1].createdAt, 0);
  assert.deepEqual(
    identity('q', 'aba', [], 't').map(item => item.learningObjectiveId),
    ['a', 'b']
  );
  assert.deepEqual(identity('q', null), []);
  assert.deepEqual(identity('q', undefined), []);
});

test('identity Date/map/Set/UUID order is preserved even for empty relations', () => {
  const events = [];
  const NativeDate = Date;
  replace(
    globalThis,
    'Date',
    class extends NativeDate {
      constructor(...args) {
        super(...args);
        events.push('date');
      }
      toISOString() {
        events.push('iso');
        return 'clock';
      }
    },
    () =>
      replace(
        crypto,
        'randomUUID',
        () => {
          events.push('uuid');
          return 'fixed';
        },
        () => {
          const previous = [];
          previous.map = function (callback) {
            events.push('previous-map');
            return Array.prototype.map.call(this, callback);
          };
          const iterable = {
            *[Symbol.iterator]() {
              events.push('iterate');
              yield 'a';
            }
          };
          const next = identity('q', iterable, previous);
          assert.equal(next[0].id, 'question-objective-fixed');
          assert.equal(next[0].createdAt, 'clock');
          assert.deepEqual(events, ['date', 'iso', 'previous-map', 'iterate', 'uuid']);
          events.length = 0;
          identity('q', [], previous);
          assert.deepEqual(events, ['date', 'iso', 'previous-map']);
        }
      )
  );
});

test('relation replacement preserves living IDs but regenerates after deletion tombstones', () => {
  let sequence = 0;
  replace(
    crypto,
    'randomUUID',
    () => String(++sequence),
    () => {
      const records = [];
      const repo = objective({ records });
      const first = repo.replaceForQuestion('q', ['a', 'b']);
      const second = repo.replaceForQuestion('q', ['b', 'a', 'b']);
      assert.equal(second[0].id, first[1].id);
      assert.equal(second[1].id, first[0].id);
      assert.equal(sequence, 2);
      assert.notEqual(second[0], first[1]);
      assert.deepEqual(
        second.map(item => item.order),
        [0, 1]
      );
      assert.deepEqual(repo.replaceForQuestion('q', []), []);
      const third = repo.replaceForQuestion('q', ['a']);
      assert.notEqual(third[0].id, first[0].id);
      assert.equal(sequence, 3);
    }
  );
});

test('replacement and mark callbacks are live and retain options receiver and backing array', () => {
  for (const create of [objective, source]) {
    const records = [];
    const options = { records };
    const repo = create(options);
    const calls = [];
    options.onChange = function (value) {
      calls.push([this, value]);
    };
    repo.replaceForQuestion(
      'q',
      create === objective ? ['o'] : [row('s', { questionId: 'q', sourceType: 'manual', sourceId: 'id' })]
    );
    options.onChange = function (value) {
      calls.push([this, value]);
    };
    if (create === source) repo.markBySourceId('manual', 'id');
    else repo.replaceForQuestion('q', []);
    assert.equal(calls.length, 2);
    for (const [receiver, value] of calls) {
      assert.equal(receiver, options);
      assert.equal(value, records);
    }
  }
});

test('replace removes before iterating and callback failures preserve completed mutation', () => {
  const failure = {};
  for (const create of [objective, source]) {
    const old = row('old', { questionId: 'q' });
    const keep = row('keep');
    const records = [old, keep];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    const iterator = {
      [Symbol.iterator]() {
        throw failure;
      }
    };
    assert.throws(() => repo.replaceForQuestion('q', iterator), errorIs(failure));
    assert.deepEqual(records, [keep]);
    assert.equal(calls, 0);
    const options = {
      records,
      onChange: () => {
        throw failure;
      }
    };
    const failing = create(options);
    assert.throws(
      () => failing.replaceForQuestion('q', create === objective ? ['o'] : [row('new', { questionId: 'q' })]),
      errorIs(failure)
    );
    assert.equal(records.length, 2);
  }
});

test('source replacement returns exact array and retains self-alias splice/push behavior', () => {
  const records = [row('old', { questionId: 'q' }), row('keep', { questionId: 'other' })];
  const repo = source({ records });
  const next = [row('a', { questionId: 'q' })];
  assert.equal(repo.replaceForQuestion('q', next), next);
  assert.equal(records[1], next[0]);
  assert.equal(repo.replaceForQuestion('q', records), records);
  assert.equal(records.length, 2);
  assert.equal(records[0], records[1]);
  assert.equal(records[0].id, 'keep');
});

test('relation/source membership uses iterables and SameValueZero with original row identities', () => {
  const token = {};
  const a = row('a', { questionId: token, learningObjectiveId: token });
  const b = row('b', { questionId: NaN });
  for (const create of [objective, source]) {
    const repo = create({ records: [a, b] });
    assert.deepEqual(repo.listByQuestionIds(new Set([token, NaN])), [a, b]);
    assert.deepEqual(repo.listByQuestionIds(null), []);
    assert.deepEqual(
      repo.listByQuestionIds(
        (function* () {
          yield token;
        })()
      ),
      [a]
    );
  }
  assert.equal(objective({ records: [a] }).listByObjectiveId(token)[0], a);
});

test('mark filters falsy source IDs, skips equal status, returns references and persists only changes', () => {
  const token = {};
  const records = [
    row('a', { sourceType: 'manual', sourceId: token, status: 'active' }),
    row('b', { sourceType: 'manual', sourceId: '', status: 'active' }),
    row('c', { sourceType: 'manual', sourceId: 'x', status: 'stale' }),
    row('d', { sourceType: 'other', sourceId: token })
  ];
  let calls = 0;
  const repo = source({ records, onChange: () => calls++ });
  const changed = repo.markBySourceIds('manual', [token, '', null, undefined, 0, false, NaN, 'x']);
  assert.deepEqual(changed, [records[0]]);
  assert.equal(changed[0], records[0]);
  assert.equal(records[0].status, 'stale');
  assert.equal(records[1].status, 'active');
  assert.equal(calls, 1);
  assert.deepEqual(repo.markBySourceIds('manual', [token, 'x']), []);
  assert.equal(calls, 1);
  assert.throws(() => repo.markBySourceIds('manual', new Set(['x'])), TypeError);
  const status = {};
  repo.markBySourceId('manual', token, status);
  assert.equal(records[0].status, status);
});

test('source mark preserves dynamic this dispatch and detached method failure', () => {
  const repo = source();
  const token = {};
  const receivers = [];
  let argumentsSeen;
  repo.markBySourceIds = function (...args) {
    receivers.push(this);
    argumentsSeen = args;
    return token;
  };
  assert.equal(repo.markBySourceId('manual', 'id', 'custom'), token);
  assert.equal(receivers[0], repo);
  assert.deepEqual(argumentsSeen, ['manual', ['id'], 'custom']);
  const detached = repo.markBySourceId;
  assert.throws(() => detached('manual', 'id'), TypeError);
});

test('source mark keeps status-before-date partial writes, RangeError, and error identities', () => {
  const records = [row('a', { sourceType: 'manual', sourceId: 'x', status: 'active' })];
  let calls = 0;
  const repo = source({ records, onChange: () => calls++ });
  const NativeDate = Date;
  replace(
    globalThis,
    'Date',
    class extends NativeDate {
      constructor() {
        super(NaN);
      }
    },
    () => assert.throws(() => repo.markBySourceId('manual', 'x'), RangeError)
  );
  assert.equal(records[0].status, 'stale');
  assert.equal(records[0].updatedAt, '2026-01-01');
  assert.equal(calls, 0);
  const failure = {};
  Object.defineProperty(records[0], 'updatedAt', {
    configurable: true,
    set() {
      throw failure;
    }
  });
  assert.throws(() => repo.markBySourceId('manual', 'x', 'custom'), errorIs(failure));
  assert.equal(records[0].status, 'custom');
  assert.equal(calls, 0);
});

test('changing getters remain unvalidated and retain reads, UUID fallback, and thrown identity', () => {
  const events = [];
  const token = {};
  const previous = [
    {
      get learningObjectiveId() {
        events.push('objective');
        return 'o';
      },
      get id() {
        events.push('id');
        return token;
      },
      get createdAt() {
        events.push('createdAt');
        return token;
      }
    }
  ];
  const result = identity('q', ['o'], previous, 'time');
  assert.equal(result[0].id, token);
  assert.equal(result[0].createdAt, token);
  assert.deepEqual(events, ['objective', 'id', 'createdAt']);
  let reads = 0;
  const record = {
    get id() {
      reads++;
      return reads === 1 ? 'x' : 'y';
    }
  };
  const repo = question({ records: [record] });
  assert.equal(repo.findById('x'), record);
  assert.equal(repo.findById('x'), null);
  assert.equal(reads, 2);
  const failure = {};
  assert.throws(
    () =>
      identity(
        'q',
        ['o'],
        [
          {
            learningObjectiveId: 'o',
            get id() {
              throw failure;
            }
          }
        ]
      ),
    errorIs(failure)
  );
});

test('null records retain wrapper-specific fallback while malformed calls retain native errors', () => {
  for (const create of [focus, objective, source]) assert.equal(create({ records: null }).list().length, 0);
  for (const create of [learning, profile, question]) assert.throws(() => create({ records: null }).list(), TypeError);
  for (const create of factories) {
    assert.throws(() => create(null), TypeError);
    assert.throws(() => create().save(row('x'), null), TypeError);
    assert.throws(() => create({ onChange: 1 }).create(row('x')), TypeError);
  }
});

test('identity preserves dynamic Set iterator output, Map receiver, and iterator failure', () => {
  const token = {};
  const nativeIterator = Set.prototype[Symbol.iterator];
  replace(
    Set.prototype,
    Symbol.iterator,
    function* () {
      for (const value of nativeIterator.call(this)) yield value === 'o' ? token : value;
    },
    () => {
      assert.equal(identity('q', ['o'])[0].learningObjectiveId, token);
    }
  );
  const nativeGet = Map.prototype.get;
  const receivers = [];
  replace(
    Map.prototype,
    'get',
    function (key) {
      receivers.push(this);
      return nativeGet.call(this, key);
    },
    () => identity('q', ['a', 'b'])
  );
  assert.equal(receivers.length, 2);
  assert.equal(receivers[0], receivers[1]);
  const failure = {};
  assert.throws(
    () =>
      identity('q', {
        [Symbol.iterator]() {
          throw failure;
        }
      }),
    errorIs(failure)
  );
});

test('sparse previous rows fail in Map while sparse objective IDs retain undefined once', () => {
  assert.throws(() => identity('q', ['o'], new Array(1)), TypeError);
  const objectiveIds = new Array(2);
  objectiveIds[1] = 'o';
  const generated = identity('q', objectiveIds, [], 'time');
  assert.equal(generated.length, 2);
  assert.equal(generated[0].learningObjectiveId, undefined);
  assert.equal(generated[1].learningObjectiveId, 'o');
  for (const create of factories) {
    const records = new Array(1);
    records.push(row('a'));
    const repo = create({ records });
    assert.throws(() => repo.findById('a'), TypeError);
    assert.equal(repo.list().length, 1);
  }
});

test('UUID generation remains between id and createdAt reads and does not occur for a live falsey id', () => {
  const events = [];
  const failure = {};
  replace(
    crypto,
    'randomUUID',
    () => {
      events.push('uuid');
      return 'fixed';
    },
    () => {
      const previous = [
        {
          learningObjectiveId: 'o',
          get id() {
            events.push('id');
            return null;
          },
          get createdAt() {
            events.push('createdAt');
            throw failure;
          }
        }
      ];
      assert.throws(() => identity('q', ['o'], previous, 'time'), errorIs(failure));
      assert.deepEqual(events, ['id', 'uuid', 'createdAt']);
      events.length = 0;
      const result = identity('q', ['o'], [{ learningObjectiveId: 'o', id: false, createdAt: false }], 'time');
      assert.equal(result[0].id, false);
      assert.equal(result[0].createdAt, false);
      assert.deepEqual(events, []);
    }
  );
});

test('source mark traverses rows in order and a later Date failure retains earlier timestamps without callback', () => {
  const records = ['a', 'b'].map(id => row(id, { sourceType: 'manual', sourceId: id, status: 'active' }));
  let calls = 0;
  let dates = 0;
  const failure = {};
  const NativeDate = Date;
  const repo = source({ records, onChange: () => calls++ });
  replace(
    globalThis,
    'Date',
    class extends NativeDate {
      toISOString() {
        if (++dates === 2) throw failure;
        return 'first-time';
      }
    },
    () => assert.throws(() => repo.markBySourceIds('manual', ['a', 'b']), errorIs(failure))
  );
  assert.equal(records[0].updatedAt, 'first-time');
  assert.equal(records[1].updatedAt, '2026-01-01');
  assert.deepEqual(
    records.map(item => item.status),
    ['stale', 'stale']
  );
  assert.equal(calls, 0);
});

test('construction captures records and callback getter once; replacement re-reads the live callback', () => {
  for (const create of factories) {
    const events = [];
    const records = [];
    let reads = 0;
    const options = {
      get records() {
        events.push('records');
        return records;
      },
      get onChange() {
        events.push('onChange');
        const index = ++reads;
        return function () {
          events.push(['callback', index, this === options]);
        };
      }
    };
    const repo = create(options);
    assert.deepEqual(events, ['records', 'onChange']);
    repo.create(row('a'));
    assert.deepEqual(events.at(-1), ['callback', 1, false]);
    if (create === objective || create === source) {
      repo.replaceForQuestion('q', []);
      assert.deepEqual(events.slice(-2), ['onChange', ['callback', 2, true]]);
    }
  }
});

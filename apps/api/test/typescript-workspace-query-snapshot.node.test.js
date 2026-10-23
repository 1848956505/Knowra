import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const baseline = process.env.KNOWRA_WORKSPACE_SNAPSHOT_BASELINE === '1';
const commit = '76ecf819ced7a618c0d2e5eef7bb017d84966b00';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
const infrastructure = new URL('../infrastructure/', root);
let snapshotModule;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-workspace-snapshot-'));
  try {
    const source = execFileSync(
      'git',
      ['show', `${commit}:apps/api/src/modules/knowledge/application/workspace-query-snapshot.js`],
      { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' }
    ).replace("'./workspace-query-utils.js'", JSON.stringify(new URL('workspace-query-utils.js', root).href));
    const filename = join(directory, 'workspace-query-snapshot.mjs');
    writeFileSync(filename, source);
    snapshotModule = await import(pathToFileURL(filename).href);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  snapshotModule = await import(new URL('workspace-query-snapshot.js', root));
}
const { createWorkspaceSnapshotReader: create } = snapshotModule;
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
const collectionKeys = specifications.map(([key]) => key);
const indexKeys = [
  'noteById',
  'noteVersionById',
  'evidenceByItem',
  'objectivesByItem',
  'focusByProfile',
  'linksByQuestion',
  'sourcesByQuestion',
  'questionsByObjective'
];
const grouping = [
  ['evidence', 'knowledgeItemId', 'evidenceByItem'],
  ['objectives', 'knowledgeItemId', 'objectivesByItem'],
  ['focuses', 'examProfileId', 'focusByProfile'],
  ['questionObjectives', 'questionId', 'linksByQuestion'],
  ['questionSources', 'questionId', 'sourcesByQuestion']
];
const errorIs = expected => actual => Object.is(actual, expected);
function fixture(overrides = {}) {
  const values = { ...Object.fromEntries(collectionKeys.map(key => [key, []])), ...overrides };
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
  return { values, calls, repositories, reader: create({ repositories }) };
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
function assertReferences(snapshot, values) {
  for (const key of collectionKeys) assert.equal(snapshot[key], values[key], key);
}

test('workspace snapshot bridge preserves its sole exported function identity', { skip: baseline }, async () => {
  const ts = await import(new URL('workspace-query-snapshot.ts', root));
  assert.deepEqual(Object.keys(snapshotModule), ['createWorkspaceSnapshotReader']);
  assert.deepEqual(Object.keys(snapshotModule), Object.keys(ts));
  assert.equal(create, ts.createWorkspaceSnapshotReader);
});

test('factory defaults and falsy repositories retain synchronous validation', () => {
  const required = error => error instanceof TypeError && error.message === 'Workspace query repositories are required';
  assert.throws(() => create(), required);
  assert.throws(() => create(undefined), required);
  assert.throws(() => create({}), required);
  for (const repositories of [undefined, null, false, 0, -0, 0n, '', NaN]) {
    assert.throws(() => create({ repositories }), required);
  }
  assert.throws(() => create(null), TypeError);
  for (const options of [false, 1, 'text', Symbol('options'), 1n]) assert.throws(() => create(options), required);
});

test('factory captures repositories once, performs no reads, and load works detached', async () => {
  const setup = fixture();
  let reads = 0;
  const options = {
    get repositories() {
      reads++;
      return setup.repositories;
    }
  };
  const reader = create(options);
  assert.deepEqual(Object.keys(reader), ['load']);
  assert.equal(reads, 1);
  assert.deepEqual(setup.calls, []);
  Object.defineProperty(options, 'repositories', { value: null });
  const { load } = reader;
  assertReferences(await load.call({ repositories: null }), setup.values);
  assert.equal(reads, 1);
  const failure = {};
  assert.throws(
    () =>
      create({
        get repositories() {
          throw failure;
        }
      }),
    errorIs(failure)
  );
});

test('truthy incomplete repositories are accepted until load rejects asynchronously', async () => {
  for (const repositories of [{}, [], true, 1, 'text', Symbol('repositories'), 1n]) {
    const reader = create({ repositories });
    let pending;
    assert.doesNotThrow(() => {
      pending = reader.load();
    });
    assert.ok(pending instanceof Promise);
    await assert.rejects(pending, TypeError);
  }
});

test('load calls eight repositories in order with exact options and original receivers', async () => {
  const setup = fixture();
  const pending = setup.reader.load('ignored');
  assert.deepEqual(
    setup.calls.map(call => call.key),
    collectionKeys.slice(0, 8)
  );
  const snapshot = await pending;
  assert.deepEqual(
    setup.calls.map(call => call.key),
    collectionKeys
  );
  for (let index = 0; index < specifications.length; index++) {
    const [, name, , args] = specifications[index];
    assert.deepEqual(setup.calls[index].args, args);
    assert.equal(setup.calls[index].receiver, setup.repositories[name]);
  }
  assert.deepEqual(Object.keys(snapshot), [...collectionKeys, 'indexes']);
  assert.deepEqual(Object.keys(snapshot.indexes), indexKeys);
  assertReferences(snapshot, setup.values);
  for (const index of Object.values(snapshot.indexes)) {
    assert.ok(index instanceof Map);
    assert.equal(index.size, 0);
  }
});

test('both Promise.all phases start concurrently and the second waits for all eight first results', async () => {
  const gates = Object.fromEntries(collectionKeys.map(key => [key, deferred()]));
  const setup = fixture(Object.fromEntries(collectionKeys.map(key => [key, gates[key].promise])));
  const pending = setup.reader.load();
  assert.equal(setup.calls.length, 8);
  for (const key of collectionKeys.slice(1, 8)) gates[key].resolve([]);
  await setImmediate();
  assert.equal(setup.calls.length, 8);
  gates.notes.resolve([]);
  await setImmediate();
  assert.deepEqual(
    setup.calls.map(call => call.key),
    collectionKeys
  );
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  gates.questionSources.resolve([]);
  await setImmediate();
  assert.equal(settled, false);
  gates.questionObjectives.resolve([]);
  const snapshot = await pending;
  assert.equal(settled, true);
  assert.equal(snapshot.questions, await gates.questions.promise);
});

test('sync throws while constructing either Promise.all stop later calls and preserve identity', async () => {
  for (let target = 0; target < specifications.length; target++) {
    const setup = fixture();
    const [, name, method] = specifications[target];
    const failure = { target };
    setup.repositories[name][method] = function () {
      assert.equal(this, setup.repositories[name]);
      setup.calls.push({ key: collectionKeys[target] });
      throw failure;
    };
    let pending;
    assert.doesNotThrow(() => {
      pending = setup.reader.load();
    });
    await assert.rejects(pending, errorIs(failure));
    assert.deepEqual(
      setup.calls.map(call => call.key),
      collectionKeys.slice(0, target + 1)
    );
  }
});

test('rejected promises and throwing then getters retain identity after every call in their phase', async () => {
  for (let target = 0; target < specifications.length; target++) {
    for (const mode of ['reject', 'getter', 'then']) {
      const failure = { target, mode };
      const setup = fixture();
      const [, name, method] = specifications[target];
      setup.repositories[name][method] = function () {
        setup.calls.push({ key: collectionKeys[target] });
        if (mode === 'reject') return Promise.reject(failure);
        if (mode === 'getter')
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
      };
      await assert.rejects(setup.reader.load(), errorIs(failure));
      assert.deepEqual(
        setup.calls.map(call => call.key),
        collectionKeys.slice(0, target < 8 ? 8 : 10)
      );
    }
  }
});

test('repository and method getters are evaluated live in call order and forward their throws', async () => {
  for (let target = 0; target < specifications.length; target++) {
    for (const level of ['repository', 'method']) {
      const setup = fixture();
      const [, name, method] = specifications[target];
      const failure = { target, level };
      throwingProperty(
        level === 'repository' ? setup.repositories : setup.repositories[name],
        level === 'repository' ? name : method,
        failure
      );
      await assert.rejects(setup.reader.load(), errorIs(failure));
      assert.deepEqual(
        setup.calls.map(call => call.key),
        collectionKeys.slice(0, target)
      );
    }
  }
});

test('repeat loads reread repository objects and methods while allocating fresh flags and indexes', async () => {
  const setup = fixture();
  const events = [];
  let reads = 0;
  const repositories = setup.repositories;
  Object.defineProperty(repositories, 'noteRepository', {
    get() {
      const generation = ++reads;
      events.push(`repository:${generation}`);
      const repository = {
        get list() {
          events.push(`method:${generation}`);
          return function (options) {
            assert.equal(this, repository);
            assert.deepEqual(options, { includeDeleted: true });
            events.push(`call:${generation}`);
            return [{ id: generation }];
          };
        }
      };
      return repository;
    }
  });
  const first = await setup.reader.load();
  const second = await setup.reader.load();
  assert.equal(first.notes[0].id, 1);
  assert.equal(second.notes[0].id, 2);
  assert.deepEqual(events, ['repository:1', 'method:1', 'call:1', 'repository:2', 'method:2', 'call:2']);
  assert.notEqual(first, second);
  for (const key of indexKeys) assert.notEqual(first.indexes[key], second.indexes[key]);
  const flags = setup.calls.filter(call => call.args.length && call.key !== 'questionObjectives');
  assert.equal(new Set(flags.map(call => call.args[0])).size, flags.length);
});

test('resolved collections pass through unchanged and unindexed collections are not inspected', async () => {
  const inaccessible = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'then') return undefined;
        throw new Error('unindexed collection was inspected');
      }
    }
  );
  for (const value of [undefined, null, false, 0, 'legacy', Symbol('legacy'), inaccessible]) {
    const setup = fixture({ knowledgeItems: value, profiles: value });
    const snapshot = await setup.reader.load();
    assertReferences(snapshot, setup.values);
  }
  const setup = fixture();
  for (const [key, name, method] of specifications) {
    const collection = setup.values[key];
    const result = {
      then(resolve) {
        assert.equal(this, result);
        resolve(collection);
      }
    };
    setup.repositories[name][method] = () => result;
  }
  assertReferences(await setup.reader.load(), setup.values);
});

test('question IDs preserve order, duplicates, unusual keys and the exact mapped array', async () => {
  const object = {};
  const symbol = Symbol('id');
  const ids = ['b', 'a', 'b', undefined, null, NaN, object, symbol, 0, -0];
  const questions = ids.map(id => ({ id }));
  const setup = fixture({ questions });
  const snapshot = await setup.reader.load();
  const passedIds = setup.calls.at(-2).args[0];
  assert.deepEqual(passedIds, ids);
  assert.notEqual(passedIds, questions);
  assert.equal(passedIds[6], object);
  assert.equal(snapshot.questions, questions);
});

test('custom question map is read twice and passes arbitrary first result to link repository', async () => {
  const ids = Symbol('not-an-array');
  const question = { id: 'callback' };
  const indexed = { indexed: true };
  const events = [];
  let reads = 0;
  const questions = {
    get map() {
      const round = ++reads;
      events.push(`get:${round}`);
      return function (callback) {
        assert.equal(this, questions);
        assert.equal(arguments.length, 1);
        events.push(`call:${round}`);
        const actual = callback.call({ id: 'wrong' }, question);
        if (round === 1) {
          assert.equal(actual, 'callback');
          return ids;
        }
        assert.deepEqual(actual, ['callback', question]);
        return new Set([['actual', indexed]]);
      };
    }
  };
  const setup = fixture({ questions, questionObjectives: [{ questionId: 'actual', learningObjectiveId: 'o' }] });
  const snapshot = await setup.reader.load();
  assert.equal(setup.calls.at(-2).args[0], ids);
  assert.equal(snapshot.questions, questions);
  assert.deepEqual(snapshot.indexes.questionsByObjective.get('o'), [indexed]);
  assert.deepEqual(events, ['get:1', 'call:1', 'get:2', 'call:2']);
});

test('question map getters, callbacks and first mapping failures stop before the second phase', async () => {
  for (const mode of ['getter', 'method', 'record']) {
    const failure = { mode };
    const questions = mode === 'record' ? [{}] : {};
    if (mode === 'getter') throwingProperty(questions, 'map', failure);
    if (mode === 'method')
      questions.map = () => {
        throw failure;
      };
    if (mode === 'record') throwingProperty(questions[0], 'id', failure);
    const setup = fixture({ questions });
    await assert.rejects(setup.reader.load(), errorIs(failure));
    assert.equal(setup.calls.length, 8);
  }
});

test('note and version custom maps retain receivers, callbacks and iterable result identity', async () => {
  for (const [key, index] of [
    ['notes', 'noteById'],
    ['noteVersions', 'noteVersionById']
  ]) {
    const record = { id: 'callback' };
    const indexed = { actual: true };
    const keyObject = {};
    const collection = {
      map(callback) {
        assert.equal(this, collection);
        assert.equal(arguments.length, 1);
        assert.deepEqual(callback.call({ id: 'wrong' }, record), ['callback', record]);
        return new Set([
          ['first', 'overwritten'],
          [keyObject, indexed],
          ['first', indexed]
        ]);
      }
    };
    const setup = fixture({ [key]: collection });
    const snapshot = await setup.reader.load();
    assert.equal(snapshot[key], collection);
    assert.deepEqual(
      [...snapshot.indexes[index]],
      [
        ['first', indexed],
        [keyObject, indexed]
      ]
    );
    assert.equal(snapshot.indexes[index].get(keyObject), indexed);
  }
});

test('native Map construction keeps duplicate overwrite, insertion order, NaN and reference keys', async () => {
  const object = {};
  const otherObject = {};
  const symbol = Symbol('key');
  const keys = ['b', 'a', 'b', NaN, NaN, object, otherObject, object, symbol, null, undefined, 0, -0];
  const records = keys.map((id, position) => ({ id, position }));
  const links = keys.map(questionId => ({ questionId, learningObjectiveId: questionId }));
  const setup = fixture({ notes: records, noteVersions: records, questions: records, questionObjectives: links });
  const snapshot = await setup.reader.load();
  const expected = new Map(records.map(record => [record.id, record]));
  for (const index of ['noteById', 'noteVersionById']) {
    assert.deepEqual([...snapshot.indexes[index]], [...expected]);
    assert.equal(snapshot.indexes[index].get(object), records[7]);
    assert.equal(snapshot.indexes[index].get(NaN), records[4]);
    assert.equal(snapshot.indexes[index].get(0), records[12]);
  }
  for (const key of expected.keys()) {
    const count = links.filter(link => Object.is(link.questionId, key) || (link.questionId === 0 && key === 0)).length;
    assert.deepEqual(snapshot.indexes.questionsByObjective.get(key), Array(count).fill(expected.get(key)));
  }
});

test('every grouping preserves key identity, missing and null keys, record references and input order', async () => {
  const object = {};
  const other = {};
  const symbol = Symbol('key');
  const keys = [undefined, null, object, object, other, NaN, NaN, -0, 0, symbol, '__proto__'];
  const overrides = Object.fromEntries(
    grouping.map(([collection, field]) => [collection, keys.map((key, position) => ({ [field]: key, position }))])
  );
  const setup = fixture(overrides);
  const snapshot = await setup.reader.load();
  for (const [collection, field, index] of grouping) {
    const expected = new Map();
    for (const record of overrides[collection])
      expected.set(record[field], [...(expected.get(record[field]) ?? []), record]);
    assert.deepEqual([...snapshot.indexes[index]], [...expected]);
    for (const [key, records] of expected) {
      assert.notEqual(snapshot.indexes[index].get(key), records);
      for (let position = 0; position < records.length; position++)
        assert.equal(snapshot.indexes[index].get(key)[position], records[position]);
    }
  }
});

test('question links preserve repeated links and link order while ignoring missing question IDs', async () => {
  const old = { id: 'q1', version: 1 };
  const latest = { id: 'q1', version: 2 };
  const second = { id: 'q2' };
  const links = [
    { questionId: 'q2', learningObjectiveId: 'o2' },
    { questionId: 'absent', learningObjectiveId: 'missing' },
    { questionId: 'q1', learningObjectiveId: 'o1' },
    { questionId: 'q2', learningObjectiveId: 'o1' },
    { questionId: 'q1', learningObjectiveId: 'o1' },
    { questionId: 'q1' }
  ];
  const snapshot = await fixture({ questions: [old, second, latest], questionObjectives: links }).reader.load();
  assert.deepEqual(
    [...snapshot.indexes.questionsByObjective],
    [
      ['o2', [second]],
      ['o1', [latest, second, latest]],
      [undefined, [latest]]
    ]
  );
  assert.equal(snapshot.indexes.questionsByObjective.has('missing'), false);
  assert.deepEqual(snapshot.indexes.linksByQuestion.get('q1'), [links[2], links[4], links[5]]);
  assert.equal(snapshot.indexes.linksByQuestion.get('absent')[0], links[1]);
});

test('custom question entries preserve original truthiness rather than requiring record objects', async () => {
  const values = [undefined, null, false, 0, -0, 0n, '', NaN, true, 1, 1n, 'text', Symbol('question'), {}];
  let maps = 0;
  const questions = {
    map() {
      return ++maps === 1 ? [] : values.map((value, key) => [key, value]);
    }
  };
  const links = values.map((value, questionId) => ({ questionId, learningObjectiveId: questionId }));
  const snapshot = await fixture({ questions, questionObjectives: links }).reader.load();
  for (let key = 0; key < values.length; key++) {
    assert.equal(snapshot.indexes.questionsByObjective.has(key), Boolean(values[key]));
    if (values[key]) assert.equal(snapshot.indexes.questionsByObjective.get(key)[0], values[key]);
  }
});

test('custom reduce results pass through for every grouped index including both link reductions', async () => {
  const events = [];
  const sentinels = Object.fromEntries(indexKeys.map(key => [key, Symbol(key)]));
  const overrides = {};
  for (const [collection, field, index] of grouping) {
    let calls = 0;
    const records = {
      get reduce() {
        const round = ++calls;
        events.push(`${collection}.get:${round}`);
        return function (callback, initial) {
          assert.equal(this, records);
          assert.equal(arguments.length, 2);
          assert.ok(initial instanceof Map);
          assert.equal(initial.size, 0);
          events.push(`${collection}.call:${round}`);
          const record = { [field]: 'key' };
          if (collection === 'questionObjectives' && round === 2) {
            record.questionId = 'q';
            record.learningObjectiveId = 'o';
            assert.equal(callback.call({ irrelevant: true }, initial, record), initial);
            assert.deepEqual(initial.get('o'), [overrides.questions[0]]);
            return sentinels.questionsByObjective;
          }
          assert.equal(callback.call({ irrelevant: true }, initial, record), initial);
          assert.equal(initial.get('key')[0], record);
          return sentinels[index];
        };
      }
    };
    overrides[collection] = records;
  }
  overrides.questions = [{ id: 'q' }];
  const snapshot = await fixture(overrides).reader.load();
  for (const [, , index] of grouping) assert.equal(snapshot.indexes[index], sentinels[index]);
  assert.equal(snapshot.indexes.questionsByObjective, sentinels.questionsByObjective);
  assert.deepEqual(events, [
    ...grouping.flatMap(([collection]) => [`${collection}.get:1`, `${collection}.call:1`]),
    'questionObjectives.get:2',
    'questionObjectives.call:2'
  ]);
});

test('custom reducers retain dynamic accumulator get, push and set methods and arbitrary return', async () => {
  for (const [collection, field, index] of grouping.filter(([key]) => key !== 'questionObjectives')) {
    const events = [];
    const record = { [field]: 'selected' };
    const sentinel = {};
    const group = {
      get push() {
        events.push('get push');
        return function (value) {
          assert.equal(this, group);
          assert.equal(value, record);
          events.push('push');
        };
      }
    };
    const accumulator = {
      get get() {
        events.push('get get');
        return function (key) {
          assert.equal(this, accumulator);
          assert.equal(key, 'selected');
          events.push('get');
          return group;
        };
      },
      get set() {
        events.push('get set');
        return function (key, value) {
          assert.equal(this, accumulator);
          assert.equal(key, 'selected');
          assert.equal(value, group);
          events.push('set');
        };
      }
    };
    const records = {
      reduce(callback) {
        assert.equal(callback(accumulator, record), accumulator);
        return sentinel;
      }
    };
    const snapshot = await fixture({ [collection]: records }).reader.load();
    assert.equal(snapshot.indexes[index], sentinel);
    assert.deepEqual(events, ['get get', 'get', 'get push', 'push', 'get set', 'set']);
  }
});

test('index construction retains map and reduce evaluation order', async () => {
  const events = [];
  const overrides = {};
  for (const key of ['notes', 'noteVersions', 'questions']) {
    overrides[key] = {
      map() {
        events.push(`${key}.map`);
        return [];
      }
    };
  }
  for (const [key] of grouping) {
    overrides[key] = {
      reduce(callback, initial) {
        events.push(`${key}.reduce`);
        return initial;
      }
    };
  }
  const setup = fixture(overrides);
  await setup.reader.load();
  assert.deepEqual(events, [
    'questions.map',
    'notes.map',
    'noteVersions.map',
    'evidence.reduce',
    'objectives.reduce',
    'focuses.reduce',
    'questionObjectives.reduce',
    'questionSources.reduce',
    'questions.map',
    'questionObjectives.reduce'
  ]);
});

test('changing question and link getters are reread at original projection and grouping points', async () => {
  const events = [];
  let questionReads = 0;
  const question = {
    get id() {
      events.push('question.id');
      return ++questionReads === 1 ? 'listed' : 'indexed';
    }
  };
  let objectiveReads = 0;
  const link = {
    get questionId() {
      events.push('link.questionId');
      return 'indexed';
    },
    get learningObjectiveId() {
      events.push('link.learningObjectiveId');
      return ++objectiveReads === 1 ? 'read' : 'written';
    }
  };
  const setup = fixture({ questions: [question], questionObjectives: [link] });
  const snapshot = await setup.reader.load();
  assert.deepEqual(setup.calls.at(-2).args[0], ['listed']);
  assert.equal(snapshot.indexes.questionsByObjective.has('read'), false);
  assert.deepEqual(snapshot.indexes.questionsByObjective.get('written'), [question]);
  assert.deepEqual(events, [
    'question.id',
    'link.questionId',
    'question.id',
    'link.questionId',
    'link.learningObjectiveId',
    'link.learningObjectiveId'
  ]);
});

test('unmatched questions skip learning objective getters entirely', async () => {
  const failure = {};
  const link = { questionId: 'missing' };
  throwingProperty(link, 'learningObjectiveId', failure);
  const snapshot = await fixture({ questionObjectives: [link] }).reader.load();
  assert.equal(snapshot.indexes.questionsByObjective.size, 0);
  assert.equal(snapshot.indexes.linksByQuestion.get('missing')[0], link);
});

test('sparse grouping arrays skip holes, but sparse mapped ID entries retain native Map failures', async () => {
  const overrides = {};
  for (const [key, field] of grouping) {
    overrides[key] = new Array(4);
    overrides[key][2] = { [field]: 'group' };
  }
  const snapshot = await fixture(overrides).reader.load();
  for (const [key, , index] of grouping)
    assert.deepEqual([...snapshot.indexes[index]], [['group', [overrides[key][2]]]]);
  for (const key of ['notes', 'noteVersions', 'questions']) {
    const sparse = new Array(3);
    sparse[1] = { id: 'present' };
    const setup = fixture({ [key]: sparse });
    await assert.rejects(setup.reader.load(), TypeError);
    assert.equal(setup.calls.length, 10);
    if (key === 'questions') {
      const ids = setup.calls.at(-2).args[0];
      assert.equal(ids.length, 3);
      assert.deepEqual(Object.keys(ids), ['1']);
      assert.equal(ids[1], 'present');
    }
  }
});

test('missing, null and malformed indexed collections retain native failures without defaults', async () => {
  for (const key of collectionKeys.filter(key => key !== 'knowledgeItems' && key !== 'profiles')) {
    for (const value of [undefined, null, false, {}, { map: null, reduce: null }]) {
      const setup = fixture({ [key]: value });
      await assert.rejects(setup.reader.load(), TypeError);
      assert.equal(setup.calls.length, key === 'questions' ? 8 : 10);
    }
  }
});

test('each Map constructor consumes custom iterables and forwards iterator failures by identity', async () => {
  for (const key of ['notes', 'noteVersions', 'questions']) {
    for (const stage of ['iterator', 'next', 'entry']) {
      const failure = { key, stage };
      let maps = 0;
      const iterable = {
        [Symbol.iterator]() {
          if (stage === 'iterator') throw failure;
          return {
            next() {
              if (stage === 'next') throw failure;
              const value = { 1: 'value' };
              throwingProperty(value, '0', failure);
              return { value, done: false };
            },
            return() {
              return { done: true };
            }
          };
        }
      };
      const collection = {
        map() {
          return key === 'questions' && ++maps === 1 ? [] : iterable;
        }
      };
      const setup = fixture({ [key]: collection });
      await assert.rejects(setup.reader.load(), errorIs(failure));
      assert.equal(setup.calls.length, 10);
    }
    for (const invalid of [1, false, {}, [null], [undefined], ['not-an-entry']]) {
      let maps = 0;
      const collection = {
        map() {
          return key === 'questions' && ++maps === 1 ? [] : invalid;
        }
      };
      await assert.rejects(fixture({ [key]: collection }).reader.load(), TypeError);
    }
  }
});

test('Map constructors retain null and undefined iterable empty-map behavior', async () => {
  for (const value of [null, undefined]) {
    const notes = { map: () => value };
    const versions = { map: () => value };
    let maps = 0;
    const questions = { map: () => (++maps === 1 ? [] : value) };
    const snapshot = await fixture({ notes, noteVersions: versions, questions }).reader.load();
    assert.equal(snapshot.indexes.noteById.size, 0);
    assert.equal(snapshot.indexes.noteVersionById.size, 0);
    assert.equal(snapshot.indexes.questionsByObjective.size, 0);
  }
});

test('all index map, reduce and callback getter failures reject with their exact thrown value', async () => {
  for (const [key, field] of [
    ['notes', 'id'],
    ['noteVersions', 'id'],
    ...grouping.map(([key, field]) => [key, field])
  ]) {
    for (const stage of ['method getter', 'method body', 'record getter']) {
      const failure = { key, stage };
      const method = key === 'notes' || key === 'noteVersions' ? 'map' : 'reduce';
      const collection = stage === 'record getter' ? [{}] : {};
      if (stage === 'method getter') throwingProperty(collection, method, failure);
      if (stage === 'method body')
        collection[method] = () => {
          throw failure;
        };
      if (stage === 'record getter') throwingProperty(collection[0], field, failure);
      const setup = fixture({ [key]: collection });
      await assert.rejects(setup.reader.load(), errorIs(failure));
      assert.equal(setup.calls.length, 10);
    }
  }
  for (const stage of ['second map', 'second reduce', 'objective getter']) {
    const failure = { stage };
    const setup = fixture({ questions: [{ id: 'q' }], questionObjectives: [{ questionId: 'q' }] });
    if (stage === 'second map') {
      let calls = 0;
      setup.values.questions.map = function (callback) {
        if (++calls === 2) throw failure;
        return Array.prototype.map.call(this, callback);
      };
    } else if (stage === 'second reduce') {
      let calls = 0;
      setup.values.questionObjectives.reduce = function (callback, initial) {
        if (++calls === 2) throw failure;
        return Array.prototype.reduce.call(this, callback, initial);
      };
    } else {
      throwingProperty(setup.values.questionObjectives[0], 'learningObjectiveId', failure);
    }
    await assert.rejects(setup.reader.load(), errorIs(failure));
  }
});

test('real synchronous in-memory repository shapes preserve archive flags and related indexes', async () => {
  const data = {
    notes: [{ id: 'n', title: 'note', rawMarkdown: '', deleted: true }],
    noteVersions: [{ id: 'v', noteId: 'n' }],
    knowledgeItems: [{ id: 'k', reviewStatus: 'archived', deletedAt: '2026-01-01' }],
    evidence: [{ id: 'e', knowledgeItemId: 'k', noteId: 'n' }],
    objectives: [{ id: 'o', knowledgeItemId: 'k', reviewStatus: 'archived' }],
    profiles: [{ id: 'p', archivedAt: '2026-01-01' }],
    focuses: [{ id: 'f', examProfileId: 'p', learningObjectiveId: 'o', reviewStatus: 'archived' }],
    questions: [
      { id: 'q', reviewStatus: 'archived' },
      { id: 'deleted', deletedAt: '2026-01-01' }
    ],
    questionObjectives: [
      { id: 'l', questionId: 'q', learningObjectiveId: 'o' },
      { id: 'missing', questionId: 'absent' }
    ],
    questionSources: [
      { id: 's', questionId: 'q' },
      { id: 'orphan', questionId: 'absent' }
    ]
  };
  const repositories = {};
  for (const [key, name] of specifications) {
    const stem = name.replace(/Repository$/, '').replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const module = await import(new URL(`${stem}-repository.js`, infrastructure));
    const factory = module[`createInMemory${name[0].toUpperCase()}${name.slice(1)}`];
    repositories[name] = factory({ records: data[key] });
  }
  const snapshot = await create({ repositories }).load();
  for (const key of collectionKeys) assert.equal(snapshot[key][0], data[key][0], key);
  assert.deepEqual(
    snapshot.questions.map(record => record.id),
    ['q']
  );
  assert.deepEqual(
    snapshot.questionObjectives.map(record => record.id),
    ['l']
  );
  assert.deepEqual(
    snapshot.questionSources.map(record => record.id),
    ['s', 'orphan']
  );
  assert.equal(snapshot.indexes.noteById.get('n'), data.notes[0]);
  assert.equal(snapshot.indexes.noteVersionById.get('v'), data.noteVersions[0]);
  assert.deepEqual(snapshot.indexes.questionsByObjective.get('o'), [data.questions[0]]);
  assert.deepEqual(snapshot.indexes.evidenceByItem.get('k'), data.evidence);
});

test('real PostgreSQL factories run through async mock clients without a database', async () => {
  const rows = {
    notes: [{ id: 'n', title: 'note', rawMarkdown: '', deletedAt: new Date('2026-01-01') }],
    noteVersions: [{ id: 'v', noteId: 'n' }],
    knowledgeItems: [{ id: 'k', reviewStatus: 'archived' }],
    evidence: [{ id: 'e', knowledgeItemId: 'k', noteId: 'n' }],
    objectives: [{ id: 'o', knowledgeItemId: 'k' }],
    profiles: [{ id: 'p' }],
    focuses: [{ id: 'f', examProfileId: 'p', learningObjectiveId: 'o' }],
    questions: [{ id: 'q' }],
    questionObjectives: [{ id: 'l', questionId: 'q', learningObjectiveId: 'o' }],
    questionSources: [{ id: 's', questionId: 'q' }]
  };
  const calls = [];
  const repositories = {};
  for (const [key, name] of specifications) {
    const model = name.replace(/Repository$/, '');
    const stem = model.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const module = await import(new URL(`postgres/${stem}-repository.js`, infrastructure));
    const factory = module[`createPostgres${name[0].toUpperCase()}${name.slice(1)}`];
    const client = {
      async findMany(options) {
        assert.equal(this, client);
        calls.push({ key, options });
        return rows[key];
      }
    };
    repositories[name] = factory({ db: { [model]: client } });
  }
  const snapshot = await create({ repositories }).load();
  assert.deepEqual(
    calls.map(call => call.key),
    collectionKeys
  );
  assert.equal(snapshot.notes[0].deleted, true);
  assert.equal(snapshot.indexes.noteById.get('n'), snapshot.notes[0]);
  assert.equal(snapshot.indexes.noteVersionById.get('v'), snapshot.noteVersions[0]);
  assert.equal(snapshot.indexes.evidenceByItem.get('k')[0], snapshot.evidence[0]);
  assert.equal(snapshot.indexes.questionsByObjective.get('o')[0], snapshot.questions[0]);
  assert.deepEqual(calls.find(call => call.key === 'questionObjectives').options.where, { questionId: { in: ['q'] } });
  assert.deepEqual(calls.find(call => call.key === 'knowledgeItems').options.where, {});
  assert.deepEqual(calls.find(call => call.key === 'questions').options.where, { deletedAt: null });
  assert.equal(Object.hasOwn(calls.find(call => call.key === 'notes').options.where, 'deletedAt'), false);
  for (const key of collectionKeys) assert.notEqual(snapshot[key][0], rows[key][0], key);
});

test('primitive throws and rejection reasons remain exact, including undefined and NaN', async () => {
  for (const failure of [undefined, null, false, 0, -0, '', NaN, 1n, Symbol('failure')]) {
    for (const target of [0, 8]) {
      for (const mode of ['throw', 'reject', 'then getter', 'then call']) {
        const setup = fixture();
        const [, name, method] = specifications[target];
        setup.repositories[name][method] = () => {
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
        };
        await assert.rejects(setup.reader.load(), errorIs(failure));
      }
    }
  }
});

test('second-phase repositories and methods are read after first-phase asynchronous completion', async () => {
  const gate = deferred();
  const setup = fixture({ questions: gate.promise });
  const pending = setup.reader.load();
  const links = [{ questionId: 'q', learningObjectiveId: 'o' }];
  const sources = [{ questionId: 'q' }];
  const events = [];
  const replacement = {
    get listByQuestionIds() {
      events.push('links method');
      return function (ids) {
        assert.equal(this, replacement);
        assert.deepEqual(ids, ['q']);
        events.push('links call');
        setup.repositories.questionSourceRepository.list = () => {
          events.push('sources replacement');
          return sources;
        };
        return links;
      };
    }
  };
  Object.defineProperty(setup.repositories, 'questionObjectiveRepository', {
    get() {
      events.push('links repository');
      return replacement;
    }
  });
  gate.resolve([{ id: 'q' }]);
  const snapshot = await pending;
  assert.equal(snapshot.questionObjectives, links);
  assert.equal(snapshot.questionSources, sources);
  assert.deepEqual(events, ['links repository', 'links method', 'links call', 'sources replacement']);
});

test('custom link reduction preserves dynamic accumulator methods and nullish group fallback', async () => {
  for (const previous of [undefined, null, false, 0, '', NaN, []]) {
    const question = { id: 'q' };
    const link = { questionId: 'q', learningObjectiveId: 'o' };
    const events = [];
    let stored;
    const accumulator = {
      get get() {
        events.push('get getter');
        return function (key) {
          assert.equal(this, accumulator);
          assert.equal(key, 'o');
          events.push('get call');
          return previous;
        };
      },
      get set() {
        events.push('set getter');
        return function (key, value) {
          assert.equal(this, accumulator);
          assert.equal(key, 'o');
          events.push('set call');
          stored = value;
        };
      }
    };
    const sentinel = Symbol('arbitrary result');
    let reductions = 0;
    const links = {
      reduce(callback, initial) {
        assert.equal(this, links);
        if (++reductions === 1) return initial;
        assert.equal(callback.call({ incorrect: true }, accumulator, link), accumulator);
        return sentinel;
      }
    };
    const pending = fixture({ questions: [question], questionObjectives: links }).reader.load();
    if (previous === null || previous === undefined || Array.isArray(previous)) {
      const snapshot = await pending;
      assert.equal(snapshot.indexes.questionsByObjective, sentinel);
      assert.deepEqual(stored, [question]);
      if (Array.isArray(previous)) assert.equal(stored, previous);
      assert.deepEqual(events, ['get getter', 'get call', 'set getter', 'set call']);
    } else {
      await assert.rejects(pending, TypeError);
      assert.deepEqual(events, ['get getter', 'get call']);
    }
  }
});

test('custom link accumulator get, push and set failures retain exact error identity', async () => {
  for (const stage of ['get getter', 'get call', 'push getter', 'push call', 'set getter', 'set call']) {
    const failure = { stage };
    const group = {
      push() {
        if (stage === 'push call') throw failure;
      }
    };
    if (stage === 'push getter') throwingProperty(group, 'push', failure);
    const accumulator = {
      get() {
        if (stage === 'get call') throw failure;
        return group;
      },
      set() {
        if (stage === 'set call') throw failure;
      }
    };
    if (stage === 'get getter') throwingProperty(accumulator, 'get', failure);
    if (stage === 'set getter') throwingProperty(accumulator, 'set', failure);
    let reductions = 0;
    const links = {
      reduce(callback, initial) {
        if (++reductions === 1) return initial;
        return callback(accumulator, { questionId: 'q', learningObjectiveId: 'o' });
      }
    };
    await assert.rejects(
      fixture({ questions: [{ id: 'q' }], questionObjectives: links }).reader.load(),
      errorIs(failure)
    );
  }
});

test('custom reductions retain undefined, null and other arbitrary result values without coercion', async () => {
  for (const result of [undefined, null, false, 0, '', 1n, Symbol('result'), {}]) {
    const collection = {
      reduce() {
        return result;
      }
    };
    const setup = fixture(Object.fromEntries(grouping.map(([key]) => [key, collection])));
    const snapshot = await setup.reader.load();
    for (const [, , index] of grouping) assert.equal(snapshot.indexes[index], result);
    assert.equal(snapshot.indexes.questionsByObjective, result);
  }
});

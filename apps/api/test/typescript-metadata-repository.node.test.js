import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryKnowledgeSpaceRepository } from '../src/modules/knowledge/infrastructure/knowledge-space-repository.js';
import { createInMemoryFolderRepository } from '../src/modules/knowledge/infrastructure/folder-repository.js';
import { createInMemoryTagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.js';
import { createInMemoryTagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.js';

const factories = [
  ['space', createInMemoryKnowledgeSpaceRepository],
  ['folder', createInMemoryFolderRepository],
  ['tag group', createInMemoryTagGroupRepository],
  ['tag', createInMemoryTagRepository]
];
const row = (id, extra = {}) => ({ id, name: id, ...extra });
const ids = records => records.map(record => record.id);

test('metadata repository bridges preserve exact exports and function identities', async () => {
  for (const name of ['knowledge-space', 'folder', 'tag-group', 'tag']) {
    const js = await import(`../src/modules/knowledge/infrastructure/${name}-repository.js`);
    const ts = await import(`../src/modules/knowledge/infrastructure/${name}-repository.ts`);
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    assert.equal(Object.keys(js).length, 1);
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('repositories retain backing arrays and entities with synchronous return identities', () => {
  for (const [label, create] of factories) {
    const initial = row('initial', { nested: { value: 1 } });
    const records = [initial];
    const options = { records };
    const repo = create(options);
    options.records = [];
    assert.equal(repo.findById('initial'), initial, label);
    const added = row('added');
    assert.equal(repo.save(added), added, label);
    assert.equal(records[1], added, label);
    const replacement = row('initial');
    assert.equal(repo.save(replacement), replacement, label);
    assert.equal(records[0], replacement, label);
    const external = row('external');
    records.push(external);
    assert.equal(repo.findById('external'), external, label);
    assert.equal(repo.delete('initial'), replacement, label);
    assert.equal(repo.findById('missing'), null, label);
    assert.equal(repo.delete('missing'), null, label);
    const bare = { id: 'bare' };
    const legacyRepo = create({ records: [bare] });
    assert.equal(legacyRepo.list()[0], bare, label);
    assert.equal(legacyRepo.save(bare), bare, label);
  }
});

test('list returns shallow independent arrays and never reorders backing storage', () => {
  for (const [label, create] of factories) {
    const records = [row('z', { sortOrder: 2 }), row('a', { sortOrder: 1 })];
    const repo = create({ records });
    const listed = repo.list();
    assert.notEqual(listed, records, label);
    assert.deepEqual(ids(listed), label.startsWith('tag') ? ['a', 'z'] : ['z', 'a'], label);
    assert.deepEqual(ids(records), ['z', 'a'], label);
    for (const record of listed) assert.equal(record, repo.findById(record.id), label);
    listed[0].name = 'edited';
    assert.equal(repo.findById(listed[0].id).name, 'edited', label);
    listed.pop();
    assert.equal(records.length, 2, label);
  }
});

test('live onChange replacement preserves callback receiver and mutated backing array', () => {
  for (const [label, create] of factories) {
    const records = [];
    const calls = [];
    const options = { records };
    const repo = create(options);
    const record = row('saved');
    options.onChange = function (value) {
      assert.equal(this, options, label);
      assert.equal(value, records, label);
      assert.equal(value[0], record, label);
      calls.push('first');
    };
    repo.save(record);
    options.onChange = function (value) {
      assert.equal(this, options, label);
      assert.equal(value, records, label);
      calls.push(value.length);
    };
    assert.equal(repo.save(record), record, label);
    repo.delete('missing');
    assert.deepEqual(calls, ['first', 1], label);
    assert.equal(repo.delete(record.id), record, label);
    assert.deepEqual(calls, ['first', 1, 0], label);
    options.onChange = undefined;
    repo.save(record);
    assert.deepEqual(calls, ['first', 1, 0], label);
  }
});

test('save insert and replacement and delete mutate before throwing hooks without rollback', () => {
  for (const [label, create] of factories) {
    const original = row('existing');
    const records = [original];
    const failure = new Error('persistence failed');
    let expected;
    let calls = 0;
    const options = {
      records,
      onChange(value) {
        assert.equal(this, options, label);
        assert.equal(value, records, label);
        assert.deepEqual(value, expected, label);
        calls += 1;
        throw failure;
      }
    };
    const repo = create(options);
    const added = row('added');
    expected = [original, added];
    assert.throws(
      () => repo.save(added),
      error => error === failure
    );
    assert.equal(records[1], added, label);
    const replacement = row('existing', { name: 'replacement' });
    expected = [replacement, added];
    assert.throws(
      () => repo.save(replacement),
      error => error === failure
    );
    assert.equal(records[0], replacement, label);
    assert.throws(
      () => repo.save(replacement),
      error => error === failure
    );
    expected = [added];
    assert.throws(
      () => repo.delete('existing'),
      error => error === failure
    );
    assert.deepEqual(records, [added], label);
    assert.equal(repo.delete('missing'), null, label);
    assert.equal(calls, 4, label);
  }
});

test('duplicate identifiers find replace and delete only the first occurrence', () => {
  for (const [label, create] of factories) {
    const first = row('duplicate');
    const second = row('duplicate', { name: 'second' });
    const records = [first, second];
    let changes = 0;
    const repo = create({ records, onChange: () => changes++ });
    assert.equal(repo.findById('duplicate'), first, label);
    const replacement = row('duplicate', { name: 'replacement' });
    repo.save(replacement);
    assert.equal(records[0], replacement, label);
    assert.equal(records[1], second, label);
    assert.equal(repo.delete('duplicate'), replacement, label);
    assert.equal(repo.findById('duplicate'), second, label);
    assert.equal(repo.delete('duplicate'), second, label);
    assert.equal(repo.delete('duplicate'), null, label);
    assert.equal(changes, 3, label);
  }
});

test('tag group create retains references and exact ordinary duplicate error without a hook', () => {
  const records = [];
  let changes = 0;
  const repo = createInMemoryTagGroupRepository({ records, onChange: () => changes++ });
  const group = row('group');
  assert.equal(repo.create(group), group);
  assert.equal(records[0], group);
  for (const duplicate of [group, row('group')]) {
    assert.throws(
      () => repo.create(duplicate),
      error => {
        assert.equal(Object.getPrototypeOf(error), Error.prototype);
        assert.equal(error.name, 'Error');
        assert.equal(error.message, 'Tag group id already exists');
        assert.equal(error.code, 'TAG_GROUP_ID_CONFLICT');
        assert.equal('statusCode' in error, false);
        return true;
      }
    );
  }
  assert.equal(changes, 1);
  assert.deepEqual(records, [group]);
});

test('tag group create retains mutation when its live hook throws', () => {
  const records = [];
  const options = { records };
  const repo = createInMemoryTagGroupRepository(options);
  const group = row('group');
  const failure = new Error('create persistence failed');
  options.onChange = function (value) {
    assert.equal(this, options);
    assert.equal(value, records);
    assert.equal(value[0], group);
    throw failure;
  };
  assert.throws(
    () => repo.create(group),
    error => error === failure
  );
  assert.equal(repo.findById('group'), group);
  assert.deepEqual(records, [group]);
});

test('truthy owner and space filters retain strict matching and legacy unscoped rows', () => {
  for (const [label, create] of factories) {
    const key = label === 'space' ? 'userId' : 'spaceId';
    const records = [row('legacy'), row('one', { [key]: 'owner' }), row('two', { [key]: 1 })];
    const repo = create({ records });
    for (const value of [undefined, null, '', false, 0, NaN]) {
      assert.equal(repo.list({ [key]: value }).length, 3, `${label}: ${String(value)}`);
    }
    for (const [value, expected] of [
      ['owner', ['one']],
      [1, ['two']],
      ['1', []],
      [true, []]
    ]) {
      assert.deepEqual(ids(repo.list({ [key]: value })), expected, label);
    }
    const filtered = repo.list({ [key]: 'owner' });
    assert.notEqual(filtered, records, label);
    assert.equal(filtered[0], records[1], label);
    filtered.pop();
    assert.equal(records.length, 3, label);
    assert.equal(repo.findById('legacy'), records[0], label);
  }
});

test('folder includeDeleted accepts only true or the exact string true', () => {
  const records = [
    row('legacy'),
    row('null', { deletedAt: null }),
    row('empty', { deletedAt: '' }),
    row('zero', { deletedAt: 0 }),
    row('false', { deletedAt: false }),
    row('deleted', { deletedAt: 'timestamp' }),
    row('other', { spaceId: 'other', deletedAt: 'timestamp' })
  ];
  const repo = createInMemoryFolderRepository({ records });
  for (const value of [undefined, null, false, 0, 1, 'false', 'TRUE', ' true ', {}, []]) {
    assert.deepEqual(ids(repo.list({ includeDeleted: value })), ['legacy', 'null', 'empty', 'zero', 'false']);
  }
  for (const value of [true, 'true']) {
    assert.deepEqual(repo.list({ includeDeleted: value }), records);
    assert.deepEqual(ids(repo.list({ includeDeleted: value, spaceId: 'other' })), ['other']);
  }
});

const orderingCases = [
  ['missing versus negative', undefined, -1, ['a', 'z']],
  ['NaN versus finite', NaN, 1, ['a', 'z']],
  ['positive infinities', Infinity, Infinity, ['a', 'z']],
  ['negative infinities', -Infinity, -Infinity, ['a', 'z']],
  ['opposite infinities', Infinity, -Infinity, ['z', 'a']],
  ['negative zero tie', -0, 0, ['a', 'z']],
  ['numeric precedence', 2, 1, ['z', 'a']],
  ['null coerces to zero', null, -1, ['z', 'a']],
  ['string coerces numerically', '2', '1', ['z', 'a']],
  ['false coerces to zero', false, -1, ['z', 'a']]
];

test('tag group sorting preserves subtraction coercion and name fallback including legacy missing order', () => {
  for (const [label, left, right, expected] of orderingCases) {
    const records = [row('a', { sortOrder: left }), row('z', { sortOrder: right })];
    assert.deepEqual(ids(createInMemoryTagGroupRepository({ records }).list()), expected, label);
    assert.deepEqual(ids(records), ['a', 'z'], label);
  }
  const records = [row('z'), row('a', { sortOrder: -1 }), row('b')];
  assert.deepEqual(ids(createInMemoryTagGroupRepository({ records }).list()), ['a', 'b', 'z']);
  const ties = [row('first', { name: 'same' }), row('second', { name: 'same' })];
  assert.deepEqual(createInMemoryTagGroupRepository({ records: ties }).list(), ties);
});

test('tag sorting deliberately defaults nullish order to zero unlike tag groups', () => {
  for (const order of [undefined, null]) {
    const records = [row('a', { sortOrder: order }), row('z', { sortOrder: -1 })];
    assert.deepEqual(ids(createInMemoryTagRepository({ records }).list()), ['z', 'a']);
  }
  for (const [label, left, right, expected] of orderingCases.filter(([, left]) => left !== undefined)) {
    const records = [row('a', { sortOrder: left }), row('z', { sortOrder: right })];
    assert.deepEqual(ids(createInMemoryTagRepository({ records }).list()), expected, label);
  }
});

test('sort comparator reads each order once left to right before coercion and lazy name fallback', () => {
  for (const create of [createInMemoryTagGroupRepository, createInMemoryTagRepository]) {
    for (const tie of [true, false]) {
      const calls = [];
      const record = (id, value) => ({
        id,
        get sortOrder() {
          calls.push(`${id}.order`);
          return {
            valueOf() {
              calls.push(`${id}.value`);
              return value;
            }
          };
        },
        get name() {
          calls.push(`${id}.name`);
          return id;
        }
      });
      const records = [record('z', 0), record('a', tie ? 0 : -1)];
      assert.deepEqual(ids(create({ records }).list()), ['a', 'z']);
      assert.deepEqual(calls, ['a.order', 'z.order', 'a.value', 'z.value', ...(tie ? ['a.name', 'z.name'] : [])]);
    }
    const calls = [];
    const records = ['z', 'a'].map(id => ({
      id,
      get sortOrder() {
        calls.push(`${id}.order`);
        return undefined;
      },
      get name() {
        calls.push(`${id}.name`);
        return id;
      }
    }));
    assert.deepEqual(ids(create({ records }).list()), ['a', 'z']);
    assert.deepEqual(calls, ['a.order', 'z.order', 'a.name', 'z.name']);
  }
});

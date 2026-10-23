import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryNoteRepository as create } from '../src/modules/knowledge/infrastructure/note-repository.js';

const ids = records => records.map(record => record.id);
const stamp = '2026-01-01T00:00:00.000Z';
const row = (id, fields = {}) => ({ id, updatedAt: stamp, tagIds: [], ...fields });

test('note repository bridge preserves every export identity', async () => {
  const js = await import('../src/modules/knowledge/infrastructure/note-repository.js');
  const ts = await import('../src/modules/knowledge/infrastructure/note-repository.ts');
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('backing records are captured while hooks stay live and bound to options', () => {
  const records = [];
  const options = { records };
  const repo = create(options);
  const first = row('one');
  assert.equal(repo.save(first), first);
  assert.equal(repo.findById('one'), first);
  assert.equal(repo.findById('missing'), null);
  const listed = repo.list();
  assert.notEqual(listed, records);
  assert.equal(listed[0], first);
  listed.pop();
  assert.equal(records.length, 1);
  options.records = [];
  let calls = 0;
  options.onChange = function (changed) {
    assert.equal(this, options);
    assert.equal(changed, records);
    assert.equal(changed[1].id, 'two');
    calls++;
  };
  repo.save(row('two'));
  assert.equal(calls, 1);
  options.onChange = null;
  repo.save(row('three'));
  assert.equal(calls, 1);
  assert.deepEqual(options.records, []);
  assert.deepEqual(create().list(), []);
  assert.deepEqual(create({ records: null }).list(), []);
});

test('save inserts untouched timestamps but replacement mutates and advances the passed object', () => {
  for (const updatedAt of [undefined, null, 'invalid', stamp]) {
    const note = row('new', { updatedAt });
    const records = [];
    assert.equal(create({ records }).save(note), note);
    assert.equal(records[0], note);
    assert.equal(note.updatedAt, updatedAt);
  }
  for (const next of [stamp, '2025-01-01', '2027-01-01']) {
    const original = row('one');
    const records = [original];
    const note = row('one', { updatedAt: next });
    const expected = new Date(Math.max(Date.parse(next), Date.parse(stamp) + 1)).toISOString();
    assert.equal(create({ records }).save(note), note);
    assert.equal(records[0], note);
    assert.equal(note.updatedAt, expected);
    assert.equal(original.updatedAt, stamp);
  }
  const same = row('same');
  assert.equal(create({ records: [same] }).save(same), same);
  assert.equal(same.updatedAt, '2026-01-01T00:00:00.001Z');
});

test('invalid replacement dates throw before replacement, timestamp mutation or persistence', () => {
  for (const [oldDate, newDate] of [
    [stamp, 'invalid'],
    ['invalid', stamp],
    [undefined, stamp]
  ]) {
    const original = row('one', { updatedAt: oldDate });
    const note = row('one', { updatedAt: newDate });
    const records = [original];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    assert.throws(() => repo.save(note), RangeError);
    assert.equal(records[0], original);
    assert.equal(note.updatedAt, newDate);
    assert.equal(calls, 0);
  }
});

test('throwing hooks leave synchronous save and delete mutations in place', () => {
  const failure = new Error('persistence failed');
  const records = [];
  const repo = create({
    records,
    onChange() {
      throw failure;
    }
  });
  const first = row('one');
  assert.throws(
    () => repo.save(first),
    error => error === failure
  );
  assert.equal(records[0], first);
  const replacement = row('one');
  assert.throws(
    () => repo.save(replacement),
    error => error === failure
  );
  assert.equal(records[0], replacement);
  assert.equal(replacement.updatedAt, '2026-01-01T00:00:00.001Z');
  assert.throws(
    () => repo.delete('one'),
    error => error === failure
  );
  assert.deepEqual(records, []);
  records.push(row('two'));
  assert.throws(
    () => repo.deleteWhere(() => true),
    error => error === failure
  );
  assert.deepEqual(records, []);
});

test('single-ID operations choose the first duplicate and missing delete does not persist', () => {
  const first = row('same');
  const second = row('same');
  const records = [first, second];
  let calls = 0;
  const repo = create({ records, onChange: () => calls++ });
  assert.equal(repo.findById('same'), first);
  assert.equal(repo.delete('missing'), null);
  assert.equal(calls, 0);
  const replacement = row('same');
  repo.save(replacement);
  assert.equal(records[0], replacement);
  assert.equal(records[1], second);
  assert.equal(repo.delete('same'), replacement);
  assert.equal(repo.findById('same'), second);
  assert.equal(calls, 2);
});

test('findByIds uses backing order and shallow copies, cloning only the tag array', () => {
  const nested = {};
  const records = [row('a', { nested, tagIds: ['x'] }), row('b'), row('a', { tagIds: null })];
  const repo = create({ records });
  const found = repo.findByIds(['b', 'a', 'b', 'missing']);
  assert.deepEqual(ids(found), ['a', 'b', 'a']);
  found.forEach((note, index) => assert.notEqual(note, records[index]));
  assert.notEqual(found[0].tagIds, records[0].tagIds);
  assert.equal(found[0].nested, nested);
  found[0].tagIds.push('y');
  assert.deepEqual(records[0].tagIds, ['x']);
  assert.deepEqual(found[2].tagIds, []);
  for (const value of [undefined, null, []]) assert.deepEqual(repo.findByIds(value), []);
});

test('deletion and favorite flags accept only true or string true and test record truthiness', () => {
  const records = [
    row('active'),
    row('favorite', { favorite: 'yes' }),
    row('deleted', { deleted: 'yes' }),
    row('both', { deleted: 1, favorite: 1 })
  ];
  const repo = create({ records });
  for (const flag of [true, 'true', false, 'false', 1, 'TRUE', null, undefined]) {
    const enabled = flag === true || flag === 'true';
    assert.deepEqual(
      new Set(ids(repo.list({ includeDeleted: flag }))),
      new Set(enabled ? ['active', 'favorite', 'deleted', 'both'] : ['active', 'favorite'])
    );
    assert.deepEqual(
      new Set(ids(repo.list({ deletedOnly: flag, includeDeleted: true }))),
      new Set(enabled ? ['deleted', 'both'] : ['active', 'favorite', 'deleted', 'both'])
    );
    assert.deepEqual(
      new Set(ids(repo.list({ favoriteOnly: flag }))),
      new Set(enabled ? ['favorite'] : ['active', 'favorite'])
    );
  }
  assert.deepEqual(ids(repo.list({ deletedOnly: true, includeDeleted: false, favoriteOnly: true })), ['both']);
});

test('space and folder filters combine using strict equality and ignore falsy options', () => {
  const records = [
    row('match', { spaceId: 's', folderId: 'f' }),
    row('other-space', { spaceId: 'x', folderId: 'f' }),
    row('other-folder', { spaceId: 's', folderId: 'x' })
  ];
  const repo = create({ records });
  assert.deepEqual(ids(repo.list({ spaceId: 's', folderId: 'f' })), ['match']);
  for (const field of ['spaceId', 'folderId']) {
    assert.deepEqual(repo.list({ [field]: 1 }), []);
    for (const value of [undefined, null, false, 0, '']) assert.deepEqual(repo.list({ [field]: value }), records);
  }
});

test('tag filtering preserves split-without-trim, empty segments, fallback and match precedence', () => {
  const records = [
    row('a', { tagIds: ['a'] }),
    row('both', { tagIds: ['a', 'b'] }),
    row('space', { tagIds: [' b'] }),
    row('empty', { tagIds: [''] })
  ];
  const repo = create({ records });
  for (const [options, expected] of [
    [{ tagIds: 'a,,b,' }, ['both']],
    [{ tagIds: 'a, b', match: 'any' }, ['a', 'both', 'space']],
    [{ tagIds: [''] }, ['empty']],
    [{ tagIds: ',,', tagId: 'a' }, ['a', 'both']],
    [{ tagIds: [], tagId: 'b' }, ['both']],
    [{ tagIds: ['a', 'b'], tagId: 'missing', tagMatch: 'any' }, ['a', 'both']],
    [{ tagIds: ['a', 'b'], match: '', tagMatch: 'any' }, ['both']],
    [{ tagIds: ['a', 'b'], match: null, tagMatch: 'any' }, ['a', 'both']],
    [{ tagIds: ['a', 'b'], match: 'ANY' }, ['both']],
    [{ tagIds: 42 }, ['a', 'both', 'space', 'empty']]
  ])
    assert.deepEqual(ids(repo.list(options)), expected);
});

test('missing tag arrays remain readable without filters but throw during tag filtering', () => {
  const note = { id: 'missing-tags', updatedAt: stamp };
  const repo = create({ records: [note] });
  assert.deepEqual(repo.list(), [note]);
  assert.equal(repo.list()[0], note);
  for (const options of [{ tagId: 'x' }, { tagIds: ['x'], match: 'any' }, { tagIds: ['x'], match: 'all' }])
    assert.throws(() => repo.list(options), TypeError);
  const [found] = repo.findByIds([note.id]);
  assert.notEqual(found, note);
  assert.deepEqual(found, { ...note, tagIds: [] });
  assert.equal(Object.hasOwn(note, 'tagIds'), false);
});

test('arbitrary property sorting stringifies values and favorites precede either order', () => {
  const records = [
    row('ten', { rank: 10 }),
    row('two', { rank: 2 }),
    row('favorite', { rank: 99, favorite: true }),
    row('missing')
  ];
  const repo = create({ records });
  assert.deepEqual(ids(repo.list({ sortBy: 'rank', order: 'asc' })), ['favorite', 'missing', 'ten', 'two']);
  for (const order of ['desc', 'ASC', '', null])
    assert.deepEqual(ids(repo.list({ sortBy: 'rank', order })), ['favorite', 'two', 'ten', 'missing']);
  assert.deepEqual(ids(records), ['ten', 'two', 'favorite', 'missing']);
  assert.deepEqual(ids(create({ records: [row('a'), row('b'), row('c')] }).list({ sortBy: 'absent' })), [
    'a',
    'b',
    'c'
  ]);
});

test('date sorting preserves native coercion, invalid-date stability and nullish fallback', () => {
  for (const sortBy of ['createdAt', 'updatedAt']) {
    for (const [value, expected] of [
      [1000, ['value', 'reference']],
      [false, ['reference', 'value']],
      [true, ['value', 'reference']],
      [null, ['reference', 'value']],
      [undefined, ['reference', 'value']],
      ['invalid', ['reference', 'value']],
      [{ valueOf: () => 2000 }, ['value', 'reference']]
    ]) {
      const records = [row('reference', { [sortBy]: 0 }), row('value', { [sortBy]: value })];
      assert.deepEqual(ids(create({ records }).list({ sortBy })), expected);
      assert.deepEqual(ids(records), ['reference', 'value']);
    }
  }
  assert.deepEqual(ids(create({ records: [row('a'), row('b'), row('c')] }).list()), ['a', 'b', 'c']);
});

test('date comparator reads both properties before converting left then right and propagates throws', () => {
  const sequence = ['second-get', 'first-get', 'second-convert', 'first-convert'];
  for (const fail of [null, ...sequence]) {
    const calls = [];
    const failure = new Error('date failed');
    const records = ['first', 'second'].map(name => ({
      id: name,
      get updatedAt() {
        calls.push(`${name}-get`);
        if (fail === `${name}-get`) throw failure;
        return {
          valueOf() {
            calls.push(`${name}-convert`);
            if (fail === `${name}-convert`) throw failure;
            return name === 'first' ? 0 : 1;
          }
        };
      }
    }));
    const repo = create({ records });
    if (fail)
      assert.throws(
        () => repo.list(),
        error => error === failure
      );
    else assert.deepEqual(ids(repo.list()), ['second', 'first']);
    assert.deepEqual(calls, fail ? sequence.slice(0, sequence.indexOf(fail) + 1) : sequence);
  }
});

test('pagination preserves Number coercion and truthiness including zero, negatives and NaN', () => {
  const records = ['a', 'b', 'c', 'd'].map(id => row(id));
  const repo = create({ records });
  for (const [options, expected] of [
    [{ limit: 0 }, ['a', 'b', 'c', 'd']],
    [{ limit: '0' }, []],
    [{ limit: -1 }, ['a', 'b', 'c']],
    [{ limit: 'invalid' }, []],
    [{ limit: NaN }, ['a', 'b', 'c', 'd']],
    [{ offset: -1 }, ['a', 'b', 'c', 'd']],
    [{ offset: '0' }, ['a', 'b', 'c', 'd']],
    [{ offset: '2' }, ['c', 'd']],
    [{ offset: 'invalid' }, ['a', 'b', 'c', 'd']],
    [{ offset: NaN, limit: 2 }, ['a', 'b']],
    [{ offset: 'invalid', limit: 2 }, []],
    [{ offset: -2, limit: 1 }, ['c']],
    [{ offset: true, limit: true }, ['b']],
    [{ offset: 1.9, limit: 1.2 }, ['b', 'c']]
  ])
    assert.deepEqual(ids(repo.list(options)), expected);
});

test('deleteWhere visits in reverse, returns original order and persists only changes', () => {
  const records = ['a', 'b', 'c', 'd'].map(id => row(id));
  const original = [...records];
  let calls = 0;
  const repo = create({
    records,
    onChange: changed => {
      assert.equal(changed, records);
      calls++;
    }
  });
  const visited = [];
  const deleted = repo.deleteWhere(note => {
    visited.push(note);
    return ['a', 'c'].includes(note.id);
  });
  assert.deepEqual(visited, [...original].reverse());
  assert.deepEqual(deleted, [original[0], original[2]]);
  assert.equal(deleted[0], original[0]);
  assert.equal(deleted[1], original[2]);
  assert.deepEqual(records, [original[1], original[3]]);
  assert.equal(calls, 1);
  assert.deepEqual(
    repo.deleteWhere(() => false),
    []
  );
  assert.equal(calls, 1);
});

test('deleteWhere predicate errors preserve earlier reverse-order removals without persistence', () => {
  const records = ['a', 'b', 'c'].map(id => row(id));
  const failure = new Error('predicate failed');
  let calls = 0;
  const visited = [];
  const repo = create({ records, onChange: () => calls++ });
  assert.throws(
    () =>
      repo.deleteWhere(note => {
        visited.push(note.id);
        if (note.id === 'b') throw failure;
        return true;
      }),
    error => error === failure
  );
  assert.deepEqual(visited, ['c', 'b']);
  assert.deepEqual(ids(records), ['a', 'b']);
  assert.equal(calls, 0);
});

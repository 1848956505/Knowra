import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryKnowledgeItemRepository as items } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.js';
import { createInMemoryKnowledgeEvidenceRepository as evidence } from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.js';

const ids = records => records.map(record => record.id);
const conflict = code => error => error.code === code && error.statusCode === 409;

test('knowledge repository bridges preserve all export identities', async () => {
  for (const name of ['knowledge-item-repository', 'knowledge-evidence-repository']) {
    const js = await import(`../src/modules/knowledge/infrastructure/${name}.js`);
    const ts = await import(`../src/modules/knowledge/infrastructure/${name}.ts`);
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('both repositories preserve backing and record identity, shallow lists and live bound hooks', () => {
  for (const create of [items, evidence]) {
    const records = [];
    const options = { records };
    const repo = create(options);
    const first = { id: 'one' };
    assert.equal(repo.create(first), first);
    assert.equal(repo.findById('one'), first);
    assert.equal(repo.findById('absent'), null);
    const list = repo.list();
    assert.notEqual(list, records);
    assert.equal(list[0], first);
    list.pop();
    assert.equal(records.length, 1);
    options.records = [];
    let calls = 0;
    options.onChange = function (changed) {
      assert.equal(this, options);
      assert.equal(changed, records);
      calls += 1;
    };
    const replacement = { id: 'one', nested: {} };
    assert.equal(repo.save(replacement), replacement);
    assert.equal(records[0], replacement);
    assert.equal(repo.save(replacement), replacement);
    const second = { id: 'two' };
    assert.equal(repo.save(second), second);
    assert.deepEqual(records, [replacement, second]);
    assert.equal(calls, 3, 'same-object saves still persist');
    options.onChange = null;
    repo.save(second);
    assert.equal(calls, 3);
    assert.deepEqual(options.records, []);
    assert.deepEqual(create().list(), []);
  }
});

test('duplicate IDs reject synchronously without mutations or hooks', () => {
  for (const [create, code] of [
    [items, 'KNOWLEDGE_ITEM_ID_CONFLICT'],
    [evidence, 'KNOWLEDGE_EVIDENCE_ID_CONFLICT']
  ]) {
    const original = { id: 'one' };
    const records = [original];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    assert.throws(() => repo.create({ id: 'one' }), conflict(code));
    assert.deepEqual(records, [original]);
    assert.equal(records[0], original);
    assert.equal(calls, 0);
  }
});

test('throwing persistence callbacks retain create, save, delete and status mutations', () => {
  const failure = new Error('persistence failed');
  for (const create of [items, evidence]) {
    const records = [];
    const repo = create({
      records,
      onChange() {
        throw failure;
      }
    });
    const original = { id: 'one', knowledgeItemId: 'item', noteId: 'note', status: 'valid' };
    assert.throws(
      () => repo.create(original),
      error => error === failure
    );
    assert.equal(records[0], original);
    const replacement = { ...original, title: 'replacement' };
    assert.throws(
      () => repo.save(replacement),
      error => error === failure
    );
    assert.equal(records[0], replacement);
    if (create === evidence) {
      assert.throws(
        () => repo.markByNoteId('note', 'invalid'),
        error => error === failure
      );
      assert.equal(replacement.status, 'invalid');
      assert.equal(typeof replacement.updatedAt, 'string');
      assert.throws(
        () => repo.deleteByKnowledgeItemId('item'),
        error => error === failure
      );
    } else
      assert.throws(
        () => repo.delete('one'),
        error => error === failure
      );
    assert.deepEqual(records, []);
  }
});

test('item optimistic saves preserve exact, missing-record and falsy expectedUpdatedAt behavior', () => {
  for (const expectedUpdatedAt of ['stamp', 'other', 1, null, undefined, '', false, 0]) {
    for (const exists of [true, false]) {
      const original = { id: 'one', updatedAt: 'stamp' };
      const records = exists ? [original] : [];
      let calls = 0;
      const repo = items({ records, onChange: () => calls++ });
      const next = { id: 'one', updatedAt: 'new' };
      if (expectedUpdatedAt && (!exists || expectedUpdatedAt !== 'stamp')) {
        assert.throws(() => repo.save(next, { expectedUpdatedAt }), conflict('KNOWLEDGE_ITEM_UPDATE_CONFLICT'));
        assert.deepEqual(records, exists ? [original] : []);
        assert.equal(calls, 0);
      } else {
        assert.equal(repo.save(next, { expectedUpdatedAt }), next);
        assert.equal(records[0], next);
        assert.equal(calls, 1);
      }
    }
  }
  const records = [{ id: 'one', updatedAt: 1 }];
  assert.throws(
    () => items({ records }).save({ id: 'one' }, { expectedUpdatedAt: '1' }),
    conflict('KNOWLEDGE_ITEM_UPDATE_CONFLICT')
  );
});

test('item search converts query and missing fields and trims only the query', () => {
  const records = [
    { id: 'title', title: 'MiXeD', canonicalStatement: 'statement', userExplanation: 'explanation' },
    { id: 'empty' },
    { id: 'null', title: null, canonicalStatement: 42, userExplanation: false }
  ];
  const repo = items({ records });
  for (const [query, expected] of [
    [' MIXED ', ['title']],
    ['STATEMENT', ['title']],
    ['explanation', ['title']],
    [null, ['null']],
    [42, ['null']],
    [false, ['null']],
    ['undefined', ['empty']],
    ['', ['title', 'empty', 'null']],
    [undefined, ['title', 'empty', 'null']],
    [{ toString: () => 'mixed' }, ['title']]
  ])
    assert.deepEqual(ids(repo.list({ query })), expected);
});

test('item archive and deletion flags accept only boolean true or string true', () => {
  const records = [
    { id: 'active', reviewStatus: 'draft' },
    { id: 'archive', reviewStatus: 'archived' },
    { id: 'deleted', reviewStatus: 'draft', deletedAt: 'date' },
    { id: 'both', reviewStatus: 'archived', deletedAt: true },
    { id: 'zero', deletedAt: 0 },
    { id: 'empty', deletedAt: '' },
    { id: 'null', deletedAt: null }
  ];
  const repo = items({ records });
  for (const flag of [true, 'true', false, 'false', 1, 'TRUE', null, undefined]) {
    const enabled = flag === true || flag === 'true';
    assert.deepEqual(
      ids(repo.list({ includeArchived: flag })),
      enabled ? ['active', 'archive', 'zero', 'empty', 'null'] : ['active', 'zero', 'empty', 'null']
    );
    assert.deepEqual(
      ids(repo.list({ includeDeleted: flag })),
      enabled ? ['active', 'deleted', 'zero', 'empty', 'null'] : ['active', 'zero', 'empty', 'null']
    );
  }
  assert.deepEqual(ids(repo.list({ reviewStatus: 'archived' })), ['archive']);
  assert.deepEqual(ids(repo.list({ reviewStatus: 'archived', includeDeleted: true })), ['archive', 'both']);
  assert.deepEqual(ids(repo.list({ reviewStatus: 'missing', includeArchived: true })), []);
});

test('item dates preserve native conversion, invalid-date stability and backing order', () => {
  for (const [value, expected] of [
    ['2026-01-01', ['value', 'reference']],
    [1000, ['value', 'reference']],
    [null, ['reference', 'value']],
    [undefined, ['reference', 'value']],
    ['invalid', ['reference', 'value']],
    [false, ['reference', 'value']],
    [true, ['value', 'reference']],
    [{ valueOf: () => 2000 }, ['value', 'reference']],
    [{ toString: () => '2026-01-01' }, ['value', 'reference']]
  ]) {
    const records = [
      { id: 'reference', updatedAt: 0 },
      { id: 'value', updatedAt: value }
    ];
    assert.deepEqual(ids(items({ records }).list()), expected);
    assert.deepEqual(ids(records), ['reference', 'value']);
  }
  const records = [
    { id: 'a', updatedAt: 1 },
    { id: 'b', updatedAt: 1 },
    { id: 'c', updatedAt: 1 }
  ];
  assert.deepEqual(ids(items({ records }).list()), ['a', 'b', 'c']);
});

test('item sorting reads right then left dates and stops at first throwing conversion', () => {
  for (const fail of [null, 'first-get', 'first-convert', 'second-get', 'second-convert']) {
    const calls = [];
    const failure = new Error('date failure');
    const row = name => ({
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
    });
    const records = [row('first'), row('second')];
    const repo = items({ records });
    if (fail)
      assert.throws(
        () => repo.list(),
        error => error === failure
      );
    else assert.deepEqual(ids(repo.list()), ['second', 'first']);
    const sequence = ['first-get', 'first-convert', 'second-get', 'second-convert'];
    assert.deepEqual(calls, fail ? sequence.slice(0, sequence.indexOf(fail) + 1) : sequence);
    assert.deepEqual(ids(records), ['first', 'second']);
  }
});

test('item deletion returns original objects and missing deletion does not persist', () => {
  const first = { id: 'same' };
  const second = { id: 'same' };
  const records = [first, second];
  let calls = 0;
  const repo = items({ records, onChange: () => calls++ });
  assert.equal(repo.delete('missing'), null);
  assert.equal(calls, 0);
  assert.equal(repo.delete('same'), first);
  assert.equal(records[0], second);
  assert.equal(calls, 1);
});

test('evidence list combines all four strict filters while ignoring falsy filters', () => {
  const fields = ['knowledgeItemId', 'noteId', 'noteVersionId', 'annotationId'];
  const match = { id: 'match', ...Object.fromEntries(fields.map(field => [field, 'match'])) };
  const records = [match, ...fields.map(field => ({ ...match, id: field, [field]: 'other' }))];
  const repo = evidence({ records });
  assert.deepEqual(repo.list(Object.fromEntries(fields.map(field => [field, 'match']))), [match]);
  for (const field of fields) {
    assert.deepEqual(ids(repo.list({ [field]: 'other' })), [field]);
    assert.deepEqual(repo.list({ [field]: 1 }), []);
    for (const value of ['', null, undefined, false, 0]) assert.deepEqual(repo.list({ [field]: value }), records);
  }
});

const markMethods = [
  ['markByNoteId', 'noteId', 'match'],
  ['markByAnnotationId', 'annotationId', 'match'],
  ['markByNoteVersionId', 'noteVersionId', 'match'],
  ['markByNoteVersionIds', 'noteVersionId', ['match']]
];

test('all evidence mark methods preserve status transitions, no-ops and applicability', () => {
  const statuses = ['valid', 'stale', 'invalid', 'insufficient'];
  for (const [method, field, key] of markMethods) {
    for (const status of statuses) {
      const records = statuses.map(before => ({
        id: before,
        [field]: 'match',
        status: before,
        updatedAt: 'old',
        applicabilityStatus: 'active'
      }));
      records.push({ id: 'unmatched', [field]: 'elsewhere', status: 'valid', updatedAt: 'old' });
      const expected = records.filter(
        record =>
          record[field] === 'match' && record.status !== status && !(status === 'stale' && record.status === 'invalid')
      );
      let calls = 0;
      const repo = evidence({
        records,
        onChange: changed => {
          assert.equal(changed, records);
          calls++;
        }
      });
      const changed = repo[method](key, status);
      assert.deepEqual(changed, expected);
      changed.forEach((record, index) => {
        assert.equal(record, expected[index]);
        assert.equal(record.status, status);
        assert.notEqual(record.updatedAt, 'old');
        assert.equal(record.applicabilityStatus, 'active');
      });
      for (const record of records.filter(record => !changed.includes(record))) assert.equal(record.updatedAt, 'old');
      assert.equal(calls, 1);
      assert.deepEqual(repo[method](key, status), []);
      assert.equal(calls, 1);
    }
  }
});

test('evidence bulk marking preserves backing order, source filters, one persist and per-record clocks', () => {
  for (const sourceType of [undefined, null, '', 'noteVersion', 'annotation', 'missing']) {
    const records = ['a', 'b', 'c'].map((id, index) => ({
      id,
      noteVersionId: id,
      sourceType: index === 1 ? 'annotation' : 'noteVersion',
      status: 'valid'
    }));
    let calls = 0;
    const repo = evidence({ records, onChange: () => calls++ });
    assert.deepEqual(repo.markByNoteVersionIds([], 'invalid', sourceType), []);
    assert.equal(calls, 0);
    const changed = repo.markByNoteVersionIds(['c', 'b', 'a', 'c'], 'invalid', sourceType);
    assert.deepEqual(
      ids(changed),
      !sourceType
        ? ['a', 'b', 'c']
        : sourceType === 'noteVersion'
          ? ['a', 'c']
          : sourceType === 'annotation'
            ? ['b']
            : []
    );
    assert.equal(calls, changed.length ? 1 : 0);
    assert.deepEqual(ids(records), ['a', 'b', 'c']);
    const single = evidence({
      records: [{ id: 'one', noteVersionId: 'one', sourceType: 'noteVersion', status: 'valid' }]
    });
    assert.equal(
      single.markByNoteVersionId('one', 'invalid', sourceType).length,
      !sourceType || sourceType === 'noteVersion' ? 1 : 0
    );
  }
  const OriginalDate = globalThis.Date;
  let ticks = 0;
  const records = [
    { id: 'skip', noteId: 'note', status: 'stale' },
    { id: 'a', noteId: 'note', status: 'valid' },
    { id: 'b', noteId: 'note', status: 'valid' }
  ];
  try {
    globalThis.Date = class extends OriginalDate {
      constructor() {
        super(++ticks * 1000);
      }
    };
    evidence({ records }).markByNoteId('note', 'stale');
  } finally {
    globalThis.Date = OriginalDate;
  }
  assert.equal(ticks, 2);
  assert.equal(records[0].updatedAt, undefined);
  assert.equal(records[1].updatedAt, '1970-01-01T00:00:01.000Z');
  assert.equal(records[2].updatedAt, '1970-01-01T00:00:02.000Z');
});

test('evidence batch deletion preserves removed and remaining order and persists once', () => {
  const records = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, knowledgeItemId: index % 2 ? 'other' : 'match' }));
  const originals = [...records];
  let calls = 0;
  const repo = evidence({
    records,
    onChange: changed => {
      assert.equal(changed, records);
      calls++;
    }
  });
  const deleted = repo.deleteByKnowledgeItemId('match');
  assert.deepEqual(deleted, [originals[0], originals[2]]);
  assert.equal(deleted[0], originals[0]);
  assert.equal(deleted[1], originals[2]);
  assert.deepEqual(records, [originals[1], originals[3]]);
  assert.equal(calls, 1);
  assert.deepEqual(repo.deleteByKnowledgeItemId('match'), []);
  assert.equal(calls, 1);
});

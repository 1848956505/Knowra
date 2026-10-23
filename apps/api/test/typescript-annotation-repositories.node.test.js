import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const baseline = process.env.KNOWRA_ANNOTATION_REPOSITORIES_BASELINE === '1';
const commit = '09b0b405ff27ac397bff9b9ea6c54fc874d0fce0';
const root = new URL('../src/modules/knowledge/infrastructure/', import.meta.url);
async function load(name) {
  if (!baseline) return import(new URL(`${name}.js`, root));
  const source = stripTypeScriptTypes(
    execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/infrastructure/${name}.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    })
  );
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { createInMemoryContentAnnotationRepository: content } = await load('content-annotation-repository');
const {
  createInMemoryAnnotationExclusionRepository: exclusion,
  createInMemoryAnnotationRevisionRepository: revision,
  createInMemoryAnalysisScopeRepository: scope
} = await load('annotation-support-repositories');
const support = [exclusion, revision, scope];
const all = [content, ...support];
const row = (id, extra = {}) => ({ id, ...extra });
const ids = records => records.map(item => item.id);
const errorIs = expected => error => error === expected;
function replace(object, key, value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
  }
}

test('annotation repository JS bridges retain exact TS export identities', { skip: baseline }, async () => {
  for (const name of ['content-annotation-repository', 'annotation-support-repositories']) {
    const js = await import(new URL(`${name}.js`, root));
    const ts = await import(new URL(`${name}.ts`, root));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('factories retain nullish records defaults, synchronous contracts and native malformed errors', () => {
  for (const create of all) {
    for (const records of [undefined, null]) {
      const repo = create({ records });
      assert.deepEqual(repo.list(), []);
      assert.equal(repo.findById('absent'), null);
      const value = row('a');
      assert.equal(repo.save(value), value);
      assert.equal(repo.save(value).then, undefined);
    }
    assert.throws(() => create(null), TypeError);
    assert.throws(() => create({ records: false }).list(), TypeError);
    assert.throws(() => create().list(null), TypeError);
  }
});

test('content normalization makes fresh shallow copies without changing stored records', () => {
  const nested = {};
  const symbol = Symbol('extra');
  const original = Object.assign(Object.create({ inherited: true }), row('a', { nested, [symbol]: nested }));
  Object.defineProperty(original, 'hidden', { value: true });
  const records = [original];
  const repo = content({ records });
  const first = repo.findById('a');
  assert.notEqual(first, original);
  assert.notEqual(first, repo.findById('a'));
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  assert.equal(first.nested, nested);
  assert.equal(first[symbol], nested);
  assert.equal('hidden' in first, false);
  assert.equal('inherited' in first, false);
  assert.deepEqual(
    [first.schemaVersion, first.scopeType, first.revision, first.lifecycleStatus, first.anchorStatus],
    [1, 'selection', 1, 'active', 'resolved']
  );
  assert.deepEqual(Object.keys(original), ['id', 'nested']);
  first.revision = 99;
  assert.equal(original.revision, undefined);
  assert.notEqual(repo.list()[0], first);
});

test('content normalization keeps every non-nullish value and derives legacy statuses independently', () => {
  for (const value of [0, false, '', NaN]) {
    const item = row('a', {
      schemaVersion: value,
      scopeType: value,
      revision: value,
      lifecycleStatus: value,
      anchorStatus: value
    });
    const normalized = content({ records: [item] }).findById('a');
    for (const key of ['schemaVersion', 'scopeType', 'revision', 'lifecycleStatus', 'anchorStatus'])
      assert.equal(normalized[key], value);
  }
  for (const value of [null, undefined]) {
    for (const status of ['active', 'archived', 'stale', 'unknown', null]) {
      const item = row('a', {
        schemaVersion: value,
        scopeType: value,
        revision: value,
        lifecycleStatus: value,
        anchorStatus: value,
        status
      });
      const normalized = content({ records: [item] }).findById('a');
      assert.equal(normalized.lifecycleStatus, status === 'archived' ? 'archived' : 'active');
      assert.equal(normalized.anchorStatus, status === 'stale' ? 'needsReview' : 'resolved');
      assert.equal(normalized.status, status);
    }
  }
});

test('content normalization spreads first then rereads getters in original field order', () => {
  const events = [];
  const counts = {};
  const original = { id: 'a' };
  for (const key of ['schemaVersion', 'scopeType', 'revision', 'lifecycleStatus', 'anchorStatus', 'status']) {
    Object.defineProperty(original, key, {
      enumerable: true,
      get() {
        events.push(key);
        counts[key] = (counts[key] ?? 0) + 1;
        if (key === 'status') return counts[key] === 2 ? 'archived' : 'stale';
        return counts[key] === 1 ? 'spread' : null;
      }
    });
  }
  const normalized = content({ records: [original] }).findById('a');
  assert.deepEqual(events, [
    'schemaVersion',
    'scopeType',
    'revision',
    'lifecycleStatus',
    'anchorStatus',
    'status',
    'schemaVersion',
    'scopeType',
    'revision',
    'lifecycleStatus',
    'status',
    'anchorStatus',
    'status'
  ]);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.status, 'stale');
  assert.equal(normalized.lifecycleStatus, 'archived');
  assert.equal(normalized.anchorStatus, 'needsReview');
});

test('content find selectors use strict identity and normalize only the first matching row', () => {
  const token = {};
  const first = row(token, { noteId: token, idempotencyKey: token, status: 'archived' });
  const failure = {};
  const second = {
    id: token,
    noteId: token,
    idempotencyKey: token,
    get schemaVersion() {
      throw failure;
    }
  };
  const repo = content({ records: [first, second] });
  assert.equal(repo.findById(token).id, token);
  assert.equal(repo.findById({}), null);
  assert.equal(repo.findByIdempotencyKey(token, token).lifecycleStatus, 'archived');
  assert.equal(repo.findByIdempotencyKey({}, token), null);
  assert.equal(repo.findByIdempotencyKey(token, {}), null);
  assert.equal(content({ records: [row(NaN)] }).findById(NaN), null);
});

test('content captures its array but reads live callbacks with the options receiver', () => {
  const records = [];
  const events = [];
  let callbacks = 0;
  const options = {
    get records() {
      events.push('records');
      return records;
    },
    get onChange() {
      events.push('onChange');
      const number = ++callbacks;
      return function (value) {
        events.push([number, this, value, value.length]);
      };
    }
  };
  const repo = content(options);
  assert.deepEqual(events, ['records']);
  repo.save(row('a'));
  repo.save(row('a'));
  assert.equal(callbacks, 2);
  assert.deepEqual(
    events.filter(Array.isArray).map(call => call[0]),
    [1, 2]
  );
  for (const [, receiver, value] of events.filter(Array.isArray)) {
    assert.equal(receiver, options);
    assert.equal(value, records);
  }
  Object.defineProperty(options, 'records', { value: [] });
  Object.defineProperty(options, 'onChange', { value: null });
  repo.save(row('b'));
  assert.deepEqual(ids(records), ['a', 'b']);
  assert.deepEqual(options.records, []);
});

test('content save replaces only the first matching id and preserves repeated incoming id reads', () => {
  const events = [];
  const records = [row('a'), row('b'), row('b')];
  const incoming = {
    get id() {
      events.push('incoming');
      return events.length === 1 ? 'miss' : 'b';
    }
  };
  const last = records[2];
  const repo = content({ records });
  assert.equal(repo.save(incoming), incoming);
  assert.equal(records[1], incoming);
  assert.equal(records[2], last);
  assert.equal(events.length, 2);
  const empty = content();
  assert.equal(empty.save(null), null);
  assert.throws(() => empty.save(row('x')), TypeError);
});

test('content callback errors happen after writes and retain the thrown value', () => {
  const failure = {};
  const records = [];
  const options = {
    records,
    onChange() {
      throw failure;
    }
  };
  const repo = content(options);
  const first = row('a', { noteId: 'n' });
  assert.throws(() => repo.save(first), errorIs(failure));
  assert.equal(records[0], first);
  const next = row('a', { noteId: 'n' });
  assert.throws(() => repo.save(next), errorIs(failure));
  assert.equal(records[0], next);
  assert.throws(() => repo.deleteByNoteIds(['n']), errorIs(failure));
  assert.deepEqual(records, []);
  options.onChange = 1;
  assert.throws(() => repo.save(first), TypeError);
  assert.equal(records[0], first);
});

test('content list filters are truthy, strict, normalized and preserve insertion order', () => {
  const token = {};
  const records = [
    row('a', { noteId: token, spaceId: token, kind: token, scopeType: token, anchorStatus: token }),
    row('b', { status: 'stale' }),
    row('c', { status: 'archived' }),
    row('d', { lifecycleStatus: '' }),
    row('e', { status: 'unknown' })
  ];
  const repo = content({ records });
  assert.deepEqual(ids(repo.list()), ['a', 'b', 'e']);
  assert.deepEqual(ids(repo.list({ includeDeleted: 'false' })), ['a', 'b', 'c', 'd', 'e']);
  for (const key of ['noteId', 'spaceId', 'kind', 'scopeType', 'anchorStatus']) {
    assert.deepEqual(ids(repo.list({ [key]: token })), ['a']);
    assert.deepEqual(repo.list({ [key]: {} }), []);
    for (const value of ['', 0, false, null, NaN]) assert.equal(repo.list({ [key]: value }).length, 3);
  }
  assert.deepEqual(ids(records), ['a', 'b', 'c', 'd', 'e']);
});

test('content list and duplicate normalize all rows before filtering or finding', () => {
  const failure = {};
  const records = [
    row('a', { noteId: 'n', kind: 'highlight' }),
    {
      id: 'other',
      noteId: 'other',
      get revision() {
        throw failure;
      }
    }
  ];
  const repo = content({ records });
  assert.throws(() => repo.list({ noteId: 'n' }), errorIs(failure));
  assert.throws(() => repo.findDuplicate({ noteId: 'n', kind: 'highlight' }), errorIs(failure));
  assert.equal(repo.findById('a').id, 'a');
  assert.throws(() => content({ records: [null] }).list(), TypeError);
  assert.throws(() => content({ records: [null] }).findDuplicate({}), TypeError);
});

test('content duplicate fingerprint mode requires scope and ignores quote positions', () => {
  const fingerprint = {};
  const records = [
    row('archived', {
      noteId: 'n',
      kind: 'k',
      status: 'archived',
      scopeType: 'selection',
      anchorFingerprint: fingerprint
    }),
    row('wrong-scope', { noteId: 'n', kind: 'k', scopeType: 'note', anchorFingerprint: fingerprint }),
    row('match', {
      noteId: 'n',
      kind: 'k',
      anchorFingerprint: fingerprint,
      quoteText: 'old',
      fromPosition: 1,
      toPosition: 2
    })
  ];
  const repo = content({ records });
  const found = repo.findDuplicate({
    noteId: 'n',
    kind: 'k',
    scopeType: 'selection',
    anchorFingerprint: fingerprint,
    quoteText: 'different',
    fromPosition: 99,
    toPosition: 100
  });
  assert.equal(found.id, 'match');
  assert.notEqual(found, records[2]);
  assert.equal(repo.findDuplicate({ noteId: 'n', kind: 'k', anchorFingerprint: fingerprint }), null);
  assert.equal(repo.findDuplicate({ noteId: 'n', kind: 'k', scopeType: 'selection', anchorFingerprint: {} }), null);
});

test('content duplicate falsey fingerprint mode ignores scope and compares exact quote positions', () => {
  const quote = {};
  const item = row('a', {
    noteId: 'n',
    kind: 'k',
    scopeType: 'note',
    quoteText: quote,
    fromPosition: 0,
    toPosition: 2,
    status: 'stale'
  });
  const repo = content({ records: [item] });
  for (const fingerprint of [undefined, null, '', 0, false, NaN]) {
    assert.equal(
      repo.findDuplicate({
        noteId: 'n',
        kind: 'k',
        scopeType: 'selection',
        anchorFingerprint: fingerprint,
        quoteText: quote,
        fromPosition: 0,
        toPosition: 2
      }).id,
      'a'
    );
  }
  assert.equal(
    repo.findDuplicate({ noteId: 'n', kind: 'k', quoteText: quote, fromPosition: '0', toPosition: 2 }),
    null
  );
  assert.equal(repo.findDuplicate({ noteId: 'n', kind: 'k', quoteText: {}, fromPosition: 0, toPosition: 2 }), null);
  assert.throws(() => repo.findDuplicate(), TypeError);
  assert.throws(() => repo.findDuplicate(null), TypeError);
});

test('content stale marking uses raw active status and skips exact numeric v3 or current hashes', () => {
  const records = [
    row('legacy', { noteId: 'n', status: 'active' }),
    row('missing-status', { noteId: 'n' }),
    row('v3', { noteId: 'n', status: 'active', schemaVersion: 3 }),
    row('string-v3', { noteId: 'n', status: 'active', schemaVersion: '3' }),
    row('current', { noteId: 'n', status: 'active', noteContentHash: 'hash' }),
    row('explicit-active', { noteId: 'n', lifecycleStatus: 'active', status: 'archived' }),
    row('empty-lifecycle', { noteId: 'n', lifecycleStatus: '', status: 'active' }),
    row('other', { noteId: 'other', status: 'active' })
  ];
  let calls = 0;
  const repo = content({ records, onChange: () => calls++ });
  const changed = repo.markStaleByNoteId('n', 'hash');
  assert.deepEqual(ids(changed), ['legacy', 'string-v3', 'explicit-active']);
  assert.equal(changed[0], records[0]);
  for (const item of changed) {
    assert.equal(item.anchorStatus, 'needsReview');
    assert.equal(item.anchorReason, 'contentChanged');
    assert.equal(item.status, 'stale');
    assert.equal(item.revision, 2);
    assert.match(item.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.deepEqual(ids(repo.markStaleByNoteId('n', 'hash')), ['explicit-active']);
  assert.equal(records[5].revision, 3);
  assert.equal(calls, 2);
  assert.deepEqual(repo.markStaleByNoteId('none', 'hash'), []);
  assert.equal(calls, 2);
});

test('content stale marking retains short-circuit getter order before v3 skipping', () => {
  const events = [];
  const item = {};
  for (const [key, value] of [
    ['noteId', 'n'],
    ['lifecycleStatus', null],
    ['status', 'active'],
    ['noteContentHash', 'old'],
    ['schemaVersion', 3]
  ]) {
    Object.defineProperty(item, key, {
      get() {
        events.push(key);
        return value;
      }
    });
  }
  const repo = content({ records: [item] });
  assert.deepEqual(repo.markStaleByNoteId('n', 'new'), []);
  assert.deepEqual(events, ['noteId', 'lifecycleStatus', 'status', 'noteContentHash', 'schemaVersion']);
  events.length = 0;
  repo.markStaleByNoteId('other', 'new');
  assert.deepEqual(events, ['noteId']);
  events.length = 0;
  repo.markStaleByNoteId('n', 'old');
  assert.deepEqual(events, ['noteId', 'lifecycleStatus', 'status', 'noteContentHash']);
});

test('content revision conversion retains Number semantics including BigInt and non-finite values', () => {
  for (const [value, expected] of [
    [undefined, 2],
    [null, 2],
    ['4', 5],
    [false, 1],
    ['', 1],
    [2n, 3],
    [NaN, NaN],
    ['bad', NaN],
    [Infinity, Infinity]
  ]) {
    const item = row('a', { noteId: 'n', status: 'active', revision: value });
    content({ records: [item] }).markStaleByNoteId('n', 'new');
    assert.equal(item.revision, expected);
  }
  const events = [];
  const value = {
    [Symbol.toPrimitive](hint) {
      events.push(hint);
      return 8n;
    }
  };
  const item = row('a', { noteId: 'n', status: 'active', revision: value });
  content({ records: [item] }).markStaleByNoteId('n', 'new');
  assert.equal(item.revision, 9);
  assert.deepEqual(events, ['number']);
});

test('content failed revision conversion preserves earlier writes and leaves revision and date untouched', () => {
  const failure = {};
  for (const value of [
    Symbol('revision'),
    {
      valueOf() {
        throw failure;
      }
    }
  ]) {
    const item = row('a', { noteId: 'n', status: 'active', revision: value, updatedAt: 'old' });
    let calls = 0;
    const repo = content({ records: [item], onChange: () => calls++ });
    assert.throws(() => repo.markStaleByNoteId('n', 'new'), typeof value === 'symbol' ? TypeError : errorIs(failure));
    assert.equal(item.anchorStatus, 'needsReview');
    assert.equal(item.anchorReason, 'contentChanged');
    assert.equal(item.status, 'stale');
    assert.equal(item.revision, value);
    assert.equal(item.updatedAt, 'old');
    assert.equal(calls, 0);
  }
});

test('content stale marking preserves setter failure order without rollback or persistence', () => {
  const failure = {};
  const item = row('a', { noteId: 'n', status: 'active', revision: 3, updatedAt: 'old' });
  Object.defineProperty(item, 'anchorReason', {
    set() {
      throw failure;
    }
  });
  let calls = 0;
  const repo = content({ records: [item], onChange: () => calls++ });
  assert.throws(() => repo.markStaleByNoteId('n', 'new'), errorIs(failure));
  assert.equal(item.anchorStatus, 'needsReview');
  assert.equal(item.status, 'active');
  assert.equal(item.revision, 3);
  assert.equal(item.updatedAt, 'old');
  assert.equal(calls, 0);
});

test('content later Date failure leaves prior and current partial mutations without callback', () => {
  const records = ['a', 'b'].map(id => row(id, { noteId: 'n', status: 'active', revision: 1, updatedAt: 'old' }));
  const failure = {};
  let calls = 0;
  let dates = 0;
  const NativeDate = Date;
  const repo = content({ records, onChange: () => calls++ });
  replace(
    globalThis,
    'Date',
    class extends NativeDate {
      toISOString() {
        if (++dates === 2) throw failure;
        return 'first-time';
      }
    },
    () => assert.throws(() => repo.markStaleByNoteId('n', 'new'), errorIs(failure))
  );
  assert.deepEqual(
    records.map(item => item.status),
    ['stale', 'stale']
  );
  assert.deepEqual(
    records.map(item => item.revision),
    [2, 2]
  );
  assert.deepEqual(
    records.map(item => item.updatedAt),
    ['first-time', 'old']
  );
  assert.equal(calls, 0);
});

test('content stale callback sees completed original records and failures do not revert them', () => {
  const records = [row('a', { noteId: 'n', status: 'active' })];
  const failure = {};
  const options = { records };
  const repo = content(options);
  options.onChange = function (received) {
    assert.equal(this, options);
    assert.equal(received, records);
    assert.equal(received[0].revision, 2);
    assert.equal(received[0].status, 'stale');
    throw failure;
  };
  assert.throws(() => repo.markStaleByNoteId('n', 'new'), errorIs(failure));
  assert.equal(records[0].revision, 2);
  assert.equal(records[0].status, 'stale');
});

test('content deletion scans backwards but returns original order with one callback', () => {
  const events = [];
  const records = ['a', 'keep', 'b', 'c'].map(id => {
    const item = row(id);
    Object.defineProperty(item, 'noteId', {
      get() {
        events.push(id);
        return id === 'keep' ? 'other' : 'n';
      }
    });
    return item;
  });
  const originals = [...records];
  let calls = 0;
  const repo = content({
    records,
    onChange(received) {
      calls++;
      assert.equal(received, records);
      assert.deepEqual(ids(received), ['keep']);
    }
  });
  const deleted = repo.deleteByNoteIds(new Set(['n']));
  assert.deepEqual(events, ['c', 'b', 'keep', 'a']);
  assert.deepEqual(deleted, [originals[0], originals[2], originals[3]]);
  assert.equal(deleted[0], originals[0]);
  assert.equal(calls, 1);
  assert.deepEqual(repo.deleteByNoteIds(['missing']), []);
  assert.equal(calls, 1);
});

test('content deletion preserves partial removal if a later reverse-scan getter throws', () => {
  const failure = {};
  const bad = {
    get noteId() {
      throw failure;
    }
  };
  const removed = row('removed', { noteId: 'n' });
  const records = [bad, removed];
  let calls = 0;
  const repo = content({ records, onChange: () => calls++ });
  assert.throws(() => repo.deleteByNoteIds(['n']), errorIs(failure));
  assert.deepEqual(records, [bad]);
  assert.equal(calls, 0);
});

test('support repositories retain array and row identities without content normalization', () => {
  for (const create of support) {
    const first = row('a', { revision: 1 });
    const records = [first];
    const options = { records };
    const repo = create(options);
    options.records = [];
    assert.equal(repo.findById('a'), first);
    assert.equal(repo.list()[0], first);
    assert.notEqual(repo.list(), records);
    const second = row('b', { revision: 2 });
    assert.equal(repo.save(second), second);
    assert.equal(records[1], second);
    const next = row('a', { revision: 3 });
    assert.equal(repo.save(next), next);
    assert.equal(records[0], next);
    assert.equal(repo.delete('a'), next);
    assert.equal(repo.delete('missing'), null);
    assert.equal(repo.findById('missing'), null);
    assert.equal(second.schemaVersion, undefined);
    assert.deepEqual(options.records, []);
  }
});

test('support captures records then callback once and invokes the captured callback without receiver', () => {
  for (const create of support) {
    const events = [];
    const records = [];
    const callback = function (value) {
      events.push([this, value, value.length]);
    };
    const options = {
      get records() {
        events.push('records');
        return records;
      },
      get onChange() {
        events.push('onChange');
        return callback;
      }
    };
    const repo = create(options);
    assert.deepEqual(events, ['records', 'onChange']);
    Object.defineProperty(options, 'onChange', {
      value() {
        throw new Error('must not use replacement callback');
      }
    });
    repo.save(row('a'));
    repo.save(row('a'));
    repo.delete('absent');
    repo.delete('a');
    assert.deepEqual(
      events.slice(2).map(call => call[2]),
      [1, 1, 0]
    );
    for (const [receiver, value] of events.slice(2)) {
      assert.equal(receiver, undefined);
      assert.equal(value, records);
    }
  }
});

test('support save and delete use first strict id match and incoming getter rereads', () => {
  for (const create of support) {
    const token = {};
    const a = row(token);
    const b = row(token);
    const records = [a, b];
    const repo = create({ records });
    assert.equal(repo.findById({}), null);
    const next = row(token);
    repo.save(next);
    assert.deepEqual(records, [next, b]);
    assert.equal(repo.delete(token), next);
    assert.equal(records[0], b);
    let reads = 0;
    const changing = {
      get id() {
        return ++reads === 1 ? 'no-match' : token;
      }
    };
    records.unshift(row('other'));
    repo.save(changing);
    assert.equal(reads, 2);
    assert.equal(records[1], changing);
  }
});

test('support callback failure happens after each mutation and retains exception identity', () => {
  for (const create of support) {
    const failure = {};
    const records = [];
    const repo = create({
      records,
      onChange() {
        throw failure;
      }
    });
    const first = row('a');
    assert.throws(() => repo.save(first), errorIs(failure));
    assert.equal(records[0], first);
    const next = row('a');
    assert.throws(() => repo.save(next), errorIs(failure));
    assert.equal(records[0], next);
    assert.throws(() => repo.delete('a'), errorIs(failure));
    assert.deepEqual(records, []);
    assert.throws(() => create({ onChange: 0 }).save(first), TypeError);
    const options = {};
    const noCallback = create(options);
    options.onChange = () => {
      throw failure;
    };
    assert.equal(noCallback.save(first), first);
  }
});

test('exclusion filters only exact archived status and truthy parent filters', () => {
  const token = {};
  const records = [
    row('a', { parentAnnotationId: token }),
    row('b', { parentAnnotationId: token, status: 'archived' }),
    row('c', { status: 'deleted', deletedAt: true }),
    row('d', { status: null })
  ];
  const repo = exclusion({ records });
  assert.deepEqual(ids(repo.list()), ['a', 'c', 'd']);
  assert.deepEqual(ids(repo.list({ parentAnnotationId: token })), ['a']);
  assert.deepEqual(ids(repo.list({ parentAnnotationId: token, includeDeleted: 'false' })), ['a', 'b']);
  assert.deepEqual(repo.list({ parentAnnotationId: {} }), []);
  for (const value of [undefined, null, '', 0, false, NaN])
    assert.equal(repo.list({ parentAnnotationId: value }).length, 3);
  assert.equal(repo.findById('b'), records[1]);
});

test('revision list sorts a copy using subtraction and keeps strict annotation revision selectors', () => {
  const token = {};
  const a = row('a', { annotationId: token, revision: '2', status: 'archived' });
  const b = row('b', { annotationId: token, revision: '1' });
  const c = row('c', { annotationId: 'other', revision: 3 });
  const records = [a, b, c];
  const repo = revision({ records });
  assert.deepEqual(ids(repo.list()), ['b', 'a', 'c']);
  assert.deepEqual(ids(records), ['a', 'b', 'c']);
  assert.deepEqual(repo.list({ annotationId: token }), [b, a]);
  assert.deepEqual(repo.list({ annotationId: {} }), []);
  assert.equal(repo.findByAnnotationRevision(token, '2'), a);
  assert.equal(repo.findByAnnotationRevision(token, 2), null);
  assert.equal(repo.findByAnnotationRevision({}, '2'), null);
  assert.equal(a.revision, '2');
  for (const value of [undefined, null, '', 0, false, NaN]) assert.equal(repo.list({ annotationId: value }).length, 3);
});

test('revision subtraction preserves NaN stability and throws for all BigInt and Symbol comparisons', () => {
  for (const value of [NaN, undefined, 'bad']) {
    const a = row('a', { revision: value });
    const b = row('b', { revision: 1 });
    assert.deepEqual(revision({ records: [a, b] }).list(), [a, b]);
  }
  for (const values of [
    [1n, 2n],
    [1n, 1n],
    [1, 1n],
    [1, Symbol('revision')]
  ]) {
    const records = values.map((value, index) => row(index, { revision: value }));
    assert.throws(() => revision({ records }).list(), TypeError);
    assert.deepEqual(
      records.map(item => item.revision),
      values
    );
  }
  const item = row('single', { revision: Symbol('not compared') });
  assert.deepEqual(revision({ records: [item] }).list(), [item]);
});

test('revision sorting reads both properties before left then right number-hint conversions', () => {
  const events = [];
  const item = label => ({
    id: label,
    get revision() {
      events.push(`${label}:get`);
      return {
        [Symbol.toPrimitive](hint) {
          events.push(`${label}:${hint}`);
          return 1;
        }
      };
    }
  });
  revision({ records: [item('right'), item('left')] }).list();
  assert.deepEqual(events, ['left:get', 'right:get', 'left:number', 'right:number']);
  const failure = {};
  const records = [
    row('a', { revision: 1 }),
    row('b', {
      revision: {
        valueOf() {
          throw failure;
        }
      }
    })
  ];
  assert.throws(() => revision({ records }).list(), errorIs(failure));
  assert.deepEqual(ids(records), ['a', 'b']);
});

test('support compound find scans all candidates unlike short-circuit findById', () => {
  const failure = {};
  const first = row('a', { annotationId: 'n', revision: 1, spaceId: 's', idempotencyKey: 'k' });
  for (const [create, key, find] of [
    [revision, 'annotationId', repo => repo.findByAnnotationRevision('n', 1)],
    [scope, 'spaceId', repo => repo.findByIdempotencyKey('s', 'k')]
  ]) {
    const second = {
      id: 'b',
      get [key]() {
        throw failure;
      }
    };
    const repo = create({ records: [first, second] });
    assert.equal(repo.findById('a'), first);
    assert.throws(() => find(repo), errorIs(failure));
  }
});

test('analysis scopes use deletedAt truthiness and strict idempotency key equality', () => {
  const token = {};
  const records = [
    row('a', { spaceId: token, idempotencyKey: token }),
    row('b', { spaceId: token, idempotencyKey: token, deletedAt: 'yes' }),
    row('c', { deletedAt: 0, status: 'archived' }),
    row('d', { deletedAt: false }),
    row('e', { deletedAt: NaN })
  ];
  const repo = scope({ records });
  assert.deepEqual(ids(repo.list()), ['a', 'c', 'd', 'e']);
  assert.deepEqual(ids(repo.list({ spaceId: token })), ['a']);
  assert.deepEqual(ids(repo.list({ spaceId: token, includeDeleted: [] })), ['a', 'b']);
  assert.deepEqual(repo.list({ spaceId: {} }), []);
  assert.equal(repo.findByIdempotencyKey(token, token), records[0]);
  assert.equal(repo.findByIdempotencyKey({}, token), null);
  assert.equal(repo.findByIdempotencyKey(token, {}), null);
  const deletedOnly = scope({ records: [records[1]] });
  assert.equal(deletedOnly.findByIdempotencyKey(token, token), records[1]);
});

test('support bulk delete snapshots original order and persists separately after every deletion', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const a = row('a', { [key]: 'n', revision: 9, status: 'archived' });
    const keep = row('keep', { [key]: 'other', revision: 0 });
    const b = row('b', { [key]: 'n', revision: 1 });
    const records = [a, keep, b];
    const calls = [];
    const repo = create({
      records,
      onChange(value) {
        calls.push([...value]);
      }
    });
    assert.deepEqual(repo.deleteByAnnotationIds(['missing']), []);
    assert.equal(calls.length, 0);
    assert.deepEqual(repo.deleteByAnnotationIds(['n']), [a, b]);
    assert.deepEqual(calls, [[keep, b], [keep]]);
    assert.deepEqual(records, [keep]);
  }
});

test('support duplicate ids may remove an unselected row while leaving a selected duplicate', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const other = row('same', { [key]: 'other' });
    const a = row('same', { [key]: 'n' });
    const b = row('same', { [key]: 'n' });
    const records = [other, a, b];
    const deleted = create({ records }).deleteByAnnotationIds(['n']);
    assert.deepEqual(deleted, [other, a]);
    assert.equal(deleted[0], other);
    assert.deepEqual(records, [b]);
  }
});

test('support bulk delete may return null after callback removes a later snapshot candidate', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const a = row('a', { [key]: 'n' });
    const b = row('b', { [key]: 'n' });
    const records = [a, b];
    let calls = 0;
    const repo = create({
      records,
      onChange(value) {
        calls++;
        value.length = 0;
      }
    });
    assert.deepEqual(repo.deleteByAnnotationIds(['n']), [a, null]);
    assert.equal(calls, 1);
    assert.deepEqual(records, []);
  }
});

test('support bulk delete retains callback-inserted rows outside the selected snapshot', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const a = row('a', { [key]: 'n' });
    const b = row('b', { [key]: 'n' });
    const injected = row('injected', { [key]: 'n' });
    const records = [a, b];
    let calls = 0;
    const repo = create({
      records,
      onChange(value) {
        if (++calls === 1) value.push(injected);
      }
    });
    assert.deepEqual(repo.deleteByAnnotationIds(['n']), [a, b]);
    assert.deepEqual(records, [injected]);
    assert.equal(calls, 2);
  }
});

test('support bulk callback failure stops after the current removal without rolling back', () => {
  const failure = {};
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const a = row('a', { [key]: 'n' });
    const b = row('b', { [key]: 'n' });
    const records = [a, b];
    let calls = 0;
    const repo = create({
      records,
      onChange() {
        calls++;
        throw failure;
      }
    });
    assert.throws(() => repo.deleteByAnnotationIds(['n']), errorIs(failure));
    assert.deepEqual(records, [b]);
    assert.equal(calls, 1);
  }
});

test('support bulk deletion closes over base methods and does not dispatch through overridden methods', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const item = row('a', { [key]: 'n' });
    const records = [item];
    const repo = create({ records });
    repo.list = repo.delete = () => {
      throw new Error('must retain base method');
    };
    const detached = repo.deleteByAnnotationIds;
    assert.deepEqual(detached(['n']), [item]);
    assert.deepEqual(records, []);
  }
  for (const create of all) {
    const repo = create();
    const save = repo.save;
    const item = row('a');
    assert.equal(save(item), item);
    const find = repo.findById;
    assert.equal(find('a').id, 'a');
  }
});

test('bulk delete accepts arbitrary iterables with SameValueZero matching and nullish empty input', () => {
  const token = {};
  for (const [create, key, method] of [
    [content, 'noteId', 'deleteByNoteIds'],
    [exclusion, 'parentAnnotationId', 'deleteByAnnotationIds'],
    [revision, 'annotationId', 'deleteByAnnotationIds']
  ]) {
    for (const make of [
      values => new Set(values),
      values =>
        (function* () {
          yield* values;
        })()
    ]) {
      const a = row('a', { [key]: token });
      const b = row('b', { [key]: NaN });
      const keep = row('keep', { [key]: {} });
      const records = [a, b, keep];
      const repo = create({ records });
      assert.deepEqual(repo[method](null), []);
      assert.deepEqual(repo[method](undefined), []);
      assert.deepEqual(repo[method](make([token, NaN, token])), [a, b]);
      assert.deepEqual(records, [keep]);
    }
    const item = row('a', { [key]: 'a' });
    assert.deepEqual(create({ records: [item] })[method]('aba'), [item]);
  }
});

test('bulk delete constructs its Set before mutations and propagates iterator failure unchanged', () => {
  const failure = {};
  for (const [create, key, method] of [
    [content, 'noteId', 'deleteByNoteIds'],
    [exclusion, 'parentAnnotationId', 'deleteByAnnotationIds'],
    [revision, 'annotationId', 'deleteByAnnotationIds']
  ]) {
    const item = row('a', { [key]: 'n' });
    const records = [item];
    let calls = 0;
    const repo = create({ records, onChange: () => calls++ });
    const input = {
      *[Symbol.iterator]() {
        yield 'n';
        throw failure;
      }
    };
    assert.throws(() => repo[method](input), errorIs(failure));
    assert.deepEqual(records, [item]);
    assert.equal(calls, 0);
    assert.throws(() => repo[method]({}), TypeError);
  }
});

test('sparse arrays retain filter/map skipping versus find and reverse-loop native failures', () => {
  for (const create of all) {
    const records = new Array(1);
    const item = row('a', { noteId: 'n', annotationId: 'n', parentAnnotationId: 'n' });
    records.push(item);
    const repo = create({ records });
    assert.equal(repo.list().length, 1);
    assert.throws(() => repo.findById('a'), TypeError);
    assert.throws(() => repo.save(row('a')), TypeError);
    if (create === content) {
      assert.throws(() => repo.findDuplicate({ noteId: 'n' }), TypeError);
      assert.throws(() => repo.deleteByNoteIds(['n']), TypeError);
      assert.equal(records.length, 1);
    }
  }
});

test('support delete returns undefined if an id getter clears the array during findIndex', () => {
  for (const create of support) {
    const records = [];
    let calls = 0;
    const item = {
      get id() {
        records.length = 0;
        return 'a';
      }
    };
    records.push(item);
    const repo = create({
      records,
      onChange(value) {
        calls++;
        assert.equal(value, records);
      }
    });
    assert.equal(repo.delete('a'), undefined);
    assert.deepEqual(records, []);
    assert.equal(calls, 1);
  }
});

test('support bulk delete preserves undefined when a later id read clears the current array', () => {
  for (const [create, key] of [
    [exclusion, 'parentAnnotationId'],
    [revision, 'annotationId']
  ]) {
    const records = [];
    let reads = 0;
    let calls = 0;
    const item = {
      [key]: 'n',
      get id() {
        if (++reads === 2) records.length = 0;
        return 'a';
      }
    };
    records.push(item);
    const repo = create({ records, onChange: () => calls++ });
    assert.deepEqual(repo.deleteByAnnotationIds(['n']), [undefined]);
    assert.equal(reads, 2);
    assert.equal(calls, 1);
    assert.deepEqual(records, []);
  }
});

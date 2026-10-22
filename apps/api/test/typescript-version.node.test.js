import assert from 'node:assert/strict';
import test from 'node:test';
import { NoteVersion, calculateContentHash } from '../src/modules/knowledge/domain/note-version.ts';
import {
  parseVersionPageQuery,
  versionSummary,
  versionPage
} from '../src/modules/knowledge/domain/note-version-page.ts';
import { createNoteVersionReferenceIndex } from '../src/modules/knowledge/domain/note-version-references.ts';
import {
  NOTE_VERSION_RETENTION,
  selectVersionsToPrune
} from '../src/modules/knowledge/domain/note-version-retention.ts';
import {
  EVIDENCE_APPLICABILITY,
  legacyEvidenceApplicability,
  isEvidenceUsable
} from '../src/modules/knowledge/domain/evidence-applicability.ts';

const timestamp = '2026-10-22T00:00:00.000Z';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const input = { id: ' version ', noteId: ' note ', content: '正文', createdAt: timestamp };
const policy = {
  recentMs: 1000,
  dailyUntilMs: 2000,
  maxAgeMs: 3000,
  sampleMs: 100,
  maxPerNote: 3,
  maxBytesPerNote: 10000
};
const record = (id, time, extra = {}) => ({ id, createdAt: new Date(time).toISOString(), ...extra });

for (const [file, exports] of [
  ['note-version', ['NoteVersion', 'calculateContentHash']],
  ['note-version-page', ['parseVersionPageQuery', 'versionPage', 'versionSummary']],
  ['note-version-references', ['createNoteVersionReferenceIndex']],
  ['note-version-retention', ['NOTE_VERSION_RETENTION', 'selectVersionsToPrune']],
  ['evidence-applicability', ['EVIDENCE_APPLICABILITY', 'isEvidenceUsable', 'legacyEvidenceApplicability']]
]) {
  test(`${file}: JS bridges expose precisely the same TS identities`, async () => {
    const legacy = await import(`../src/modules/knowledge/domain/${file}.js`);
    const migrated = await import(`../src/modules/knowledge/domain/${file}.ts`);
    assert.deepEqual(Object.keys(legacy), exports);
    assert.deepEqual(Object.keys(migrated), exports);
    for (const name of exports) assert.equal(legacy[name], migrated[name]);
  });
}

test('NoteVersion preserves hash normalization, mismatched hashes, field order and frozen records', () => {
  const version = new NoteVersion(input);
  assert.equal(version.contentHash, calculateContentHash(input.content));
  assert.deepEqual(Object.keys(version), ['id', 'noteId', 'content', 'contentHash', 'createdAt', 'createdBy']);
  assert.deepEqual({ ...version }, { ...input, contentHash: calculateContentHash(input.content), createdBy: 'user' });
  assert.ok(Object.isFrozen(version));
  assert.throws(() => {
    version.content = 'changed';
  }, TypeError);
  assert.deepEqual(new NoteVersion(JSON.parse(JSON.stringify(version))), version);
  const mismatched = 'A'.repeat(64);
  assert.equal(new NoteVersion({ ...input, contentHash: mismatched }).contentHash, mismatched.toLowerCase());
  assert.equal(new NoteVersion({ ...input, createdAt: null }).createdAt, null);
  const automatic = new NoteVersion({ id: 'v', noteId: 'n', content: '' });
  assert.equal(new Date(automatic.createdAt).toISOString(), automatic.createdAt);
  assert.equal(calculateContentHash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  for (const value of [null, undefined]) assert.equal(calculateContentHash(value), calculateContentHash(''));
  for (const value of [0, true, {}, ['a']])
    assert.equal(calculateContentHash(value), calculateContentHash(String(value)));
});

test('NoteVersion retains validation order and native failures for invalid inputs', () => {
  for (const value of [undefined, null]) assert.throws(() => new NoteVersion(value), TypeError);
  assert.throws(
    () => new NoteVersion({ id: '', content: null, contentHash: '', createdBy: '' }),
    /identity is required/
  );
  assert.throws(
    () => new NoteVersion({ ...input, content: null, contentHash: '', createdBy: '' }),
    /content is required/
  );
  assert.throws(() => new NoteVersion({ ...input, contentHash: '', createdBy: '' }), /contentHash is invalid/);
  for (const field of ['id', 'noteId', 'createdBy']) {
    for (const value of [undefined, null, '', '  ']) {
      if (field === 'createdBy' && value === undefined) continue;
      assert.throws(
        () => new NoteVersion({ ...input, [field]: value }),
        new RegExp(field === 'createdBy' ? 'createdBy is required' : 'identity is required')
      );
    }
    assert.throws(() => new NoteVersion({ ...input, [field]: 1 }), TypeError);
  }
  for (const content of [undefined, null, 0, {}, false])
    assert.throws(() => new NoteVersion({ ...input, content }), /content is required/);
  for (const contentHash of [null, false, 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])
    assert.throws(() => new NoteVersion({ ...input, contentHash }), /contentHash is invalid/);
  const throwing = {
    toString() {
      throw new Error('hash default evaluated first');
    }
  };
  assert.throws(() => new NoteVersion({ id: '', content: throwing }), /hash default evaluated first/);
});

test('page query preserves numeric coercion, cursor extras, falsy cursors and error ordering', () => {
  assert.deepEqual(parseVersionPageQuery(), { limit: 20, after: null });
  for (const [limit, expected] of [
    [1, 1],
    [100, 100],
    ['2', 2],
    [true, 1]
  ])
    assert.deepEqual(parseVersionPageQuery({ limit }), { limit: expected, after: null });
  for (const limit of [101, 0, -1, 1.5, null, false, 'bad'])
    assert.throws(() => parseVersionPageQuery({ limit, cursor: '?' }), {
      code: 'NOTE_VERSION_PAGE_INVALID',
      statusCode: 400,
      message: '版本分页数量须为 1 到 100'
    });
  for (const cursor of [undefined, null, '', 0, false])
    assert.deepEqual(parseVersionPageQuery({ cursor }), { limit: 20, after: null });
  const after = { id: 'v', createdAt: timestamp, extra: { keep: true } };
  assert.deepEqual(parseVersionPageQuery({ cursor: encode(after) }), { limit: 20, after });
  for (const cursor of [
    '?',
    encode(null),
    encode({}),
    encode({ id: '', createdAt: timestamp }),
    encode({ id: 'v', createdAt: 'bad' }),
    encode({ id: 1, createdAt: timestamp }),
    encode({ id: 'v', createdAt: 0 })
  ])
    assert.throws(() => parseVersionPageQuery({ cursor }), {
      code: 'NOTE_VERSION_CURSOR_INVALID',
      statusCode: 400,
      message: '版本分页游标无效'
    });
  assert.throws(() => parseVersionPageQuery(null), TypeError);
});

test('page summaries normalize Date/string timestamps and exclude content from limit-plus-one pages', () => {
  const first = { ...input, contentHash: 'hash', createdBy: 'user' };
  const expected = { id: input.id, noteId: input.noteId, contentHash: 'hash', createdAt: timestamp, createdBy: 'user' };
  assert.deepEqual(versionSummary(first), expected);
  assert.deepEqual(versionSummary({ ...first, createdAt: new Date(timestamp) }), expected);
  assert.throws(() => versionSummary({ ...first, createdAt: 'bad' }), RangeError);
  const items = [first, { ...first, id: 'second' }];
  const before = structuredClone(items);
  const page = versionPage(items, { limit: 1, total: 9, currentVersionId: 'current' });
  assert.deepEqual(page, {
    items: [expected],
    total: 9,
    currentVersionId: 'current',
    nextCursor: encode({ createdAt: timestamp, id: input.id })
  });
  assert.equal('content' in page.items[0], false);
  assert.deepEqual(items, before);
  assert.equal(versionPage(items, { limit: 2, total: 2 }).nextCursor, null);
  assert.deepEqual(versionPage([], { limit: 1, total: 0 }), {
    items: [],
    total: 0,
    currentVersionId: undefined,
    nextCursor: null
  });
});

test('reference index scans IDs, hashes, nested values and keys, including hashless revisions', () => {
  const has = createNoteVersionReferenceIndex({
    evidence: [{ versionId: 'version-id', nested: [{ hash: 'hash_123' }], key_token: true }],
    revisions: [{ versionId: 'revision-id' }],
    empty: null,
    absent: undefined
  });
  for (const id of ['version-id', 'key_token', 'revision-id']) assert.equal(has({ id }), true);
  assert.equal(has({ id: 'missing', contentHash: 'hash_123' }), true);
  assert.equal(has({ id: 'missing' }), false);
  assert.equal(has({ id: 'version' }), false);
  assert.equal(createNoteVersionReferenceIndex({ values: [null] })({ id: 'null' }), true);
  assert.equal(createNoteVersionReferenceIndex({})({}), false);
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => createNoteVersionReferenceIndex({ values: [cycle] }), TypeError);
  assert.throws(() => createNoteVersionReferenceIndex({ values: [undefined] }), TypeError);
  assert.throws(() => createNoteVersionReferenceIndex(null), TypeError);
});

test('retention defaults are frozen and stable', () => {
  assert.deepEqual(NOTE_VERSION_RETENTION, {
    recentMs: 86400000,
    dailyUntilMs: 2592000000,
    maxAgeMs: 2592000000,
    sampleMs: 600000,
    maxPerNote: 20,
    maxBytesPerNote: 2097152
  });
  assert.ok(Object.isFrozen(NOTE_VERSION_RETENTION));
});

test('retention protects invalid dates and roots without consuming count, bytes or buckets', () => {
  const versions = [
    record('old', 1000),
    record('root', 4999, { content: 'x'.repeat(100) }),
    record('a', 4998),
    record('b', 4800),
    { id: 'invalid', createdAt: 'bad' }
  ];
  const before = structuredClone(versions);
  const protectedIds = new Set(['root', 'old']);
  const ownPolicy = { ...policy, maxPerNote: 1, maxBytesPerNote: Buffer.byteLength(JSON.stringify(versions[2])) };
  assert.deepEqual(selectVersionsToPrune({ versions, now: 5000, protectedIds, policy: ownPolicy }), ['b']);
  assert.deepEqual(versions, before);
  assert.deepEqual([...protectedIds], ['root', 'old']);
  assert.equal(ownPolicy.maxPerNote, 1);
});

test('retention orders equal timestamps by descending ID and samples future timestamps', () => {
  const versions = [
    record('a', 5000),
    record('b', 5000),
    record('future-low', 5101),
    record('future-high', 5199),
    record('future-next', 5200)
  ];
  assert.deepEqual(selectVersionsToPrune({ versions, now: 5000, policy: { ...policy, maxPerNote: 10 } }), [
    'future-low',
    'a'
  ]);
  assert.deepEqual(
    selectVersionsToPrune({ versions: [record('boundary', 2000), record('expired', 1999)], now: 5000, policy }),
    ['expired']
  );
});

test('retention uses UTF-8 bytes of the entire record, not content length', () => {
  const version = record('v', 5000, { content: '中', metadata: '文' });
  const bytes = Buffer.byteLength(JSON.stringify(version));
  assert.ok(bytes > JSON.stringify(version).length);
  for (const [maxBytesPerNote, expected] of [
    [bytes, []],
    [bytes - 1, ['v']],
    [JSON.stringify(version).length, ['v']]
  ])
    assert.deepEqual(
      selectVersionsToPrune({ versions: [version], now: 5000, policy: { ...policy, maxBytesPerNote } }),
      expected
    );
});

test('retention keeps one daily sample beyond recentMs and does not enforce dailyUntilMs separately', () => {
  const versions = [record('newer', 3000), record('older', 2000)];
  assert.deepEqual(selectVersionsToPrune({ versions, now: 5000, policy: { ...policy, dailyUntilMs: 1 } }), ['older']);
});

test('evidence applicability retains legacy defaults and exact explicit values', () => {
  assert.deepEqual(EVIDENCE_APPLICABILITY, { ACTIVE: 'active', WITHDRAWN: 'withdrawn', NEEDS_REVIEW: 'needsReview' });
  assert.ok(Object.isFrozen(EVIDENCE_APPLICABILITY));
  for (const status of ['valid', 'invalid', undefined, null, '', 'custom']) {
    const legacy = status === 'invalid' ? 'needsReview' : 'active';
    assert.equal(legacyEvidenceApplicability({ status }), legacy);
    assert.equal(legacyEvidenceApplicability({ status, applicabilityStatus: null }), legacy);
    assert.equal(isEvidenceUsable({ status }), status === 'valid');
    for (const applicabilityStatus of ['active', 'withdrawn', 'needsReview', '', 'custom', false, 0]) {
      assert.equal(legacyEvidenceApplicability({ status, applicabilityStatus }), applicabilityStatus);
      assert.equal(
        isEvidenceUsable({ status, applicabilityStatus }),
        status === 'valid' && applicabilityStatus === 'active'
      );
    }
  }
  for (const value of [null, undefined]) {
    assert.equal(isEvidenceUsable(value), false);
    assert.throws(() => legacyEvidenceApplicability(value), TypeError);
  }
});

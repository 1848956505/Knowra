import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContentAnnotation,
  INLINE_ANNOTATION_SCHEMA,
  INLINE_ANCHOR_FORMAT,
  projectLegacyAnnotationStatus
} from '../src/modules/knowledge/domain/content-annotation.js';

const timestamp = '2026-10-22T00:00:00.000Z';
const input = {
  id: ' annotation ',
  spaceId: ' space ',
  noteId: ' note ',
  quoteText: '  引文😀 \n',
  fromPosition: 2,
  toPosition: 9,
  anchorFingerprint: ' fingerprint ',
  noteContentHash: ' hash ',
  idempotencyKey: ' key ',
  createdAt: timestamp
};
const inline = () => ({ format: 'knowra-inline', markId: 'mark' });
const create = overrides => new ContentAnnotation({ ...input, ...overrides });
const reject = (overrides, message) => assert.throws(() => create(overrides), { name: 'Error', message });

test('ContentAnnotation JS/TS bridge preserves all exported identities', async () => {
  const js = await import('../src/modules/knowledge/domain/content-annotation.js');
  const ts = await import('../src/modules/knowledge/domain/content-annotation.ts');
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  assert.deepEqual(Object.keys(js), [
    'ContentAnnotation',
    'INLINE_ANCHOR_FORMAT',
    'INLINE_ANNOTATION_SCHEMA',
    'projectLegacyAnnotationStatus'
  ]);
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('ContentAnnotation schema defaults preserve field order and JSON round trips', () => {
  assert.equal(INLINE_ANNOTATION_SCHEMA, 3);
  assert.equal(INLINE_ANCHOR_FORMAT, 'knowra-inline');
  const expected = {
    id: input.id,
    spaceId: input.spaceId,
    noteId: input.noteId,
    noteVersionId: null,
    kind: 'important',
    sourceMode: 'manual',
    quoteText: input.quoteText.trim(),
    headingPath: [],
    fromPosition: 2,
    toPosition: 9,
    prefixText: '',
    suffixText: '',
    anchorFingerprint: input.anchorFingerprint,
    noteContentHash: input.noteContentHash,
    idempotencyKey: input.idempotencyKey,
    schemaVersion: 1,
    scopeType: 'selection',
    importance: null,
    comment: '',
    lifecycleStatus: 'active',
    anchorStatus: 'resolved',
    anchorReason: null,
    revision: 1,
    anchor: null,
    originSnapshot: null,
    identityBinding: null,
    resolvedContentHash: null,
    boundaryFingerprint: null,
    requestHash: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null
  };
  for (const schemaVersion of [1, 2, 3]) {
    const overrides =
      schemaVersion === 1 ? {} : { schemaVersion, anchor: inline(), originSnapshot: { quoteText: input.quoteText } };
    const annotation = create(overrides);
    const value = {
      ...expected,
      ...overrides,
      quoteText: schemaVersion === 1 ? input.quoteText.trim() : input.quoteText
    };
    assert.deepEqual(Object.keys(annotation), Object.keys(expected));
    assert.deepEqual({ ...annotation }, value);
    assert.equal(JSON.stringify(annotation), JSON.stringify(value));
    assert.deepEqual(new ContentAnnotation(JSON.parse(JSON.stringify(annotation))), annotation);
    assert.equal(Object.isFrozen(annotation), false);
  }
});

test('ContentAnnotation legacy projection covers every lifecycle and anchor combination', () => {
  for (const lifecycleStatus of ['active', 'archived', 'deleted']) {
    for (const anchorStatus of ['resolved', 'needsReview', 'missing']) {
      const expected = lifecycleStatus !== 'active' ? 'archived' : anchorStatus === 'resolved' ? 'active' : 'stale';
      assert.equal(projectLegacyAnnotationStatus({ lifecycleStatus, anchorStatus }), expected);
      for (const status of ['active', 'stale', 'archived']) {
        const annotation = create({ status, lifecycleStatus, anchorStatus });
        assert.equal(annotation.status, expected);
        assert.equal(annotation.lifecycleStatus, lifecycleStatus);
        assert.equal(annotation.anchorStatus, anchorStatus);
      }
    }
  }
  assert.equal(projectLegacyAnnotationStatus({}), 'stale');
  assert.equal(projectLegacyAnnotationStatus({ lifecycleStatus: 'unknown', anchorStatus: 'resolved' }), 'active');
  assert.throws(() => projectLegacyAnnotationStatus(null), TypeError);
});

test('ContentAnnotation legacy status defaults and partial overrides remain independent', () => {
  for (const [status, lifecycleStatus, anchorStatus] of [
    ['active', 'active', 'resolved'],
    ['stale', 'active', 'needsReview'],
    ['archived', 'archived', 'resolved']
  ]) {
    const annotation = create({ status });
    assert.equal(annotation.lifecycleStatus, lifecycleStatus);
    assert.equal(annotation.anchorStatus, anchorStatus);
    assert.equal(annotation.status, status);
  }
  assert.equal(create({ status: 'archived', lifecycleStatus: 'active' }).status, 'active');
  assert.equal(create({ status: 'stale', anchorStatus: 'resolved' }).status, 'active');
  assert.equal(create({ lifecycleStatus: 'deleted', deletedAt: timestamp }).status, 'archived');
  for (const status of [null, '', 'deleted', 'invalid']) {
    reject({ status, lifecycleStatus: 'active', anchorStatus: 'resolved' }, 'Annotation status is invalid');
  }
});

test('ContentAnnotation timestamps preserve explicit nulls and default only undefined', () => {
  const before = Date.now();
  const automatic = create({ createdAt: undefined });
  assert.equal(new Date(automatic.createdAt).toISOString(), automatic.createdAt);
  assert.ok(Date.parse(automatic.createdAt) >= before && Date.parse(automatic.createdAt) <= Date.now());
  assert.equal(automatic.updatedAt, automatic.createdAt);
  for (const createdAt of [null, '', timestamp]) {
    assert.equal(create({ createdAt }).createdAt, createdAt);
    assert.equal(create({ createdAt }).updatedAt, createdAt);
    for (const updatedAt of [null, '', 'later']) {
      const annotation = create({ createdAt, updatedAt, deletedAt: null });
      assert.equal(annotation.updatedAt, updatedAt);
      assert.equal(annotation.deletedAt, null);
    }
  }
});

test('ContentAnnotation validates identity and content without trimming stored identity fields', () => {
  for (const field of ['id', 'spaceId', 'noteId', 'anchorFingerprint', 'noteContentHash', 'idempotencyKey']) {
    assert.equal(create()[field], input[field]);
    for (const value of [undefined, null, '', '  ']) {
      reject(
        { [field]: value },
        ['id', 'spaceId', 'noteId'].includes(field)
          ? 'Annotation identity is required'
          : 'Annotation content is required'
      );
    }
    for (const value of [1, false, {}]) assert.throws(() => create({ [field]: value }), TypeError);
  }
  for (const quoteText of [undefined, null, false, 1, '', ' \n '])
    reject({ quoteText }, 'Annotation content is required');
  for (const value of [undefined, null]) assert.throws(() => new ContentAnnotation(value), TypeError);
});

test('ContentAnnotation enum and revision boundaries retain exact validation errors', () => {
  const enums = {
    kind: ['important', 'question', 'supplement', 'pitfall', 'temporary'],
    sourceMode: ['manual', 'ai'],
    scopeType: ['selection', 'blocks', 'section', 'list'],
    importance: [null, 'normal', 'important', 'core'],
    lifecycleStatus: ['active', 'archived', 'deleted'],
    anchorStatus: ['resolved', 'needsReview', 'missing']
  };
  for (const [field, values] of Object.entries(enums)) {
    for (const value of values) assert.equal(create({ [field]: value })[field], value);
    const message = ['kind', 'sourceMode'].includes(field)
      ? 'Annotation kind or sourceMode is invalid'
      : ['scopeType', 'importance'].includes(field)
        ? 'Annotation scope or importance is invalid'
        : 'Annotation lifecycle or anchor status is invalid';
    reject({ [field]: 'invalid' }, message);
  }
  for (const schemaVersion of [null, 0, 4, '2', 1.5])
    reject({ schemaVersion }, 'Annotation schema or revision is invalid');
  for (const revision of [null, 0, -1, 1.5, '1', NaN, Infinity])
    reject({ revision }, 'Annotation schema or revision is invalid');
  assert.equal(create({ revision: 2 }).revision, 2);
  assert.equal(create({ comment: 'x'.repeat(2000) }).comment.length, 2000);
  for (const comment of [null, 2, {}, 'x'.repeat(2001)]) reject({ comment }, 'Annotation comment is invalid');
});

test('ContentAnnotation range and empty-tracking behavior preserve legacy escape hatches', () => {
  for (const anchor of [null, { tracking: { empty: false } }]) {
    for (const [fromPosition, toPosition] of [
      [2, 2],
      [3, 2],
      [0, -1]
    ])
      reject({ anchor, fromPosition, toPosition }, 'Annotation range is invalid');
  }
  for (const empty of [true, 'legacy-truthy']) {
    const anchor = { tracking: { empty } };
    for (const [fromPosition, toPosition] of [
      [2, 2],
      [3, 2],
      [0, -9]
    ]) {
      const annotation = create({ anchor, quoteText: ' \n ', fromPosition, toPosition });
      assert.equal(annotation.quoteText, '');
      assert.equal(annotation.toPosition, toPosition);
    }
    for (const [fromPosition, toPosition] of [
      [-1, 2],
      [1.5, 2],
      [0, 1.5],
      ['0', 2],
      [0, NaN],
      [0, Infinity]
    ]) {
      reject({ anchor, quoteText: '', fromPosition, toPosition }, 'Annotation range is invalid');
    }
    reject({ anchor, quoteText: null }, 'Annotation content is required');
  }
});

test('ContentAnnotation version 2 retains truthiness-only legacy anchor and snapshot checks', () => {
  for (const field of ['anchor', 'originSnapshot']) {
    for (const value of [undefined, null, false, 0, ''])
      reject(
        { schemaVersion: 2, anchor: {}, originSnapshot: {}, [field]: value },
        'Versioned annotation anchor is required'
      );
  }
  // These malformed-but-truthy legacy values pin runtime behavior, not supported TS input shapes.
  for (const value of [{}, [], 'legacy', 1, true]) {
    const annotation = create({ schemaVersion: 2, anchor: value, originSnapshot: value });
    assert.deepEqual(annotation.anchor, value);
    assert.deepEqual(annotation.originSnapshot, value);
    assert.equal(annotation.quoteText, input.quoteText);
  }
});

test('ContentAnnotation version 3 requires exact format, string markId and truthy snapshot only', () => {
  for (const anchor of [
    null,
    {},
    { format: 'other', markId: 'mark' },
    { format: INLINE_ANCHOR_FORMAT },
    { format: INLINE_ANCHOR_FORMAT, markId: 1 },
    { format: INLINE_ANCHOR_FORMAT, markId: null }
  ]) {
    reject({ schemaVersion: 3, anchor, originSnapshot: {} }, 'Inline annotation anchor is required');
  }
  for (const originSnapshot of [undefined, null, false, 0, ''])
    reject({ schemaVersion: 3, anchor: inline(), originSnapshot }, 'Inline annotation anchor is required');
  // Empty/whitespace mark IDs and malformed truthy snapshots remain accepted at runtime.
  for (const markId of ['', ' ', 'mark']) {
    for (const originSnapshot of [{}, [], 'legacy', true]) {
      const annotation = create({ schemaVersion: 3, anchor: { format: INLINE_ANCHOR_FORMAT, markId }, originSnapshot });
      assert.equal(annotation.anchor.markId, markId);
      assert.deepEqual(annotation.originSnapshot, originSnapshot);
      assert.equal(annotation.quoteText, input.quoteText);
    }
  }
});

test('ContentAnnotation preserves shallow heading paths and deep cloned anchor metadata', () => {
  const heading = { label: 'heading' };
  const headingPath = [heading];
  const anchor = { ...inline(), nested: { value: 1 } };
  const originSnapshot = { nested: { value: 2 } };
  const identityBinding = { nested: { value: 3 } };
  const annotation = create({ schemaVersion: 3, headingPath, anchor, originSnapshot, identityBinding });
  assert.notEqual(annotation.headingPath, headingPath);
  assert.equal(annotation.headingPath[0], heading);
  annotation.headingPath.push('second');
  assert.equal(headingPath.length, 1);
  for (const [field, original] of Object.entries({ anchor, originSnapshot, identityBinding })) {
    assert.deepEqual(annotation[field], original);
    assert.notEqual(annotation[field], original);
    assert.notEqual(annotation[field].nested, original.nested);
    annotation[field].nested.value = 99;
    assert.notEqual(original.nested.value, 99);
  }
  assert.deepEqual(create({ headingPath: 'ab' }).headingPath, ['a', 'b']);
  for (const headingPath of [null, {}]) assert.throws(() => create({ headingPath }), TypeError);
});

test('ContentAnnotation cloning preserves falsy normalization, cycles and clone failures', () => {
  for (const field of ['anchor', 'originSnapshot', 'identityBinding']) {
    for (const value of [undefined, null, false, 0, '']) assert.equal(create({ [field]: value })[field], null);
    const cyclic = { value: 1 };
    cyclic.self = cyclic;
    const annotation = create({ [field]: cyclic });
    assert.notEqual(annotation[field], cyclic);
    assert.equal(annotation[field].self, annotation[field]);
    for (const value of [() => {}, { nested: () => {} }, Symbol('uncloneable')]) {
      assert.throws(
        () => create({ [field]: value }),
        error => error.name === 'DataCloneError'
      );
    }
    const failure = new Error('getter clone failure');
    const value = {
      get nested() {
        throw failure;
      }
    };
    assert.throws(
      () => create({ [field]: value }),
      error => error === failure
    );
  }
});

test('ContentAnnotation explicit metadata stays unchanged and validation order is stable', () => {
  const fields = {
    noteVersionId: ' version ',
    prefixText: ' prefix ',
    suffixText: ' suffix ',
    anchorReason: 'reason',
    resolvedContentHash: 'resolved',
    boundaryFingerprint: 'boundary',
    requestHash: 'request',
    deletedAt: timestamp
  };
  const annotation = create(fields);
  for (const [key, value] of Object.entries(fields)) assert.equal(annotation[key], value);
  for (const [overrides, message] of [
    [{ id: '', kind: 'invalid' }, 'Annotation identity is required'],
    [{ kind: 'invalid', scopeType: 'invalid' }, 'Annotation kind or sourceMode is invalid'],
    [{ scopeType: 'invalid', lifecycleStatus: 'invalid' }, 'Annotation scope or importance is invalid'],
    [{ lifecycleStatus: 'invalid', schemaVersion: 0 }, 'Annotation lifecycle or anchor status is invalid'],
    [{ schemaVersion: 0, comment: null }, 'Annotation schema or revision is invalid'],
    [{ comment: null, quoteText: null }, 'Annotation comment is invalid'],
    [{ quoteText: null, fromPosition: -1 }, 'Annotation content is required'],
    [{ fromPosition: -1, status: 'invalid' }, 'Annotation range is invalid'],
    [{ status: 'invalid', lifecycleStatus: 'active', schemaVersion: 2 }, 'Annotation status is invalid']
  ])
    reject(overrides, message);
});

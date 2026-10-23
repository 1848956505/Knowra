import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import { KnowledgeItem } from '../src/modules/knowledge/domain/knowledge-item.js';
import { createInMemoryKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.js';

const baseline = process.env.KNOWRA_EVIDENCE_BOUNDARY_BASELINE === '1';
const commit = '8ae835a93848c6b5dabc07976dae6299adf4092b';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const modelFile = new URL('domain/knowledge-evidence.js', root);
const repositoryFile = new URL('infrastructure/knowledge-evidence-repository.js', root);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const imports = (source, location, replacements = new Map()) =>
  source.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, quote, path) => {
    const target = path.startsWith('.') ? new URL(path, location).href : import.meta.resolve(path);
    return `${prefix}${JSON.stringify(replacements.get(target) || target)}`;
  });
const selectedUrl = (file, path) =>
  baseline
    ? dataUrl(
        imports(
          stripTypeScriptTypes(
            execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/${path}`], {
              cwd: new URL('../../../', import.meta.url),
              encoding: 'utf8'
            })
          ),
          file
        )
      )
    : file.href;
const modelUrl = selectedUrl(modelFile, 'domain/knowledge-evidence.ts');
const repositoryUrl = selectedUrl(repositoryFile, 'infrastructure/knowledge-evidence-repository.ts');
const { KnowledgeEvidence, KNOWLEDGE_EVIDENCE_STATUSES: statuses } = await import(modelUrl);
const { createInMemoryKnowledgeEvidenceRepository: createRepository } = await import(repositoryUrl);
const loadService = path => {
  const location = new URL(path, root);
  return import(
    dataUrl(
      `${imports(readFileSync(location, 'utf8'), location, new Map([[modelFile.href, modelUrl]]))}\n//# sourceURL=${location.href}?evidence-boundary-test`
    )
  );
};
const { createKnowledgeItemService } = await loadService('application/knowledge-item-service.js');
const { createAsyncKnowledgeItemService } = await loadService('application/postgres-async/knowledge-domain-service.js');
const stamp = '2026-01-02T03:04:05.000Z';
const valid = extra => ({ id: 'evidence', knowledgeItemId: 'item', createdAt: stamp, ...extra });
const ids = rows => rows.map(row => row.id);
const sameError = failure => error => error === failure;
const appError = code => error => error instanceof AppError && error.code === code && error.statusCode === 409;
const trace = (object, events) =>
  new Proxy(object, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });
const withSetHas = (replacement, operation) => {
  const original = Set.prototype.has;
  Set.prototype.has = function (value) {
    const kind = original.call(this, 'noteVersion')
      ? 'source'
      : original.call(this, 'valid')
        ? 'status'
        : original.call(this, 'supports')
          ? 'relation'
          : original.call(this, 'active')
            ? 'applicability'
            : null;
    return kind ? replacement.call(this, value, kind) : original.call(this, value);
  };
  try {
    return operation();
  } finally {
    Set.prototype.has = original;
  }
};

test('evidence boundary JS bridges preserve every TS export identity', { skip: baseline }, async () => {
  for (const file of [modelFile, repositoryFile]) {
    const js = await import(file.href);
    const ts = await import(file.href.replace(/\.js$/, '.ts'));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('evidence defaults, own field order and frozen status export remain exact', () => {
  const row = new KnowledgeEvidence(valid());
  assert.deepEqual(
    { ...row },
    {
      id: 'evidence',
      knowledgeItemId: 'item',
      sourceType: 'manual',
      sourceId: null,
      noteId: null,
      noteVersionId: null,
      annotationId: null,
      quoteText: '',
      headingPath: [],
      relationType: 'supports',
      status: 'valid',
      applicabilityStatus: 'active',
      createdAt: stamp,
      updatedAt: stamp
    }
  );
  assert.deepEqual(Object.keys(row), [
    'id',
    'knowledgeItemId',
    'sourceType',
    'sourceId',
    'noteId',
    'noteVersionId',
    'annotationId',
    'quoteText',
    'headingPath',
    'relationType',
    'status',
    'applicabilityStatus',
    'createdAt',
    'updatedAt'
  ]);
  assert.deepEqual(statuses, ['valid', 'stale', 'invalid', 'insufficient']);
  assert.equal(Object.isFrozen(statuses), true);
  assert.throws(() => statuses.push('other'), TypeError);
});

test('evidence validates identity first without trimming retained identifiers', () => {
  for (const field of ['id', 'knowledgeItemId']) {
    for (const value of [undefined, null, '', ' ', '\t'])
      assert.throws(() => new KnowledgeEvidence(valid({ [field]: value, sourceType: 'bad' })), /identity is required/);
    for (const value of [false, 0, 1n, Symbol('id'), {}, { trim: 1 }])
      assert.throws(() => new KnowledgeEvidence(valid({ [field]: value })), TypeError);
    const token = {
      trim() {
        assert.equal(this, token);
        return 'ok';
      }
    };
    assert.equal(new KnowledgeEvidence(valid({ [field]: token }))[field], token);
    assert.equal(new KnowledgeEvidence(valid({ [field]: ' padded ' }))[field], ' padded ');
  }
  assert.throws(() => new KnowledgeEvidence(), TypeError);
  assert.throws(() => new KnowledgeEvidence(null), TypeError);
});

test('evidence enum combinations, applicability defaults and source reference rules stay ordered', () => {
  for (const status of ['valid', 'stale', 'invalid', 'insufficient']) {
    assert.equal(
      new KnowledgeEvidence(valid({ status })).applicabilityStatus,
      status === 'invalid' ? 'needsReview' : 'active'
    );
    for (const applicabilityStatus of ['active', 'withdrawn', 'needsReview'])
      assert.equal(
        new KnowledgeEvidence(valid({ status, applicabilityStatus })).applicabilityStatus,
        applicabilityStatus
      );
  }
  for (const field of ['sourceType', 'status', 'relationType', 'applicabilityStatus'])
    for (const value of [null, false, 0, '', 'wrong', {}, []])
      assert.throws(
        () => new KnowledgeEvidence(valid({ [field]: value, headingPath: null })),
        /type or status is invalid/
      );
  assert.throws(
    () => new KnowledgeEvidence(valid({ sourceType: 'noteVersion', headingPath: null })),
    /headingPath is invalid/
  );
  assert.throws(() => new KnowledgeEvidence(valid({ sourceType: 'noteVersion' })), /requires noteVersionId/);
  assert.throws(() => new KnowledgeEvidence(valid({ sourceType: 'annotation' })), /requires annotationId/);
  for (const field of ['noteVersionId', 'annotationId']) {
    assert.throws(() => new KnowledgeEvidence(valid({ [field]: 'ref' })), /Manual evidence cannot/);
    for (const value of [null, undefined, false, 0, '', NaN])
      assert.equal(new KnowledgeEvidence(valid({ [field]: value }))[field], value === undefined ? null : value);
  }
  for (const value of ['ref', 1, {}, [], Symbol('ref')]) {
    assert.equal(
      new KnowledgeEvidence(valid({ sourceType: 'noteVersion', noteVersionId: value })).noteVersionId,
      value
    );
    assert.equal(new KnowledgeEvidence(valid({ sourceType: 'annotation', annotationId: value })).annotationId, value);
  }
});

test('evidence dynamic Set.has preserves unknown enum values and short circuit order', () => {
  for (const value of [null, false, 0, '', {}, Symbol('enum')]) {
    const events = [];
    const row = withSetHas(
      (received, kind) => {
        events.push([kind, received]);
        return {};
      },
      () =>
        new KnowledgeEvidence(
          valid({ sourceType: value, relationType: value, status: value, applicabilityStatus: value })
        )
    );
    assert.equal(row.sourceType, value);
    assert.equal(row.relationType, value);
    assert.equal(row.status, value);
    assert.equal(row.applicabilityStatus, value);
    assert.deepEqual(events, [
      ['source', value],
      ['status', value],
      ['relation', value],
      ['applicability', value]
    ]);
  }
  const order = ['source', 'status', 'relation', 'applicability'];
  for (const kind of order) {
    const events = [];
    assert.throws(
      () =>
        withSetHas(
          (value, current) => {
            events.push(current);
            return current !== kind;
          },
          () => new KnowledgeEvidence(valid())
        ),
      /type or status/
    );
    assert.deepEqual(events, order.slice(0, order.indexOf(kind) + 1));
    const failure = {};
    assert.throws(
      () =>
        withSetHas(
          () => {
            throw failure;
          },
          () => new KnowledgeEvidence(valid())
        ),
      sameError(failure)
    );
  }
});

test('evidence quote coercion retains nullish default, exact failure and conversion order', () => {
  for (const [quoteText, expected] of [
    [undefined, ''],
    [null, ''],
    [false, 'false'],
    [0, '0'],
    [1n, '1'],
    [Symbol('quote'), 'Symbol(quote)'],
    [' text ', 'text'],
    [{ toString: () => ' object ' }, 'object']
  ])
    assert.equal(new KnowledgeEvidence(valid({ quoteText })).quoteText, expected);
  const events = [];
  const quoteText = {
    [Symbol.toPrimitive](hint) {
      events.push(['quote', hint]);
      return ' quote ';
    }
  };
  const heading = {
    [Symbol.toPrimitive](hint) {
      events.push(['heading', hint]);
      return ' heading ';
    }
  };
  const row = new KnowledgeEvidence(valid({ quoteText, headingPath: [heading] }));
  assert.equal(row.quoteText, 'quote');
  assert.deepEqual(row.headingPath, ['heading']);
  assert.deepEqual(events, [
    ['quote', 'string'],
    ['heading', 'string']
  ]);
  const failure = {};
  assert.throws(
    () =>
      new KnowledgeEvidence(
        valid({
          quoteText: {
            toString() {
              throw failure;
            }
          }
        })
      ),
    sameError(failure)
  );
});

test('evidence heading standard arrays preserve order, sparse omission and filter semantics', () => {
  const path = [' heading ', '', ' ', null, undefined, false, 0, 1n, Symbol('title')];
  const row = new KnowledgeEvidence(valid({ headingPath: path }));
  assert.deepEqual(row.headingPath, ['heading', 'null', 'undefined', 'false', '0', '1', 'Symbol(title)']);
  assert.notEqual(row.headingPath, path);
  const sparse = [];
  sparse.length = 4;
  sparse[2] = ' at two ';
  assert.deepEqual(new KnowledgeEvidence(valid({ headingPath: sparse })).headingPath, ['at two']);
  for (const value of [null, '', false, {}, new Set(), { map: () => [] }])
    assert.throws(() => new KnowledgeEvidence(valid({ headingPath: value })), /headingPath is invalid/);
});

test('evidence heading custom map and filter retain receivers, arbitrary returns and callback values', () => {
  for (const value of [undefined, null, false, 0, '', {}, Symbol('heading')]) {
    const events = [];
    const headings = [];
    const mapped = {
      filter(callback) {
        assert.equal(this, mapped);
        assert.equal(callback, Boolean);
        events.push('filter');
        return value;
      }
    };
    headings.map = function (callback) {
      assert.equal(this, headings);
      assert.equal(callback(' item '), 'item');
      assert.equal(callback(null), 'null');
      events.push('map');
      return mapped;
    };
    const row = new KnowledgeEvidence(valid({ headingPath: headings }));
    assert.equal(row.headingPath, value);
    assert.deepEqual(events, ['map', 'filter']);
  }
  for (const map of [undefined, null, false, 1, {}, () => null, () => ({ filter: null })]) {
    const headings = [];
    headings.map = map;
    assert.throws(() => new KnowledgeEvidence(valid({ headingPath: headings })), TypeError);
  }
});

test('evidence inherited native map preserves subclass filter through Array species', () => {
  const events = [];
  class HeadingArray extends Array {
    filter(predicate) {
      events.push([this instanceof HeadingArray, [...this], predicate]);
      return 42;
    }
  }
  const headings = new HeadingArray(' title ', '');
  const model = new KnowledgeEvidence(valid({ headingPath: headings }));
  assert.equal(model.headingPath, 42);
  assert.deepEqual(events, [[true, ['title', ''], Boolean]]);
  assert.deepEqual([...headings], [' title ', '']);
});

test('evidence runtime native String and prototype map/filter operations remain dynamic', () => {
  const nativeString = globalThis.String;
  const nativeMap = Array.prototype.map;
  const nativeFilter = Array.prototype.filter;
  const events = [];
  const headings = ['heading'];
  const output = {};
  globalThis.String = function (value) {
    events.push(['String', value]);
    return {
      trim() {
        events.push(['trim', value]);
        return value === 'quote' ? output : false;
      }
    };
  };
  let row;
  try {
    row = new KnowledgeEvidence(valid({ quoteText: 'quote', headingPath: headings }));
  } finally {
    globalThis.String = nativeString;
  }
  assert.equal(row.quoteText, output);
  assert.deepEqual(row.headingPath, []);
  assert.deepEqual(events, [
    ['String', 'quote'],
    ['trim', 'quote'],
    ['String', 'heading'],
    ['trim', 'heading']
  ]);
  const mapped = [];
  Array.prototype.map = function (callback) {
    if (this !== headings) return nativeMap.call(this, callback);
    assert.equal(callback(' h '), 'h');
    return mapped;
  };
  Array.prototype.filter = function (callback) {
    if (this !== mapped) return nativeFilter.call(this, callback);
    assert.equal(callback, Boolean);
    return output;
  };
  try {
    row = new KnowledgeEvidence(valid({ headingPath: headings }));
  } finally {
    Array.prototype.map = nativeMap;
    Array.prototype.filter = nativeFilter;
  }
  assert.equal(row.headingPath, output);
});

test('evidence overridden heading map/filter getters preserve thrown identity and evaluation order', () => {
  for (const failAt of ['map:get', 'map:call', 'filter:get', 'filter:call']) {
    const events = [];
    const failure = {};
    const hit = label => {
      events.push(label);
      if (label === failAt) throw failure;
    };
    const mapped = {
      get filter() {
        hit('filter:get');
        return function () {
          assert.equal(this, mapped);
          hit('filter:call');
        };
      }
    };
    const headings = [];
    Object.defineProperty(headings, 'map', {
      get() {
        hit('map:get');
        return function () {
          assert.equal(this, headings);
          hit('map:call');
          return mapped;
        };
      }
    });
    assert.throws(() => new KnowledgeEvidence(valid({ headingPath: headings })), sameError(failure));
    assert.deepEqual(
      events,
      ['map:get', 'map:call', 'filter:get', 'filter:call'].slice(
        0,
        ['map:get', 'map:call', 'filter:get', 'filter:call'].indexOf(failAt) + 1
      )
    );
  }
});

test('evidence timestamps and source identifiers preserve arbitrary values with linked undefined defaults', () => {
  for (const value of [null, false, 0, NaN, 1n, Symbol('time'), {}, []]) {
    const row = new KnowledgeEvidence(
      valid({ createdAt: value, updatedAt: undefined, sourceId: value, noteId: value })
    );
    assert.equal(row.createdAt, value);
    assert.equal(row.updatedAt, value);
    assert.equal(row.sourceId, value);
    assert.equal(row.noteId, value);
    assert.equal(new KnowledgeEvidence(valid({ updatedAt: value })).updatedAt, value);
  }
  const before = Date.now();
  const row = new KnowledgeEvidence({ id: 'evidence', knowledgeItemId: 'item' });
  assert.equal(row.updatedAt, row.createdAt);
  assert.ok(Date.parse(row.createdAt) >= before);
  assert.ok(Date.parse(row.createdAt) <= Date.now());
});

test('evidence destructuring reads inherited fields exactly once in declared order', () => {
  const fields = [
    'id',
    'knowledgeItemId',
    'sourceType',
    'sourceId',
    'noteId',
    'noteVersionId',
    'annotationId',
    'quoteText',
    'headingPath',
    'relationType',
    'status',
    'applicabilityStatus',
    'createdAt',
    'updatedAt'
  ];
  const events = [];
  const row = new KnowledgeEvidence(trace(Object.create(valid({ quoteText: ' text ', updatedAt: stamp })), events));
  assert.equal(row.quoteText, 'text');
  assert.deepEqual(events, fields);
  for (const failAt of fields) {
    const failure = {};
    const seen = [];
    const input = new Proxy(valid(), {
      get(target, key) {
        seen.push(key);
        if (key === failAt) throw failure;
        return target[key];
      }
    });
    assert.throws(() => new KnowledgeEvidence(input), sameError(failure));
    assert.deepEqual(seen, fields.slice(0, fields.indexOf(failAt) + 1));
  }
});

test('evidence repository empty initialization and original-array identity stay compatible', () => {
  const records = [];
  const options = { records };
  const repo = createRepository(options);
  const first = new KnowledgeEvidence(valid());
  assert.equal(repo.create(first), first);
  assert.equal(records[0], first);
  assert.equal(repo.findById(first.id), first);
  options.records = [];
  const replacement = { id: first.id, knowledgeItemId: 'item', extra: {} };
  assert.equal(repo.save(replacement), replacement);
  assert.equal(records[0], replacement);
  assert.deepEqual(options.records, []);
  const listed = repo.list();
  assert.notEqual(listed, records);
  assert.equal(listed[0], replacement);
  assert.deepEqual(repo.deleteByKnowledgeItemId('item'), [replacement]);
  assert.deepEqual(records, []);
  assert.equal(repo.findById(first.id), null);
  for (const config of [undefined, {}, { records: undefined }, { records: null }])
    assert.deepEqual(createRepository(config).list(), []);
  assert.throws(() => createRepository(null), TypeError);
});

test('evidence repository create and save use strict first matching identities and no cloning', () => {
  for (const id of [undefined, null, false, 0, '', Symbol('id'), {}]) {
    const row = { id, knowledgeItemId: 'item' };
    let calls = 0;
    const records = [row];
    const repo = createRepository({ records, onChange: () => calls++ });
    assert.equal(repo.findById(id), row);
    assert.throws(() => repo.create({ id, knowledgeItemId: 'item' }), appError('KNOWLEDGE_EVIDENCE_ID_CONFLICT'));
    assert.equal(calls, 0);
    const next = { id, knowledgeItemId: 'item' };
    assert.equal(repo.save(next), next);
    assert.equal(records[0], next);
    assert.equal(calls, 1);
  }
  const first = { id: 'same', knowledgeItemId: 'a' };
  const second = { id: 'same', knowledgeItemId: 'b' };
  const replacement = { id: 'same', knowledgeItemId: 'c' };
  const records = [first, second];
  const repo = createRepository({ records });
  repo.save(replacement);
  assert.deepEqual(records, [replacement, second]);
  assert.equal(repo.findById('same'), replacement);
});

test('evidence repository dynamic callbacks retain options receiver and mutation before errors', () => {
  for (const operation of ['create', 'save-new', 'save-existing', 'delete', 'mark']) {
    const first = { id: 'evidence', knowledgeItemId: 'item', noteId: 'note', status: 'valid' };
    const records = operation === 'create' || operation === 'save-new' ? [] : [first];
    const options = { records };
    const repo = createRepository(options);
    const failure = {};
    const next = { id: 'evidence', knowledgeItemId: 'item' };
    let calls = 0;
    Object.defineProperty(options, 'onChange', {
      configurable: true,
      get() {
        calls++;
        return function (rows) {
          assert.equal(this, options);
          assert.equal(rows, records);
          throw failure;
        };
      }
    });
    assert.throws(
      () =>
        operation === 'create'
          ? repo.create(next)
          : operation.startsWith('save')
            ? repo.save(next)
            : operation === 'delete'
              ? repo.deleteByKnowledgeItemId('item')
              : repo.markByNoteId('note', 'invalid'),
      sameError(failure)
    );
    assert.equal(calls, 1);
    if (operation === 'delete') assert.deepEqual(records, []);
    else if (operation === 'mark') {
      assert.equal(records[0], first);
      assert.equal(first.status, 'invalid');
      assert.equal(typeof first.updatedAt, 'string');
    } else assert.equal(records[0], next);
    Object.defineProperty(options, 'onChange', { configurable: true, writable: true, value: null });
    repo.save(next);
    options.onChange = function () {
      assert.equal(this, options);
      calls++;
    };
    repo.save(next);
    assert.equal(calls, 2);
  }
});

test('evidence repository absent and unchanged operations do not call callbacks', () => {
  let calls = 0;
  const rows = [{ id: 'same', knowledgeItemId: 'item', noteId: 'note', status: 'invalid', updatedAt: stamp }];
  const repo = createRepository({ records: rows, onChange: () => calls++ });
  assert.equal(repo.findById('missing'), null);
  assert.deepEqual(repo.deleteByKnowledgeItemId('missing'), []);
  assert.deepEqual(repo.markByNoteId('missing', 'valid'), []);
  assert.deepEqual(repo.markByNoteId('note', 'invalid'), []);
  assert.deepEqual(repo.markByNoteId('note', 'stale'), []);
  assert.equal(rows[0].updatedAt, stamp);
  assert.equal(calls, 0);
});

test('evidence repository list truthy filters remain strict and short circuit in field order', () => {
  const records = [
    { id: 'all', knowledgeItemId: 'item', noteId: 'note', noteVersionId: 'version', annotationId: 'annotation' },
    { id: 'none', knowledgeItemId: 'other' },
    { id: 'null', knowledgeItemId: null, noteId: null, noteVersionId: null, annotationId: null }
  ];
  const repo = createRepository({ records });
  for (const [key, value] of Object.entries({
    knowledgeItemId: 'item',
    noteId: 'note',
    noteVersionId: 'version',
    annotationId: 'annotation'
  })) {
    assert.deepEqual(ids(repo.list({ [key]: value })), ['all']);
    for (const falsy of [undefined, null, false, 0, '', NaN])
      assert.deepEqual(ids(repo.list({ [key]: falsy })), ['all', 'none', 'null']);
    assert.deepEqual(repo.list({ [key]: {} }), []);
  }
  const events = [];
  const row = trace(records[0], events);
  assert.deepEqual(
    createRepository({ records: [row] }).list({
      knowledgeItemId: 'wrong',
      noteId: 'note',
      noteVersionId: 'version',
      annotationId: 'annotation'
    }),
    []
  );
  assert.deepEqual(events, ['knowledgeItemId']);
  events.length = 0;
  createRepository({ records: [row] }).list(
    trace({ knowledgeItemId: 'item', noteId: 'note', noteVersionId: 'version', annotationId: 'annotation' }, events)
  );
  assert.deepEqual(events, [
    'knowledgeItemId',
    'noteId',
    'noteVersionId',
    'annotationId',
    'knowledgeItemId',
    'noteId',
    'noteVersionId',
    'annotationId'
  ]);
  assert.throws(() => repo.list(null), TypeError);
});

test('evidence repository deletion returns original matches and splices by reference rather than duplicate id', () => {
  const a = { id: 'same', knowledgeItemId: 'item' };
  const b = { id: 'same', knowledgeItemId: 'other' };
  const c = { id: 'last', knowledgeItemId: 'item' };
  const records = [a, b, a, c];
  let calls = 0;
  const repo = createRepository({ records, onChange: () => calls++ });
  const deleted = repo.deleteByKnowledgeItemId('item');
  assert.deepEqual(deleted, [a, a, c]);
  assert.deepEqual(records, [b]);
  assert.equal(calls, 1);
  assert.notEqual(deleted, records);
  assert.equal(deleted[0], a);
  assert.equal(deleted[2], c);
});

test('evidence mark methods retain original references, extras, createdAt and every unmodified field', () => {
  for (const method of ['markByNoteId', 'markByAnnotationId', 'markByNoteVersionId', 'markByNoteVersionIds']) {
    const extra = {};
    const row = {
      ...new KnowledgeEvidence(
        valid({ sourceType: 'annotation', annotationId: 'target', noteId: 'target', noteVersionId: 'target' })
      ),
      extra
    };
    const records = [row];
    let calls = 0;
    const repo = createRepository({ records, onChange: () => calls++ });
    const changed = repo[method](method.endsWith('Ids') ? ['target'] : 'target', 'stale');
    assert.deepEqual(changed, [row]);
    assert.equal(changed[0], row);
    assert.equal(records[0], row);
    assert.equal(row.status, 'stale');
    assert.equal(typeof row.updatedAt, 'string');
    assert.equal(row.createdAt, stamp);
    assert.equal(row.extra, extra);
    assert.equal(row.applicabilityStatus, 'active');
    assert.equal(calls, 1);
    assert.deepEqual(repo[method](method.endsWith('Ids') ? ['target'] : 'target', 'stale'), []);
    assert.equal(calls, 1);
  }
});

test('evidence marks protect invalid only from stale and preserve unvalidated runtime status values', () => {
  for (const previous of [undefined, null, 'valid', 'stale', 'invalid', 'insufficient', {}, 1])
    for (const next of [
      undefined,
      null,
      false,
      0,
      '',
      'valid',
      'stale',
      'invalid',
      'insufficient',
      {},
      Symbol('status')
    ]) {
      const row = { id: 'evidence', knowledgeItemId: 'item', noteId: 'note', status: previous, updatedAt: stamp };
      const changed = createRepository({ records: [row] }).markByNoteId('note', next);
      const skipped = previous === next || (next === 'stale' && previous === 'invalid');
      assert.deepEqual(changed, skipped ? [] : [row]);
      assert.equal(row.status, skipped ? previous : next);
      assert.equal(typeof row.updatedAt, 'string');
      if (skipped) assert.equal(row.updatedAt, stamp);
    }
});

test('evidence mark version filters use truthiness and Set SameValueZero without coercion', () => {
  for (const sourceType of [undefined, null, false, 0, '', 'annotation', 'noteVersion', {}]) {
    const a = { id: 'a', knowledgeItemId: 'item', noteVersionId: 'version', sourceType: 'annotation' };
    const b = { id: 'b', knowledgeItemId: 'item', noteVersionId: 'version', sourceType: 'noteVersion' };
    const repo = createRepository({ records: [a, b] });
    assert.deepEqual(
      ids(repo.markByNoteVersionId('version', 'valid', sourceType)),
      !sourceType ? ['a', 'b'] : sourceType === 'annotation' ? ['a'] : sourceType === 'noteVersion' ? ['b'] : []
    );
  }
  for (const value of [undefined, null, false, 0, '', NaN, {}, Symbol('version')]) {
    const row = { id: 'evidence', knowledgeItemId: 'item', noteVersionId: value };
    assert.deepEqual(createRepository({ records: [row] }).markByNoteVersionIds([value, value], 'valid'), [row]);
  }
  const row = { id: 'evidence', knowledgeItemId: 'item', noteVersionId: 'a' };
  assert.deepEqual(createRepository({ records: [row] }).markByNoteVersionIds('abc', 'valid'), [row]);
  assert.throws(() => createRepository().markByNoteVersionIds(1, 'valid'), TypeError);
});

test('evidence status writes and timestamp writes retain order and partial failure without persistence', () => {
  for (const failAt of ['status', 'updatedAt']) {
    const events = [];
    const failure = {};
    let status = 'valid';
    let updatedAt = stamp;
    let calls = 0;
    const row = {
      id: 'evidence',
      knowledgeItemId: 'item',
      noteId: 'note',
      get status() {
        events.push('status:get');
        return status;
      },
      set status(value) {
        events.push('status:set');
        if (failAt === 'status') throw failure;
        status = value;
      },
      get updatedAt() {
        return updatedAt;
      },
      set updatedAt(value) {
        events.push('updatedAt:set');
        if (failAt === 'updatedAt') throw failure;
        updatedAt = value;
      }
    };
    assert.throws(
      () => createRepository({ records: [row], onChange: () => calls++ }).markByNoteId('note', 'invalid'),
      sameError(failure)
    );
    assert.deepEqual(
      events,
      failAt === 'status' ? ['status:get', 'status:set'] : ['status:get', 'status:set', 'updatedAt:set']
    );
    assert.equal(status, failAt === 'status' ? 'valid' : 'invalid');
    assert.equal(updatedAt, stamp);
    assert.equal(calls, 0);
  }
  const first = { id: 'first', knowledgeItemId: 'item', noteId: 'note', status: 'valid' };
  const second = Object.freeze({ id: 'second', knowledgeItemId: 'item', noteId: 'note', status: 'valid' });
  let calls = 0;
  assert.throws(
    () => createRepository({ records: [first, second], onChange: () => calls++ }).markByNoteId('note', 'invalid'),
    TypeError
  );
  assert.equal(first.status, 'invalid');
  assert.equal(typeof first.updatedAt, 'string');
  assert.equal(second.status, 'valid');
  assert.equal(calls, 0);
});

test('evidence marks reread status only for stale protection and preserve predicate getter failures', () => {
  const events = [];
  let reads = 0;
  const row = {
    id: 'evidence',
    knowledgeItemId: 'item',
    get noteId() {
      events.push('note');
      return 'note';
    },
    get status() {
      events.push('status');
      return ++reads === 1 ? 'valid' : 'invalid';
    }
  };
  assert.deepEqual(createRepository({ records: [row] }).markByNoteId('note', 'stale'), []);
  assert.deepEqual(events, ['note', 'status', 'status']);
  const failure = {};
  let calls = 0;
  const first = { id: 'first', knowledgeItemId: 'item', noteId: 'note' };
  const second = {
    id: 'second',
    knowledgeItemId: 'item',
    get noteId() {
      throw failure;
    }
  };
  assert.throws(
    () => createRepository({ records: [first, second], onChange: () => calls++ }).markByNoteId('note', 'invalid'),
    sameError(failure)
  );
  assert.equal(first.status, 'invalid');
  assert.equal(calls, 0);
});

test('evidence model reconstruction drops extras while direct repository writes replace complete records', () => {
  const extra = {};
  const original = { ...new KnowledgeEvidence(valid()), extra };
  const records = [original];
  const repo = createRepository({ records });
  const rebuilt = new KnowledgeEvidence({ ...original, quoteText: ' replacement ' });
  assert.equal(Object.hasOwn(rebuilt, 'extra'), false);
  assert.equal(repo.save(rebuilt), rebuilt);
  assert.equal(records[0], rebuilt);
  assert.equal(original.extra, extra);
  const direct = { id: 'evidence', knowledgeItemId: 'item', extra };
  repo.save(direct);
  assert.equal(repo.findById('evidence').extra, extra);
  const replacement = { id: 'evidence', knowledgeItemId: 'item' };
  repo.save(replacement);
  assert.equal(records[0], replacement);
  assert.equal(Object.hasOwn(repo.list()[0], 'extra'), false);
});

function serviceFixture(factory, asynchronous, dependencies = {}) {
  const records = [];
  const events = [];
  const memory = createRepository({ records });
  const evidenceRepository = Object.fromEntries(
    Object.entries(memory).map(([name, operation]) => [
      name,
      (...args) => {
        events.push([name, ...args]);
        return asynchronous ? Promise.resolve().then(() => operation(...args)) : operation(...args);
      }
    ])
  );
  const itemMemory = createInMemoryKnowledgeItemRepository({
    records: [new KnowledgeItem({ id: 'item', createdAt: stamp })]
  });
  const repository = asynchronous
    ? Object.fromEntries(
        Object.entries(itemMemory).map(([name, operation]) => [
          name,
          (...args) => Promise.resolve().then(() => operation(...args))
        ])
      )
    : itemMemory;
  const service = factory({
    repository,
    evidenceRepository,
    runTransaction: operation => operation(),
    ...dependencies
  });
  return { service, repository, evidenceRepository, records, events };
}

for (const [name, factory, asynchronous] of [
  ['sync', createKnowledgeItemService, false],
  ['postgres async', createAsyncKnowledgeItemService, true],
  ['async mixed sync ports', createAsyncKnowledgeItemService, false]
]) {
  test(`evidence actual ${name} create/list uses the selected model and actual in-memory repository`, async () => {
    const { service, records, evidenceRepository } = serviceFixture(factory, asynchronous);
    const created = await service.createEvidence({
      id: ' evidence ',
      knowledgeItemId: 'item',
      quoteText: ' quote ',
      headingPath: [' heading ', ''],
      sourceType: 'manual'
    });
    assert.equal(created instanceof KnowledgeEvidence, true);
    assert.equal(created.id, 'evidence');
    assert.equal(created.quoteText, 'quote');
    assert.deepEqual(created.headingPath, ['heading']);
    assert.equal(records[0], created);
    assert.equal(await evidenceRepository.findById('evidence'), created);
    const listed = await service.listEvidence('item');
    assert.equal(listed.length, 1);
    assert.notEqual(listed[0], created);
    assert.equal(listed[0].sourceAnnotationRemoved, false);
    assert.equal(listed[0].quoteText, 'quote');
    await assert.rejects(
      async () => service.createEvidence({ id: 'evidence', knowledgeItemId: 'item' }),
      appError('KNOWLEDGE_EVIDENCE_ID_CONFLICT')
    );
  });
  test(`evidence actual ${name} annotation revision is checked before model creation and not persisted as evidence`, async () => {
    const annotation = {
      id: 'annotation',
      noteId: 'note',
      noteVersionId: 'version',
      lifecycleStatus: 'active',
      anchorStatus: 'resolved',
      revision: 7,
      quoteText: ' actual quote ',
      headingPath: [' actual heading ']
    };
    const version = { id: 'version', noteId: 'note', content: 'actual quote' };
    const result = value => (asynchronous ? Promise.resolve(value) : value);
    const { service, records } = serviceFixture(factory, asynchronous, {
      annotationRepository: { findById: id => result(id === 'annotation' ? annotation : null) },
      noteVersionRepository: { findById: id => result(id === 'version' ? version : null) }
    });
    const input = {
      id: 'evidence',
      knowledgeItemId: 'item',
      sourceType: 'annotation',
      annotationId: 'annotation',
      expectedAnnotationRevision: 6,
      quoteText: 'ignored',
      headingPath: ['ignored']
    };
    await assert.rejects(async () => service.createEvidence(input), appError('KNOWLEDGE_EVIDENCE_REVISION_CONFLICT'));
    assert.deepEqual(records, []);
    const created = await service.createEvidence({ ...input, expectedAnnotationRevision: 7 });
    assert.equal(created instanceof KnowledgeEvidence, true);
    assert.equal(created.quoteText, 'actual quote');
    assert.deepEqual(created.headingPath, ['actual heading']);
    assert.equal(created.sourceId, 'annotation');
    assert.equal(created.noteId, 'note');
    assert.equal(created.noteVersionId, 'version');
    assert.equal(Object.hasOwn(created, 'revision'), false);
    assert.equal(Object.hasOwn(created, 'expectedAnnotationRevision'), false);
    assert.equal(records[0], created);
  });
  test(`evidence actual ${name} retirement and readoption rebuild and lose seeded extras`, async () => {
    const { service, records, evidenceRepository } = serviceFixture(factory, asynchronous);
    const extra = {};
    const original = { ...new KnowledgeEvidence(valid()), extra };
    await evidenceRepository.save(original);
    assert.equal((await service.listEvidence('item'))[0].extra, extra);
    const retired = await service.retireEvidence('item', 'evidence', { expectedUpdatedAt: stamp });
    assert.equal(retired.evidence instanceof KnowledgeEvidence, true);
    assert.equal(retired.evidence.applicabilityStatus, 'withdrawn');
    assert.equal(Object.hasOwn(retired.evidence, 'extra'), false);
    assert.equal(records[0], retired.evidence);
    assert.equal(original.extra, extra);
    const unchanged = await service.retireEvidence('item', 'evidence', {
      expectedUpdatedAt: retired.evidence.updatedAt
    });
    assert.equal(unchanged.evidence, retired.evidence);
    const seeded = { ...retired.evidence, extra };
    await evidenceRepository.save(seeded);
    const readopted = await service.readoptEvidence('item', 'evidence', { expectedUpdatedAt: seeded.updatedAt });
    assert.equal(readopted.evidence instanceof KnowledgeEvidence, true);
    assert.equal(readopted.evidence.applicabilityStatus, 'active');
    assert.equal(Object.hasOwn(readopted.evidence, 'extra'), false);
    assert.equal(records[0], readopted.evidence);
    assert.equal(seeded.extra, extra);
  });
  test(`evidence actual ${name} service rejects stale revision before replacement and preserves in-place marking`, async () => {
    const { service, records, evidenceRepository } = serviceFixture(factory, asynchronous);
    const extra = {};
    const original = { ...new KnowledgeEvidence(valid({ noteId: 'note' })), extra };
    await evidenceRepository.save(original);
    await assert.rejects(
      async () => service.retireEvidence('item', 'evidence', { expectedUpdatedAt: 'wrong' }),
      appError('KNOWLEDGE_EVIDENCE_UPDATE_CONFLICT')
    );
    assert.equal(records[0], original);
    const changed = await service.markEvidenceByNoteId('note', 'stale');
    assert.equal(changed[0], original);
    assert.equal(records[0], original);
    assert.equal(original.status, 'stale');
    assert.equal(original.extra, extra);
    await assert.rejects(
      async () => service.readoptEvidence('item', 'evidence'),
      appError('KNOWLEDGE_EVIDENCE_NOT_VERIFIABLE')
    );
    assert.equal(records[0], original);
  });
}

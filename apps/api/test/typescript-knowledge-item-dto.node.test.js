import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import { createInMemoryKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.js';
import { createInMemoryKnowledgeEvidenceRepository } from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.js';
import { createPostgresKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/postgres/knowledge-item-repository.js';
import { createPostgresKnowledgeEvidenceRepository } from '../src/modules/knowledge/infrastructure/postgres/knowledge-evidence-repository.js';

const baseline = process.env.KNOWRA_KNOWLEDGE_DTO_BASELINE === '1';
// 冻结父版本：DTO 为旧 JS；两个模型已包含批次 32/33 的边界修正。
const commit = 'e1c3e92759e876534f387edbb94c4911211ce71c';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const dtoFile = new URL('application/dto/knowledge-item.dto.js', root);
const itemFile = new URL('domain/knowledge-item.js', root);
const evidenceFile = new URL('domain/knowledge-evidence.js', root);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const absoluteImports = (source, location, replacements = new Map()) =>
  source.replace(/(from\s+)(['"])([^'"]+)\2/g, (_, prefix, quote, path) => {
    const target = path.startsWith('.') ? new URL(path, location).href : import.meta.resolve(path);
    return `${prefix}${JSON.stringify(replacements.get(target) || target)}`;
  });
const original = path =>
  execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/${path}`], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8'
  });
const dtoUrl = baseline
  ? dataUrl(absoluteImports(original('application/dto/knowledge-item.dto.js'), dtoFile))
  : dtoFile.href;
const itemUrl = baseline ? dataUrl(stripTypeScriptTypes(original('domain/knowledge-item.ts'))) : itemFile.href;
const evidenceUrl = baseline
  ? dataUrl(stripTypeScriptTypes(original('domain/knowledge-evidence.ts')))
  : evidenceFile.href;
const { KnowledgeItem } = await import(itemUrl);
const { KnowledgeEvidence } = await import(evidenceUrl);
const {
  buildCreateKnowledgeItemDto: create,
  buildUpdateKnowledgeItemDto: update,
  buildCreateKnowledgeEvidenceDto: evidence
} = await import(dtoUrl);
const loadService = async path => {
  const location = new URL(path, root);
  return import(
    dataUrl(
      absoluteImports(
        readFileSync(location, 'utf8'),
        location,
        new Map([
          [dtoFile.href, dtoUrl],
          [itemFile.href, itemUrl],
          [evidenceFile.href, evidenceUrl]
        ])
      )
    )
  );
};
const { createKnowledgeItemService } = await loadService('application/knowledge-item-service.js');
const { createAsyncKnowledgeItemService } = await loadService('application/postgres-async/knowledge-domain-service.js');
const valid = () => ({ id: ' item-id ' });
const evidenceValid = () => ({ id: ' evidence-id ' });
const types = ['concept', 'fact', 'principle', 'process', 'algorithm', 'formula', 'comparison', 'application'];
const modes = ['manual', 'annotation', 'selection', 'ai'];
const sourceTypes = ['noteVersion', 'annotation', 'manual'];
const matchesError = (code, message) => error =>
  error instanceof AppError && error.code === code && error.statusCode === 422 && error.message === message;
const invalid = (operation, code, message) => assert.throws(operation, matchesError(code, message));
const itemErrors = {
  title: ['KNOWLEDGE_ITEM_TITLE_INVALID', 'KnowledgeItem title is invalid'],
  canonicalStatement: ['KNOWLEDGE_ITEM_STATEMENT_INVALID', 'KnowledgeItem canonicalStatement is invalid'],
  userExplanation: ['KNOWLEDGE_ITEM_EXPLANATION_INVALID', 'KnowledgeItem userExplanation is invalid'],
  knowledgeType: ['KNOWLEDGE_ITEM_TYPE_INVALID', 'KnowledgeItem knowledgeType is invalid'],
  sourceMode: ['KNOWLEDGE_ITEM_SOURCE_MODE_INVALID', 'KnowledgeItem sourceMode is invalid'],
  importance: ['KNOWLEDGE_ITEM_IMPORTANCE_INVALID', 'KnowledgeItem importance is invalid'],
  id: ['KNOWLEDGE_ITEM_ID_INVALID', 'KnowledgeItem id is invalid']
};
const evidenceErrors = {
  sourceType: ['KNOWLEDGE_EVIDENCE_SOURCE_TYPE_INVALID', 'KnowledgeEvidence sourceType is invalid'],
  sourceId: ['KNOWLEDGE_EVIDENCE_SOURCE_ID_INVALID', 'KnowledgeEvidence sourceId is invalid'],
  noteId: ['KNOWLEDGE_EVIDENCE_NOTE_ID_INVALID', 'KnowledgeEvidence noteId is invalid'],
  noteVersionId: ['KNOWLEDGE_EVIDENCE_VERSION_ID_INVALID', 'KnowledgeEvidence noteVersionId is invalid'],
  annotationId: ['KNOWLEDGE_EVIDENCE_ANNOTATION_ID_INVALID', 'KnowledgeEvidence annotationId is invalid'],
  expectedAnnotationRevision: ['KNOWLEDGE_EVIDENCE_REVISION_INVALID', '标注来源修订号无效，请重新加载标注。'],
  id: ['KNOWLEDGE_EVIDENCE_ID_INVALID', 'KnowledgeEvidence id is invalid']
};
const traced = (input, events) =>
  new Proxy(input, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });
const sequence = (field, values, input = {}) => {
  let count = 0;
  return {
    input: Object.defineProperty(input, field, { get: () => values[count++] }),
    count: () => count
  };
};
const withPatch = (object, key, value, operation) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  try {
    return operation();
  } finally {
    Object.defineProperty(object, key, descriptor);
  }
};
const withUuid = operation => {
  const old = crypto.randomUUID;
  const events = [];
  crypto.randomUUID = () => {
    events.push('uuid');
    return 'fixed-uuid';
  };
  syncBuiltinESMExports();
  try {
    return operation(events);
  } finally {
    crypto.randomUUID = old;
    syncBuiltinESMExports();
  }
};
const withHas = (replacement, operation) => {
  const nativeHas = Set.prototype.has;
  return withPatch(
    Set.prototype,
    'has',
    function (value) {
      if (nativeHas.call(this, 'concept') || nativeHas.call(this, 'manual')) return replacement.call(this, value);
      return nativeHas.call(this, value);
    },
    operation
  );
};

test('knowledge DTO JS bridge preserves exact TS export identity', { skip: baseline }, async () => {
  const js = await import(dtoFile);
  const ts = await import(new URL('application/dto/knowledge-item.dto.ts', root));
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('knowledge create defaults, explicit nulls, trimmed text and property order remain exact', () => {
  const expected = {
    id: 'item-id',
    title: '',
    canonicalStatement: '',
    userExplanation: '',
    knowledgeType: 'concept',
    importance: null,
    sourceMode: 'manual',
    createdAt: undefined,
    updatedAt: undefined
  };
  assert.deepEqual(create(valid()), expected);
  assert.deepEqual(Object.keys(create(valid())), Object.keys(expected));
  assert.deepEqual(
    create({
      ...valid(),
      title: null,
      canonicalStatement: null,
      userExplanation: null,
      knowledgeType: null,
      sourceMode: null,
      importance: null
    }),
    expected
  );
  assert.deepEqual(
    create({
      ...valid(),
      title: ' 标题 ',
      canonicalStatement: ' statement\n ',
      userExplanation: ' why ',
      knowledgeType: 'fact',
      importance: ' 2.5 ',
      sourceMode: 'ai',
      createdAt: null,
      updatedAt: 7
    }),
    {
      ...expected,
      title: '标题',
      canonicalStatement: 'statement',
      userExplanation: 'why',
      knowledgeType: 'fact',
      importance: 2.5,
      sourceMode: 'ai',
      createdAt: null,
      updatedAt: 7
    }
  );
});

test('knowledge evidence defaults, property order and ignored fields remain exact', () => {
  const expected = {
    expectedAnnotationRevision: undefined,
    id: 'evidence-id',
    sourceType: 'manual',
    sourceId: null,
    noteId: null,
    noteVersionId: null,
    annotationId: null,
    quoteText: '',
    headingPath: [],
    relationType: 'supports'
  };
  assert.deepEqual(evidence(evidenceValid()), expected);
  assert.deepEqual(Object.keys(evidence(evidenceValid())), Object.keys(expected));
  const input = {
    ...evidenceValid(),
    sourceType: null,
    sourceId: '  ',
    noteId: null,
    noteVersionId: null,
    annotationId: undefined,
    quoteText: null,
    headingPath: null,
    relationType: null
  };
  for (const key of ['knowledgeItemId', 'createdAt', 'updatedAt', 'status', 'applicabilityStatus'])
    Object.defineProperty(input, key, {
      get() {
        throw new Error(`unexpected ${key}`);
      }
    });
  assert.deepEqual(evidence(input), expected);
});

test('knowledge updates omit undefined and read no create-only fields', () => {
  const input = {};
  for (const key of ['id', 'createdAt', 'updatedAt', 'reviewStatus', 'deletedAt', 'evidence'])
    Object.defineProperty(input, key, {
      get() {
        throw new Error(`unexpected ${key}`);
      }
    });
  assert.deepEqual(update(input), {});
  assert.deepEqual(update({ title: undefined, importance: undefined, sourceMode: undefined }), {});
  assert.deepEqual(update({ title: ' ', canonicalStatement: ' x ', userExplanation: '', importance: null }), {
    title: '',
    canonicalStatement: 'x',
    userExplanation: '',
    importance: null
  });
});

test('knowledge optional text errors retain shared AppError identity and field-specific create codes', () => {
  for (const field of ['title', 'canonicalStatement', 'userExplanation']) {
    for (const value of [false, 0, 1n, Symbol(field), {}, [], new String('x')]) {
      invalid(() => create({ ...valid(), [field]: value }), ...itemErrors[field]);
      invalid(() => update({ [field]: value }), 'KNOWLEDGE_ITEM_TEXT_INVALID', `KnowledgeItem ${field} is invalid`);
    }
    invalid(() => update({ [field]: null }), 'KNOWLEDGE_ITEM_TEXT_INVALID', `KnowledgeItem ${field} is invalid`);
  }
  for (const field of ['sourceId', 'noteId', 'noteVersionId', 'annotationId'])
    for (const value of [false, 0, 1n, Symbol(field), {}, [], new String('x')])
      invalid(() => evidence({ ...evidenceValid(), [field]: value }), ...evidenceErrors[field]);
});

test('knowledge enum membership is exact and create nullish defaults do not affect updates', () => {
  for (const [field, values] of [
    ['knowledgeType', types],
    ['sourceMode', modes]
  ]) {
    for (const value of values) {
      assert.equal(create({ ...valid(), [field]: value })[field], value);
      assert.equal(update({ [field]: value })[field], value);
      invalid(() => update({ [field]: ` ${value} ` }), ...itemErrors[field]);
      invalid(() => update({ [field]: value.toUpperCase() }), ...itemErrors[field]);
    }
    for (const value of [null, '', false, {}, 1n, Symbol(field)])
      invalid(() => update({ [field]: value }), ...itemErrors[field]);
  }
  for (const sourceType of sourceTypes)
    assert.equal(
      evidence({
        ...evidenceValid(),
        sourceType,
        ...(sourceType === 'noteVersion'
          ? { noteVersionId: 'v' }
          : sourceType === 'annotation'
            ? { annotationId: 'a' }
            : {})
      }).sourceType,
      sourceType
    );
});

test('knowledge source requirements precede revision and identity checks', () => {
  for (const [input, code, message] of [
    [
      { sourceType: 'noteVersion' },
      'KNOWLEDGE_EVIDENCE_VERSION_REQUIRED',
      'NoteVersion evidence requires noteVersionId'
    ],
    [
      { sourceType: 'annotation' },
      'KNOWLEDGE_EVIDENCE_ANNOTATION_REQUIRED',
      'Annotation evidence requires annotationId'
    ],
    [
      { noteVersionId: 'v' },
      'KNOWLEDGE_EVIDENCE_MANUAL_SOURCE_INVALID',
      'Manual evidence cannot reference a NoteVersion or annotation'
    ],
    [
      { annotationId: 'a' },
      'KNOWLEDGE_EVIDENCE_MANUAL_SOURCE_INVALID',
      'Manual evidence cannot reference a NoteVersion or annotation'
    ]
  ])
    invalid(() => evidence({ ...input, id: false, expectedAnnotationRevision: 0 }), code, message);
  assert.equal(evidence({ ...evidenceValid(), sourceType: 'annotation', annotationId: ' a ' }).annotationId, 'a');
  for (const value of [null, 0, -1, 1.5, '1', 1n, Infinity, NaN, Symbol('revision'), new Number(1), {}])
    invalid(
      () => evidence({ ...evidenceValid(), expectedAnnotationRevision: value }),
      ...evidenceErrors.expectedAnnotationRevision
    );
  assert.equal(
    evidence({ ...evidenceValid(), expectedAnnotationRevision: Number.MAX_SAFE_INTEGER + 1 })
      .expectedAnnotationRevision,
    Number.MAX_SAFE_INTEGER + 1
  );
});

test('knowledge primitives box naturally, inherited fields work, null inputs throw native errors', () => {
  for (const input of [undefined, false, true, 0, NaN, 7n, Symbol('input'), 'text', [], () => {}]) {
    assert.equal(create(input).title, '');
    assert.deepEqual(update(input), {});
    assert.equal(evidence(input).sourceType, 'manual');
  }
  for (const operation of [create, update, evidence]) assert.throws(() => operation(null), TypeError);
  assert.equal(create(Object.create({ ...valid(), title: ' inherited ' })).title, 'inherited');
  assert.deepEqual(update(Object.create({ title: ' inherited ' })), { title: 'inherited' });
  assert.equal(evidence(Object.create({ ...evidenceValid(), quoteText: ' inherited ' })).quoteText, 'inherited');
});

test('knowledge create property reads, importance rereads and UUID timing are observable', () =>
  withUuid(uuidEvents => {
    const events = [];
    create(traced({ ...valid(), importance: 2 }, events));
    assert.deepEqual(events, [
      'title',
      'canonicalStatement',
      'knowledgeType',
      'sourceMode',
      'importance',
      'importance',
      'importance',
      'id',
      'id',
      'userExplanation',
      'importance',
      'importance',
      'importance',
      'createdAt',
      'updatedAt'
    ]);
    assert.deepEqual(uuidEvents, []);
    assert.equal(create({ title: ' Hello World ' }).id, 'knowledge-hello-world-fixed-uuid');
    assert.equal(create({}).id, 'knowledge-item-fixed-uuid');
    invalid(() => create({ title: false }), ...itemErrors.title);
    assert.equal(uuidEvents.length, 2);
    invalid(() => create({ userExplanation: false }), ...itemErrors.userExplanation);
    assert.equal(uuidEvents.length, 3);
    assert.equal(evidence({}).id, 'evidence-fixed-uuid');
    const changing = sequence('id', ['present', undefined], valid());
    invalid(() => create(changing.input), ...itemErrors.id);
    assert.equal(changing.count(), 2);
  }));

test('knowledge update repeats text and enum reads and does not cache importance', () => {
  const events = [];
  update(
    traced(
      {
        title: ' x ',
        canonicalStatement: ' y ',
        userExplanation: ' z ',
        knowledgeType: 'fact',
        importance: 1,
        sourceMode: 'ai'
      },
      events
    )
  );
  assert.deepEqual(events, [
    'title',
    'title',
    'title',
    'canonicalStatement',
    'canonicalStatement',
    'canonicalStatement',
    'userExplanation',
    'userExplanation',
    'userExplanation',
    'knowledgeType',
    'knowledgeType',
    'knowledgeType',
    'importance',
    'importance',
    'importance',
    'importance',
    'importance',
    'sourceMode',
    'sourceMode',
    'sourceMode'
  ]);
  for (const field of ['knowledgeType', 'sourceMode']) {
    const changing = sequence(field, ['present', field === 'knowledgeType' ? 'concept' : 'manual', undefined]);
    assert.deepEqual(update(changing.input), { [field]: undefined });
    assert.equal(changing.count(), 3);
  }
});

test('knowledge update third text read calls custom trim with its actual receiver and retains any return', () => {
  for (const field of ['title', 'canonicalStatement', 'userExplanation'])
    for (const value of [{ marker: true }, [], Symbol('trim'), 7n, false, 0, null, undefined, NaN, Infinity]) {
      const events = [];
      const third = {
        trim() {
          events.push(this);
          return value;
        }
      };
      const changing = sequence(field, ['present', 'string-for-type-check', third]);
      const result = update(changing.input);
      assert.equal(result[field], value);
      assert.deepEqual(events, [third]);
      assert.equal(changing.count(), 3);
    }
  for (const third of [null, undefined, 0, 1n, Symbol('value'), {}, { trim: 3 }]) {
    const changing = sequence('title', ['present', 'checked', third]);
    assert.throws(() => update(changing.input), TypeError);
  }
  const failure = {};
  const third = {
    trim() {
      throw failure;
    }
  };
  assert.throws(
    () => update(sequence('title', ['present', 'checked', third]).input),
    error => error === failure
  );
});

test('knowledge optional string trim preserves arbitrary returns and field-specific nullish fallback', () => {
  const originalTrim = String.prototype.trim;
  for (const value of [{ marker: true }, [], Symbol('trim'), 7n, false, 0, '', null, undefined, NaN]) {
    const result = withPatch(
      String.prototype,
      'trim',
      function () {
        return this === ' id ' ? originalTrim.call(this) : value;
      },
      () => ({
        item: create({ id: ' id ', title: 'title', canonicalStatement: 'canonical', userExplanation: 'explanation' }),
        source: evidence({ id: ' id ', sourceId: 'source', noteId: 'note', quoteText: 'quote' })
      })
    );
    for (const field of ['title', 'canonicalStatement', 'userExplanation'])
      assert.equal(result.item[field], value || '');
    assert.equal(result.source.sourceId, value || null);
    assert.equal(result.source.noteId, value || null);
    assert.equal(result.source.quoteText, value ?? '');
  }
});

test('knowledge Number coercion preserves bigint, negative zero, dates and native failures', () => {
  for (const [value, expected] of [
    [null, null],
    [false, 0],
    [true, 1],
    ['', 0],
    [' ', 0],
    [-0, -0],
    ['-0', -0],
    ['0x10', 16],
    [3n, 3],
    [9007199254740993n, 9007199254740992],
    [[], 0],
    [[4], 4],
    [new Date('1970-01-01T00:00:01Z'), 1000],
    [{ valueOf: () => 5 }, 5]
  ]) {
    assert.equal(create({ ...valid(), importance: value }).importance, expected);
    assert.equal(update({ importance: value }).importance, expected);
  }
  for (const value of [NaN, Infinity, -Infinity, 'invalid', {}, [1, 2], new Date('invalid')])
    for (const operation of [create, update])
      invalid(() => operation({ ...valid(), importance: value }), ...itemErrors.importance);
  for (const value of [Symbol('importance'), { [Symbol.toPrimitive]: () => ({}) }])
    for (const operation of [create, update])
      assert.throws(() => operation({ ...valid(), importance: value }), TypeError);
  for (const operation of [create, update]) {
    const events = [];
    const value = {
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return 2n;
      }
    };
    assert.equal(operation({ ...valid(), importance: value }).importance, 2);
    assert.deepEqual(events, ['number', 'number']);
    const failure = {};
    assert.throws(
      () =>
        operation({
          ...valid(),
          importance: {
            valueOf() {
              throw failure;
            }
          }
        }),
      error => error === failure
    );
  }
});

test('knowledge importance returns unchecked later coercions including NaN and infinity', () => {
  for (const last of [undefined, 'bad', NaN, Infinity, -Infinity, 3n, Symbol('late'), { valueOf: () => Infinity }])
    for (const [operation, values] of [
      [create, [1, 1, 1, 1, 1, last]],
      [update, [1, 1, 1, 1, last]]
    ]) {
      const changing = sequence('importance', values, valid());
      if (typeof last === 'symbol') assert.throws(() => operation(changing.input), TypeError);
      else assert.equal(operation(changing.input).importance, Number(last));
      assert.equal(changing.count(), values.length);
    }
  for (const operation of [create, update]) {
    let calls = 0;
    const value = {
      valueOf() {
        return ++calls === 1 ? 2 : Infinity;
      }
    };
    assert.equal(operation({ ...valid(), importance: value }).importance, Infinity);
    assert.equal(calls, 2);
  }
});

test('knowledge mutable Set.has retains truthiness, receiver, unknown identity and thrown identity', () => {
  for (const value of [{ marker: true }, [], Symbol('enum'), 9n, false, 0, 'unlisted']) {
    const calls = [];
    const results = withHas(
      function (received) {
        calls.push([this, received]);
        return {};
      },
      () => [
        create({ ...valid(), knowledgeType: value, sourceMode: value }),
        update({ knowledgeType: value, sourceMode: value }),
        evidence({ ...evidenceValid(), sourceType: value })
      ]
    );
    assert.equal(results[0].knowledgeType, value);
    assert.equal(results[0].sourceMode, value);
    assert.equal(results[1].knowledgeType, value);
    assert.equal(results[1].sourceMode, value);
    assert.equal(results[2].sourceType, value);
    assert.equal(calls.length, 5);
    assert.equal(calls[0][0], calls[2][0]);
    assert.equal(calls[1][0], calls[3][0]);
    assert.notEqual(calls[1][0], calls[4][0]);
    for (const [, received] of calls) assert.equal(received, value);
  }
  for (const accepted of [false, 0, '', null, undefined, NaN])
    withHas(
      () => accepted,
      () => invalid(() => create(valid()), ...itemErrors.knowledgeType)
    );
  const failure = {};
  withHas(
    () => {
      throw failure;
    },
    () =>
      assert.throws(
        () => evidence(evidenceValid()),
        error => error === failure
      )
  );
});

test('knowledge evidence getter order and revision rereads preserve unchecked returned identities', () => {
  const events = [];
  evidence(traced({ ...evidenceValid(), expectedAnnotationRevision: 2, headingPath: [' a '] }, events));
  assert.deepEqual(events, [
    'sourceType',
    'sourceId',
    'noteId',
    'noteVersionId',
    'annotationId',
    'expectedAnnotationRevision',
    'expectedAnnotationRevision',
    'expectedAnnotationRevision',
    'expectedAnnotationRevision',
    'id',
    'id',
    'quoteText',
    'headingPath',
    'headingPath',
    'relationType'
  ]);
  for (const last of [{}, Symbol('revision'), 4n, 'later', NaN, Infinity, null, undefined]) {
    const changing = sequence('expectedAnnotationRevision', [2, 2, 2, last], evidenceValid());
    assert.equal(evidence(changing.input).expectedAnnotationRevision, last);
    assert.equal(changing.count(), 4);
  }
});

test('knowledge evidence quote and relation pass through identities and nullish fallbacks', () => {
  for (const value of [undefined, null, false, 0, NaN, Infinity, 9n, Symbol('quote'), {}, [], new Date('2025-01-01')]) {
    const result = evidence({ ...evidenceValid(), quoteText: value, relationType: value });
    assert.equal(result.quoteText, value ?? '');
    assert.equal(result.relationType, value ?? 'supports');
  }
  assert.equal(evidence({ ...evidenceValid(), quoteText: ' quote ' }).quoteText, 'quote');
});

test('knowledge evidence heading normalization handles holes, symbols, bigint and string coercion order', () => {
  const events = [];
  const headingPath = [
    ' a ',
    undefined,
    null,
    undefined,
    3n,
    Symbol('h'),
    '',
    ' ',
    {
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return ' b ';
      }
    }
  ];
  delete headingPath[1];
  assert.deepEqual(evidence({ ...evidenceValid(), headingPath }).headingPath, [
    'a',
    'null',
    'undefined',
    '3',
    'Symbol(h)',
    'b'
  ]);
  assert.deepEqual(events, ['string']);
  const failure = {};
  assert.throws(
    () =>
      evidence({
        ...evidenceValid(),
        headingPath: [
          {
            toString() {
              throw failure;
            }
          }
        ]
      }),
    error => error === failure
  );
  assert.throws(() => evidence({ ...evidenceValid(), headingPath: [{ [Symbol.toPrimitive]: () => ({}) }] }), TypeError);
  for (const value of [null, {}, 'heading', 4n, Symbol('heading')])
    assert.deepEqual(evidence({ ...evidenceValid(), headingPath: value }).headingPath, []);
});

test('knowledge evidence uses actual overridden map/filter receivers and arbitrary final results', () => {
  for (const returned of [{ marker: true }, Symbol('headings'), 4n, false, 0, null, undefined]) {
    const events = [];
    const mapped = {
      filter(callback) {
        events.push(['filter', this, callback]);
        return returned;
      }
    };
    const headingPath = [];
    headingPath.map = function (callback) {
      events.push(['map', this, callback(' x ')]);
      return mapped;
    };
    assert.equal(evidence({ ...evidenceValid(), headingPath }).headingPath, returned);
    assert.deepEqual(events, [
      ['map', headingPath, 'x'],
      ['filter', mapped, Boolean]
    ]);
    const second = { map: headingPath.map };
    events.length = 0;
    const changing = sequence('headingPath', [[], second], evidenceValid());
    assert.equal(evidence(changing.input).headingPath, returned);
    assert.equal(changing.count(), 2);
    assert.deepEqual(events, [
      ['map', second, 'x'],
      ['filter', mapped, Boolean]
    ]);
  }
  for (const second of [null, undefined, {}, { map: 1 }, { map: () => null }, { map: () => ({ filter: 1 }) }])
    assert.throws(() => evidence(sequence('headingPath', [[], second], evidenceValid()).input), TypeError);
  const failure = {};
  for (const second of [
    {
      map() {
        throw failure;
      }
    },
    {
      map: () => ({
        filter() {
          throw failure;
        }
      })
    }
  ])
    assert.throws(
      () => evidence(sequence('headingPath', [[], second], evidenceValid()).input),
      error => error === failure
    );
});

test('knowledge timestamps pass through identities and create-only defaults are model-owned', () => {
  for (const timestamp of [undefined, null, false, 0, NaN, 8n, Symbol('time'), {}, [], new Date('2025-01-01')]) {
    const dto = create({ ...valid(), createdAt: timestamp, updatedAt: timestamp });
    assert.equal(dto.createdAt, timestamp);
    assert.equal(dto.updatedAt, timestamp);
    const model = new KnowledgeItem(dto);
    if (timestamp !== undefined) {
      assert.equal(model.createdAt, timestamp);
      assert.equal(model.updatedAt, timestamp);
      assert.equal(new KnowledgeItem(create({ ...valid(), createdAt: timestamp })).updatedAt, timestamp);
    } else {
      assert.match(model.createdAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(model.updatedAt, model.createdAt);
    }
  }
});

test('knowledge validation precedence and getter failures retain exact errors', () => {
  for (const [operation, fields, errors, validInput] of [
    [
      create,
      ['title', 'canonicalStatement', 'knowledgeType', 'sourceMode', 'importance', 'id', 'userExplanation'],
      itemErrors,
      valid()
    ],
    [
      evidence,
      ['sourceType', 'sourceId', 'noteId', 'noteVersionId', 'annotationId', 'expectedAnnotationRevision', 'id'],
      evidenceErrors,
      evidenceValid()
    ]
  ]) {
    for (let index = 0; index < fields.length; index++) {
      const input = { ...validInput };
      for (const field of fields.slice(index)) input[field] = field === 'importance' ? Infinity : false;
      invalid(() => operation(input), ...errors[fields[index]]);
    }
  }
  const failure = {};
  for (const [operation, fields, initial] of [
    [create, [...Object.keys(itemErrors), 'createdAt', 'updatedAt'], valid()],
    [update, ['title', 'canonicalStatement', 'userExplanation', 'knowledgeType', 'importance', 'sourceMode'], {}],
    [evidence, [...Object.keys(evidenceErrors), 'quoteText', 'headingPath', 'relationType'], evidenceValid()]
  ])
    for (const field of fields) {
      const input = Object.defineProperty({ ...initial }, field, {
        get() {
          throw failure;
        }
      });
      assert.throws(
        () => operation(input),
        error => error === failure
      );
    }
});

function serviceFixture(factory, asynchronous) {
  const events = [];
  const items = new Map();
  const evidences = new Map();
  const asyncValue = value => (asynchronous ? Promise.resolve(value) : value);
  const repo = (name, records) => ({
    findById(id) {
      events.push(`${name}:find:${id}`);
      return asyncValue(records.get(id));
    },
    list() {
      events.push(`${name}:list`);
      return asyncValue([...records.values()]);
    },
    create(record) {
      events.push(`${name}:create`);
      records.set(record.id, record);
      return asyncValue(record);
    },
    save(record, options) {
      events.push([`${name}:save`, options]);
      records.set(record.id, record);
      return asyncValue(record);
    }
  });
  const service = factory({
    repository: repo('item', items),
    evidenceRepository: repo('evidence', evidences),
    noteVersionRepository: {
      findById(id) {
        events.push(`version:find:${id}`);
        return asyncValue({ id, noteId: 'note-id', content: 'quote' });
      }
    },
    annotationRepository: {
      findById(id) {
        events.push(`annotation:find:${id}`);
        return asyncValue({
          id,
          noteId: 'note-id',
          noteVersionId: 'version-id',
          revision: 2,
          lifecycleStatus: 'active',
          anchorStatus: 'exact',
          quoteText: ' actual quote ',
          headingPath: [' actual heading ']
        });
      }
    },
    noteRepository: {
      findById(id) {
        events.push(`note:find:${id}`);
        return asyncValue({ id, rawMarkdown: 'quote' });
      }
    },
    runTransaction(operation) {
      events.push('transaction');
      return operation();
    }
  });
  return { service, events, items, evidences };
}

for (const [name, factory, asynchronous] of [
  ['sync', createKnowledgeItemService, false],
  ['postgres async', createAsyncKnowledgeItemService, true]
]) {
  test(`knowledge real ${name} service consumes all three selected DTO builders and both models`, async () => {
    const { service, events, items, evidences } = serviceFixture(factory, asynchronous);
    const created = await service.createCandidate({
      ...valid(),
      title: ' title ',
      importance: 3n,
      createdAt: null,
      updatedAt: null,
      evidence: [{ ...evidenceValid(), quoteText: 7n, headingPath: [' heading ', 4, ''] }]
    });
    assert.equal(created.item instanceof KnowledgeItem, true);
    assert.equal(created.evidence[0] instanceof KnowledgeEvidence, true);
    assert.equal(items.get('item-id'), created.item);
    assert.equal(evidences.get('evidence-id'), created.evidence[0]);
    assert.equal(created.item.title, 'title');
    assert.equal(created.item.importance, 3);
    assert.equal(created.item.createdAt, null);
    assert.equal(created.item.updatedAt, null);
    assert.equal(created.evidence[0].quoteText, '7');
    assert.deepEqual(created.evidence[0].headingPath, ['heading', '4']);
    assert.deepEqual(events, [
      'item:find:item-id',
      'item:find:item-id',
      'transaction',
      'item:find:item-id',
      'evidence:find:evidence-id',
      'item:create',
      'evidence:create'
    ]);
    events.length = 0;
    const updated = await service.updateItem('item-id', { title: ' revised ', importance: '4', sourceMode: 'manual' });
    assert.equal(updated instanceof KnowledgeItem, true);
    assert.equal(updated.title, 'revised');
    assert.equal(updated.importance, 4);
    assert.equal(updated.createdAt, null);
    assert.deepEqual(
      events,
      asynchronous
        ? ['item:find:item-id', ['item:save', { expectedUpdatedAt: null }]]
        : ['item:find:item-id', 'transaction', ['item:save', { expectedUpdatedAt: null }]]
    );
    const added = await service.createEvidence({
      id: ' added ',
      knowledgeItemId: 'item-id',
      sourceType: 'annotation',
      annotationId: ' annotation-id ',
      expectedAnnotationRevision: 2,
      quoteText: 'ignored'
    });
    assert.equal(added instanceof KnowledgeEvidence, true);
    assert.equal(added.quoteText, 'actual quote');
    assert.deepEqual(added.headingPath, ['actual heading']);
    assert.equal(added.sourceId, 'annotation-id');
    assert.equal(added.noteVersionId, 'version-id');
  });

  test(`knowledge real ${name} service rejects DTO errors before writes and retains native model errors`, async () => {
    const { service, events } = serviceFixture(factory, asynchronous);
    await assert.rejects(
      async () => service.createCandidate({ ...valid(), title: false }),
      matchesError(...itemErrors.title)
    );
    assert.deepEqual(events, []);
    await service.createCandidate(valid());
    events.length = 0;
    await assert.rejects(
      async () => service.updateItem('item-id', { importance: Infinity }),
      matchesError(...itemErrors.importance)
    );
    assert.deepEqual(events, ['item:find:item-id']);
    events.length = 0;
    await assert.rejects(
      async () => service.createEvidence({ ...evidenceValid(), knowledgeItemId: 'item-id', relationType: {} }),
      error => !(error instanceof AppError) && error.message === 'KnowledgeEvidence type or status is invalid'
    );
    assert.equal(events.includes('evidence:create'), false);
    events.length = 0;
    await assert.rejects(
      async () =>
        service.createEvidence({
          ...evidenceValid(),
          knowledgeItemId: 'item-id',
          sourceType: 'annotation',
          annotationId: 'annotation-id',
          expectedAnnotationRevision: 3
        }),
      error => error instanceof AppError && error.code === 'KNOWLEDGE_EVIDENCE_REVISION_CONFLICT'
    );
    assert.equal(events.includes('evidence:create'), false);
  });
}

test('knowledge model keeps native text rejection and unchecked type passthrough after mutable membership', () => {
  const value = {};
  const dto = withHas(
    () => true,
    () => create({ ...valid(), knowledgeType: value })
  );
  assert.equal(new KnowledgeItem(dto).knowledgeType, value);
  const changed = update(sequence('title', ['present', 'checked', { trim: () => value }]).input);
  assert.throws(
    () => new KnowledgeItem({ ...create(valid()), ...changed }),
    error => error.message === 'KnowledgeItem text fields are invalid'
  );
  const badSource = withHas(
    () => true,
    () => create({ ...valid(), sourceMode: value })
  );
  assert.throws(
    () => new KnowledgeItem(badSource),
    error => error.message === 'KnowledgeItem status or sourceMode is invalid'
  );
  assert.equal(
    withHas(
      () => true,
      () => new KnowledgeItem(badSource)
    ).sourceMode,
    value
  );
});

test('knowledge evidence model stringifies quote but validates heading array and relation itself', () => {
  for (const value of [false, 0, 7n, Symbol('quote'), {}, ['x']]) {
    const dto = evidence({ ...evidenceValid(), quoteText: value });
    assert.equal(new KnowledgeEvidence({ ...dto, knowledgeItemId: 'item-id' }).quoteText, String(value).trim());
  }
  const dto = evidence({ ...evidenceValid(), relationType: {} });
  assert.throws(
    () => new KnowledgeEvidence({ ...dto, knowledgeItemId: 'item-id' }),
    error => error.message === 'KnowledgeEvidence type or status is invalid'
  );
  assert.throws(
    () => new KnowledgeEvidence({ ...evidence(evidenceValid()), knowledgeItemId: 'item-id', headingPath: {} }),
    error => error.message === 'KnowledgeEvidence headingPath is invalid'
  );
});

test('knowledge optional text and quote trim preserve thrown identity', () => {
  const nativeTrim = String.prototype.trim;
  const failure = {};
  withPatch(
    String.prototype,
    'trim',
    function () {
      if (this === ' altered ') throw failure;
      return nativeTrim.call(this);
    },
    () => {
      for (const operation of [
        () => create({ ...valid(), title: ' altered ' }),
        () => evidence({ ...evidenceValid(), sourceId: ' altered ' }),
        () => evidence({ ...evidenceValid(), quoteText: ' altered ' })
      ])
        assert.throws(operation, error => error === failure);
    }
  );
});

test('knowledge revision third read uses native less-than coercion rather than another integer check', () => {
  const returned = { unchecked: true };
  for (const compared of [1n, 2n, '2', 'not-a-number', undefined, NaN, Infinity, {}]) {
    const changing = sequence('expectedAnnotationRevision', [2, 2, compared, returned], evidenceValid());
    assert.equal(evidence(changing.input).expectedAnnotationRevision, returned);
    assert.equal(changing.count(), 4);
  }
  for (const compared of [0n, -1n, '0', null, -Infinity]) {
    const changing = sequence('expectedAnnotationRevision', [2, 2, compared, returned], evidenceValid());
    invalid(() => evidence(changing.input), ...evidenceErrors.expectedAnnotationRevision);
    assert.equal(changing.count(), 3);
  }
  const events = [];
  const compared = {
    [Symbol.toPrimitive](hint) {
      events.push(hint);
      return 2n;
    }
  };
  assert.equal(
    evidence(sequence('expectedAnnotationRevision', [2, 2, compared, returned], evidenceValid()).input)
      .expectedAnnotationRevision,
    returned
  );
  assert.deepEqual(events, ['number']);
  for (const compared of [Symbol('revision'), { [Symbol.toPrimitive]: () => ({}) }]) {
    const changing = sequence('expectedAnnotationRevision', [2, 2, compared], evidenceValid());
    assert.throws(() => evidence(changing.input), TypeError);
    assert.equal(changing.count(), 3);
  }
  const failure = {};
  assert.throws(
    () =>
      evidence(
        sequence(
          'expectedAnnotationRevision',
          [
            2,
            2,
            {
              valueOf() {
                throw failure;
              }
            }
          ],
          evidenceValid()
        ).input
      ),
    error => error === failure
  );
});

// 只替换存储与事务边界，运行实际 DTO → 模型 → 本地或 PostgreSQL 仓库代码。
// PostgreSQL adapter 的映射输出是普通记录；此测试不代表连接过真实数据库或端到端类型安全。
function repositoryServiceFixture(asynchronous) {
  const writes = [];
  const received = [];
  const items = [];
  const evidences = [];
  const table = (name, records) => ({
    async findUnique({ where }) {
      return records.find(record => record.id === where.id) ?? null;
    },
    async create({ data }) {
      writes.push(`${name}:create`);
      records.push({ ...data });
      return records.at(-1);
    },
    async findMany({ where = {} }) {
      return records.filter(record =>
        Object.entries(where).every(([key, expected]) => {
          if (expected && typeof expected === 'object' && 'not' in expected) return record[key] !== expected.not;
          return record[key] === expected;
        })
      );
    },
    async updateMany({ where, data }) {
      const record = records.find(
        item => item.id === where.id && item.updatedAt.getTime() === where.updatedAt.getTime()
      );
      if (!record) return { count: 0 };
      writes.push(`${name}:updateMany`);
      Object.assign(record, data);
      return { count: 1 };
    },
    async upsert({ where, create, update }) {
      writes.push(`${name}:upsert`);
      const record = records.find(item => item.id === where.id);
      if (record) Object.assign(record, update);
      else records.push({ ...create });
      return record ?? records.at(-1);
    }
  });
  const db = { knowledgeItem: table('item', items), knowledgeEvidence: table('evidence', evidences) };
  const observe = (repository, name) => ({
    ...repository,
    create(record) {
      received.push([name, record]);
      return repository.create(record);
    },
    save(record, options) {
      received.push([name, record]);
      return repository.save(record, options);
    }
  });
  const repository = observe(
    asynchronous
      ? createPostgresKnowledgeItemRepository({ db })
      : createInMemoryKnowledgeItemRepository({ records: items, onChange: () => writes.push('item:persist') }),
    'item'
  );
  const evidenceRepository = observe(
    asynchronous
      ? createPostgresKnowledgeEvidenceRepository({ db })
      : createInMemoryKnowledgeEvidenceRepository({
          records: evidences,
          onChange: () => writes.push('evidence:persist')
        }),
    'evidence'
  );
  const value = record => (asynchronous ? Promise.resolve(record) : record);
  const service = (asynchronous ? createAsyncKnowledgeItemService : createKnowledgeItemService)({
    repository,
    evidenceRepository,
    noteRepository: { findById: id => value({ id, rawMarkdown: 'quote' }) },
    noteVersionRepository: { findById: id => value({ id, noteId: 'note-id', content: 'quote' }) },
    annotationRepository: {
      findById: id =>
        value({
          id,
          noteId: 'note-id',
          noteVersionId: 'version-id',
          revision: 2,
          lifecycleStatus: 'active',
          anchorStatus: 'exact',
          quoteText: ' annotation quote ',
          headingPath: [' annotation heading ']
        })
    },
    runTransaction: operation => operation()
  });
  return { service, repository, evidenceRepository, items, evidences, writes, received };
}

for (const asynchronous of [false, true]) {
  test(`knowledge ${asynchronous ? 'async PostgreSQL' : 'sync local'} real repository assembly preserves DTO normalization and model writes`, async () => {
    const { service, repository, evidenceRepository, items, evidences, writes, received } =
      repositoryServiceFixture(asynchronous);
    const stamp = '2025-03-04T05:06:07.000Z';
    const created = await service.createCandidate({
      ...valid(),
      title: ' title ',
      importance: 3n,
      createdAt: stamp,
      updatedAt: stamp,
      evidence: [{ ...evidenceValid(), quoteText: 7n, headingPath: [' heading ', 4, ''] }]
    });
    assert.equal(created.item.title, 'title');
    assert.equal(created.item.importance, 3);
    assert.equal(created.item.createdAt, stamp);
    assert.equal(created.evidence[0].quoteText, '7');
    assert.deepEqual(created.evidence[0].headingPath, ['heading', '4']);
    assert.equal(items.length, 1);
    assert.equal(evidences.length, 1);
    assert.deepEqual(
      received.map(([name]) => name),
      ['item', 'evidence']
    );
    assert.equal(received[0][1] instanceof KnowledgeItem, true);
    assert.equal(received[1][1] instanceof KnowledgeEvidence, true);
    assert.deepEqual(writes, asynchronous ? ['item:create', 'evidence:create'] : ['item:persist', 'evidence:persist']);
    if (asynchronous) {
      assert.equal(created.item instanceof KnowledgeItem, false);
      assert.equal(items[0].createdAt instanceof Date, true);
      assert.equal(Object.getPrototypeOf(created.evidence[0]), Object.prototype);
    } else {
      assert.equal(items[0], received[0][1]);
      assert.equal(evidences[0], received[1][1]);
      assert.equal(created.item, items[0]);
    }
    const updated = await service.updateItem('item-id', { title: ' revised ', importance: '4', sourceMode: 'manual' });
    assert.equal(updated.title, 'revised');
    assert.equal(updated.importance, 4);
    assert.equal(updated.createdAt, stamp);
    assert.equal(received.at(-1)[1] instanceof KnowledgeItem, true);
    assert.equal((await repository.findById('item-id')).title, 'revised');
    assert.equal(writes.at(-1), asynchronous ? 'item:updateMany' : 'item:persist');
    const added = await service.createEvidence({
      id: ' added ',
      knowledgeItemId: 'item-id',
      sourceType: 'annotation',
      annotationId: ' annotation-id ',
      expectedAnnotationRevision: 2,
      quoteText: 'ignored'
    });
    assert.equal(added.sourceId, 'annotation-id');
    assert.equal(added.quoteText, 'annotation quote');
    assert.deepEqual(added.headingPath, ['annotation heading']);
    assert.equal(received.at(-1)[1] instanceof KnowledgeEvidence, true);
    assert.equal((await evidenceRepository.findById('added')).sourceType, 'annotation');
    assert.equal((await service.listEvidence('item-id')).length, 2);
    const beforeFailure = writes.length;
    await assert.rejects(async () => service.updateItem('item-id', { importance: Symbol('bad') }), TypeError);
    await assert.rejects(
      async () => service.createEvidence({ id: 'invalid', knowledgeItemId: 'item-id', relationType: {} }),
      error => error.message === 'KnowledgeEvidence type or status is invalid'
    );
    assert.equal(writes.length, beforeFailure);
  });
}

test('knowledge actual local repositories retain unchecked model identities and extra fields without strengthening them', () => {
  const stamp = Symbol('timestamp');
  const type = { arbitrary: true };
  const model = new KnowledgeItem(create({ ...valid(), createdAt: stamp, updatedAt: stamp }));
  model.knowledgeType = type;
  const extra = { runtimeOnly: true };
  model.extra = extra;
  const items = createInMemoryKnowledgeItemRepository();
  assert.equal(items.create(model), model);
  assert.equal(items.findById(model.id).createdAt, stamp);
  assert.equal(items.findById(model.id).knowledgeType, type);
  assert.equal(items.findById(model.id).extra, extra);

  const arbitraryHeadings = { notAnArray: true };
  const headingPath = [];
  headingPath.map = () => ({ filter: () => arbitraryHeadings });
  const record = new KnowledgeEvidence({
    ...evidence(evidenceValid()),
    knowledgeItemId: model.id,
    headingPath,
    updatedAt: stamp
  });
  record.extra = extra;
  const evidences = createInMemoryKnowledgeEvidenceRepository();
  assert.equal(evidences.create(record), record);
  assert.equal(evidences.findById(record.id).headingPath, arbitraryHeadings);
  assert.equal(evidences.findById(record.id).updatedAt, stamp);
  assert.deepEqual(evidences.markByNoteId(null, 'stale'), [record]);
  assert.equal(record.status, 'stale');
  assert.equal(typeof record.updatedAt, 'string');
  assert.equal(record.extra, extra);
  assert.equal(record.headingPath, arbitraryHeadings);
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_ITEM_BOUNDARY_BASELINE === '1';
const commit = 'e90b69f477194903e62f2db895c44951c974d747';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const modelFile = new URL('domain/knowledge-item.js', root);
const repositoryFile = new URL('infrastructure/knowledge-item-repository.js', root);
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
const modelUrl = selectedUrl(modelFile, 'domain/knowledge-item.ts');
const repositoryUrl = selectedUrl(repositoryFile, 'infrastructure/knowledge-item-repository.ts');
const model = await import(modelUrl);
const { KnowledgeItem, KNOWLEDGE_ITEM_REVIEW_STATUSES: statuses, KNOWLEDGE_ITEM_SOURCE_MODES: modes } = model;
const { createInMemoryKnowledgeItemRepository: createRepository } = await import(repositoryUrl);
const loadService = path => {
  const location = new URL(path, root);
  return import(
    dataUrl(
      `${imports(readFileSync(location, 'utf8'), location, new Map([[modelFile.href, modelUrl]]))}\n//# sourceURL=${location.href}?boundary-test`
    )
  );
};
const { createKnowledgeItemService } = await loadService('application/knowledge-item-service.js');
const { createAsyncKnowledgeItemService } = await loadService('application/postgres-async/knowledge-domain-service.js');
const stamp = '2026-01-02T03:04:05.000Z';
const valid = extra => ({ id: 'item', createdAt: stamp, ...extra });
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
const withHas = (replacement, operation) => {
  const original = Set.prototype.has;
  Set.prototype.has = function (value) {
    if (this.size === 4 && (original.call(this, 'candidate') || original.call(this, 'manual')))
      return replacement.call(this, value, original.call(this, 'candidate') ? 'status' : 'source');
    return original.call(this, value);
  };
  try {
    return operation();
  } finally {
    Set.prototype.has = original;
  }
};

test('knowledge item boundary JS bridges preserve all TS export identities', { skip: baseline }, async () => {
  for (const file of [modelFile, repositoryFile]) {
    const js = await import(file.href);
    const ts = await import(file.href.replace(/\.js$/, '.ts'));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('knowledge item own fields, frozen enum arrays and default serialization remain exact', () => {
  const item = new KnowledgeItem(valid());
  assert.deepEqual(
    { ...item },
    {
      id: 'item',
      title: '',
      canonicalStatement: '',
      userExplanation: '',
      knowledgeType: 'concept',
      importance: null,
      reviewStatus: 'candidate',
      sourceMode: 'manual',
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null
    }
  );
  assert.deepEqual(Object.keys(item), [
    'id',
    'title',
    'canonicalStatement',
    'userExplanation',
    'knowledgeType',
    'importance',
    'reviewStatus',
    'sourceMode',
    'createdAt',
    'updatedAt',
    'deletedAt'
  ]);
  assert.deepEqual(new KnowledgeItem(JSON.parse(JSON.stringify(item))), item);
  assert.equal(Object.isFrozen(statuses), true);
  assert.equal(Object.isFrozen(modes), true);
  assert.deepEqual(statuses, ['candidate', 'confirmed', 'needsRevision', 'archived']);
  assert.deepEqual(modes, ['manual', 'annotation', 'selection', 'ai']);
});

test('knowledge item undefined defaults differ from null and generated clock is read once', () => {
  for (const field of [
    'title',
    'canonicalStatement',
    'userExplanation',
    'knowledgeType',
    'importance',
    'reviewStatus',
    'sourceMode',
    'deletedAt'
  ]) {
    assert.equal(new KnowledgeItem(valid({ [field]: undefined }))[field], new KnowledgeItem(valid())[field]);
  }
  for (const field of ['title', 'canonicalStatement'])
    assert.throws(() => new KnowledgeItem(valid({ [field]: null })), /text fields are invalid/);
  for (const field of ['reviewStatus', 'sourceMode'])
    assert.throws(() => new KnowledgeItem(valid({ [field]: null })), /status or sourceMode is invalid/);
  assert.equal(new KnowledgeItem(valid({ knowledgeType: null })).knowledgeType, null);
  assert.equal(new KnowledgeItem(valid({ userExplanation: null })).userExplanation, '');
  const NativeDate = globalThis.Date;
  let reads = 0;
  let item;
  globalThis.Date = class extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [++reads * 1000]));
    }
  };
  try {
    item = new KnowledgeItem({ id: 'item', createdAt: undefined, updatedAt: undefined });
  } finally {
    globalThis.Date = NativeDate;
  }
  assert.equal(reads, 1);
  assert.equal(item.createdAt, '1970-01-01T00:00:01.000Z');
  assert.equal(item.updatedAt, item.createdAt);
});

test('knowledge item preserves unknown knowledgeType and timestamp identities without cloning', () => {
  for (const value of [null, false, 0, NaN, 1n, Symbol('value'), {}, [], new Date(stamp)]) {
    const item = new KnowledgeItem(
      valid({ knowledgeType: value, createdAt: value, updatedAt: value, deletedAt: value })
    );
    for (const field of ['knowledgeType', 'createdAt', 'updatedAt', 'deletedAt']) assert.equal(item[field], value);
    assert.equal(new KnowledgeItem(valid({ createdAt: value, updatedAt: undefined })).updatedAt, value);
    assert.equal(new KnowledgeItem(valid({ updatedAt: value })).updatedAt, value);
  }
});

test('knowledge item native id trim accepts custom receivers but rejects absent and noncallable methods', () => {
  for (const id of [undefined, null, '', '  ']) assert.throws(() => new KnowledgeItem(valid({ id })), /id is required/);
  for (const id of [false, 0, 1n, Symbol('id'), {}, { trim: false }])
    assert.throws(() => new KnowledgeItem(valid({ id })), TypeError);
  const id = {
    trim() {
      assert.equal(this, id);
      return {};
    }
  };
  assert.equal(new KnowledgeItem(valid({ id })).id, id);
  for (const returned of [false, 0, '', null, undefined, NaN])
    assert.throws(() => new KnowledgeItem(valid({ id: { trim: () => returned } })), /id is required/);
  const failure = {};
  assert.throws(
    () =>
      new KnowledgeItem(
        valid({
          id: {
            trim() {
              throw failure;
            }
          }
        })
      ),
    sameError(failure)
  );
  assert.equal(new KnowledgeItem(valid({ id: ' item ' })).id, ' item ');
});

test('knowledge item title and statement use native typeof checks before trim', () => {
  for (const field of ['title', 'canonicalStatement']) {
    for (const value of [null, false, 0, 2n, Symbol('text'), {}, [], new String('text')])
      assert.throws(() => new KnowledgeItem(valid({ [field]: value })), /text fields are invalid/);
    assert.equal(new KnowledgeItem(valid({ [field]: '  trimmed \n' }))[field], 'trimmed');
  }
  const original = String.prototype.trim;
  const marker = {};
  const events = [];
  let item;
  String.prototype.trim = function () {
    events.push(this);
    return this === 'item' ? true : marker;
  };
  try {
    item = new KnowledgeItem(
      valid({ title: 'title', canonicalStatement: 'statement', userExplanation: 'explanation' })
    );
  } finally {
    String.prototype.trim = original;
  }
  assert.deepEqual(events, ['item', 'title', 'statement', 'explanation']);
  assert.equal(item.title, marker);
  assert.equal(item.canonicalStatement, marker);
  assert.equal(item.userExplanation, marker);
});

test('knowledge item optional explanation trim preserves nullish fallback, receiver and arbitrary returns', () => {
  for (const value of [undefined, null, false, 0, 2n, Symbol('text'), {}, [], { trim: null }])
    assert.equal(new KnowledgeItem(valid({ userExplanation: value })).userExplanation, '');
  for (const returned of [{}, [], Symbol('return'), 2n, false, 0, NaN, '', null, undefined]) {
    const value = {
      trim() {
        assert.equal(this, value);
        return returned;
      }
    };
    assert.equal(new KnowledgeItem(valid({ userExplanation: value })).userExplanation, returned ?? '');
  }
  for (const trim of [false, 0, 'text', {}])
    assert.throws(() => new KnowledgeItem(valid({ userExplanation: { trim } })), TypeError);
  const failure = {};
  for (const value of [
    {
      get trim() {
        throw failure;
      }
    },
    {
      trim() {
        throw failure;
      }
    }
  ])
    assert.throws(() => new KnowledgeItem(valid({ userExplanation: value })), sameError(failure));
});

test('knowledge item dynamic Set.has accepts arbitrary status and sourceMode without coercion', () => {
  for (const value of [{}, [], Symbol('mode'), 1n, false, 0, NaN, '', null]) {
    const events = [];
    const item = withHas(
      function (received, kind) {
        events.push([kind, received, this.size]);
        return {};
      },
      () => new KnowledgeItem(valid({ reviewStatus: value, sourceMode: value }))
    );
    assert.equal(item.reviewStatus, value);
    assert.equal(item.sourceMode, value);
    assert.deepEqual(events, [
      ['status', value, 4],
      ['source', value, 4]
    ]);
  }
  for (const returned of [false, 0, '', null, undefined, NaN]) {
    const events = [];
    withHas(
      (value, kind) => {
        events.push(kind);
        return returned;
      },
      () => assert.throws(() => new KnowledgeItem(valid()), /status or sourceMode is invalid/)
    );
    assert.deepEqual(events, ['status']);
  }
  const failure = {};
  withHas(
    () => {
      throw failure;
    },
    () => assert.throws(() => new KnowledgeItem(valid()), sameError(failure))
  );
});

test('knowledge item Set.has is looked up afresh with source short circuit and exact receiver', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  const nativeHas = descriptor.value;
  const events = [];
  Object.defineProperty(Set.prototype, 'has', {
    configurable: true,
    get() {
      if (this.size !== 4 || (!nativeHas.call(this, 'candidate') && !nativeHas.call(this, 'manual'))) return nativeHas;
      const name = nativeHas.call(this, 'candidate') ? 'status' : 'source';
      events.push(`get:${name}`);
      const receivers = [this];
      return function (value) {
        assert.equal(this, receivers[0]);
        events.push([name, value]);
        return true;
      };
    }
  });
  try {
    new KnowledgeItem(valid({ sourceMode: 'unlisted' }));
  } finally {
    Object.defineProperty(Set.prototype, 'has', descriptor);
  }
  assert.deepEqual(events, ['get:status', ['status', 'candidate'], 'get:source', ['source', 'unlisted']]);
});

test('knowledge item importance uses native Number twice, preserving bigint, signed zero and coercion order', () => {
  for (const [importance, expected] of [
    [null, null],
    [undefined, null],
    [false, 0],
    [true, 1],
    ['', 0],
    ['  ', 0],
    ['0x10', 16],
    [3n, 3],
    [9007199254740993n, 9007199254740992],
    [-0, -0],
    ['-0', -0],
    [[], 0],
    [[3], 3],
    [{ valueOf: () => 6 }, 6]
  ])
    assert.equal(new KnowledgeItem(valid({ importance })).importance, expected);
  const events = [];
  const importance = {
    [Symbol.toPrimitive](hint) {
      events.push(hint);
      return events.length === 1 ? 1 : 2;
    }
  };
  assert.equal(new KnowledgeItem(valid({ importance })).importance, 2);
  assert.deepEqual(events, ['number', 'number']);
  let count = 0;
  assert.equal(
    new KnowledgeItem(valid({ importance: { valueOf: () => (++count === 1 ? 1 : Infinity) } })).importance,
    Infinity
  );
});

test('knowledge item importance native exceptions and validation failure identity are not wrapped', () => {
  for (const importance of [NaN, Infinity, -Infinity, 'bad', {}, [1, 2]])
    assert.throws(
      () => new KnowledgeItem(valid({ importance })),
      error => !(error instanceof AppError) && error.message === 'KnowledgeItem importance is invalid'
    );
  for (const importance of [Symbol('importance'), { [Symbol.toPrimitive]: () => ({}) }])
    assert.throws(() => new KnowledgeItem(valid({ importance })), TypeError);
  for (const failAt of [1, 2]) {
    const failure = {};
    let calls = 0;
    const importance = {
      valueOf() {
        if (++calls === failAt) throw failure;
        return 1;
      }
    };
    assert.throws(() => new KnowledgeItem(valid({ importance })), sameError(failure));
    assert.equal(calls, failAt);
  }
});

test('knowledge item destructuring getter order precedes validation and stops at exact thrown getter', () => {
  const fields = [
    'id',
    'title',
    'canonicalStatement',
    'userExplanation',
    'knowledgeType',
    'importance',
    'reviewStatus',
    'sourceMode',
    'createdAt',
    'updatedAt',
    'deletedAt'
  ];
  const events = [];
  new KnowledgeItem(trace(valid(), events));
  assert.deepEqual(events, fields);
  const failure = {};
  for (let index = 0; index < fields.length; index++) {
    const seen = [];
    const input = valid({ id: '' });
    Object.defineProperty(input, fields[index], {
      get() {
        throw failure;
      }
    });
    assert.throws(() => new KnowledgeItem(trace(input, seen)), sameError(failure));
    assert.deepEqual(seen, fields.slice(0, index + 1));
  }
  assert.throws(() => new KnowledgeItem(), TypeError);
  assert.throws(() => new KnowledgeItem(null), TypeError);
  for (const input of [false, 0, 2n, Symbol('input'), 'text'])
    assert.throws(() => new KnowledgeItem(input), /id is required/);
  assert.equal(new KnowledgeItem(Object.create(valid())).id, 'item');
});

test('knowledge item validation and assignment operation ordering remain exact', () => {
  const events = [];
  const id = {
    trim() {
      events.push('id:trim');
      return true;
    }
  };
  const importance = {
    valueOf() {
      events.push('importance:number');
      return 1;
    }
  };
  const explanation = {
    trim() {
      events.push('explanation:trim');
      return 'text';
    }
  };
  withHas(
    (value, kind) => {
      events.push(`${kind}:has`);
      return true;
    },
    () => new KnowledgeItem(valid({ id, importance, userExplanation: explanation }))
  );
  assert.deepEqual(events, [
    'id:trim',
    'status:has',
    'source:has',
    'importance:number',
    'explanation:trim',
    'importance:number'
  ]);
  for (const [input, message] of [
    [{ id: '', title: false, sourceMode: 'bad', importance: Infinity }, 'id is required'],
    [{ title: false, sourceMode: 'bad', importance: Infinity }, 'text fields are invalid'],
    [{ sourceMode: 'bad', importance: Infinity }, 'status or sourceMode is invalid'],
    [{ importance: Infinity }, 'importance is invalid']
  ])
    assert.throws(
      () => new KnowledgeItem(valid(input)),
      error => error.message.endsWith(message)
    );
});

test('knowledge repository retains backing and record identity for all CRUD and independent lists', () => {
  const records = [];
  const options = { records };
  const repo = createRepository(options);
  const item = { id: 'one', sourceMode: { raw: true } };
  assert.equal(repo.create(item), item);
  assert.equal(repo.findById('one'), item);
  const list = repo.list();
  assert.notEqual(list, records);
  assert.equal(list[0], item);
  list.pop();
  assert.equal(records.length, 1);
  options.records = [];
  const replacement = { id: 'one', unknown: {} };
  assert.equal(repo.save(replacement), replacement);
  assert.equal(records[0], replacement);
  const second = { id: 'two' };
  assert.equal(repo.save(second), second);
  assert.deepEqual(records, [replacement, second]);
  assert.equal(repo.delete('one'), replacement);
  assert.equal(repo.delete('absent'), null);
  assert.equal(repo.findById('one'), null);
  assert.deepEqual(options.records, []);
  for (const config of [undefined, {}, { records: undefined }, { records: null }])
    assert.deepEqual(createRepository(config).list(), []);
  assert.throws(() => createRepository(null), TypeError);
});

test('knowledge repository reads live hooks with options receiver and mutates before hook failures', () => {
  for (const action of ['create', 'save-new', 'save-existing', 'delete']) {
    const original = { id: 'one' };
    const records = action === 'save-existing' || action === 'delete' ? [original] : [];
    const events = [];
    const options = { records };
    const repo = createRepository(options);
    const failure = {};
    const next = { id: 'one', title: 'new' };
    Object.defineProperty(options, 'onChange', {
      configurable: true,
      get() {
        events.push('get');
        return function (changed) {
          assert.equal(this, options);
          assert.equal(changed, records);
          events.push([...changed]);
          throw failure;
        };
      }
    });
    assert.throws(
      () => (action === 'delete' ? repo.delete('one') : action === 'create' ? repo.create(next) : repo.save(next)),
      sameError(failure)
    );
    assert.deepEqual(records, action === 'delete' ? [] : [next]);
    assert.deepEqual(events, ['get', [...records]]);
    Object.defineProperty(options, 'onChange', { value: null, configurable: true, writable: true });
    repo.save(next);
    let calls = 0;
    options.onChange = function () {
      assert.equal(this, options);
      calls++;
    };
    repo.save(next);
    assert.equal(calls, 1);
  }
  for (const onChange of [false, 1, {}, 'callback']) {
    const records = [];
    assert.throws(() => createRepository({ records, onChange }).create({ id: 'one' }), TypeError);
    assert.equal(records.length, 1);
  }
});

test('knowledge repository duplicate and expected timestamp conflicts avoid writes and callbacks', () => {
  const original = { id: 'one', updatedAt: 'stamp' };
  let calls = 0;
  const records = [original];
  const repo = createRepository({ records, onChange: () => calls++ });
  assert.throws(() => repo.create({ id: 'one' }), appError('KNOWLEDGE_ITEM_ID_CONFLICT'));
  assert.throws(
    () => repo.save({ id: 'one' }, { expectedUpdatedAt: 'wrong' }),
    appError('KNOWLEDGE_ITEM_UPDATE_CONFLICT')
  );
  assert.throws(
    () => repo.save({ id: 'absent' }, { expectedUpdatedAt: 'stamp' }),
    appError('KNOWLEDGE_ITEM_UPDATE_CONFLICT')
  );
  assert.deepEqual(records, [original]);
  assert.equal(calls, 0);
  for (const expectedUpdatedAt of [null, undefined, false, 0, -0, '', NaN]) {
    const replacement = { id: 'one' };
    assert.equal(repo.save(replacement, { expectedUpdatedAt }), replacement);
  }
  const token = {};
  const strict = createRepository({ records: [{ id: 'one', updatedAt: token }] });
  assert.throws(
    () => strict.save({ id: 'one' }, { expectedUpdatedAt: {} }),
    appError('KNOWLEDGE_ITEM_UPDATE_CONFLICT')
  );
  assert.equal(strict.save(original, { expectedUpdatedAt: token }), original);
  assert.throws(() => repo.save(original, null), TypeError);
});

test('knowledge repository strict id operations preserve falsy ids and first duplicate deletion', () => {
  for (const id of [undefined, null, false, 0, '', 2n, Symbol('id'), {}]) {
    const item = { id };
    const repo = createRepository({ records: [item] });
    assert.equal(repo.findById(id), item);
    assert.throws(() => repo.create({ id }), appError('KNOWLEDGE_ITEM_ID_CONFLICT'));
    assert.equal(repo.delete(id), item);
  }
  const first = { id: 'one' };
  const second = { id: 'one' };
  const records = [first, second];
  let calls = 0;
  const repo = createRepository({ records, onChange: () => calls++ });
  assert.equal(repo.delete('absent'), null);
  assert.equal(calls, 0);
  assert.equal(repo.delete('one'), first);
  assert.equal(records[0], second);
  assert.equal(calls, 1);
});

test('knowledge repository search preserves String coercion, unknown fields and query-only trimming', () => {
  const records = [
    { id: 'text', title: ' MiXeD ', canonicalStatement: 'statement', userExplanation: 'explanation' },
    { id: 'empty' },
    { id: 'null', title: null, canonicalStatement: 42, userExplanation: false },
    { id: 'symbol', title: Symbol('symbol') }
  ];
  const repo = createRepository({ records });
  for (const [query, expected] of [
    [' MIXED ', ['text']],
    ['statement', ['text']],
    ['explanation', ['text']],
    [null, ['null']],
    [42, ['null']],
    [false, ['null']],
    ['undefined', ['empty', 'symbol']],
    [Symbol('symbol'), ['symbol']],
    [{ toString: () => 'mixed' }, ['text']],
    ['', ids(records)],
    [undefined, ids(records)]
  ])
    assert.deepEqual(ids(repo.list({ query })), expected);
  assert.throws(() => repo.list(null), TypeError);
  const failure = {};
  assert.throws(
    () =>
      repo.list({
        query: {
          toString() {
            throw failure;
          }
        }
      }),
    sameError(failure)
  );
});

test('knowledge repository filter flags are strict but status and deletion filters retain truthiness', () => {
  const records = [
    { id: 'active', reviewStatus: 'candidate' },
    { id: 'archive', reviewStatus: 'archived' },
    { id: 'deleted', reviewStatus: 'candidate', deletedAt: 'date' },
    { id: 'both', reviewStatus: 'archived', deletedAt: {} },
    ...[undefined, null, false, 0, '', NaN].map((deletedAt, index) => ({ id: `falsy-${index}`, deletedAt }))
  ];
  const repo = createRepository({ records });
  const tail = records.slice(4).map(row => row.id);
  for (const flag of [true, 'true', false, 'false', 1, 'TRUE', null, undefined, {}, []]) {
    const enabled = flag === true || flag === 'true';
    assert.deepEqual(ids(repo.list({ includeArchived: flag })), [
      ...(enabled ? ['active', 'archive'] : ['active']),
      ...tail
    ]);
    assert.deepEqual(ids(repo.list({ includeDeleted: flag })), [
      ...(enabled ? ['active', 'deleted'] : ['active']),
      ...tail
    ]);
  }
  assert.deepEqual(ids(repo.list({ reviewStatus: 'archived' })), ['archive']);
  assert.deepEqual(ids(repo.list({ reviewStatus: 'archived', includeDeleted: true })), ['archive', 'both']);
  for (const reviewStatus of [undefined, null, false, 0, '', NaN])
    assert.deepEqual(ids(repo.list({ reviewStatus })), ['active', ...tail]);
  assert.deepEqual(repo.list({ reviewStatus: {} }), []);
});

test('knowledge repository list eagerly reads all text fields but short circuits field coercion', () => {
  const events = [];
  const item = {
    id: 'one',
    get title() {
      events.push('title:get');
      return {
        toString() {
          events.push('title:string');
          return 'match';
        }
      };
    },
    get canonicalStatement() {
      events.push('canonical:get');
      return {
        toString() {
          events.push('canonical:string');
          return 'other';
        }
      };
    },
    get userExplanation() {
      events.push('explanation:get');
      return {
        toString() {
          events.push('explanation:string');
          return 'other';
        }
      };
    }
  };
  assert.deepEqual(createRepository({ records: [item] }).list({ query: 'match' }), [item]);
  assert.deepEqual(events, ['title:get', 'canonical:get', 'explanation:get', 'title:string']);
  events.length = 0;
  assert.deepEqual(createRepository({ records: [item] }).list(), [item]);
  assert.deepEqual(events, []);
  const failure = {};
  Object.defineProperty(item, 'canonicalStatement', {
    get() {
      throw failure;
    }
  });
  assert.throws(() => createRepository({ records: [item] }).list({ query: 'match' }), sameError(failure));
});

test('knowledge repository option reads, filter passes and CRUD repeated getters preserve order', () => {
  const events = [];
  const row = name => ({
    id: name,
    get reviewStatus() {
      events.push(`${name}:status`);
      return 'candidate';
    },
    get deletedAt() {
      events.push(`${name}:deleted`);
      return null;
    },
    get title() {
      events.push(`${name}:title`);
      return 'match';
    },
    get canonicalStatement() {
      events.push(`${name}:statement`);
      return '';
    },
    get userExplanation() {
      events.push(`${name}:explanation`);
      return '';
    },
    get updatedAt() {
      events.push(`${name}:date`);
      return 0;
    }
  });
  createRepository({ records: [row('a'), row('b')] }).list(
    trace({ reviewStatus: 'candidate', query: 'match' }, events)
  );
  assert.deepEqual(events, [
    'reviewStatus',
    'query',
    'includeArchived',
    'includeDeleted',
    'a:status',
    'b:status',
    'a:status',
    'b:status',
    'a:deleted',
    'b:deleted',
    'a:title',
    'a:statement',
    'a:explanation',
    'b:title',
    'b:statement',
    'b:explanation',
    'a:date',
    'b:date'
  ]);
  events.length = 0;
  const records = [trace({ id: 'a' }, events), trace({ id: 'b' }, events)];
  const next = trace({ id: 'c' }, events);
  const repo = createRepository({ records });
  repo.create(next);
  assert.deepEqual(events, ['id', 'id', 'id', 'id']);
  events.length = 0;
  repo.save(next, trace({}, events));
  assert.deepEqual(events, ['expectedUpdatedAt', 'id', 'id', 'id', 'id', 'id', 'id']);
});

test('knowledge repository Date sorting preserves conversion, invalid stability and backing order', () => {
  for (const [value, expected] of [
    ['2026-01-01', ['b', 'a']],
    [1000, ['b', 'a']],
    [null, ['a', 'b']],
    [undefined, ['a', 'b']],
    ['invalid', ['a', 'b']],
    [false, ['a', 'b']],
    [true, ['b', 'a']],
    [{ valueOf: () => 2000 }, ['b', 'a']],
    [{ toString: () => '2026-01-01' }, ['b', 'a']]
  ]) {
    const records = [
      { id: 'a', updatedAt: 0 },
      { id: 'b', updatedAt: value }
    ];
    assert.deepEqual(ids(createRepository({ records }).list()), expected);
    assert.deepEqual(ids(records), ['a', 'b']);
  }
  for (const value of [Symbol('date'), 1n, { [Symbol.toPrimitive]: () => ({}) }])
    assert.throws(
      () =>
        createRepository({
          records: [
            { id: 'a', updatedAt: 0 },
            { id: 'b', updatedAt: value }
          ]
        }).list(),
      TypeError
    );
});

test('knowledge repository sorting reads right then left and preserves exact thrown conversion identity', () => {
  const sequence = ['first:get', 'first:convert', 'second:get', 'second:convert'];
  for (const failAt of [null, ...sequence]) {
    const events = [];
    const failure = {};
    const row = name => ({
      id: name,
      get updatedAt() {
        events.push(`${name}:get`);
        if (failAt === `${name}:get`) throw failure;
        return {
          [Symbol.toPrimitive](hint) {
            assert.equal(hint, 'default');
            events.push(`${name}:convert`);
            if (failAt === `${name}:convert`) throw failure;
            return name === 'first' ? 0 : 1;
          }
        };
      }
    });
    const records = [row('first'), row('second')];
    const operation = () => createRepository({ records }).list();
    if (failAt) assert.throws(operation, sameError(failure));
    else assert.deepEqual(ids(operation()), ['second', 'first']);
    assert.deepEqual(events, failAt ? sequence.slice(0, sequence.indexOf(failAt) + 1) : sequence);
    assert.deepEqual(ids(records), ['first', 'second']);
  }
});

test('knowledge item reconstruction drops extra fields while repository save replaces rather than merges records', () => {
  const extra = { marker: 'undeclared' };
  const original = { ...new KnowledgeItem(valid({ title: 'original' })), extra };
  const records = [];
  const repo = createRepository({ records });
  assert.equal(repo.save(original), original);
  assert.equal(repo.findById('item'), original);
  assert.equal(repo.list()[0], original);
  assert.equal(records[0].extra, extra);

  const rebuilt = new KnowledgeItem({ ...original, title: 'rebuilt' });
  assert.equal(Object.hasOwn(rebuilt, 'extra'), false);
  assert.equal(original.extra, extra);
  assert.equal(repo.save(rebuilt), rebuilt);
  assert.equal(records[0], rebuilt);
  assert.equal(repo.findById('item'), rebuilt);
  assert.equal(repo.list()[0], rebuilt);
  for (const value of [records[0], repo.findById('item'), repo.list()[0]])
    assert.equal(Object.hasOwn(value, 'extra'), false);

  const direct = { id: 'item', extra };
  assert.equal(repo.save(direct), direct);
  assert.equal(repo.findById('item').extra, extra);
  const replacement = { id: 'item', title: 'replacement' };
  assert.equal(repo.save(replacement), replacement);
  assert.equal(repo.findById('item'), replacement);
  assert.equal(repo.list()[0], replacement);
  assert.equal(Object.hasOwn(records[0], 'extra'), false);
  assert.equal(direct.extra, extra);
});

function serviceFixture(factory, asynchronous) {
  const records = [];
  const events = [];
  const memory = createRepository({ records });
  const repository = Object.fromEntries(
    Object.entries(memory).map(([name, operation]) => [
      name,
      (...args) => {
        events.push([name, ...args]);
        return asynchronous ? Promise.resolve().then(() => operation(...args)) : operation(...args);
      }
    ])
  );
  const evidenceRepository = {
    list: () => (asynchronous ? Promise.resolve([]) : []),
    findById: () => (asynchronous ? Promise.resolve(null) : null)
  };
  const invalidated = [];
  const service = factory({
    repository,
    evidenceRepository,
    onItemInvalidated: id => invalidated.push(id),
    runTransaction(operation) {
      events.push(['transaction']);
      return operation();
    }
  });
  return { service, repository, records, events, invalidated };
}

for (const [name, factory, asynchronous] of [
  ['sync', createKnowledgeItemService, false],
  ['postgres async', createAsyncKnowledgeItemService, true]
]) {
  test(`knowledge item actual ${name} service consumes selected model and repository with fake persistence`, async () => {
    const { service, records, events, invalidated } = serviceFixture(factory, asynchronous);
    const created = await service.createCandidate({
      id: ' item ',
      title: ' title ',
      canonicalStatement: ' statement ',
      userExplanation: ' explanation ',
      importance: 3n,
      createdAt: null,
      updatedAt: stamp
    });
    assert.equal(created.item instanceof KnowledgeItem, true);
    assert.equal(records[0], created.item);
    assert.deepEqual(created.evidence, []);
    assert.equal(created.item.title, 'title');
    assert.equal(created.item.canonicalStatement, 'statement');
    assert.equal(created.item.userExplanation, 'explanation');
    assert.equal(created.item.importance, 3);
    assert.equal(created.item.createdAt, null);
    assert.equal(created.item.updatedAt, stamp);
    assert.deepEqual(
      events.map(event => event[0]),
      ['findById', 'findById', 'transaction', 'findById', 'create']
    );
    const confirmed = await service.confirmItem('item', { expectedUpdatedAt: stamp });
    assert.equal(confirmed.reviewStatus, 'confirmed');
    const updated = await service.updateItem('item', { title: ' revised ', expectedUpdatedAt: confirmed.updatedAt });
    assert.equal(updated instanceof KnowledgeItem, true);
    assert.equal(records[0], updated);
    assert.equal(updated.title, 'revised');
    assert.equal(updated.reviewStatus, 'needsRevision');
    assert.equal(updated.createdAt, null);
    assert.deepEqual(invalidated, ['item']);
    const archived = await service.archive('item', { expectedUpdatedAt: updated.updatedAt });
    assert.equal(archived.reviewStatus, 'archived');
    assert.deepEqual(await service.listItems(), []);
    assert.deepEqual(await service.listItems({ includeArchived: 'true' }), [archived]);
    const restored = await service.restore('item', { expectedUpdatedAt: archived.updatedAt });
    assert.equal(restored.reviewStatus, 'candidate');
    const trashed = await service.trash('item', { expectedUpdatedAt: restored.updatedAt });
    assert.equal(typeof trashed.deletedAt, 'string');
    await assert.rejects(
      async () => service.getItem('item'),
      error => error.code === 'KNOWLEDGE_ITEM_NOT_FOUND'
    );
    assert.equal((await service.restoreDeleted('item', { expectedUpdatedAt: trashed.updatedAt })).deletedAt, null);
  });

  test(`knowledge item actual ${name} update reconstructs declared fields and drops seeded extras`, async () => {
    const { service, repository, records, events } = serviceFixture(factory, asynchronous);
    const extra = { marker: 'seeded-extra' };
    const seeded = { ...new KnowledgeItem(valid({ title: 'before' })), extra };
    assert.equal(await repository.save(seeded), seeded);
    assert.equal(await service.getItem('item'), seeded);
    assert.equal((await service.listItems())[0].extra, extra);
    events.length = 0;

    const updated = await service.updateItem('item', { title: ' after ', expectedUpdatedAt: stamp });
    assert.equal(updated instanceof KnowledgeItem, true);
    assert.notEqual(updated, seeded);
    assert.equal(updated.title, 'after');
    assert.equal(Object.hasOwn(updated, 'extra'), false);
    const saveEvent = events.find(event => event[0] === 'save');
    assert.equal(saveEvent[1], updated);
    assert.deepEqual(saveEvent[2], { expectedUpdatedAt: stamp });
    assert.equal(records[0], updated);
    assert.equal(await repository.findById('item'), updated);
    assert.equal((await repository.list())[0], updated);
    assert.equal(await service.getItem('item'), updated);
    assert.equal((await service.listItems())[0], updated);
    assert.equal(seeded.extra, extra);
    assert.equal(seeded.title, 'before');

    const next = await service.updateItem('item', { title: 'again', expectedUpdatedAt: updated.updatedAt });
    assert.notEqual(next, updated);
    assert.equal(await repository.findById('item'), next);
    assert.equal((await repository.list())[0], next);
    assert.equal(Object.hasOwn(next, 'extra'), false);
    assert.equal(Object.hasOwn(records[0], 'extra'), false);
  });

  test(`knowledge item actual ${name} service preserves unknown timestamps and validation before persistence`, async () => {
    for (const value of [null, false, 0, NaN, 7n, Symbol('timestamp'), {}, []]) {
      const { service, records } = serviceFixture(factory, asynchronous);
      const { item } = await service.createCandidate({ id: 'item', createdAt: value, updatedAt: value });
      assert.equal(item.createdAt, value);
      assert.equal(item.updatedAt, value);
      assert.equal(records[0], item);
    }
    const { service, events, records } = serviceFixture(factory, asynchronous);
    await assert.rejects(
      async () => service.createCandidate({ id: 'bad', title: false }),
      error => error.code === 'KNOWLEDGE_ITEM_TITLE_INVALID'
    );
    assert.deepEqual(events, []);
    await assert.rejects(
      async () => service.createCandidate({ id: 'bad', sourceMode: 'ai' }),
      error => error.code === 'KNOWLEDGE_EVIDENCE_REQUIRED'
    );
    assert.deepEqual(records, []);
    const { item } = await service.createCandidate({ id: 'item', createdAt: stamp });
    await assert.rejects(
      async () => service.updateItem('item', { title: 'changed', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }),
      appError('KNOWLEDGE_ITEM_UPDATE_CONFLICT')
    );
    assert.equal(records[0], item);
  });
}

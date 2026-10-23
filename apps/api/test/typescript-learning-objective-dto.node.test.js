import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import {
  LEARNING_OBJECTIVE_ACTION_VERBS as verbs,
  LEARNING_OBJECTIVE_COGNITIVE_LEVELS as levels,
  LEARNING_OBJECTIVE_DIFFICULTY_HINTS as difficulties
} from '../src/modules/knowledge/domain/learning-objective.js';

const baseline = process.env.KNOWRA_OBJECTIVE_DTO_BASELINE === '1';
const commit = '5ba35df1d25a613b23fb6b5bdc8fdba4b61d06a6';
const root = new URL('../src/modules/knowledge/', import.meta.url);
const dtoFile = new URL('application/dto/learning-objective.dto.js', root);
const modelFile = new URL('domain/learning-objective.js', root);
const absoluteImports = (source, location, replacements = new Map()) =>
  source.replace(/(from\s+)(['"])(\.[^'"]+)\2/g, (_, prefix, quote, path) => {
    const target = new URL(path, location);
    return `${prefix}${JSON.stringify(replacements.get(target.href) || target.href)}`;
  });
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const dtoUrl = baseline
  ? dataUrl(
      absoluteImports(
        execFileSync(
          'git',
          ['show', `${commit}:apps/api/src/modules/knowledge/application/dto/learning-objective.dto.js`],
          {
            cwd: new URL('../../../', import.meta.url),
            encoding: 'utf8'
          }
        ),
        dtoFile
      )
    )
  : dtoFile.href;
const modelUrl = baseline
  ? dataUrl(
      stripTypeScriptTypes(
        execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/domain/learning-objective.ts`], {
          cwd: new URL('../../../', import.meta.url),
          encoding: 'utf8'
        })
      )
    )
  : modelFile.href;
const { LearningObjective } = await import(modelUrl);
const { buildCreateLearningObjectiveDto: create, buildUpdateLearningObjectiveDto: update } = await import(dtoUrl);
const loadService = async path => {
  const location = new URL(path, root);
  return import(
    dataUrl(
      absoluteImports(
        readFileSync(location, 'utf8'),
        location,
        new Map([
          [dtoFile.href, dtoUrl],
          [modelFile.href, modelUrl]
        ])
      )
    )
  );
};
const { createLearningObjectiveService } = await loadService('application/learning-objective-service.js');
const { createAsyncLearningObjectiveService } = await loadService(
  'application/postgres-async/learning-objective-service.js'
);
const valid = () => ({ id: ' objective-id ', knowledgeItemId: ' knowledge-id ' });
const errors = {
  knowledgeItemId: ['LEARNING_OBJECTIVE_KNOWLEDGE_ITEM_REQUIRED', 'LearningObjective knowledgeItemId is required'],
  id: ['LEARNING_OBJECTIVE_ID_INVALID', 'LearningObjective id is invalid'],
  objective: ['LEARNING_OBJECTIVE_TEXT_INVALID', 'LearningObjective objective is invalid'],
  reviewNote: ['LEARNING_OBJECTIVE_REVIEW_NOTE_INVALID', 'LearningObjective reviewNote is invalid'],
  actionVerb: ['LEARNING_OBJECTIVE_ACTION_VERB_INVALID', 'LearningObjective actionVerb is invalid'],
  cognitiveLevel: ['LEARNING_OBJECTIVE_COGNITIVE_LEVEL_INVALID', 'LearningObjective cognitiveLevel is invalid'],
  difficultyHint: ['LEARNING_OBJECTIVE_DIFFICULTY_INVALID', 'LearningObjective difficultyHint is invalid'],
  order: ['LEARNING_OBJECTIVE_ORDER_INVALID', 'LearningObjective order is invalid']
};
const isInvalid = field => error =>
  error instanceof AppError &&
  error.code === errors[field][0] &&
  error.message === errors[field][1] &&
  error.statusCode === 422;
const invalid = (operation, field) => assert.throws(operation, isInvalid(field));
const traced = (input, events) =>
  new Proxy(input, {
    get(target, key, receiver) {
      events.push(String(key));
      return Reflect.get(target, key, receiver);
    }
  });
const enumArrays = [verbs, levels, difficulties];
const withIncludes = (replacement, operation) => {
  const original = Array.prototype.includes;
  Array.prototype.includes = function (value, ...rest) {
    if (this === verbs || this === levels || this === difficulties) return replacement.call(this, value);
    return original.call(this, value, ...rest);
  };
  try {
    return operation();
  } finally {
    Array.prototype.includes = original;
  }
};
const withUuid = operation => {
  const original = crypto.randomUUID;
  const events = [];
  crypto.randomUUID = () => {
    events.push('uuid');
    return 'test-uuid';
  };
  syncBuiltinESMExports();
  try {
    return operation(events);
  } finally {
    crypto.randomUUID = original;
    syncBuiltinESMExports();
  }
};

test('learning objective DTO JS bridge preserves exact TS export identity', { skip: baseline }, async () => {
  const js = await import(dtoFile);
  const ts = await import(new URL('application/dto/learning-objective.dto.ts', root));
  assert.deepEqual(Object.keys(js), Object.keys(ts));
  for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
});

test('learning objective create keeps defaults, nullable values and property order', () => {
  const expected = {
    id: 'objective-id',
    knowledgeItemId: 'knowledge-id',
    objective: '',
    actionVerb: '',
    cognitiveLevel: '',
    difficultyHint: null,
    reviewNote: null,
    order: 0,
    createdAt: undefined,
    updatedAt: undefined
  };
  assert.deepEqual(create(valid()), expected);
  assert.deepEqual(Object.keys(create(valid())), Object.keys(expected));
  assert.deepEqual(
    create({
      ...valid(),
      objective: ' 说明\n目标 ',
      actionVerb: 'explain',
      cognitiveLevel: 'understand',
      difficultyHint: 'medium',
      reviewNote: ' 待复核 ',
      order: ' 3 ',
      createdAt: 'created',
      updatedAt: 'updated'
    }),
    {
      ...expected,
      objective: '说明\n目标',
      actionVerb: 'explain',
      cognitiveLevel: 'understand',
      difficultyHint: 'medium',
      reviewNote: '待复核',
      order: 3,
      createdAt: 'created',
      updatedAt: 'updated'
    }
  );
});

test('learning objective updates omit undefined and create-only fields, but preserve explicit clears', () => {
  assert.deepEqual(update(), {});
  assert.deepEqual(
    update({
      id: 0,
      knowledgeItemId: 0,
      createdAt: 0,
      updatedAt: 0,
      reviewStatus: 'confirmed',
      objective: undefined,
      reviewNote: undefined,
      actionVerb: undefined,
      cognitiveLevel: undefined,
      difficultyHint: undefined,
      order: undefined
    }),
    {}
  );
  assert.deepEqual(
    update({
      objective: null,
      reviewNote: null,
      actionVerb: null,
      cognitiveLevel: '',
      difficultyHint: null,
      order: null
    }),
    {
      objective: '',
      reviewNote: null,
      actionVerb: null,
      cognitiveLevel: null,
      difficultyHint: null,
      order: 0
    }
  );
  const ignored = {};
  for (const key of ['id', 'knowledgeItemId', 'createdAt', 'updatedAt', 'reviewStatus'])
    Object.defineProperty(ignored, key, {
      get() {
        throw new Error(`unexpected ${key}`);
      }
    });
  assert.deepEqual(update(ignored), {});
});

test('learning objective validation errors retain shared AppError identity and exact codes', () => {
  for (const field of [
    'knowledgeItemId',
    'id',
    'objective',
    'reviewNote',
    'actionVerb',
    'cognitiveLevel',
    'difficultyHint'
  ]) {
    for (const value of [false, 0, 1n, Symbol(field), {}, [], new String('text')]) {
      invalid(() => create({ ...valid(), [field]: value }), field);
      if (field !== 'knowledgeItemId' && field !== 'id') invalid(() => update({ [field]: value }), field);
    }
  }
  for (const field of ['knowledgeItemId', 'id'])
    for (const value of [null, '', ' \n ']) invalid(() => create({ ...valid(), [field]: value }), field);
  for (const field of ['objective', 'reviewNote']) {
    assert.equal(create({ ...valid(), [field]: ' \t\n ' })[field], field === 'objective' ? '' : null);
    assert.equal(update({ [field]: ' \t\n ' })[field], field === 'objective' ? '' : null);
  }
});

test('learning objective enum membership is exact and create/update empty semantics differ', () => {
  for (const [field, values] of [
    ['actionVerb', verbs],
    ['cognitiveLevel', levels],
    ['difficultyHint', difficulties]
  ]) {
    assert.equal(Object.isFrozen(values), true);
    for (const value of values) {
      assert.equal(create({ ...valid(), [field]: value })[field], value);
      assert.equal(update({ [field]: value })[field], value);
      invalid(() => update({ [field]: ` ${value} ` }), field);
      invalid(() => update({ [field]: value.toUpperCase() }), field);
    }
    for (const value of [undefined, null, '']) {
      assert.equal(create({ ...valid(), [field]: value })[field], field === 'difficultyHint' ? null : '');
      assert.deepEqual(update({ [field]: value }), value === undefined ? {} : { [field]: null });
    }
  }
});

test('learning objective primitive boxing, inherited fields and null errors remain native', () => {
  for (const input of [undefined, false, true, 0, NaN, 2n, Symbol('input'), 'text', [], () => {}]) {
    invalid(() => create(input), 'knowledgeItemId');
    assert.deepEqual(update(input), {});
  }
  for (const operation of [create, update]) assert.throws(() => operation(null), TypeError);
  assert.equal(create(Object.create(valid())).knowledgeItemId, 'knowledge-id');
  assert.deepEqual(update(Object.create({ objective: ' inherited ', actionVerb: 'apply' })), {
    objective: 'inherited',
    actionVerb: 'apply'
  });
});

test('learning objective create read order includes repeated id lookup and UUID timing', () =>
  withUuid(events => {
    create(traced(valid(), events));
    assert.deepEqual(events, [
      'knowledgeItemId',
      'actionVerb',
      'cognitiveLevel',
      'difficultyHint',
      'order',
      'id',
      'id',
      'objective',
      'reviewNote',
      'createdAt',
      'updatedAt'
    ]);
    events.length = 0;
    assert.equal(create(traced({ knowledgeItemId: 'knowledge-id' }, events)).id, 'objective-test-uuid');
    assert.deepEqual(events, [
      'knowledgeItemId',
      'actionVerb',
      'cognitiveLevel',
      'difficultyHint',
      'order',
      'id',
      'uuid',
      'objective',
      'reviewNote',
      'createdAt',
      'updatedAt'
    ]);
    events.length = 0;
    invalid(() => create({ knowledgeItemId: 'knowledge-id', order: -1 }), 'order');
    assert.deepEqual(events, []);
    invalid(() => create({ knowledgeItemId: 'knowledge-id', objective: false }), 'objective');
    assert.deepEqual(events, ['uuid']);
    let reads = 0;
    invalid(
      () =>
        create({
          ...valid(),
          get id() {
            return ++reads === 1 ? 'id' : undefined;
          }
        }),
      'id'
    );
    assert.equal(reads, 2);
  }));

test('learning objective update repeats reads and preserves second-value semantics', () => {
  const events = [];
  update(
    traced(
      {
        objective: ' text ',
        reviewNote: ' note ',
        actionVerb: 'apply',
        cognitiveLevel: 'apply',
        difficultyHint: 'easy',
        order: 3
      },
      events
    )
  );
  assert.deepEqual(events, [
    'objective',
    'objective',
    'reviewNote',
    'reviewNote',
    'actionVerb',
    'actionVerb',
    'cognitiveLevel',
    'cognitiveLevel',
    'difficultyHint',
    'difficultyHint',
    'order',
    'order'
  ]);
  for (const field of ['objective', 'reviewNote', 'actionVerb', 'cognitiveLevel', 'difficultyHint', 'order']) {
    let reads = 0;
    const input = {
      get [field]() {
        return ++reads === 1 ? 'present' : undefined;
      }
    };
    if (field === 'order') invalid(() => update(input), field);
    else assert.deepEqual(update(input), { [field]: field === 'objective' ? '' : null });
    assert.equal(reads, 2);
  }
  const absentEvents = [];
  assert.deepEqual(update(traced({}, absentEvents)), {});
  assert.deepEqual(absentEvents, [
    'objective',
    'reviewNote',
    'actionVerb',
    'cognitiveLevel',
    'difficultyHint',
    'order'
  ]);
});

test('learning objective enum tuple arrays are evaluated per call after optional text reads', () => {
  const original = Array.prototype[Symbol.iterator];
  const events = [];
  const tuples = [];
  Array.prototype[Symbol.iterator] = function () {
    if (this.length === 3 && this[0]?.[0] === 'actionVerb' && this[2]?.[0] === 'difficultyHint') {
      events.push('enum list');
      tuples.push(this);
    } else if (
      this.length === 4 &&
      (this[0] === 'actionVerb' || this[0] === 'cognitiveLevel' || this[0] === 'difficultyHint')
    ) {
      events.push(`tuple:${this[0]}`);
    }
    return original.call(this);
  };
  try {
    update(traced({}, events));
    update({});
  } finally {
    Array.prototype[Symbol.iterator] = original;
  }
  assert.deepEqual(events, [
    'objective',
    'reviewNote',
    'enum list',
    'tuple:actionVerb',
    'actionVerb',
    'tuple:cognitiveLevel',
    'cognitiveLevel',
    'tuple:difficultyHint',
    'difficultyHint',
    'order',
    'enum list',
    'tuple:actionVerb',
    'tuple:cognitiveLevel',
    'tuple:difficultyHint'
  ]);
  assert.equal(tuples.length, 2);
  assert.notEqual(tuples[0], tuples[1]);
  assert.notEqual(tuples[0][0], tuples[1][0]);
  for (let index = 0; index < 3; index++) assert.equal(tuples[0][index][1], enumArrays[index]);
});

test('learning objective Number conversion preserves bigint, negative zero, native failures and integer boundaries', () => {
  for (const [value, expected] of [
    [null, 0],
    [false, 0],
    [true, 1],
    ['', 0],
    [' \n ', 0],
    ['0x10', 16],
    [3n, 3],
    [-0, -0],
    ['-0', -0],
    [[], 0],
    [[4], 4],
    [{ valueOf: () => 5 }, 5],
    [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1],
    [9007199254740993n, 9007199254740992]
  ]) {
    assert.equal(create({ ...valid(), order: value }).order, expected);
    assert.equal(update({ order: value }).order, expected);
  }
  for (const value of [NaN, Infinity, -Infinity, -1, -1n, 0.5, 'bad', {}, [1, 2]]) {
    invalid(() => create({ ...valid(), order: value }), 'order');
    invalid(() => update({ order: value }), 'order');
  }
  for (const operation of [create, update]) {
    assert.throws(() => operation({ ...valid(), order: Symbol('order') }), TypeError);
    assert.throws(() => operation({ ...valid(), order: { [Symbol.toPrimitive]: () => ({}) } }), TypeError);
    const events = [];
    assert.equal(
      operation({
        ...valid(),
        order: {
          [Symbol.toPrimitive](hint) {
            events.push(hint);
            return '6';
          }
        }
      }).order,
      6
    );
    assert.deepEqual(events, ['number']);
    const failure = {};
    assert.throws(
      () =>
        operation({
          ...valid(),
          order: {
            valueOf() {
              throw failure;
            }
          }
        }),
      error => error === failure
    );
  }
});

test('learning objective dynamic includes keeps array receiver, truthiness and unknown value identity', () => {
  for (const value of [{}, [], Symbol('enum'), 1n, false, 0, NaN]) {
    const events = [];
    let result;
    withIncludes(
      function (received) {
        events.push([this, received]);
        return { accepted: true };
      },
      () => {
        result = [
          create({ ...valid(), actionVerb: value, cognitiveLevel: value, difficultyHint: value }),
          update({ actionVerb: value, cognitiveLevel: value, difficultyHint: value })
        ];
      }
    );
    assert.equal(result[0].actionVerb, value);
    assert.equal(result[0].cognitiveLevel, value);
    assert.equal(result[0].difficultyHint, value || null);
    for (const field of ['actionVerb', 'cognitiveLevel', 'difficultyHint'])
      assert.equal(result[1][field], value || null);
    assert.equal(events.length, 6);
    events.forEach(([receiver, received], index) => {
      assert.equal(receiver, enumArrays[index % 3]);
      assert.equal(received, value);
    });
  }
  for (const accepted of [false, 0, '', null, undefined, NaN])
    withIncludes(
      () => accepted,
      () => invalid(() => update({ actionVerb: 'apply' }), 'actionVerb')
    );
  const failure = {};
  withIncludes(
    () => {
      throw failure;
    },
    () =>
      assert.throws(
        () => create({ ...valid(), actionVerb: 'apply' }),
        error => error === failure
      )
  );
});

test('learning objective includes property is read afresh and empty enums bypass it', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
  const events = [];
  Object.defineProperty(Array.prototype, 'includes', {
    configurable: true,
    get() {
      if (this !== verbs && this !== levels && this !== difficulties) return descriptor.value;
      events.push(['get', this]);
      return function (value) {
        events.push(['call', this, value]);
        return true;
      };
    }
  });
  let result;
  try {
    result = update({ actionVerb: 'nonstandard', cognitiveLevel: null, difficultyHint: 'unlisted' });
  } finally {
    Object.defineProperty(Array.prototype, 'includes', descriptor);
  }
  assert.deepEqual(result, { actionVerb: 'nonstandard', cognitiveLevel: null, difficultyHint: 'unlisted' });
  assert.deepEqual(events, [
    ['get', verbs],
    ['call', verbs, 'nonstandard'],
    ['get', difficulties],
    ['call', difficulties, 'unlisted']
  ]);
});

test('learning objective optional text trim preserves primitive receiver, arbitrary returns and thrown identity', () => {
  const original = String.prototype.trim;
  const marker = {};
  for (const returned of [marker, Symbol('trim'), 1n, 0, false, '', null, undefined]) {
    const receivers = [];
    let result;
    String.prototype.trim = function () {
      receivers.push(this);
      return returned;
    };
    try {
      result = update({ objective: 'objective', reviewNote: 'note' });
    } finally {
      String.prototype.trim = original;
    }
    assert.deepEqual(receivers, ['objective', 'note']);
    assert.equal(result.objective, returned || '');
    assert.equal(result.reviewNote, returned || null);
  }
  const failure = {};
  String.prototype.trim = function () {
    throw failure;
  };
  try {
    assert.throws(
      () => update({ objective: 'text' }),
      error => error === failure
    );
  } finally {
    String.prototype.trim = original;
  }
});

test('learning objective timestamps pass through identities without parsing or cloning', () => {
  for (const timestamp of [undefined, null, false, 0, NaN, 3n, Symbol('timestamp'), {}, [], new Date('2025-01-01')]) {
    const dto = create({ ...valid(), createdAt: timestamp, updatedAt: timestamp });
    assert.equal(dto.createdAt, timestamp);
    assert.equal(dto.updatedAt, timestamp);
    assert.equal(Object.hasOwn(dto, 'createdAt'), true);
    assert.equal(Object.hasOwn(dto, 'updatedAt'), true);
  }
});

test('learning objective validation precedence and getter failure identity remain unchanged', () => {
  const order = [
    'knowledgeItemId',
    'actionVerb',
    'cognitiveLevel',
    'difficultyHint',
    'order',
    'id',
    'objective',
    'reviewNote'
  ];
  for (let index = 0; index < order.length; index++) {
    const input = valid();
    for (let later = index; later < order.length; later++) input[order[later]] = false;
    if (order.slice(index).includes('order')) input.order = -1;
    invalid(() => create(input), order[index]);
  }
  const failure = {};
  for (const field of [...order, 'createdAt', 'updatedAt']) {
    const input = valid();
    Object.defineProperty(input, field, {
      get() {
        throw failure;
      }
    });
    assert.throws(
      () => create(input),
      error => error === failure
    );
  }
  for (const field of ['objective', 'reviewNote', 'actionVerb', 'cognitiveLevel', 'difficultyHint', 'order'])
    assert.throws(
      () =>
        update({
          get [field]() {
            throw failure;
          }
        }),
      error => error === failure
    );
});

function serviceFixture(factory) {
  const events = [];
  const records = new Map();
  const item = { id: 'knowledge-id', reviewStatus: 'confirmed', updatedAt: '2025-01-01T00:00:00.000Z' };
  const repository = {
    findById(id) {
      events.push(`objective:find:${id}`);
      return records.get(id);
    },
    lockById(id) {
      events.push(`objective:lock:${id}`);
    },
    create(value) {
      events.push('objective:create');
      records.set(value.id, value);
      return value;
    },
    save(value, options) {
      events.push(['objective:save', options]);
      records.set(value.id, value);
      return value;
    }
  };
  const service = factory({
    repository,
    knowledgeItemRepository: {
      findById(id) {
        events.push(`knowledge:find:${id}`);
        return item;
      },
      lockById(id) {
        events.push(`knowledge:lock:${id}`);
      }
    },
    runTransaction(operation) {
      events.push('transaction');
      return operation();
    }
  });
  return { service, events, records };
}

for (const [name, factory, asynchronous] of [
  ['sync', createLearningObjectiveService, false],
  ['postgres async', createAsyncLearningObjectiveService, true]
]) {
  test(`learning objective real ${name} service consumes selected DTO and preserves defaults`, async () => {
    const { service, events, records } = serviceFixture(factory);
    const created = await service.createCandidate({
      ...valid(),
      objective: ' goal ',
      actionVerb: 'explain',
      cognitiveLevel: 'understand',
      difficultyHint: 'easy',
      order: 2n,
      reviewNote: ' note ',
      createdAt: null,
      updatedAt: null
    });
    assert.equal(created instanceof LearningObjective, true);
    assert.equal(records.get('objective-id'), created);
    assert.equal(created.objective, 'goal');
    assert.equal(created.reviewNote, 'note');
    assert.equal(created.order, 2);
    assert.equal(created.createdAt, null);
    assert.equal(created.updatedAt, null);
    assert.deepEqual(
      events,
      asynchronous
        ? [
            'knowledge:lock:knowledge-id',
            'knowledge:find:knowledge-id',
            'objective:find:objective-id',
            'transaction',
            'objective:create'
          ]
        : ['transaction', 'knowledge:find:knowledge-id', 'objective:find:objective-id', 'objective:create']
    );
    events.length = 0;
    const updated = await service.updateObjective('objective-id', {
      objective: ' revised ',
      reviewNote: null,
      difficultyHint: '',
      order: '3'
    });
    assert.equal(updated.objective, 'revised');
    assert.equal(updated.reviewNote, null);
    assert.equal(updated.difficultyHint, null);
    assert.equal(updated.order, 3);
    assert.equal(updated.createdAt, null);
    assert.equal(records.get('objective-id'), updated);
    assert.deepEqual(
      events,
      asynchronous
        ? [
            'objective:find:objective-id',
            'knowledge:lock:knowledge-id',
            'objective:lock:objective-id',
            'objective:find:objective-id',
            'knowledge:find:knowledge-id',
            ['objective:save', { expectedUpdatedAt: null }]
          ]
        : [
            'transaction',
            'objective:find:objective-id',
            'knowledge:find:knowledge-id',
            ['objective:save', { expectedUpdatedAt: null }]
          ]
    );
  });

  test(`learning objective real ${name} service keeps DTO validation before writes and native model rejection`, async () => {
    const { service, events } = serviceFixture(factory);
    await assert.rejects(
      async () => service.createCandidate({ ...valid(), actionVerb: 'unknown' }),
      isInvalid('actionVerb')
    );
    assert.deepEqual(events, []);
    await service.createCandidate(valid());
    events.length = 0;
    await assert.rejects(async () => service.updateObjective('objective-id', { order: -1 }), isInvalid('order'));
    assert.deepEqual(
      events,
      asynchronous
        ? [
            'objective:find:objective-id',
            'knowledge:lock:knowledge-id',
            'objective:lock:objective-id',
            'objective:find:objective-id',
            'knowledge:find:knowledge-id'
          ]
        : []
    );
    events.length = 0;
    await assert.rejects(
      async () => service.updateObjective('objective-id', { actionVerb: null }),
      error => !(error instanceof AppError) && error.message === 'LearningObjective text fields are invalid'
    );
    assert.equal(
      events.some(event => Array.isArray(event) && event[0] === 'objective:save'),
      false
    );
  });
}

test('learning objective model rejects nonstring action and cognition even when DTO includes accepts them', () => {
  for (const field of ['actionVerb', 'cognitiveLevel']) {
    for (const value of [{}, [], Symbol(field), 7n, false, 0]) {
      const dto = withIncludes(
        () => true,
        () => create({ ...valid(), [field]: value })
      );
      assert.equal(dto[field], value);
      assert.throws(
        () => new LearningObjective(dto),
        error => !(error instanceof AppError) && error.message === 'LearningObjective text fields are invalid'
      );
    }
  }
});

test('learning objective model retains unknown difficulty identity only when its dynamic Set.has accepts it', () => {
  for (const value of [{ marker: true }, [], Symbol('difficulty'), 7n]) {
    const dto = withIncludes(
      () => true,
      () => create({ ...valid(), difficultyHint: value })
    );
    assert.equal(dto.difficultyHint, value);
    assert.throws(
      () => new LearningObjective(dto),
      error => error.message === 'LearningObjective difficultyHint is invalid'
    );
    const nativeHas = Set.prototype.has;
    const events = [];
    let model;
    Set.prototype.has = function (received) {
      if (
        this.size === 3 &&
        nativeHas.call(this, 'easy') &&
        nativeHas.call(this, 'medium') &&
        nativeHas.call(this, 'hard')
      ) {
        events.push(received);
        return { accepted: true };
      }
      return nativeHas.call(this, received);
    };
    try {
      model = new LearningObjective(dto);
    } finally {
      Set.prototype.has = nativeHas;
    }
    assert.deepEqual(events, [value]);
    assert.equal(model.difficultyHint, value);
  }
});

test('learning objective model preserves arbitrary timestamp identities and updatedAt default follows createdAt', () => {
  for (const timestamp of [null, false, 0, NaN, 7n, Symbol('timestamp'), {}, [], new Date('2025-01-01')]) {
    const both = new LearningObjective(create({ ...valid(), createdAt: timestamp, updatedAt: timestamp }));
    assert.equal(both.createdAt, timestamp);
    assert.equal(both.updatedAt, timestamp);
    const inheritedDefault = new LearningObjective(create({ ...valid(), createdAt: timestamp }));
    assert.equal(inheritedDefault.createdAt, timestamp);
    assert.equal(inheritedDefault.updatedAt, timestamp);
    const explicitUpdate = new LearningObjective(create({ ...valid(), updatedAt: timestamp }));
    assert.equal(typeof explicitUpdate.createdAt, 'string');
    assert.equal(explicitUpdate.updatedAt, timestamp);
  }
  const generated = new LearningObjective(create(valid()));
  assert.match(generated.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(generated.updatedAt, generated.createdAt);
});

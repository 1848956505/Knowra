import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const names = ['knowledge-item-concurrency', 'learning-objective-concurrency', 'knowledge-candidate-retry'];
const application = new URL('../src/modules/knowledge/application/', import.meta.url);
// 三个原始 JS 已逐字节核对：本地迁移基线 bb103126 与此已发布提交一致。
// KNOWRA_CONCURRENCY_POLICY_BASELINE=1 node --test apps/api/test/typescript-concurrency-policy.node.test.js
const baseline = process.env.KNOWRA_CONCURRENCY_POLICY_BASELINE === '1';
async function load(name) {
  if (!baseline) return import(new URL(`${name}.js`, application));
  const original = execFileSync(
    'git',
    ['show', `b4f8dc6c1a299be1db24ff2b68b9d462895a4800:apps/api/src/modules/knowledge/application/${name}.js`],
    {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    }
  );
  const source = original
    .replace('./knowledge-errors.js', new URL('knowledge-errors.js', application).href)
    .replace('../../../errors/app-error.js', new URL('../src/errors/app-error.js', import.meta.url).href);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const [knowledge, objectives, candidates] = await Promise.all(names.map(load));
const { assertKnowledgeItemBaseline, nextKnowledgeItemTimestamp } = knowledge;
const { assertLearningObjectiveBaseline, withLearningObjectiveReviewErrors, nextLearningObjectiveTimestamp } =
  objectives;
const { matchesKnowledgeCandidateRequest } = candidates;
const iso = '2026-01-02T03:04:05.000Z';
const offset = '2026-01-02T04:04:05+01:00';
const entity = { updatedAt: iso };
const review = () => ({ reviewBaseline: { knowledgeUpdatedAt: iso, objectiveUpdatedAt: iso } });
const domain = (code, statusCode) => error => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, code);
  assert.equal(error.statusCode, statusCode);
  return true;
};
const sameThrown = (run, expected) => assert.throws(run, error => error === expected);
const sameRejected = (run, expected) => assert.rejects(run, error => error === expected);

test('concurrency policy JS bridges preserve exact TS exports', { skip: baseline }, async () => {
  for (const name of names) {
    const js = await import(new URL(`${name}.js`, application));
    const ts = await import(new URL(`${name}.ts`, application));
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

for (const [name, next] of [
  ['knowledge', nextKnowledgeItemTimestamp],
  ['objective', nextLearningObjectiveTimestamp]
]) {
  test(`${name} timestamp preserves Date.parse coercion, monotonicity and thrown identity`, t => {
    t.mock.method(Date, 'now', () => 1000);
    for (const value of [undefined, null, '', 'invalid', new Date(NaN), false]) {
      assert.equal(next({ updatedAt: value }), new Date(1000).toISOString());
    }
    assert.equal(next(), new Date(1000).toISOString());
    assert.equal(next(null), new Date(1000).toISOString());
    assert.equal(next({ updatedAt: new Date(1000).toISOString() }), new Date(1001).toISOString());
    for (const value of [iso, new Date(iso), 2020, 2020n, { toString: () => iso }]) {
      assert.equal(next({ updatedAt: value }), new Date(Date.parse(String(value)) + 1).toISOString());
    }
    assert.throws(() => next({ updatedAt: Symbol('date') }), TypeError);
    assert.throws(() => next({ updatedAt: '+275760-09-13T00:00:00.000Z' }), RangeError);
    const failure = new Error('timestamp getter');
    sameThrown(
      () =>
        next({
          get updatedAt() {
            throw failure;
          }
        }),
      failure
    );
    const events = [];
    t.mock.method(Date, 'now', () => {
      events.push('now');
      return 1000;
    });
    next({
      get updatedAt() {
        events.push('updatedAt');
        return {
          toString() {
            events.push('coerce');
            return iso;
          }
        };
      }
    });
    assert.deepEqual(events, ['now', 'updatedAt', 'coerce']);
  });
}

test('knowledge baseline distinguishes omission from invalid input and accepts inherited/offset dates', () => {
  for (const input of [undefined, {}, { expectedUpdatedAt: undefined }, Object.create({ expectedUpdatedAt: iso })]) {
    assert.equal(assertKnowledgeItemBaseline(entity, input), undefined);
  }
  assert.equal(assertKnowledgeItemBaseline({ updatedAt: new Date(iso) }, { expectedUpdatedAt: offset }), undefined);
  assert.equal(assertKnowledgeItemBaseline(null, {}), undefined);
  for (const input of [
    null,
    [],
    false,
    'x',
    1,
    () => {},
    { expectedUpdatedAt: null },
    { expectedUpdatedAt: 0 },
    { expectedUpdatedAt: new Date(iso) },
    { expectedUpdatedAt: 'invalid' },
    { expectedUpdatedAt: Symbol() }
  ]) {
    assert.throws(() => assertKnowledgeItemBaseline(entity, input), domain('KNOWLEDGE_ITEM_BASELINE_INVALID', 422));
  }
  assert.throws(
    () => assertKnowledgeItemBaseline({ updatedAt: '2025-01-01' }, { expectedUpdatedAt: iso }),
    domain('KNOWLEDGE_ITEM_UPDATE_CONFLICT', 409)
  );
  assert.throws(() => assertKnowledgeItemBaseline({ updatedAt: 'bad' }, { expectedUpdatedAt: iso }), RangeError);
  assert.throws(() => assertKnowledgeItemBaseline({ updatedAt: 1n }, { expectedUpdatedAt: iso }), TypeError);
});

test('knowledge baseline retains getter count and order without snapshots', () => {
  const events = [];
  assertKnowledgeItemBaseline(
    {
      get updatedAt() {
        events.push('item');
        return iso;
      }
    },
    {
      get expectedUpdatedAt() {
        events.push('input');
        return iso;
      }
    }
  );
  assert.deepEqual(events, ['input', 'input', 'input', 'input', 'item']);
  const failure = new Error('baseline getter');
  sameThrown(
    () =>
      assertKnowledgeItemBaseline(entity, {
        get expectedUpdatedAt() {
          throw failure;
        }
      }),
    failure
  );
});

test('review baseline requires own property and canonical ISO but permits inherited fields', () => {
  assert.equal(assertLearningObjectiveBaseline(null, null, Object.create({ reviewBaseline: null })), undefined);
  assert.equal(assertLearningObjectiveBaseline(null, null), undefined);
  for (const input of [
    null,
    [],
    false,
    'x',
    1,
    () => {},
    { reviewBaseline: undefined },
    { reviewBaseline: null },
    { reviewBaseline: [] },
    { reviewBaseline: {} }
  ]) {
    assert.throws(
      () => assertLearningObjectiveBaseline(entity, entity, input),
      domain('LEARNING_OBJECTIVE_BASELINE_INVALID', 400)
    );
  }
  for (const value of [offset, '2026-01-02T03:04:05Z', '2026-01-02', 'bad', new Date(iso), 1n, Symbol()]) {
    const input = review();
    input.reviewBaseline.objectiveUpdatedAt = value;
    assert.throws(
      () => assertLearningObjectiveBaseline(entity, entity, input),
      domain('LEARNING_OBJECTIVE_BASELINE_INVALID', 400)
    );
  }
  assert.equal(
    assertLearningObjectiveBaseline(
      { updatedAt: offset },
      { updatedAt: offset },
      {
        reviewBaseline: Object.create({ objectiveUpdatedAt: iso, knowledgeUpdatedAt: iso })
      }
    ),
    undefined
  );
  assert.equal(
    assertLearningObjectiveBaseline(null, entity, { reviewBaseline: { knowledgeUpdatedAt: iso } }),
    undefined
  );
  for (const value of ['bad', new Date(iso), undefined, '2025-01-01']) {
    assert.throws(
      () => assertLearningObjectiveBaseline(entity, { updatedAt: value }, review()),
      domain('LEARNING_OBJECTIVE_UPDATE_CONFLICT', 409)
    );
  }
});

test('review baseline getter order validates objective first but compares knowledge first', () => {
  const events = [];
  const observed = label => ({
    get updatedAt() {
      events.push(label);
      return iso;
    }
  });
  const fields = {};
  for (const field of ['objectiveUpdatedAt', 'knowledgeUpdatedAt']) {
    Object.defineProperty(fields, field, {
      get() {
        events.push(field);
        return iso;
      }
    });
  }
  assertLearningObjectiveBaseline(observed('objective'), observed('knowledge'), {
    get reviewBaseline() {
      events.push('reviewBaseline');
      return fields;
    }
  });
  assert.deepEqual(events, [
    'reviewBaseline',
    ...Array(4).fill('objectiveUpdatedAt'),
    ...Array(4).fill('knowledgeUpdatedAt'),
    'knowledgeUpdatedAt',
    'knowledge',
    'objectiveUpdatedAt',
    'objective'
  ]);
  let accessed = false;
  assertLearningObjectiveBaseline(null, entity, {
    reviewBaseline: {
      knowledgeUpdatedAt: iso,
      get objectiveUpdatedAt() {
        accessed = true;
        throw new Error('unused');
      }
    }
  });
  assert.equal(accessed, false);
});

test('review operation validates before execution, executes once and preserves successful identity', async () => {
  let calls = 0;
  const result = { ok: true };
  const operation = () => {
    calls++;
    return result;
  };
  await assert.rejects(
    withLearningObjectiveReviewErrors({ reviewBaseline: undefined }, operation),
    domain('LEARNING_OBJECTIVE_BASELINE_INVALID', 400)
  );
  assert.equal(calls, 0);
  assert.equal(await withLearningObjectiveReviewErrors(review(), operation), result);
  assert.equal(calls, 1);
  assert.equal(
    await withLearningObjectiveReviewErrors(
      { reviewBaseline: { knowledgeUpdatedAt: iso } },
      () => Promise.resolve(result),
      { hasObjective: false }
    ),
    result
  );
});

test('review conflict mapping recognizes only relevant Prisma errors across nested and cyclic causes', async () => {
  const cycle = {};
  cycle.cause = cycle;
  const nestedCycle = { code: 'P2034', cause: cycle };
  cycle.cause = nestedCycle;
  const mapped = [
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { code: '40P01' } },
    { code: 'DATABASE_TRANSACTION_FAILED', statusCode: 500, cause: { cause: { code: 'P2034' } } },
    cycle
  ];
  for (const original of mapped) {
    let calls = 0;
    await assert.rejects(
      withLearningObjectiveReviewErrors(review(), () => {
        calls++;
        throw original;
      }),
      error => {
        domain('LEARNING_OBJECTIVE_UPDATE_CONFLICT', 409)(error);
        assert.equal(error.cause, original);
        return true;
      }
    );
    assert.equal(calls, 1);
    await sameRejected(
      withLearningObjectiveReviewErrors({}, () => {
        throw original;
      }),
      original
    );
    await sameRejected(
      withLearningObjectiveReviewErrors(Object.create({ reviewBaseline: review().reviewBaseline }), () =>
        Promise.reject(original)
      ),
      original
    );
  }
  const plainCycle = {};
  plainCycle.cause = plainCycle;
  for (const original of [
    null,
    undefined,
    false,
    7,
    'failure',
    new Error('ordinary'),
    plainCycle,
    { code: '40001' },
    { code: '40P01' },
    { code: 'P2010', meta: { code: 40001 } },
    { code: 'P2010', meta: { code: '23505' } },
    { code: 'P2010' },
    { code: 'DOMAIN_CONFLICT', statusCode: 409, cause: { code: 'P2034' } },
    { code: 'P2034', statusCode: 409 },
    { cause: () => ({ code: 'P2034' }) }
  ])
    await sameRejected(
      withLearningObjectiveReviewErrors(review(), () => {
        throw original;
      }),
      original
    );
});

test('review wrapper preserves legacy malformed code/getter semantics even without a baseline', async () => {
  for (const input of [{}, review()]) {
    for (const code of [1, 1n, true, {}, Symbol('code')]) {
      await assert.rejects(
        withLearningObjectiveReviewErrors(input, () => {
          throw { code, statusCode: 500 };
        }),
        TypeError
      );
    }
    const failure = new Error('code getter');
    await sameRejected(
      withLearningObjectiveReviewErrors(input, () => {
        throw {
          get code() {
            throw failure;
          }
        };
      }),
      failure
    );
  }
  for (const statusCode of [500.5, '500', undefined]) {
    const original = { code: 1, statusCode };
    await sameRejected(
      withLearningObjectiveReviewErrors(review(), () => {
        throw original;
      }),
      original
    );
  }
  const original = { code: 0, statusCode: 500, cause: { code: 'P2034' } };
  await assert.rejects(
    withLearningObjectiveReviewErrors(review(), () => {
      throw original;
    }),
    domain('LEARNING_OBJECTIVE_UPDATE_CONFLICT', 409)
  );
});

const fields = ['title', 'canonicalStatement', 'userExplanation', 'knowledgeType', 'importance', 'sourceMode'];
const candidate = () => ({ reviewStatus: 'candidate', ...Object.fromEntries(fields.map(field => [field, field])) });
const record = (overrides = {}) => ({
  sourceType: 'manual',
  id: 'a',
  sourceId: 's',
  noteId: 'n',
  noteVersionId: 'v',
  annotationId: 'ann',
  quoteText: 'quote',
  headingPath: ['h'],
  ...overrides
});
const input = (overrides = {}) => ({ quoteText: ' quote ', headingPath: ['h'], ...overrides });
const matches = (item, records = [record()], inputs = [input()], dto = candidate()) =>
  matchesKnowledgeCandidateRequest(item, dto, records, inputs);

test('candidate retry requires exact fields/status, preserves evidence order and source defaults', () => {
  assert.equal(matches(candidate()), true);
  for (const field of fields) assert.equal(matches({ ...candidate(), [field]: null }), false);
  for (const item of [
    { ...candidate(), deletedAt: 'now' },
    { ...candidate(), reviewStatus: 'confirmed' }
  ])
    assert.equal(matches(item), false);
  assert.equal(matches({ ...candidate(), deletedAt: 0 }), true);
  assert.equal(matches(candidate(), [], []), true);
  assert.equal(matches(candidate(), [], [input()]), false);
  assert.equal(
    matches(candidate(), [record(), record({ quoteText: 'second' })], [input({ quoteText: 'second' }), input()]),
    false
  );
  assert.equal(matches(candidate(), [record()], [input({ sourceType: null })]), true);
  assert.equal(matches(candidate(), [record()], [input({ sourceType: '' })]), false);
  const objectValue = {};
  assert.equal(matches({ ...candidate(), title: objectValue }, [], [], { ...candidate(), title: objectValue }), true);
  assert.equal(matches({ ...candidate(), title: {} }, [], [], { ...candidate(), title: {} }), false);
});

test('candidate retry only compares supplied identifiers using String and trim', () => {
  for (const field of ['id', 'sourceId', 'noteId', 'noteVersionId', 'annotationId']) {
    for (const value of [null, undefined])
      assert.equal(matches(candidate(), [record()], [input({ [field]: value })]), true);
    for (const value of [42, 42n, true, Symbol('id'), { toString: () => 'object' }]) {
      assert.equal(matches(candidate(), [record({ [field]: String(value) })], [input({ [field]: value })]), true);
    }
    assert.equal(matches(candidate(), [record({ [field]: 'key' })], [input({ [field]: ' key ' })]), true);
    assert.equal(matches(candidate(), [record({ [field]: ' key ' })], [input({ [field]: ' key ' })]), false);
    assert.equal(matches(candidate(), [record()], [input({ [field]: '' })]), false);
  }
});

test('candidate annotation bypasses quote/heading reads, but not identifier matching', () => {
  const annotation = input({ sourceType: 'annotation' });
  for (const field of ['quoteText', 'headingPath'])
    Object.defineProperty(annotation, field, {
      get() {
        throw new Error('must not read');
      }
    });
  assert.equal(matches(candidate(), [record({ sourceType: 'annotation' })], [annotation]), true);
  assert.equal(
    matches(
      candidate(),
      [record({ sourceType: 'annotation' })],
      [
        {
          ...{ sourceType: 'annotation', id: 'different' },
          get quoteText() {
            throw new Error('must not read');
          }
        }
      ]
    ),
    false
  );
});

test('candidate quote String and heading JSON serialization retain coercion and errors', () => {
  for (const value of [null, undefined]) {
    assert.equal(
      matches(
        candidate(),
        [record({ quoteText: '', headingPath: [] })],
        [input({ quoteText: value, headingPath: value })]
      ),
      true
    );
  }
  for (const value of [42, 42n, true, Symbol('quote'), { toString: () => ' quote ' }]) {
    assert.equal(
      matches(candidate(), [record({ quoteText: String(value).trim() })], [input({ quoteText: value })]),
      true
    );
  }
  assert.equal(matches(candidate(), [record({ headingPath: [null] })], [input({ headingPath: [undefined] })]), true);
  assert.equal(
    matches(candidate(), [record({ headingPath: { a: 1, b: 2 } })], [input({ headingPath: { b: 2, a: 1 } })]),
    false
  );
  assert.equal(matches(candidate(), [record({ headingPath: undefined })], [input({ headingPath: () => {} })]), true);
  const cycle = [];
  cycle.push(cycle);
  for (const headingPath of [[1n], cycle])
    assert.throws(() => matches(candidate(), [record()], [input({ headingPath })]), TypeError);
  const failure = new Error('coercion');
  sameThrown(
    () =>
      matches(
        candidate(),
        [record()],
        [
          input({
            quoteText: {
              toString() {
                throw failure;
              }
            }
          })
        ]
      ),
    failure
  );
  sameThrown(
    () =>
      matches(
        candidate(),
        [record()],
        [
          input({
            headingPath: {
              toJSON() {
                throw failure;
              }
            }
          })
        ]
      ),
    failure
  );
});

test('candidate getters preserve short-circuit ordering and repeated identifier reads', () => {
  const events = [];
  const item = candidate();
  Object.defineProperty(item, 'deletedAt', {
    get() {
      events.push('deleted');
      return 'deleted';
    }
  });
  assert.equal(matchesKnowledgeCandidateRequest(item, null, null, null), false);
  assert.deepEqual(events, ['deleted']);
  events.length = 0;
  const request = {
    get sourceType() {
      events.push('sourceType');
      return 'manual';
    },
    get id() {
      events.push('id');
      return ' a ';
    },
    get quoteText() {
      events.push('quote');
      return 'quote';
    },
    get headingPath() {
      events.push('heading');
      return {
        toJSON() {
          events.push('input JSON');
          return ['h'];
        }
      };
    }
  };
  assert.equal(
    matches(
      candidate(),
      [
        record({
          headingPath: {
            toJSON() {
              events.push('record JSON');
              return ['h'];
            }
          }
        })
      ],
      [request]
    ),
    true
  );
  assert.deepEqual(events, ['sourceType', 'id', 'id', 'quote', 'heading', 'input JSON', 'record JSON']);
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { AppError } from '../src/errors/app-error.js';

const baseline = process.env.KNOWRA_WORKSPACE_UTILS_BASELINE === '1';
const commit = 'e856ac5376c790a3f9251ece806ec8af8b7b94b5';
const root = new URL('../src/modules/knowledge/application/', import.meta.url);
const source = baseline
  ? execFileSync('git', ['show', `${commit}:apps/api/src/modules/knowledge/application/workspace-query-utils.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    }).replace("'./knowledge-errors.js'", JSON.stringify(new URL('knowledge-errors.js', root).href))
  : null;
const utils = await import(
  source
    ? `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    : new URL('workspace-query-utils.js', root)
);
const {
  parseWorkspaceQuery: parse,
  paginateWorkspaceItems: page,
  countBy,
  groupBy,
  matchesText,
  summarizeEvidenceStatus: evidence,
  summarizeSourceStatus: sources,
  encodeWorkspaceCursor: encode
} = utils;
const cursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const row = (id, updatedAt = '2026-01-01T00:00:00.000Z') => ({ id, updatedAt });
const errorIs = value => error => error === value;
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
function invalid(run, code) {
  assert.throws(run, error => error instanceof AppError && error.statusCode === 422 && error.code === code);
}

test('workspace JS bridge preserves every exported identity', { skip: baseline }, async () => {
  const ts = await import(new URL('workspace-query-utils.ts', root));
  assert.deepEqual(Object.keys(utils), Object.keys(ts));
  for (const key of Object.keys(utils)) assert.equal(utils[key], ts[key]);
});
test('workspace limits and frozen sort list remain unchanged', () => {
  assert.equal(utils.WORKSPACE_DEFAULT_LIMIT, 20);
  assert.equal(utils.WORKSPACE_MAX_LIMIT, 100);
  assert.deepEqual(utils.WORKSPACE_SORTS, ['updated-desc', 'updated-asc']);
  assert.equal(Object.isFrozen(utils.WORKSPACE_SORTS), true);
});
test('workspace query defaults and explicit undefined stay equivalent', () => {
  assert.deepEqual(parse(), parse(undefined));
  assert.deepEqual(parse(), {
    query: '',
    limit: 20,
    sort: 'updated-desc',
    cursor: null,
    reviewStatus: null,
    knowledgeType: null,
    evidenceStatus: null,
    questionType: null,
    difficulty: null,
    actionVerb: null,
    cognitiveLevel: null,
    knowledgeItemId: null,
    learningObjectiveId: null,
    examProfileId: null,
    kind: null,
    includeArchived: false,
    missingObjectives: false,
    missingQuestions: false,
    hasQuestions: null
  });
  assert.throws(() => parse(null), TypeError);
});
test('workspace numeric coercion accepts legacy integer inputs', () => {
  for (const [input, expected] of [
    [undefined, 20],
    [null, 20],
    ['2', 2],
    [true, 1],
    [1n, 1],
    [[3], 3]
  ])
    assert.equal(parse({ limit: input }).limit, expected);
});
test('workspace limit bounds and native conversion errors keep identity', () => {
  for (const limit of [0, -1, 101, NaN, Infinity, '', 'bad', false, {}])
    invalid(() => parse({ limit }), 'WORKSPACE_LIMIT_INVALID');
  assert.throws(() => parse({ limit: Symbol() }), TypeError);
  const thrown = {};
  assert.throws(
    () =>
      parse({
        limit: {
          valueOf() {
            throw thrown;
          }
        }
      }),
    errorIs(thrown)
  );
});
test('workspace sort validation runs after limit and before query getters', () => {
  const events = [];
  const input = {
    get limit() {
      events.push('limit');
      return 1;
    },
    get sort() {
      events.push('sort');
      return 'wrong';
    },
    get query() {
      throw new Error('must not read');
    }
  };
  invalid(() => parse(input), 'WORKSPACE_SORT_INVALID');
  assert.deepEqual(events, ['limit', 'sort']);
});
test('workspace text and optional fields use original String and locale operations', () => {
  const out = parse({
    query: '  İΣ  ',
    reviewStatus: 0,
    knowledgeType: false,
    kind: Symbol('kind'),
    sourceStatus: ' stale ',
    evidenceStatus: null
  });
  assert.equal(out.query, 'i̇ς');
  assert.equal(out.reviewStatus, '0');
  assert.equal(out.knowledgeType, 'false');
  assert.equal(out.kind, 'Symbol(kind)');
  assert.equal(out.evidenceStatus, 'stale');
});
test('workspace evidence alias uses nullish rather than falsy fallback', () => {
  let reads = 0;
  assert.equal(
    parse({
      evidenceStatus: '',
      get sourceStatus() {
        reads++;
        return 'stale';
      }
    }).evidenceStatus,
    null
  );
  assert.equal(reads, 0);
  assert.equal(
    parse({
      evidenceStatus: undefined,
      get sourceStatus() {
        reads++;
        return 'stale';
      }
    }).evidenceStatus,
    'stale'
  );
  assert.equal(reads, 1);
});
test('workspace input getters are neither cached nor reordered', () => {
  const keys = [
    'limit',
    'sort',
    'query',
    'cursor',
    'reviewStatus',
    'knowledgeType',
    'evidenceStatus',
    'sourceStatus',
    'questionType',
    'difficulty',
    'actionVerb',
    'cognitiveLevel',
    'knowledgeItemId',
    'learningObjectiveId',
    'examProfileId',
    'kind',
    'includeArchived',
    'missingObjectives',
    'missingQuestions',
    'hasQuestions'
  ];
  const events = [];
  const input = new Proxy(
    {},
    {
      get(_, key) {
        events.push(key);
        return undefined;
      }
    }
  );
  parse(input);
  assert.deepEqual(events, keys);
});
test('workspace boolean branches accept only original primitive variants', () => {
  for (const field of ['includeArchived', 'missingObjectives', 'missingQuestions', 'hasQuestions']) {
    for (const value of [true, 'true', false, 'false', null, undefined, ''])
      assert.equal(
        parse({ [field]: value })[field],
        value === true || value === 'true'
          ? true
          : value === false || value === 'false'
            ? false
            : field === 'hasQuestions'
              ? null
              : false
      );
    for (const value of [0, 1, 'TRUE', ' false ', {}, [], new Boolean(false)])
      invalid(() => parse({ [field]: value }), 'WORKSPACE_BOOLEAN_INVALID');
  }
});
test('workspace falsey cursors bypass all decoding', () => {
  for (const value of [undefined, null, false, 0, '', NaN, 0n]) assert.equal(parse({ cursor: value }).cursor, null);
});
test('workspace cursor JSON values are not strengthened to string-only fields', () => {
  assert.deepEqual(parse({ cursor: cursor({ id: 42, updatedAt: 1 }) }).cursor, { id: '42', updatedAt: '1' });
  assert.deepEqual(parse({ cursor: cursor({ id: ['x'], updatedAt: ['2026-01-01'] }) }).cursor, {
    id: 'x',
    updatedAt: '2026-01-01'
  });
});
test('workspace cursor rejects malformed, missing and invalid dates with domain error', () => {
  for (const value of [
    'not-json',
    cursor(null),
    cursor(4),
    cursor('string'),
    cursor([]),
    cursor({ id: 0, updatedAt: 1 }),
    cursor({ id: 'a', updatedAt: 0 }),
    cursor({ id: 'a', updatedAt: 'bad' })
  ])
    invalid(() => parse({ cursor: value }), 'WORKSPACE_CURSOR_INVALID');
});
test('workspace cursor wraps conversion and JSON parse exceptions instead of leaking identity', () => {
  const thrown = {};
  invalid(
    () =>
      parse({
        cursor: {
          toString() {
            throw thrown;
          }
        }
      }),
    'WORKSPACE_CURSOR_INVALID'
  );
  replace(
    JSON,
    'parse',
    () => {
      throw thrown;
    },
    () => invalid(() => parse({ cursor: 'x' }), 'WORKSPACE_CURSOR_INVALID')
  );
});
test('workspace decoded dynamic getters retain repeated reads and unvalidated later values', () => {
  const events = [];
  let id = 0,
    time = 0;
  const decoded = {
    get id() {
      events.push('id');
      return ++id === 1 ? 'ok' : Symbol('later');
    },
    get updatedAt() {
      events.push('updatedAt');
      return ++time === 1
        ? 'guard'
        : time === 2
          ? '2026-01-01'
          : {
              toString() {
                events.push('string');
                return 'not-a-date';
              }
            };
    }
  };
  const result = replace(
    JSON,
    'parse',
    () => decoded,
    () => parse({ cursor: 'x' }).cursor
  );
  assert.deepEqual(events, ['id', 'updatedAt', 'updatedAt', 'id', 'updatedAt', 'string']);
  assert.deepEqual(result, { id: 'Symbol(later)', updatedAt: 'not-a-date' });
});
test('workspace decoded Date rejects Symbol and BigInt through original wrapping', () => {
  for (const value of [Symbol(), 1n])
    replace(
      JSON,
      'parse',
      () => ({ id: 'x', updatedAt: value }),
      () => invalid(() => parse({ cursor: 'x' }), 'WORKSPACE_CURSOR_INVALID')
    );
});
test('workspace encoding keeps read order, JSON omission and BigInt failures', () => {
  const events = [];
  const record = {
    get updatedAt() {
      events.push('time');
      return undefined;
    },
    get id() {
      events.push('id');
      return 'x';
    }
  };
  assert.equal(Buffer.from(encode(record), 'base64url').toString(), '{"id":"x"}');
  assert.deepEqual(events, ['time', 'id']);
  assert.throws(() => encode({ id: 1n, updatedAt: 1 }), TypeError);
  const thrown = {};
  assert.throws(
    () =>
      encode({
        get updatedAt() {
          throw thrown;
        }
      }),
    errorIs(thrown)
  );
});
test('workspace pagination sorts a copied sequence and keeps source identities', () => {
  const a = row('a'),
    b = row('b', '2026-02-01');
  const input = [a, b];
  const result = page(input, parse({ limit: 1 }));
  assert.deepEqual(input, [a, b]);
  assert.equal(result.items[0], b);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.pagination.hasMore, true);
  assert.equal(result.pagination.nextCursor, encode(b));
  assert.deepEqual(page(input, parse({ sort: 'updated-asc' })).items, [a, b]);
});
test('workspace pagination supports iterables and resolves equal or invalid time by ID', () => {
  const result = page(new Set([row('b', 'bad'), row('a', 'bad')]), parse());
  assert.deepEqual(
    result.items.map(item => item.id),
    ['a', 'b']
  );
});
test('workspace exact cursor advances and stale cursor uses comparator fallback', () => {
  const rows = [row('a', '2026-03-01'), row('b', '2026-02-01'), row('c', '2026-01-01')];
  assert.deepEqual(page(rows, parse({ cursor: encode(rows[1]) })).items, [rows[2]]);
  assert.deepEqual(page(rows, parse({ cursor: encode(row('x', '2026-02-15')) })).items, [rows[1], rows[2]]);
  assert.deepEqual(page(rows, parse({ cursor: encode(row('x', '2025-01-01')) })).items, []);
});
test('workspace sort preserves original native Date coercion and thrown objects', () => {
  const thrown = {};
  assert.throws(
    () =>
      page(
        [
          row('a', {
            [Symbol.toPrimitive]() {
              throw thrown;
            }
          }),
          row('b')
        ],
        parse()
      ),
    errorIs(thrown)
  );
  for (const value of [1n, Symbol()]) assert.throws(() => page([row('a', value), row('b')], parse()), TypeError);
});
test('workspace iterator and comparator failures preserve partial effects', () => {
  const events = [];
  const thrown = {};
  const items = {
    *[Symbol.iterator]() {
      events.push('first');
      yield row('a');
      events.push('failure');
      throw thrown;
    }
  };
  assert.throws(() => page(items, parse()), errorIs(thrown));
  assert.deepEqual(events, ['first', 'failure']);
});
test('workspace matchesText skips values entirely for every falsey query', () => {
  for (const query of [undefined, null, false, 0, '', NaN, 0n]) assert.equal(matchesText(null, query), true);
});
test('workspace matchesText keeps coercion, sparse skipping and custom some result', () => {
  assert.equal(matchesText([null, 'FoO', Symbol('bar')], 'foo'), true);
  assert.equal(matchesText(new Array(3), 'undefined'), false);
  const marker = {};
  const values = {
    some(fn) {
      assert.equal(this, values);
      assert.equal(fn('Hello'), true);
      return marker;
    }
  };
  assert.equal(matchesText(values, 'hello'), marker);
});
test('workspace matchesText retains native includes RegExp error and coercion identity', () => {
  assert.throws(() => matchesText(['a'], /a/), TypeError);
  const thrown = {};
  assert.throws(
    () =>
      matchesText(
        [
          {
            toString() {
              throw thrown;
            }
          }
        ],
        'x'
      ),
    errorIs(thrown)
  );
});
test('workspace countBy uses nullish unknown key and skips sparse holes', () => {
  assert.deepEqual(
    countBy([null, undefined, '', false, 0, 'x', 'x'], value => value),
    { unknown: 2, '': 1, false: 1, 0: 1, x: 2 }
  );
  let calls = 0;
  assert.deepEqual(
    countBy(new Array(3), () => {
      calls++;
      return 'x';
    }),
    {}
  );
  assert.equal(calls, 0);
});
test('workspace countBy constructor and toString inherited values are strings not numbers', () => {
  const result = countBy(['constructor', 'toString', 'constructor'], value => value);
  assert.equal(result.constructor, String(Object) + '11');
  assert.equal(result.toString, String(Object.prototype.toString) + '1');
  assert.throws(() => result.toString(), TypeError);
  assert.throws(() => result.constructor(), TypeError);
});
test('workspace countBy __proto__ does not become an own count or alter prototype', () => {
  const result = countBy(['__proto__', '__proto__'], value => value);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.__proto__, Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
});
test('workspace countBy accepts symbol keys and repeats object key coercion', () => {
  const symbol = Symbol('key');
  const result = countBy([symbol, symbol], value => value);
  assert.equal(result[symbol], 2);
  const events = [];
  const key = {
    [Symbol.toPrimitive](hint) {
      events.push(hint);
      return 'x';
    }
  };
  assert.deepEqual(
    countBy([key], value => value),
    { x: 1 }
  );
  assert.deepEqual(events, ['string', 'string']);
});
test('workspace countBy inherited Symbol and BigInt keep native failures', () => {
  for (const inherited of [Symbol('bad'), 1n])
    replace(Object.prototype, 'workspaceCounter', inherited, () =>
      assert.throws(() => countBy([1], () => 'workspaceCounter'), TypeError)
    );
});
test('workspace countBy inherited objects retain addition conversion and exception identity', () => {
  const events = [];
  replace(
    Object.prototype,
    'workspaceCounter',
    {
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return 'legacy';
      }
    },
    () => assert.equal(countBy([1], () => 'workspaceCounter').workspaceCounter, 'legacy1')
  );
  assert.deepEqual(events, ['default']);
  const thrown = {};
  replace(
    Object.prototype,
    'workspaceCounter',
    {
      valueOf() {
        throw thrown;
      }
    },
    () => assert.throws(() => countBy([1], () => 'workspaceCounter'), errorIs(thrown))
  );
});
test('workspace countBy inherited getter and setter are not normalized away', () => {
  const events = [];
  Object.defineProperty(Object.prototype, 'workspaceCounter', {
    configurable: true,
    get() {
      events.push(['get', Object.hasOwn(this, 'workspaceCounter')]);
      return 4;
    },
    set(value) {
      events.push(['set', value]);
    }
  });
  try {
    const result = countBy([1], () => 'workspaceCounter');
    assert.equal(Object.hasOwn(result, 'workspaceCounter'), false);
    assert.deepEqual(events, [
      ['get', false],
      ['set', 5]
    ]);
  } finally {
    delete Object.prototype.workspaceCounter;
  }
});
test('workspace countBy custom reduce can replace accumulator and return arbitrary output', () => {
  const marker = {};
  const input = {
    reduce(fn, initial) {
      assert.equal(this, input);
      assert.deepEqual(initial, {});
      assert.deepEqual(fn({ x: 'old' }, 1), { x: 'old1' });
      return marker;
    }
  };
  assert.equal(
    countBy(input, () => 'x'),
    marker
  );
});
test('workspace countBy selector and dynamic reduce exceptions keep identity', () => {
  const thrown = {};
  assert.throws(
    () =>
      countBy([1], () => {
        throw thrown;
      }),
    errorIs(thrown)
  );
  assert.throws(
    () =>
      countBy(
        {
          get reduce() {
            throw thrown;
          }
        },
        () => ''
      ),
    errorIs(thrown)
  );
});
test('workspace groupBy preserves object key and record identities without coercion', () => {
  const key = {},
    a = { key },
    b = { key };
  const groups = groupBy([a, b], record => record.key);
  assert.deepEqual([...groups.keys()], [key]);
  assert.deepEqual(groups.get(key), [a, b]);
  assert.equal(groups.get(key)[0], a);
});
test('workspace groupBy skips sparse records and retains nullish keys', () => {
  assert.equal(
    groupBy(new Array(2), () => {
      throw new Error('hole');
    }).size,
    0
  );
  const result = groupBy([null, undefined], value => value);
  assert.deepEqual(result.get(null), [null]);
  assert.deepEqual(result.get(undefined), [undefined]);
});
test('workspace groupBy custom reduce retains receiver and arbitrary result', () => {
  const marker = {};
  const input = {
    reduce(fn, initial) {
      assert.equal(this, input);
      assert.equal(initial instanceof Map, true);
      assert.equal(fn(initial, 'x'), initial);
      assert.deepEqual(initial.get('key'), ['x']);
      return marker;
    }
  };
  assert.equal(
    groupBy(input, () => 'key'),
    marker
  );
});
test('workspace evidence statuses retain precedence and sparse length fallback', () => {
  assert.equal(evidence(), 'insufficient');
  assert.equal(evidence(new Array(1)), 'valid');
  for (const [statuses, expected] of [
    [['valid'], 'valid'],
    [['valid', 'insufficient'], 'insufficient'],
    [['insufficient', 'stale'], 'stale'],
    [['stale', 'invalid'], 'invalid']
  ])
    assert.equal(evidence(statuses.map(status => ({ status }))), expected);
});
test('workspace source statuses retain active/reanchored and stale precedence', () => {
  assert.equal(sources(), 'insufficient');
  assert.equal(sources(new Array(1)), 'insufficient');
  assert.equal(sources([{ status: 'invalid' }]), 'insufficient');
  assert.equal(sources([{ status: 'reanchored' }]), 'valid');
  assert.equal(sources([{ status: 'active' }, { status: 'stale' }]), 'stale');
});
test('workspace status map and includes remain dynamic and receiver-bound', () => {
  const events = [];
  const statuses = {
    length: 1,
    includes(value) {
      assert.equal(this, statuses);
      events.push(value);
      return false;
    }
  };
  const records = {
    map(fn) {
      assert.equal(this, records);
      assert.equal(fn({ status: 17 }), 17);
      return statuses;
    }
  };
  assert.equal(evidence(records), 'valid');
  assert.deepEqual(events, ['invalid', 'stale', 'insufficient']);
  events.length = 0;
  assert.equal(sources(records), 'insufficient');
  assert.deepEqual(events, ['stale', 'active', 'reanchored']);
});
test('workspace status dynamic truthiness and error identity stay intact', () => {
  assert.equal(evidence({ map: () => ({ includes: () => ({}) }) }), 'invalid');
  const thrown = {};
  assert.throws(
    () =>
      sources([
        {
          get status() {
            throw thrown;
          }
        }
      ]),
    errorIs(thrown)
  );
  assert.throws(() => evidence(null), TypeError);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const USAGE_CSV_HEADER =
  '\uFEFF时间,北京日期,状态,模型,输入token,输出token,缓存命中token,费用或占用(元),对话ID,价格版本,尝试ID\r\n';
export const syntheticUsageRow = (at, extra = {}) => ({ at, status: 'settled', costMicrounits: 1_000_000, ...extra });
const outputRow = (at, status = '已结算', cost = '1.000000') =>
  [at, '', status, '', '', '', '', cost, '', '', ''].join(',') + '\r\n';

// 每次工厂调用都新建可复用的闭合用例；不注册 node:test、不读取 Git。
export function usageExportContractCases(api) {
  const { usageCsv } = api;
  const cases = [];
  const add = (name, run) => cases.push({ name, run });
  add('synchronous string, exact length and empty BOM/header/trailing CRLF', () => {
    assert.deepEqual(Object.keys(api), ['usageCsv']);
    assert.equal(usageCsv.length, 1);
    assert.equal(typeof usageCsv({ rows: [], months: [] }), 'string');
    assert.equal(usageCsv({ rows: [], months: [] }), USAGE_CSV_HEADER);
  });
  for (const [label, value, expected] of [
    ['equals', '=1+2', "'=1+2"],
    ['plus', '+1', "'+1"],
    ['minus word', '-evil', "'-evil"],
    ['at', '@SUM(A1)', "'@SUM(A1)"],
    ['tab', '\tbad', "'\tbad"],
    ['CR', '\rbad', '"\'\rbad"'],
    ['LF only', '\nbad', '"\nbad"'],
    ['integer', '-12', '-12'],
    ['decimal', '-12.50', '-12.50'],
    ['exponent', '-1e3', "'-1e3"],
    ['bare decimal', '-.5', "'-.5"],
    ['leading space unchanged', ' =cmd', ' =cmd'],
    ['comma', 'a,b', '"a,b"'],
    ['quote', 'a"b', '"a""b"'],
    ['unicode', '中文😀', '中文😀'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['symbol display', Symbol('x'), 'Symbol(x)'],
    ['bigint display', 12n, '12']
  ])
    add(`cell ${label}`, () =>
      assert.equal(usageCsv({ rows: [syntheticUsageRow(value)], months: [] }), USAGE_CSV_HEADER + outputRow(expected))
    );
  add('both status labels and unknown/prototype/numeric/symbol lookup remain raw', () => {
    const statuses = [
      ['settled', '已结算'],
      ['unknown', '结果未知(按预留占用)'],
      ['unrecognized', ''],
      ['__proto__', '[object Object]'],
      ['constructor', 'function Object() { [native code] }'],
      [1, ''],
      [Symbol('status'), '']
    ];
    for (const [status, expected] of statuses)
      assert.equal(
        usageCsv({ rows: [syntheticUsageRow('t', { status })], months: [] }),
        USAGE_CSV_HEADER + outputRow('t', expected)
      );
  });
  add('native number division/toFixed and untyped coercions stay unchanged', () => {
    for (const [costMicrounits, expected] of [
      [0, '0.000000'],
      [-0, '0.000000'],
      [1, '0.000001'],
      [123456, '0.123456'],
      [-1, '-0.000001'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
      [-Infinity, "'-Infinity"],
      ['1000000', '1.000000'],
      [null, '0.000000'],
      [undefined, 'NaN'],
      [{ valueOf: () => 1000000 }, '1.000000']
    ]) {
      assert.equal(
        usageCsv({ rows: [syntheticUsageRow('t', { costMicrounits })], months: [] }),
        USAGE_CSV_HEADER + outputRow('t', '已结算', expected)
      );
    }
  });
  add('BigInt and Symbol costs still throw native TypeError', () => {
    for (const costMicrounits of [1n, Symbol()])
      assert.throws(() => usageCsv({ rows: [syntheticUsageRow('t', { costMicrounits })], months: [] }), TypeError);
  });
  add('month output, exact position, two month getter reads and mixed display types', () => {
    const events = [];
    let n = 0;
    const month = {
      get month() {
        events.push(`month:${++n}`);
        return n === 1 ? '2026-05' : '2026-06';
      },
      requests: 2,
      inputTokens: 150,
      outputTokens: 15,
      cacheHitTokens: 40,
      spentMicrounits: 500000
    };
    assert.equal(
      usageCsv({ rows: [syntheticUsageRow('t')], months: [month] }),
      USAGE_CSV_HEADER + outputRow('t') + '2026-05 月汇总(明细已折叠),2026-06,2 次请求,,150,15,40,0.500000,,,\r\n'
    );
    assert.deepEqual(events, ['month:1', 'month:2']);
  });
  add('template interpolation differs from String for Symbol month/requests', () => {
    assert.throws(() => usageCsv({ rows: [], months: [{ month: Symbol(), spentMicrounits: 0 }] }), TypeError);
    assert.throws(
      () => usageCsv({ rows: [], months: [{ month: '2026-05', requests: Symbol(), spentMicrounits: 0 }] }),
      TypeError
    );
  });
  add('destructuring and property/coercion order unchanged', () => {
    const events = [];
    const inputRow = new Proxy(
      syntheticUsageRow(
        {
          toString() {
            events.push('at:string');
            return 't';
          }
        },
        {
          status: {
            [Symbol.toPrimitive](hint) {
              events.push(`status:${hint}`);
              return 'settled';
            }
          },
          costMicrounits: {
            [Symbol.toPrimitive](hint) {
              events.push(`cost:${hint}`);
              return 1000000;
            }
          }
        }
      ),
      {
        get(target, key, receiver) {
          events.push(String(key));
          return Reflect.get(target, key, receiver);
        }
      }
    );
    const input = {
      get rows() {
        events.push('input:rows');
        return [inputRow];
      },
      get months() {
        events.push('input:months');
        return [];
      }
    };
    assert.equal(usageCsv(input), USAGE_CSV_HEADER + outputRow('t'));
    assert.deepEqual(events, [
      'input:rows',
      'input:months',
      'at',
      'day',
      'status',
      'status:string',
      'modelId',
      'inputTokens',
      'outputTokens',
      'cacheHitTokens',
      'costMicrounits',
      'cost:number',
      'conversationId',
      'priceVersion',
      'attemptId',
      'at:string'
    ]);
  });
  add('unknown fields are never read or included', () => {
    const value = syntheticUsageRow('t');
    for (const key of ['content', 'messages', 'apiKey', 'credentialRef'])
      Object.defineProperty(value, key, {
        get() {
          throw new Error(`must not read ${key}`);
        }
      });
    assert.equal(usageCsv({ rows: [value], months: [] }), USAGE_CSV_HEADER + outputRow('t'));
  });
  add('iterables preserve lazy order and duplicate rows, no sort/dedup', () => {
    const events = [];
    const a = syntheticUsageRow('z');
    function* rows() {
      events.push('r1');
      yield a;
      events.push('r2');
      yield syntheticUsageRow('a');
      events.push('r3');
      yield a;
      events.push('rdone');
    }
    function* months() {
      events.push('m1');
      yield { month: '2026-05', requests: 2, spentMicrounits: 0 };
      events.push('mdone');
    }
    assert.equal(
      usageCsv({ rows: rows(), months: months() }),
      USAGE_CSV_HEADER +
        outputRow('z') +
        outputRow('a') +
        outputRow('z') +
        '2026-05 月汇总(明细已折叠),2026-05,2 次请求,,,,,0.000000,,,\r\n'
    );
    assert.deepEqual(events, ['r1', 'r2', 'r3', 'rdone', 'm1', 'mdone']);
  });
  add('iterator closes on property error and does not begin months', () => {
    const sentinel = new Error('sentinel'),
      events = [];
    function* rows() {
      try {
        yield {
          get at() {
            throw sentinel;
          }
        };
        events.push('next');
      } finally {
        events.push('closed');
      }
    }
    const months = {
      [Symbol.iterator]() {
        events.push('months');
        return [][Symbol.iterator]();
      }
    };
    assert.throws(
      () => usageCsv({ rows: rows(), months }),
      error => error === sentinel
    );
    assert.deepEqual(events, ['closed']);
  });
  add('getter and coercion thrown object identity preserved', () => {
    const sentinel = {};
    assert.throws(
      () =>
        usageCsv({
          rows: [
            syntheticUsageRow({
              toString() {
                throw sentinel;
              }
            })
          ],
          months: []
        }),
      error => error === sentinel
    );
    assert.throws(
      () =>
        usageCsv({
          get rows() {
            throw sentinel;
          },
          get months() {
            throw new Error('wrong order');
          }
        }),
      error => error === sentinel
    );
  });
  add('null/missing/noniterable/sparse records keep TypeError', () => {
    for (const input of [
      undefined,
      null,
      {},
      { rows: null, months: [] },
      { rows: [], months: null },
      { rows: {}, months: [] },
      { rows: [null], months: [] },
      { rows: Array(1), months: [] },
      { rows: [], months: Array(1) }
    ])
      assert.throws(() => usageCsv(input), TypeError);
  });
  add('frozen inputs remain unchanged and custom array iterator is respected', () => {
    const value = Object.freeze(syntheticUsageRow('t'));
    const rows = Object.freeze([value]);
    const input = Object.freeze({ rows, months: Object.freeze([]) });
    assert.equal(usageCsv(input), USAGE_CSV_HEADER + outputRow('t'));
    assert.equal(input.rows[0], value);
    const ownIterator = [syntheticUsageRow('hidden')];
    ownIterator[Symbol.iterator] = function* () {
      yield value;
    };
    assert.equal(usageCsv({ rows: ownIterator, months: [] }), USAGE_CSV_HEADER + outputRow('t'));
  });

  for (const oracle of fixedUsageCsvOracles) {
    add(`fixed independent UTF-8 bytes and SHA-256: ${oracle.name}`, () => {
      const result = usageCsv(oracle.input());
      assert.equal(result, oracle.body);
      assert.deepEqual(Buffer.from(result, 'utf8'), Buffer.from(oracle.body, 'utf8'));
      assert.equal(Buffer.byteLength(result, 'utf8'), oracle.bytes);
      assert.equal(createHash('sha256').update(result, 'utf8').digest('hex'), oracle.sha256);
    });
  }

  add('formula boundaries protect only the original prefix and negative literal grammar', () => {
    for (const [value, expected] of [
      ['-', "'-"],
      ['-0', '-0'],
      ['-00.50', '-00.50'],
      ['-1.', "'-1."],
      ['-1\n', '"\'-1\n"'],
      ['+12.5', "'+12.5"],
      ['-0x10', "'-0x10"],
      [' \t=1', ' \t=1'],
      ['\n=1', '"\n=1"'],
      ['\uFEFF=1', '\uFEFF=1'],
      ["'=1", "'=1"],
      ['=a,"b"', '"\'=a,""b"""'],
      [false, 'false'],
      [0, '0']
    ]) {
      assert.equal(usageCsv({ rows: [syntheticUsageRow(value)], months: [] }), USAGE_CSV_HEADER + outputRow(expected));
    }
  });

  add('fractional microunits, signed rounded zero and exponential large numbers retain toFixed semantics', () => {
    for (const [value, expected] of [
      [0.1, '0.000000'],
      [-0.1, '-0.000000'],
      [123456.789, '0.123457'],
      [-123456.789, '-0.123457'],
      [1e27, '1e+21'],
      [true, '0.000001'],
      ['', '0.000000']
    ]) {
      assert.equal(
        usageCsv({ rows: [syntheticUsageRow('t', { costMicrounits: value })], months: [] }),
        USAGE_CSV_HEADER + outputRow('t', '已结算', expected)
      );
      assert.equal(
        usageCsv({ rows: [], months: [{ month: 'm', requests: 1, spentMicrounits: value }] }),
        USAGE_CSV_HEADER + `m 月汇总(明细已折叠),m,1 次请求,,,,,${expected},,,\r\n`
      );
    }
  });

  add('missing status and inherited row fields are not rejected or replaced', () => {
    assert.equal(
      usageCsv({ rows: [{ at: 't', costMicrounits: 1000000 }], months: [] }),
      USAGE_CSV_HEADER + outputRow('t', '')
    );
    const value = Object.create({ at: 'inherited', status: 'unknown', costMicrounits: 2000000 });
    assert.equal(
      usageCsv({ rows: [value], months: [] }),
      USAGE_CSV_HEADER + outputRow('inherited', '结果未知(按预留占用)', '2.000000')
    );
  });

  add('input destructuring reads months before any rows iterator and propagates the exact failure', () => {
    const marker = Object.freeze({ failure: 'months getter' });
    const events = [];
    const rows = {
      [Symbol.iterator]() {
        events.push('rows iterator');
        throw new Error('must not iterate');
      }
    };
    const input = {
      get rows() {
        events.push('rows');
        return rows;
      },
      get months() {
        events.push('months');
        throw marker;
      }
    };
    assert.throws(
      () => usageCsv(input),
      error => error === marker
    );
    assert.deepEqual(events, ['rows', 'months']);
  });

  add('month template conversions and second month read retain exact getter and coercion order', () => {
    const events = [];
    const stringValue = (key, value) => ({
      [Symbol.toPrimitive](hint) {
        events.push(`${key}:${hint}`);
        return value;
      }
    });
    const raw = {
      month: stringValue('month', 'm'),
      requests: stringValue('requests', 2),
      inputTokens: stringValue('input', 'i'),
      outputTokens: stringValue('output', 'o'),
      cacheHitTokens: stringValue('cache', 'c'),
      spentMicrounits: stringValue('cost', 500000)
    };
    const month = new Proxy(raw, {
      get(target, key, receiver) {
        events.push(`get:${String(key)}`);
        return Reflect.get(target, key, receiver);
      }
    });
    assert.equal(
      usageCsv({ rows: [], months: [month] }),
      USAGE_CSV_HEADER + 'm 月汇总(明细已折叠),m,2 次请求,,i,o,c,0.500000,,,\r\n'
    );
    assert.deepEqual(events, [
      'get:month',
      'month:string',
      'get:month',
      'get:requests',
      'requests:string',
      'get:inputTokens',
      'get:outputTokens',
      'get:cacheHitTokens',
      'get:spentMicrounits',
      'cost:number',
      'month:string',
      'input:string',
      'output:string',
      'cache:string'
    ]);
  });

  add('all display coercions follow complete row projection exactly once in column order', () => {
    const events = [];
    const fields = [
      'at',
      'day',
      'modelId',
      'inputTokens',
      'outputTokens',
      'cacheHitTokens',
      'conversationId',
      'priceVersion',
      'attemptId'
    ];
    const value = syntheticUsageRow('ignored');
    for (const key of fields) {
      Object.defineProperty(value, key, {
        get() {
          events.push(`get:${key}`);
          return {
            [Symbol.toPrimitive](hint) {
              events.push(`coerce:${key}:${hint}`);
              return key;
            }
          };
        }
      });
    }
    assert.equal(
      usageCsv({ rows: [value], months: [] }),
      USAGE_CSV_HEADER +
        'at,day,已结算,modelId,inputTokens,outputTokens,cacheHitTokens,1.000000,conversationId,priceVersion,attemptId\r\n'
    );
    assert.deepEqual(events, [...fields.map(key => `get:${key}`), ...fields.map(key => `coerce:${key}:string`)]);
  });

  add('row coercion is interleaved with yields rather than materializing either iterable', () => {
    const events = [];
    let at = 'first';
    const shared = syntheticUsageRow({
      toString() {
        events.push(`string:${at}`);
        return at;
      }
    });
    function* rows() {
      events.push('yield:first');
      yield shared;
      at = 'second';
      events.push('yield:second');
      yield shared;
      events.push('rows:done');
    }
    function* months() {
      events.push('month:yield');
      yield {
        month: {
          toString() {
            events.push('month:string');
            return 'm';
          }
        },
        requests: 0,
        spentMicrounits: 0
      };
      events.push('months:done');
    }
    assert.equal(
      usageCsv({ rows: rows(), months: months() }),
      USAGE_CSV_HEADER +
        outputRow('first') +
        outputRow('second') +
        'm 月汇总(明细已折叠),m,0 次请求,,,,,0.000000,,,\r\n'
    );
    assert.deepEqual(events, [
      'yield:first',
      'string:first',
      'yield:second',
      'string:second',
      'rows:done',
      'month:yield',
      'month:string',
      'month:string',
      'months:done'
    ]);
  });

  add('month generators retain source order and duplicate identity, and arrays honor their own iterator', () => {
    const month = { month: 'z', requests: 1, spentMicrounits: 0 };
    const body = 'z 月汇总(明细已折叠),z,1 次请求,,,,,0.000000,,,\r\n';
    function* months() {
      yield month;
      yield { ...month, month: 'a' };
      yield month;
    }
    assert.equal(
      usageCsv({ rows: [], months: months() }),
      USAGE_CSV_HEADER + body + 'a 月汇总(明细已折叠),a,1 次请求,,,,,0.000000,,,\r\n' + body
    );
    const array = [null];
    array[Symbol.iterator] = function* () {
      yield month;
    };
    assert.equal(usageCsv({ rows: [], months: array }), USAGE_CSV_HEADER + body);
    assert.equal(
      usageCsv({ rows: new Set([syntheticUsageRow('set')]), months: new Set([month]) }),
      USAGE_CSV_HEADER + outputRow('set') + body
    );
  });

  add('row and month projection never enumerates or writes source objects or reads hidden fields', () => {
    const fail = () => {
      throw new Error('source must not be enumerated, changed, or leaked');
    };
    const protect = value => {
      for (const key of ['content', 'messages', 'apiKey', 'credentialRef'])
        Object.defineProperty(value, key, { enumerable: true, get: fail });
      return new Proxy(Object.freeze(value), { ownKeys: fail, set: fail, defineProperty: fail, deleteProperty: fail });
    };
    const row = protect(syntheticUsageRow('safe'));
    const month = protect({ month: 'm', requests: 0, spentMicrounits: 0 });
    assert.equal(
      usageCsv(Object.freeze({ rows: Object.freeze([row]), months: Object.freeze([month]) })),
      USAGE_CSV_HEADER + outputRow('safe') + 'm 月汇总(明细已折叠),m,0 次请求,,,,,0.000000,,,\r\n'
    );
  });

  add('status conversion failure prevents later fields, display coercion and months iteration', () => {
    const marker = { failure: 'status conversion' };
    const events = [];
    function* rows() {
      try {
        yield {
          at: {
            toString() {
              events.push('at:string');
              return 't';
            }
          },
          status: {
            [Symbol.toPrimitive](hint) {
              events.push(`status:${hint}`);
              throw marker;
            }
          },
          get modelId() {
            events.push('model');
            return undefined;
          },
          get costMicrounits() {
            events.push('cost');
            return undefined;
          }
        };
      } finally {
        events.push('closed');
      }
    }
    const months = {
      [Symbol.iterator]() {
        events.push('months');
        return [][Symbol.iterator]();
      }
    };
    assert.throws(
      () => usageCsv({ rows: rows(), months }),
      error => error === marker
    );
    assert.deepEqual(events, ['status:string', 'closed']);
  });

  add('amount conversion failure precedes later row getters and display coercion', () => {
    const marker = { failure: 'amount conversion' };
    const events = [];
    function* rows() {
      const value = syntheticUsageRow(
        {
          toString() {
            events.push('at:string');
            return 't';
          }
        },
        {
          costMicrounits: {
            [Symbol.toPrimitive](hint) {
              events.push(`cost:${hint}`);
              throw marker;
            }
          }
        }
      );
      Object.defineProperty(value, 'conversationId', {
        get() {
          events.push('conversation');
          return 'c';
        }
      });
      try {
        yield value;
      } finally {
        events.push('closed');
      }
    }
    assert.throws(
      () => usageCsv({ rows: rows(), months: [] }),
      error => error === marker
    );
    assert.deepEqual(events, ['cost:number', 'closed']);
  });

  add('month template error closes its iterator before a second month read or request getter', () => {
    const marker = { failure: 'month template' };
    const events = [];
    function* months() {
      try {
        yield {
          get month() {
            events.push('month');
            return {
              toString() {
                events.push('string');
                throw marker;
              }
            };
          },
          get requests() {
            events.push('requests');
            return 0;
          }
        };
      } finally {
        events.push('closed');
      }
    }
    assert.throws(
      () => usageCsv({ rows: [], months: months() }),
      error => error === marker
    );
    assert.deepEqual(events, ['month', 'string', 'closed']);
  });

  add('iterator close errors cannot replace the original row or month projection exception', () => {
    for (const kind of ['rows', 'months']) {
      const original = { failure: `projection ${kind}` };
      const closing = { failure: `close ${kind}` };
      const events = [];
      const record =
        kind === 'rows'
          ? {
              get at() {
                throw original;
              }
            }
          : {
              get month() {
                throw original;
              }
            };
      const iterable = {
        [Symbol.iterator]() {
          return {
            next() {
              return { done: false, value: record };
            },
            return() {
              events.push('return');
              throw closing;
            }
          };
        }
      };
      const input = { rows: [], months: [], [kind]: iterable };
      assert.throws(
        () => usageCsv(input),
        error => error === original
      );
      assert.deepEqual(events, ['return']);
    }
  });

  add('iterator protocol exceptions do not spuriously close an iterator', () => {
    for (const kind of ['rows', 'months']) {
      for (const phase of ['next', 'done', 'value']) {
        const marker = { kind, phase };
        let closed = 0;
        const iterable = {
          [Symbol.iterator]() {
            return {
              next() {
                if (phase === 'next') throw marker;
                return {
                  get done() {
                    if (phase === 'done') throw marker;
                    return false;
                  },
                  get value() {
                    throw marker;
                  }
                };
              },
              return() {
                closed++;
                return { done: true };
              }
            };
          }
        };
        assert.throws(
          () => usageCsv({ rows: [], months: [], [kind]: iterable }),
          error => error === marker
        );
        assert.equal(closed, 0);
      }
    }
  });

  add('iterator acquisition and next preserve receiver, single acquisition and zero argument calls', () => {
    for (const kind of ['rows', 'months']) {
      const calls = [];
      const iterator = {
        next(...args) {
          assert.equal(this, iterator);
          calls.push(args.length);
          return {
            done: calls.length > 1,
            value: kind === 'rows' ? syntheticUsageRow('t') : { month: 'm', requests: 0, spentMicrounits: 0 }
          };
        }
      };
      let acquired = 0;
      const iterable = {
        [Symbol.iterator](...args) {
          assert.equal(this, iterable);
          assert.equal(args.length, 0);
          acquired++;
          return iterator;
        }
      };
      const expected = kind === 'rows' ? outputRow('t') : 'm 月汇总(明细已折叠),m,0 次请求,,,,,0.000000,,,\r\n';
      assert.equal(usageCsv({ rows: [], months: [], [kind]: iterable }), USAGE_CSV_HEADER + expected);
      assert.equal(acquired, 1);
      assert.deepEqual(calls, [0, 0]);
    }
  });

  add('month Symbol and BigInt amount failures retain native TypeError and close iteration', () => {
    for (const value of [1n, Symbol('cost')]) {
      let closed = false;
      function* months() {
        try {
          yield { month: 'm', requests: 0, spentMicrounits: value };
        } finally {
          closed = true;
        }
      }
      assert.throws(() => usageCsv({ rows: [], months: months() }), TypeError);
      assert.equal(closed, true);
    }
  });

  return cases;
}

// 字节串独立手写；长度与 SHA-256 由外部 Python hashlib 校验，不从被测实现生成。
export const fixedUsageCsvOracles = [
  {
    name: 'empty header',
    input: () => ({ rows: [], months: [] }),
    body: '﻿时间,北京日期,状态,模型,输入token,输出token,缓存命中token,费用或占用(元),对话ID,价格版本,尝试ID\r\n',
    bytes: 132,
    sha256: '616b0447fe7faeb00073f8744f780d9699c66cbdc0ca3db7e64550a398b317c7'
  },
  {
    name: 'all columns and appended month',
    input: () => ({
      rows: [
        {
          at: '2026-10-08T01:02:03.000Z',
          day: '2026-10-08',
          status: 'settled',
          modelId: 'model-中😀',
          inputTokens: 101,
          outputTokens: 22,
          cacheHitTokens: 3,
          costMicrounits: 123456,
          conversationId: 'conversation-4',
          priceVersion: 'price-5',
          attemptId: 'attempt-6'
        }
      ],
      months: [
        {
          month: '2026-05',
          requests: 7,
          inputTokens: 808,
          outputTokens: 99,
          cacheHitTokens: 10,
          spentMicrounits: 500000
        }
      ]
    }),
    body: '﻿时间,北京日期,状态,模型,输入token,输出token,缓存命中token,费用或占用(元),对话ID,价格版本,尝试ID\r\n2026-10-08T01:02:03.000Z,2026-10-08,已结算,model-中😀,101,22,3,0.123456,conversation-4,price-5,attempt-6\r\n2026-05 月汇总(明细已折叠),2026-05,7 次请求,,808,99,10,0.500000,,,\r\n',
    bytes: 323,
    sha256: 'eca4832db24569345085efaf90634167baeb1b8c2c444b80e03aa7719c81b8ff'
  },
  {
    name: 'quoted formulas, CRLF, Unicode and mixed display types',
    input: () => ({
      rows: [
        {
          at: 't,"\r\n😀',
          day: '\t=day',
          status: 'unknown',
          modelId: '@model,one',
          inputTokens: -12,
          outputTokens: false,
          cacheHitTokens: { toString: () => 'cache"hit' },
          costMicrounits: -1250000,
          conversationId: '+conv',
          priceVersion: '=price',
          attemptId: 'a\nb'
        }
      ],
      months: [
        {
          month: '+2026,05',
          requests: '=2',
          inputTokens: null,
          outputTokens: Symbol('out'),
          cacheHitTokens: 1n,
          spentMicrounits: 500000
        }
      ]
    }),
    body: '﻿时间,北京日期,状态,模型,输入token,输出token,缓存命中token,费用或占用(元),对话ID,价格版本,尝试ID\r\n"t,""\r\n😀",\'\t=day,结果未知(按预留占用),"\'@model,one",-12,false,"cache""hit",-1.250000,\'+conv,\'=price,"a\nb"\r\n"\'+2026,05 月汇总(明细已折叠)","\'+2026,05",\'=2 次请求,,,Symbol(out),1,0.500000,,,\r\n',
    bytes: 345,
    sha256: 'ac669f6411171b6af17f100957bf994443c9e4dadda2112470803b93bf0341b6'
  },
  {
    name: 'missing and null month interpolation is not blanked',
    input: () => ({ rows: [], months: [{ spentMicrounits: 0 }, { month: null, requests: null, spentMicrounits: 0 }] }),
    body: '﻿时间,北京日期,状态,模型,输入token,输出token,缓存命中token,费用或占用(元),对话ID,价格版本,尝试ID\r\nundefined 月汇总(明细已折叠),,undefined 次请求,,,,,0.000000,,,\r\nnull 月汇总(明细已折叠),,null 次请求,,,,,0.000000,,,\r\n',
    bytes: 272,
    sha256: 'bbfa57f2890329702092eb292453795f9fe49c33d5803db8468801981b6569c6'
  }
];

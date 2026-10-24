import assert from 'node:assert/strict';
import { AppError } from '../src/errors/app-error.js';

// 固定正文来自准确实际父提交，不在普通测试运行时读取 Git 或候选实现。
export const ownerBoundaryParent = '1cf2cdb1771ccabc6db9ec8c684c5e111048e034';
export const ownerBoundaryFrozenSource = String.raw`import { createAppError } from '../errors/app-error.js';

function normalizeOwnerId(value) {
  const ownerId = String(value ?? '').trim();
  return ownerId || null;
}

export function assertSpacesOwnedBy(spaces = [], ownerId) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    throw createAppError(
      'OWNER_ID_REQUIRED',
      'A server owner id is required',
      500
    );
  }

  const foreignSpaces = spaces.filter((space) => {
    const spaceOwnerId = normalizeOwnerId(space?.userId);
    return spaceOwnerId && spaceOwnerId !== normalizedOwnerId;
  });
  if (foreignSpaces.length > 0) {
    throw createAppError(
      'OWNER_BOUNDARY_VIOLATION',
      'Knowledge storage contains spaces owned by another user',
      409,
      {
        ownerId: normalizedOwnerId,
        spaceIds: foreignSpaces.map((space) => space.id)
      }
    );
  }
  return normalizedOwnerId;
}

export function resolveSingleOwnerId({
  configuredOwnerId,
  spaces = [],
  fallbackOwnerId = 'demo'
} = {}) {
  const configured = normalizeOwnerId(configuredOwnerId);
  const storedOwners = [...new Set(
    spaces.map((space) => normalizeOwnerId(space?.userId)).filter(Boolean)
  )];
  if (storedOwners.length > 1) {
    throw createAppError(
      'OWNER_BOUNDARY_VIOLATION',
      'Knowledge storage contains multiple owners',
      409,
      { ownerIds: storedOwners }
    );
  }

  const ownerId = configured
    ?? storedOwners[0]
    ?? normalizeOwnerId(fallbackOwnerId)
    ?? 'demo';
  assertSpacesOwnedBy(spaces, ownerId);
  return ownerId;
}

export async function assertPostgresOwnerBoundary(client, ownerId) {
  const spaces = await client.knowledgeSpace.findMany({
    select: { id: true, userId: true }
  });
  return assertSpacesOwnedBy(spaces, ownerId);
}
`;

export function caught(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return assert.fail('Expected a synchronous exception');
}

export function boundaryError(operation, code, message) {
  const error = caught(operation);
  assert.ok(error instanceof AppError);
  assert.equal(error.name, 'AppError');
  assert.equal(error.code, code);
  assert.equal(error.statusCode, code === 'OWNER_ID_REQUIRED' ? 500 : 409);
  assert.equal(error.message, message);
  assert.deepEqual(Object.keys(error), ['name', 'code', 'statusCode']);
  for (const key of ['ownerId', 'spaceIds', 'ownerIds', 'cause']) assert.equal(key in error, false);
  return error;
}

const REQUIRED = 'A server owner id is required';
const FOREIGN = 'Knowledge storage contains spaces owned by another user';
const MIXED = 'Knowledge storage contains multiple owners';

// 手写断言是固定 oracle；本文件本身不注册测试，历史叶子与变异都运行相同合同。
export function ownerBoundaryContractCases(api) {
  const { assertSpacesOwnedBy: check, resolveSingleOwnerId: resolve, assertPostgresOwnerBoundary: pg } = api;
  const cases = [];
  const add = (name, run) => cases.push({ name, run });
  const violation = (run, message = FOREIGN) => boundaryError(run, 'OWNER_BOUNDARY_VIOLATION', message);

  add('three exact exports retain synchronous and async function kinds and arities', () => {
    assert.deepEqual(Object.keys(api), ['assertPostgresOwnerBoundary', 'assertSpacesOwnedBy', 'resolveSingleOwnerId']);
    assert.deepEqual([check.length, resolve.length, pg.length], [0, 0, 2]);
    assert.deepEqual(
      [check.constructor.name, resolve.constructor.name, pg.constructor.name],
      ['Function', 'Function', 'AsyncFunction']
    );
    const receiver = new Proxy(
      {},
      {
        get() {
          return assert.fail('this must not be read');
        }
      }
    );
    assert.equal(check.call(receiver, [], 'owner'), 'owner');
    assert.equal(resolve.call(receiver), 'demo');
  });
  add('missing owner rejects before any spaces access and preserves exact AppError shape', () => {
    for (const owner of [undefined, null, '', ' \t\r\n', '\u00a0\u3000']) {
      const spaces = new Proxy([], {
        get() {
          return assert.fail('spaces accessed');
        }
      });
      boundaryError(() => check(spaces, owner), 'OWNER_ID_REQUIRED', REQUIRED);
    }
  });
  add('owner conversion is native String then trim, including falsy non-nullish and symbols', () => {
    for (const [owner, expected] of [
      [0, '0'],
      [-0, '0'],
      [false, 'false'],
      [true, 'true'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
      [2n, '2'],
      [Symbol('s'), 'Symbol(s)'],
      ['\u00a0 Owner \u3000', 'Owner']
    ]) {
      assert.equal(check([], owner), expected);
      assert.equal(resolve({ configuredOwnerId: owner }), expected);
      assert.equal(resolve({ fallbackOwnerId: owner }), expected);
    }
  });
  add('native coercion hint, toString before valueOf, and no value.trim lookup', () => {
    const events = [];
    const owner = {
      [Symbol.toPrimitive](hint) {
        events.push(hint);
        return ' x ';
      },
      get trim() {
        return assert.fail('custom trim accessed');
      }
    };
    assert.equal(check([], owner), 'x');
    assert.deepEqual(events, ['string']);
    const fallback = {
      toString() {
        events.push('toString');
        return {};
      },
      valueOf() {
        events.push('valueOf');
        return 0;
      }
    };
    assert.equal(check([], fallback), '0');
    assert.deepEqual(events, ['string', 'toString', 'valueOf']);
    assert.throws(
      () =>
        check([], {
          [Symbol.toPrimitive]() {
            return {};
          }
        }),
      TypeError
    );
  });
  for (const site of ['configured', 'fallback', 'request', 'stored']) {
    add(`${site} conversion preserves primitive exception identity`, () => {
      const sentinel = Symbol(site);
      const owner = {
        toString() {
          throw sentinel;
        }
      };
      assert.equal(
        caught(() => {
          if (site === 'configured') return resolve({ configuredOwnerId: owner });
          if (site === 'fallback') return resolve({ fallbackOwnerId: owner });
          if (site === 'request') return check([], owner);
          return check([{ userId: owner }], 'owner');
        }),
        sentinel
      );
    });
  }
  add('matching and empty space owners pass without id reads and without mutation', () => {
    const rows = [undefined, null, '', '\n ', ' owner '].map(userId =>
      Object.freeze({
        userId,
        get id() {
          return assert.fail('id accessed');
        }
      })
    );
    Object.freeze(rows);
    assert.equal(check(rows, 'owner'), 'owner');
    assert.equal(resolve(Object.freeze({ spaces: rows })), 'owner');
    assert.equal(Object.isFrozen(rows), true);
  });
  add('case-sensitive owner mismatch is not normalized to lowercase', () => {
    violation(() => check([{ id: 's', userId: 'Owner' }], 'owner'));
  });
  add('scan every owner before reading only foreign ids in input order', () => {
    const events = [];
    const rows = [
      ['a', 'owner'],
      ['b', 'other'],
      ['c', 'alien'],
      ['d', '']
    ].map(([id, userId]) => ({
      get userId() {
        events.push(`owner:${id}`);
        return userId;
      },
      get id() {
        events.push(`id:${id}`);
        return id;
      }
    }));
    violation(() => check(rows, 'owner'));
    assert.deepEqual(events, ['owner:a', 'owner:b', 'owner:c', 'owner:d', 'id:b', 'id:c']);
  });
  add('later owner getter exception wins over earlier foreign id getter', () => {
    const sentinel = {};
    const events = [];
    const rows = [
      {
        userId: 'foreign',
        get id() {
          events.push('id');
          throw 'id';
        }
      },
      {
        get userId() {
          events.push('owner');
          throw sentinel;
        }
      }
    ];
    assert.equal(
      caught(() => check(rows, 'owner')),
      sentinel
    );
    assert.deepEqual(events, ['owner']);
  });
  add('foreign ids stay raw and unread coercion, but getters can win over AppError', () => {
    const id = {
      toString() {
        return assert.fail('id coerced');
      }
    };
    violation(() => check([{ userId: 'foreign', id }], 'owner'));
    const sentinel = {};
    assert.equal(
      caught(() =>
        check(
          [
            {
              userId: 'foreign',
              get id() {
                throw sentinel;
              }
            }
          ],
          'owner'
        )
      ),
      sentinel
    );
  });
  add('nullish primitive rows retain old JS compatibility outside the static support domain', () => {
    const rows = [null, undefined, 0, false, 'raw', Symbol('row'), 2n];
    assert.equal(check(rows, 'owner'), 'owner');
    assert.equal(resolve({ spaces: rows }), 'demo');
    assert.equal(check(undefined, 'owner'), 'owner');
  });
  add('null collection native failure is ordered after required owner validation', () => {
    assert.throws(() => check(null, 'owner'), TypeError);
    assert.throws(() => resolve({ spaces: null }), TypeError);
    boundaryError(() => check(null, ''), 'OWNER_ID_REQUIRED', REQUIRED);
  });
  add('holes are skipped but inherited indexed owners are visited without cloning', () => {
    const events = [];
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, 1, {
      get() {
        events.push('inherited');
        return { userId: 'owner' };
      }
    });
    const rows = new Array(4);
    rows[2] = { userId: 'owner' };
    Object.setPrototypeOf(rows, prototype);
    assert.equal(resolve({ spaces: rows }), 'owner');
    assert.deepEqual(events, ['inherited', 'inherited']);
    assert.deepEqual(Object.keys(rows), ['2']);
    assert.equal(rows.length, 4);
  });
  add('native filter snapshots length while later existing owner entries remain live', () => {
    const events = [];
    const rows = [
      {
        get userId() {
          events.push('first');
          rows.push({
            get userId() {
              return assert.fail('appended visited');
            }
          });
          rows[1] = {
            userId: 'foreign',
            get id() {
              events.push('id');
              return 'changed';
            }
          };
          return 'owner';
        }
      },
      { userId: 'owner' }
    ];
    violation(() => check(rows, 'owner'));
    assert.deepEqual(events, ['first', 'id']);
    assert.equal(rows.length, 3);
  });
  add('own filter receiver, callback raw result and foreign map receiver are preserved', () => {
    const events = [];
    const foreign = {
      get length() {
        events.push('length');
        return 1;
      },
      map(callback) {
        assert.equal(this, foreign);
        events.push('ids');
        assert.equal(callback({ id: 7 }), 7);
        return { unused: true };
      }
    };
    const rows = {
      filter(callback) {
        assert.equal(this, rows);
        events.push('filter');
        assert.deepEqual([{}, { userId: '' }, { userId: 'owner' }, { userId: 'foreign' }].map(callback), [
          null,
          null,
          false,
          true
        ]);
        return foreign;
      }
    };
    violation(() => check(rows, 'owner'));
    assert.deepEqual(events, ['filter', 'length', 'ids']);
  });
  add('own filter result length uses greater-than coercion and skips map when not positive', () => {
    for (const length of [undefined, null, false, 0, -1, '', '0', NaN]) {
      assert.equal(
        check(
          {
            filter() {
              return {
                length,
                get map() {
                  return assert.fail('map accessed');
                }
              };
            }
          },
          'owner'
        ),
        'owner'
      );
    }
    const events = [];
    const foreign = {
      length: {
        [Symbol.toPrimitive](hint) {
          events.push(hint);
          return '1';
        }
      },
      map() {
        events.push('map');
        return null;
      }
    };
    violation(() =>
      check(
        {
          filter() {
            return foreign;
          }
        },
        'owner'
      )
    );
    assert.deepEqual(events, ['number', 'map']);
  });
  for (const site of ['filter lookup', 'filter call', 'length lookup', 'length conversion', 'map lookup', 'map call']) {
    add(`${site} preserves exception identity and prevents later work`, () => {
      const sentinel = { site };
      const foreign = {
        get length() {
          if (site === 'length lookup') throw sentinel;
          return site === 'length conversion'
            ? {
                valueOf() {
                  throw sentinel;
                }
              }
            : 1;
        },
        get map() {
          if (site === 'map lookup') throw sentinel;
          return () => {
            if (site === 'map call') throw sentinel;
            return assert.fail('unexpected map');
          };
        }
      };
      const rows = {
        get filter() {
          if (site === 'filter lookup') throw sentinel;
          return () => {
            if (site === 'filter call') throw sentinel;
            return foreign;
          };
        }
      };
      assert.equal(
        caught(() => check(rows, 'owner')),
        sentinel
      );
    });
  }
  add('noncallable methods and malformed filter outputs preserve native TypeErrors', () => {
    for (const rows of [
      { filter: null },
      {
        filter() {
          return null;
        }
      },
      {
        filter() {
          return { length: 1, map: null };
        }
      }
    ])
      assert.throws(() => check(rows, 'owner'), TypeError);
    for (const spaces of [
      { map: null },
      {
        map() {
          return null;
        }
      },
      {
        map() {
          return { filter: null };
        }
      }
    ])
      assert.throws(() => resolve({ spaces }), TypeError);
  });
  add('array species construction happens for both passes and for foreign id mapping', () => {
    const events = [];
    class Result extends Array {
      constructor(length) {
        super(length);
        events.push(['construct', length]);
      }
    }
    class Rows extends Array {
      static get [Symbol.species]() {
        events.push('species');
        return Result;
      }
    }
    assert.equal(resolve({ spaces: new Rows({ userId: 'owner' }) }), 'owner');
    assert.deepEqual(events, ['species', ['construct', 1], ['construct', 0], 'species', ['construct', 0]]);
    events.length = 0;
    violation(() => check(new Rows({ userId: 'foreign', id: 's' }), 'owner'));
    assert.deepEqual(events, ['species', ['construct', 0], ['construct', 1]]);
  });
  add('throwing array species preserves identity rather than replacing native methods', () => {
    const sentinel = {};
    class Rows extends Array {
      static get [Symbol.species]() {
        throw sentinel;
      }
    }
    assert.equal(
      caught(() => check(new Rows(), 'owner')),
      sentinel
    );
    assert.equal(
      caught(() => resolve({ spaces: new Rows() })),
      sentinel
    );
  });
  add('resolve defaults, undefined options, inherited options and primitive options are unchanged', () => {
    for (const options of [
      undefined,
      {},
      true,
      0,
      'primitive',
      { configuredOwnerId: undefined, spaces: undefined, fallbackOwnerId: undefined }
    ])
      assert.equal(resolve(options), 'demo');
    assert.equal(resolve(Object.create({ configuredOwnerId: ' owner ' })), 'owner');
    assert.throws(() => resolve(null), TypeError);
  });
  add('destructure configured, spaces, fallback once before any configured conversion', () => {
    const events = [];
    const options = {
      get configuredOwnerId() {
        events.push('configured');
        return {
          toString() {
            events.push('convert');
            return 'owner';
          }
        };
      },
      get spaces() {
        events.push('spaces');
        return [];
      },
      get fallbackOwnerId() {
        events.push('fallback');
        return {
          toString() {
            return assert.fail('fallback converted');
          }
        };
      },
      get unrelated() {
        return assert.fail('unrelated option read');
      }
    };
    assert.equal(resolve(options), 'owner');
    assert.deepEqual(events, ['configured', 'spaces', 'fallback', 'convert']);
  });
  for (const failed of ['configuredOwnerId', 'spaces', 'fallbackOwnerId']) {
    add(`resolve ${failed} getter fails before conversion and later option reads`, () => {
      const sentinel = {};
      const events = [];
      const options = {};
      for (const key of ['configuredOwnerId', 'spaces', 'fallbackOwnerId'])
        Object.defineProperty(options, key, {
          get() {
            events.push(key);
            if (key === failed) throw sentinel;
            return {
              toString() {
                return assert.fail('converted');
              }
            };
          }
        });
      assert.equal(
        caught(() => resolve(options)),
        sentinel
      );
      assert.deepEqual(
        events,
        ['configuredOwnerId', 'spaces', 'fallbackOwnerId'].slice(
          0,
          ['configuredOwnerId', 'spaces', 'fallbackOwnerId'].indexOf(failed) + 1
        )
      );
    });
  }
  add('configured conversion precedes first stored owner method access', () => {
    const sentinel = {};
    assert.equal(
      caught(() =>
        resolve({
          configuredOwnerId: {
            toString() {
              throw sentinel;
            }
          },
          spaces: {
            get map() {
              return assert.fail('map accessed');
            }
          }
        })
      ),
      sentinel
    );
  });
  add('first pass finishes before filter(Boolean), dedupes and prefers stored owner to fallback', () => {
    const events = [];
    const rows = [' x ', '', 'x', null].map((value, index) => ({
      get userId() {
        events.push(index);
        return value;
      }
    }));
    assert.equal(
      resolve({
        spaces: rows,
        fallbackOwnerId: {
          toString() {
            return assert.fail('fallback converted');
          }
        }
      }),
      'x'
    );
    assert.deepEqual(events, [0, 1, 2, 3, 0, 1, 2, 3]);
  });
  add('mixed stored owners reject before configured preference, ids or second pass', () => {
    const events = [];
    const rows = ['a', 'b', 'a'].map(owner => ({
      get userId() {
        events.push(owner);
        return owner;
      },
      get id() {
        return assert.fail('id read');
      }
    }));
    violation(
      () =>
        resolve({
          configuredOwnerId: 'a',
          spaces: rows,
          fallbackOwnerId: {
            toString() {
              return assert.fail('fallback converted');
            }
          }
        }),
      MIXED
    );
    assert.deepEqual(events, ['a', 'b', 'a']);
  });
  add('second verification pass observes changed getters and changed errors', () => {
    for (const next of ['other', '', undefined]) {
      let reads = 0;
      const events = [];
      const spaces = [
        {
          get userId() {
            events.push('owner');
            return ++reads === 1 ? 'owner' : next;
          },
          get id() {
            events.push('id');
            return 's';
          }
        }
      ];
      if (next === 'other') violation(() => resolve({ spaces }));
      else assert.equal(resolve({ spaces }), 'owner');
      assert.deepEqual(events, next === 'other' ? ['owner', 'owner', 'id'] : ['owner', 'owner']);
    }
    const sentinel = {};
    let reads = 0;
    assert.equal(
      caught(() =>
        resolve({
          spaces: [
            {
              get userId() {
                if (++reads === 2) throw sentinel;
                return 'owner';
              }
            }
          ]
        })
      ),
      sentinel
    );
  });
  add('fallback conversion is lazy but its option getter is eager', () => {
    const fallback = {
      toString() {
        return assert.fail('fallback converted');
      }
    };
    assert.equal(resolve({ configuredOwnerId: 'owner', fallbackOwnerId: fallback }), 'owner');
    assert.equal(resolve({ spaces: [{ userId: 'stored' }], fallbackOwnerId: fallback }), 'stored');
    for (const fallbackOwnerId of [undefined, null, '', ' \n ']) assert.equal(resolve({ fallbackOwnerId }), 'demo');
  });
  add('resolve own map and filter return values are consumed verbatim with exact receivers', () => {
    const events = [];
    const selected = {
      [Symbol.iterator]() {
        events.push('iterate');
        return ['owner'][Symbol.iterator]();
      }
    };
    const mapped = {
      filter(callback) {
        assert.equal(this, mapped);
        assert.equal(callback, Boolean);
        events.push('mapped filter');
        return selected;
      }
    };
    const rows = {
      map(callback) {
        assert.equal(this, rows);
        events.push('map');
        assert.equal(callback({ userId: ' x ' }), 'x');
        assert.equal(callback(null), null);
        return mapped;
      },
      filter(callback) {
        assert.equal(this, rows);
        events.push('verify');
        assert.equal(callback({ userId: 'owner' }), false);
        return [];
      }
    };
    assert.equal(resolve({ spaces: rows }), 'owner');
    assert.deepEqual(events, ['map', 'mapped filter', 'iterate', 'verify']);
  });
  add('resolve preserves custom returned iterable order and nullish selection, not truthy selection', () => {
    for (const raw of [false, 0, '']) {
      const rows = {
        map() {
          return {
            filter() {
              return [raw];
            }
          };
        },
        filter() {
          return [];
        }
      };
      if (raw === '') boundaryError(() => resolve({ spaces: rows }), 'OWNER_ID_REQUIRED', REQUIRED);
      else assert.equal(resolve({ spaces: rows }), raw);
    }
    for (const raw of [undefined, null]) {
      const rows = {
        map() {
          return {
            filter() {
              return [raw];
            }
          };
        },
        filter() {
          return [];
        }
      };
      assert.equal(resolve({ spaces: rows, fallbackOwnerId: 'fallback' }), 'fallback');
    }
  });
  for (const site of ['map lookup', 'map call', 'filter lookup', 'filter call', 'iterator lookup', 'iterator next']) {
    add(`resolve ${site} throws the original error before verification`, () => {
      const sentinel = {};
      const iterable = {
        get [Symbol.iterator]() {
          if (site === 'iterator lookup') throw sentinel;
          return () => ({
            next() {
              throw sentinel;
            }
          });
        }
      };
      const mapped = {
        get filter() {
          if (site === 'filter lookup') throw sentinel;
          return () => {
            if (site === 'filter call') throw sentinel;
            return iterable;
          };
        }
      };
      const rows = {
        get map() {
          if (site === 'map lookup') throw sentinel;
          return () => {
            if (site === 'map call') throw sentinel;
            return mapped;
          };
        },
        get filter() {
          return assert.fail('verification reached');
        }
      };
      assert.equal(
        caught(() => resolve({ spaces: rows })),
        sentinel
      );
    });
  }
  add('PostgreSQL query is fresh, exact, unfiltered and retains method receiver and key order', async () => {
    const queries = [];
    const delegate = {
      findMany(query) {
        assert.equal(this, delegate);
        queries.push(query);
        return [{ userId: 'owner' }];
      }
    };
    assert.equal(await pg({ knowledgeSpace: delegate }, ' owner '), 'owner');
    assert.equal(await pg({ knowledgeSpace: delegate }, 'owner'), 'owner');
    assert.equal(queries.length, 2);
    assert.notEqual(queries[0], queries[1]);
    assert.notEqual(queries[0].select, queries[1].select);
    for (const query of queries) {
      assert.deepEqual(query, { select: { id: true, userId: true } });
      assert.deepEqual(Object.keys(query), ['select']);
      assert.deepEqual(Object.keys(query.select), ['id', 'userId']);
      assert.equal(Object.getPrototypeOf(query), Object.prototype);
    }
  });
  add('PostgreSQL owner validation happens only after query await, even for sync arrays', async () => {
    const events = [];
    const owner = {
      toString() {
        events.push('owner');
        return 'owner';
      }
    };
    const result = pg(
      {
        get knowledgeSpace() {
          events.push('delegate');
          return {
            get findMany() {
              events.push('method');
              return () => {
                events.push('query');
                return [];
              };
            }
          };
        }
      },
      owner
    );
    assert.ok(result instanceof Promise);
    assert.deepEqual(events, ['delegate', 'method', 'query']);
    assert.equal(await result, 'owner');
    assert.deepEqual(events, ['delegate', 'method', 'query', 'owner']);
    let calls = 0;
    await assert.rejects(
      pg(
        {
          knowledgeSpace: {
            findMany() {
              calls++;
              return [];
            }
          }
        },
        ''
      ),
      error => error instanceof AppError && error.code === 'OWNER_ID_REQUIRED'
    );
    assert.equal(calls, 1);
  });
  add('PostgreSQL waits for unresolved promise before owner conversion', async () => {
    const events = [];
    let settle;
    const pending = new Promise(resolvePromise => {
      settle = resolvePromise;
    });
    const result = pg(
      {
        knowledgeSpace: {
          findMany() {
            events.push('query');
            return pending;
          }
        }
      },
      {
        toString() {
          events.push('owner');
          return 'owner';
        }
      }
    );
    assert.deepEqual(events, ['query']);
    settle([]);
    assert.equal(await result, 'owner');
    assert.deepEqual(events, ['query', 'owner']);
  });
  add('PostgreSQL assimilates thenables once with their receiver, ignoring subsequent settlement', async () => {
    const events = [];
    const thenable = {
      get then() {
        events.push('then getter');
        return function (fulfill, reject) {
          assert.equal(this, thenable);
          events.push('then call');
          fulfill([{ userId: 'owner' }]);
          reject('ignored');
          fulfill(null);
        };
      }
    };
    const result = pg(
      {
        knowledgeSpace: {
          findMany() {
            events.push('query');
            return thenable;
          }
        }
      },
      {
        toString() {
          events.push('owner');
          return 'owner';
        }
      }
    );
    assert.deepEqual(events, ['query', 'then getter']);
    assert.equal(await result, 'owner');
    assert.deepEqual(events, ['query', 'then getter', 'then call', 'owner']);
  });
  for (const site of [
    'delegate getter',
    'method getter',
    'sync throw',
    'promise reject',
    'then getter',
    'then throw',
    'then reject'
  ]) {
    add(`PostgreSQL ${site} becomes a rejection with original identity before owner conversion`, async () => {
      const sentinel = { site };
      const client = {
        get knowledgeSpace() {
          if (site === 'delegate getter') throw sentinel;
          return {
            get findMany() {
              if (site === 'method getter') throw sentinel;
              return () => {
                if (site === 'sync throw') throw sentinel;
                if (site === 'promise reject') return Promise.reject(sentinel);
                return {
                  get then() {
                    if (site === 'then getter') throw sentinel;
                    return (_fulfill, reject) => {
                      if (site === 'then throw') throw sentinel;
                      reject(sentinel);
                    };
                  }
                };
              };
            }
          };
        }
      };
      const result = pg(client, {
        toString() {
          return assert.fail('owner converted');
        }
      });
      assert.ok(result instanceof Promise);
      await assert.rejects(result, error => error === sentinel);
    });
  }
  add('PostgreSQL invalid ports and resolved null keep native TypeErrors without catch wrapping', async () => {
    for (const client of [
      null,
      {},
      { knowledgeSpace: null },
      { knowledgeSpace: { findMany: null } },
      {
        knowledgeSpace: {
          findMany() {
            return null;
          }
        }
      }
    ])
      await assert.rejects(pg(client, 'owner'), TypeError);
  });
  add('PostgreSQL resolved rows retain foreign-id failure identity', async () => {
    const sentinel = {};
    await assert.rejects(
      pg(
        {
          knowledgeSpace: {
            findMany() {
              return [
                {
                  userId: 'foreign',
                  get id() {
                    throw sentinel;
                  }
                }
              ];
            }
          }
        },
        'owner'
      ),
      error => error === sentinel
    );
  });
  return cases;
}

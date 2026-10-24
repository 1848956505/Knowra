import assert from 'node:assert/strict';
import fs from 'node:fs';

// 固定正文来自准确实际父提交；普通合同不读取 Git 或候选实现。
export const attachmentReconciliationParent = '1530e4415759071351a41e45cfc95870fc26ffd2';
export const attachmentReconciliationFrozenSource = String.raw`import fs from 'node:fs';
import { ATTACHMENT_STATUS } from './attachment-status.js';
import { sha256FileSync } from './local-attachment-store-utils.js';

export function reconcileAttachmentIntegrity(
  attachment,
  filePath,
  { now = new Date().toISOString() } = {}
) {
  if (!attachment?.id) {
    return false;
  }

  const previous = {
    size: attachment.size,
    sha256: attachment.sha256 ?? null,
    status: attachment.status ?? ATTACHMENT_STATUS.READY,
    verifiedAt: attachment.verifiedAt ?? null
  };

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    attachment.status = ATTACHMENT_STATUS.MISSING;
    attachment.verifiedAt = null;
    return hasChanged(attachment, previous);
  }

  const stats = fs.statSync(filePath);
  const actualSha256 = sha256FileSync(filePath);
  const expectedSha256 = normalizeSha256(attachment.sha256);
  if (expectedSha256 && (expectedSha256 !== actualSha256 || attachment.size !== stats.size)) {
    attachment.status = ATTACHMENT_STATUS.CORRUPT;
    attachment.verifiedAt = null;
    return hasChanged(attachment, previous);
  }

  attachment.size = stats.size;
  attachment.sha256 = actualSha256;
  attachment.status = ATTACHMENT_STATUS.READY;
  attachment.verifiedAt = new Date(now).toISOString();
  return hasChanged(attachment, previous);
}

export function normalizeSha256(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function hasChanged(attachment, previous) {
  return attachment.size !== previous.size
    || (attachment.sha256 ?? null) !== previous.sha256
    || attachment.status !== previous.status
    || (attachment.verifiedAt ?? null) !== previous.verifiedAt;
}
`;
export const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  now = '2026-10-24T00:00:00.000Z',
  bytes = Buffer.from('abc');
export function row(extra = {}) {
  return { id: 'a', size: 3, sha256: hash, status: 'ready', verifiedAt: now, ...extra };
}
export function disk(run, overrides = {}) {
  const trace = [],
    previous = {};
  const methods = {
    existsSync(p) {
      trace.push(['exists', p]);
      return true;
    },
    statSync(p) {
      trace.push(['stat', p]);
      return {
        isFile() {
          trace.push(['isFile']);
          return true;
        },
        size: 3
      };
    },
    readFileSync(p) {
      trace.push(['read', p]);
      return bytes;
    },
    ...overrides
  };
  for (const [k, v] of Object.entries(methods)) {
    previous[k] = fs[k];
    fs[k] = v;
  }
  try {
    return run(trace);
  } finally {
    for (const [k, v] of Object.entries(previous)) fs[k] = v;
  }
}
function exactThrow(run, error) {
  assert.throws(run, e => e === error);
}

// 手写固定断言对原实现、候选和可执行变异逐一运行。
export function attachmentReconciliationContractCases(api) {
  const { reconcileAttachmentIntegrity: reconcile, normalizeSha256: normalize } = api;
  const cases = [];
  const add = (name, run) => cases.push({ name, run });
  add('exports, arity and synchronous return', () => {
    assert.deepEqual(Object.keys(api), ['normalizeSha256', 'reconcileAttachmentIntegrity']);
    assert.equal(reconcile.length, 2);
    assert.equal(normalize.length, 1);
    assert.equal(reconcile.constructor.name, 'Function');
    assert.equal(normalize.constructor.name, 'Function');
    assert.equal(reconcile(null, null), false);
  });
  add('hex normalization exact length, ASCII, casing and no coercion', () => {
    assert.equal(normalize('ABCDEF'.repeat(10) + 'ABCD'), ('ABCDEF'.repeat(10) + 'ABCD').toLowerCase());
    for (const value of [
      null,
      undefined,
      false,
      0,
      1n,
      Symbol('x'),
      [],
      {},
      new String(hash),
      hash.slice(1),
      hash + 'a',
      hash + '\n',
      ' ' + hash,
      'g'.repeat(64),
      'Ａ'.repeat(64),
      {
        toString() {
          throw Error('not read');
        }
      }
    ])
      assert.equal(normalize(value), null);
    assert.equal(normalize(hash), hash);
  });
  add('all falsey id and nullish attachments return before fields or fs', () =>
    disk(trace => {
      for (const value of [
        null,
        undefined,
        {},
        1,
        'x',
        false,
        { id: 0 },
        { id: '' },
        { id: false },
        { id: null },
        { id: undefined }
      ])
        assert.equal(reconcile(value, 'path', { now }), false);
      assert.deepEqual(trace, []);
    })
  );
  add('options getter runs before id guard and only once', () => {
    const trace = [];
    assert.equal(
      reconcile(
        {
          get id() {
            trace.push('id');
            return 0;
          }
        },
        null,
        {
          get now() {
            trace.push('now');
            return 'invalid';
          }
        }
      ),
      false
    );
    assert.deepEqual(trace, ['now', 'id']);
  });
  add('null options fail before id and getter throws preserve identity', () => {
    let read = false;
    assert.throws(
      () =>
        reconcile(
          {
            get id() {
              read = true;
              return undefined;
            }
          },
          null,
          null
        ),
      TypeError
    );
    assert.equal(read, false);
    const error = { boom: 1 };
    exactThrow(
      () =>
        reconcile({}, null, {
          get now() {
            throw error;
          }
        }),
      error
    );
  });
  add('missing path only changes status and verifiedAt', () =>
    disk(trace => {
      const a = row();
      assert.equal(reconcile(a, null, { now: 'invalid' }), true);
      assert.deepEqual(a, row({ status: 'missing', verifiedAt: null }));
      assert.deepEqual(trace, []);
      assert.equal(reconcile(a, undefined, { now }), false);
    })
  );
  add('false exists stops stat/read', () =>
    disk(
      trace => {
        const a = row();
        assert.equal(reconcile(a, 'p', { now }), true);
        assert.deepEqual(trace, []);
        assert.equal(a.status, 'missing');
      },
      {
        existsSync(p) {
          assert.equal(p, 'p');
          return false;
        },
        statSync() {
          throw Error('unexpected stat');
        },
        readFileSync() {
          throw Error('unexpected read');
        }
      }
    )
  );
  // 上一项自有 exists 故意不记录，单独记录精确调用版本。
  add('directory check performs one stat and no read', () => {
    const trace = [];
    disk(
      () => {
        const a = row();
        assert.equal(reconcile(a, 'p', { now }), true);
        assert.deepEqual(trace, ['exists', 'stat', 'isFile']);
      },
      {
        existsSync() {
          trace.push('exists');
          return true;
        },
        statSync() {
          trace.push('stat');
          return {
            isFile() {
              trace.push('isFile');
              return false;
            }
          };
        },
        readFileSync() {
          throw Error('unexpected read');
        }
      }
    );
  });
  add('ready path uses two stats then one content read', () =>
    disk(trace => {
      assert.equal(reconcile(row(), 'p', { now }), false);
      assert.deepEqual(trace, [['exists', 'p'], ['stat', 'p'], ['isFile'], ['stat', 'p'], ['read', 'p']]);
    })
  );
  add('uppercase expected hash is accepted then stored lowercase', () =>
    disk(() => {
      const a = row({ sha256: hash.toUpperCase() });
      assert.equal(reconcile(a, 'p', { now }), true);
      assert.equal(a.sha256, hash);
    })
  );
  add('hash mismatch preserves expected size/hash while marking corrupt', () =>
    disk(() => {
      const a = row({ sha256: '0'.repeat(64), size: 99 });
      assert.equal(reconcile(a, 'p', { now: 'invalid' }), true);
      assert.deepEqual(a, row({ sha256: '0'.repeat(64), size: 99, status: 'corrupt', verifiedAt: null }));
    })
  );
  add('matching hash uses strict size comparison without numeric coercion', () =>
    disk(() => {
      for (const size of ['3', null, undefined, 4]) {
        const a = row({ size });
        reconcile(a, 'p', { now });
        assert.equal(a.status, 'corrupt');
        assert.equal(a.size, size);
      }
    })
  );
  add('missing/invalid hash refreshes even stale size', () =>
    disk(() => {
      for (const sha256 of [null, undefined, 'invalid', {}, 1]) {
        const a = row({ sha256, size: 99 });
        assert.equal(reconcile(a, 'p', { now }), true);
        assert.deepEqual(a, row());
      }
    })
  );
  add('nullish previous status defaults ready only for comparison', () =>
    disk(() => {
      for (const status of [null, undefined]) {
        const a = row({ status });
        assert.equal(reconcile(a, 'p', { now }), false);
        assert.equal(a.status, 'ready');
      }
    })
  );
  add('invalid now leaves three writes committed before RangeError', () =>
    disk(() => {
      const a = row({ size: 99, sha256: null, status: 'missing', verifiedAt: 'previous' });
      assert.throws(() => reconcile(a, 'p', { now: 'invalid' }), RangeError);
      assert.deepEqual(a, row({ verifiedAt: 'previous' }));
    })
  );
  add('Date, number and invalid Date follow native new Date conversion', () =>
    disk(() => {
      for (const [value, expected] of [
        [0, '1970-01-01T00:00:00.000Z'],
        [new Date(now), now]
      ]) {
        const a = row();
        reconcile(a, 'p', { now: value });
        assert.equal(a.verifiedAt, expected);
      }
      assert.throws(() => reconcile(row(), 'p', { now: new Date(NaN) }), RangeError);
    })
  );
  add('domain-external null/custom date coercion retained', () =>
    disk(() => {
      for (const [value, expected] of [
        [null, '1970-01-01T00:00:00.000Z'],
        [
          {
            valueOf() {
              return 1;
            }
          },
          '1970-01-01T00:00:00.001Z'
        ]
      ]) {
        const a = row();
        reconcile(a, 'p', { now: value });
        assert.equal(a.verifiedAt, expected);
      }
    })
  );
  add('snapshot field getter order precedes file access', () => {
    const trace = [];
    const a = new Proxy(row(), {
      get(t, k, r) {
        trace.push(String(k));
        return Reflect.get(t, k, r);
      }
    });
    disk(() => reconcile(a, null, { now }));
    assert.deepEqual(trace, ['id', 'size', 'sha256', 'status', 'verifiedAt', 'size', 'sha256', 'status']);
  });
  add('normalization rereads current sha after content read', () => {
    const trace = [],
      a = row();
    let reads = 0;
    Object.defineProperty(a, 'sha256', {
      configurable: true,
      get() {
        trace.push('sha' + ++reads);
        return reads === 1 ? '0'.repeat(64) : hash;
      },
      set(v) {
        trace.push('setsha');
        assert.equal(v, hash);
      }
    });
    disk(
      () => {
        assert.equal(reconcile(a, 'p', { now }), true);
      },
      {
        readFileSync() {
          trace.push('read');
          return bytes;
        }
      }
    );
    assert.deepEqual(trace, ['sha1', 'read', 'sha2', 'setsha', 'sha3']);
  });
  add('id/snapshot getter failures retain original identity', () => {
    const error = { getter: 1 };
    disk(trace => {
      exactThrow(
        () =>
          reconcile(
            {
              get id() {
                throw error;
              }
            },
            'p',
            { now }
          ),
        error
      );
      exactThrow(
        () =>
          reconcile(
            {
              id: 'a',
              get size() {
                throw error;
              }
            },
            'p',
            { now }
          ),
        error
      );
      assert.deepEqual(trace, []);
    });
  });
  add('exists and stat failures propagate with zero metadata writes', () => {
    for (const method of ['existsSync', 'statSync']) {
      const error = { method };
      const a = row();
      disk(
        () => {
          exactThrow(() => reconcile(a, 'p', { now }), error);
          assert.deepEqual(a, row());
        },
        {
          [method]() {
            throw error;
          }
        }
      );
    }
  });
  add('read failure precedes normalization and mutation', () => {
    const error = { read: 1 };
    let gets = 0;
    const a = row();
    Object.defineProperty(a, 'sha256', {
      get() {
        if (++gets > 1) throw Error('late sha getter');
        return hash;
      }
    });
    disk(
      () => {
        exactThrow(() => reconcile(a, 'p', { now }), error);
        assert.equal(gets, 1);
      },
      {
        readFileSync() {
          throw error;
        }
      }
    );
  });
  add('second stat is authoritative and isFile not repeated', () => {
    let n = 0;
    disk(
      () => {
        const a = row({ sha256: null });
        reconcile(a, 'p', { now });
        assert.equal(a.size, 9);
      },
      {
        statSync() {
          n++;
          return n === 1
            ? {
                isFile() {
                  return true;
                },
                size: 1
              }
            : {
                get size() {
                  return 9;
                },
                isFile() {
                  throw Error('not called');
                }
              };
        }
      }
    );
    assert.equal(n, 2);
  });
  add('successful setter order occurs before date conversion', () => {
    const trace = [],
      values = row({ sha256: null });
    const a = new Proxy(values, {
      set(t, k, v) {
        trace.push(String(k));
        return Reflect.set(t, k, v);
      }
    });
    disk(() =>
      reconcile(a, 'p', {
        now: {
          valueOf() {
            trace.push('date');
            return 0;
          }
        }
      })
    );
    assert.deepEqual(trace, ['size', 'sha256', 'status', 'date', 'verifiedAt']);
  });
  add('frozen records throw natively even for same status assignment', () =>
    disk(() => assert.throws(() => reconcile(Object.freeze(row()), 'p', { now }), TypeError))
  );
  add('custom setters may ignore writes and result still reads actual record', () =>
    disk(() => {
      const backing = row(),
        a = { id: 'a' };
      for (const key of ['size', 'sha256', 'status', 'verifiedAt'])
        Object.defineProperty(a, key, {
          get() {
            return backing[key];
          },
          set() {}
        });
      assert.equal(reconcile(a, 'p', { now }), false);
    })
  );
  add('setter exception preserves partial writes and identity', () =>
    disk(() => {
      const error = { setter: 1 };
      const a = row({ sha256: null, size: 9, status: 'missing' });
      Object.defineProperty(a, 'verifiedAt', {
        get() {
          return 'previous';
        },
        set() {
          throw error;
        }
      });
      exactThrow(() => reconcile(a, 'p', { now }), error);
      assert.equal(a.size, 3);
      assert.equal(a.sha256, hash);
      assert.equal(a.status, 'ready');
      assert.equal(a.verifiedAt, 'previous');
    })
  );
  add('hasChanged short-circuits at size difference', () => {
    const trace = [];
    let sizeReads = 0;
    const a = row();
    Object.defineProperty(a, 'size', {
      get() {
        trace.push('size');
        return ++sizeReads === 1 ? 3 : 4;
      }
    });
    Object.defineProperty(a, 'sha256', {
      get() {
        trace.push('sha');
        return hash;
      }
    });
    disk(() => assert.equal(reconcile(a, null, { now }), true));
    assert.deepEqual(trace, ['size', 'sha', 'size']);
  });
  add('domain-external false/zero/empty path remain missing branches', () =>
    disk(trace => {
      for (const p of [false, 0, '']) {
        const a = row();
        reconcile(a, p, { now });
        assert.equal(a.status, 'missing');
      }
      assert.deepEqual(trace, []);
    })
  );
  add('URL and Buffer paths are passed unchanged to every fs operation', () => {
    for (const p of [new URL('file:///synthetic/a'), Buffer.from('/synthetic/a')])
      disk(trace => {
        reconcile(row(), p, { now });
        for (const event of trace) if (event.length > 1) assert.equal(event[1], p);
      });
  });
  add('extra metadata and unrelated getters stay untouched', () =>
    disk(() => {
      const secret = {};
      const a = row({ secret });
      Object.defineProperty(a, 'ignored', {
        enumerable: true,
        get() {
          throw Error('not selected');
        }
      });
      reconcile(a, 'p', { now });
      assert.equal(a.secret, secret);
    })
  );
  add('same-reference metadata modified; no clone/freeze or Promise', () =>
    disk(() => {
      const a = row({ sha256: null }),
        prototype = Object.getPrototypeOf(a);
      const result = reconcile(a, 'p', { now });
      assert.equal(typeof result, 'boolean');
      assert.equal(Object.getPrototypeOf(a), prototype);
      assert.equal(Object.isFrozen(a), false);
      assert.equal(a.sha256, hash);
    })
  );

  add('truthy nonstring and inherited identifiers are accepted without validation or coercion', () =>
    disk(() => {
      for (const id of [1, true, {}, [], Symbol('id'), 1n]) {
        const a = row({ id });
        assert.equal(reconcile(a, null, { now }), true);
        assert.equal(a.status, 'missing');
        assert.equal(a.id, id);
      }
      const a = Object.assign(Object.create({ id: 'inherited' }), { size: 3, sha256: hash });
      assert.equal(reconcile(a, null, { now }), true);
      assert.equal(Object.hasOwn(a, 'id'), false);
    })
  );
  add('default clock runs before early return and explicit undefined retains that side effect', () => {
    const NativeDate = globalThis.Date;
    const events = [];
    globalThis.Date = class extends NativeDate {
      constructor(...args) {
        events.push(['date', ...args]);
        super(...(args.length ? args : [now]));
      }
    };
    try {
      for (const options of [undefined, {}, { now: undefined }, true, 0, 'options']) {
        events.length = 0;
        assert.equal(
          reconcile(
            {
              get id() {
                events.push('id');
                return '';
              }
            },
            null,
            options
          ),
          false
        );
        assert.deepEqual(events, [['date'], 'id']);
      }
      events.length = 0;
      disk(() => assert.equal(reconcile(row(), 'p'), false));
      assert.deepEqual(events, [['date'], ['date', now]]);
    } finally {
      globalThis.Date = NativeDate;
    }
  });
  add('default clock failure is original and happens before id access', () => {
    const NativeDate = globalThis.Date;
    const sentinel = {};
    globalThis.Date = class {
      constructor() {
        throw sentinel;
      }
    };
    try {
      exactThrow(
        () =>
          reconcile(
            {
              get id() {
                return assert.fail('id read');
              }
            },
            null
          ),
        sentinel
      );
    } finally {
      globalThis.Date = NativeDate;
    }
  });
  add('inherited now and unrelated option getters retain ordinary destructuring behavior', () =>
    disk(() => {
      const options = Object.create({ now: 0 });
      Object.defineProperty(options, 'unrelated', {
        get() {
          return assert.fail('option read');
        }
      });
      const a = row();
      reconcile(a, 'p', options);
      assert.equal(a.verifiedAt, '1970-01-01T00:00:00.000Z');
    })
  );
  add('falsey previous status is not the ready nullish default', () =>
    disk(() => {
      for (const status of ['', 0, false, NaN]) {
        const a = row({ status });
        assert.equal(reconcile(a, 'p', { now }), true);
        assert.equal(a.status, 'ready');
      }
    })
  );
  add('falsey snapshot sha and verifiedAt retain values rather than truthy defaults', () =>
    disk(() => {
      for (const key of ['sha256', 'verifiedAt']) {
        for (const value of ['', false, 0, NaN]) {
          const backing = row({ status: 'missing', verifiedAt: null, [key]: value });
          const a = { id: 'a' };
          for (const field of ['size', 'sha256', 'status', 'verifiedAt']) {
            Object.defineProperty(a, field, {
              get() {
                return backing[field];
              },
              set() {}
            });
          }
          assert.equal(reconcile(a, null, { now }), Number.isNaN(value));
        }
      }
    })
  );
  add('nullish current sha and verifiedAt compare equal to snapshot null', () =>
    disk(() => {
      for (const value of [null, undefined]) {
        const backing = row({ status: 'missing', sha256: value, verifiedAt: value });
        const a = { id: 'a' };
        for (const field of ['size', 'sha256', 'status', 'verifiedAt'])
          Object.defineProperty(a, field, {
            get() {
              return backing[field];
            },
            set() {}
          });
        assert.equal(reconcile(a, null, { now }), false);
      }
    })
  );
  add('missing and corrupt setters keep status then verifiedAt order without converting now', () => {
    for (const mode of ['missing', 'corrupt']) {
      const events = [];
      const a = new Proxy(row({ sha256: mode === 'corrupt' ? '0'.repeat(64) : hash }), {
        set(target, key, value) {
          events.push([key, value]);
          return Reflect.set(target, key, value);
        }
      });
      disk(() =>
        reconcile(a, mode === 'missing' ? null : 'p', {
          now: {
            valueOf() {
              assert.fail('date converted');
            }
          }
        })
      );
      assert.deepEqual(events, [
        ['status', mode],
        ['verifiedAt', null]
      ]);
    }
  });
  add('hash mismatch short-circuits later attachment size and stat size reads', () => {
    let gets = 0;
    const a = row({ sha256: '0'.repeat(64) });
    Object.defineProperty(a, 'size', {
      get() {
        gets++;
        if (gets === 2) return 3;
        if (gets > 2) assert.fail('size reread');
        return 3;
      }
    });
    let stats = 0;
    disk(() => assert.equal(reconcile(a, 'p', { now }), true), {
      statSync() {
        return ++stats === 1
          ? {
              isFile() {
                return true;
              }
            }
          : {
              get size() {
                return assert.fail('stat size read');
              }
            };
      }
    });
    assert.equal(gets, 2);
  });
  add('matching hash reads attachment size before stats size and ready assigns fresh stats size', () => {
    const events = [];
    let statCalls = 0;
    const a = new Proxy(row(), {
      get(t, k, r) {
        if (k === 'size') events.push('size');
        return Reflect.get(t, k, r);
      }
    });
    disk(() => assert.equal(reconcile(a, 'p', { now }), false), {
      statSync() {
        return ++statCalls === 1
          ? {
              isFile() {
                return true;
              }
            }
          : {
              get size() {
                events.push('stats');
                return 3;
              }
            };
      }
    });
    assert.deepEqual(events, ['size', 'size', 'stats', 'stats', 'size']);
  });
  for (const failed of ['id', 'size', 'sha256', 'status', 'verifiedAt']) {
    add(`snapshot ${failed} exception preserves identity and stops before disk or mutation`, () => {
      const keys = ['id', 'size', 'sha256', 'status', 'verifiedAt'];
      const events = [];
      const sentinel = { failed };
      const a = new Proxy(row(), {
        get(t, k, r) {
          events.push(k);
          if (k === failed) throw sentinel;
          return Reflect.get(t, k, r);
        },
        set() {
          assert.fail('metadata written');
        }
      });
      disk(trace => {
        exactThrow(() => reconcile(a, 'p', { now }), sentinel);
        assert.deepEqual(trace, []);
      });
      assert.deepEqual(events, keys.slice(0, keys.indexOf(failed) + 1));
    });
  }
  for (const failed of ['exists', 'first stat', 'isFile lookup', 'isFile call', 'second stat', 'read', 'stats size']) {
    add(`filesystem ${failed} exception is not swallowed or wrapped`, () => {
      const events = [];
      const sentinel = { failed };
      const a = row({ sha256: null, size: 99 });
      let statCalls = 0;
      const event = label => {
        events.push(label);
        if (failed === label) throw sentinel;
      };
      disk(
        () => {
          exactThrow(() => reconcile(a, 'p', { now }), sentinel);
          assert.deepEqual(a, row({ sha256: null, size: 99 }));
        },
        {
          existsSync() {
            event('exists');
            return true;
          },
          statSync() {
            const first = ++statCalls === 1;
            event(first ? 'first stat' : 'second stat');
            return first
              ? {
                  get isFile() {
                    event('isFile lookup');
                    return () => {
                      event('isFile call');
                      return true;
                    };
                  }
                }
              : {
                  get size() {
                    event('stats size');
                    return 3;
                  }
                };
          },
          readFileSync() {
            event('read');
            return bytes;
          }
        }
      );
      const all = ['exists', 'first stat', 'isFile lookup', 'isFile call', 'second stat', 'read', 'stats size'];
      assert.deepEqual(events, all.slice(0, all.indexOf(failed) + 1));
    });
  }
  add('current sha getter failure happens after complete read and before writes', () => {
    const sentinel = {};
    let gets = 0;
    const events = [];
    const a = row();
    Object.defineProperty(a, 'sha256', {
      get() {
        events.push('sha');
        if (++gets === 2) throw sentinel;
        return hash;
      }
    });
    disk(() => exactThrow(() => reconcile(a, 'p', { now }), sentinel), {
      readFileSync() {
        events.push('read');
        return bytes;
      }
    });
    assert.deepEqual(events, ['sha', 'read', 'sha']);
    assert.equal(a.status, 'ready');
  });
  for (const failed of ['size', 'sha256', 'status', 'verifiedAt']) {
    add(`ready ${failed} setter failure retains prior writes without rollback`, () =>
      disk(() => {
        const sentinel = { failed };
        const values = row({ size: 99, sha256: null, status: 'missing', verifiedAt: 'previous' });
        const writes = [];
        const a = new Proxy(values, {
          set(t, key, value) {
            writes.push(key);
            if (key === failed) throw sentinel;
            return Reflect.set(t, key, value);
          }
        });
        exactThrow(() => reconcile(a, 'p', { now }), sentinel);
        const keys = ['size', 'sha256', 'status', 'verifiedAt'];
        assert.deepEqual(writes, keys.slice(0, keys.indexOf(failed) + 1));
        const expected = row({ size: 99, sha256: null, status: 'missing', verifiedAt: 'previous' });
        const ready = row();
        for (const key of keys.slice(0, keys.indexOf(failed))) expected[key] = ready[key];
        assert.deepEqual(values, expected);
      })
    );
  }
  for (const mode of ['missing', 'corrupt']) {
    for (const failed of ['status', 'verifiedAt']) {
      add(`${mode} ${failed} setter exception stops later writes with exact identity`, () =>
        disk(() => {
          const sentinel = {};
          const values = row({ sha256: mode === 'corrupt' ? '0'.repeat(64) : hash });
          const before = { ...values };
          const writes = [];
          const a = new Proxy(values, {
            set(t, k, v) {
              writes.push(k);
              if (k === failed) throw sentinel;
              return Reflect.set(t, k, v);
            }
          });
          exactThrow(() => reconcile(a, mode === 'missing' ? null : 'p', { now }), sentinel);
          assert.deepEqual(writes, failed === 'status' ? ['status'] : ['status', 'verifiedAt']);
          assert.deepEqual(values, failed === 'status' ? before : { ...before, status: mode });
        })
      );
    }
  }
  for (const changed of ['size', 'sha256', 'status', 'verifiedAt', 'none']) {
    add(`hasChanged reads actual record in order and short-circuits at ${changed}`, () =>
      disk(() => {
        const events = [];
        const backing = row({ status: 'missing', verifiedAt: null });
        const reads = new Map();
        const a = { id: 'a' };
        const keys = ['size', 'sha256', 'status', 'verifiedAt'];
        for (const key of keys)
          Object.defineProperty(a, key, {
            get() {
              const count = (reads.get(key) ?? 0) + 1;
              reads.set(key, count);
              events.push(key);
              return count === 2 && key === changed ? 'changed' : backing[key];
            },
            set() {}
          });
        assert.equal(reconcile(a, null, { now }), changed !== 'none');
        assert.deepEqual(events, [
          ...keys,
          ...keys.slice(0, changed === 'none' ? keys.length : keys.indexOf(changed) + 1)
        ]);
      })
    );
  }
  for (const failed of ['size', 'sha256', 'status', 'verifiedAt']) {
    add(`hasChanged ${failed} getter failure keeps identity after completed writes`, () =>
      disk(() => {
        const sentinel = {};
        const backing = row({ status: 'missing', verifiedAt: null });
        let gets = 0;
        Object.defineProperty(backing, failed, {
          get() {
            if (++gets === 2) throw sentinel;
            return row({ status: 'missing', verifiedAt: null })[failed];
          },
          set() {}
        });
        exactThrow(() => reconcile(backing, null, { now }), sentinel);
      })
    );
  }
  add('invalid string, NaN and Invalid Date all fail after precisely three successful writes', () =>
    disk(() => {
      for (const invalid of ['invalid', NaN, new Date(NaN)]) {
        const values = row({ size: 99, sha256: null, status: 'missing', verifiedAt: 'previous' });
        const writes = [];
        const a = new Proxy(values, {
          set(t, k, v) {
            writes.push(k);
            return Reflect.set(t, k, v);
          }
        });
        assert.throws(() => reconcile(a, 'p', { now: invalid }), RangeError);
        assert.deepEqual(writes, ['size', 'sha256', 'status']);
        assert.deepEqual(values, row({ verifiedAt: 'previous' }));
      }
    })
  );
  add('custom Date conversion throws original value after three writes and before verifiedAt setter', () =>
    disk(() => {
      const sentinel = {};
      const events = [];
      const values = row({ sha256: null });
      const a = new Proxy(values, {
        set(t, k, v) {
          events.push(k);
          return Reflect.set(t, k, v);
        }
      });
      exactThrow(
        () =>
          reconcile(a, 'p', {
            now: {
              [Symbol.toPrimitive](hint) {
                events.push(['convert', hint]);
                throw sentinel;
              }
            }
          }),
        sentinel
      );
      assert.deepEqual(events, ['size', 'sha256', 'status', ['convert', 'default']]);
    })
  );
  add('ignored ready setters do not turn intended updates into a changed result', () =>
    disk(() => {
      const backing = row({ size: 99, sha256: null, status: 'failed', verifiedAt: 'previous' });
      const events = [];
      const a = { id: 'a' };
      for (const key of ['size', 'sha256', 'status', 'verifiedAt'])
        Object.defineProperty(a, key, {
          get() {
            return backing[key];
          },
          set(value) {
            events.push([key, value]);
          }
        });
      assert.equal(reconcile(a, 'p', { now }), false);
      assert.deepEqual(events, [
        ['size', 3],
        ['sha256', hash],
        ['status', 'ready'],
        ['verifiedAt', now]
      ]);
    })
  );
  add('selected Symbol and object metadata preserve identity on the missing path', () =>
    disk(() => {
      const size = Symbol('size');
      const sha256 = {
        toString() {
          assert.fail('hash coerced');
        }
      };
      const a = row({ size, sha256 });
      assert.equal(reconcile(a, null, { now }), true);
      assert.equal(a.size, size);
      assert.equal(a.sha256, sha256);
    })
  );
  add('normalizer accepts every ASCII hex digit and does not accept partial matches', () => {
    for (const digit of '0123456789abcdefABCDEF')
      assert.equal(normalize(digit.repeat(64)), digit.toLowerCase().repeat(64));
    for (const value of [
      hash.slice(0, 63),
      hash + '0',
      hash + '\r',
      hash + '\n',
      '\n' + hash,
      hash + '\r\n',
      'x' + hash,
      hash + 'x'
    ])
      assert.equal(normalize(value), null);
  });

  return cases;
}

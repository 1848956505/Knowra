import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AppError } from '../src/errors/app-error.ts';
import { createEmptyLocalState } from '../src/infrastructure/local-data-schema.js';
import { requestHash } from '../src/modules/sync/journal.js';
import { syncContract } from '../src/modules/sync/protocol-contract.js';
import { createSyncService } from '../src/modules/sync/service.js';
import { createBatchSyncService } from '../src/modules/sync/batch-service.js';

// 固定实际父正文，不从候选实现或 Git 回填普通测试的 oracle。
export const rolloutParent = '9ea8c979ec438a97da0d68a6781268e2ac4a6222';
export const rolloutFrozenSource = String.raw`import { syncError } from './journal.js';

export function assertSyncDeviceEnabled(deviceId) {
  if (process.env.KNOWRA_SYNC_PUSH_ENABLED === 'false') throw syncError('SYNC_PUSH_PAUSED', '云端暂时暂停接收同步，本地内容已保留。', 503);
  const allowed = (process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(deviceId)) throw syncError('SYNC_DEVICE_NOT_ENABLED', '此设备尚未加入同步试用范围，本地内容已保留。', 403);
}
`;
export const hash = value => createHash('sha256').update(value).digest('hex');
export const paused = { code: 'SYNC_PUSH_PAUSED', statusCode: 503, message: '云端暂时暂停接收同步，本地内容已保留。' };
export const disabled = {
  code: 'SYNC_DEVICE_NOT_ENABLED',
  statusCode: 403,
  message: '此设备尚未加入同步试用范围，本地内容已保留。'
};
export function withEnv(values, operation) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'env');
  Object.defineProperty(process, 'env', { configurable: true, writable: true, enumerable: true, value: values });
  const restore = () => Object.defineProperty(process, 'env', descriptor);
  try {
    const value = operation();
    if (value instanceof Promise) return value.finally(restore);
    restore();
    return value;
  } catch (error) {
    restore();
    throw error;
  }
}
export function assertError(error, expected) {
  assert.ok(error instanceof AppError);
  assert.equal(error.name, 'AppError');
  assert.deepEqual({ code: error.code, statusCode: error.statusCode, message: error.message }, expected);
  assert.deepEqual(Object.keys(error), ['name', 'code', 'statusCode']);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
export function errorOf(operation, expected) {
  let caught;
  assert.throws(operation, error => {
    caught = error;
    return assertError(error, expected);
  });
  return caught;
}
export const exoticDevice = () =>
  new Proxy(Object.create(null), {
    get() {
      assert.fail('Device properties must never be inspected or coerced');
    }
  });
export function parsedSource(filtered) {
  return {
    split() {
      return {
        map() {
          return {
            filter() {
              return filtered;
            }
          };
        }
      };
    }
  };
}

export function rolloutContractCases(api) {
  const fn = api.assertSyncDeviceEnabled,
    rows = [];
  const check = (name, run) => rows.push({ name, run });
  check('signature remains one-argument synchronous Function', () => {
    assert.equal(fn.length, 1);
    assert.equal(fn.constructor.name, 'Function');
  });
  check('unconfigured policy returns undefined for every unknown without property reads', () =>
    withEnv({}, () => {
      for (const value of [
        undefined,
        null,
        false,
        true,
        0,
        -0,
        NaN,
        1n,
        Symbol('device'),
        {},
        [],
        exoticDevice(),
        new String('a'),
        () => {},
        Promise.resolve('a')
      ])
        assert.equal(fn(value), undefined);
      assert.equal(fn(), undefined);
    })
  );
  for (const text of ['', ',', ', , \t,', '\u00a0,\ufeff', ',,,\r\n,'])
    check('empty parsed allowlist is unrestricted: ' + JSON.stringify(text), () =>
      withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: text }, () => assert.equal(fn(exoticDevice()), undefined))
    );
  check('exact pause literal dominates matching allowlist', () =>
    withEnv({ KNOWRA_SYNC_PUSH_ENABLED: 'false', KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'device' }, () =>
      errorOf(() => fn('device'), paused)
    )
  );
  for (const flag of [
    'False',
    'FALSE',
    'false ',
    ' false',
    '',
    '0',
    'true',
    false,
    0,
    null,
    undefined,
    new String('false')
  ])
    check('pause does not normalize or coerce ' + typeof flag + ':' + String(flag), () =>
      withEnv({ KNOWRA_SYNC_PUSH_ENABLED: flag }, () => assert.equal(fn(exoticDevice()), undefined))
    );
  check('comma parser trims tokens and removes blanks, but preserves case', () =>
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: ' a,\tb\u00a0,,a ' }, () => {
      assert.equal(fn('a'), undefined);
      assert.equal(fn('b'), undefined);
      for (const value of [' a', 'A', '', 'a,b', '\nb\n']) errorOf(() => fn(value), disabled);
    })
  );
  check('spaces do not split tokens and Unicode is not normalized', () =>
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'a b,e\u0301,😀,\ud800' }, () => {
      for (const value of ['a b', 'e\u0301', '😀', '\ud800']) assert.equal(fn(value), undefined);
      for (const value of ['a', 'b', 'é']) errorOf(() => fn(value), disabled);
    })
  );
  check('unknown device values are rejected without coercion by nonempty allowlist', () =>
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'a,0,true,1' }, () => {
      for (const value of [
        undefined,
        null,
        false,
        true,
        0,
        NaN,
        1n,
        Symbol('a'),
        {},
        [],
        exoticDevice(),
        new String('a')
      ])
        errorOf(() => fn(value), disabled);
    })
  );
  for (const [name, values, expected] of [
    ['paused', { KNOWRA_SYNC_PUSH_ENABLED: 'false' }, paused],
    ['disabled', { KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'other' }, disabled]
  ])
    check(name + ' throws fresh mutable AppErrors with fixed fields and own key order', () =>
      withEnv(values, () => {
        const a = errorOf(() => fn('device'), expected),
          b = errorOf(() => fn('device'), expected);
        assert.notEqual(a, b);
        assert.equal(Object.isFrozen(a), false);
        a.code = 'changed';
        assert.equal(b.code, expected.code);
        assert.equal(Object.hasOwn(a, 'message'), true);
      })
    );
  check('each call rereads changes in both environment variables', () =>
    withEnv({}, () => {
      assert.equal(fn('a'), undefined);
      process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS = 'b';
      errorOf(() => fn('a'), disabled);
      process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS = 'a';
      assert.equal(fn('a'), undefined);
      process.env.KNOWRA_SYNC_PUSH_ENABLED = 'false';
      errorOf(() => fn('a'), paused);
      delete process.env.KNOWRA_SYNC_PUSH_ENABLED;
      assert.equal(fn('a'), undefined);
    })
  );
  check('environment properties are read once in exact pause then allow order', () => {
    const trace = [];
    return withEnv(
      new Proxy(
        {},
        {
          get(_target, key) {
            trace.push(key);
            return undefined;
          }
        }
      ),
      () => {
        assert.equal(fn(exoticDevice()), undefined);
        assert.deepEqual(trace, ['KNOWRA_SYNC_PUSH_ENABLED', 'KNOWRA_SYNC_ALLOWED_DEVICE_IDS']);
      }
    );
  });
  check('paused path never reads or parses the allowlist', () =>
    withEnv(
      {
        KNOWRA_SYNC_PUSH_ENABLED: 'false',
        get KNOWRA_SYNC_ALLOWED_DEVICE_IDS() {
          return assert.fail('allowlist read');
        }
      },
      () => errorOf(() => fn(exoticDevice()), paused)
    )
  );
  for (const field of ['KNOWRA_SYNC_PUSH_ENABLED', 'KNOWRA_SYNC_ALLOWED_DEVICE_IDS'])
    check('environment getter exception identity: ' + field, () => {
      const marker = { field },
        trace = [];
      return withEnv(
        new Proxy(
          {},
          {
            get(_target, key) {
              trace.push(key);
              if (key === field) throw marker;
            }
          }
        ),
        () => {
          assert.throws(
            () => fn('a'),
            error => error === marker
          );
          assert.deepEqual(trace, field === 'KNOWRA_SYNC_PUSH_ENABLED' ? [field] : ['KNOWRA_SYNC_PUSH_ENABLED', field]);
        }
      );
    });
  check('process.env container is read separately for pause and allowlist', () =>
    withEnv({}, () => {
      let reads = 0;
      Object.defineProperty(process, 'env', {
        configurable: true,
        get() {
          return ++reads === 1
            ? { KNOWRA_SYNC_PUSH_ENABLED: 'true', KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'wrong' }
            : { KNOWRA_SYNC_PUSH_ENABLED: 'false', KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'device' };
        }
      });
      assert.equal(fn('device'), undefined);
      assert.equal(reads, 2);
    })
  );
  check('paused path skips second process.env container read', () =>
    withEnv({}, () => {
      let reads = 0;
      Object.defineProperty(process, 'env', {
        configurable: true,
        get() {
          assert.equal(++reads, 1);
          return { KNOWRA_SYNC_PUSH_ENABLED: 'false' };
        }
      });
      errorOf(() => fn('device'), paused);
      assert.equal(reads, 1);
    })
  );
  for (const at of [1, 2])
    check('process.env container exception identity on read ' + at, () =>
      withEnv({}, () => {
        const marker = { at };
        let reads = 0;
        Object.defineProperty(process, 'env', {
          configurable: true,
          get() {
            if (++reads === at) throw marker;
            return {};
          }
        });
        assert.throws(
          () => fn('device'),
          error => error === marker
        );
        assert.equal(reads, at);
      })
    );
  check('nullish allowlist values use the empty string fallback', () => {
    for (const value of [null, undefined])
      withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: value }, () => assert.equal(fn(exoticDevice()), undefined));
  });
  for (const [label, value] of [
    ['false', false],
    ['zero', 0],
    ['object', {}],
    ['symbol', Symbol('env')],
    ['bigint', 1n]
  ])
    check('non-nullish nonstring allowlist keeps native split failure: ' + label, () =>
      withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: value }, () => assert.throws(() => fn('a'), TypeError))
    );
  check('inherited env and parsing methods are read without ownership guards', () =>
    withEnv(Object.create({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'a' }), () => assert.equal(fn('a'), undefined))
  );
  check('boxed allowlist string works without converting the device', () =>
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: new String(' a ') }, () => {
      assert.equal(fn('a'), undefined);
      errorOf(() => fn(new String('a')), disabled);
    })
  );
  check('custom pipeline keeps exact receivers, callback and ordered duplicate tokens', () => {
    const trace = [],
      device = exoticDevice();
    const allowed = ['b', 'a', 'b'];
    allowed.includes = function (value) {
      assert.equal(this, allowed);
      assert.equal(value, device);
      assert.deepEqual(this.slice(), ['b', 'a', 'b']);
      trace.push('includes');
      return true;
    };
    const mapped = {
      filter(callback) {
        assert.equal(this, mapped);
        assert.equal(callback, Boolean);
        trace.push('filter');
        return allowed;
      }
    };
    const parts = {
      map(callback) {
        assert.equal(this, parts);
        trace.push('map');
        for (const label of [' b ', 'a', 'b']) {
          const part = {
            trim() {
              assert.equal(this, part);
              trace.push('trim:' + label);
              return label.trim();
            }
          };
          assert.equal(callback(part), label.trim());
        }
        return mapped;
      }
    };
    const source = {
      split(separator) {
        assert.equal(this, source);
        assert.equal(separator, ',');
        trace.push('split');
        return parts;
      }
    };
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: source }, () => assert.equal(fn(device), undefined));
    assert.deepEqual(trace, ['split', 'map', 'trim: b ', 'trim:a', 'trim:b', 'filter', 'includes']);
  });
  for (const length of [0, '', null, undefined, false, NaN])
    check('falsy allowed.length skips includes getter: ' + String(length), () =>
      withEnv(
        {
          KNOWRA_SYNC_ALLOWED_DEVICE_IDS: parsedSource({
            length,
            get includes() {
              return assert.fail('includes read');
            }
          })
        },
        () => assert.equal(fn(exoticDevice()), undefined)
      )
    );
  for (const length of [1, -1, '0', [], {}])
    check(
      'truthy allowed.length invokes includes without numeric normalization: ' + typeof length + ':' + String(length),
      () => {
        let calls = 0;
        const allowed = {
          length,
          includes() {
            assert.equal(this, allowed);
            calls++;
            return true;
          }
        };
        withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: parsedSource(allowed) }, () => assert.equal(fn('device'), undefined));
        assert.equal(calls, 1);
      }
    );
  for (const result of [true, 1, 'false', {}, []])
    check('truthy custom includes return permits device: ' + typeof result + ':' + String(result), () =>
      withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: parsedSource({ length: 1, includes: () => result }) }, () =>
        assert.equal(fn('device'), undefined)
      )
    );
  for (const result of [false, 0, '', null, undefined, NaN])
    check('falsy custom includes return rejects device: ' + String(result), () =>
      withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: parsedSource({ length: 1, includes: () => result }) }, () =>
        errorOf(() => fn('device'), disabled)
      )
    );
  check('custom filtered native array retains SameValueZero NaN and signed-zero membership', () => {
    const device = {};
    const allowed = [NaN, -0, device];
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: parsedSource(allowed) }, () => {
      for (const value of [NaN, +0, device]) assert.equal(fn(value), undefined);
      errorOf(() => fn({}), disabled);
    });
  });
  check('map callback accepts custom trim unknown return values and filter uses truthiness', () => {
    const device = {},
      values = ['', 0, false, null, undefined, NaN, device, 'a'];
    const source = {
      split() {
        return values.map(value => ({ trim: () => value }));
      }
    };
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: source }, () => {
      assert.equal(fn(device), undefined);
      assert.equal(fn('a'), undefined);
      for (const value of ['', 0, false, null, undefined, NaN]) errorOf(() => fn(value), disabled);
    });
  });
  check('sparse split array skips missing map entries without densification', () => {
    const parts = new Array(3);
    parts[1] = ' a ';
    withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: { split: () => parts } }, () => assert.equal(fn('a'), undefined));
  });
  for (const stage of ['split', 'map', 'trim', 'filter', 'length', 'includes'])
    for (const kind of ['get', 'call']) {
      if (stage === 'length' && kind === 'call') continue;
      check('pipeline preserves ' + stage + ' ' + kind + ' exception and stopping order', () => {
        const marker = { stage, kind },
          trace = [];
        function method(target, key, run) {
          Object.defineProperty(target, key, {
            get() {
              trace.push(key + ':get');
              if (stage === key && kind === 'get') throw marker;
              return function (...args) {
                assert.equal(this, target);
                trace.push(key + ':call');
                if (stage === key && kind === 'call') throw marker;
                return run(...args);
              };
            }
          });
        }
        const allowed = {},
          mapped = {},
          parts = {},
          token = {},
          source = {};
        method(source, 'split', () => parts);
        method(parts, 'map', callback => {
          callback(token);
          return mapped;
        });
        method(token, 'trim', () => 'a');
        method(mapped, 'filter', () => allowed);
        Object.defineProperty(allowed, 'length', {
          get() {
            trace.push('length:get');
            if (stage === 'length') throw marker;
            return 1;
          }
        });
        method(allowed, 'includes', () => true);
        withEnv({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: source }, () =>
          assert.throws(
            () => fn('a'),
            error => error === marker
          )
        );
        const order = [
          'split:get',
          'split:call',
          'map:get',
          'map:call',
          'trim:get',
          'trim:call',
          'filter:get',
          'filter:call',
          'length:get',
          'includes:get',
          'includes:call'
        ];
        assert.deepEqual(trace, order.slice(0, order.indexOf(stage + ':' + kind) + 1));
      });
    }
  return rows;
}

function fixture() {
  const trace = [],
    state = { notes: [], spaces: [{ id: 'space', userId: 'owner' }], folders: [], tags: [], attachments: [] };
  const journal = { epoch: 'epoch', receipts: {}, revisions: {}, deviceSequences: {} };
  const provider = {
    read(callback) {
      trace.push('read');
      return callback(state, journal);
    },
    mutate(callback) {
      trace.push('mutate');
      return callback(state, journal);
    },
    applyNote(op) {
      trace.push('applyNote');
      state.notes.push({ id: op.noteId, ...op.value });
    },
    preview() {
      trace.push('preview');
      return { state, journal: { ...journal, revisions: { '["notes","note"]': 1 } } };
    }
  };
  const operation = {
    ...syncContract(),
    protocolVersion: 1,
    deviceId: 'device',
    operationId: 'operation',
    datasetEpoch: 'epoch',
    noteId: 'note',
    baseRevision: null,
    value: { spaceId: 'space', title: 'title', rawMarkdown: 'text', tagIds: [], deleted: false }
  };
  const batchOp = {
    ...syncContract(),
    protocolVersion: 2,
    deviceId: 'device',
    operationId: 'batch-operation',
    datasetEpoch: 'epoch',
    sequence: 1,
    changes: [{ collection: 'notes', id: 'note', baseRevision: null, value: {} }],
    dependencies: []
  };
  return { trace, state, journal, provider, operation, batchOp };
}
function tracedPolicy(trace, mode = 'pause') {
  return {
    get KNOWRA_SYNC_PUSH_ENABLED() {
      trace.push('policy:pause');
      return mode === 'pause' ? 'false' : 'true';
    },
    get KNOWRA_SYNC_ALLOWED_DEVICE_IDS() {
      trace.push('policy:allow');
      return mode === 'disable' ? 'other' : 'device';
    }
  };
}
function attachment(f) {
  const value = { id: 'attachment', sha256: 'a'.repeat(64), size: 3, fileName: 'synthetic.txt' };
  f.batchOp.changes = [{ collection: 'attachments', id: 'attachment', baseRevision: null, value }];
  const prepared = { ...value, storagePath: 'synthetic-memory-only' };
  const transfer = {
    verify(input) {
      assert.equal(this, transfer);
      assert.equal(input, value);
      f.trace.push('verify');
      return prepared;
    }
  };
  return { transfer, value, prepared };
}

export function rolloutConsumerCases({ single = createSyncService, batch = createBatchSyncService } = {}) {
  const rows = [],
    check = (name, run) => rows.push({ name, run });
  for (const mode of ['pause', 'disable']) {
    const expected = mode === 'pause' ? paused : disabled;
    const policyTrace = mode === 'pause' ? ['policy:pause'] : ['policy:pause', 'policy:allow'];
    check('real single push rejects ' + mode + ' before note mutation', () => {
      const f = fixture();
      withEnv(tracedPolicy(f.trace, mode), () =>
        errorOf(() => single(f.provider, 'owner').push(f.operation), expected)
      );
      assert.deepEqual(f.trace, ['mutate', ...policyTrace]);
      assert.deepEqual(f.state.notes, []);
      assert.deepEqual(f.journal.receipts, {});
    });
    check('real batch push rejects ' + mode + ' after read/transaction before entity work', async () => {
      const f = fixture();
      await withEnv(tracedPolicy(f.trace, mode), () =>
        assert.rejects(batch(f.provider, 'owner', null).pushBatch(f.batchOp), error => assertError(error, expected))
      );
      assert.deepEqual(f.trace, ['read', 'mutate', ...policyTrace]);
      assert.deepEqual(f.state.notes, []);
      assert.deepEqual(f.journal.receipts, {});
    });
    check('real batch nonempty attachment preparation precedes ' + mode + ' policy', async () => {
      const f = fixture(),
        { transfer } = attachment(f);
      await withEnv(tracedPolicy(f.trace, mode), () =>
        assert.rejects(batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), error => assertError(error, expected))
      );
      assert.deepEqual(f.trace, ['read', 'verify', 'mutate', ...policyTrace]);
      assert.deepEqual(f.state.attachments, []);
      assert.deepEqual(f.journal.receipts, {});
    });
    check('real upload rejects ' + mode + ' before transfer put', () => {
      const trace = [],
        transfer = {
          put() {
            assert.fail('put must not execute');
          }
        };
      withEnv(tracedPolicy(trace, mode), () =>
        errorOf(() => batch({}, 'owner', transfer).uploadBlob({ ...syncContract(), deviceId: 'device' }), expected)
      );
      assert.deepEqual(trace, policyTrace);
    });
  }
  check('real single allowed push keeps policy/apply/preview order and receipt identity', () => {
    const f = fixture();
    const result = withEnv(tracedPolicy(f.trace, 'allow'), () => single(f.provider, 'owner').push(f.operation));
    assert.deepEqual(f.trace, ['mutate', 'policy:pause', 'policy:allow', 'applyNote', 'preview']);
    assert.deepEqual(result, {
      status: 'accepted',
      current: { collection: 'notes', id: 'note', revision: 1, value: { id: 'note', ...f.operation.value } }
    });
    assert.equal(f.journal.receipts['["device","operation"]'].result, result);
    assert.equal(f.journal.receipts['["device","operation"]'].hash, requestHash(f.operation));
  });
  for (const mode of ['pause', 'disable']) {
    check('real single saved receipt bypasses ' + mode + ' without reading policy', () => {
      const f = fixture(),
        result = { receipt: 'saved-single' };
      f.journal.receipts['["device","operation"]'] = { hash: requestHash(f.operation), result };
      withEnv(tracedPolicy(f.trace, mode), () => assert.equal(single(f.provider, 'owner').push(f.operation), result));
      assert.deepEqual(f.trace, ['mutate']);
    });
    check('real batch saved receipt bypasses attachments and ' + mode + ' policy', async () => {
      const f = fixture(),
        { transfer } = attachment(f),
        result = { receipt: 'saved-batch' };
      f.journal.receipts['["device","batch-operation"]'] = { hash: requestHash(f.batchOp), result };
      await withEnv(tracedPolicy(f.trace, mode), async () =>
        assert.equal(await batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), result)
      );
      assert.deepEqual(f.trace, ['read']);
    });
  }
  check('real batch second receipt check after preparation still bypasses paused policy', async () => {
    const f = fixture(),
      { transfer } = attachment(f),
      result = { receipt: 'concurrent' };
    f.provider.mutateBatch = callback => {
      f.trace.push('mutateBatch');
      f.journal.receipts['["device","batch-operation"]'] = { hash: requestHash(f.batchOp), result };
      return callback(f.state, f.journal);
    };
    await withEnv(tracedPolicy(f.trace), async () =>
      assert.equal(await batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), result)
    );
    assert.deepEqual(f.trace, ['read', 'verify', 'mutateBatch']);
  });
  check('real batch attachment verify exception has original identity before transaction/policy', async () => {
    const f = fixture(),
      marker = { stage: 'verify' };
    attachment(f);
    const transfer = {
      verify() {
        f.trace.push('verify');
        throw marker;
      }
    };
    await withEnv(tracedPolicy(f.trace), () =>
      assert.rejects(batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), error => error === marker)
    );
    assert.deepEqual(f.trace, ['read', 'verify']);
  });
  check('real batch missing attachment transfer precedes paused policy', async () => {
    const f = fixture();
    attachment(f);
    await withEnv(tracedPolicy(f.trace), () =>
      assert.rejects(batch(f.provider, 'owner', null).pushBatch(f.batchOp), {
        code: 'SYNC_UNAVAILABLE',
        statusCode: 503,
        message: '此服务未配置附件传输。'
      })
    );
    assert.deepEqual(f.trace, ['read']);
  });
  check('real batch receipt reuse error precedes attachments and policy', async () => {
    const f = fixture(),
      { transfer } = attachment(f);
    f.journal.receipts['["device","batch-operation"]'] = { hash: 'different', result: {} };
    await withEnv(tracedPolicy(f.trace), () =>
      assert.rejects(batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), {
        code: 'OPERATION_REUSED',
        statusCode: 422
      })
    );
    assert.deepEqual(f.trace, ['read']);
  });
  for (const stage of ['read', 'transaction'])
    check('real batch expired sequence at ' + stage + ' precedes paused policy', async () => {
      const f = fixture(),
        { transfer } = attachment(f);
      if (stage === 'read') f.journal.deviceSequences.device = 1;
      else
        f.provider.mutateBatch = callback => {
          f.trace.push('mutateBatch');
          f.journal.deviceSequences.device = 1;
          return callback(f.state, f.journal);
        };
      await withEnv(tracedPolicy(f.trace), () =>
        assert.rejects(batch(f.provider, 'owner', transfer).pushBatch(f.batchOp), {
          code: 'SYNC_OPERATION_EXPIRED'
        })
      );
      assert.deepEqual(f.trace, stage === 'read' ? ['read'] : ['read', 'verify', 'mutateBatch']);
    });
  check('real batch allowed path reaches conflict calculation and saves exact receipt', async () => {
    const f = fixture();
    f.batchOp.changes[0].baseRevision = 1;
    const result = await withEnv(tracedPolicy(f.trace, 'allow'), () =>
      batch(f.provider, 'owner', null).pushBatch(f.batchOp)
    );
    assert.deepEqual(f.trace, ['read', 'mutate', 'policy:pause', 'policy:allow']);
    assert.deepEqual(result, {
      status: 'conflict',
      conflicts: [{ collection: 'notes', id: 'note', revision: null, value: null }]
    });
    assert.equal(f.journal.receipts['["device","batch-operation"]'].result, result);
    assert.equal(f.journal.deviceSequences.device, 1);
  });
  for (const asyncProvider of [false, true])
    check(
      'real allowed batch applies validated state with ' + (asyncProvider ? 'async' : 'sync') + ' memory ports',
      async () => {
        const f = fixture(),
          now = '2026-10-01T00:00:00.000Z';
        Object.assign(f.state, createEmptyLocalState());
        f.state.spaces.push({ id: 'space', userId: 'owner', name: 'Before', createdAt: now });
        const value = { id: 'space', userId: 'owner', name: 'After', createdAt: now };
        f.batchOp.changes = [{ collection: 'spaces', id: 'space', baseRevision: null, value }];
        let applied;
        const resultOf = value => (asyncProvider ? Promise.resolve(value) : value);
        f.provider.read = callback => {
          f.trace.push('read');
          return resultOf(callback(f.state, f.journal));
        };
        f.provider.mutateBatch = callback => {
          f.trace.push('mutateBatch');
          return resultOf(callback(f.state, f.journal));
        };
        f.provider.historyReferences = () => {
          f.trace.push('historyReferences');
          return resultOf([]);
        };
        f.provider.applyState = state => {
          f.trace.push('applyState');
          applied = state;
          return resultOf(undefined);
        };
        f.provider.preview = () => {
          f.trace.push('preview');
          return resultOf({ state: applied, journal: { revisions: { '["spaces","space"]': 2 } } });
        };
        const result = await withEnv(tracedPolicy(f.trace, 'allow'), () =>
          batch(f.provider, 'owner', null).pushBatch(f.batchOp)
        );
        assert.deepEqual(f.trace, [
          'read',
          'mutateBatch',
          'policy:pause',
          'policy:allow',
          'historyReferences',
          'applyState',
          'preview'
        ]);
        assert.deepEqual(result, {
          status: 'accepted',
          entries: [{ collection: 'spaces', id: 'space', revision: 2, value }],
          aliases: {}
        });
        assert.deepEqual(applied.spaces, [value]);
        assert.equal(f.state.spaces[0].name, 'Before');
        assert.equal(f.journal.receipts['["device","batch-operation"]'].result, result);
        assert.equal(f.journal.receipts['["device","batch-operation"]'].hash, requestHash(f.batchOp));
        assert.equal(f.journal.receipts['["device","batch-operation"]'].sequence, 1);
        assert.equal(f.journal.deviceSequences.device, 1);
      }
    );
  check('real accepted attachment batch preserves preparation then policy then state application', async () => {
    const f = fixture(),
      { transfer, value, prepared } = attachment(f);
    Object.assign(f.state, createEmptyLocalState());
    f.state.spaces.push({ id: 'space', userId: 'owner', name: 'Synthetic' });
    f.state.notes.push({
      id: 'note',
      spaceId: 'space',
      title: 'Synthetic',
      rawMarkdown: '',
      tagIds: [],
      deleted: false
    });
    Object.assign(value, { noteId: 'note', spaceId: 'space' });
    f.batchOp.dependencies = [
      { collection: 'notes', id: 'note', baseRevision: null },
      { collection: 'spaces', id: 'space', baseRevision: null }
    ];
    let applied;
    f.provider.historyReferences = () => {
      f.trace.push('historyReferences');
      return [];
    };
    f.provider.applyState = state => {
      f.trace.push('applyState');
      applied = state;
    };
    f.provider.preview = () => {
      f.trace.push('preview');
      return { state: applied, journal: { revisions: { '["attachments","attachment"]': 1 } } };
    };
    const result = await withEnv(tracedPolicy(f.trace, 'allow'), () =>
      batch(f.provider, 'owner', transfer).pushBatch(f.batchOp)
    );
    assert.deepEqual(f.trace, [
      'read',
      'verify',
      'mutate',
      'policy:pause',
      'policy:allow',
      'historyReferences',
      'applyState',
      'preview'
    ]);
    assert.equal(result.status, 'accepted');
    assert.equal(result.entries.length, 1);
    const entry = result.entries[0];
    assert.deepEqual(
      { collection: entry.collection, id: entry.id, revision: entry.revision },
      { collection: 'attachments', id: 'attachment', revision: 1 }
    );
    assert.deepEqual(entry.value, {
      ...value,
      createdAt: entry.value.createdAt,
      storagePath: prepared.storagePath,
      status: 'ready',
      verifiedAt: entry.value.verifiedAt
    });
    assert.match(entry.value.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entry.value.createdAt, entry.value.verifiedAt);
    assert.deepEqual(applied.attachments, [entry.value]);
    assert.deepEqual(f.state.attachments, []);
    assert.equal(f.journal.receipts['["device","batch-operation"]'].result, result);
  });
  check('real upload with empty allowlist passes unknown device and original body through unchanged', () => {
    const body = { ...syncContract(), deviceId: exoticDevice() },
      result = { uploaded: 'synthetic' },
      trace = [];
    const transfer = {
      put(input) {
        assert.equal(this, transfer);
        assert.equal(input, body);
        trace.push('put');
        return result;
      }
    };
    withEnv({}, () => assert.equal(batch({}, 'owner', transfer).uploadBlob(body), result));
    assert.deepEqual(trace, ['put']);
  });
  check('real upload allowed path preserves policy then transfer order and thrown identity', () => {
    const trace = [],
      marker = { stage: 'put' },
      transfer = {
        put() {
          trace.push('put');
          throw marker;
        }
      };
    withEnv(tracedPolicy(trace, 'allow'), () =>
      assert.throws(
        () => batch({}, 'owner', transfer).uploadBlob({ ...syncContract(), deviceId: 'device' }),
        error => error === marker
      )
    );
    assert.deepEqual(trace, ['policy:pause', 'policy:allow', 'put']);
  });
  check('real upload paused policy precedes missing-transfer error', () => {
    const trace = [];
    withEnv(tracedPolicy(trace), () => errorOf(() => batch({}, 'owner', null).uploadBlob(syncContract()), paused));
    assert.deepEqual(trace, ['policy:pause']);
  });
  check('real protocol validation fails before any policy read for all three endpoints', async () => {
    const f = fixture();
    await withEnv(tracedPolicy(f.trace), async () => {
      assert.throws(() => single(f.provider, 'owner').push({}), { code: 'SYNC_CLIENT_UPGRADE_REQUIRED' });
      assert.throws(() => batch(f.provider, 'owner', null).uploadBlob({}), {
        code: 'SYNC_CLIENT_UPGRADE_REQUIRED'
      });
      await assert.rejects(batch(f.provider, 'owner', null).pushBatch({}), {
        code: 'SYNC_CLIENT_UPGRADE_REQUIRED'
      });
    });
    assert.deepEqual(f.trace, []);
  });
  return rows;
}

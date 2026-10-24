import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { parse } from '@babel/parser';
import { syncError } from '../src/modules/sync/journal.js';
import {
  rolloutParent,
  rolloutFrozenSource,
  rolloutContractCases,
  rolloutConsumerCases,
  hash,
  withEnv,
  paused,
  disabled,
  errorOf
} from './sync-rollout-policy.contract-support.js';

const baseline = process.env.KNOWRA_SYNC_ROLLOUT_BASELINE === '1';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/sync/rollout-policy.js';
const sourceUrl = new URL(helper, root);
const sourceHash = 'f5fd23d2c9b7749bae991ef907059797dd5307137a953f8b2aa923e9332784c4';
const boundaryKey = Symbol.for('knowra-batch53-sync-error');
let loadCount = 0;
async function loadSource(source, label, instrument = false) {
  const specifier = "'./journal.js'";
  assert.equal(source.split(specifier).length, 2, 'Exact existing journal dependency');
  const dependency = instrument
    ? 'data:text/javascript;base64,' +
      Buffer.from(
        "export const syncError = (...args) => globalThis[Symbol.for('knowra-batch53-sync-error')](...args);"
      ).toString('base64')
    : new URL('./journal.js', sourceUrl).href;
  const rewritten = source.replace(specifier, JSON.stringify(dependency));
  return import(
    'data:text/javascript;base64,' + Buffer.from(rewritten + `\n// ${label} ${++loadCount}`).toString('base64')
  );
}
// 普通模式完全无 Git；显式模式只能读取准确实际父对象，缺失时立即失败，不回退。
const historical = baseline
  ? execFileSync('git', ['show', `${rolloutParent}:${helper}`], { cwd: root, encoding: 'utf8' })
  : null;
const api = baseline ? await loadSource(historical, 'exact-parent') : await import(sourceUrl);
const frozen = await loadSource(rolloutFrozenSource, 'frozen-parent');
const executable = baseline
  ? historical
  : stripTypeScriptTypes(readFileSync(new URL(helper.replace(/\.js$/, '.ts'), root), 'utf8'));
const boundaryApi = await loadSource(executable, 'candidate-boundary', true);
for (const entry of rolloutContractCases(api)) test(entry.name, entry.run);

test('frozen seven-line source matches independently recorded actual-parent SHA256', () => {
  assert.equal(hash(rolloutFrozenSource), sourceHash);
  assert.equal(rolloutFrozenSource.split('\n').length - 1, 7);
  if (baseline) assert.equal(historical, rolloutFrozenSource);
});
function executableAst(source) {
  const normalize = value =>
    Array.isArray(value)
      ? value.map(normalize)
      : value === null || typeof value !== 'object'
        ? value
        : Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key]) =>
                  ![
                    'start',
                    'end',
                    'loc',
                    'extra',
                    'comments',
                    'leadingComments',
                    'trailingComments',
                    'innerComments'
                  ].includes(key)
              )
              .map(([key, nested]) => [key, normalize(nested)])
          );
  return normalize(parse(source, { sourceType: 'module' }).program);
}
test(
  'Node official TS erasure preserves the entire ordered executable AST without import rewrites',
  { skip: baseline },
  () => {
    assert.deepEqual(executableAst(executable), executableAst(rolloutFrozenSource));
  }
);
test('JS bridge contains one exact same-identity TS export and no runtime body', { skip: baseline }, async () => {
  const typed = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['assertSyncDeviceEnabled']);
  assert.deepEqual(Object.keys(typed), ['assertSyncDeviceEnabled']);
  assert.equal(api.assertSyncDeviceEnabled, typed.assertSyncDeviceEnabled);
  const program = parse(readFileSync(sourceUrl, 'utf8'), { sourceType: 'module' }).program;
  assert.deepEqual(program.directives, []);
  assert.equal(program.body.length, 1);
  const statement = program.body[0];
  assert.equal(statement.type, 'ExportNamedDeclaration');
  assert.equal(statement.declaration, null);
  assert.equal(statement.source.value, './rollout-policy.ts');
  assert.equal(statement.specifiers.length, 1);
  assert.equal(statement.specifiers[0].type, 'ExportSpecifier');
  assert.equal(statement.specifiers[0].local.name, 'assertSyncDeviceEnabled');
  assert.equal(statement.specifiers[0].exported.name, 'assertSyncDeviceEnabled');
});

function boundaryCases(subject) {
  const rows = [],
    fn = subject.assertSyncDeviceEnabled;
  const check = (name, run) => rows.push({ name, run });
  function exercise(values, callback, factory = syncError) {
    const before = globalThis[boundaryKey],
      calls = [];
    globalThis[boundaryKey] = (...args) => {
      calls.push(args);
      return factory(...args);
    };
    try {
      return withEnv(values, () => callback(calls));
    } finally {
      if (before === undefined) delete globalThis[boundaryKey];
      else globalThis[boundaryKey] = before;
    }
  }
  for (const [label, values, expected] of [
    ['pause', { KNOWRA_SYNC_PUSH_ENABLED: 'false' }, paused],
    ['disable', { KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'other' }, disabled]
  ]) {
    check('actual syncError receives exact ' + label + ' arguments once', () =>
      exercise(values, calls => {
        errorOf(() => fn('device'), expected);
        assert.deepEqual(calls, [[expected.code, expected.message, expected.statusCode]]);
      })
    );
    check('syncError return object is thrown unchanged for ' + label, () => {
      const marker = { label };
      exercise(
        values,
        calls => {
          assert.throws(
            () => fn('device'),
            error => error === marker
          );
          assert.deepEqual(calls, [[expected.code, expected.message, expected.statusCode]]);
        },
        () => marker
      );
    });
    check('syncError thrown failure escapes unchanged for ' + label, () => {
      const marker = { label };
      exercise(
        values,
        calls => {
          assert.throws(
            () => fn('device'),
            error => error === marker
          );
          assert.deepEqual(calls, [[expected.code, expected.message, expected.statusCode]]);
        },
        () => {
          throw marker;
        }
      );
    });
  }
  check('successful policy never calls syncError and naturally returns undefined', () =>
    exercise({ KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'device' }, calls => {
      assert.equal(fn('device'), undefined);
      assert.deepEqual(calls, []);
    })
  );
  return rows;
}
for (const entry of boundaryCases(boundaryApi)) test(entry.name, entry.run);

// 每个种子重新构造全部输入。记录有序容器/字段/方法/回调轨迹，不排序或只比较数量。
function observe(subject, seed) {
  let state = (seed + 53) >>> 0;
  const random = max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  };
  const kind = seed % 16,
    events = [],
    sentinel = { seed };
  const deviceObject = new Proxy(
    {},
    {
      get(_target, key) {
        events.push(['device:get', String(key)]);
        throw sentinel;
      }
    }
  );
  const devices = [
    'a',
    'b',
    ' a',
    '',
    undefined,
    null,
    0,
    false,
    NaN,
    1n,
    Symbol('device'),
    deviceObject,
    new String('a')
  ];
  let device = devices[random(devices.length)],
    flag,
    allowed;
  const throwStage = [
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
  ][random(11)];
  function method(target, key, run) {
    Object.defineProperty(target, key, {
      get() {
        events.push([key, 'get']);
        if (kind === 7 && throwStage === key + ':get') throw sentinel;
        return function (...args) {
          events.push([key, 'call', this === target]);
          if (kind === 7 && throwStage === key + ':call') throw sentinel;
          return run(...args);
        };
      }
    });
  }
  if (kind === 0) {
    flag = 'false';
    allowed = 'a';
  }
  if (kind === 1) {
    allowed = ' a,b,a ';
    device = 'a';
  }
  if (kind === 2) {
    allowed = 'other';
    device = 'a';
  }
  if (kind === 3) allowed = [false, 0, {}, Symbol('env'), 1n][random(5)];
  if (kind === 4) allowed = [null, undefined][random(2)];
  if ([5, 6].includes(kind)) allowed = 'a';
  if ([7, 8].includes(kind)) {
    const source = {},
      parts = {},
      token = {},
      mapped = {},
      filtered = {};
    const length = kind === 7 ? 1 : [0, '', null, undefined, false, NaN, 1, -1, '0'][random(9)];
    const result = [true, false, '', 1, 0, {}, null][random(7)];
    method(source, 'split', separator => {
      events.push(['separator', separator]);
      return parts;
    });
    method(parts, 'map', callback => {
      events.push(['callback-result', callback(token)]);
      return mapped;
    });
    method(token, 'trim', () => 'a');
    method(mapped, 'filter', callback => {
      events.push(['filter-is-Boolean', callback === Boolean]);
      return filtered;
    });
    Object.defineProperty(filtered, 'length', {
      get() {
        events.push(['length', 'get']);
        if (kind === 7 && throwStage === 'length:get') throw sentinel;
        return length;
      }
    });
    method(filtered, 'includes', value => {
      events.push(['original-device', value === device]);
      return result;
    });
    allowed = source;
  }
  if (kind === 9) {
    device = NaN;
    allowed = { split: () => ({ map: () => ({ filter: () => [NaN, 0, 'a'] }) }) };
  }
  if (kind === 10) allowed = ['', ',', ', , \t,', '\u00a0,\ufeff'][random(4)];
  if (kind === 11) {
    flag = 'true';
    allowed = 'wrong';
    device = 'a';
  }
  if (kind === 14) allowed = { split: () => [0] };
  if (kind === 15) allowed = { split: () => ({ map: () => null }) };
  const throwField = random(2) ? 'KNOWRA_SYNC_PUSH_ENABLED' : 'KNOWRA_SYNC_ALLOWED_DEVICE_IDS';
  const env = new Proxy(
    {},
    {
      get(_target, key) {
        events.push(['env:get', key]);
        if (kind === 5 && key === throwField) throw sentinel;
        return key === 'KNOWRA_SYNC_PUSH_ENABLED' ? flag : allowed;
      }
    }
  );
  let reads = 0,
    outcome;
  withEnv({}, () => {
    Object.defineProperty(process, 'env', {
      configurable: true,
      get() {
        events.push(['container:get', ++reads]);
        if (kind === 6 && reads === 1) throw sentinel;
        if (kind === 12) return null;
        if (kind === 13) return undefined;
        if (kind === 11 && reads === 2)
          return new Proxy(
            { KNOWRA_SYNC_ALLOWED_DEVICE_IDS: 'a' },
            {
              get(target, key) {
                events.push(['second-env:get', key]);
                return target[key];
              }
            }
          );
        return env;
      }
    });
    try {
      const value = subject.assertSyncDeviceEnabled(device);
      outcome = { kind: 'return', value, asynchronous: value instanceof Promise };
    } catch (error) {
      outcome =
        error === sentinel
          ? { kind: 'throw', identity: 'sentinel' }
          : {
              kind: 'throw',
              name: error.name,
              message: error.message,
              code: error.code,
              statusCode: error.statusCode,
              keys: Object.keys(error)
            };
    }
  });
  return { events, outcome };
}
test('4096 fresh ordered old/new cases preserve returns, native errors, original failures and all reads', () => {
  const outcomes = new Map();
  for (let seed = 0; seed < 4096; seed++) {
    const expected = observe(frozen, seed);
    assert.deepEqual(observe(api, seed), expected, `Differential seed ${seed}`);
    const key = expected.outcome.identity ?? expected.outcome.name ?? expected.outcome.kind;
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  }
  for (const kind of ['return', 'sentinel', 'TypeError', 'AppError'])
    assert.ok(outcomes.get(kind) > 100, 'Missing differential coverage: ' + kind);
});

const pauseExpression = "process.env.KNOWRA_SYNC_PUSH_ENABLED === 'false'";
const parseExpression =
  "(process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)";
const pauseCall = "syncError('SYNC_PUSH_PAUSED', '云端暂时暂停接收同步，本地内容已保留。', 503)";
const disabledCall = "syncError('SYNC_DEVICE_NOT_ENABLED', '此设备尚未加入同步试用范围，本地内容已保留。', 403)";
const mutations = [
  ['pause trimmed', pauseExpression, "process.env.KNOWRA_SYNC_PUSH_ENABLED?.trim() === 'false'"],
  ['pause case-folded', pauseExpression, "process.env.KNOWRA_SYNC_PUSH_ENABLED?.toLowerCase() === 'false'"],
  ['pause Boolean coerced', pauseExpression, '!process.env.KNOWRA_SYNC_PUSH_ENABLED'],
  ['pause loose equality', pauseExpression, "process.env.KNOWRA_SYNC_PUSH_ENABLED == 'false'"],
  ['pause branch omitted', pauseExpression, 'false'],
  [
    'environment container snapshotted',
    'export function assertSyncDeviceEnabled(deviceId) {',
    'export function assertSyncDeviceEnabled(deviceId) { const env = process.env;',
    'snapshot'
  ],
  ['environment cached across calls', 'process.env.', 'cachedEnv.', 'cache-env'],
  [
    'pause and allow reads reordered',
    '  if (' + pauseExpression + ') throw ' + pauseCall + ';\n  const allowed = ' + parseExpression + ';',
    '  const allowed = ' + parseExpression + ';\n  if (' + pauseExpression + ') throw ' + pauseCall + ';'
  ],
  ['pause status changed', pauseCall, "syncError('SYNC_PUSH_PAUSED', '云端暂时暂停接收同步，本地内容已保留。', 500)"],
  [
    'device status changed',
    disabledCall,
    "syncError('SYNC_DEVICE_NOT_ENABLED', '此设备尚未加入同步试用范围，本地内容已保留。', 503)"
  ],
  ['pause message changed', '云端暂时暂停接收同步，本地内容已保留。', '暂停同步。'],
  ['device message changed', '此设备尚未加入同步试用范围，本地内容已保留。', '设备拒绝。'],
  ['error priority swapped', '  if (' + pauseExpression + ') throw ' + pauseCall + ';', '', 'late-pause'],
  ['pause error cached', pauseCall, 'cachedError', 'cache-error'],
  ['disabled error cached', disabledCall, 'cachedError', 'cache-disabled'],
  [
    'nullish fallback changed to truthiness',
    "process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS ?? ''",
    "process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS || ''"
  ],
  [
    'nullish fallback omitted',
    "(process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS ?? '')",
    'process.env.KNOWRA_SYNC_ALLOWED_DEVICE_IDS'
  ],
  ['filter omitted', '.filter(Boolean)', ''],
  ['trim omitted', '.map(value => value.trim())', ''],
  [
    'filter replaced by string-only predicate',
    '.filter(Boolean)',
    ".filter(value => typeof value === 'string' && value.length > 0)"
  ],
  [
    'trim callback receives strings only guard',
    'value => value.trim()',
    "value => typeof value === 'string' ? value.trim() : value"
  ],
  ['comma parser changed to whitespace', ".split(',')", '.split(/\\s+/)'],
  ['allowlist deduplicated via Set', parseExpression, '[...new Set(' + parseExpression + ')]'],
  ['allowlist sorted', parseExpression, parseExpression + '.sort()'],
  ['device converted with String', 'allowed.includes(deviceId)', 'allowed.includes(String(deviceId))'],
  ['device trimmed', 'allowed.includes(deviceId)', 'allowed.includes(deviceId.trim())'],
  ['device case-folded', 'allowed.includes(deviceId)', 'allowed.includes(deviceId.toLowerCase())'],
  [
    'empty allowlist rejected',
    'allowed.length && !allowed.includes(deviceId)',
    '!allowed.length || !allowed.includes(deviceId)'
  ],
  ['length short circuit omitted', 'allowed.length && !allowed.includes(deviceId)', '!allowed.includes(deviceId)'],
  ['length made numeric-positive', 'allowed.length &&', 'allowed.length > 0 &&'],
  ['includes result requires literal true', '!allowed.includes(deviceId)', 'allowed.includes(deviceId) !== true'],
  ['includes replaced by indexOf', '!allowed.includes(deviceId)', 'allowed.indexOf(deviceId) === -1'],
  ['includes receiver lost', 'allowed.includes(deviceId)', '(0, allowed.includes)(deviceId)'],
  [
    'includes read before length',
    'allowed.length && !allowed.includes(deviceId)',
    '!allowed.includes(deviceId) && allowed.length'
  ],
  [
    'device validation introduced',
    'export function assertSyncDeviceEnabled(deviceId) {',
    "export function assertSyncDeviceEnabled(deviceId) { if (typeof deviceId !== 'string') throw Error('invalid');"
  ],
  ['success returns true', '\n}\n', '\n  return true;\n}\n'],
  ['success returns original device', '\n}\n', '\n  return deviceId;\n}\n'],
  ['guard becomes async', 'export function', 'export async function'],
  ['pause error returned instead of thrown', 'throw ' + pauseCall, 'return ' + pauseCall],
  ['device error returned instead of thrown', 'throw ' + disabledCall, 'return ' + disabledCall],
  ['syncError result wrapped', 'throw ' + pauseCall, 'throw new Error(' + pauseCall + '.message)']
];
for (const [label, from, to, special] of mutations)
  test('fixed behavior assertions kill executable mutant: ' + label, async t => {
    const expectedAnchors = special === 'cache-env' ? 2 : 1;
    assert.equal(rolloutFrozenSource.split(from).length, expectedAnchors + 1, 'Exact mutation anchor: ' + label);
    let changed = rolloutFrozenSource.replaceAll(from, to);
    if (special === 'snapshot') changed = changed.replaceAll('process.env.', 'env.');
    if (special === 'cache-env') changed = 'const cachedEnv = process.env;\n' + changed;
    if (special === 'late-pause')
      changed = changed.replace('\n}\n', '\n  if (' + pauseExpression + ') throw ' + pauseCall + ';\n}\n');
    if (special === 'cache-error') changed += '\nconst cachedError = ' + pauseCall + ';\n';
    if (special === 'cache-disabled') changed += '\nconst cachedError = ' + disabledCall + ';\n';
    // 语法检查及真正动态导入在捕获之外，导入失败绝不能计作杀死。
    executableAst(changed);
    const mutant = await withEnv({}, () => loadSource(changed, label));
    const instrumented = special?.startsWith('cache-') ? null : await loadSource(changed, label + '-boundary', true);
    assert.equal(typeof mutant.assertSyncDeviceEnabled, 'function');
    let killedBy = null;
    for (const entry of [...rolloutContractCases(mutant), ...(instrumented ? boundaryCases(instrumented) : [])]) {
      try {
        await assert.doesNotReject(async () => entry.run());
      } catch (error) {
        assert.equal(error.name, 'AssertionError');
        killedBy = entry.name;
        break;
      }
    }
    assert.ok(killedBy, 'Live mutation: ' + label);
    t.diagnostic('Behavior assertion: ' + killedBy);
  });

// 当前实际消费者只在普通模式执行，不把当前依赖图冒充历史完整链。
if (!baseline) {
  for (const entry of rolloutConsumerCases()) test(entry.name, entry.run);
  const sources = Object.fromEntries(
    ['service', 'batch-service'].map(name => [name, readFileSync(new URL(name + '.js', sourceUrl), 'utf8')])
  );
  const singleGuard = '      assertSyncDeviceEnabled(operation.deviceId);';
  const batchGuard = '        assertSyncDeviceEnabled(op.deviceId);';
  const uploadGuard = '      assertSyncDeviceEnabled(body?.deviceId);';
  const consumerMutations = [
    [
      'single receipt replay no longer bypasses policy',
      'service',
      '      if (receipt) {',
      '      if (false && receipt) {'
    ],
    [
      'single policy precedes protocol validation',
      'service',
      '      assertSyncContract(operation);',
      '      assertSyncDeviceEnabled(operation.deviceId); assertSyncContract(operation);',
      singleGuard
    ],
    [
      'batch policy moved before initial receipt read',
      'batch-service',
      '      const saved = await provider.read',
      '      assertSyncDeviceEnabled(op.deviceId); const saved = await provider.read',
      batchGuard
    ],
    [
      'batch policy moved before attachment preparation',
      'batch-service',
      '      const prepared = {};',
      '      assertSyncDeviceEnabled(op.deviceId); const prepared = {};',
      batchGuard
    ],
    ['batch initial receipt ignored', 'batch-service', '      if (saved) {', '      if (false && saved) {'],
    [
      'batch second receipt check no longer precedes policy',
      'batch-service',
      '        if (journal.receipts[key]) {',
      '        assertSyncDeviceEnabled(op.deviceId); if (journal.receipts[key]) {',
      batchGuard
    ],
    [
      'upload missing-transfer check precedes policy',
      'batch-service',
      "      if (!transfer) throw syncError('SYNC_UNAVAILABLE', '此服务未配置附件传输。', 503);",
      "      if (!transfer) throw syncError('SYNC_UNAVAILABLE', '此服务未配置附件传输。', 503);\n" + uploadGuard,
      uploadGuard
    ],
    [
      'upload put occurs before policy',
      'batch-service',
      '      return transfer.put(body);',
      '      const result = transfer.put(body); assertSyncDeviceEnabled(body?.deviceId); return result;',
      uploadGuard
    ],
    [
      'upload policy precedes protocol validation',
      'batch-service',
      '      assertSyncContract(body);',
      '      assertSyncDeviceEnabled(body?.deviceId); assertSyncContract(body);',
      uploadGuard
    ]
  ];
  for (const [label, name, from, to, remove] of consumerMutations)
    test('fixed real-consumer assertions kill executable timing mutant: ' + label, async t => {
      let changed = sources[name];
      if (remove) {
        assert.equal(changed.split(remove).length, 2, 'Exact existing guard');
        changed = changed.replace(remove, '');
      }
      const matches = changed.split(from).length - 1;
      // upload 与 batch 都有同字面 transfer 错误；此变异只改变 upload 的首次匹配。
      assert.equal(matches, label === 'upload missing-transfer check precedes policy' ? 2 : 1);
      changed = changed.replace(from, to);
      executableAst(changed);
      const consumerUrl = new URL(name + '.js', sourceUrl);
      const program = parse(changed, { sourceType: 'module' }).program;
      for (const statement of program.body.filter(item => item.type === 'ImportDeclaration')) {
        const specifier = statement.source.value;
        if (!specifier.startsWith('.')) continue;
        assert.equal(changed.split("'" + specifier + "'").length, 2);
        changed = changed.replace("'" + specifier + "'", JSON.stringify(new URL(specifier, consumerUrl).href));
      }
      // 完整真实 consumer 模块先成功导入，再运行固定合成端口，导入失败不计杀死。
      const imported = await import(
        'data:text/javascript;base64,' + Buffer.from(changed + '\n// ' + label).toString('base64')
      );
      const factory = imported[name === 'service' ? 'createSyncService' : 'createBatchSyncService'];
      assert.equal(typeof factory, 'function');
      const constructors = name === 'service' ? { single: factory } : { batch: factory };
      let killedBy = null;
      for (const entry of rolloutConsumerCases(constructors)) {
        try {
          await assert.doesNotReject(async () => entry.run());
        } catch (error) {
          assert.equal(error.name, 'AssertionError');
          killedBy = entry.name;
          break;
        }
      }
      assert.ok(killedBy, 'Live consumer timing mutation: ' + label);
      t.diagnostic('Behavior assertion: ' + killedBy);
    });
}

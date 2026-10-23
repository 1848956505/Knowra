import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { createAppContext } from '../src/app.factory.js';
import { getKnowledgeOperationAccess } from '../src/infrastructure/knowledge-operation-access.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';

// 同一套行为断言可运行在冻结的原始 JS 上，不把类型声明当作运行时约束。
// KNOWRA_ACCESS_CALLBACKS_BASELINE=1 node --test apps/api/test/typescript-access-callbacks.node.test.js
const baseline = process.env.KNOWRA_ACCESS_CALLBACKS_BASELINE === '1';
const commit = 'a4e12d52705ce2291e9e6bb3b282a1140b275c5c';
const root = new URL('../src/', import.meta.url);
const names = [
  'infrastructure/maintenance-gate',
  'infrastructure/postgres-advisory-lock',
  'modules/ai/runtime',
  'postgres-app.factory'
];
let modules;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-access-callbacks-baseline-'));
  try {
    for (const name of names) {
      const source = execFileSync('git', ['show', `${commit}:apps/api/src/${name}.js`], {
        cwd: new URL('../../../', import.meta.url),
        encoding: 'utf8'
      }).replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, dependency) => {
        const url = new URL(dependency, new URL(`${name}.js`, root));
        const target = names.find(target => new URL(`${target}.js`, root).href === url.href);
        return JSON.stringify(
          target ? pathToFileURL(join(directory, `${target.replaceAll('/', '__')}.mjs`)).href : url.href
        );
      });
      writeFileSync(join(directory, `${name.replaceAll('/', '__')}.mjs`), source);
    }
    modules = await Promise.all(
      names.map(name => import(pathToFileURL(join(directory, `${name.replaceAll('/', '__')}.mjs`))))
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else modules = await Promise.all(names.map(name => import(new URL(`${name}.js`, root))));
const [
  { createMaintenanceGate, wrapHandlersWithMaintenanceGate },
  { createPostgresAdvisoryLock, wrapHandlersWithPostgresAdvisoryLock },
  { createAiRuntime },
  { createPostgresAppContext }
] = modules;
const wrappers = [
  { label: 'maintenance', wrap: wrapHandlersWithMaintenanceGate, read: 'runOperation', mutation: 'runMutation' },
  { label: 'postgres', wrap: wrapHandlersWithPostgresAdvisoryLock, read: 'runShared', mutation: 'runExclusive' }
];
const sameThrown = (operation, expected) => assert.throws(operation, error => Object.is(error, expected));
const sameRejected = (operation, expected) => assert.rejects(operation, error => Object.is(error, expected));
const idle = { activeOperations: 0, maintenanceActive: false, waitingMaintenances: 0 };
const deferred = () => Promise.withResolvers();
function controller(spec, events, execute = true) {
  const control = {};
  for (const name of [spec.read, spec.mutation])
    control[name] = function (operation) {
      assert.equal(this, control);
      events.push(name);
      return execute ? operation() : name;
    };
  return control;
}

for (const spec of wrappers) {
  const { label, wrap, read, mutation } = spec;
  test(`${label}: own enumerable string entries are snapshotted before callbacks`, () => {
    const events = [];
    const object = { keep: true };
    const handlers = Object.create({ inherited: () => assert.fail('inherited') });
    Object.defineProperties(handlers, {
      first: {
        enumerable: true,
        get() {
          events.push('get:first');
          return (...args) => args;
        }
      },
      9: { enumerable: true, value: () => 9 },
      plain: { enumerable: true, value: object },
      hidden: { value: () => assert.fail('hidden') },
      last: {
        enumerable: true,
        get() {
          events.push('get:last');
          return () => 'last';
        }
      }
    });
    handlers[Symbol('ignored')] = () => assert.fail('symbol');
    const result = wrap(handlers, controller(spec, events), {
      getAccess(name) {
        assert.equal(typeof name, 'string');
        assert.equal(this, undefined);
        events.push(`access:${name}`);
        return 'read';
      },
      skip: () => false
    });
    assert.deepEqual(events, ['get:first', 'get:last', 'access:9', 'access:first', 'access:last']);
    assert.deepEqual(Reflect.ownKeys(result), ['9', 'first', 'plain', 'last']);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.plain, object);
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, 'plain'), {
      value: object,
      enumerable: true,
      configurable: true,
      writable: true
    });
    const argument = {};
    assert.deepEqual(result.first(argument, 2), [argument, 2]);
    assert.deepEqual(result.first(argument), [argument]);
    assert.deepEqual(events.slice(5), [read, read]);
  });

  test(`${label}: only exact mutation dispatches exclusively without coercion or thenable assimilation`, () => {
    const poison = new Proxy(
      {},
      {
        get() {
          assert.fail('access value must not be inspected');
        }
      }
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const values = [
      'mutation',
      'read',
      'Mutation',
      'mutation ',
      '',
      undefined,
      null,
      false,
      true,
      0,
      -0,
      NaN,
      1n,
      Symbol('mutation'),
      [],
      {},
      new String('mutation'),
      () => 'mutation',
      Promise.resolve('mutation'),
      poison,
      revoked.proxy
    ];
    for (const value of values) {
      const events = [];
      let calls = 0;
      const result = wrap({ operation: () => 'result' }, controller(spec, events), {
        getAccess(name) {
          calls++;
          assert.equal(name, 'operation');
          return value;
        },
        skip: () => false
      });
      assert.equal(calls, 1);
      assert.deepEqual(events, []);
      assert.equal(result.operation(), 'result');
      assert.equal(result.operation(), 'result');
      assert.equal(calls, 1);
      assert.deepEqual(events, Array(2).fill(value === 'mutation' ? mutation : read));
    }
    let thenReads = 0;
    const result = wrap({ operation: () => 1 }, controller(spec, []), {
      getAccess: () => ({
        get then() {
          thenReads++;
          throw new Error('unused');
        }
      })
    });
    assert.equal(result.operation(), 1);
    assert.equal(thenReads, 0);
  });

  test(`${label}: undefined options and callback use default metadata; unknown names fail at construction`, () => {
    for (const options of [undefined, {}, { getAccess: undefined }, Object.create({ getAccess: undefined })]) {
      const events = [];
      const result = wrap(
        { createNote: () => 1, listNotes: () => 2, unknownValue: 3 },
        controller(spec, events),
        options
      );
      assert.equal(result.createNote(), 1);
      assert.equal(result.listNotes(), 2);
      assert.deepEqual(events, [mutation, read]);
      assert.throws(
        () => wrap({ futureOperation: () => {} }, controller(spec, []), options),
        error =>
          error instanceof Error &&
          error.message === 'Knowledge handler "futureOperation" is missing explicit operation access metadata.'
      );
    }
    assert.throws(() => wrap({}, {}, null), TypeError);
    for (const getAccess of [null, false, 0, 'read', {}, []]) {
      assert.deepEqual(wrap({ notFunction: getAccess }, {}, { getAccess }), { notFunction: getAccess });
      assert.throws(() => wrap({ operation() {} }, {}, { getAccess }), TypeError);
    }
  });

  test(`${label}: classification is cached while handler arguments, result and unbound receiver are preserved`, async () => {
    const events = [];
    let access = 'mutation';
    const token = {};
    const handlers = {
      operation: function (...args) {
        assert.equal(this, undefined);
        events.push(args);
        return token;
      }
    };
    const result = wrap(handlers, controller(spec, events), { getAccess: () => access });
    handlers.operation = () => assert.fail('must use snapshot');
    access = 'read';
    assert.equal(result.operation.call({ other: true }, token, 1), token);
    assert.deepEqual(events, [mutation, [token, 1]]);
    const promise = Promise.resolve(token);
    assert.equal(
      wrap({ operation: () => promise }, controller(spec, []), { getAccess: () => null }).operation(),
      promise
    );
    const thenable = {
      then(resolve) {
        resolve(token);
      }
    };
    const value = wrap({ operation: () => thenable }, controller(spec, []), { getAccess: () => [] }).operation();
    assert.equal(value, thenable);
    assert.equal(await value, token);
  });

  test(`${label}: getters and callback side effects keep eager entry order and exact thrown identities`, () => {
    const failure = { sentinel: 'failure' };
    const events = [];
    const handlers = {
      first() {},
      get second() {
        events.push('second');
        throw failure;
      }
    };
    sameThrown(
      () =>
        wrap(
          handlers,
          {},
          {
            getAccess() {
              events.push('access');
            }
          }
        ),
      failure
    );
    assert.deepEqual(events, ['second']);
    for (const reason of [failure, undefined, null, false, 0, '', Symbol('throw')]) {
      sameThrown(
        () =>
          wrap(
            { operation() {} },
            {},
            {
              getAccess() {
                throw reason;
              }
            }
          ),
        reason
      );
      sameThrown(
        () =>
          wrap(
            {},
            {},
            {
              get getAccess() {
                throw reason;
              }
            }
          ),
        reason
      );
      sameThrown(
        () =>
          wrap(
            {
              get operation() {
                throw reason;
              }
            },
            {},
            { getAccess: () => 'read' }
          ),
        reason
      );
    }
    const snapshots = { first: () => 1, second: () => 2 };
    const result = wrap(snapshots, controller(spec, []), {
      getAccess(name) {
        if (name === 'first') {
          snapshots.second = () => 99;
          snapshots.third = () => 3;
        }
        return 'read';
      }
    });
    assert.equal(result.second(), 2);
    assert.equal(result.third, undefined);
  });

  test(`${label}: option getters run once before entries and inherited callback remains callable`, () => {
    const events = [];
    const options = Object.create({
      get getAccess() {
        events.push('getAccess');
        return name => {
          events.push(`access:${name}`);
          return 'read';
        };
      }
    });
    Object.defineProperty(options, 'skip', {
      get() {
        events.push('skip');
        return () => false;
      }
    });
    const result = wrap(
      {
        get operation() {
          events.push('handler');
          return () => 1;
        }
      },
      controller(spec, events),
      options
    );
    assert.deepEqual(
      events,
      label === 'postgres'
        ? ['getAccess', 'skip', 'handler', 'access:operation']
        : ['getAccess', 'handler', 'access:operation']
    );
    result.operation();
    result.operation();
    assert.equal(events.filter(value => value === 'getAccess').length, 1);
    assert.equal(events.filter(value => value === 'access:operation').length, 1);
  });

  test(`${label}: raw handler and runner failures propagate unchanged, without retries`, async () => {
    for (const reason of [new Error('handler'), {}, null, undefined, false, 0, Symbol('failure')]) {
      let calls = 0;
      const result = wrap(
        {
          operation() {
            calls++;
            throw reason;
          }
        },
        controller(spec, []),
        { getAccess: () => 'mutation' }
      );
      sameThrown(() => result.operation(), reason);
      assert.equal(calls, 1);
      const pending = wrap({ operation: () => Promise.reject(reason) }, controller(spec, []), {
        getAccess: () => 'read'
      }).operation();
      await sameRejected(pending, reason);
      const control = {
        [read]() {
          throw reason;
        }
      };
      sameThrown(
        () =>
          wrap(
            {
              operation() {
                assert.fail('runner threw first');
              }
            },
            control,
            { getAccess: () => 'read' }
          ).operation(),
        reason
      );
    }
  });

  test(`${label}: null input throws but primitive, arrays, classes and callable proxies retain JS behavior`, () => {
    for (const input of [null, undefined]) assert.throws(() => wrap(input, {}), TypeError);
    for (const input of [false, 3, 1n, Symbol('input')]) assert.deepEqual(wrap(input, {}), {});
    assert.deepEqual(wrap('ab', {}), { 0: 'a', 1: 'b' });
    const names = [];
    const result = wrap([() => 1, 'value', () => 3], controller(spec, []), {
      getAccess: name => {
        names.push(name);
        return 'read';
      }
    });
    assert.deepEqual(names, ['0', '2']);
    assert.equal(result[0](), 1);
    assert.equal(result[1], 'value');
    const ClassHandler = class {};
    assert.throws(
      () => wrap({ ClassHandler }, controller(spec, []), { getAccess: () => 'read' }).ClassHandler(),
      TypeError
    );
    const calls = [];
    const proxy = new Proxy((...args) => args, {
      apply(target, receiver, args) {
        calls.push(receiver);
        return Reflect.apply(target, receiver, args);
      }
    });
    assert.deepEqual(wrap({ proxy }, controller(spec, []), { getAccess: () => 'read' }).proxy(1, 2), [1, 2]);
    assert.deepEqual(calls, [undefined]);
  });
}

test('postgres: skip runs after access once, preserves original function and uses truthiness without coercion', () => {
  for (const skipValue of [true, 1, 'yes', {}, [], Promise.resolve(false)]) {
    const events = [];
    const handler = function () {
      return this;
    };
    const result = wrapHandlersWithPostgresAdvisoryLock(
      { operation: handler, value: 1 },
      {},
      {
        getAccess(name) {
          events.push(`access:${name}`);
          return 'mutation';
        },
        skip(name) {
          assert.equal(this, undefined);
          events.push(`skip:${name}`);
          return skipValue;
        }
      }
    );
    assert.equal(result.operation, handler);
    assert.equal(result.operation(), result);
    assert.deepEqual(events, ['access:operation', 'skip:operation']);
  }
  for (const skipValue of [false, undefined, null, 0, '', NaN]) {
    const events = [];
    const result = wrapHandlersWithPostgresAdvisoryLock({ operation: () => 1 }, controller(wrappers[1], events), {
      getAccess: () => 'mutation',
      skip: () => skipValue
    });
    assert.equal(result.operation(), 1);
    assert.deepEqual(events, ['runExclusive']);
  }
});

test('postgres: default skip bypasses only two deletion functions but never bypasses access errors', () => {
  for (const options of [undefined, {}, { skip: undefined }]) {
    const handlers = { permanentlyDeleteNote() {}, emptyRecycleBin() {}, permanentlyDeleteKnowledgeItem() {} };
    const events = [];
    const result = wrapHandlersWithPostgresAdvisoryLock(handlers, controller(wrappers[1], events), options);
    assert.equal(result.permanentlyDeleteNote, handlers.permanentlyDeleteNote);
    assert.equal(result.emptyRecycleBin, handlers.emptyRecycleBin);
    assert.notEqual(result.permanentlyDeleteKnowledgeItem, handlers.permanentlyDeleteKnowledgeItem);
    result.permanentlyDeleteKnowledgeItem();
    assert.deepEqual(events, ['runExclusive']);
  }
  const failure = {};
  let skips = 0;
  sameThrown(
    () =>
      wrapHandlersWithPostgresAdvisoryLock(
        { permanentlyDeleteNote() {} },
        {},
        {
          getAccess() {
            throw failure;
          },
          skip() {
            skips++;
            return true;
          }
        }
      ),
    failure
  );
  assert.equal(skips, 0);
  assert.throws(
    () => wrapHandlersWithPostgresAdvisoryLock({ unknown() {} }, {}, { skip: () => true }),
    /missing explicit operation access metadata/
  );
  for (const skip of [null, false, 0, {}, 'yes']) {
    assert.deepEqual(wrapHandlersWithPostgresAdvisoryLock({ value: 1 }, {}, { skip }), { value: 1 });
    assert.throws(() => wrapHandlersWithPostgresAdvisoryLock({ listNotes() {} }, {}, { skip }), TypeError);
  }
  sameThrown(
    () =>
      wrapHandlersWithPostgresAdvisoryLock(
        { listNotes() {} },
        {},
        {
          skip() {
            throw failure;
          }
        }
      ),
    failure
  );
});

test('maintenance: real gate serializes mutations while independent reads overlap', async () => {
  const gate = createMaintenanceGate();
  const release = deferred();
  const started = deferred();
  const events = [];
  const handlers = wrapHandlersWithMaintenanceGate(
    {
      first: async () => {
        events.push('first:start');
        started.resolve();
        await release.promise;
        events.push('first:end');
      },
      second: () => events.push('second'),
      read: () => events.push('read')
    },
    gate,
    { getAccess: name => (name === 'read' ? 'read' : 'mutation') }
  );
  const first = handlers.first();
  await started.promise;
  const second = handlers.second();
  await handlers.read();
  assert.deepEqual(events, ['first:start', 'read']);
  assert.equal(gate.getState().activeOperations, 1);
  release.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'read', 'first:end', 'second']);
  assert.deepEqual(gate.getState(), idle);
});

test('maintenance: queued maintenance drains active work and precedes later reads and writes', async () => {
  const gate = createMaintenanceGate();
  const release = deferred();
  const started = deferred();
  const events = [];
  const active = gate.runOperation(async () => {
    events.push('active');
    started.resolve();
    await release.promise;
  });
  await started.promise;
  const first = gate.runMaintenance(() => events.push('maintenance:1'));
  const second = gate.runMaintenance(() => events.push('maintenance:2'));
  const handlers = wrapHandlersWithMaintenanceGate(
    { listNotes: () => events.push('read'), createNote: () => events.push('write') },
    gate
  );
  const read = handlers.listNotes();
  const write = handlers.createNote();
  assert.deepEqual(gate.getState(), { activeOperations: 1, maintenanceActive: false, waitingMaintenances: 2 });
  release.resolve();
  await Promise.all([active, first, second, read, write]);
  assert.deepEqual(events.slice(0, 3), ['active', 'maintenance:1', 'maintenance:2']);
  assert.deepEqual(new Set(events.slice(3)), new Set(['read', 'write']));
  assert.deepEqual(gate.getState(), idle);
});

test('maintenance: handler rejection, thenable failure and maintenance failure release all queues', async () => {
  const gate = createMaintenanceGate();
  const error = {};
  for (const method of ['runOperation', 'runMutation', 'runMaintenance']) {
    await sameRejected(
      gate[method](() => {
        throw error;
      }),
      error
    );
    await sameRejected(
      gate[method](() => ({
        get then() {
          throw error;
        }
      })),
      error
    );
    const marker = {};
    assert.equal(
      await gate[method](() => ({
        then(resolve) {
          resolve(marker);
        }
      })),
      marker
    );
    assert.deepEqual(gate.getState(), idle);
  }
  const bad = gate.runMutation(() => Promise.reject(error));
  const good = gate.runMutation(() => 'recovered');
  await sameRejected(bad, error);
  assert.equal(await good, 'recovered');
  assert.deepEqual(gate.getState(), idle);
});

test('postgres: real lock acquires exact transaction-scoped SQL before handler and commits result', async () => {
  for (const [method, sqlFunction] of [
    ['runShared', 'pg_advisory_xact_lock_shared'],
    ['runExclusive', 'pg_advisory_xact_lock']
  ]) {
    const events = [];
    const result = {};
    const release = deferred();
    const started = deferred();
    const transaction = {
      async $queryRawUnsafe(...args) {
        assert.equal(this, transaction);
        events.push(args);
        started.resolve();
        await release.promise;
      }
    };
    const client = {
      async $transaction(operation, options) {
        assert.equal(this, client);
        events.push(options);
        const value = await operation(transaction);
        events.push('commit');
        return value;
      }
    };
    const promise = createPostgresAdvisoryLock(client)[method](tx => {
      assert.equal(tx, transaction);
      events.push('handler');
      return result;
    });
    await started.promise;
    assert.deepEqual(events, [
      { isolationLevel: 'Serializable' },
      [`SELECT ${sqlFunction}($1::integer, $2::integer)::text AS lock_acquired`, 1266775634, 32]
    ]);
    release.resolve();
    assert.equal(await promise, result);
    assert.deepEqual(events.slice(2), ['handler', 'commit']);
  }
});

test('postgres: lock acquisition and handler failures roll back mocks without changing throw identity', async () => {
  for (const stage of ['lock', 'handler'])
    for (const reason of [new Error(stage), {}, null, undefined, 0]) {
      const events = [];
      let committed = 0;
      let rolledBack = 0;
      const transaction = {
        $queryRawUnsafe() {
          events.push('lock');
          if (stage === 'lock') return Promise.reject(reason);
        }
      };
      const client = {
        async $transaction(operation) {
          try {
            const value = await operation(transaction);
            committed++;
            return value;
          } catch (error) {
            rolledBack++;
            events.push('rollback');
            throw error;
          }
        }
      };
      await sameRejected(
        createPostgresAdvisoryLock(client).runExclusive(() => {
          events.push('handler');
          throw reason;
        }),
        reason
      );
      assert.equal(committed, 0);
      assert.equal(rolledBack, 1);
      assert.deepEqual(events, stage === 'lock' ? ['lock', 'rollback'] : ['lock', 'handler', 'rollback']);
    }
});

test('postgres: absent transaction/query methods retain fallback arguments and thenable semantics', async () => {
  const result = {};
  for (const client of [undefined, null, {}, { $transaction: 1 }]) {
    for (const method of ['runShared', 'runExclusive']) {
      assert.equal(
        await createPostgresAdvisoryLock(client)[method](tx => {
          assert.equal(tx, client);
          return {
            then(resolve) {
              resolve(result);
            }
          };
        }),
        result
      );
    }
  }
  for (const transaction of [undefined, null, {}, { $queryRawUnsafe: 1 }]) {
    const client = { $transaction: operation => operation(transaction) };
    assert.equal(
      await createPostgresAdvisoryLock(client).runShared(tx => {
        assert.equal(tx, transaction);
        return result;
      }),
      result
    );
  }
  const failure = {};
  for (const client of [
    {
      get $transaction() {
        throw failure;
      }
    },
    {
      $transaction() {
        throw failure;
      }
    },
    {
      $transaction: operation =>
        operation({
          get $queryRawUnsafe() {
            throw failure;
          }
        })
    }
  ]) {
    await sameRejected(
      createPostgresAdvisoryLock(client).runShared(() => assert.fail('must not run')),
      failure
    );
  }
});

test('local and PostgreSQL real handler constructions classify every function without real storage', async () => {
  const context = createAppContext({ ownerId: 'access-callback-test' });
  const local = context.http.knowledge;
  const pg = createPostgresKnowledgeHttpHandlers({
    knowledgeModule: context.modules.knowledge,
    ownerId: 'access-callback-test'
  });
  for (const handlers of [local, pg]) {
    const functions = Object.entries(handlers).filter(([, value]) => typeof value === 'function');
    assert.ok(functions.length > 100);
    const events = [];
    const wrapped = wrapHandlersWithMaintenanceGate(
      wrapHandlersWithPostgresAdvisoryLock(handlers, controller(wrappers[1], events)),
      controller(wrappers[0], events)
    );
    assert.deepEqual(Object.keys(wrapped), Object.keys(handlers));
    for (const [name] of functions) assert.ok(['read', 'mutation'].includes(getKnowledgeOperationAccess(name)));
    assert.deepEqual(await wrapped.listNotes(), []);
    assert.deepEqual(events, ['runOperation', 'runShared']);
  }
});

test('AI real runtime marks every action read and attachments upload/remove mutation while close bypasses gate', async () => {
  const events = [];
  const gate = controller(wrappers[0], events, false);
  const context = createAppContext({ ownerId: 'access-callback-test' });
  const repositories = context.modules.knowledge.repositories;
  const runtime = createAiRuntime({
    modelSettings: {
      resolveCredential() {
        assert.fail('no credentials');
      }
    },
    providerAdapter: {
      complete() {
        assert.fail('no external AI');
      },
      stream() {
        assert.fail('no external AI');
      }
    },
    repository: {},
    actionStore: {},
    coreOperationStore: {},
    conversationStore: {},
    knowledge: context.modules.knowledge,
    contextSources: {
      ...repositories,
      spaceRepository: repositories.knowledgeSpaceRepository,
      ownerId: 'access-callback-test'
    },
    uploadsDir: join(tmpdir(), 'knowra-unused-access-callback-uploads'),
    maintenanceGate: gate
  });
  assert.ok(Object.keys(runtime.actions).length > 10);
  for (const action of Object.values(runtime.actions))
    if (typeof action === 'function') assert.equal(action(), 'runOperation');
  assert.ok(events.length > 10);
  assert.ok(events.every(event => event === 'runOperation'));
  events.length = 0;
  for (const [name, operation] of Object.entries(runtime.attachments)) {
    if (name === 'close') continue;
    assert.equal(operation(), ['upload', 'remove'].includes(name) ? 'runMutation' : 'runOperation');
  }
  const beforeClose = events.length;
  await runtime.attachments.close();
  assert.equal(events.length, beforeClose);
  const withoutGate = createAiRuntime({
    modelSettings: { resolveCredential() {} },
    providerAdapter: {
      complete() {
        assert.fail('no external AI');
      },
      stream() {
        assert.fail('no external AI');
      }
    },
    actionStore: {},
    coreOperationStore: {},
    knowledge: context.modules.knowledge,
    contextSources: { ownerId: 'access-callback-test' }
  });
  assert.ok(withoutGate.actions);
  assert.equal(withoutGate.attachments, null);
});

test('postgres: skip side effects never reclassify or await truthy thenables and preserve failure identity', () => {
  const events = [];
  const failure = {};
  const thenable = {
    get then() {
      return assert.fail('skip thenable must not be inspected');
    }
  };
  const handlers = {
    first() {
      events.push('first');
    },
    second() {
      events.push('second');
    }
  };
  const result = wrapHandlersWithPostgresAdvisoryLock(handlers, controller(wrappers[1], events), {
    getAccess(name) {
      events.push(`access:${name}`);
      return 'mutation';
    },
    skip(name) {
      events.push(`skip:${name}`);
      if (name === 'first') {
        handlers.second = () => assert.fail('entry snapshot');
        return thenable;
      }
      return false;
    }
  });
  assert.deepEqual(events, ['access:first', 'skip:first', 'access:second', 'skip:second']);
  result.first();
  result.second();
  assert.deepEqual(events.slice(4), ['first', 'runExclusive', 'second']);
  for (const reason of [failure, undefined, null, false, 0, '', Symbol('skip failure')]) {
    const calls = [];
    sameThrown(
      () =>
        wrapHandlersWithPostgresAdvisoryLock(
          { first() {}, second() {} },
          {},
          {
            getAccess(name) {
              calls.push(`access:${name}`);
              return 'read';
            },
            skip(name) {
              calls.push(`skip:${name}`);
              throw reason;
            }
          }
        ),
      reason
    );
    assert.deepEqual(calls, ['access:first', 'skip:first']);
  }
});

test('PostgreSQL real app factory assembles nested knowledge and sync wrappers using only fake DB', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-access-factory-'));
  const events = [];
  const journal = {
    version: 1,
    epoch: 'test-epoch',
    head: 0,
    floor: 0,
    revisions: {},
    tombstones: {},
    changes: [],
    receipts: {},
    snapshots: {}
  };
  const models = new Map();
  const client = new Proxy(
    {
      async $connect() {
        events.push('connect');
      },
      async $executeRawUnsafe(sql) {
        events.push(sql);
        return 1;
      },
      async $disconnect() {
        events.push('disconnect');
      },
      async $queryRawUnsafe(sql) {
        events.push(sql);
        return sql === 'SELECT version FROM knowledge_artifact_provenance_migrations' ? [{ version: 1 }] : [];
      },
      async $transaction(operation) {
        events.push('transaction');
        return operation(client);
      }
    },
    {
      get(target, key, receiver) {
        if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
        if (typeof key !== 'string' || key === 'then') return undefined;
        if (!models.has(key))
          models.set(key, {
            async findMany() {
              return [];
            },
            async findUnique() {
              return key === 'syncJournal' ? { payload: journal } : null;
            },
            async upsert(input) {
              events.push(`${key}:upsert`);
              return input.create;
            }
          });
        return models.get(key);
      }
    }
  );
  let context;
  try {
    context = await createPostgresAppContext({
      client,
      ownerId: 'access-callback-test',
      storageRootDir: directory,
      uploadsDir: join(directory, 'uploads')
    });
    assert.equal(context.driver, 'postgres');
    assert.ok(Object.keys(context.http.knowledge).length > 100);
    for (const name of ['push', 'pushBatch', 'uploadBlob', 'bootstrap', 'status'])
      assert.equal(typeof context.http.sync[name], 'function');
    events.length = 0;
    assert.deepEqual(await context.http.knowledge.listNotes(), []);
    assert.ok(events.some(event => event.includes('pg_advisory_xact_lock_shared')));
    const status = await context.http.sync.status();
    assert.equal(status.ownerId, 'access-callback-test');
    assert.equal(status.datasetEpoch, 'test-epoch');
    await assert.rejects(context.http.sync.push({}), error => typeof error.code === 'string');
    assert.equal((await context.http.sync.status()).datasetEpoch, 'test-epoch');
  } finally {
    await context?.close();
    rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(events.at(-1), 'disconnect');
});

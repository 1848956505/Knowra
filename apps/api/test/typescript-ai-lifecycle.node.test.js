import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// 两个原文件已与迁移前本地版本逐字节核对；基线只依赖已发布的提交。
const baseline = process.env.KNOWRA_AI_LIFECYCLE_BASELINE === '1';
const baselineRef = 'b4f8dc6c1a299be1db24ff2b68b9d462895a4800';
const modulePath = '../src/modules/ai/';
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadModules() {
  if (!baseline) {
    return {
      ...(await import(`${modulePath}recovery-scope.js`)),
      ...(await import(`${modulePath}runtime-lifecycle.js`))
    };
  }
  const original = name =>
    execFileSync('git', ['show', `${baselineRef}:apps/api/src/modules/ai/${name}.js`], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8'
    });
  const scopeUrl = dataUrl(original('recovery-scope'));
  const lifecycleUrl = dataUrl(
    original('runtime-lifecycle').replace("'./recovery-scope.js'", JSON.stringify(scopeUrl))
  );
  return { ...(await import(scopeUrl)), ...(await import(lifecycleUrl)) };
}
const { createAiRecoveryScope, aiRuntimeLifecycle } = await loadModules();
const deferred = () => Promise.withResolvers();
const tick = () => new Promise(resolve => setImmediate(resolve));
async function assertPending(promise) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await tick();
  assert.equal(settled, false, '尚未完成的已接纳操作必须阻止关闭完成');
}
const unavailable = { message: 'AI 功能已关闭。', code: 'AI_GENERATION_UNAVAILABLE' };

test('AI lifecycle JS bridges preserve exact TS exports', { skip: baseline }, async () => {
  for (const name of ['recovery-scope', 'runtime-lifecycle']) {
    const js = await import(`${modulePath}${name}.js`);
    const ts = await import(`${modulePath}${name}.ts`);
    assert.deepEqual(Object.keys(js), Object.keys(ts));
    for (const key of Object.keys(js)) assert.equal(js[key], ts[key]);
  }
});

test('scope defers invocation to one microtask and assimilates returned promises', async () => {
  const scope = createAiRecoveryScope();
  const gate = deferred();
  const events = [];
  const running = scope.run(() => {
    events.push('operation');
    return gate.promise;
  });
  assert.notEqual(running, gate.promise);
  assert.equal(scope.closed, false);
  events.push('sync');
  queueMicrotask(() => events.push('observer'));
  await Promise.resolve();
  assert.deepEqual(events, ['sync', 'operation', 'observer']);
  gate.resolve(42);
  assert.equal(await running, 42);
  assert.equal(await scope.close(), undefined);
});

test('scope close marks closed synchronously, cancels queued work and preserves promise identity', async () => {
  const scope = createAiRecoveryScope();
  const events = [];
  const running = scope.run(() => events.push('must not run'));
  const rejection = assert.rejects(running, unavailable);
  const closing = scope.close(() => {
    events.push('stop');
  });
  assert.equal(scope.closed, true);
  assert.deepEqual(events, []);
  assert.equal(
    scope.close(() => {
      throw new Error('later stop must be ignored');
    }),
    closing
  );
  queueMicrotask(() => events.push('observer'));
  await Promise.resolve();
  assert.deepEqual(events, ['stop', 'observer']);
  await rejection;
  assert.equal(await closing, undefined);
  assert.equal(scope.close(), closing);
  const first = scope.run(() => {}),
    second = scope.run(() => {});
  assert.notEqual(first, second);
  await Promise.all([assert.rejects(first, unavailable), assert.rejects(second, unavailable)]);
});

test('scope drains every accepted operation despite earlier failures and ignores operation errors at close', async () => {
  const scope = createAiRecoveryScope();
  const gates = [deferred(), deferred(), deferred()];
  const failures = [new Error('first'), new Error('last')];
  const runs = gates.map(gate => scope.run(() => gate.promise));
  const settled = Promise.allSettled(runs);
  await Promise.resolve();
  let stops = 0;
  const closing = scope.close(() => {
    stops++;
  });
  gates[0].reject(failures[0]);
  gates[1].resolve('middle');
  await assertPending(closing);
  assert.equal(stops, 1);
  gates[2].reject(failures[1]);
  assert.equal(await closing, undefined);
  assert.deepEqual(await settled, [
    { status: 'rejected', reason: failures[0] },
    { status: 'fulfilled', value: 'middle' },
    { status: 'rejected', reason: failures[1] }
  ]);
});

test('scope stop failure takes precedence but cannot short circuit draining', async () => {
  const scope = createAiRecoveryScope();
  const gate = deferred();
  const operationError = new Error('operation');
  const stopError = { source: 'stop' };
  const running = scope.run(() => gate.promise);
  const rejectedRun = assert.rejects(running, error => error === operationError);
  await Promise.resolve();
  const closing = scope.close(() => {
    throw stopError;
  });
  const rejectedClose = assert.rejects(closing, error => error === stopError);
  await assertPending(closing);
  gate.reject(operationError);
  await Promise.all([rejectedRun, rejectedClose]);
  assert.equal(
    scope.close(() => {}),
    closing
  );
});

test('scope assimilates operation and stop thenables without eager calls', async () => {
  const scope = createAiRecoveryScope();
  const events = [];
  const gate = deferred();
  const running = scope.run(() => ({
    then(resolve) {
      events.push('operation then');
      gate.promise.then(resolve);
    }
  }));
  assert.deepEqual(events, []);
  await tick();
  assert.deepEqual(events, ['operation then']);
  const closing = scope.close(() => ({
    then(resolve) {
      events.push('stop then');
      resolve('ignored');
    }
  }));
  assert.deepEqual(events, ['operation then']);
  await assertPending(closing);
  assert.deepEqual(events, ['operation then', 'stop then']);
  gate.resolve('value');
  assert.equal(await running, 'value');
  assert.equal(await closing, undefined);
});

test('scope converts synchronous throws and throwing then accessors into rejections', async () => {
  for (const operation of [
    () => {
      throw 'sync failure';
    },
    () => ({
      get then() {
        throw 'sync failure';
      }
    })
  ]) {
    const scope = createAiRecoveryScope();
    const running = scope.run(operation);
    await assert.rejects(running, error => error === 'sync failure');
    await scope.close();
  }
});

test('runtime default recovery is sequential, dynamically resolves methods and preserves receivers', async () => {
  const events = [];
  const gate = deferred();
  const runtime = {
    attachments: {
      recover() {
        assert.equal(this, runtime.attachments);
        events.push('attachments');
        return gate.promise;
      }
    },
    conversationStore: {
      recoverInterrupted() {
        throw new Error('stale conversation');
      }
    },
    agent: {
      recover() {
        assert.equal(this, runtime.agent);
        events.push('agent');
      }
    },
    worker: {
      recover() {
        assert.equal(this, runtime.worker);
        events.push('worker');
      }
    }
  };
  const owner = aiRuntimeLifecycle(runtime);
  const recovering = owner.recover();
  assert.deepEqual(events, []);
  await tick();
  assert.deepEqual(events, ['attachments']);
  runtime.conversationStore = {
    recoverInterrupted() {
      assert.equal(this, runtime.conversationStore);
      events.push('conversation');
    }
  };
  gate.resolve();
  assert.equal(await recovering, undefined);
  assert.deepEqual(events, ['attachments', 'conversation', 'agent', 'worker']);
  await owner.close();
});

test('runtime observes caller stage order, duplicates and stage-list mutation after invocation', async () => {
  const events = [];
  const runtime = Object.fromEntries(
    ['attachments', 'agent', 'worker'].map(name => [
      name,
      {
        recover() {
          events.push(name);
        }
      }
    ])
  );
  const names = ['worker'];
  const owner = aiRuntimeLifecycle(runtime);
  const recovering = owner.recover(names);
  names.push('agent', 'worker', 'attachments');
  await recovering;
  assert.deepEqual(events, names);
  await owner.close();
});

test('runtime rejects a failed stage without running later stages, while independent recoveries drain', async () => {
  const gate = deferred();
  const failure = new Error('recovery');
  let later = 0;
  const owner = aiRuntimeLifecycle({
    attachments: {
      recover() {
        throw failure;
      }
    },
    worker: {
      recover() {
        return gate.promise;
      }
    },
    agent: {
      recover() {
        later++;
      }
    }
  });
  const first = owner.recover(['attachments', 'agent']);
  const second = owner.recover(['worker', 'agent']);
  const rejected = assert.rejects(first, error => error === failure);
  await tick();
  const closing = owner.close();
  await rejected;
  await assertPending(closing);
  gate.resolve();
  await Promise.all([second, closing]);
  assert.equal(later, 0);
});

test('runtime immediate close cancels recovery and repeated close returns the same promise', async () => {
  let recoveries = 0,
    stops = 0;
  const owner = aiRuntimeLifecycle({
    worker: {
      recover() {
        recoveries++;
      },
      close() {
        stops++;
      }
    }
  });
  const recovering = owner.recover();
  const rejection = assert.rejects(recovering, unavailable);
  const closing = owner.close();
  assert.equal(owner.close(), closing);
  await Promise.all([rejection, closing]);
  assert.equal(recoveries, 0);
  assert.equal(stops, 1);
  assert.equal(owner.close(), closing);
  await assert.rejects(owner.recover([]), unavailable);
});

test('runtime closes all services concurrently, awaits recovery and orders AggregateError by service order', async () => {
  const gates = [deferred(), deferred(), deferred()];
  const recovery = deferred();
  const errors = [new Error('attachments'), { source: 'agent' }, 'worker'];
  const calls = [];
  const runtime = Object.fromEntries(
    ['attachments', 'agent', 'worker'].map((name, index) => [
      name,
      {
        recover() {
          return recovery.promise;
        },
        close() {
          assert.equal(this, runtime[name]);
          calls.push(name);
          return gates[index].promise;
        }
      }
    ])
  );
  runtime.conversationStore = {
    close() {
      throw new Error('conversation must not close');
    }
  };
  const owner = aiRuntimeLifecycle(runtime);
  const recovering = owner.recover(['worker']);
  await Promise.resolve();
  const closing = owner.close();
  const rejected = assert.rejects(closing, error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, 'AI 执行器关闭失败。');
    assert.deepEqual(error.errors, errors);
    return true;
  });
  assert.deepEqual(calls, []);
  await tick();
  assert.deepEqual(calls, ['attachments', 'agent', 'worker']);
  gates[2].reject(errors[2]);
  gates[0].reject(errors[0]);
  await assertPending(closing);
  gates[1].reject(errors[1]);
  await assertPending(closing);
  recovery.resolve();
  await Promise.all([recovering, rejected]);
  assert.equal(owner.close(), closing);
});

test('runtime close dynamically reads methods, catches synchronous failures and assimilates thenables', async () => {
  const failure = new Error('synchronous close');
  const calls = [];
  const runtime = {
    attachments: {
      close() {
        throw new Error('stale close');
      }
    }
  };
  const owner = aiRuntimeLifecycle(runtime);
  const closing = owner.close();
  runtime.attachments = {
    close() {
      assert.equal(this, runtime.attachments);
      calls.push('attachments');
      throw failure;
    }
  };
  runtime.agent = {
    close() {
      calls.push('agent');
      return {
        then(resolve) {
          calls.push('then');
          resolve();
        }
      };
    }
  };
  runtime.worker = {
    close() {
      calls.push('worker');
    }
  };
  await assert.rejects(
    closing,
    error => error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === failure
  );
  assert.deepEqual(calls, ['attachments', 'agent', 'worker', 'then']);
});

test('runtime owners are keyed by object identity, including callable owners', async () => {
  for (const runtime of [{}, () => {}, Object.create(null)]) {
    const owner = aiRuntimeLifecycle(runtime);
    assert.equal(aiRuntimeLifecycle(runtime), owner);
    assert.notEqual(aiRuntimeLifecycle({}), owner);
    await owner.close();
    assert.equal(aiRuntimeLifecycle(runtime), owner);
    await assert.rejects(aiRuntimeLifecycle(runtime).recover(), unavailable);
  }
});

test('runtime accepts nullish and falsy primitive runtimes without caching', async () => {
  for (const runtime of [undefined, null, false, 0, -0, '', NaN, 0n]) {
    const first = aiRuntimeLifecycle(runtime),
      second = aiRuntimeLifecycle(runtime);
    assert.notEqual(first, second);
    await Promise.all([first.recover(), second.recover()]);
    await Promise.all([first.close(), second.close()]);
  }
  for (const runtime of [true, 1, 'runtime', 1n]) assert.throws(() => aiRuntimeLifecycle(runtime), TypeError);
});

test('runtime preserves unknown and inherited stage-name behavior rather than validating or filtering', async () => {
  for (const name of ['missing', '__proto__']) {
    const owner = aiRuntimeLifecycle({});
    await assert.rejects(owner.recover([name]), TypeError);
    await owner.close();
  }
  for (const name of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', 'toLocaleString']) {
    const owner = aiRuntimeLifecycle({});
    assert.equal(await owner.recover([name]), undefined);
    await owner.close();
  }
  const owner = aiRuntimeLifecycle({});
  await assert.rejects(owner.recover(null), TypeError);
  await assert.rejects(owner.recover('worker'), TypeError);
  await owner.close();
});

test('scope waits for stop after accepted operations finish and preserves thenable rejection identity', async () => {
  const scope = createAiRecoveryScope();
  const stop = deferred();
  const failure = { source: 'thenable stop' };
  assert.equal(await scope.run(() => 'finished'), 'finished');
  const closing = scope.close(() => ({
    then(resolve, reject) {
      stop.promise.then(resolve, reject);
    }
  }));
  const rejection = assert.rejects(closing, error => error === failure);
  await assertPending(closing);
  stop.reject(failure);
  await rejection;
  assert.equal(
    scope.close(() => {}),
    closing
  );
});

test('runtime optional methods stay optional but non-callable members remain errors', async () => {
  const empty = aiRuntimeLifecycle({
    attachments: null,
    conversationStore: {},
    agent: { recover: null },
    worker: undefined
  });
  await empty.recover();
  await empty.close();
  const invalid = aiRuntimeLifecycle({ agent: { recover: 1, close: 1 } });
  await assert.rejects(invalid.recover(['agent']), TypeError);
  await assert.rejects(
    invalid.close(),
    error => error instanceof AggregateError && error.errors.length === 1 && error.errors[0] instanceof TypeError
  );
});

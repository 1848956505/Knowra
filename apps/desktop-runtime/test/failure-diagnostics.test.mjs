import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withFailureDiagnostics } from './e2e/helpers/failure-diagnostics.mjs';

test('失败诊断保持同步及异步成功值的身份，不记录日志', async () => {
  const result = { saved: true };
  const logged = [];
  for (const callback of [() => result, async () => result]) {
    const wrapped = withFailureDiagnostics(callback, error => logged.push(error));
    assert.strictEqual(await wrapped(), result);
  }
  assert.deepEqual(logged, []);
});

test('失败诊断立即记录同步异常，并以同一异常拒绝', async () => {
  const failure = new Error('同步测试失败');
  const logged = [];
  const wrapped = withFailureDiagnostics(
    () => {
      throw failure;
    },
    error => logged.push(error)
  );
  const pending = wrapped();
  assert.deepEqual(logged, [failure], '调用返回时已有日志，不依赖最终测试报告');
  assert.strictEqual(logged[0], failure);
  await assert.rejects(pending, error => error === failure);
});

test('失败诊断在异步异常传给调用者之前记录原始异常', async () => {
  const failure = new Error('异步测试失败');
  const deferred = Promise.withResolvers();
  const logged = [];
  const pending = withFailureDiagnostics(
    () => deferred.promise,
    error => logged.push(error)
  )();
  assert.deepEqual(logged, []);
  deferred.reject(failure);
  await assert.rejects(pending, error => {
    assert.deepEqual(logged, [failure]);
    assert.strictEqual(logged[0], failure);
    return error === failure;
  });
});

test('失败诊断不包装或转换同步及异步抛出的非 Error 值', async () => {
  for (const failure of [undefined, null, false, 0, NaN, '失败', Symbol('失败'), { code: '失败' }]) {
    const logged = [];
    for (const callback of [
      () => {
        throw failure;
      },
      async () => {
        throw failure;
      }
    ]) {
      await assert.rejects(withFailureDiagnostics(callback, error => logged.push(error))(), error =>
        Object.is(error, failure)
      );
    }
    assert.equal(logged.length, 2);
    for (const error of logged) assert.strictEqual(error, failure);
  }
});

test('失败诊断保留回调的接收者、全部实参及单次调用', async () => {
  const receiver = { runtime: true };
  const first = { context: true };
  const second = Symbol('实参');
  let calls = 0;
  const wrapped = withFailureDiagnostics(
    function (...args) {
      calls++;
      assert.strictEqual(this, receiver);
      assert.equal(args.length, 3);
      assert.strictEqual(args[0], first);
      assert.strictEqual(args[1], second);
      assert.strictEqual(args[2], undefined);
      return this;
    },
    () => assert.fail('成功路径不得记录日志')
  );
  assert.strictEqual(await wrapped.call(receiver, first, second, undefined), receiver);
  assert.equal(calls, 1);
});

test('同步 logger 失败不能替换原始测试异常或非 Error 值', async () => {
  const loggerFailure = new Error('日志写入失败');
  for (const failure of [new Error('原始测试失败'), undefined, { code: '原始失败' }]) {
    let logged;
    const wrapped = withFailureDiagnostics(
      () => {
        throw failure;
      },
      error => {
        logged = error;
        throw loggerFailure;
      }
    );
    await assert.rejects(wrapped(), error => Object.is(error, failure));
    assert.strictEqual(logged, failure);
  }
});

test('异步 logger 拒绝不会成为未处理异常，也不替换原始测试异常', async () => {
  const failure = new Error('原始测试失败');
  const loggerFailure = new Error('异步日志失败');
  const logged = [];
  const wrapped = withFailureDiagnostics(
    async () => {
      throw failure;
    },
    async error => {
      logged.push(error);
      throw loggerFailure;
    }
  );
  await assert.rejects(wrapped(), error => error === failure);
  assert.equal(logged.length, 1);
  assert.strictEqual(logged[0], failure);
  // 跨过一个事件循环；node:test 会将未处理的 logger 拒绝判为失败。
  await new Promise(resolve => setImmediate(resolve));
});

test('未完成的异步 logger 不阻塞原始异常的传播', async () => {
  const failure = new Error('原始测试失败');
  const logger = Promise.withResolvers();
  const logged = [];
  const wrapped = withFailureDiagnostics(
    () => {
      throw failure;
    },
    error => {
      logged.push(error);
      return logger.promise;
    }
  );
  let outcome;
  const settled = wrapped().then(
    value => {
      outcome = { status: 'fulfilled', value };
    },
    error => {
      outcome = { status: 'rejected', error };
    }
  );
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(outcome?.status, 'rejected', '日志未完成时，原始异常也应已传给调用者');
    assert.strictEqual(outcome.error, failure);
    assert.equal(logged.length, 1);
    assert.strictEqual(logged[0], failure);
  } finally {
    logger.resolve();
    await settled;
  }
});

test('默认使用 console.error 记录原始异常且只记录一次', async t => {
  const logger = t.mock.method(console, 'error', () => {});
  const failure = new Error('默认日志失败诊断');
  await assert.rejects(
    withFailureDiagnostics(async () => {
      throw failure;
    })(),
    error => error === failure
  );
  assert.equal(logger.mock.callCount(), 1);
  assert.equal(logger.mock.calls[0].arguments.length, 1);
  assert.strictEqual(logger.mock.calls[0].arguments[0], failure);
});

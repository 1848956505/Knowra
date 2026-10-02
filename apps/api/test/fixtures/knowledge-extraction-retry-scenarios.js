import assert from 'node:assert/strict';

export async function assertCrossInstanceExtractionRetry({ service, other, store, mock, input, advance, deferred }) {
  const job = await service.start(input), running = service.run(job.jobId), failed = assert.rejects(running);
  await deferred.called;
  advance(120001); assert.equal(await other.recover(), 1);
  assert.equal((await other.retry(job.jobId)).status, 'retrying');
  const events = store.aiRepository.listEvents(job.jobId);
  deferred.release(); await failed;
  assert.equal((await other.get(job.jobId)).status, 'retrying');
  assert.deepEqual(store.aiRepository.listEvents(job.jobId), events, '旧代不能追加失败收尾事件');
  await other.idle();
  assertAcceptedSecondAttempt({ store, mock, jobId: job.jobId });
  assert.equal((await other.get(job.jobId)).status, 'succeeded');
}

// 只延迟 fail 已提交后的异步返回，不持有事务；确保旧 run 仍在 active Map 中。
export function holdExtractionFailureFinalization(store) {
  const transact = store.knowledgeExtractionTaskStore.runTransaction;
  let enter, release, holding = true;
  const entered = new Promise(resolve => { enter = resolve; });
  const done = new Promise(resolve => { release = resolve; });
  store.knowledgeExtractionTaskStore.runTransaction = (...args) => {
    const result = transact(...args);
    if (holding && result === undefined) { enter(); return done; }
    return result;
  };
  return { entered, release() { holding = false; release(); }, restore() { store.knowledgeExtractionTaskStore.runTransaction = transact; } };
}

export async function assertSameInstanceExtractionRetry({ service, other, store, mock, input, advance, deferred, cancel = false }) {
  const job = await service.start(input);
  await deferred.called;
  const finalization = holdExtractionFailureFinalization(store);
  try {
    advance(120001); assert.equal(await service.recover(), 1);
    await finalization.entered;
    assert.equal((await service.retry(job.jobId)).status, 'retrying');
    // 默认 queueMicrotask 调度已运行一次，但旧 run 尚未退出，不能吞掉待重试信号。
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mock.calls.length, 1);
    if (cancel) assert.equal((await (other ?? service).cancel(job.jobId)).status, 'cancelled');
    finalization.release(); deferred.release();
    await service.idle();
    if (cancel) {
      assert.equal((await service.get(job.jobId)).status, 'cancelled');
      assert.equal(mock.calls.length, 1);
      assert.equal(store.aiRepository.list('aiJobAttempt').length, 1);
      assert.equal(store.state.knowledgeItems.length, 0);
    } else {
      assertAcceptedSecondAttempt({ store, mock, jobId: job.jobId });
      assert.equal((await service.get(job.jobId)).status, 'succeeded');
    }
  } finally { finalization.release(); deferred.release(); finalization.restore(); }
}

function assertAcceptedSecondAttempt({ store, mock, jobId }) {
  const attempts = store.aiRepository.list('aiJobAttempt', { jobId });
  assert.deepEqual(attempts.map(attempt => [attempt.ordinal, attempt.leaseGeneration, attempt.status]), [[1, 1, 'timedOut'], [2, 2, 'validated']]);
  assert.equal(store.aiRepository.get('aiJob', jobId).acceptedAttemptId, attempts[1].attemptId);
  assert.equal(mock.calls.length, 2);
  assert.equal(store.state.knowledgeItems.length, 1); assert.equal(store.state.knowledgeEvidence.length, 1);
}

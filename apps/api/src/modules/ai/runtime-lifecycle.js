import { createAiRecoveryScope } from './recovery-scope.js';

const owners = new WeakMap();

/** 启动恢复属于持库宿主；HTTP 关闭仅停网络，宿主须在关库前等待此 owner。 */
export function aiRuntimeLifecycle(runtime) {
  if (runtime && owners.has(runtime)) return owners.get(runtime);
  const scope = createAiRecoveryScope();
  const stages = {
    conversation: () => runtime?.conversationStore?.recoverInterrupted?.(),
    agent: () => runtime?.agent?.recover?.(),
    worker: () => runtime?.worker?.recover?.()
  };
  const owner = {
    recover(names = ['conversation', 'agent', 'worker']) {
      return scope.run(async () => {
        for (const name of names) {
          if (scope.closed) return;
          await stages[name]();
        }
      });
    },
    close: () => scope.close(async () => {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => runtime?.agent?.close?.()),
        Promise.resolve().then(() => runtime?.worker?.close?.())
      ]);
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'AI 执行器关闭失败。');
    })
  };
  if (runtime) owners.set(runtime, owner);
  return owner;
}

/** 网络同步、绑定切换及权威命令共用串行 owner；不把网络包进 SQLite 事务。 */
export function createSyncExecutionGate() {
  let tail = Promise.resolve();
  return {
    run(operation) {
      const running = tail.then(operation);
      tail = running.catch(() => undefined);
      return running;
    },
    drain: () => tail
  };
}

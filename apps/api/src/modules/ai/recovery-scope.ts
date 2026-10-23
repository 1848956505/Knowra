export interface AiRecoveryScope {
  readonly closed: boolean;
  run<T>(operation: () => T): Promise<Awaited<T>>;
  close(stop?: () => unknown): Promise<void>;
}

const unavailable = () => Object.assign(new Error('AI 功能已关闭。'), { code: 'AI_GENERATION_UNAVAILABLE' });

/** 关闭只等待已接纳的恢复；不持维护门，也不让失败恢复提前结束排空。 */
export function createAiRecoveryScope(): AiRecoveryScope {
  const pending = new Set<Promise<unknown>>();
  let closed = false,
    closing: Promise<void> | undefined;
  return {
    get closed() {
      return closed;
    },
    run<T>(operation: () => T): Promise<Awaited<T>> {
      if (closed) return Promise.reject(unavailable());
      const promise = Promise.resolve().then(() => {
        if (closed) throw unavailable();
        return operation();
      });
      pending.add(promise);
      const done = () => pending.delete(promise);
      promise.then(done, done);
      // 原生 Promise 会吸收 operation 返回的 Promise 或 thenable。
      return promise as Promise<Awaited<T>>;
    },
    close(stop: () => unknown = () => {}): Promise<void> {
      if (closing) return closing;
      closed = true;
      const stopping = Promise.resolve().then(stop);
      closing = Promise.allSettled([...pending, stopping]).then(results => {
        // stopping 始终追加在快照末尾，因此结果数组不为空。
        const stopped = results.at(-1)!;
        if (stopped.status === 'rejected') throw stopped.reason;
      });
      return closing;
    }
  };
}

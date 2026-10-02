const unavailable = () => Object.assign(new Error('AI 功能已关闭。'), { code: 'AI_GENERATION_UNAVAILABLE' });

/** 关闭只等待已接纳的恢复；不持维护门，也不让失败恢复提前结束排空。 */
export function createAiRecoveryScope() {
  const pending = new Set();
  let closed = false, closing;
  return {
    get closed() { return closed; },
    run(operation) {
      if (closed) return Promise.reject(unavailable());
      const promise = Promise.resolve().then(() => {
        if (closed) throw unavailable();
        return operation();
      });
      pending.add(promise);
      const done = () => pending.delete(promise);
      promise.then(done, done);
      return promise;
    },
    close(stop = () => {}) {
      if (closing) return closing;
      closed = true;
      const stopping = Promise.resolve().then(stop);
      closing = Promise.allSettled([...pending, stopping]).then(results => {
        const stopped = results.at(-1);
        if (stopped.status === 'rejected') throw stopped.reason;
      });
      return closing;
    }
  };
}

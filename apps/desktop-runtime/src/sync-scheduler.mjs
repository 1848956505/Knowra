/** 所有自动入口共享一个定时器；实际运行期间的请求合并为下一轮。 */
export function createSyncScheduler({ run, policy, autoSync = true, intervalMs = 15000,
  clock = { now: () => Date.now(), setTimeout, clearTimeout } }) {
  let timer = null;
  let dueAt = 0;
  let running = null;
  let closed = false;
  let followUp = false;
  let idleRounds = 0;
  let firstLocalAt = null;
  let lastWakeAt = -Infinity;
  let onlineProbeUsed = false;

  function cancel() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null; dueAt = 0;
  }
  function schedule(delay, { replace = false, probe = false } = {}) {
    if (!autoSync || closed || policy().stopped) return;
    const due = Math.max(clock.now() + delay, probe ? 0 : policy().retryAt);
    if (!replace && timer !== null && dueAt <= due) return;
    cancel(); dueAt = due;
    timer = clock.setTimeout(() => { timer = null; firstLocalAt = null; void sync(); }, Math.max(0, due - clock.now()));
    timer?.unref?.();
  }
  function sync() {
    if (closed) return Promise.resolve();
    if (running) { followUp = true; return running; }
    cancel(); firstLocalAt = null;
    running = Promise.resolve().then(run).finally(() => {
      running = null;
      if (closed || policy().stopped) { followUp = false; return; }
      const { retryAt, changed, more } = policy();
      if (!retryAt) onlineProbeUsed = false;
      idleRounds = changed || retryAt ? 0 : idleRounds + 1;
      const delay = followUp || more ? 500 : intervalMs * 2 ** Math.min(Math.max(0, idleRounds - 1), 2);
      followUp = false;
      schedule(delay);
    });
    return running;
  }
  function wake(reason = 'local') {
    if (!autoSync || closed || policy().stopped) return;
    const now = clock.now();
    if (reason === 'local') {
      if (running) { followUp = true; return; }
      firstLocalAt ??= now;
      schedule(Math.min(500, Math.max(0, firstLocalAt + 2000 - now)), { replace: true });
      return;
    }
    if (now - lastWakeAt < 1000) return;
    lastWakeAt = now;
    if (running) { followUp = true; return; }
    const probe = reason === 'online' && !onlineProbeUsed && policy().retryAt > now;
    if (probe) onlineProbeUsed = true;
    schedule(0, { probe });
  }
  return {
    sync, wake, wait: () => running,
    start: () => schedule(0),
    pause() { cancel(); followUp = false; firstLocalAt = null; },
    async close() { closed = true; cancel(); followUp = false; await running; }
  };
}

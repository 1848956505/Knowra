/** 在测试清理和最终报告之前记录失败；日志失败不得替换原始异常。 */
export function withFailureDiagnostics(callback, logError = console.error) {
  return async function (...args) {
    try {
      return await callback.apply(this, args);
    } catch (error) {
      try {
        // 不等待日志，避免异步 logger 阻塞原始失败；同时抑制它自身的拒绝。
        Promise.resolve(logError(error)).catch(() => {});
      } catch {
        // 同步 logger 失败也只丢弃日志，仍抛出下面的原始值。
      }
      throw error;
    }
  };
}

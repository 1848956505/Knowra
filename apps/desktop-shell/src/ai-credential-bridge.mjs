import { randomUUID } from 'node:crypto';

/** 本地服务与主进程之间的私有 IPC；结果只供受信 Gateway 使用。 */
export function createAiCredentialBridge(port, { timeoutMs = 10000 } = {}) {
  const pending = new Map();
  const onMessage = ({ data }) => {
    if (data?.type !== 'ai-credential-response') return;
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    clearTimeout(request.timer);
    if (data.ok) request.resolve(data.value);
    else request.reject(new Error('模型凭据不可用，请重新配置。'));
  };
  port.on('message', onMessage);
  return {
    credentialReference: () => request('reference'),
    resolveCredential: credentialRef => request('resolve', credentialRef),
    close() {
      port.removeListener('message', onMessage);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('模型凭据通道已关闭。')); }
      pending.clear();
    }
  };

  function request(action, credentialRef) {
    if (action === 'resolve' && (typeof credentialRef !== 'string' || credentialRef.length > 128)) {
      return Promise.reject(new Error('模型凭据引用无效。'));
    }
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('读取模型凭据超时。')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try { port.postMessage({ type: 'ai-credential-request', requestId, action, credentialRef }); }
      catch { clearTimeout(timer); pending.delete(requestId); reject(new Error('模型凭据通道不可用。')); }
    });
  }
}

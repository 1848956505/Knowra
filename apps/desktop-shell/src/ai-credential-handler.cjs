const UUID = /^[a-f0-9-]{36}$/i;

/** 仅处理受信 utility process 的消息；绝不向 renderer 发送凭据。 */
function handleAiCredentialRequest(message, { modelSettings, postMessage }) {
  if (message?.type !== 'ai-credential-request') return false;
  if (!UUID.test(message.requestId) || !['reference', 'resolve'].includes(message.action)) return true;
  try {
    const value = message.action === 'reference'
      ? modelSettings.credentialReference()
      : modelSettings.resolveCredential(message.credentialRef);
    postMessage({ type: 'ai-credential-response', requestId: message.requestId, ok: true, value });
  } catch {
    postMessage({ type: 'ai-credential-response', requestId: message.requestId, ok: false, code: 'MODEL_CREDENTIAL_UNAVAILABLE' });
  }
  return true;
}

module.exports = { handleAiCredentialRequest };

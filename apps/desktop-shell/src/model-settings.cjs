const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// 桌面壳独立打包；注册契约测试校验两端、UI 与已核价模型保持一致。
const SUPPORTED_MODEL_IDS = Object.freeze(['deepseek-flash']);
const DEFAULT_MODEL_ID = SUPPORTED_MODEL_IDS[0];
const MODEL_SETTINGS_ERRORS = Object.freeze({
  MODEL_SETTINGS_INVALID: '模型设置格式无效。',
  MODEL_ID_INVALID: '模型 ID 格式无效。',
  MODEL_NOT_SUPPORTED: '当前仅支持 deepseek-flash，请选择受支持的模型后保存。',
  MODEL_KEY_INVALID: 'API Key 格式无效。',
  MODEL_NOT_CONFIGURED: '请先保存 API Key。',
  MODEL_KEY_REJECTED: 'DeepSeek 拒绝了 API Key。',
  MODEL_RATE_LIMITED: 'DeepSeek 请求过于频繁，请稍后重试。',
  MODEL_PROVIDER_UNAVAILABLE: '无法连接 DeepSeek，请检查网络后重试。',
  MODEL_PROVIDER_FAILED: 'DeepSeek 暂时无法完成连接检查。',
  MODEL_RESPONSE_INVALID: 'DeepSeek 返回的模型列表无效。',
  MODEL_NOT_AVAILABLE: '连接成功，但此账号的模型列表中没有该模型 ID。',
  MODEL_CHECK_STALE: '模型配置或连接检查已更新，请重新检查连接。',
  MODEL_CREDENTIAL_STALE: '模型凭据已变更，请重新开始任务。',
  MODEL_SETTINGS_UNAVAILABLE: '模型凭据不可读取，请检查凭据存储。',
  MODEL_SETTINGS_WRITE_FAILED: '模型设置操作失败，请检查凭据存储。',
  MODEL_KEYCHAIN_UNAVAILABLE: '系统钥匙串暂不可用，请解锁后重试。',
  MODEL_KEYCHAIN_DECRYPT_FAILED: '系统钥匙串无法读取该凭据，请重新保存 API Key。'
});
const supported = modelId => SUPPORTED_MODEL_IDS.includes(modelId);
function modelError(code) { return Object.assign(new Error(MODEL_SETTINGS_ERRORS[code]), { code }); }
const requireSupported = modelId => { if (!supported(modelId)) throw modelError('MODEL_NOT_SUPPORTED'); };
function safeModelSettingsMessage(error) {
  return Object.hasOwn(MODEL_SETTINGS_ERRORS, error?.code) ? MODEL_SETTINGS_ERRORS[error.code] : MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_WRITE_FAILED;
}

function createModelSettings({ filePath, safeStorage, fetchImpl = fetch }) {
  let revision = 0;
  let latestCheck = 0;
  function encryptionReady() {
    try { if (safeStorage.isEncryptionAvailable()) return; } catch { /* 不回显系统原始错误。 */ }
    throw modelError('MODEL_KEYCHAIN_UNAVAILABLE');
  }

  function read() {
    let handle;
    try {
      handle = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw modelError('MODEL_SETTINGS_UNAVAILABLE');
      const value = JSON.parse(fs.readFileSync(handle, 'utf8'));
      if (!value || typeof value.modelId !== 'string' || typeof value.secret !== 'string'
        || (value.credentialRef !== undefined && typeof value.credentialRef !== 'string')) throw modelError('MODEL_SETTINGS_UNAVAILABLE');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw modelError('MODEL_SETTINGS_UNAVAILABLE');
    } finally { if (handle !== undefined) { try { fs.closeSync(handle); } catch { /* 无原始错误外泄。 */ } } }
  }

  function write(value) {
    const temp = path.join(path.dirname(filePath), `.ai-provider-${randomUUID()}.tmp`);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, filePath);
    } catch { throw modelError('MODEL_SETTINGS_WRITE_FAILED'); }
    finally { try { fs.rmSync(temp, { force: true }); } catch { /* 无原始错误外泄。 */ } }
  }

  function referencedValue() {
    const value = read();
    // 旧版不受支持的配置保持原样，不自动换模型或重写密钥。
    if (!value || value.credentialRef || !supported(value.modelId)) return value;
    const upgraded = { ...value, credentialRef: randomUUID() };
    write(upgraded);
    return upgraded;
  }

  function status(value = read()) {
    const modelId = value?.modelId ?? DEFAULT_MODEL_ID;
    return { provider: 'deepseek', modelId, configured: Boolean(value),
      supportedModelIds: [...SUPPORTED_MODEL_IDS], modelSupported: supported(modelId) };
  }

  function save(input) {
    revision++;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw modelError('MODEL_SETTINGS_INVALID');
    const previous = read();
    const modelId = typeof input.modelId === 'string' ? input.modelId.trim() : '';
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(modelId)) throw modelError('MODEL_ID_INVALID');
    requireSupported(modelId);
    if ((!previous && !apiKey) || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw modelError('MODEL_KEY_INVALID');
    encryptionReady();
    let secret = previous?.secret;
    if (apiKey) {
      try { secret = safeStorage.encryptString(apiKey).toString('base64'); }
      catch { throw modelError('MODEL_KEYCHAIN_UNAVAILABLE'); }
    }
    const value = { modelId, secret,
      credentialRef: !apiKey && previous?.modelId === modelId ? previous.credentialRef ?? randomUUID() : randomUUID() };
    write(value);
    return status(value);
  }

  function remove() {
    revision++;
    try { fs.rmSync(filePath, { force: true }); }
    catch { throw modelError('MODEL_SETTINGS_WRITE_FAILED'); }
    return status(null);
  }

  async function check() {
    const checkId = ++latestCheck;
    const checkRevision = revision;
    const value = read();
    if (!value) throw modelError('MODEL_NOT_CONFIGURED');
    requireSupported(value.modelId);
    const apiKey = decrypt(value);
    let result, failure;
    try {
      let response;
      try {
        response = await fetchImpl('https://api.deepseek.com/models', {
          method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000)
        });
      } catch { throw modelError('MODEL_PROVIDER_UNAVAILABLE'); }
      if (response?.status === 401 || response?.status === 403) throw modelError('MODEL_KEY_REJECTED');
      if (response?.status === 429) throw modelError('MODEL_RATE_LIMITED');
      if (!response?.ok) throw modelError('MODEL_PROVIDER_FAILED');
      let body;
      try { body = await response.json(); } catch { /* 不读取或回显供应商原始错误。 */ }
      if (!Array.isArray(body?.data)) throw modelError('MODEL_RESPONSE_INVALID');
      if (!body.data.some(item => item?.id === value.modelId)) throw modelError('MODEL_NOT_AVAILABLE');
      result = { connected: true, modelAvailable: true, checkedAt: new Date().toISOString() };
    } catch (error) { failure = error; }
    if (checkId !== latestCheck || checkRevision !== revision) throw modelError('MODEL_CHECK_STALE');
    const current = read();
    if (!current || current.modelId !== value.modelId || current.secret !== value.secret || current.credentialRef !== value.credentialRef) throw modelError('MODEL_CHECK_STALE');
    if (failure) throw failure;
    return { ...status(value), ...result };
  }

  function decrypt(value) {
    encryptionReady();
    try { return safeStorage.decryptString(Buffer.from(value.secret, 'base64')); }
    catch { throw modelError('MODEL_KEYCHAIN_DECRYPT_FAILED'); }
  }

  function credentialReference() {
    const value = referencedValue();
    return value ? { provider: 'deepseek', modelId: value.modelId, credentialRef: value.credentialRef } : null;
  }

  function resolveCredential(reference) {
    const value = referencedValue();
    if (value) requireSupported(value.modelId);
    if (!value || !reference || reference !== value.credentialRef) throw modelError('MODEL_CREDENTIAL_STALE');
    return { apiKey: decrypt(value), modelId: value.modelId };
  }

  return { status, save, remove, check, credentialReference, resolveCredential };
}

module.exports = { createModelSettings, DEFAULT_MODEL_ID, SUPPORTED_MODEL_IDS, MODEL_SETTINGS_ERRORS, safeModelSettingsMessage };

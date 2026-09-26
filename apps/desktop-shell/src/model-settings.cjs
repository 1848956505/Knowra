const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_MODEL_ID = 'deepseek-flash';

function createModelSettings({ filePath, safeStorage, fetchImpl = fetch }) {
  function read() {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('模型凭据不可读取。');
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof value.modelId !== 'string' || typeof value.secret !== 'string'
      || (value.credentialRef !== undefined && typeof value.credentialRef !== 'string')) throw new Error('模型凭据不可读取。');
    return value;
  }

  function write(value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temp = path.join(path.dirname(filePath), `.ai-provider-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, filePath);
    } finally { fs.rmSync(temp, { force: true }); }
  }

  function referencedValue() {
    const value = read();
    if (!value || value.credentialRef) return value;
    const upgraded = { ...value, credentialRef: randomUUID() };
    write(upgraded);
    return upgraded;
  }

  function status(value = read()) {
    return { provider: 'deepseek', modelId: value?.modelId ?? DEFAULT_MODEL_ID, configured: Boolean(value) };
  }

  function save(input) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统钥匙串暂不可用，请解锁后重试。');
    const previous = read();
    const modelId = typeof input?.modelId === 'string' ? input.modelId.trim() : '';
    const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(modelId)) throw new Error('模型 ID 格式无效。');
    if ((!previous && !apiKey) || apiKey.length > 512 || /[\r\n]/.test(apiKey)) throw new Error('API Key 格式无效。');
    const value = { modelId, secret: apiKey ? safeStorage.encryptString(apiKey).toString('base64') : previous.secret,
      credentialRef: !apiKey && previous?.modelId === modelId ? previous.credentialRef ?? randomUUID() : randomUUID() };
    write(value);
    return status(value);
  }

  function remove() {
    fs.rmSync(filePath, { force: true });
    return status(null);
  }

  async function check() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统钥匙串暂不可用，请解锁后重试。');
    const value = read();
    if (!value) throw new Error('请先保存 API Key。');
    const apiKey = decrypt(value);
    let response;
    try {
      response = await fetchImpl('https://api.deepseek.com/models', {
        method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000)
      });
    } catch { throw new Error('无法连接 DeepSeek，请检查网络后重试。'); }
    if (response.status === 401 || response.status === 403) throw new Error('DeepSeek 拒绝了 API Key。');
    if (response.status === 429) throw new Error('DeepSeek 请求过于频繁，请稍后重试。');
    if (!response.ok) throw new Error('DeepSeek 暂时无法完成连接检查。');
    let body;
    try { body = await response.json(); } catch { /* 无模型列表。 */ }
    if (!Array.isArray(body?.data)) throw new Error('DeepSeek 返回的模型列表无效。');
    if (!body.data.some(item => item?.id === value.modelId)) throw new Error('连接成功，但此账号的模型列表中没有该模型 ID。');
    return { ...status(value), connected: true, modelAvailable: true, checkedAt: new Date().toISOString() };
  }

  function decrypt(value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统钥匙串暂不可用，请解锁后重试。');
    try { return safeStorage.decryptString(Buffer.from(value.secret, 'base64')); }
    catch { throw new Error('系统钥匙串无法读取该凭据，请重新保存 API Key。'); }
  }

  function credentialReference() {
    const value = referencedValue();
    return value ? { provider: 'deepseek', modelId: value.modelId, credentialRef: value.credentialRef } : null;
  }

  function resolveCredential(reference) {
    const value = referencedValue();
    if (!value || !reference || reference !== value.credentialRef) throw new Error('模型凭据已变更，请重新开始任务。');
    return { apiKey: decrypt(value), modelId: value.modelId };
  }

  return { status, save, remove, check, credentialReference, resolveCredential };
}

module.exports = { createModelSettings };

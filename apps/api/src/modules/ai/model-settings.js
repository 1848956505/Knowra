import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../../errors/app-error.js';

export const DEFAULT_MODEL_ID = 'deepseek-flash';
const API_BASE = 'https://api.deepseek.com';
const defaultFile = path.join(os.homedir(), '.config', 'knowra', 'ai-provider.json');

export function validateModelSettings(input, { allowEmptyKey = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw createAppError('MODEL_SETTINGS_INVALID', '模型设置格式无效。');
  const modelId = typeof input.modelId === 'string' ? input.modelId.trim() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(modelId)) throw createAppError('MODEL_ID_INVALID', '模型 ID 格式无效。');
  if ((!allowEmptyKey && !apiKey) || apiKey.length > 512 || /[\r\n]/.test(apiKey)) {
    throw createAppError('MODEL_KEY_INVALID', 'API Key 格式无效。');
  }
  return { modelId, apiKey };
}

export async function checkDeepSeekModel({ apiKey, modelId, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}/models`, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw createAppError('MODEL_PROVIDER_UNAVAILABLE', '无法连接 DeepSeek，请检查网络后重试。', 502);
  }
  if (response.status === 401 || response.status === 403) throw createAppError('MODEL_KEY_REJECTED', 'DeepSeek 拒绝了 API Key。', 422);
  if (response.status === 429) throw createAppError('MODEL_RATE_LIMITED', 'DeepSeek 请求过于频繁，请稍后重试。', 429);
  if (!response.ok) throw createAppError('MODEL_PROVIDER_UNAVAILABLE', 'DeepSeek 暂时无法完成连接检查。', 502);
  let body;
  try { body = await response.json(); } catch { /* 供应商响应不含可用模型列表。 */ }
  if (!Array.isArray(body?.data)) throw createAppError('MODEL_RESPONSE_INVALID', 'DeepSeek 返回的模型列表无效。', 502);
  const available = body.data.some(item => item?.id === modelId);
  if (!available) throw createAppError('MODEL_NOT_AVAILABLE', '连接成功，但此账号的模型列表中没有该模型 ID。', 422);
  return { connected: true, modelAvailable: true, checkedAt: new Date().toISOString() };
}

export function createModelSettingsService({ filePath = defaultFile, fetchImpl = fetch } = {}) {
  async function read() {
    let handle;
    try {
      handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
        throw new Error('Insecure model credential file');
      }
      const value = JSON.parse(await handle.readFile('utf8'));
      if (typeof value.apiKey !== 'string' || typeof value.modelId !== 'string'
        || (value.credentialRef !== undefined && typeof value.credentialRef !== 'string')) throw new Error('Invalid model credential file');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw createAppError('MODEL_SETTINGS_UNAVAILABLE', '模型凭据文件不可读取，请检查服务端配置。', 500);
    } finally { await handle?.close(); }
  }

  function publicStatus(value) {
    return { provider: 'deepseek', modelId: value?.modelId ?? DEFAULT_MODEL_ID, configured: Boolean(value) };
  }

  async function write(value) {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temp = path.join(directory, `.ai-provider-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, filePath);
    } finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  }

  async function referencedValue() {
    const value = await read();
    if (!value) return null;
    if (value.credentialRef) return value;
    const upgraded = { ...value, credentialRef: randomUUID() };
    await write(upgraded);
    return upgraded;
  }

  return {
    async status() { return publicStatus(await read()); },
    async save(input) {
      const previous = await read();
      const { modelId, apiKey } = validateModelSettings(input, { allowEmptyKey: Boolean(previous) });
      await write({ modelId, apiKey: apiKey || previous.apiKey,
        credentialRef: !apiKey && previous?.modelId === modelId ? previous.credentialRef ?? randomUUID() : randomUUID() });
      return publicStatus({ modelId });
    },
    async remove() {
      await fs.rm(filePath, { force: true });
      return publicStatus(null);
    },
    async check() {
      const value = await read();
      if (!value) throw createAppError('MODEL_NOT_CONFIGURED', '请先保存 API Key。', 409);
      return { ...publicStatus(value), ...(await checkDeepSeekModel({ ...value, fetchImpl })) };
    },
    async credentialReference() {
      const value = await referencedValue();
      return value ? { provider: 'deepseek', modelId: value.modelId, credentialRef: value.credentialRef } : null;
    },
    async resolveCredential(reference) {
      const value = await referencedValue();
      if (!value || !reference || reference !== value.credentialRef) {
        throw createAppError('MODEL_CREDENTIAL_STALE', '模型凭据已变更，请重新开始任务。', 409);
      }
      return { apiKey: value.apiKey, modelId: value.modelId };
    }
  };
}

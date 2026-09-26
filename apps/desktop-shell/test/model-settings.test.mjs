import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createModelSettings } from '../src/model-settings.cjs';

test('Mac 模型设置加密落盘、重启回读状态、检查模型列表且不返回密钥', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-mac-ai-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'ai-provider.json');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(`sealed:${text}`),
    decryptString: data => data.toString().replace(/^sealed:/, '')
  };
  const calls = [];
  const options = { filePath, safeStorage, fetchImpl: async (url, request) => {
    calls.push({ url, request });
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-flash' }] }) };
  } };
  const first = createModelSettings(options);
  assert.equal(first.status().configured, false);
  assert.equal(first.save({ modelId: 'deepseek-flash', apiKey: 'test-secret' }).configured, true);
  assert.equal(fs.readFileSync(filePath, 'utf8').includes('test-secret'), false);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  const reopened = createModelSettings(options);
  assert.equal(reopened.status().modelId, 'deepseek-flash');
  const reference = reopened.credentialReference();
  assert.equal(reopened.resolveCredential(reference.credentialRef).apiKey, 'test-secret');
  assert.equal(JSON.stringify(reopened.status()).includes(reference.credentialRef), false);
  reopened.save({ modelId: 'deepseek-flash', apiKey: '' });
  assert.equal(reopened.credentialReference().credentialRef, reference.credentialRef);
  reopened.save({ modelId: 'deepseek-flash', apiKey: 'rotated-secret' });
  assert.notEqual(reopened.credentialReference().credentialRef, reference.credentialRef);
  assert.throws(() => reopened.resolveCredential(reference.credentialRef), /模型凭据已变更/);
  assert.equal((await reopened.check()).modelAvailable, true);
  assert.equal(calls[0].url, 'https://api.deepseek.com/models');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer rotated-secret');
  assert.equal(calls[0].request.redirect, 'error');
  assert.equal(reopened.remove().configured, false);
});

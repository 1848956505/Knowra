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

const supportedResponse = () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-flash' }] }) });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture(t, fetchImpl = async () => { throw new Error('不应联网'); }, storage = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-mac-model-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'provider.json');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`sealed:${value}`),
    decryptString: value => value.toString().replace(/^sealed:/, ''),
    ...storage
  };
  return { filePath, directory, safeStorage, service: createModelSettings({ filePath, safeStorage, fetchImpl }) };
}

test('Mac 仅接受支持模型，旧模型保留只读状态，显式切换保留加密密钥', async t => {
  const { service, filePath, safeStorage } = fixture(t);
  for (const input of [null, [], 'bad']) assert.throws(() => service.save(input), error => error.code === 'MODEL_SETTINGS_INVALID');
  for (const modelId of ['deepseek-chat', 'deepseek-reasoner', 'unknown-model']) {
    assert.throws(() => service.save({ modelId, apiKey: 'synthetic-secret' }), error => error.code === 'MODEL_NOT_SUPPORTED');
  }
  assert.throws(() => service.save({ modelId: '../unsafe', apiKey: 'synthetic-secret' }), error => error.code === 'MODEL_ID_INVALID');
  for (const apiKey of ['', 'key\nheader', 'key\rheader', 'x'.repeat(513), 12]) {
    assert.throws(() => service.save({ modelId: 'deepseek-flash', apiKey }), error => error.code === 'MODEL_KEY_INVALID');
  }
  assert.equal(fs.existsSync(filePath), false);
  const legacy = JSON.stringify({ modelId: 'deepseek-chat', secret: safeStorage.encryptString('legacy-synthetic-secret').toString('base64') });
  fs.writeFileSync(filePath, legacy, { mode: 0o600 });
  assert.deepEqual(service.status(), { provider: 'deepseek', modelId: 'deepseek-chat', configured: true, modelSupported: false, supportedModelIds: ['deepseek-flash'] });
  assert.equal(service.credentialReference().modelId, 'deepseek-chat');
  await assert.rejects(service.check(), error => error.code === 'MODEL_NOT_SUPPORTED');
  assert.throws(() => service.resolveCredential('old-ref'), error => error.code === 'MODEL_NOT_SUPPORTED');
  assert.throws(() => service.save({ modelId: 'deepseek-chat', apiKey: '' }), error => error.code === 'MODEL_NOT_SUPPORTED');
  assert.equal(fs.readFileSync(filePath, 'utf8'), legacy);
  const saved = service.save({ modelId: '\u3000deepseek-flash\u00a0', apiKey: '\u3000 ' });
  assert.equal(saved.modelSupported, true);
  const reference = service.credentialReference();
  assert.equal(service.resolveCredential(reference.credentialRef).apiKey, 'legacy-synthetic-secret');
  assert.equal(JSON.stringify(saved).includes('legacy-synthetic-secret'), false);
  assert.equal(fs.readFileSync(filePath, 'utf8').includes('legacy-synthetic-secret'), false);
  assert.equal(JSON.parse(fs.readFileSync(filePath)).secret, JSON.parse(legacy).secret);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test('Mac 供应商错误与 IPC 消息使用固定白名单，原始错误永不回显', async t => {
  const { MODEL_SETTINGS_ERRORS, safeModelSettingsMessage } = await import('../src/model-settings.cjs');
  for (const message of ['DeepSeek synthetic-secret', '连接成功 synthetic-secret', '系统钥匙串 synthetic-secret', '无法连接 synthetic-secret', '请先保存 synthetic-secret']) {
    assert.equal(safeModelSettingsMessage(new Error(message)), MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_WRITE_FAILED);
  }
  assert.equal(safeModelSettingsMessage({ code: 'MODEL_KEY_REJECTED', message: 'synthetic-secret' }), MODEL_SETTINGS_ERRORS.MODEL_KEY_REJECTED);
  assert.equal(safeModelSettingsMessage({ code: 'toString' }), MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_WRITE_FAILED);
  const scenarios = [
    { response: { status: 401 }, code: 'MODEL_KEY_REJECTED' },
    { response: { status: 403 }, code: 'MODEL_KEY_REJECTED' },
    { response: { status: 429 }, code: 'MODEL_RATE_LIMITED' },
    { response: { status: 500 }, code: 'MODEL_PROVIDER_FAILED' },
    { response: { ok: true, json: async () => { throw new Error('synthetic-secret'); } }, code: 'MODEL_RESPONSE_INVALID' },
    { response: { ok: true, json: async () => ({ data: 'synthetic-secret' }) }, code: 'MODEL_RESPONSE_INVALID' },
    { response: { ok: true, json: async () => ({ data: [{ id: 'deepseek-chat', raw: 'synthetic-secret' }] }) }, code: 'MODEL_NOT_AVAILABLE' },
    { failure: new Error('DeepSeek synthetic-secret'), code: 'MODEL_PROVIDER_UNAVAILABLE' }
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const { service } = fixture(t, async (url, request) => {
      calls++;
      assert.equal(url, 'https://api.deepseek.com/models');
      assert.equal(request.method, 'GET');
      assert.equal(request.redirect, 'error');
      assert.equal(request.body, undefined);
      if (scenario.failure) throw scenario.failure;
      return scenario.response;
    });
    service.save({ modelId: 'deepseek-flash', apiKey: 'synthetic-secret' });
    await assert.rejects(service.check(), error => {
      assert.equal(error.code, scenario.code);
      assert.equal(error.message, MODEL_SETTINGS_ERRORS[scenario.code]);
      assert.equal(safeModelSettingsMessage(error).includes('synthetic-secret'), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('Mac 保存、删除与重复检查让旧的检查结果失效', async t => {
  for (const action of ['save', 'remove', 'check']) {
    const response = deferred();
    let calls = 0;
    const { service } = fixture(t, async () => ++calls === 1 ? response.promise : supportedResponse());
    service.save({ modelId: 'deepseek-flash', apiKey: 'old-synthetic-secret' });
    const checking = service.check();
    const assertion = assert.rejects(checking, error => error.code === 'MODEL_CHECK_STALE');
    if (action === 'save') service.save({ modelId: 'deepseek-flash', apiKey: 'new-synthetic-secret' });
    else if (action === 'remove') service.remove();
    else assert.equal((await service.check()).modelAvailable, true);
    response.resolve(supportedResponse());
    await assertion;
    assert.equal(service.status().configured, action !== 'remove');
  }
});

test('Mac 钥匙串锁定、解密和落盘失败不泄露凭据、不破坏原文件', async t => {
  const { MODEL_SETTINGS_ERRORS } = await import('../src/model-settings.cjs');
  const { service, safeStorage, filePath, directory } = fixture(t);
  service.save({ modelId: 'deepseek-flash', apiKey: 'synthetic-secret' });
  const before = fs.readFileSync(filePath, 'utf8');
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    fs.chmodSync(directory, 0o500);
    try {
      assert.throws(() => service.save({ modelId: 'deepseek-flash', apiKey: 'replacement-synthetic-secret' }), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_WRITE_FAILED);
      assert.throws(() => service.remove(), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_WRITE_FAILED);
      assert.equal(fs.readFileSync(filePath, 'utf8'), before);
    } finally { fs.chmodSync(directory, 0o700); }
  }
  safeStorage.isEncryptionAvailable = () => false;
  assert.throws(() => service.save({ modelId: 'deepseek-flash', apiKey: 'new-synthetic-secret' }), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_KEYCHAIN_UNAVAILABLE);
  await assert.rejects(service.check(), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_KEYCHAIN_UNAVAILABLE);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  safeStorage.isEncryptionAvailable = () => true;
  safeStorage.encryptString = () => { throw new Error('系统钥匙串 synthetic-secret'); };
  assert.throws(() => service.save({ modelId: 'deepseek-flash', apiKey: 'new-synthetic-secret' }), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_KEYCHAIN_UNAVAILABLE);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  safeStorage.decryptString = () => { throw new Error('DeepSeek synthetic-secret'); };
  await assert.rejects(service.check(), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_KEYCHAIN_DECRYPT_FAILED);
  fs.chmodSync(filePath, 0o644);
  assert.throws(() => service.status(), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_UNAVAILABLE);
  fs.chmodSync(filePath, 0o600);
  const link = path.join(directory, 'link.json');
  fs.symlinkSync(filePath, link);
  assert.throws(() => createModelSettings({ filePath: link, safeStorage }).status(), error => error.code === 'MODEL_SETTINGS_UNAVAILABLE');
  fs.writeFileSync(filePath, '{"secret":"synthetic-secret" invalid');
  assert.throws(() => service.status(), error => error.message === MODEL_SETTINGS_ERRORS.MODEL_SETTINGS_UNAVAILABLE);
  assert.equal(service.remove().configured, false, '明确删除不要求解锁钥匙串');
});

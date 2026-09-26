import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { createModelSettingsService } from '../src/modules/ai/model-settings.js';

export const modelSettingsTests = [{
  name: '模型设置：密钥仅写服务端受限文件，响应不回显；连接检查只读取模型列表',
  async run() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ai-settings-'));
    const filePath = path.join(directory, 'secrets', 'provider.json');
    const calls = [];
    const service = createModelSettingsService({ filePath, fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-flash' }] }) };
    } });
    const server = createServer({ appContext: { http: { modelSettings: service, knowledge: {}, storage: {} } }, logger: { error() {} } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (method, suffix = '', body, headers = {}) => fetch(`${base}/api/ai/model-settings${suffix}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    try {
      assert.equal((await (await request('GET')).json()).data.configured, false);
      const input = { modelId: 'deepseek-flash', apiKey: 'test-secret-never-echo' };
      assert.equal((await request('PUT', '', input)).status, 403);
      const saved = await request('PUT', '', input, { 'X-Knowra-Model-Settings': '1' });
      assert.equal(saved.status, 200);
      assert.equal((await saved.text()).includes(input.apiKey), false);
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
      assert.equal((await (await request('GET')).text()).includes(input.apiKey), false);
      const firstReference = await service.credentialReference();
      assert.equal(firstReference.modelId, 'deepseek-flash');
      assert.equal((await service.resolveCredential(firstReference.credentialRef)).apiKey, input.apiKey);
      assert.equal((await (await request('GET')).text()).includes(firstReference.credentialRef), false);
      await service.save({ modelId: 'deepseek-flash', apiKey: '' });
      assert.equal((await service.credentialReference()).credentialRef, firstReference.credentialRef);
      await service.save({ modelId: 'deepseek-flash', apiKey: 'replacement-synthetic-secret' });
      assert.notEqual((await service.credentialReference()).credentialRef, firstReference.credentialRef);
      await assert.rejects(service.resolveCredential(firstReference.credentialRef), error => error.code === 'MODEL_CREDENTIAL_STALE');
      const checked = await request('POST', '/check', undefined, { 'X-Knowra-Model-Settings': '1' });
      assert.equal((await checked.json()).data.modelAvailable, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.deepseek.com/models');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer replacement-synthetic-secret');
      assert.equal(calls[0].options.redirect, 'error');
      assert.equal((await request('DELETE', '', undefined, { 'X-Knowra-Model-Settings': '1' })).status, 200);
      assert.equal(fs.existsSync(filePath), false);
    } finally {
      server.close();
      await once(server, 'close');
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}];

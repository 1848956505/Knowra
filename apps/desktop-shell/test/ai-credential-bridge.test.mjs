import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAiCredentialBridge } from '../src/ai-credential-bridge.mjs';

const require = createRequire(import.meta.url);
const { handleAiCredentialRequest } = require('../src/ai-credential-handler.cjs');
const { createModelSettings } = require('../src/model-settings.cjs');

test('Mac utility process 仅用内部引用读取凭据，轮换后旧引用失效', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ai-bridge-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settings = createModelSettings({ filePath: path.join(directory, 'model.json'), safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`sealed:${value}`),
    decryptString: value => value.toString().replace(/^sealed:/, '')
  } });
  settings.save({ modelId: 'deepseek-flash', apiKey: 'synthetic-secret' });
  const port = new EventEmitter();
  port.postMessage = message => {
    handleAiCredentialRequest(message, { modelSettings: settings, postMessage: reply => port.emit('message', { data: reply }) });
  };
  const bridge = createAiCredentialBridge(port);
  t.after(() => bridge.close());
  const reference = await bridge.credentialReference();
  assert.equal(reference.modelId, 'deepseek-flash');
  assert.equal(JSON.stringify(reference).includes('synthetic-secret'), false);
  assert.equal((await bridge.resolveCredential(reference.credentialRef)).apiKey, 'synthetic-secret');
  settings.save({ modelId: 'deepseek-flash', apiKey: 'rotated-secret' });
  await assert.rejects(bridge.resolveCredential(reference.credentialRef), /模型凭据不可用/);
  assert.equal(handleAiCredentialRequest({ type: 'other' }, { modelSettings: settings, postMessage() {} }), false);
});

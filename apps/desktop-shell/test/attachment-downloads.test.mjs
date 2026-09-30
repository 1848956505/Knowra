import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import downloadsModule from '../src/attachment-downloads.cjs';

test('附件 IPC 使用 APP 会话、资料集与固定路径，保存后仅凭令牌打开', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-attachment-ipc-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, '保存.txt');
  fs.mkdirSync(path.join(directory, 'offline'));
  let requested; let opened; let save = destination;
  const webContents = { mainFrame: {}, executeJavaScript: async () => 'dataset-test', session: { fetch: async (url, options) => {
    requested = { url, options };
    return new Response('original', { headers: { 'content-disposition': "attachment; filename*=UTF-8''%E5%8E%9F%E6%96%87%E4%BB%B6.txt" } });
  } } };
  const manager = downloadsModule.createAttachmentDownloads({ getWindow: () => ({ webContents }), getOrigin: () => 'http://127.0.0.1:1245', dataDirectory: path.join(directory, 'offline'),
    dialog: { showSaveDialog: async (_window, options) => { assert.equal(options.defaultPath, '原文件.txt'); return { filePath: save, canceled: !save }; } },
    shell: { openPath: async file => { opened = file; return ''; } } });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  await assert.rejects(() => manager.download({ ...event, senderFrame: {} }, 'attachment-1'), /无效/);
  await assert.rejects(() => manager.download(event, '../../file'), /ID/);
  const token = await manager.download(event, 'attachment-1');
  assert.equal(requested.url, 'http://127.0.0.1:1245/api/storage/attachments/attachment-1/content');
  assert.equal(requested.options.credentials, 'include'); assert.equal(requested.options.redirect, 'error');
  assert.equal(requested.options.headers['X-Knowra-Dataset'], 'dataset-test');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'original');
  await assert.rejects(() => manager.open(event, destination), /不可用/);
  await manager.open(event, token); assert.equal(opened, destination);
  save = path.join(directory, 'offline/local.sqlite');
  await assert.rejects(() => manager.download(event, 'attachment-1'), /资料目录/);
  fs.symlinkSync(path.join(directory, 'offline'), path.join(directory, '资料别名'));
  save = path.join(directory, '资料别名/local.sqlite');
  await assert.rejects(() => manager.download(event, 'attachment-1'), /资料目录/);
  save = null; assert.equal(await manager.download(event, 'attachment-1'), null);
});

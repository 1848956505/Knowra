import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

const [root, phase] = process.argv.slice(2);
const dataDirectory = path.join(root, 'data');
const distRoot = path.join(root, 'dist');
fs.mkdirSync(distRoot);
fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><body>合成恢复验收</body></html>');
const runtime = await startLocalRuntime({ dataDirectory, distRoot, syncOptions: { autoSync: false } });
const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
const datasetId = runtime.store.getStatus().datasetId;
async function request(route, method = 'GET', body) {
  const response = await fetch(`${runtime.origin}${route}`, { method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': datasetId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  assert(response.ok, JSON.stringify(result));
  return result.data;
}
const space = await request('/api/knowledge/spaces/default', 'POST', {});
const note = await request('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '合成强杀恢复', rawMarkdown: '备份正文' });
const attachment = await request('/api/storage/attachments', 'POST', {
  noteId: note.id, fileName: 'synthetic.txt', contentBase64: Buffer.from('synthetic attachment').toString('base64') });
const key = `knowra:note-draft:v1:${JSON.stringify([datasetId, note.id])}`;
const drafts = markdown => ({ version: 1, drafts: { [key]: { markdown, baseMarkdown: '备份正文' } } });
const backup = await request('/api/local-runtime/backup', 'POST', { recoveryDrafts: drafts('来源草稿') });
const backupQueue = runtime.store.readOutbox();
await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '恢复前正文', expectedUpdatedAt: note.updatedAt });
const currentDrafts = drafts('恢复前草稿');
fs.writeFileSync(path.join(dataDirectory, 'recovery-drafts.json'), JSON.stringify(currentDrafts));
const summary = { phase, datasetId, noteId: note.id, attachmentId: attachment.id, backupId: backup.id,
  backupQueue, currentQueue: runtime.store.readOutbox(), currentDrafts };
function freeze(boundary) {
  fs.writeFileSync(path.join(root, 'boundary.json'), JSON.stringify({ ...summary, boundary }));
  fs.writeSync(1, 'boundary-ready\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
if (phase === 'during-copy') {
  const copy = fs.copyFileSync;
  fs.copyFileSync = (source, target, ...args) => {
    const result = copy(source, target, ...args);
    if (String(target).startsWith(path.join(dataDirectory, 'restored') + path.sep)
      && String(target).includes('.restore-')) freeze('first-staging-file-copied');
    return result;
  };
} else {
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (String(target) !== path.join(dataDirectory, 'active-dataset.json')) return rename(source, target);
    if (phase === 'before-pointer') freeze('complete-dataset-before-pointer');
    const result = rename(source, target);
    freeze('pointer-published-before-response');
    return result;
  };
}
await request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id });
throw new Error('未命中强杀验收边界');

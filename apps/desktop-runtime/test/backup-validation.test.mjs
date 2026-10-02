import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createRuntimeBackup, inspectRuntimeBackup } from '../src/backup.mjs';
import { temporaryDirectory, openWorkspace, createNote } from './helpers.mjs';

function fixture(t) {
  const root = temporaryDirectory(t);
  const workspace = openWorkspace(path.join(root, 'data'));
  t.after(() => workspace.store.close());
  const note = createNote(workspace);
  const key = `knowra:note-draft:v1:${JSON.stringify([workspace.space.id, note.id])}`;
  const record = { version: 1, drafts: { [key]: { markdown: '旧格式草稿正文', baseMarkdown: '旧基线' } } };
  const directory = createRuntimeBackup(workspace.store, path.join(root, 'data'), { recoveryDrafts: record });
  return { directory, record, key };
}

function resign(directory, name, bytes) {
  fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
  fs.writeFileSync(path.join(directory, name), bytes);
  const manifestFile = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const item = { path: name, size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  const index = manifest.files.findIndex(item => item.path === name);
  if (index < 0) manifest.files.push(item); else manifest.files[index] = item;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
}

test('完整性检查逐项核对清单大小，不能只信哈希', t => {
  const { directory } = fixture(t);
  assert.equal(inspectRuntimeBackup(directory).draftCount, 1);
  const manifestFile = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.files[0].size += 1;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => inspectRuntimeBackup(directory), /完整性/);
});

test('普通旧草稿仍可检查，但重新签名的非法正文和归档不能通过完整性检查', t => {
  const { directory, record, key } = fixture(t);
  assert.equal(inspectRuntimeBackup(directory).draftCount, 1);
  resign(directory, 'recovery-drafts.json', JSON.stringify({ version: 1, drafts: { [key]: { markdown: 42, baseMarkdown: '' } } }));
  assert.throws(() => inspectRuntimeBackup(directory), /草稿/);
  resign(directory, 'recovery-drafts.json', JSON.stringify(record));
  const invalid = JSON.stringify({ version: 1, drafts: { '../../outside': { markdown: '坏键', baseMarkdown: '' } } });
  const id = createHash('sha256').update(invalid).digest('hex');
  resign(directory, `recovery-draft-archives/${id}.json`, invalid);
  assert.throws(() => inspectRuntimeBackup(directory), /草稿/);
});

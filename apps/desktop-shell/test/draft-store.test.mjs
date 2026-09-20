import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDraftStore } from '../src/draft-store.cjs';

test('恢复草稿原子落盘、重建实例可回读；失败不破坏旧文件', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-drafts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = 'knowra:note-draft:v1:["space","note"]';
  const draft = { markdown: '未保存的中文', baseMarkdown: '原文', baseUpdatedAt: 'v1' };
  createDraftStore(dir).write(key, draft);
  assert.deepEqual(createDraftStore(dir).read()[key], draft);
  assert.throws(() => createDraftStore(dir).write('../file', draft));
  assert.deepEqual(createDraftStore(dir).read()[key], draft);
  createDraftStore(dir).write(key, null);
  assert.deepEqual(createDraftStore(dir).read(), {});
  fs.writeFileSync(path.join(dir, 'recovery-drafts.json'), 'broken');
  assert.throws(() => createDraftStore(dir).write(key, draft));
  assert.equal(fs.readFileSync(path.join(dir, 'recovery-drafts.json'), 'utf8'), 'broken');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createAppContext } from '../../api/src/app.factory.js';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { createServer } from '../../api/src/server.js';
import { temporaryDirectory } from './helpers.mjs';
import { projectMarkdown, anchorForSection, anchorForBlock, sourceEdit, calculateContentHash } from '../../../packages/content-anchor/src/index.js';

for (const driver of ['sqlite', 'json']) test(`${driver}：空章节与旧标注不阻止正文保存，重启后正文和标注状态一致`, async t => {
  const root = temporaryDirectory(t);
  const file = path.join(root, driver === 'sqlite' ? 'local.sqlite' : 'data.json');
  const open = () => driver === 'sqlite' ? createSqliteDataStore(file) : createFileDataStore(file);
  let store = open();
  t.after(() => store.close?.());
  const ctx = createAppContext({ dataStore: store, uploadsDir: path.join(root, 'uploads'), storageRootDir: root });
  const k = ctx.modules.knowledge;
  const space = k.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const raw = '# 标题\n正文\n\n# 下一节\n结束';
  const note = k.noteService.createNote({ spaceId: space.id, title: '回归', rawMarkdown: raw });
  const anchor = anchorForSection(projectMarkdown(raw), 0);
  const section = k.contentAnnotationService.createAnnotation({ spaceId: space.id, noteId: note.id, schemaVersion: 2, scopeType: 'section', quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchor, anchorFingerprint: 'test', noteContentHash: calculateContentHash(raw), idempotencyKey: 'section' });
  // 真实旧数据没有 schemaVersion/revision/lifecycleStatus 等新增字段。
  store.state.contentAnnotations.push({ id: 'legacy', spaceId: space.id, noteId: note.id, quoteText: '正文', fromPosition: 5, toPosition: 7, kind: 'important', sourceMode: 'manual', status: 'active', anchorFingerprint: 'legacy', noteContentHash: calculateContentHash(raw), idempotencyKey: 'legacy' });
  store.flush();
  const server = createServer({ appContext: ctx });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const next = '# \n\n# 下一节\n结束';
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/knowledge/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawMarkdown: next, expectedUpdatedAt: note.updatedAt }) });
  assert.equal(response.status, 200, await response.text());
  assert.equal(k.contentAnnotationService.getAnnotation(section.id).anchorStatus, 'missing');
  assert.equal(k.contentAnnotationService.getAnnotation('legacy').revision, 2);
  store.close?.(); store = open();
  assert.equal(store.state.notes.find(item => item.id === note.id).rawMarkdown, next);
  assert.equal(store.state.contentAnnotations.find(item => item.id === section.id).anchorStatus, 'missing');
  assert.equal(store.state.contentAnnotations.find(item => item.id === 'legacy').anchorStatus, 'needsReview');
});

for (const driver of ['sqlite', 'json']) test(`${driver}：动态章节定位数据与修订随正文原子保存，重启后继续跟随`, async t => {
  const root=temporaryDirectory(t);const file=path.join(root,driver==='sqlite'?'dynamic.sqlite':'dynamic.json');
  const open=()=>driver==='sqlite'?createSqliteDataStore(file):createFileDataStore(file);
  let store=open();const create=()=>createAppContext({dataStore:store,storageRootDir:root}).modules.knowledge;
  let k=create();const space=k.knowledgeSpaceService.createDefaultKnowledgeSpace({userId:'demo'});
  let note=k.noteService.createNote({spaceId:space.id,title:'动态重启',rawMarkdown:'# A\n\n原文\n\n# B\n\n尾部'});
  const anchor=anchorForSection(projectMarkdown(note.rawMarkdown),0);
  const annotation=k.contentAnnotationService.createAnnotation({spaceId:space.id,noteId:note.id,schemaVersion:2,scopeType:'section',anchor,quoteText:anchor.quoteText,fromPosition:anchor.sourceStart,toPosition:anchor.sourceEnd,anchorFingerprint:'restart',noteContentHash:calculateContentHash(note.rawMarkdown),idempotencyKey:'restart'});
  note=k.noteService.updateNote(note.id,{rawMarkdown:'前言\n\n'+note.rawMarkdown});
  const identities=note.annotationStructure.nodes.map(node=>node.id);
  assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus,'resolved');
  store.close?.();store=open();k=create();
  assert.deepEqual(k.noteService.getNote(note.id).annotationStructure.nodes.map(node=>node.id),identities);
  note=k.noteService.updateNote(note.id,{rawMarkdown:note.rawMarkdown.replace('原文','补充后的原文')});
  const updated=k.contentAnnotationService.getAnnotation(annotation.id);
  assert.equal(updated.anchorStatus,'resolved');assert.match(updated.quoteText,/补充后的原文/);assert.equal(updated.id,annotation.id);
  store.close?.();
});

for (const driver of ['sqlite', 'json']) test(`${driver}：空块重点通过快照校验并在重启后保留`, async t => {
  const root=temporaryDirectory(t);const file=path.join(root,driver==='sqlite'?'empty.sqlite':'empty.json');
  const open=()=>driver==='sqlite'?createSqliteDataStore(file):createFileDataStore(file);
  let store=open();const create=()=>createAppContext({dataStore:store,storageRootDir:root}).modules.knowledge;
  let k=create();const space=k.knowledgeSpaceService.createDefaultKnowledgeSpace({userId:'demo'});
  const before='重点段落';const after='<br />';
  const note=k.noteService.createNote({spaceId:space.id,title:'空块重启',rawMarkdown:before});
  const anchor=anchorForBlock(projectMarkdown(before),0);
  const annotation=k.contentAnnotationService.createAnnotation({spaceId:space.id,noteId:note.id,schemaVersion:2,scopeType:'blocks',anchor,quoteText:anchor.quoteText,fromPosition:anchor.sourceStart,toPosition:anchor.sourceEnd,anchorFingerprint:'empty',noteContentHash:calculateContentHash(before),idempotencyKey:'empty'});
  k.noteService.updateNote(note.id,{rawMarkdown:after,annotationMapping:{formatVersion:1,operationId:'clear',baseContentHash:calculateContentHash(before),targetContentHash:calculateContentHash(after),edits:[{...sourceEdit(before,after),preserveEmptyBlock:true}]}});
  assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).quoteText,'');
  store.close?.();store=open();k=create();
  const restored=k.contentAnnotationService.getAnnotation(annotation.id);
  assert.equal(restored.anchorStatus,'resolved');assert.equal(restored.anchor.tracking.empty,true);
  store.close?.();
});

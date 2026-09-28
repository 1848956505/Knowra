import assert from 'node:assert/strict';
import { anchorForBlock, anchorForSection, anchorFromProjectedRange, projectMarkdown, calculateContentHash, sourceEdit } from '@study-accelerator/content-anchor';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';
function fixture(scope = 'section') {
  const module = createKnowledgeModule();
  const note = module.noteService.createNote({ id: 'dynamic-note', spaceId: 'space', title: '动态', rawMarkdown: '## A\n\n重要文字\n\n## B\n\n尾段' });
  const projection = projectMarkdown(note.rawMarkdown);
  const anchor = scope === 'section' ? anchorForSection(projection, 0) : scope === 'blocks' ? anchorForBlock(projection, 1) : anchorFromProjectedRange(projection, 2, 6);
  const annotation = module.contentAnnotationService.createAnnotation({noteId: note.id,spaceId:note.spaceId,schemaVersion:2,scopeType:scope,anchor,quoteText:anchor.quoteText,fromPosition:anchor.sourceStart,toPosition:anchor.sourceEnd,anchorFingerprint:'fixture',noteContentHash:calculateContentHash(note.rawMarkdown),idempotencyKey:'create',comment:'保留备注',importance:'core'});
  return {module,note,annotation};
}
function save(module, before, after, extra = {}) {
  return module.noteService.updateNote(before.id, { rawMarkdown: after, expectedUpdatedAt: before.updatedAt,
    annotationMapping: {formatVersion:1,operationId:'edit',baseContentHash:calculateContentHash(before.rawMarkdown),targetContentHash:calculateContentHash(after),edits:[sourceEdit(before.rawMarkdown,after)]}, ...extra });
}
export const annotationDynamicTests = [
  {name:'动态重点：三种标注保存后更新范围并保留身份和原始摘录',run(){
    for (const scope of ['section','blocks','selection']) {
      const {module,note,annotation}=fixture(scope);
      const saved=save(module,note,note.rawMarkdown.replace('重要文字','重新增要文字'));
      const updated=module.contentAnnotationService.getAnnotation(annotation.id);
      assert.equal(updated.anchorStatus,'resolved');assert.match(updated.quoteText,/新增/);
      assert.equal(updated.id,annotation.id);assert.equal(updated.comment,'保留备注');assert.equal(updated.importance,'core');
      assert.deepEqual(updated.originSnapshot,annotation.originSnapshot);
      assert.equal(updated.noteContentHash,calculateContentHash(saved.rawMarkdown));
      assert.equal(saved.annotationStructure.contentHash,updated.noteContentHash);
    }
  }},
  {name:'动态重点：章节边界确认绑定正文与修订，旧预览不可确认',run(){
    const {module,note,annotation}=fixture();
    const saved=save(module,note,note.rawMarkdown.replace('## B','### B'));
    const preview=module.annotationScopeService.previewAnnotation(annotation.id);
    assert.equal(preview.annotation.anchorStatus,'needsReview');assert.ok(preview.pendingRange);
    assert.equal(preview.annotation.quoteText,annotation.quoteText);
    assert.throws(()=>module.contentAnnotationService.confirmAnnotationRange(annotation.id,{expectedRevision:annotation.revision,noteContentHash:preview.currentContentHash,candidateHash:preview.pendingRange.candidateHash}),{code:'ANNOTATION_CONTENT_CONFLICT'});
    const updated=module.contentAnnotationService.confirmAnnotationRange(annotation.id,{expectedRevision:preview.annotation.revision,noteContentHash:preview.currentContentHash,candidateHash:preview.pendingRange.candidateHash});
    assert.equal(updated.anchorStatus,'resolved');assert.match(updated.quoteText,/尾段/);assert.equal(updated.noteVersionId,module.noteVersionService.listVersions({noteId:note.id}).find(v=>v.contentHash===calculateContentHash(saved.rawMarkdown)).id);
  }},
  {name:'动态重点：失效排除阻止分析，不能静默扩大范围',run(){
    const {module,note,annotation}=fixture();
    const p=projectMarkdown(note.rawMarkdown);const i=p.text.indexOf('重要');
    module.annotationScopeService.createExclusion(annotation.id,{expectedRevision:annotation.revision,noteContentHash:calculateContentHash(note.rawMarkdown),anchor:anchorFromProjectedRange(p,i,i+2)});
    save(module,note,note.rawMarkdown.replace('重要',''));
    assert.throws(()=>module.annotationScopeService.previewAnalysisScope({spaceId:note.spaceId,mode:'marked',annotationIds:[annotation.id]}),{code:'ANNOTATION_EXCLUSION_CONFLICT'});
  }},
  {name:'动态重点：伪造映射不影响正文保存，但不自动接受定位',run(){
    const {module,note,annotation}=fixture();const after=note.rawMarkdown.replace('重要','修改');
    save(module,note,after,{annotationMapping:{formatVersion:1,operationId:'bad',baseContentHash:calculateContentHash(note.rawMarkdown),targetContentHash:calculateContentHash(after),edits:[]}});
    assert.equal(module.noteService.getNote(note.id).rawMarkdown,after);
    assert.equal(module.contentAnnotationService.getAnnotation(annotation.id).anchorReason,'mappingMismatch');
  }},
  {name:'动态重点：删除后重新输入同文不会自动复活',run(){
    const {module,note,annotation}=fixture('selection');
    const deleted=save(module,note,note.rawMarkdown.replace('重要文字',''));
    assert.equal(module.contentAnnotationService.getAnnotation(annotation.id).anchorStatus,'missing');
    save(module,deleted,note.rawMarkdown);
    assert.equal(module.contentAnnotationService.getAnnotation(annotation.id).anchorStatus,'missing');
  }}
];

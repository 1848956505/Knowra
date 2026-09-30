import assert from 'node:assert/strict';
import { projectMarkdown, anchorForListItem, anchorFromProjectedRange, calculateContentHash, sourceEdits } from '@study-accelerator/content-anchor';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';

function fixture(raw = '- 父项\n  - 子项\n- 相邻') {
  const k = createKnowledgeModule();
  const note = k.noteService.createNote({ id: 'list-note', spaceId: 'space', title: '列表验收', rawMarkdown: raw });
  const anchor = anchorForListItem(projectMarkdown(raw), '0.0');
  const input = { spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'list', anchor,
    quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
    noteContentHash: calculateContentHash(raw), anchorFingerprint: 'test', idempotencyKey: 'list', comment: '保留备注', importance: 'core' };
  const annotation = k.contentAnnotationService.createAnnotation(input);
  return { k, note, annotation, input };
}
function save(k, note, after, history = false) {
  return k.noteService.updateNote(note.id, { expectedUpdatedAt: note.updatedAt, rawMarkdown: after,
    annotationMapping: { formatVersion: 1, operationId: 'list-edit', baseContentHash: calculateContentHash(note.rawMarkdown),
      targetContentHash: calculateContentHash(after), edits: sourceEdits(note.rawMarkdown, after).map(edit => ({ ...edit, history })) } });
}

export const annotationListTests = [
  { name: '列表标记：服务器生成结构身份，编辑末尾和新增子项后保持历史依据', run() {
    const { k, note, annotation } = fixture();
    assert.ok(annotation.anchor.tracking.rootId);
    save(k, note, note.rawMarkdown.replace('父项', '父项补充').replace('子项','子项\n  - 新子项'));
    const updated = k.contentAnnotationService.getAnnotation(annotation.id);
    assert.equal(updated.anchorStatus, 'resolved'); assert.match(updated.quoteText, /新子项/);
    assert.doesNotMatch(updated.quoteText, /相邻/); assert.equal(updated.scopeType, 'list');
    assert.equal(updated.comment, '保留备注'); assert.equal(updated.importance, 'core');
    assert.deepEqual(updated.originSnapshot, annotation.originSnapshot);
  } },
  { name: '列表标记：已有同级项归入后持续待确认，过期预览拒绝确认', run() {
    const { k, note, annotation } = fixture('- 父项\n- 相邻');
    const changed = save(k, note, '- 父项\n  - 相邻');
    const first = k.annotationScopeService.previewAnnotation(annotation.id);
    assert.equal(first.annotation.anchorStatus, 'needsReview'); assert.ok(first.pendingRange);
    save(k, changed, changed.rawMarkdown.replace('父项','父项补充'));
    const current = k.annotationScopeService.previewAnnotation(annotation.id);
    assert.equal(current.annotation.anchorStatus, 'needsReview'); assert.match(current.pendingRange.anchor.quoteText, /补充/);
    assert.throws(() => k.contentAnnotationService.confirmAnnotationRange(annotation.id, {
      expectedRevision: first.annotation.revision, noteContentHash: first.currentContentHash, candidateHash: first.pendingRange.candidateHash
    }), { code: 'ANNOTATION_CONTENT_CONFLICT' });
    const confirmed = k.contentAnnotationService.confirmAnnotationRange(annotation.id, {
      expectedRevision: current.annotation.revision, noteContentHash: current.currentContentHash, candidateHash: current.pendingRange.candidateHash
    });
    assert.equal(confirmed.anchorStatus, 'resolved'); assert.equal(confirmed.id, annotation.id);
    assert.deepEqual(confirmed.originSnapshot, annotation.originSnapshot);
  } },
  { name: '列表标记：排除子项、恢复排除与独立子标记互不影响', run() {
    const { k, note, annotation } = fixture();
    const projection = projectMarkdown(note.rawMarkdown);
    const start = projection.text.indexOf('子项');
    const childAnchor = anchorFromProjectedRange(projection, start, start + 2);
    const excluded = k.annotationScopeService.createExclusion(annotation.id, { expectedRevision: annotation.revision,
      noteContentHash: calculateContentHash(note.rawMarkdown), anchor: childAnchor });
    const preview = k.annotationScopeService.previewAnalysisScope({ spaceId: note.spaceId, mode: 'marked', annotationIds: [annotation.id] });
    assert.ok(preview.exclusions.length); assert.equal(preview.segments.map(segment => segment.markdown).join(''), '父项');
    const next = anchorForListItem(projection, '0.1');
    const reselect = (anchor, expectedRevision) => k.contentAnnotationService.updateAnnotationAnchor(annotation.id, {
      anchor, expectedRevision, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
      prefixText: anchor.prefixText, suffixText: anchor.suffixText, anchorFingerprint: 'reselect', noteContentHash: calculateContentHash(note.rawMarkdown) });
    const rebound = reselect(next, excluded.annotation.revision);
    assert.throws(() => k.annotationScopeService.previewAnalysisScope({ spaceId: note.spaceId, mode: 'marked', annotationIds: [annotation.id] }), { code: 'ANNOTATION_EXCLUSION_CONFLICT' });
    const back = reselect(annotation.anchor, rebound.revision);
    k.annotationScopeService.deleteExclusion(annotation.id, excluded.exclusion.id, { expectedRevision: back.revision });
    const restored = k.annotationScopeService.previewAnalysisScope({ spaceId: note.spaceId, mode: 'marked', annotationIds: [annotation.id] });
    assert.match(restored.segments.map(segment => segment.markdown).join(''), /子项/);
  } },
  { name: '列表标记：类型不一致和伪造同级范围拒绝，结构身份不信任客户端', run() {
    const { k, input, annotation } = fixture();
    assert.throws(() => k.contentAnnotationService.createAnnotation({ ...input, scopeType: 'selection', idempotencyKey: 'bad-scope' }), { code: 'ANNOTATION_RANGE_INVALID' });
    assert.throws(() => k.contentAnnotationService.createAnnotation({ ...input, anchor: { ...input.anchor, sourceEnd: 999 }, idempotencyKey: 'bad-end' }), { code: 'ANNOTATION_ANCHOR_UNRESOLVED' });
    assert.throws(() => k.contentAnnotationService.createAnnotation({ ...input, noteContentHash: 'old', idempotencyKey: 'old-body' }), { code: 'ANNOTATION_CONTENT_CONFLICT' });
    const forgedIdentity = k.contentAnnotationService.createAnnotation({ ...input, kind: 'question', idempotencyKey: 'forged-identity',
      anchor: { ...input.anchor, tracking: { rootId: 'forged', memberIds: ['forged'], ancestorItemIds: ['forged'] } } });
    assert.notEqual(forgedIdentity.anchor.tracking.rootId, 'forged');
    assert.deepEqual(forgedIdentity.anchor.tracking, annotation.anchor.tracking);
    const partial = anchorFromProjectedRange(projectMarkdown(k.noteService.getNote(annotation.noteId).rawMarkdown), 0, 2);
    assert.throws(() => k.contentAnnotationService.updateAnnotationAnchor(annotation.id, { ...input, anchor: partial,
      quoteText: partial.quoteText, expectedRevision: annotation.revision }), { code: 'ANNOTATION_RANGE_INVALID' });
    assert.equal(k.contentAnnotationService.createAnnotation(input).id, annotation.id);
  } },
  { name: '列表标记：空项保存、重新输入、删除根和同文重输不阻断正文保存', run() {
    const { k, note, annotation } = fixture('- 父项');
    const empty = save(k, note, '- ');
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).quoteText, '');
    const filled = save(k, empty, '- 新内容');
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).quoteText, '新内容');
    const removed = save(k, filled, '');
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'missing');
    save(k, removed, '- 新内容');
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'missing');
  } },
  { name: '列表标记：删除后显式历史撤销恢复，退出列表无错误候选', run() {
    const { k, note, annotation } = fixture();
    const removed = save(k, note, '- 相邻');
    save(k, removed, note.rawMarkdown, true);
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
    const current = k.noteService.getNote(note.id);
    save(k, current, '父项\n\n- 子项\n- 相邻');
    const preview = k.annotationScopeService.previewAnnotation(annotation.id);
    assert.equal(preview.annotation.anchorStatus, 'needsReview'); assert.equal(preview.pendingRange, null);
  } },
  { name: '列表标记：重复保存与取消后编辑再恢复沿用当前结构，不复活已删除根', run() {
    const { k, note, annotation } = fixture();
    let current = save(k, note, note.rawMarkdown.replace('父项', '父项一'));
    current = save(k, current, current.rawMarkdown.replace('父项一', '父项二'));
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
    k.contentAnnotationService.archiveAnnotation(annotation.id);
    current = save(k, current, current.rawMarkdown.replace('父项二', '父项三'));
    let restored = k.contentAnnotationService.restoreAnnotation(annotation.id);
    assert.equal(restored.anchorStatus, 'resolved'); assert.match(restored.quoteText, /父项三/);
    assert.equal(restored.noteContentHash, calculateContentHash(current.rawMarkdown));
    assert.deepEqual(restored.originSnapshot, annotation.originSnapshot);
    current = save(k, current, current.rawMarkdown.replace('父项三', '父项四'));
    assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
    k.contentAnnotationService.archiveAnnotation(annotation.id);
    current = save(k, current, '- 相邻');
    save(k, current, '- 父项四\n  - 子项\n- 相邻');
    restored = k.contentAnnotationService.restoreAnnotation(annotation.id);
    assert.notEqual(restored.anchorStatus, 'resolved');
  } },
  { name: '列表标记：排除内容移出子树后，确认父范围也不能静默忽略排除冲突', run() {
    const { k, note, annotation } = fixture();
    const p = projectMarkdown(note.rawMarkdown), start = p.text.indexOf('子项');
    k.annotationScopeService.createExclusion(annotation.id, { expectedRevision: annotation.revision,
      noteContentHash: calculateContentHash(note.rawMarkdown), anchor: anchorFromProjectedRange(p, start, start + 2) });
    save(k, note, '- 父项\n- 子项\n- 相邻');
    const preview = k.annotationScopeService.previewAnnotation(annotation.id);
    assert.ok(preview.pendingRange);
    k.contentAnnotationService.confirmAnnotationRange(annotation.id, { expectedRevision: preview.annotation.revision,
      noteContentHash: preview.currentContentHash, candidateHash: preview.pendingRange.candidateHash });
    assert.throws(() => k.annotationScopeService.previewAnalysisScope({ spaceId: note.spaceId,
      mode: 'marked', annotationIds: [annotation.id] }), { code: 'ANNOTATION_EXCLUSION_CONFLICT' });
  } }
,
  { name: '列表标记：转换任务列表不阻断保存，无非法确认候选', run() {
    const { k, note, annotation } = fixture('- 父项');
    save(k, note, '- [ ] 父项');
    const preview = k.annotationScopeService.previewAnnotation(annotation.id);
    assert.equal(preview.annotation.anchorStatus, 'needsReview');
    assert.equal(preview.pendingRange, null);
    assert.equal(k.noteService.getNote(note.id).rawMarkdown, '- [ ] 父项');
  } }
,
  { name: '列表标记：关联知识编辑、取消和删除原文后保留不可变证据', run() {
    const { k, note, annotation } = fixture();
    const { item, evidence } = k.knowledgeItemService.createCandidate({ title: '列表知识', canonicalStatement: '来自列表子树',
      sourceMode: 'annotation', evidence: [{ sourceType: 'annotation', annotationId: annotation.id, expectedAnnotationRevision: annotation.revision }] });
    k.knowledgeItemService.confirmItem(item.id);
    const changed = save(k, note, note.rawMarkdown.replace('父项', '父项更新'));
    const updatedEvidence = k.knowledgeItemService.listEvidence(item.id)[0];
    assert.equal(updatedEvidence.quoteText, evidence[0].quoteText);
    assert.equal(updatedEvidence.noteVersionId, evidence[0].noteVersionId);
    assert.equal(updatedEvidence.status, 'stale');
    assert.equal(k.knowledgeItemService.getItem(item.id).reviewStatus, 'needsRevision');
    k.contentAnnotationService.archiveAnnotation(annotation.id);
    assert.equal(k.knowledgeItemService.getItem(item.id).id, item.id);
    k.contentAnnotationService.restoreAnnotation(annotation.id);
    save(k, changed, '- 相邻');
    assert.equal(k.knowledgeItemService.listEvidence(item.id)[0].status, 'insufficient');
    assert.equal(k.knowledgeItemService.listEvidence(item.id)[0].quoteText, evidence[0].quoteText);
  } }

];

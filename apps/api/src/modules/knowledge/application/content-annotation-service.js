import crypto from 'node:crypto';
import {
  calculateContentHash,
  anchorForSection,
  followSectionAnchor,
  headingPathForSourceOffset,
  projectMarkdown,
  relocateAnchor,
  resolveAnchor
} from '@study-accelerator/content-anchor';
import { createAppError } from '../../../errors/app-error.js';
import { ContentAnnotation } from '../domain/content-annotation.js';
import { buildCreateContentAnnotationDto, buildUpdateAnnotationAnchorDto, buildUpdateContentAnnotationDto } from './dto/content-annotation-dto.js';
import { createInMemoryContentAnnotationRepository } from '../infrastructure/content-annotation-repository.js';

const contentHash = calculateContentHash;
const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);
const requestHash = (value) => contentHash(JSON.stringify(value));

export function createContentAnnotationService({ repository = createInMemoryContentAnnotationRepository(), noteRepository, noteVersionRepository, revisionRepository = null } = {}) {
  function requireAnnotation(id) { const annotation = repository.findById(id); if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404); return annotation; }
  function assertCurrentNote(dto) { const note = noteRepository?.findById(dto.noteId); if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404); if (note.spaceId !== dto.spaceId) throw fail('ANNOTATION_SPACE_MISMATCH', '标注空间与笔记不一致', 409); if (contentHash(note.rawMarkdown) !== dto.noteContentHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请重新选择标注范围', 409); return note; }
  function nextId() { return `annotation-${crypto.randomUUID()}`; }
  function assertRevision(annotation, expectedRevision) {
    if (expectedRevision === undefined || expectedRevision === null || Number.isNaN(expectedRevision)) return;
    if (annotation.revision !== Number(expectedRevision)) throw fail('ANNOTATION_REVISION_CONFLICT', '标注已被其他操作修改，请刷新后重试', 409);
  }
  function authoritativeAnchor(note, dto) {
    const result = resolveAnchor(note.rawMarkdown, dto.anchor);
    if (result.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '无法在当前笔记版本中确认标注范围', 409);
    if (result.quoteText !== dto.quoteText) throw fail('ANNOTATION_QUOTE_MISMATCH', '所选文字与当前笔记版本不一致', 409);
    const projection = result.projection;
    const sourceStart = dto.anchor.segments[0].start;
    const anchor = {
      ...structuredClone(dto.anchor),
      noteVersionId: null,
      quoteText: result.quoteText,
      prefixText: dto.anchor.prefixText ?? '',
      suffixText: dto.anchor.suffixText ?? ''
    };
    return {
      anchor,
      projection,
      quoteText: result.quoteText,
      headingPath: headingPathForSourceOffset(projection, sourceStart),
      fromPosition: dto.anchor.sourceStart,
      toPosition: dto.anchor.sourceEnd,
      prefixText: anchor.prefixText,
      suffixText: anchor.suffixText,
      anchorFingerprint: contentHash(JSON.stringify({ segments: anchor.segments, structurePath: anchor.structurePath })),
      resolvedContentHash: contentHash(result.quoteText),
      boundaryFingerprint: dto.anchor.section?.memberFingerprint ?? null
    };
  }
  function recordRevision(annotation, operation, oldAnchor = null, reason = null) {
    revisionRepository?.save({
      id: `annotation-revision-${crypto.randomUUID()}`,
      annotationId: annotation.id,
      revision: annotation.revision,
      operation,
      oldAnchor: oldAnchor ? structuredClone(oldAnchor) : null,
      newAnchor: annotation.anchor ? structuredClone(annotation.anchor) : null,
      rangeSummary: { scopeType: annotation.scopeType, quoteText: annotation.quoteText },
      reason,
      createdAt: new Date().toISOString()
    });
  }
  function saveUpdated(annotation, changes, operation, reason = null) {
    const updated = repository.save(new ContentAnnotation({
      ...annotation,
      ...changes,
      revision: annotation.revision + 1,
      updatedAt: new Date().toISOString()
    }));
    recordRevision(updated, operation, annotation.anchor, reason);
    return updated;
  }
  return {
    createAnnotation(input) {
      const dto = buildCreateContentAnnotationDto(input);
      const hashedRequest = requestHash(dto);
      const idempotent = repository.findByIdempotencyKey(dto.noteId, dto.idempotencyKey);
      if (idempotent) {
        if (idempotent.requestHash && idempotent.requestHash !== hashedRequest) throw fail('ANNOTATION_IDEMPOTENCY_CONFLICT', '同一幂等键不能用于不同的标注请求', 409);
        return idempotent;
      }
      const note = assertCurrentNote(dto);
      const version = noteVersionRepository?.findByNoteIdAndContentHash(dto.noteId, dto.noteContentHash);
      const source = dto.schemaVersion === 2 ? authoritativeAnchor(note, dto) : dto;
      if (dto.schemaVersion === 2 && !version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
      const duplicateInput = { ...dto, ...source };
      if (repository.findDuplicate(duplicateInput)) throw fail('ANNOTATION_DUPLICATE', '该范围已存在同类型标记', 409);
      const anchor = source.anchor ? { ...source.anchor, noteVersionId: version?.id ?? null } : null;
      const originSnapshot = anchor ? {
        noteVersionId: version.id,
        contentHash: dto.noteContentHash,
        scopeType: dto.scopeType,
        segments: structuredClone(anchor.segments),
        quoteText: source.quoteText,
        headingPath: source.headingPath
      } : null;
      const created = repository.save(new ContentAnnotation({
        ...dto, ...source, anchor, originSnapshot,
        noteVersionId: version?.id ?? null,
        lifecycleStatus: 'active', anchorStatus: 'resolved', anchorReason: null,
        requestHash: hashedRequest, id: nextId()
      }));
      recordRevision(created, 'created');
      return created;
    },
    listAnnotationsByNote(options) { return repository.list(options); },
    getAnnotation(id) { return requireAnnotation(id); },
    advanceRevision(id, input = {}) { const annotation = requireAnnotation(id); assertRevision(annotation, input.expectedRevision); return saveUpdated(annotation, {}, input.operation ?? 'rangeChanged', input.reason ?? null); },
    updateAnnotation(id, input) { const annotation = requireAnnotation(id); const dto = buildUpdateContentAnnotationDto(input); assertRevision(annotation, dto.expectedRevision); return saveUpdated(annotation, dto, 'metadataUpdated'); },
    archiveAnnotation(id, input = {}) { const annotation = requireAnnotation(id); assertRevision(annotation, input.expectedRevision); return saveUpdated(annotation, { lifecycleStatus: 'archived', deletedAt: new Date().toISOString() }, 'archived'); },
    restoreAnnotation(id, input = {}) {
      const annotation = requireAnnotation(id);
      assertRevision(annotation, input.expectedRevision);
      if (annotation.schemaVersion !== 2 || !annotation.anchor) return saveUpdated(annotation, { lifecycleStatus: 'active', anchorStatus: annotation.status === 'stale' ? 'needsReview' : 'resolved', deletedAt: null }, 'restored');
      const note = noteRepository?.findById(annotation.noteId);
      if (!note || note.deleted) return saveUpdated(annotation, { lifecycleStatus: 'active', anchorStatus: 'missing', anchorReason: 'sourceDeleted', deletedAt: null }, 'restored', 'sourceDeleted');
      const result = annotation.scopeType === 'section'
        ? followSectionAnchor(note.rawMarkdown, annotation.anchor)
        : relocateAnchor(note.rawMarkdown, annotation.anchor);
      return saveUpdated(annotation, {
        lifecycleStatus: 'active', deletedAt: null,
        anchorStatus: result.status, anchorReason: result.reason,
        ...(result.anchor ? {
          anchor: { ...result.anchor, noteVersionId: annotation.noteVersionId },
          quoteText: result.quoteText,
          fromPosition: result.anchor.sourceStart,
          toPosition: result.anchor.sourceEnd,
          resolvedContentHash: contentHash(result.quoteText)
        } : {})
      }, 'restored', result.reason);
    },
    updateAnnotationAnchor(id, input) {
      const annotation = requireAnnotation(id);
      const dto = buildUpdateAnnotationAnchorDto(input);
      assertRevision(annotation, dto.expectedRevision);
      const note = assertCurrentNote({ ...annotation, ...dto });
      const version = noteVersionRepository?.findByNoteIdAndContentHash(annotation.noteId, dto.noteContentHash);
      const source = dto.anchor ? authoritativeAnchor(note, { ...dto, schemaVersion: 2 }) : dto;
      if (annotation.schemaVersion === 2 && !version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
      return saveUpdated(annotation, {
        ...source,
        anchor: source.anchor ? { ...source.anchor, noteVersionId: version?.id ?? null } : annotation.anchor,
        noteVersionId: version?.id ?? null,
        anchorStatus: 'resolved', anchorReason: null,
        lifecycleStatus: 'active', deletedAt: null
      }, 'anchorUpdated');
    },
    reconcileForNote(noteId, currentContentHash) {
      const note = noteRepository?.findById(noteId);
      if (!note || note.deleted) return { annotations: [], contentChangedAnnotationIds: [] };
      const version = noteVersionRepository?.findByNoteIdAndContentHash(noteId, currentContentHash);
      const changed = [];
      const contentChangedAnnotationIds = [];
      for (const annotation of repository.list({ noteId, includeDeleted: true })) {
        if (annotation.lifecycleStatus === 'archived' || annotation.noteContentHash === currentContentHash) continue;
        if (annotation.schemaVersion !== 2 || !annotation.anchor) {
          changed.push(saveUpdated(annotation, { anchorStatus: 'needsReview', anchorReason: 'legacyUnverified', noteContentHash: currentContentHash }, 'anchorStatusChanged', 'legacyUnverified'));
          continue;
        }
        const result = annotation.scopeType === 'section'
          ? followSectionAnchor(note.rawMarkdown, annotation.anchor)
          : relocateAnchor(note.rawMarkdown, annotation.anchor);
        let nextAnchor = result.anchor ?? annotation.anchor;
        if (result.status === 'resolved' && annotation.scopeType === 'section') {
          const sectionIndex = result.projection.sections.findIndex((section) => section.path === annotation.anchor.structurePath);
          if (sectionIndex >= 0) nextAnchor = anchorForSection(result.projection, sectionIndex);
        }
        const nextQuote = result.status === 'resolved' ? nextAnchor.quoteText : annotation.quoteText;
        const nextResolvedHash = result.status === 'resolved' ? contentHash(nextQuote) : annotation.resolvedContentHash;
        if (result.status !== 'resolved' || nextResolvedHash !== annotation.resolvedContentHash) contentChangedAnnotationIds.push(annotation.id);
        changed.push(saveUpdated(annotation, {
          noteVersionId: version?.id ?? annotation.noteVersionId,
          noteContentHash: currentContentHash,
          anchor: { ...nextAnchor, noteVersionId: version?.id ?? annotation.noteVersionId },
          quoteText: nextQuote,
          fromPosition: nextAnchor.sourceStart,
          toPosition: nextAnchor.sourceEnd,
          resolvedContentHash: nextResolvedHash,
          boundaryFingerprint: nextAnchor.section?.memberFingerprint ?? annotation.boundaryFingerprint,
          anchorStatus: result.status,
          anchorReason: result.reason
        }, 'sourceReconciled', result.reason));
      }
      return { annotations: changed, contentChangedAnnotationIds };
    },
    markStaleForNote(noteId, currentContentHash) { return repository.markStaleByNoteId?.(noteId, currentContentHash) ?? []; },
    markAnnotationStale(id) { const annotation = requireAnnotation(id); return annotation.lifecycleStatus === 'archived' ? annotation : saveUpdated(annotation, { anchorStatus: 'needsReview', anchorReason: 'contentChanged' }, 'anchorStatusChanged', 'contentChanged'); }
  };
}

export { contentHash as calculateNoteContentHash };

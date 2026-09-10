import crypto from 'node:crypto';
import { anchorForSection, calculateContentHash, followSectionAnchor, headingPathForSourceOffset, relocateAnchor, resolveAnchor } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../../errors/app-error.js';
import { ContentAnnotation } from '../../domain/content-annotation.js';
import { buildCreateContentAnnotationDto, buildUpdateAnnotationAnchorDto, buildUpdateContentAnnotationDto } from '../dto/content-annotation-dto.js';

const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);
const requestHash = (value) => calculateContentHash(JSON.stringify(value));

export function createAsyncContentAnnotationService({ repository, noteRepository, noteVersionRepository, revisionRepository = null } = {}) {
  if (!repository || !noteRepository) throw new TypeError('Async annotation service requires annotation and note repositories');

  async function requireAnnotation(id) {
    const annotation = await repository.findById(id);
    if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404);
    return annotation;
  }
  async function assertCurrentNote(dto) {
    const note = await noteRepository.findById(dto.noteId);
    if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404);
    if (note.spaceId !== dto.spaceId) throw fail('ANNOTATION_SPACE_MISMATCH', '标注空间与笔记不一致', 409);
    if (calculateContentHash(note.rawMarkdown) !== dto.noteContentHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请重新选择标注范围', 409);
    return note;
  }
  function assertRevision(annotation, expectedRevision) {
    if (expectedRevision === undefined || expectedRevision === null || Number.isNaN(expectedRevision)) return;
    if (annotation.revision !== Number(expectedRevision)) throw fail('ANNOTATION_REVISION_CONFLICT', '标注已被其他操作修改，请刷新后重试', 409);
  }
  function authoritativeAnchor(note, dto) {
    const result = resolveAnchor(note.rawMarkdown, dto.anchor);
    if (result.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '无法在当前笔记版本中确认标注范围', 409);
    if (result.quoteText !== dto.quoteText) throw fail('ANNOTATION_QUOTE_MISMATCH', '所选文字与当前笔记版本不一致', 409);
    const anchor = { ...structuredClone(dto.anchor), noteVersionId: null, quoteText: result.quoteText };
    return {
      anchor,
      quoteText: result.quoteText,
      headingPath: headingPathForSourceOffset(result.projection, dto.anchor.segments[0].start),
      fromPosition: dto.anchor.sourceStart,
      toPosition: dto.anchor.sourceEnd,
      prefixText: anchor.prefixText ?? '',
      suffixText: anchor.suffixText ?? '',
      anchorFingerprint: calculateContentHash(JSON.stringify({ segments: anchor.segments, structurePath: anchor.structurePath })),
      resolvedContentHash: calculateContentHash(result.quoteText),
      boundaryFingerprint: dto.anchor.section?.memberFingerprint ?? null
    };
  }
  async function recordRevision(annotation, operation, oldAnchor = null, reason = null) {
    await revisionRepository?.save({ id: `annotation-revision-${crypto.randomUUID()}`, annotationId: annotation.id, revision: annotation.revision, operation, oldAnchor: oldAnchor ? structuredClone(oldAnchor) : null, newAnchor: annotation.anchor ? structuredClone(annotation.anchor) : null, rangeSummary: { scopeType: annotation.scopeType, quoteText: annotation.quoteText }, reason, createdAt: new Date().toISOString() });
  }
  async function saveUpdated(annotation, changes, operation, reason = null) {
    const updated = await repository.save(new ContentAnnotation({ ...annotation, ...changes, revision: annotation.revision + 1, updatedAt: new Date().toISOString() }));
    await recordRevision(updated, operation, annotation.anchor, reason);
    return updated;
  }

  return {
    async createAnnotation(input) {
      const dto = buildCreateContentAnnotationDto(input);
      const hashedRequest = requestHash(dto);
      const idempotent = await repository.findByIdempotencyKey(dto.noteId, dto.idempotencyKey);
      if (idempotent) {
        if (idempotent.requestHash && idempotent.requestHash !== hashedRequest) throw fail('ANNOTATION_IDEMPOTENCY_CONFLICT', '同一幂等键不能用于不同的标注请求', 409);
        return idempotent;
      }
      const note = await assertCurrentNote(dto);
      const version = await noteVersionRepository?.findByNoteIdAndContentHash(dto.noteId, dto.noteContentHash);
      const source = dto.schemaVersion === 2 ? authoritativeAnchor(note, dto) : dto;
      if (dto.schemaVersion === 2 && !version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
      if (await repository.findDuplicate({ ...dto, ...source })) throw fail('ANNOTATION_DUPLICATE', '该范围已存在同类型标记', 409);
      const anchor = source.anchor ? { ...source.anchor, noteVersionId: version?.id ?? null } : null;
      const originSnapshot = anchor ? { noteVersionId: version.id, contentHash: dto.noteContentHash, scopeType: dto.scopeType, segments: structuredClone(anchor.segments), quoteText: source.quoteText, headingPath: source.headingPath } : null;
      const created = await repository.save(new ContentAnnotation({ ...dto, ...source, anchor, originSnapshot, noteVersionId: version?.id ?? null, lifecycleStatus: 'active', anchorStatus: 'resolved', anchorReason: null, requestHash: hashedRequest, id: `annotation-${crypto.randomUUID()}` }));
      await recordRevision(created, 'created');
      return created;
    },
    listAnnotationsByNote(options) { return repository.list(options); },
    getAnnotation: requireAnnotation,
    async advanceRevision(id, input = {}) {
      const annotation = await requireAnnotation(id);
      assertRevision(annotation, input.expectedRevision);
      return saveUpdated(annotation, {}, input.operation ?? 'rangeChanged', input.reason ?? null);
    },
    async updateAnnotation(id, input) {
      const annotation = await requireAnnotation(id);
      const dto = buildUpdateContentAnnotationDto(input);
      assertRevision(annotation, dto.expectedRevision);
      return saveUpdated(annotation, dto, 'metadataUpdated');
    },
    async archiveAnnotation(id, input = {}) {
      const annotation = await requireAnnotation(id);
      assertRevision(annotation, input.expectedRevision);
      return saveUpdated(annotation, { lifecycleStatus: 'archived', deletedAt: new Date().toISOString() }, 'archived');
    },
    async restoreAnnotation(id, input = {}) {
      const annotation = await requireAnnotation(id);
      assertRevision(annotation, input.expectedRevision);
      if (annotation.schemaVersion !== 2 || !annotation.anchor) return saveUpdated(annotation, { lifecycleStatus: 'active', anchorStatus: annotation.status === 'stale' ? 'needsReview' : 'resolved', deletedAt: null }, 'restored');
      const note = await noteRepository.findById(annotation.noteId);
      if (!note || note.deleted) return saveUpdated(annotation, { lifecycleStatus: 'active', anchorStatus: 'missing', anchorReason: 'sourceDeleted', deletedAt: null }, 'restored', 'sourceDeleted');
      const result = annotation.scopeType === 'section'
        ? followSectionAnchor(note.rawMarkdown, annotation.anchor)
        : relocateAnchor(note.rawMarkdown, annotation.anchor);
      return saveUpdated(annotation, { lifecycleStatus: 'active', deletedAt: null, anchorStatus: result.status, anchorReason: result.reason, ...(result.anchor ? { anchor: { ...result.anchor, noteVersionId: annotation.noteVersionId }, quoteText: result.quoteText, fromPosition: result.anchor.sourceStart, toPosition: result.anchor.sourceEnd, resolvedContentHash: calculateContentHash(result.quoteText) } : {}) }, 'restored', result.reason);
    },
    async updateAnnotationAnchor(id, input) {
      const annotation = await requireAnnotation(id);
      const dto = buildUpdateAnnotationAnchorDto(input);
      assertRevision(annotation, dto.expectedRevision);
      const note = await assertCurrentNote({ ...annotation, ...dto });
      const version = await noteVersionRepository?.findByNoteIdAndContentHash(annotation.noteId, dto.noteContentHash);
      const source = dto.anchor ? authoritativeAnchor(note, dto) : dto;
      if (annotation.schemaVersion === 2 && !version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
      return saveUpdated(annotation, { ...source, anchor: source.anchor ? { ...source.anchor, noteVersionId: version?.id ?? null } : annotation.anchor, noteVersionId: version?.id ?? null, anchorStatus: 'resolved', anchorReason: null, lifecycleStatus: 'active', deletedAt: null }, 'anchorUpdated');
    },
    async reconcileForNote(noteId, currentContentHash) {
      const note = await noteRepository.findById(noteId);
      if (!note || note.deleted) return { annotations: [], contentChangedAnnotationIds: [] };
      const version = await noteVersionRepository?.findByNoteIdAndContentHash(noteId, currentContentHash);
      const changed = [];
      const contentChangedAnnotationIds = [];
      for (const annotation of await repository.list({ noteId, includeDeleted: true })) {
        if (annotation.lifecycleStatus === 'archived' || annotation.noteContentHash === currentContentHash) continue;
        if (annotation.schemaVersion !== 2 || !annotation.anchor) {
          changed.push(await saveUpdated(annotation, { anchorStatus: 'needsReview', anchorReason: 'legacyUnverified', noteContentHash: currentContentHash }, 'anchorStatusChanged', 'legacyUnverified'));
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
        const nextResolvedHash = result.status === 'resolved' ? calculateContentHash(nextQuote) : annotation.resolvedContentHash;
        if (result.status !== 'resolved' || nextResolvedHash !== annotation.resolvedContentHash) contentChangedAnnotationIds.push(annotation.id);
        changed.push(await saveUpdated(annotation, { noteVersionId: version?.id ?? annotation.noteVersionId, noteContentHash: currentContentHash, anchor: { ...nextAnchor, noteVersionId: version?.id ?? annotation.noteVersionId }, quoteText: nextQuote, fromPosition: nextAnchor.sourceStart, toPosition: nextAnchor.sourceEnd, resolvedContentHash: nextResolvedHash, boundaryFingerprint: nextAnchor.section?.memberFingerprint ?? annotation.boundaryFingerprint, anchorStatus: result.status, anchorReason: result.reason }, 'sourceReconciled', result.reason));
      }
      return { annotations: changed, contentChangedAnnotationIds };
    },
    async markAnnotationStale(id) {
      const annotation = await requireAnnotation(id);
      return annotation.lifecycleStatus === 'archived' ? annotation : saveUpdated(annotation, { anchorStatus: 'needsReview', anchorReason: 'contentChanged' }, 'anchorStatusChanged', 'contentChanged');
    },
    markStaleForNote(noteId, currentContentHash) { return repository.markStaleByNoteId?.(noteId, currentContentHash) ?? Promise.resolve([]); }
  };
}

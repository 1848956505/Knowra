import crypto from 'node:crypto';
import { calculateContentHash, projectMarkdown, resolveAnchor } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../../errors/app-error.js';
import { buildResolvedSegments, normalizeScopeInput, stableStringify } from '../annotation-scope-service.js';

const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export function createAsyncAnnotationScopeService({
  annotationService,
  annotationRepository,
  exclusionRepository,
  analysisScopeRepository,
  noteRepository,
  noteVersionRepository,
  evidenceRepository,
  knowledgeItemRepository
}) {
  async function requireAnnotation(id) {
    const annotation = await annotationRepository.findById(id);
    if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404);
    return annotation;
  }
  async function requireNote(id) {
    const note = await noteRepository.findById(id);
    if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404);
    return note;
  }
  async function requireVersion(note) {
    const hash = calculateContentHash(note.rawMarkdown);
    const version = await noteVersionRepository.findByNoteIdAndContentHash(note.id, hash);
    if (!version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
    return version;
  }

  async function previewAnnotation(id) {
    const annotation = await requireAnnotation(id);
    const note = await requireNote(annotation.noteId);
    const resolution = annotation.schemaVersion === 2 && annotation.anchor
      ? resolveAnchor(note.rawMarkdown, annotation.anchor)
      : { status: 'needsReview', reason: 'legacyUnverified' };
    return {
      annotation,
      currentContentHash: calculateContentHash(note.rawMarkdown),
      resolution: summarizeResolution(resolution),
      exclusions: await exclusionRepository.list({ parentAnnotationId: id, includeDeleted: true })
    };
  }

  async function createExclusion(annotationId, input = {}) {
    const annotation = await requireAnnotation(annotationId);
    if (annotation.scopeType !== 'section') throw fail('ANNOTATION_EXCLUSION_CONFLICT', '只有标题范围重点可以保存局部排除', 409);
    if (annotation.lifecycleStatus === 'archived') throw fail('ANNOTATION_EXCLUSION_CONFLICT', '已取消的重点不能新增排除', 409);
    const note = await requireNote(annotation.noteId);
    if (calculateContentHash(note.rawMarkdown) !== input.noteContentHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请刷新范围', 409);
    const resolved = resolveAnchor(note.rawMarkdown, input.anchor);
    if (resolved.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '无法确认排除范围', 409);
    if (input.anchor.sourceStart < annotation.anchor?.sourceStart || input.anchor.sourceEnd > annotation.anchor?.sourceEnd) throw fail('ANNOTATION_EXCLUSION_CONFLICT', '排除范围必须位于标题重点内', 409);
    const version = await requireVersion(note);
    const existing = (await exclusionRepository.list({ parentAnnotationId: annotation.id }))
      .find((item) => item.noteVersionId === version.id && sameAnchorRange(item.anchor, input.anchor));
    if (existing) return { annotation, exclusion: existing };
    const exclusion = await exclusionRepository.save({ id: newId('annotation-exclusion'), parentAnnotationId: annotation.id, noteVersionId: version.id, anchor: { ...structuredClone(input.anchor), noteVersionId: version.id }, status: 'active', revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const updatedAnnotation = await annotationService.advanceRevision(annotation.id, { expectedRevision: input.expectedRevision, operation: 'exclusionAdded' });
    return { annotation: updatedAnnotation, exclusion };
  }

  async function deleteExclusion(annotationId, exclusionId, input = {}) {
    const annotation = await requireAnnotation(annotationId);
    const exclusion = await exclusionRepository.findById(exclusionId);
    if (!exclusion || exclusion.parentAnnotationId !== annotation.id) throw fail('ANNOTATION_EXCLUSION_NOT_FOUND', '排除项不存在', 404);
    const archived = await exclusionRepository.save({ ...exclusion, status: 'archived', revision: Number(exclusion.revision ?? 1) + 1, updatedAt: new Date().toISOString() });
    const updatedAnnotation = await annotationService.advanceRevision(annotation.id, { expectedRevision: input.expectedRevision, operation: 'exclusionRemoved' });
    return { annotation: updatedAnnotation, exclusion: archived };
  }

  async function getKnowledgeLinks(annotationId) {
    await requireAnnotation(annotationId);
    const evidence = await evidenceRepository.list({ annotationId });
    const links = (await Promise.all(evidence.map(async (item) => ({ evidence: item, knowledgeItem: await knowledgeItemRepository.findById(item.knowledgeItemId) })))).filter((item) => item.knowledgeItem);
    return {
      annotationId,
      candidates: links.filter((item) => item.knowledgeItem.reviewStatus === 'candidate'),
      confirmed: links.filter((item) => item.knowledgeItem.reviewStatus === 'confirmed'),
      evidenceStatus: links.map((item) => ({ id: item.evidence.id, status: item.evidence.status }))
    };
  }

  async function previewAnalysisScope(input = {}) {
    const normalized = normalizeScopeInput(input);
    const annotations = await Promise.all(normalized.annotationIds.map(requireAnnotation));
    const noteIds = new Set(normalized.noteIds);
    annotations.forEach((annotation) => noteIds.add(annotation.noteId));
    normalized.selections.forEach((selection) => noteIds.add(selection.noteId));
    if (noteIds.size === 0) throw fail('ANALYSIS_SCOPE_EMPTY', '请选择至少一篇笔记或一个重点范围', 400);
    const notes = await Promise.all([...noteIds].map(requireNote));
    if (notes.some((note) => note.spaceId !== normalized.spaceId)) throw fail('ANNOTATION_SPACE_MISMATCH', '分析范围包含其他知识空间', 409);
    const noteVersions = await Promise.all(notes.map(async (note) => ({ note, version: await requireVersion(note) })));
    const versionByNote = new Map(noteVersions.map((item) => [item.note.id, item.version]));
    const noteById = new Map(notes.map((note) => [note.id, note]));
    const omittedItems = [];
    const contributions = [];

    if (normalized.mode === 'all') {
      for (const note of notes) if (note.rawMarkdown.length > 0) contributions.push({ noteId: note.id, start: 0, end: note.rawMarkdown.length, annotationId: null });
    } else {
      for (const annotation of annotations) {
        if (annotation.lifecycleStatus === 'archived') continue;
        if (annotation.schemaVersion !== 2 || !annotation.anchor) { omittedItems.push({ annotationId: annotation.id, reason: 'legacyUnverified' }); continue; }
        const resolution = resolveAnchor(noteById.get(annotation.noteId).rawMarkdown, annotation.anchor);
        if (resolution.status !== 'resolved') { omittedItems.push({ annotationId: annotation.id, reason: resolution.reason }); continue; }
        for (const segment of annotation.anchor.segments) contributions.push({ noteId: annotation.noteId, start: segment.start, end: segment.end, annotationId: annotation.id });
      }
    }
    for (const selection of normalized.selections) {
      const note = noteById.get(selection.noteId);
      const resolution = resolveAnchor(note.rawMarkdown, selection.anchor);
      if (resolution.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '临时分析范围无法确认', 409);
      for (const segment of selection.anchor.segments) contributions.push({ noteId: note.id, start: segment.start, end: segment.end, annotationId: null });
    }

    const persistentExclusions = [];
    for (const annotation of annotations.filter((item) => item.scopeType === 'section')) {
      for (const exclusion of await exclusionRepository.list({ parentAnnotationId: annotation.id })) {
        if (!normalized.overrideExclusionIds.includes(exclusion.id)) persistentExclusions.push(...exclusion.anchor.segments.map((segment) => ({ noteId: annotation.noteId, start: segment.start, end: segment.end, exclusionId: exclusion.id })));
      }
    }
    const allExclusions = [...persistentExclusions, ...normalized.onceExclusions];
    const segments = buildResolvedSegments(contributions, allExclusions, noteById, versionByNote);
    if (segments.length === 0) throw fail('ANALYSIS_SCOPE_EMPTY', '当前选择没有可分析内容', 400);
    for (const note of notes) {
      const projection = projectMarkdown(note.rawMarkdown);
      for (const unit of projection.units.filter((candidate) => candidate.atomic)) {
        if (segments.some((segment) => segment.noteId === note.id && segment.start < unit.sourceEnd && segment.end > unit.sourceStart)) omittedItems.push({ noteId: note.id, sourceStart: unit.sourceStart, sourceEnd: unit.sourceEnd, reason: 'imageUnreadable' });
      }
    }
    const result = {
      spaceId: normalized.spaceId, mode: normalized.mode,
      noteVersions: noteVersions.map(({ note, version }) => ({ noteId: note.id, noteVersionId: version.id, contentHash: version.contentHash, title: note.title })),
      selections: normalized.selections, segments, contextSegments: [], exclusions: allExclusions, omittedItems,
      annotationRevisions: annotations.map((annotation) => ({ annotationId: annotation.id, revision: annotation.revision })),
      summary: { noteCount: notes.length, segmentCount: segments.length, annotationCount: annotations.length },
      ai: { available: false, message: '提炼服务暂不可用' }
    };
    return { ...result, previewHash: calculateContentHash(stableStringify(result)) };
  }

  async function createAnalysisScope(input = {}) {
    const preview = await previewAnalysisScope(input);
    if (!input.previewHash || input.previewHash !== preview.previewHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '分析预览已过期，请刷新', 409);
    const idempotencyKey = String(input.idempotencyKey ?? '').trim();
    if (!idempotencyKey) throw fail('ANALYSIS_SCOPE_IDEMPOTENCY_REQUIRED', '分析范围幂等键不能为空', 400);
    const existing = await analysisScopeRepository.findByIdempotencyKey(preview.spaceId, idempotencyKey);
    if (existing) {
      if (existing.inputHash !== preview.previewHash) throw fail('ANALYSIS_SCOPE_IDEMPOTENCY_CONFLICT', '同一幂等键不能保存不同范围', 409);
      return existing;
    }
    const { previewHash, ai: _ai, ...snapshotData } = preview;
    return analysisScopeRepository.save({ id: newId('analysis-scope'), ...structuredClone(snapshotData), inputHash: previewHash, idempotencyKey, createdAt: new Date().toISOString() });
  }

  async function getAnalysisScope(id, spaceId) {
    const snapshot = await analysisScopeRepository.findById(id);
    if (!snapshot || (spaceId && snapshot.spaceId !== spaceId)) throw fail('ANALYSIS_SCOPE_NOT_FOUND', '分析范围快照不存在', 404);
    return snapshot;
  }

  return { previewAnnotation, createExclusion, deleteExclusion, getKnowledgeLinks, previewAnalysisScope, createAnalysisScope, getAnalysisScope };
}

function summarizeResolution(result) {
  return { status: result.status, reason: result.reason ?? null, quoteText: result.quoteText ?? null, candidates: result.candidates?.map((candidate) => ({ sourceStart: candidate.sourceStart, sourceEnd: candidate.sourceEnd })) ?? [] };
}
function sameAnchorRange(left, right) {
  if (!left || !right || left.sourceStart !== right.sourceStart || left.sourceEnd !== right.sourceEnd) return false;
  const leftSegments = Array.isArray(left.segments) ? left.segments : [];
  const rightSegments = Array.isArray(right.segments) ? right.segments : [];
  return leftSegments.length === rightSegments.length && leftSegments.every((segment, index) => (
    segment.start === rightSegments[index]?.start && segment.end === rightSegments[index]?.end
  ));
}

import crypto from 'node:crypto';
import { calculateContentHash, projectMarkdown, resolveAnchor } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../errors/app-error.js';

const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export function createAnnotationScopeService({
  annotationService,
  annotationRepository,
  exclusionRepository,
  analysisScopeRepository,
  noteRepository,
  noteVersionRepository,
  evidenceRepository,
  knowledgeItemRepository
}) {
  function requireAnnotation(id) {
    const annotation = annotationRepository.findById(id);
    if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404);
    return annotation;
  }
  function requireNote(id) {
    const note = noteRepository.findById(id);
    if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404);
    return note;
  }
  function requireVersion(note) {
    const hash = calculateContentHash(note.rawMarkdown);
    const version = noteVersionRepository.findByNoteIdAndContentHash(note.id, hash);
    if (!version) throw fail('ANNOTATION_VERSION_NOT_FOUND', '当前笔记版本尚未保存', 409);
    return version;
  }

  function previewAnnotation(id) {
    const annotation = requireAnnotation(id);
    const note = requireNote(annotation.noteId);
    const resolution = annotation.schemaVersion === 2 && annotation.anchor
      ? resolveAnchor(note.rawMarkdown, annotation.anchor)
      : { status: 'needsReview', reason: 'legacyUnverified' };
    return {
      annotation,
      currentContentHash: calculateContentHash(note.rawMarkdown),
      resolution: summarizeResolution(resolution),
      exclusions: exclusionRepository.list({ parentAnnotationId: id, includeDeleted: true })
    };
  }

  function createExclusion(annotationId, input = {}) {
    const annotation = requireAnnotation(annotationId);
    if (annotation.scopeType !== 'section') throw fail('ANNOTATION_EXCLUSION_CONFLICT', '只有标题范围重点可以保存局部排除', 409);
    if (annotation.lifecycleStatus === 'archived') throw fail('ANNOTATION_EXCLUSION_CONFLICT', '已取消的重点不能新增排除', 409);
    const note = requireNote(annotation.noteId);
    if (calculateContentHash(note.rawMarkdown) !== input.noteContentHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请刷新范围', 409);
    const resolved = resolveAnchor(note.rawMarkdown, input.anchor);
    if (resolved.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '无法确认排除范围', 409);
    const parentStart = annotation.anchor?.sourceStart;
    const parentEnd = annotation.anchor?.sourceEnd;
    if (!Number.isInteger(parentStart) || !Number.isInteger(parentEnd)
      || input.anchor.sourceStart < parentStart || input.anchor.sourceEnd > parentEnd) {
      throw fail('ANNOTATION_EXCLUSION_CONFLICT', '排除范围必须位于标题重点内', 409);
    }
    const version = requireVersion(note);
    const existing = exclusionRepository.list({ parentAnnotationId: annotation.id })
      .find((item) => item.noteVersionId === version.id && sameAnchorRange(item.anchor, input.anchor));
    if (existing) return { annotation, exclusion: existing };
    const exclusion = exclusionRepository.save({
      id: newId('annotation-exclusion'),
      parentAnnotationId: annotation.id,
      noteVersionId: version.id,
      anchor: { ...structuredClone(input.anchor), noteVersionId: version.id },
      status: 'active',
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const updatedAnnotation = annotationService.advanceRevision(annotation.id, {
      expectedRevision: input.expectedRevision,
      operation: 'exclusionAdded'
    });
    return { annotation: updatedAnnotation, exclusion };
  }

  function deleteExclusion(annotationId, exclusionId, input = {}) {
    const annotation = requireAnnotation(annotationId);
    const exclusion = exclusionRepository.findById(exclusionId);
    if (!exclusion || exclusion.parentAnnotationId !== annotation.id) throw fail('ANNOTATION_EXCLUSION_NOT_FOUND', '排除项不存在', 404);
    const archived = exclusionRepository.save({
      ...exclusion,
      status: 'archived',
      revision: Number(exclusion.revision ?? 1) + 1,
      updatedAt: new Date().toISOString()
    });
    const updatedAnnotation = annotationService.advanceRevision(annotation.id, {
      expectedRevision: input.expectedRevision,
      operation: 'exclusionRemoved'
    });
    return { annotation: updatedAnnotation, exclusion: archived };
  }

  function getKnowledgeLinks(annotationId) {
    requireAnnotation(annotationId);
    const evidence = evidenceRepository.list({ annotationId });
    const links = evidence.map((item) => ({
      evidence: item,
      knowledgeItem: knowledgeItemRepository.findById(item.knowledgeItemId)
    })).filter((item) => item.knowledgeItem);
    return {
      annotationId,
      candidates: links.filter((item) => item.knowledgeItem.reviewStatus === 'candidate'),
      confirmed: links.filter((item) => item.knowledgeItem.reviewStatus === 'confirmed'),
      evidenceStatus: links.map((item) => ({ id: item.evidence.id, status: item.evidence.status }))
    };
  }

  function previewAnalysisScope(input = {}) {
    const normalized = normalizeScopeInput(input);
    const annotations = normalized.annotationIds.map(requireAnnotation);
    const noteIds = new Set(normalized.noteIds);
    annotations.forEach((annotation) => noteIds.add(annotation.noteId));
    normalized.selections.forEach((selection) => noteIds.add(selection.noteId));
    if (noteIds.size === 0) throw fail('ANALYSIS_SCOPE_EMPTY', '请选择至少一篇笔记或一个重点范围', 400);

    const notes = [...noteIds].map(requireNote);
    if (notes.some((note) => note.spaceId !== normalized.spaceId)) throw fail('ANNOTATION_SPACE_MISMATCH', '分析范围包含其他知识空间', 409);
    const noteVersions = notes.map((note) => ({ note, version: requireVersion(note) }));
    const versionByNote = new Map(noteVersions.map((item) => [item.note.id, item.version]));
    const noteById = new Map(notes.map((note) => [note.id, note]));
    const omittedItems = [];
    const contributions = [];

    if (normalized.mode === 'all') {
      for (const note of notes) {
        if (note.rawMarkdown.length > 0) contributions.push({ noteId: note.id, start: 0, end: note.rawMarkdown.length, annotationId: null });
      }
    } else {
      for (const annotation of annotations) {
        if (annotation.lifecycleStatus === 'archived') continue;
        if (annotation.schemaVersion !== 2 || !annotation.anchor) {
          omittedItems.push({ annotationId: annotation.id, reason: 'legacyUnverified' });
          continue;
        }
        const note = noteById.get(annotation.noteId);
        const resolution = resolveAnchor(note.rawMarkdown, annotation.anchor);
        if (resolution.status !== 'resolved') {
          omittedItems.push({ annotationId: annotation.id, reason: resolution.reason });
          continue;
        }
        for (const segment of annotation.anchor.segments) contributions.push({ noteId: note.id, start: segment.start, end: segment.end, annotationId: annotation.id });
      }
    }

    for (const selection of normalized.selections) {
      const note = noteById.get(selection.noteId);
      if (!note) continue;
      const resolution = resolveAnchor(note.rawMarkdown, selection.anchor);
      if (resolution.status !== 'resolved') throw fail('ANNOTATION_ANCHOR_UNRESOLVED', '临时分析范围无法确认', 409);
      for (const segment of selection.anchor.segments) contributions.push({ noteId: note.id, start: segment.start, end: segment.end, annotationId: null });
    }

    const persistentExclusions = [];
    for (const annotation of annotations.filter((item) => item.scopeType === 'section')) {
      for (const exclusion of exclusionRepository.list({ parentAnnotationId: annotation.id })) {
        if (normalized.overrideExclusionIds.includes(exclusion.id)) continue;
        persistentExclusions.push(...exclusion.anchor.segments.map((segment) => ({ noteId: annotation.noteId, start: segment.start, end: segment.end, exclusionId: exclusion.id })));
      }
    }
    const allExclusions = [...persistentExclusions, ...normalized.onceExclusions];
    const segments = buildResolvedSegments(contributions, allExclusions, noteById, versionByNote);
    if (segments.length === 0) throw fail('ANALYSIS_SCOPE_EMPTY', '当前选择没有可分析内容', 400);

    for (const { note } of noteVersions) {
      const projection = projectMarkdown(note.rawMarkdown);
      for (const unit of projection.units.filter((candidate) => candidate.atomic)) {
        if (segments.some((segment) => segment.noteId === note.id && segment.start < unit.sourceEnd && segment.end > unit.sourceStart)) {
          omittedItems.push({ noteId: note.id, sourceStart: unit.sourceStart, sourceEnd: unit.sourceEnd, reason: 'imageUnreadable' });
        }
      }
    }

    const result = {
      spaceId: normalized.spaceId,
      mode: normalized.mode,
      noteVersions: noteVersions.map(({ note, version }) => ({ noteId: note.id, noteVersionId: version.id, contentHash: version.contentHash, title: note.title })),
      selections: normalized.selections,
      segments,
      contextSegments: [],
      exclusions: allExclusions,
      omittedItems,
      annotationRevisions: annotations.map((annotation) => ({ annotationId: annotation.id, revision: annotation.revision })),
      summary: { noteCount: notes.length, segmentCount: segments.length, annotationCount: annotations.length },
      ai: { available: false, message: '提炼服务暂不可用' }
    };
    return { ...result, previewHash: calculateContentHash(stableStringify(result)) };
  }

  function createAnalysisScope(input = {}) {
    const preview = previewAnalysisScope(input);
    if (!input.previewHash || input.previewHash !== preview.previewHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '分析预览已过期，请刷新', 409);
    const idempotencyKey = String(input.idempotencyKey ?? '').trim();
    if (!idempotencyKey) throw fail('ANALYSIS_SCOPE_IDEMPOTENCY_REQUIRED', '分析范围幂等键不能为空', 400);
    const existing = analysisScopeRepository.findByIdempotencyKey(preview.spaceId, idempotencyKey);
    if (existing) {
      if (existing.inputHash !== preview.previewHash) throw fail('ANALYSIS_SCOPE_IDEMPOTENCY_CONFLICT', '同一幂等键不能保存不同范围', 409);
      return existing;
    }
    const { previewHash, ai: _ai, ...snapshotData } = preview;
    return analysisScopeRepository.save({
      id: newId('analysis-scope'),
      ...structuredClone(snapshotData),
      inputHash: previewHash,
      idempotencyKey,
      createdAt: new Date().toISOString()
    });
  }

  function getAnalysisScope(id, spaceId) {
    const snapshot = analysisScopeRepository.findById(id);
    if (!snapshot || (spaceId && snapshot.spaceId !== spaceId)) throw fail('ANALYSIS_SCOPE_NOT_FOUND', '分析范围快照不存在', 404);
    return snapshot;
  }

  return { previewAnnotation, createExclusion, deleteExclusion, getKnowledgeLinks, previewAnalysisScope, createAnalysisScope, getAnalysisScope };
}

export function normalizeScopeInput(input) {
  const spaceId = String(input.spaceId ?? '').trim();
  if (!spaceId) throw fail('ANALYSIS_SCOPE_SPACE_REQUIRED', '知识空间不能为空', 400);
  const mode = input.mode === 'all' ? 'all' : 'marked';
  return {
    spaceId,
    mode,
    noteIds: uniqueStrings(input.noteIds),
    annotationIds: uniqueStrings(input.annotationIds),
    overrideExclusionIds: uniqueStrings(input.overrideExclusionIds),
    selections: Array.isArray(input.selections) ? input.selections.filter((item) => item?.noteId && item?.anchor) : [],
    onceExclusions: Array.isArray(input.onceExclusions) ? input.onceExclusions.filter(validInterval) : []
  };
}

export function buildResolvedSegments(contributions, exclusions, noteById, versionByNote) {
  const output = [];
  for (const noteId of new Set(contributions.map((item) => item.noteId))) {
    const noteContributions = contributions.filter((item) => item.noteId === noteId && validInterval(item));
    const boundaries = [...new Set(noteContributions.flatMap((item) => [item.start, item.end]).concat(
      exclusions.filter((item) => item.noteId === noteId).flatMap((item) => [item.start, item.end])
    ))].sort((left, right) => left - right);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (start === end) continue;
      const covering = noteContributions.filter((item) => item.start < end && item.end > start);
      if (covering.length === 0 || exclusions.some((item) => item.noteId === noteId && item.start < end && item.end > start)) continue;
      const annotationIds = [...new Set(covering.map((item) => item.annotationId).filter(Boolean))].sort();
      const previous = output.at(-1);
      if (previous && previous.noteId === noteId && previous.end === start && arraysEqual(previous.annotationIds, annotationIds)) {
        previous.end = end;
        previous.markdown += noteById.get(noteId).rawMarkdown.slice(start, end);
      } else {
        output.push({ noteId, noteVersionId: versionByNote.get(noteId).id, start, end, markdown: noteById.get(noteId).rawMarkdown.slice(start, end), annotationIds });
      }
    }
  }
  return output;
}

function summarizeResolution(result) {
  return { status: result.status, reason: result.reason ?? null, quoteText: result.quoteText ?? null, candidates: result.candidates?.map((candidate) => ({ sourceStart: candidate.sourceStart, sourceEnd: candidate.sourceEnd })) ?? [] };
}
function validInterval(item) { return item && Number.isInteger(item.start) && Number.isInteger(item.end) && item.start >= 0 && item.start < item.end; }
function uniqueStrings(value) { return Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))] : []; }
function arraysEqual(left, right) { return left.length === right.length && left.every((item, index) => item === right[index]); }
function sameAnchorRange(left, right) {
  if (!left || !right || left.sourceStart !== right.sourceStart || left.sourceEnd !== right.sourceEnd) return false;
  const leftSegments = Array.isArray(left.segments) ? left.segments : [];
  const rightSegments = Array.isArray(right.segments) ? right.segments : [];
  return leftSegments.length === rightSegments.length && leftSegments.every((segment, index) => (
    segment.start === rightSegments[index]?.start && segment.end === rightSegments[index]?.end
  ));
}
export function stableStringify(value) { return JSON.stringify(sortObject(value)); }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

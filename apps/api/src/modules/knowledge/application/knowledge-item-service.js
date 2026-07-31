import { KnowledgeItem } from '../domain/knowledge-item.js';
import { KnowledgeEvidence } from '../domain/knowledge-evidence.js';
import {
  buildCreateKnowledgeEvidenceDto,
  buildCreateKnowledgeItemDto,
  buildUpdateKnowledgeItemDto
} from './dto/knowledge-item.dto.js';
import { assertKnowledgeItemConfirmable } from './formal-asset-validation.js';
import { conflictError, notFoundError, validationError } from './knowledge-errors.js';

const now = () => new Date().toISOString();

export function createKnowledgeItemService({
  repository,
  evidenceRepository,
  noteVersionRepository,
  annotationRepository,
  noteRepository,
  onItemInvalidated = null,
  runTransaction = (operation) => operation()
} = {}) {
  if (!repository || !evidenceRepository) throw new TypeError('KnowledgeItem repositories are required');

  function requireItem(id) {
    const item = repository.findById(id);
    if (!item || item.deletedAt) throw notFoundError('KNOWLEDGE_ITEM_NOT_FOUND', 'KnowledgeItem not found');
    return item;
  }

  function assertItemIdAvailable(id) {
    if (repository.findById(id)) {
      throw conflictError(
        'KNOWLEDGE_ITEM_ID_CONFLICT',
        'A KnowledgeItem with the same id already exists'
      );
    }
  }

  function assertEvidenceIdAvailable(id) {
    if (evidenceRepository.findById(id)) {
      throw conflictError(
        'KNOWLEDGE_EVIDENCE_ID_CONFLICT',
        'KnowledgeEvidence with the same id already exists'
      );
    }
  }

  function saveNew(targetRepository, record) {
    return targetRepository.create?.(record) ?? targetRepository.save(record);
  }

  function notifyIfInvalidated(previous, next) {
    if (
      previous?.reviewStatus === 'confirmed'
      && next?.reviewStatus !== 'confirmed'
    ) {
      onItemInvalidated?.(next.id);
    }
  }

  function resolveEvidence(input, knowledgeItemId) {
    const dto = buildCreateKnowledgeEvidenceDto(input);
    assertEvidenceIdAvailable(dto.id);
    let noteId = dto.noteId;
    let noteVersionId = dto.noteVersionId;
    let annotationId = dto.annotationId;
    let annotation = null;
    let version = null;
    let status = 'valid';
    if (dto.sourceType === 'noteVersion') {
      version = noteVersionRepository?.findById(noteVersionId);
      if (!version) throw notFoundError('NOTE_VERSION_NOT_FOUND', 'NoteVersion not found');
      if (noteId && noteId !== version.noteId) throw conflictError('KNOWLEDGE_EVIDENCE_NOTE_MISMATCH', 'Evidence note does not match NoteVersion');
      noteId = version.noteId;
    }
    if (dto.sourceType === 'annotation') {
      annotation = annotationRepository?.findById(annotationId);
      if (!annotation) throw notFoundError('ANNOTATION_NOT_FOUND', 'Annotation not found');
      if (noteId && noteId !== annotation.noteId) throw conflictError('KNOWLEDGE_EVIDENCE_NOTE_MISMATCH', 'Evidence note does not match annotation');
      noteId = annotation.noteId;
      noteVersionId = annotation.noteVersionId ?? noteVersionId;
      if (!noteVersionId) throw validationError('KNOWLEDGE_EVIDENCE_VERSION_REQUIRED', 'Annotation evidence requires a NoteVersion-bound annotation');
      version = noteVersionRepository?.findById(noteVersionId);
      if (!version) throw notFoundError('NOTE_VERSION_NOT_FOUND', 'NoteVersion not found');
      if (version.noteId !== noteId) {
        throw conflictError(
          'KNOWLEDGE_EVIDENCE_NOTE_MISMATCH',
          'Annotation and NoteVersion must reference the same note'
        );
      }
      if (annotation.status === 'archived') status = 'invalid';
      else if (annotation.status && annotation.status !== 'active') status = 'stale';
    }
    if (noteId && noteRepository) {
      const note = noteRepository.findById(noteId);
      if (!note) throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
      if (note.deleted) status = 'invalid';
      else if (version && version.content !== note.rawMarkdown && status !== 'invalid') {
        status = 'stale';
      }
    }
    return new KnowledgeEvidence({
      ...dto,
      id: dto.id,
      knowledgeItemId,
      noteId,
      noteVersionId,
      annotationId,
      sourceId: dto.sourceId ?? annotationId ?? noteVersionId,
      status,
      createdAt: now(),
      updatedAt: now()
    });
  }

  function createCandidate(input = {}) {
    const dto = buildCreateKnowledgeItemDto(input);
    assertItemIdAvailable(dto.id);
    const evidenceInputs = Array.isArray(input.evidence) ? input.evidence : [];
    if (dto.sourceMode !== 'manual' && evidenceInputs.length === 0) {
      throw validationError('KNOWLEDGE_EVIDENCE_REQUIRED', 'A non-manual KnowledgeItem candidate requires evidence');
    }
    const created = runTransaction(() => {
      const item = saveNew(repository, new KnowledgeItem({ ...dto, id: dto.id }));
      const evidence = evidenceInputs.map((evidenceInput) => saveNew(
        evidenceRepository,
        resolveEvidence(evidenceInput, item.id)
      ));
      return { item, evidence };
    });
    return created;
  }

  function listEvidence(knowledgeItemId) {
    requireItem(knowledgeItemId);
    return evidenceRepository.list({ knowledgeItemId });
  }

  function updateItem(id, input) {
    const current = requireItem(id);
    const dto = buildUpdateKnowledgeItemDto(input);
    const textChanged = ['title', 'canonicalStatement', 'userExplanation'].some((field) => Object.hasOwn(dto, field) && dto[field] !== current[field]);
    const nextStatus = current.reviewStatus === 'confirmed' && textChanged
      ? 'needsRevision'
      : current.reviewStatus;
    return runTransaction(() => {
      const next = repository.save(new KnowledgeItem({
        ...current,
        ...dto,
        reviewStatus: nextStatus,
        updatedAt: now()
      }));
      notifyIfInvalidated(current, next);
      return next;
    });
  }

  function confirmItem(id) {
    const item = requireItem(id);
    const evidence = evidenceRepository.list({ knowledgeItemId: id });
    assertKnowledgeItemConfirmable(item, evidence);
    return repository.save(new KnowledgeItem({ ...item, reviewStatus: 'confirmed', updatedAt: now() }));
  }

  function markNeedsRevision(id) {
    const current = requireItem(id);
    return runTransaction(() => {
      const next = repository.save(new KnowledgeItem({ ...current, reviewStatus: 'needsRevision', updatedAt: now() }));
      notifyIfInvalidated(current, next);
      return next;
    });
  }

  function archive(id) {
    const current = requireItem(id);
    return runTransaction(() => {
      const next = repository.save(new KnowledgeItem({ ...current, reviewStatus: 'archived', updatedAt: now() }));
      notifyIfInvalidated(current, next);
      return next;
    });
  }

  function restore(id) {
    const current = requireItem(id);
    if (current.reviewStatus !== 'archived') return current;
    return repository.save(new KnowledgeItem({ ...current, reviewStatus: 'candidate', updatedAt: now() }));
  }

  return {
    createCandidate,
    getItem: requireItem,
    listItems(options = {}) {
      const items = repository.list(options);
      if (!options.noteId) return items;
      const evidenceByItem = new Map();
      for (const evidence of evidenceRepository.list({ noteId: options.noteId })) {
        const records = evidenceByItem.get(evidence.knowledgeItemId) ?? [];
        records.push(evidence);
        evidenceByItem.set(evidence.knowledgeItemId, records);
      }
      return items
        .filter((item) => evidenceByItem.has(item.id))
        .map((item) => {
          const evidence = evidenceByItem.get(item.id);
          return {
            ...item,
            evidenceStatus: summarizeEvidenceStatus(evidence.map((record) => record.status)),
            evidenceSummary: evidence.map(toEvidenceSummary)
          };
        });
    },
    updateItem,
    confirmItem,
    markNeedsRevision,
    archive,
    restore,
    listEvidence,
    createEvidence(input) {
      const item = requireItem(input.knowledgeItemId);
      return runTransaction(() => saveNew(evidenceRepository, resolveEvidence(input, item.id)));
    },
    markEvidenceByNoteId(noteId, status = 'invalid') {
      return markEvidenceAndReconcile(() => evidenceRepository.markByNoteId(noteId, status));
    },
    markEvidenceByAnnotationId(annotationId, status = 'invalid') {
      return markEvidenceAndReconcile(() => evidenceRepository.markByAnnotationId(annotationId, status));
    },
    markEvidenceByNoteVersionId(noteVersionId, status = 'stale') {
      return markEvidenceAndReconcile(() => evidenceRepository.markByNoteVersionId(noteVersionId, status));
    }
  };

  function markEvidenceAndReconcile(markEvidence) {
    return runTransaction(() => {
      const changed = markEvidence();
      for (const knowledgeItemId of new Set(changed.map((record) => record.knowledgeItemId))) {
        const current = repository.findById(knowledgeItemId);
        if (
          !current
          || current.reviewStatus !== 'confirmed'
          || current.sourceMode === 'manual'
        ) {
          continue;
        }
        const evidence = evidenceRepository.list({ knowledgeItemId });
        if (evidence.some((record) => record.status === 'valid')) continue;
        const next = repository.save(new KnowledgeItem({
          ...current,
          reviewStatus: 'needsRevision',
          updatedAt: now()
        }));
        notifyIfInvalidated(current, next);
      }
      return changed;
    });
  }
}

function summarizeEvidenceStatus(statuses = []) {
  if (statuses.includes('invalid')) return 'invalid';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('insufficient')) return 'insufficient';
  return statuses.length ? 'valid' : 'insufficient';
}

function toEvidenceSummary(evidence) {
  return {
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    noteVersionId: evidence.noteVersionId,
    annotationId: evidence.annotationId,
    quoteText: evidence.quoteText,
    status: evidence.status
  };
}

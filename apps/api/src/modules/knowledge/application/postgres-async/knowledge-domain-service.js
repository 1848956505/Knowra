import { KnowledgeItem } from '../../domain/knowledge-item.js';
import { KnowledgeEvidence } from '../../domain/knowledge-evidence.js';
import {
  buildCreateKnowledgeEvidenceDto,
  buildCreateKnowledgeItemDto,
  buildUpdateKnowledgeItemDto
} from '../dto/knowledge-item.dto.js';
import { assertKnowledgeItemConfirmable } from '../formal-asset-validation.js';
import { conflictError, notFoundError, validationError } from '../knowledge-errors.js';

const now = () => new Date().toISOString();

export function createAsyncKnowledgeItemService({
  repository,
  evidenceRepository,
  noteVersionRepository,
  annotationRepository,
  noteRepository,
  onItemInvalidated = null,
  runTransaction = (operation) => operation()
} = {}) {
  if (!repository || !evidenceRepository) throw new TypeError('Async KnowledgeItem repositories are required');

  async function requireItem(id) {
    const item = await repository.findById(id);
    if (!item || item.deletedAt) throw notFoundError('KNOWLEDGE_ITEM_NOT_FOUND', 'KnowledgeItem not found');
    return item;
  }

  async function assertItemIdAvailable(id) {
    if (await repository.findById(id)) {
      throw conflictError(
        'KNOWLEDGE_ITEM_ID_CONFLICT',
        'A KnowledgeItem with the same id already exists'
      );
    }
  }

  async function saveNew(targetRepository, record) {
    return targetRepository.create
      ? targetRepository.create(record)
      : targetRepository.save(record);
  }

  async function notifyIfInvalidated(previous, next) {
    if (
      previous?.reviewStatus === 'confirmed'
      && next?.reviewStatus !== 'confirmed'
    ) {
      await onItemInvalidated?.(next.id);
    }
  }

  async function resolveEvidence(input, knowledgeItemId, {
    evidenceRepository: sourceEvidenceRepository = evidenceRepository,
    noteVersionRepository: sourceVersionRepository = noteVersionRepository,
    annotationRepository: sourceAnnotationRepository = annotationRepository,
    noteRepository: sourceNoteRepository = noteRepository
  } = {}) {
    const dto = buildCreateKnowledgeEvidenceDto(input);
    if (await sourceEvidenceRepository.findById(dto.id)) {
      throw conflictError(
        'KNOWLEDGE_EVIDENCE_ID_CONFLICT',
        'KnowledgeEvidence with the same id already exists'
      );
    }
    let noteId = dto.noteId;
    let noteVersionId = dto.noteVersionId;
    const annotationId = dto.annotationId;
    let annotation = null;
    let version = null;
    let status = 'valid';
    if (dto.sourceType === 'noteVersion') {
      version = await sourceVersionRepository?.findById(noteVersionId);
      if (!version) throw notFoundError('NOTE_VERSION_NOT_FOUND', 'NoteVersion not found');
      if (noteId && noteId !== version.noteId) throw conflictError('KNOWLEDGE_EVIDENCE_NOTE_MISMATCH', 'Evidence note does not match NoteVersion');
      noteId = version.noteId;
    }
    if (dto.sourceType === 'annotation') {
      annotation = await sourceAnnotationRepository?.findById(annotationId);
      if (!annotation) throw notFoundError('ANNOTATION_NOT_FOUND', 'Annotation not found');
      if (noteId && noteId !== annotation.noteId) throw conflictError('KNOWLEDGE_EVIDENCE_NOTE_MISMATCH', 'Evidence note does not match annotation');
      noteId = annotation.noteId;
      noteVersionId = annotation.noteVersionId ?? noteVersionId;
      if (!noteVersionId) throw validationError('KNOWLEDGE_EVIDENCE_VERSION_REQUIRED', 'Annotation evidence requires a NoteVersion-bound annotation');
      version = await sourceVersionRepository?.findById(noteVersionId);
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
    if (noteId && sourceNoteRepository) {
      const note = await sourceNoteRepository.findById(noteId);
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

  async function createCandidate(input = {}) {
    const dto = buildCreateKnowledgeItemDto(input);
    await assertItemIdAvailable(dto.id);
    const evidenceInputs = Array.isArray(input.evidence) ? input.evidence : [];
    if (dto.sourceMode !== 'manual' && evidenceInputs.length === 0) {
      throw validationError('KNOWLEDGE_EVIDENCE_REQUIRED', 'A non-manual KnowledgeItem candidate requires evidence');
    }
    return runTransaction(async ({
      itemRepository = repository,
      evidenceRepository: transactionEvidenceRepository = evidenceRepository,
      noteVersionRepository: sourceVersionRepository = noteVersionRepository,
      annotationRepository: sourceAnnotationRepository = annotationRepository,
      noteRepository: sourceNoteRepository = noteRepository
    } = {}) => {
      const item = await saveNew(itemRepository, new KnowledgeItem({ ...dto, id: dto.id }));
      const evidence = [];
      for (const evidenceInput of evidenceInputs) {
        const resolved = await resolveEvidence(evidenceInput, item.id, {
          evidenceRepository: transactionEvidenceRepository,
          noteVersionRepository: sourceVersionRepository,
          annotationRepository: sourceAnnotationRepository,
          noteRepository: sourceNoteRepository
        });
        evidence.push(await saveNew(transactionEvidenceRepository, resolved));
      }
      return { item, evidence };
    });
  }

  async function updateItem(id, input) {
    const current = await requireItem(id);
    const dto = buildUpdateKnowledgeItemDto(input);
    const textChanged = ['title', 'canonicalStatement', 'userExplanation'].some((field) => Object.hasOwn(dto, field) && dto[field] !== current[field]);
    const next = await repository.save(new KnowledgeItem({
      ...current,
      ...dto,
      reviewStatus: current.reviewStatus === 'confirmed' && textChanged ? 'needsRevision' : current.reviewStatus,
      updatedAt: now()
    }));
    await notifyIfInvalidated(current, next);
    return next;
  }

  async function confirmItem(id) {
    const item = await requireItem(id);
    const evidence = await evidenceRepository.list({ knowledgeItemId: id });
    assertKnowledgeItemConfirmable(item, evidence);
    return repository.save(new KnowledgeItem({ ...item, reviewStatus: 'confirmed', updatedAt: now() }));
  }

  return {
    createCandidate,
    getItem: requireItem,
    async listItems(options = {}) {
      const items = await repository.list(options);
      if (!options.noteId) return items;
      const evidenceByItem = new Map();
      for (const evidence of await evidenceRepository.list({ noteId: options.noteId })) {
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
    async markNeedsRevision(id) {
      const current = await requireItem(id);
      const next = await repository.save(new KnowledgeItem({ ...current, reviewStatus: 'needsRevision', updatedAt: now() }));
      await notifyIfInvalidated(current, next);
      return next;
    },
    async archive(id) {
      const current = await requireItem(id);
      const next = await repository.save(new KnowledgeItem({ ...current, reviewStatus: 'archived', updatedAt: now() }));
      await notifyIfInvalidated(current, next);
      return next;
    },
    async restore(id) {
      const item = await requireItem(id);
      if (item.reviewStatus !== 'archived') return item;
      return repository.save(new KnowledgeItem({ ...item, reviewStatus: 'candidate', updatedAt: now() }));
    },
    async listEvidence(id) { await requireItem(id); return evidenceRepository.list({ knowledgeItemId: id }); },
    async createEvidence(input) {
      const item = await requireItem(input.knowledgeItemId);
      return runTransaction(async ({
        evidenceRepository: transactionEvidenceRepository = evidenceRepository,
        noteVersionRepository: sourceVersionRepository = noteVersionRepository,
        annotationRepository: sourceAnnotationRepository = annotationRepository,
        noteRepository: sourceNoteRepository = noteRepository
      } = {}) => saveNew(transactionEvidenceRepository, await resolveEvidence(input, item.id, {
        evidenceRepository: transactionEvidenceRepository,
        noteVersionRepository: sourceVersionRepository,
        annotationRepository: sourceAnnotationRepository,
        noteRepository: sourceNoteRepository
      })));
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

  async function markEvidenceAndReconcile(markEvidence) {
    const changed = await markEvidence();
    for (const knowledgeItemId of new Set(changed.map((record) => record.knowledgeItemId))) {
      const current = await repository.findById(knowledgeItemId);
      if (
        !current
        || current.reviewStatus !== 'confirmed'
        || current.sourceMode === 'manual'
      ) {
        continue;
      }
      const evidence = await evidenceRepository.list({ knowledgeItemId });
      if (evidence.some((record) => record.status === 'valid')) continue;
      const next = await repository.save(new KnowledgeItem({
        ...current,
        reviewStatus: 'needsRevision',
        updatedAt: now()
      }));
      await notifyIfInvalidated(current, next);
    }
    return changed;
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

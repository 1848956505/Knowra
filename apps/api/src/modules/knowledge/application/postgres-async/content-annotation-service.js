import crypto from 'node:crypto';
import { createAppError } from '../../../../errors/app-error.js';
import { ContentAnnotation } from '../../domain/content-annotation.js';
import {
  buildCreateContentAnnotationDto,
  buildUpdateAnnotationAnchorDto
} from '../dto/content-annotation-dto.js';

const contentHash = (markdown) => crypto.createHash('sha256')
  .update(String(markdown ?? '')).digest('hex');
const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);

export function createAsyncContentAnnotationService({ repository, noteRepository, noteVersionRepository, onAnnotationArchived = null } = {}) {
  if (!repository || !noteRepository) {
    throw new TypeError('Async annotation service requires annotation and note repositories');
  }

  async function requireAnnotation(id) {
    const annotation = await repository.findById(id);
    if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404);
    return annotation;
  }

  async function assertCurrentNote(dto) {
    const note = await noteRepository.findById(dto.noteId);
    if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404);
    if (note.spaceId !== dto.spaceId) throw fail('ANNOTATION_SPACE_MISMATCH', '标注空间与笔记不一致', 409);
    if (contentHash(note.rawMarkdown) !== dto.noteContentHash) {
      throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请重新选择标注范围', 409);
    }
    return note;
  }

  async function saveUpdated(annotation, changes) {
    const updated = await repository.save(new ContentAnnotation({
      ...annotation,
      ...changes,
      updatedAt: new Date().toISOString()
    }));
    if (updated.status === 'archived') await onAnnotationArchived?.(updated.id);
    return updated;
  }

  return {
    async createAnnotation(input) {
      const dto = buildCreateContentAnnotationDto(input);
      const idempotent = await repository.findByIdempotencyKey(dto.noteId, dto.idempotencyKey);
      if (idempotent) return idempotent;
      await assertCurrentNote(dto);
      if (await repository.findDuplicate(dto)) {
        throw fail('ANNOTATION_DUPLICATE', '该选区已经标记为重要内容', 409);
      }
      const version = await noteVersionRepository?.findByNoteIdAndContentHash(dto.noteId, dto.noteContentHash);
      return repository.save(new ContentAnnotation({
        ...dto,
        noteVersionId: version?.id ?? null,
        id: `annotation-${crypto.randomUUID()}`
      }));
    },
    listAnnotationsByNote(options) { return repository.list(options); },
    getAnnotation: requireAnnotation,
    async archiveAnnotation(id) {
      return saveUpdated(await requireAnnotation(id), {
        status: 'archived',
        deletedAt: new Date().toISOString()
      });
    },
    async restoreAnnotation(id) {
      return saveUpdated(await requireAnnotation(id), { status: 'active', deletedAt: null });
    },
    async updateAnnotationAnchor(id, input) {
      const annotation = await requireAnnotation(id);
      const dto = buildUpdateAnnotationAnchorDto(input);
      await assertCurrentNote({ ...annotation, ...dto });
      const version = await noteVersionRepository?.findByNoteIdAndContentHash(annotation.noteId, dto.noteContentHash);
      return saveUpdated(annotation, { ...dto, noteVersionId: version?.id ?? null, status: 'active', deletedAt: null });
    },
    async markAnnotationStale(id) {
      const annotation = await requireAnnotation(id);
      return annotation.status === 'archived'
        ? annotation
        : saveUpdated(annotation, { status: 'stale' });
    },
    markStaleForNote(noteId, currentContentHash) {
      return repository.markStaleByNoteId?.(noteId, currentContentHash) ?? Promise.resolve([]);
    }
  };
}

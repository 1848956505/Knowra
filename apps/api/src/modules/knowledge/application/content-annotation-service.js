import crypto from 'node:crypto';
import { createAppError } from '../../../errors/app-error.js';
import { ContentAnnotation } from '../domain/content-annotation.js';
import { buildCreateContentAnnotationDto, buildUpdateAnnotationAnchorDto } from './dto/content-annotation-dto.js';
import { createInMemoryContentAnnotationRepository } from '../infrastructure/content-annotation-repository.js';

const contentHash = (markdown) => crypto.createHash('sha256').update(String(markdown ?? '')).digest('hex');
const fail = (code, message, statusCode = 400) => createAppError(code, message, statusCode);

export function createContentAnnotationService({ repository = createInMemoryContentAnnotationRepository(), noteRepository } = {}) {
  function requireAnnotation(id) { const annotation = repository.findById(id); if (!annotation) throw fail('ANNOTATION_NOT_FOUND', '标注不存在', 404); return annotation; }
  function assertCurrentNote(dto) { const note = noteRepository?.findById(dto.noteId); if (!note || note.deleted) throw fail('ANNOTATION_NOTE_NOT_FOUND', '笔记不存在', 404); if (note.spaceId !== dto.spaceId) throw fail('ANNOTATION_SPACE_MISMATCH', '标注空间与笔记不一致', 409); if (contentHash(note.rawMarkdown) !== dto.noteContentHash) throw fail('ANNOTATION_CONTENT_CONFLICT', '笔记内容已变化，请重新选择标注范围', 409); }
  function nextId() { return `annotation-${crypto.randomUUID()}`; }
  function saveUpdated(annotation, changes) { return repository.save(new ContentAnnotation({ ...annotation, ...changes, updatedAt: new Date().toISOString() })); }
  return {
    createAnnotation(input) { const dto = buildCreateContentAnnotationDto(input); const idempotent = repository.findByIdempotencyKey(dto.noteId, dto.idempotencyKey); if (idempotent) return idempotent; assertCurrentNote(dto); if (repository.findDuplicate(dto)) throw fail('ANNOTATION_DUPLICATE', '该选区已经标记为重要内容', 409); return repository.save(new ContentAnnotation({ ...dto, id: nextId() })); },
    listAnnotationsByNote(options) { return repository.list(options); },
    getAnnotation(id) { return requireAnnotation(id); },
    archiveAnnotation(id) { const annotation = requireAnnotation(id); return saveUpdated(annotation, { status: 'archived', deletedAt: new Date().toISOString() }); },
    restoreAnnotation(id) { const annotation = requireAnnotation(id); return saveUpdated(annotation, { status: 'active', deletedAt: null }); },
    updateAnnotationAnchor(id, input) { const annotation = requireAnnotation(id); const dto = buildUpdateAnnotationAnchorDto(input); assertCurrentNote({ ...annotation, ...dto }); return saveUpdated(annotation, { ...dto, status: 'active', deletedAt: null }); },
    markAnnotationStale(id) { const annotation = requireAnnotation(id); return annotation.status === 'archived' ? annotation : saveUpdated(annotation, { status: 'stale' }); }
  };
}

export { contentHash as calculateNoteContentHash };

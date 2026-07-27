import { mapAnnotation, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresContentAnnotationRepository({ db }) {
  if (!db?.contentAnnotation) {
    throw new TypeError('PostgreSQL annotation repository requires db.contentAnnotation');
  }

  return {
    async save(annotation) {
      const data = {
        id: annotation.id,
        spaceId: annotation.spaceId,
        noteId: annotation.noteId,
        kind: annotation.kind,
        sourceMode: annotation.sourceMode,
        quoteText: annotation.quoteText,
        headingPath: annotation.headingPath ?? [],
        fromPosition: annotation.fromPosition,
        toPosition: annotation.toPosition,
        prefixText: annotation.prefixText ?? '',
        suffixText: annotation.suffixText ?? '',
        anchorFingerprint: annotation.anchorFingerprint,
        noteContentHash: annotation.noteContentHash,
        idempotencyKey: annotation.idempotencyKey,
        status: annotation.status,
        createdAt: toDate(annotation.createdAt),
        updatedAt: toDate(annotation.updatedAt),
        deletedAt: annotation.deletedAt ? toDate(annotation.deletedAt) : null
      };
      return withRepositoryErrors(async () => mapAnnotation(
        await db.contentAnnotation.upsert({
          where: { id: data.id },
          create: data,
          update: (() => {
            const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...updateData } = data;
            return updateData;
          })()
        })
      ));
    },
    async findById(id) {
      return withRepositoryErrors(async () => mapAnnotation(
        await db.contentAnnotation.findUnique({ where: { id } })
      ));
    },
    async findByIdempotencyKey(noteId, idempotencyKey) {
      return withRepositoryErrors(async () => mapAnnotation(
        await db.contentAnnotation.findUnique({
          where: { noteId_idempotencyKey: { noteId, idempotencyKey } }
        })
      ));
    },
    async findDuplicate({ noteId, quoteText, fromPosition, toPosition }) {
      return withRepositoryErrors(async () => mapAnnotation(
        await db.contentAnnotation.findFirst({
          where: {
            noteId,
            quoteText,
            fromPosition,
            toPosition,
            status: { not: 'archived' }
          }
        })
      ));
    },
    async list({ noteId, spaceId, includeDeleted = false } = {}) {
      const where = {
        ...(noteId ? { noteId } : {}),
        ...(spaceId ? { spaceId } : {}),
        ...(includeDeleted ? {} : { status: { not: 'archived' } })
      };
      return withRepositoryErrors(async () => (await db.contentAnnotation.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      })).map(mapAnnotation));
    },
    async deleteByNoteIds(noteIds) {
      if (!noteIds.length) return [];
      const existing = await withRepositoryErrors(() => db.contentAnnotation.findMany({
        where: { noteId: { in: noteIds } }
      }));
      await withRepositoryErrors(() => db.contentAnnotation.deleteMany({
        where: { noteId: { in: noteIds } }
      }));
      return existing.map(mapAnnotation);
    },
    supportsAsync: true
  };
}

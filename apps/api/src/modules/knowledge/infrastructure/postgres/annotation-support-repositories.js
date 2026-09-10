import { toDate, toIso } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresAnnotationExclusionRepository({ db }) {
  return {
    save(record) {
      const data = { ...record, createdAt: toDate(record.createdAt), updatedAt: toDate(record.updatedAt) };
      return withRepositoryErrors(async () => mapDates(await db.annotationExclusion.upsert({ where: { id: record.id }, create: data, update: omitCreateFields(data) })));
    },
    async findById(id) { return mapDates(await db.annotationExclusion.findUnique({ where: { id } })); },
    async list({ parentAnnotationId, includeDeleted = false } = {}) {
      return (await db.annotationExclusion.findMany({ where: { ...(parentAnnotationId ? { parentAnnotationId } : {}), ...(includeDeleted ? {} : { status: { not: 'archived' } }) }, orderBy: { createdAt: 'asc' } })).map(mapDates);
    },
    async delete(id) { return mapDates(await db.annotationExclusion.delete({ where: { id } })); },
    supportsAsync: true
  };
}

export function createPostgresAnnotationRevisionRepository({ db }) {
  return {
    save(record) {
      return withRepositoryErrors(async () => mapCreated(await db.annotationRevision.create({ data: { ...record, createdAt: toDate(record.createdAt) } })));
    },
    async findById(id) { return mapCreated(await db.annotationRevision.findUnique({ where: { id } })); },
    async findByAnnotationRevision(annotationId, revision) { return mapCreated(await db.annotationRevision.findUnique({ where: { annotationId_revision: { annotationId, revision } } })); },
    async list({ annotationId } = {}) { return (await db.annotationRevision.findMany({ where: annotationId ? { annotationId } : {}, orderBy: { revision: 'asc' } })).map(mapCreated); },
    supportsAsync: true
  };
}

export function createPostgresAnalysisScopeRepository({ db }) {
  return {
    save(record) {
      return withRepositoryErrors(async () => mapCreated(await db.analysisScopeSnapshot.create({ data: { ...record, createdAt: toDate(record.createdAt) } })));
    },
    async findById(id) { return mapCreated(await db.analysisScopeSnapshot.findUnique({ where: { id } })); },
    async findByIdempotencyKey(spaceId, idempotencyKey) { return mapCreated(await db.analysisScopeSnapshot.findUnique({ where: { spaceId_idempotencyKey: { spaceId, idempotencyKey } } })); },
    async list({ spaceId } = {}) { return (await db.analysisScopeSnapshot.findMany({ where: spaceId ? { spaceId } : {}, orderBy: { createdAt: 'desc' } })).map(mapCreated); },
    supportsAsync: true
  };
}

function omitCreateFields(data) {
  const { id: _id, createdAt: _createdAt, ...update } = data;
  return update;
}
function mapDates(record) { return record ? { ...record, createdAt: toIso(record.createdAt), updatedAt: toIso(record.updatedAt) } : null; }
function mapCreated(record) { return record ? { ...record, createdAt: toIso(record.createdAt) } : null; }

import { mapTagGroup, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresTagGroupRepository({ db }) {
  if (!db?.tagGroup) throw new TypeError('PostgreSQL tag group repository requires db.tagGroup');
  return {
    async save(group) {
      const data = { id: group.id, spaceId: group.spaceId, code: group.code ?? null, name: group.name, selectionMode: group.selectionMode, isSystem: Boolean(group.isSystem), sortOrder: Number(group.sortOrder ?? 0), createdAt: toDate(group.createdAt), updatedAt: toDate(group.updatedAt) };
      return withRepositoryErrors(async () => mapTagGroup(await db.tagGroup.upsert({ where: { id: data.id }, create: data, update: { name: data.name, selectionMode: data.selectionMode, sortOrder: data.sortOrder, updatedAt: data.updatedAt } })));
    },
    async findById(id) { return withRepositoryErrors(async () => mapTagGroup(await db.tagGroup.findUnique({ where: { id } }))); },
    async delete(id) { return withRepositoryErrors(async () => mapTagGroup(await db.tagGroup.delete({ where: { id } }))); },
    async list(options = {}) { return withRepositoryErrors(async () => (await db.tagGroup.findMany({ where: options.spaceId ? { spaceId: options.spaceId } : {}, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })).map(mapTagGroup)); },
    supportsAsync: true
  };
}

import { mapTag, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresTagRepository({ db }) {
  if (!db?.tag) throw new TypeError('PostgreSQL tag repository requires db.tag');

  return {
    async save(tag) {
      const data = {
        id: tag.id,
        spaceId: tag.spaceId,
        name: tag.name,
        color: tag.color ?? 'slate',
        groupId: tag.groupId ?? null,
        code: tag.code ?? null,
        isSystem: Boolean(tag.isSystem),
        sortOrder: Number(tag.sortOrder ?? 0),
        createdAt: toDate(tag.createdAt),
        updatedAt: toDate(tag.updatedAt)
      };
      return withRepositoryErrors(async () => mapTag(await db.tag.upsert({
        where: { id: data.id },
        create: data,
        update: {
          spaceId: data.spaceId,
          name: data.name,
          color: data.color,
          groupId: data.groupId,
          code: data.code,
          isSystem: data.isSystem,
          sortOrder: data.sortOrder,
          updatedAt: data.updatedAt
        }
      })));
    },
    async findById(tagId) {
      return withRepositoryErrors(async () => mapTag(await db.tag.findUnique({
        where: { id: tagId }
      })));
    },
    async findByIds(tagIds) {
      if (!Array.isArray(tagIds) || tagIds.length === 0) return [];
      return withRepositoryErrors(async () => (await db.tag.findMany({
        where: { id: { in: [...new Set(tagIds)] } }
      })).map(mapTag));
    },
    async delete(tagId) {
      return withRepositoryErrors(async () => mapTag(await db.tag.delete({
        where: { id: tagId }
      })));
    },
    async list(options = {}) {
      const where = options.spaceId ? { spaceId: options.spaceId } : {};
      return withRepositoryErrors(async () => (await db.tag.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      })).map(mapTag));
    },
    supportsAsync: true
  };
}

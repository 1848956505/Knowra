import { mapFolder, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresFolderRepository({ db }) {
  if (!db?.folder) throw new TypeError('PostgreSQL folder repository requires db.folder');

  return {
    async save(folder) {
      const data = {
        id: folder.id,
        spaceId: folder.spaceId,
        parentId: folder.parentId ?? null,
        name: folder.name,
        sortOrder: Number(folder.sortOrder ?? 0),
        pathCache: folder.pathCache ?? '/',
        createdAt: toDate(folder.createdAt),
        updatedAt: toDate(folder.updatedAt)
      };
      return withRepositoryErrors(async () => mapFolder(await db.folder.upsert({
        where: { id: data.id },
        create: data,
        update: {
          spaceId: data.spaceId,
          parentId: data.parentId,
          name: data.name,
          sortOrder: data.sortOrder,
          pathCache: data.pathCache,
          updatedAt: data.updatedAt
        }
      })));
    },
    async findById(folderId) {
      return withRepositoryErrors(async () => mapFolder(await db.folder.findUnique({
        where: { id: folderId }
      })));
    },
    async delete(folderId) {
      return withRepositoryErrors(async () => mapFolder(await db.folder.delete({
        where: { id: folderId }
      })));
    },
    async list(options = {}) {
      const where = options.spaceId ? { spaceId: options.spaceId } : {};
      return withRepositoryErrors(async () => (await db.folder.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      })).map(mapFolder));
    },
    supportsAsync: true
  };
}

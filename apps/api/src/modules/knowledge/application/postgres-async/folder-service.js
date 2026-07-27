import { Folder } from '../../domain/folder.js';
import { buildCreateFolderDto, buildUpdateFolderDto } from '../dto/folder.dto.js';
import { conflictError, notFoundError } from '../knowledge-errors.js';

export function createAsyncFolderService({
  repository,
  validateSiblingNameConflict = null,
  validateSpaceReference = null
} = {}) {
  if (!repository) throw new TypeError('Async folder service requires a repository');

  async function requireFolder(folderId) {
    const folder = await repository.findById(folderId);
    if (!folder) throw notFoundError('FOLDER_NOT_FOUND', 'Folder not found');
    return folder;
  }

  function normalizeSegment(name) {
    return String(name ?? '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'folder';
  }

  function buildPathCache({ name, parentFolder }) {
    const segment = normalizeSegment(name);
    if (!parentFolder) return `/${segment}`;
    return `${parentFolder.pathCache}/${segment}`.replace(/\/+/g, '/');
  }

  async function validateParent(spaceId, parentId, currentFolderId = null) {
    if (!parentId) return null;
    if (currentFolderId && parentId === currentFolderId) {
      throw conflictError('FOLDER_PARENT_CONFLICT', 'Folder cannot be its own parent');
    }
    const parentFolder = await requireFolder(parentId);
    if (parentFolder.spaceId !== spaceId) {
      throw conflictError('FOLDER_SPACE_MISMATCH', 'Parent folder must belong to the same space');
    }
    if (currentFolderId) {
      let cursor = parentFolder;
      while (cursor) {
        if (cursor.id === currentFolderId) {
          throw conflictError('FOLDER_DESCENDANT_CONFLICT', 'Folder cannot move under its descendant');
        }
        cursor = cursor.parentId ? await repository.findById(cursor.parentId) : null;
      }
    }
    return parentFolder;
  }

  async function reindexDescendants(parentFolder) {
    const descendants = (await repository.list({ spaceId: parentFolder.spaceId }))
      .filter((folder) => folder.parentId === parentFolder.id);
    for (const folder of descendants) {
      const updatedFolder = new Folder({
        ...folder,
        pathCache: buildPathCache({ name: folder.name, parentFolder })
      });
      const saved = await repository.save(updatedFolder);
      await reindexDescendants(saved);
    }
  }

  async function collectSubtreeIds(folderId) {
    const allFolders = await repository.list();
    const ids = new Set([folderId]);
    const queue = [folderId];
    while (queue.length) {
      const currentId = queue.shift();
      allFolders.filter((folder) => folder.parentId === currentId).forEach((folder) => {
        if (!ids.has(folder.id)) {
          ids.add(folder.id);
          queue.push(folder.id);
        }
      });
    }
    return [...ids];
  }

  return {
    async createFolder(input) {
      const dto = buildCreateFolderDto(input);
      if (await repository.findById(dto.id)) {
        throw conflictError('FOLDER_ID_CONFLICT', 'A folder with the same id already exists');
      }
      await validateSpaceReference?.(dto.spaceId);
      await validateSiblingNameConflict?.({
        spaceId: dto.spaceId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        currentFolderId: null
      });
      const parentFolder = await validateParent(dto.spaceId, dto.parentId);
      return repository.save(new Folder({
        ...dto,
        pathCache: buildPathCache({ name: dto.name, parentFolder })
      }));
    },
    async updateFolder(folderId, updates) {
      const currentFolder = await requireFolder(folderId);
      const dto = buildUpdateFolderDto(updates);
      const nextParentId = dto.parentId !== undefined ? dto.parentId : currentFolder.parentId;
      await validateSiblingNameConflict?.({
        spaceId: currentFolder.spaceId,
        parentId: nextParentId ?? null,
        name: dto.name ?? currentFolder.name,
        currentFolderId: currentFolder.id
      });
      const parentFolder = await validateParent(currentFolder.spaceId, nextParentId, currentFolder.id);
      const updatedFolder = await repository.save(new Folder({
        ...currentFolder,
        ...dto,
        id: currentFolder.id,
        spaceId: currentFolder.spaceId,
        pathCache: buildPathCache({
          name: dto.name ?? currentFolder.name,
          parentFolder
        })
      }));
      await reindexDescendants(updatedFolder);
      return updatedFolder;
    },
    async deleteFolder(folderId) {
      await requireFolder(folderId);
      const deletedIds = await collectSubtreeIds(folderId);
      const deletedFolders = await Promise.all(deletedIds.map((id) => requireFolder(id)));
      await Promise.all(deletedIds.map((id) => repository.delete(id)));
      return deletedFolders;
    },
    listFolders(options = {}) { return repository.list(options); },
    async listFolderTree(options = {}) {
      const folders = await repository.list(options);
      const byParent = new Map();
      folders.forEach((folder) => {
        const key = folder.parentId ?? '__root__';
        const list = byParent.get(key) ?? [];
        list.push(folder);
        byParent.set(key, list);
      });
      function buildNodes(parentId = null) {
        const key = parentId ?? '__root__';
        return (byParent.get(key) ?? []).sort((left, right) => left.name.localeCompare(right.name))
          .map((folder) => ({ ...folder, children: buildNodes(folder.id) }));
      }
      return buildNodes();
    },
    async getFolderSubtreeIds(folderId) {
      await requireFolder(folderId);
      return collectSubtreeIds(folderId);
    }
  };
}

import { Folder } from '../domain/folder.js';
import { buildCreateFolderDto, buildUpdateFolderDto } from './dto/folder.dto.js';
import { createInMemoryFolderRepository } from '../infrastructure/folder-repository.js';

export function createFolderService({
  repository = createInMemoryFolderRepository(),
  validateSiblingNameConflict = null
} = {}) {
  function requireFolder(folderId) {
    const folder = repository.findById(folderId);

    if (!folder) {
      throw new Error('Folder not found');
    }

    return folder;
  }

  function normalizeSegment(name) {
    return String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'folder';
  }

  function buildPathCache({ name, parentFolder }) {
    const segment = normalizeSegment(name);

    if (!parentFolder) {
      return `/${segment}`;
    }

    return `${parentFolder.pathCache}/${segment}`.replace(/\/+/g, '/');
  }

  function validateParent(spaceId, parentId, currentFolderId = null) {
    if (!parentId) {
      return null;
    }

    if (currentFolderId && parentId === currentFolderId) {
      throw new Error('Folder cannot be its own parent');
    }

    const parentFolder = requireFolder(parentId);

    if (parentFolder.spaceId !== spaceId) {
      throw new Error('Parent folder must belong to the same space');
    }

    if (currentFolderId) {
      let cursor = parentFolder;
      while (cursor) {
        if (cursor.id === currentFolderId) {
          throw new Error('Folder cannot move under its descendant');
        }
        cursor = cursor.parentId ? repository.findById(cursor.parentId) : null;
      }
    }

    return parentFolder;
  }

  function reindexDescendants(parentFolder) {
    const descendants = repository.list({ spaceId: parentFolder.spaceId })
      .filter((folder) => folder.parentId === parentFolder.id);

    descendants.forEach((folder) => {
      const updatedFolder = new Folder({
        ...folder,
        pathCache: buildPathCache({
          name: folder.name,
          parentFolder
        })
      });
      repository.save(updatedFolder);
      reindexDescendants(updatedFolder);
    });
  }

  function collectSubtreeIds(folderId) {
    const allFolders = repository.list();
    const ids = new Set([folderId]);
    const queue = [folderId];

    while (queue.length) {
      const currentId = queue.shift();
      allFolders
        .filter((folder) => folder.parentId === currentId)
        .forEach((folder) => {
          if (!ids.has(folder.id)) {
            ids.add(folder.id);
            queue.push(folder.id);
          }
        });
    }

    return [...ids];
  }

  return {
    createFolder(input) {
      const dto = buildCreateFolderDto(input);
      validateSiblingNameConflict?.({
        spaceId: dto.spaceId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        currentFolderId: null
      });
      const parentFolder = validateParent(dto.spaceId, dto.parentId);
      const folder = new Folder({
        ...dto,
        pathCache: buildPathCache({
          name: dto.name,
          parentFolder
        })
      });
      repository.save(folder);
      return folder;
    },
    updateFolder(folderId, updates) {
      const currentFolder = requireFolder(folderId);
      const dto = buildUpdateFolderDto(updates);
      const nextParentId = dto.parentId !== undefined ? dto.parentId : currentFolder.parentId;
      validateSiblingNameConflict?.({
        spaceId: currentFolder.spaceId,
        parentId: nextParentId ?? null,
        name: dto.name ?? currentFolder.name,
        currentFolderId: currentFolder.id
      });
      const parentFolder = validateParent(currentFolder.spaceId, nextParentId, currentFolder.id);
      const updatedFolder = new Folder({
        ...currentFolder,
        ...dto,
        id: currentFolder.id,
        spaceId: currentFolder.spaceId,
        pathCache: buildPathCache({
          name: dto.name ?? currentFolder.name,
          parentFolder
        })
      });

      repository.save(updatedFolder);
      reindexDescendants(updatedFolder);
      return updatedFolder;
    },
    deleteFolder(folderId) {
      const folder = requireFolder(folderId);
      const deletedIds = collectSubtreeIds(folderId);
      const deletedFolders = deletedIds.map((id) => requireFolder(id));
      deletedIds.forEach((id) => repository.delete(id));
      return deletedFolders;
    },
    listFolders(options = {}) {
      return repository.list(options);
    },
    listFolderTree(options = {}) {
      const folders = repository.list(options);
      const byParent = new Map();

      folders.forEach((folder) => {
        const key = folder.parentId ?? '__root__';
        const list = byParent.get(key) ?? [];
        list.push(folder);
        byParent.set(key, list);
      });

      function buildNodes(parentId = null) {
        const key = parentId ?? '__root__';
        return (byParent.get(key) ?? [])
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((folder) => ({
            ...folder,
            children: buildNodes(folder.id)
          }));
      }

      return buildNodes();
    },
    getFolderSubtreeIds(folderId) {
      requireFolder(folderId);
      return collectSubtreeIds(folderId);
    }
  };
}

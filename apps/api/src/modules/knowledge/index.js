import { createNoteService } from './application/note-service.js';
import { createFolderService } from './application/folder-service.js';
import { createTagService } from './application/tag-service.js';
import { createKnowledgeSpaceService } from './application/knowledge-space-service.js';
import { createSearchService } from './application/search-service.js';
import { createKnowledgePointService } from './application/knowledge-point-service.js';
import { createInMemoryNoteRepository } from './infrastructure/note-repository.js';
import { createInMemoryFolderRepository } from './infrastructure/folder-repository.js';
import { createInMemoryTagRepository } from './infrastructure/tag-repository.js';
import { createInMemoryKnowledgeSpaceRepository } from './infrastructure/knowledge-space-repository.js';
import {
  createInMemoryKnowledgePointRepository,
  createInMemoryKnowledgePointSourceRepository,
  createInMemoryKnowledgePointTagRepository,
  createInMemoryNoteKnowledgePointRepository,
  createInMemoryTagGroupRepository
} from './infrastructure/knowledge-point-repository.js';

export function createKnowledgeModule(options = {}) {
  const noteRepository = options.noteRepository ?? createInMemoryNoteRepository();
  const folderRepository = options.folderRepository ?? createInMemoryFolderRepository();
  const tagRepository = options.tagRepository ?? createInMemoryTagRepository();
  const knowledgeSpaceRepository =
    options.knowledgeSpaceRepository ?? createInMemoryKnowledgeSpaceRepository();
  const knowledgePointRepository =
    options.knowledgePointRepository ?? createInMemoryKnowledgePointRepository();
  const knowledgePointSourceRepository =
    options.knowledgePointSourceRepository ?? createInMemoryKnowledgePointSourceRepository();
  const knowledgePointTagRepository =
    options.knowledgePointTagRepository ?? createInMemoryKnowledgePointTagRepository();
  const noteKnowledgePointRepository =
    options.noteKnowledgePointRepository ?? createInMemoryNoteKnowledgePointRepository();
  const tagGroupRepository =
    options.tagGroupRepository ?? createInMemoryTagGroupRepository();

  function normalizeComparableName(value) {
    return String(value ?? '').trim();
  }

  function assertSiblingNameAvailable({
    spaceId,
    parentId = null,
    folderId = null,
    title,
    name,
    currentFolderId = null,
    currentNoteId = null
  }) {
    const candidate = normalizeComparableName(name ?? title);
    if (!candidate) {
      return;
    }

    const conflictingFolder = folderRepository.list({ spaceId }).find((folder) => (
      folder.parentId === parentId
      && folder.id !== currentFolderId
      && normalizeComparableName(folder.name) === candidate
    ));
    if (conflictingFolder) {
      throw new Error('A file or folder with the same name already exists');
    }

    const conflictingNote = noteRepository.list({ spaceId, includeDeleted: true }).find((note) => (
      !note.deleted
      && note.folderId === folderId
      && note.id !== currentNoteId
      && normalizeComparableName(note.title) === candidate
    ));
    if (conflictingNote) {
      throw new Error('A file or folder with the same name already exists');
    }
  }

  const noteService = createNoteService({
    repository: noteRepository,
    validateSiblingNameConflict: ({ spaceId, folderId, title, currentNoteId }) => {
      assertSiblingNameAvailable({
        spaceId,
        parentId: folderId,
        folderId,
        title,
        currentNoteId
      });
    }
  });
  const folderService = createFolderService({
    repository: folderRepository,
    validateSiblingNameConflict: ({ spaceId, parentId, name, currentFolderId }) => {
      assertSiblingNameAvailable({
        spaceId,
        parentId,
        folderId: parentId,
        name,
        currentFolderId
      });
    }
  });
  const tagService = createTagService({ repository: tagRepository });
  const knowledgeSpaceService = createKnowledgeSpaceService({
    repository: knowledgeSpaceRepository
  });
  const knowledgePointService = createKnowledgePointService({
    knowledgePointRepository,
    sourceRepository: knowledgePointSourceRepository,
    tagRelationRepository: knowledgePointTagRepository,
    noteRelationRepository: noteKnowledgePointRepository,
    tagRepository,
    tagGroupRepository
  });
  const searchService = createSearchService({
    listNotes: (options) => noteService.listNotes(options)
  });

  function deleteFolderAndCleanup(folderId) {
    const subtreeIds = folderService.getFolderSubtreeIds(folderId);
    subtreeIds.forEach((id) => {
      noteService.clearFolderFromNotes(id);
    });
    return folderService.deleteFolder(folderId);
  }

  function deleteTagAndCleanup(tagId) {
    noteService.removeTagFromAllNotes(tagId);
    return tagService.deleteTag(tagId);
  }

  return {
    repositories: {
      noteRepository,
      folderRepository,
      tagRepository,
      knowledgeSpaceRepository,
      knowledgePointRepository,
      knowledgePointSourceRepository,
      knowledgePointTagRepository,
      noteKnowledgePointRepository,
      tagGroupRepository
    },
    noteService,
    folderService,
    tagService,
    knowledgePointService,
    knowledgeSpaceService,
    searchService,
    deleteFolderAndCleanup,
    deleteTagAndCleanup
  };
}

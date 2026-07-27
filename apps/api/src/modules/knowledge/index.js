import { createNoteService } from './application/note-service.js';
import { createFolderService } from './application/folder-service.js';
import { createTagService } from './application/tag-service.js';
import { createKnowledgeSpaceService } from './application/knowledge-space-service.js';
import { createSearchService } from './application/search-service.js';
import { createContentAnnotationService } from './application/content-annotation-service.js';
import { createInMemoryNoteRepository } from './infrastructure/note-repository.js';
import { createInMemoryFolderRepository } from './infrastructure/folder-repository.js';
import { createInMemoryTagRepository } from './infrastructure/tag-repository.js';
import { createInMemoryKnowledgeSpaceRepository } from './infrastructure/knowledge-space-repository.js';
import { createInMemoryContentAnnotationRepository } from './infrastructure/content-annotation-repository.js';
import {
  conflictError,
  validationError
} from './application/knowledge-errors.js';

export function createKnowledgeModule(options = {}) {
  const noteRepository = options.noteRepository ?? createInMemoryNoteRepository();
  const folderRepository = options.folderRepository ?? createInMemoryFolderRepository();
  const tagRepository = options.tagRepository ?? createInMemoryTagRepository();
  const knowledgeSpaceRepository =
    options.knowledgeSpaceRepository ?? createInMemoryKnowledgeSpaceRepository();
  const contentAnnotationRepository =
    options.contentAnnotationRepository ?? createInMemoryContentAnnotationRepository();
  const enforceReferences = options.enforceReferences ?? false;

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
      throw conflictError(
        'SIBLING_NAME_CONFLICT',
        'A file or folder with the same name already exists'
      );
    }

    const conflictingNote = noteRepository.list({ spaceId, includeDeleted: true }).find((note) => (
      !note.deleted
      && note.folderId === folderId
      && note.id !== currentNoteId
      && normalizeComparableName(note.title) === candidate
    ));
    if (conflictingNote) {
      throw conflictError(
        'SIBLING_NAME_CONFLICT',
        'A file or folder with the same name already exists'
      );
    }
  }

  function assertSpaceReference(spaceId, entityName) {
    if (!enforceReferences) {
      return;
    }

    if (!spaceId || !knowledgeSpaceRepository.findById(spaceId)) {
      throw validationError(
        `${entityName}_SPACE_NOT_FOUND`,
        'The referenced knowledge space does not exist'
      );
    }
  }

  function assertNoteReferences({ spaceId, folderId, tagIds }) {
    if (!enforceReferences) {
      return;
    }

    assertSpaceReference(spaceId, 'NOTE');

    if (folderId) {
      const folder = folderRepository.findById(folderId);
      if (!folder) {
        throw validationError(
          'NOTE_FOLDER_NOT_FOUND',
          'The referenced folder does not exist'
        );
      }
      if (folder.spaceId !== spaceId) {
        throw validationError(
          'NOTE_FOLDER_SPACE_MISMATCH',
          'The referenced folder belongs to another knowledge space'
        );
      }
    }

    tagIds.forEach((tagId) => {
      const tag = tagRepository.findById(tagId);
      if (!tag) {
        throw validationError(
          'NOTE_TAG_NOT_FOUND',
          'A referenced tag does not exist'
        );
      }
      if (tag.spaceId !== spaceId) {
        throw validationError(
          'NOTE_TAG_SPACE_MISMATCH',
          'A referenced tag belongs to another knowledge space'
        );
      }
    });
  }

  const noteService = createNoteService({
    repository: noteRepository,
    validateNoteReferences: assertNoteReferences,
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
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'FOLDER'),
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
  const tagService = createTagService({
    repository: tagRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG')
  });
  const knowledgeSpaceService = createKnowledgeSpaceService({
    repository: knowledgeSpaceRepository
  });
  const contentAnnotationService = createContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository
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
      contentAnnotationRepository
    },
    noteService,
    folderService,
    tagService,
    contentAnnotationService,
    knowledgeSpaceService,
    searchService,
    deleteFolderAndCleanup,
    deleteTagAndCleanup
  };
}

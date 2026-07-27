import { createAsyncNoteService } from './application/postgres-async/note-service.js';
import { createAsyncFolderService } from './application/postgres-async/folder-service.js';
import { createAsyncTagService } from './application/postgres-async/tag-service.js';
import { createAsyncKnowledgeSpaceService } from './application/postgres-async/space-service.js';
import { createAsyncContentAnnotationService } from './application/postgres-async/content-annotation-service.js';
import { createAsyncSearchService } from './application/postgres-async/search-service.js';
import { conflictError, validationError } from './application/knowledge-errors.js';

export function createPostgresKnowledgeModule({
  noteRepository,
  folderRepository,
  tagRepository,
  knowledgeSpaceRepository,
  contentAnnotationRepository
} = {}) {
  const repositories = {
    noteRepository,
    folderRepository,
    tagRepository,
    knowledgeSpaceRepository,
    contentAnnotationRepository
  };
  Object.entries(repositories).forEach(([name, repository]) => {
    if (!repository?.supportsAsync) throw new TypeError(`Missing PostgreSQL repository: ${name}`);
  });

  function normalizeComparableName(value) {
    return String(value ?? '').trim();
  }

  async function assertSiblingNameAvailable({
    spaceId,
    parentId = null,
    folderId = null,
    title,
    name,
    currentFolderId = null,
    currentNoteId = null
  }) {
    const candidate = normalizeComparableName(name ?? title);
    if (!candidate) return;
    const folders = await folderRepository.list({ spaceId });
    if (folders.some((folder) => (
      folder.parentId === parentId
      && folder.id !== currentFolderId
      && normalizeComparableName(folder.name) === candidate
    ))) {
      throw conflictError('SIBLING_NAME_CONFLICT', 'A file or folder with the same name already exists');
    }
    const notes = await noteRepository.list({ spaceId, includeDeleted: true });
    if (notes.some((note) => (
      !note.deleted
      && note.folderId === folderId
      && note.id !== currentNoteId
      && normalizeComparableName(note.title) === candidate
    ))) {
      throw conflictError('SIBLING_NAME_CONFLICT', 'A file or folder with the same name already exists');
    }
  }

  async function assertSpaceReference(spaceId, entityName) {
    if (!spaceId || !(await knowledgeSpaceRepository.findById(spaceId))) {
      throw validationError(`${entityName}_SPACE_NOT_FOUND`, 'The referenced knowledge space does not exist');
    }
  }

  async function assertNoteReferences({ spaceId, folderId, tagIds }) {
    await assertSpaceReference(spaceId, 'NOTE');
    if (folderId) {
      const folder = await folderRepository.findById(folderId);
      if (!folder) throw validationError('NOTE_FOLDER_NOT_FOUND', 'The referenced folder does not exist');
      if (folder.spaceId !== spaceId) throw validationError('NOTE_FOLDER_SPACE_MISMATCH', 'The referenced folder belongs to another knowledge space');
    }
    const tags = await tagRepository.findByIds(tagIds ?? []);
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
    for (const tagId of tagIds ?? []) {
      const tag = tagMap.get(tagId);
      if (!tag) throw validationError('NOTE_TAG_NOT_FOUND', 'A referenced tag does not exist');
      if (tag.spaceId !== spaceId) throw validationError('NOTE_TAG_SPACE_MISMATCH', 'A referenced tag belongs to another knowledge space');
    }
  }

  const noteService = createAsyncNoteService({
    repository: noteRepository,
    validateNoteReferences: assertNoteReferences,
    validateSiblingNameConflict: assertSiblingNameAvailable
  });
  const folderService = createAsyncFolderService({
    repository: folderRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'FOLDER'),
    validateSiblingNameConflict: assertSiblingNameAvailable
  });
  const tagService = createAsyncTagService({
    repository: tagRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG')
  });
  const knowledgeSpaceService = createAsyncKnowledgeSpaceService({
    repository: knowledgeSpaceRepository
  });
  const contentAnnotationService = createAsyncContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository
  });
  const searchService = createAsyncSearchService({
    listNotes: (options) => noteService.listNotes(options)
  });

  return {
    repositories,
    noteService,
    folderService,
    tagService,
    contentAnnotationService,
    knowledgeSpaceService,
    searchService,
    async deleteFolderAndCleanup(folderId) {
      const subtreeIds = await folderService.getFolderSubtreeIds(folderId);
      for (const id of subtreeIds) await noteService.clearFolderFromNotes(id);
      return folderService.deleteFolder(folderId);
    },
    async deleteTagAndCleanup(tagId) {
      await noteService.removeTagFromAllNotes(tagId);
      return tagService.deleteTag(tagId);
    }
  };
}

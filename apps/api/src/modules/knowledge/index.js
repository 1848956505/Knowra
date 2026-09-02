import { createNoteService } from './application/note-service.js';
import { createFolderService } from './application/folder-service.js';
import { createTagService } from './application/tag-service.js';
import { createTagGroupService } from './application/tag-group-service.js';
import { createKnowledgeSpaceService } from './application/knowledge-space-service.js';
import { createSearchService } from './application/search-service.js';
import { createContentAnnotationService } from './application/content-annotation-service.js';
import { createInMemoryNoteRepository } from './infrastructure/note-repository.js';
import { createInMemoryFolderRepository } from './infrastructure/folder-repository.js';
import { createInMemoryTagRepository } from './infrastructure/tag-repository.js';
import { createInMemoryTagGroupRepository } from './infrastructure/tag-group-repository.js';
import { createInMemoryKnowledgeSpaceRepository } from './infrastructure/knowledge-space-repository.js';
import { createInMemoryContentAnnotationRepository } from './infrastructure/content-annotation-repository.js';
import { createInMemoryNoteVersionRepository } from './infrastructure/note-version-repository.js';
import { createInMemoryKnowledgeItemRepository } from './infrastructure/knowledge-item-repository.js';
import { createInMemoryKnowledgeEvidenceRepository } from './infrastructure/knowledge-evidence-repository.js';
import { createInMemoryLearningObjectiveRepository } from './infrastructure/learning-objective-repository.js';
import { createInMemoryExamProfileRepository } from './infrastructure/exam-profile-repository.js';
import { createInMemoryExamFocusRepository } from './infrastructure/exam-focus-repository.js';
import { createInMemoryQuestionRepository } from './infrastructure/question-repository.js';
import { createInMemoryQuestionObjectiveRepository } from './infrastructure/question-objective-repository.js';
import { createInMemoryQuestionSourceRepository } from './infrastructure/question-source-repository.js';
import { createNoteVersionService } from './application/note-version-service.js';
import { createKnowledgeItemService } from './application/knowledge-item-service.js';
import { createLearningObjectiveService } from './application/learning-objective-service.js';
import { createAssessmentContextService } from './application/assessment-context-service.js';
import { createQuestionService } from './application/question-service.js';
import { createWorkspaceQueryService } from './application/workspace-query-service.js';
import {
  conflictError,
  validationError
} from './application/knowledge-errors.js';

export function createKnowledgeModule(options = {}) {
  const noteRepository = options.noteRepository ?? createInMemoryNoteRepository();
  const folderRepository = options.folderRepository ?? createInMemoryFolderRepository();
  const tagRepository = options.tagRepository ?? createInMemoryTagRepository();
  const tagGroupRepository = options.tagGroupRepository ?? createInMemoryTagGroupRepository();
  const knowledgeSpaceRepository =
    options.knowledgeSpaceRepository ?? createInMemoryKnowledgeSpaceRepository();
  const contentAnnotationRepository =
    options.contentAnnotationRepository ?? createInMemoryContentAnnotationRepository();
  const noteVersionRepository = options.noteVersionRepository ?? createInMemoryNoteVersionRepository({ records: options.noteVersions ?? [] });
  const knowledgeItemRepository = options.knowledgeItemRepository ?? createInMemoryKnowledgeItemRepository({ records: options.knowledgeItems ?? [] });
  const knowledgeEvidenceRepository = options.knowledgeEvidenceRepository ?? createInMemoryKnowledgeEvidenceRepository({ records: options.knowledgeEvidence ?? [] });
  const learningObjectiveRepository = options.learningObjectiveRepository ?? createInMemoryLearningObjectiveRepository({ records: options.learningObjectives ?? [] });
  const examProfileRepository = options.examProfileRepository ?? createInMemoryExamProfileRepository({ records: options.examProfiles ?? [] });
  const examFocusRepository = options.examFocusRepository ?? createInMemoryExamFocusRepository({ records: options.examFocuses ?? [] });
  const questionRepository = options.questionRepository ?? createInMemoryQuestionRepository({ records: options.questions ?? [] });
  const questionObjectiveRepository = options.questionObjectiveRepository ?? createInMemoryQuestionObjectiveRepository({ records: options.questionObjectives ?? [] });
  const questionSourceRepository = options.questionSourceRepository ?? createInMemoryQuestionSourceRepository({ records: options.questionSources ?? [] });
  const enforceReferences = options.enforceReferences ?? false;
  const runTransaction = options.runTransaction ?? ((operation) => operation());

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
    const grouped = new Map();
    tagIds.forEach((tagId) => {
      const tag = tagRepository.findById(tagId);
      if (!tag?.groupId) return;
      const ids = grouped.get(tag.groupId) ?? [];
      ids.push(tagId);
      grouped.set(tag.groupId, ids);
    });
    grouped.forEach((ids, groupId) => {
      if (tagGroupRepository.findById(groupId)?.selectionMode === 'single' && ids.length > 1) {
        throw validationError('TAG_GROUP_SINGLE_SELECTION', 'Only one tag may be selected from this group');
      }
    });
  }

  function normalizeTagIds(tagIds) {
    const normalized = [];
    const singleGroupIndexes = new Map();
    [...new Set(tagIds)].forEach((tagId) => {
      const tag = tagRepository.findById(tagId);
      const group = tag?.groupId ? tagGroupRepository.findById(tag.groupId) : null;
      if (group?.selectionMode !== 'single') {
        normalized.push(tagId);
        return;
      }
      const previousIndex = singleGroupIndexes.get(group.id);
      if (previousIndex !== undefined) normalized[previousIndex] = null;
      singleGroupIndexes.set(group.id, normalized.length);
      normalized.push(tagId);
    });
    return normalized.filter(Boolean);
  }

  const noteVersionService = createNoteVersionService({ repository: noteVersionRepository });
  let learningObjectiveService = null;
  let questionService = null;
  const knowledgeItemService = createKnowledgeItemService({
    repository: knowledgeItemRepository,
    evidenceRepository: knowledgeEvidenceRepository,
    noteVersionRepository,
    annotationRepository: contentAnnotationRepository,
    noteRepository,
    onItemInvalidated: (knowledgeItemId) => {
      learningObjectiveService?.invalidateByKnowledgeItemId(knowledgeItemId);
      questionService?.markSourcesStale('knowledgeItem', [knowledgeItemId]);
    },
    runTransaction
  });
  learningObjectiveService = createLearningObjectiveService({
    repository: learningObjectiveRepository,
    knowledgeItemRepository,
    onObjectiveInvalidated: (learningObjectiveId) => {
      questionService?.invalidateByObjectiveId(learningObjectiveId);
    },
    runTransaction
  });
  const { profileService: examProfileService, focusService: examFocusService } = createAssessmentContextService({
    examProfileRepository,
    examFocusRepository,
    learningObjectiveRepository,
    runTransaction
  });
  questionService = createQuestionService({
    repository: questionRepository,
    questionObjectiveRepository,
    questionSourceRepository,
    learningObjectiveRepository,
    examFocusRepository,
    knowledgeItemRepository,
    noteRepository,
    noteVersionRepository,
    knowledgeEvidenceRepository,
    runTransaction
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
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG'),
    validateGroupReference: (groupId, spaceId) => {
      if (!groupId) return;
      const group = tagGroupRepository.findById(groupId);
      if (!group) throw validationError('TAG_GROUP_NOT_FOUND', 'The referenced tag group does not exist');
      if (group.spaceId !== spaceId) throw validationError('TAG_GROUP_SPACE_MISMATCH', 'The referenced tag group belongs to another knowledge space');
    }
  });
  const tagGroupService = createTagGroupService({
    repository: tagGroupRepository,
    tagRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG_GROUP')
  });
  const knowledgeSpaceService = createKnowledgeSpaceService({
    repository: knowledgeSpaceRepository
  });
  const contentAnnotationService = createContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository,
    noteVersionRepository,
    onAnnotationArchived: (annotationId) => {
      const changed = knowledgeItemService.markEvidenceByAnnotationId(annotationId, 'invalid');
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
    }
  });
  const noteService = createNoteService({
    repository: noteRepository,
    validateNoteReferences: assertNoteReferences,
    normalizeTagIds,
    noteVersionService,
    runTransaction,
    onNoteContentChanged: (note, version) => {
      const changed = knowledgeItemService.markEvidenceByNoteId(note.id, 'stale');
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      const oldVersionIds = noteVersionService.listVersions({ noteId: note.id })
        .filter((candidate) => candidate.id !== version.id)
        .map((candidate) => candidate.id);
      questionService.markSourcesStale('noteVersion', oldVersionIds);
      contentAnnotationService.markStaleForNote(note.id, version.contentHash);
    },
    onNoteDeleted: (noteId) => {
      const changed = knowledgeItemService.markEvidenceByNoteId(noteId, 'invalid');
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      questionService.markSourcesStale('noteVersion', noteVersionService.listVersions({ noteId }).map((version) => version.id));
    },
    onBeforePermanentDelete: (noteId) => {
      if (knowledgeEvidenceRepository.list({ noteId }).length > 0) {
        throw conflictError('NOTE_HAS_KNOWLEDGE_EVIDENCE', 'Note has formal knowledge evidence and cannot be permanently deleted');
      }
      const versionIds = new Set(
        noteVersionRepository.list({ noteId }).map((version) => version.id)
      );
      if (
        questionSourceRepository.list().some((source) => (
          source.sourceType === 'noteVersion'
          && versionIds.has(source.sourceId)
        ))
      ) {
        throw conflictError(
          'NOTE_HAS_QUESTION_SOURCE',
          'Note has a formal question source and cannot be permanently deleted'
        );
      }
    },
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
  const searchService = createSearchService({
    listNotes: (options) => noteService.listNotes(options)
  });
  const workspaceQueryService = createWorkspaceQueryService({
    repositories: {
      noteRepository,
      noteVersionRepository,
      knowledgeItemRepository,
      knowledgeEvidenceRepository,
      learningObjectiveRepository,
      examProfileRepository,
      examFocusRepository,
      questionRepository,
      questionObjectiveRepository,
      questionSourceRepository
    }
  });

  function deleteFolderAndCleanup(folderId) {
    const subtreeIds = folderService.getFolderSubtreeIds(folderId);
    subtreeIds.forEach((id) => {
      noteService.clearFolderFromNotes(id);
    });
    return folderService.deleteFolder(folderId);
  }

  function deleteTagAndCleanup(tagId) {
    const tag = tagRepository.findById(tagId);
    if (tag?.isSystem) throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be deleted');
    return runTransaction(() => {
      noteService.removeTagFromAllNotes(tagId);
      return tagService.deleteTag(tagId);
    });
  }

  function mergeTags(sourceTagId, targetTagId) {
    const source = tagRepository.findById(sourceTagId);
    const target = tagRepository.findById(targetTagId);
    if (!source || !target) throw validationError('TAG_MERGE_TARGET_INVALID', 'Both tags must exist');
    if (source.isSystem) throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be merged');
    if (source.spaceId !== target.spaceId) throw validationError('TAG_SPACE_MISMATCH', 'Tags must belong to the same space');
    return runTransaction(() => {
      noteService.replaceTagInAllNotes(sourceTagId, targetTagId);
      tagRepository.delete(sourceTagId);
      return target;
    });
  }

  return {
    repositories: {
      noteRepository,
      folderRepository,
      tagRepository,
      tagGroupRepository,
      knowledgeSpaceRepository,
      contentAnnotationRepository,
      noteVersionRepository,
      knowledgeItemRepository,
      knowledgeEvidenceRepository,
      learningObjectiveRepository,
      examProfileRepository,
      examFocusRepository,
      questionRepository,
      questionObjectiveRepository,
      questionSourceRepository
    },
    noteService,
    folderService,
    tagService,
    tagGroupService,
    contentAnnotationService,
    knowledgeSpaceService,
    searchService,
    noteVersionService,
    knowledgeItemService,
    learningObjectiveService,
    examProfileService,
    examFocusService,
    questionService,
    workspaceQueryService,
    deleteFolderAndCleanup,
    deleteTagAndCleanup,
    mergeTags
  };
}

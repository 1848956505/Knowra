import { createAsyncNoteService } from './application/postgres-async/note-service.js';
import { createAsyncFolderService } from './application/postgres-async/folder-service.js';
import { createAsyncTagService } from './application/postgres-async/tag-service.js';
import { createAsyncTagGroupService } from './application/postgres-async/tag-group-service.js';
import { createAsyncKnowledgeSpaceService } from './application/postgres-async/space-service.js';
import { createAsyncContentAnnotationService } from './application/postgres-async/content-annotation-service.js';
import { createAsyncNoteVersionService } from './application/note-version-service.js';
import { createAsyncKnowledgeItemService } from './application/postgres-async/knowledge-domain-service.js';
import { createAsyncSearchService } from './application/postgres-async/search-service.js';
import { createPostgresNoteRepository } from './infrastructure/postgres/note-repository.js';
import { createPostgresContentAnnotationRepository } from './infrastructure/postgres/content-annotation-repository.js';
import { createPostgresNoteVersionRepository } from './infrastructure/postgres/note-version-repository.js';
import { createPostgresKnowledgeItemRepository } from './infrastructure/postgres/knowledge-item-repository.js';
import { createPostgresKnowledgeEvidenceRepository } from './infrastructure/postgres/knowledge-evidence-repository.js';
import { createPostgresLearningObjectiveRepository } from './infrastructure/postgres/learning-objective-repository.js';
import { createPostgresExamProfileRepository } from './infrastructure/postgres/exam-profile-repository.js';
import { createPostgresExamFocusRepository } from './infrastructure/postgres/exam-focus-repository.js';
import { createPostgresQuestionRepository } from './infrastructure/postgres/question-repository.js';
import { createPostgresQuestionObjectiveRepository } from './infrastructure/postgres/question-objective-repository.js';
import { createPostgresQuestionSourceRepository } from './infrastructure/postgres/question-source-repository.js';
import { createAsyncLearningObjectiveService } from './application/postgres-async/learning-objective-service.js';
import { createAsyncAssessmentContextService } from './application/postgres-async/assessment-context-service.js';
import { createAsyncQuestionService } from './application/postgres-async/question-service.js';
import { createWorkspaceQueryService } from './application/workspace-query-service.js';
import { conflictError, validationError } from './application/knowledge-errors.js';
import { withPostgresErrors } from '../../infrastructure/postgres-errors.js';

export function createPostgresKnowledgeModule({
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
  questionSourceRepository,
  client = null
} = {}) {
  const repositories = {
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
  };
  Object.entries(repositories).forEach(([name, repository]) => {
    if (!repository?.supportsAsync) throw new TypeError(`Missing PostgreSQL repository: ${name}`);
  });

  const transactionRepositories = {
    noteRepository,
    noteVersionRepository,
    knowledgeItemRepository,
    knowledgeEvidenceRepository,
    contentAnnotationRepository,
    learningObjectiveRepository,
    examProfileRepository,
    examFocusRepository,
    questionRepository,
    questionObjectiveRepository,
    questionSourceRepository
  };
  function createTransactionFormalServices(transaction) {
    const transactionQuestionService = createAsyncQuestionService({
      repository: transaction.questionRepository,
      questionObjectiveRepository: transaction.questionObjectiveRepository,
      questionSourceRepository: transaction.questionSourceRepository,
      learningObjectiveRepository: transaction.learningObjectiveRepository,
      examFocusRepository: transaction.examFocusRepository,
      knowledgeItemRepository: transaction.knowledgeItemRepository,
      noteRepository: transaction.noteRepository,
      noteVersionRepository: transaction.noteVersionRepository,
      knowledgeEvidenceRepository: transaction.knowledgeEvidenceRepository,
      runTransaction: (operation) => operation(transaction)
    });
    const transactionLearningObjectiveService = createAsyncLearningObjectiveService({
      repository: transaction.learningObjectiveRepository,
      knowledgeItemRepository: transaction.knowledgeItemRepository,
      onObjectiveInvalidated: (learningObjectiveId) => (
        transactionQuestionService.invalidateByObjectiveId(learningObjectiveId)
      ),
      runTransaction: (operation) => operation(transaction)
    });
    const transactionKnowledgeItemService = createAsyncKnowledgeItemService({
      repository: transaction.knowledgeItemRepository,
      evidenceRepository: transaction.knowledgeEvidenceRepository,
      noteVersionRepository: transaction.noteVersionRepository,
      annotationRepository: transaction.contentAnnotationRepository,
      noteRepository: transaction.noteRepository,
      onItemInvalidated: async (knowledgeItemId) => {
        await transactionLearningObjectiveService.invalidateByKnowledgeItemId(
          knowledgeItemId
        );
        await transactionQuestionService.markSourcesStale(
          'knowledgeItem',
          [knowledgeItemId]
        );
      },
      runTransaction: (operation) => operation(transaction)
    });
    return {
      knowledgeItemService: transactionKnowledgeItemService,
      questionService: transactionQuestionService
    };
  }
  function buildNoteTransactionContext(transaction) {
    const formalServices = createTransactionFormalServices(transaction);
    return {
      noteRepository: transaction.noteRepository,
      noteVersionService: createAsyncNoteVersionService({ repository: transaction.noteVersionRepository }),
      onNoteContentChanged: async (note, version) => {
        const changed = await formalServices.knowledgeItemService.markEvidenceByNoteId(note.id, 'stale');
        await formalServices.questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
        const versions = await transaction.noteVersionRepository.list({ noteId: note.id });
        await formalServices.questionService.markSourcesStale(
          'noteVersion',
          versions
            .filter((candidate) => candidate.id !== version.id)
            .map((candidate) => candidate.id)
        );
        await transaction.contentAnnotationRepository.markStaleByNoteId(note.id, note.contentHash);
      },
      onNoteDeleted: async (noteId) => {
        const changed = await formalServices.knowledgeItemService.markEvidenceByNoteId(noteId, 'invalid');
        await formalServices.questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
        const versions = await transaction.noteVersionRepository.list({ noteId });
        await formalServices.questionService.markSourcesStale(
          'noteVersion',
          versions.map((version) => version.id)
        );
      },
      onBeforePermanentDelete: async (noteId) => {
        if ((await transaction.knowledgeEvidenceRepository.list({ noteId })).length > 0) {
          throw conflictError(
            'NOTE_HAS_KNOWLEDGE_EVIDENCE',
            'Note has formal knowledge evidence and cannot be permanently deleted'
          );
        }
        const versions = await transaction.noteVersionRepository.list({ noteId });
        const versionIds = new Set(versions.map((version) => version.id));
        const sources = await transaction.questionSourceRepository.list();
        if (sources.some((source) => (
          source.sourceType === 'noteVersion'
          && versionIds.has(source.sourceId)
        ))) {
          throw conflictError(
            'NOTE_HAS_QUESTION_SOURCE',
            'Note has a formal question source and cannot be permanently deleted'
          );
        }
      }
    };
  }
  const runTransaction = client?.$transaction
    ? (operation) => withPostgresErrors(() => client.$transaction(
      async (tx) => operation({
        noteRepository: createPostgresNoteRepository({ db: tx }),
        noteVersionRepository: createPostgresNoteVersionRepository({ db: tx }),
        knowledgeItemRepository: createPostgresKnowledgeItemRepository({ db: tx }),
        knowledgeEvidenceRepository: createPostgresKnowledgeEvidenceRepository({ db: tx }),
        contentAnnotationRepository: createPostgresContentAnnotationRepository({ db: tx }),
        learningObjectiveRepository: createPostgresLearningObjectiveRepository({ db: tx }),
        examProfileRepository: createPostgresExamProfileRepository({ db: tx }),
        examFocusRepository: createPostgresExamFocusRepository({ db: tx }),
        questionRepository: createPostgresQuestionRepository({ db: tx }),
        questionObjectiveRepository: createPostgresQuestionObjectiveRepository({ db: tx }),
        questionSourceRepository: createPostgresQuestionSourceRepository({ db: tx })
      }),
      { isolationLevel: 'Serializable' }
    ))
    : (operation) => operation(transactionRepositories);

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

  const folderService = createAsyncFolderService({
    repository: folderRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'FOLDER'),
    validateSiblingNameConflict: assertSiblingNameAvailable
  });
  const tagService = createAsyncTagService({
    repository: tagRepository,
    validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG'),
    validateGroupReference: async (groupId, spaceId) => {
      if (!groupId) return;
      const group = await tagGroupRepository.findById(groupId);
      if (!group) throw validationError('TAG_GROUP_NOT_FOUND', 'The referenced tag group does not exist');
      if (group.spaceId !== spaceId) throw validationError('TAG_GROUP_SPACE_MISMATCH', 'The referenced tag group belongs to another knowledge space');
    }
  });
  const tagGroupService = createAsyncTagGroupService({ repository: tagGroupRepository, tagRepository, validateSpaceReference: (spaceId) => assertSpaceReference(spaceId, 'TAG_GROUP') });
  const knowledgeSpaceService = createAsyncKnowledgeSpaceService({
    repository: knowledgeSpaceRepository
  });
  const noteVersionService = createAsyncNoteVersionService({ repository: noteVersionRepository });
  let learningObjectiveService = null;
  let questionService = null;
  const knowledgeItemService = createAsyncKnowledgeItemService({
    repository: knowledgeItemRepository,
    evidenceRepository: knowledgeEvidenceRepository,
    noteVersionRepository,
    annotationRepository: contentAnnotationRepository,
    noteRepository,
    onItemInvalidated: async (knowledgeItemId) => {
      await learningObjectiveService?.invalidateByKnowledgeItemId(knowledgeItemId);
      await questionService?.markSourcesStale('knowledgeItem', [knowledgeItemId]);
    },
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      itemRepository: transaction.knowledgeItemRepository,
      evidenceRepository: transaction.knowledgeEvidenceRepository,
      noteRepository: transaction.noteRepository,
      noteVersionRepository: transaction.noteVersionRepository,
      annotationRepository: transaction.contentAnnotationRepository
    }))
  });
  learningObjectiveService = createAsyncLearningObjectiveService({
    repository: learningObjectiveRepository,
    knowledgeItemRepository,
    onObjectiveInvalidated: (learningObjectiveId) => (
      questionService?.invalidateByObjectiveId(learningObjectiveId)
    ),
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      learningObjectiveRepository: transaction.learningObjectiveRepository
    }))
  });
  const { profileService: examProfileService, focusService: examFocusService } = createAsyncAssessmentContextService({
    examProfileRepository,
    examFocusRepository,
    learningObjectiveRepository,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      examProfileRepository: transaction.examProfileRepository,
      examFocusRepository: transaction.examFocusRepository,
      learningObjectiveRepository: transaction.learningObjectiveRepository
    }))
  });
  questionService = createAsyncQuestionService({
    repository: questionRepository,
    questionObjectiveRepository,
    questionSourceRepository,
    learningObjectiveRepository,
    examFocusRepository,
    knowledgeItemRepository,
    noteRepository,
    noteVersionRepository,
    knowledgeEvidenceRepository,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      questionRepository: transaction.questionRepository,
      questionObjectiveRepository: transaction.questionObjectiveRepository,
      questionSourceRepository: transaction.questionSourceRepository
    }))
  });
  const contentAnnotationService = createAsyncContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository,
    noteVersionRepository,
    onAnnotationArchived: async (annotationId) => {
      const changed = await knowledgeItemService.markEvidenceByAnnotationId(annotationId, 'invalid');
      await questionService.markSourcesStale(
        'knowledgeEvidence',
        changed.map((evidence) => evidence.id)
      );
    }
  });
  async function normalizeTagIds(tagIds) {
    const uniqueIds = [...new Set(tagIds)];
    const tags = await tagRepository.findByIds(uniqueIds);
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    const normalized = [];
    const singleIndexes = new Map();
    for (const tagId of uniqueIds) {
      const tag = byId.get(tagId);
      const group = tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null;
      if (group?.selectionMode === 'single') {
        const previous = singleIndexes.get(group.id);
        if (previous !== undefined) normalized[previous] = null;
        singleIndexes.set(group.id, normalized.length);
      }
      normalized.push(tagId);
    }
    return normalized.filter(Boolean);
  }
  const noteService = createAsyncNoteService({
    repository: noteRepository,
    noteVersionService,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation(buildNoteTransactionContext(transaction))),
    onNoteContentChanged: async (note) => {
      await knowledgeItemService.markEvidenceByNoteId(note.id, 'stale');
      return contentAnnotationService.markStaleForNote(note.id, note.contentHash);
    },
    onNoteDeleted: (noteId) => knowledgeItemService.markEvidenceByNoteId(noteId, 'invalid'),
    onBeforePermanentDelete: async (noteId) => {
      if ((await knowledgeEvidenceRepository.list({ noteId })).length > 0) {
        throw conflictError('NOTE_HAS_KNOWLEDGE_EVIDENCE', 'Note has formal knowledge evidence and cannot be permanently deleted');
      }
      const versions = await noteVersionRepository.list({ noteId });
      const versionIds = new Set(versions.map((version) => version.id));
      const sources = await questionSourceRepository.list();
      if (sources.some((source) => (
        source.sourceType === 'noteVersion'
        && versionIds.has(source.sourceId)
      ))) {
        throw conflictError(
          'NOTE_HAS_QUESTION_SOURCE',
          'Note has a formal question source and cannot be permanently deleted'
        );
      }
    },
    validateNoteReferences: assertNoteReferences,
    normalizeTagIds,
    validateSiblingNameConflict: assertSiblingNameAvailable
  });
  const searchService = createAsyncSearchService({
    listNotes: (options) => noteService.listNotes(options)
  });
  const workspaceQueryService = createWorkspaceQueryService({ repositories });

  return {
    repositories,
    noteService,
    folderService,
    tagService,
    tagGroupService,
    contentAnnotationService,
    noteVersionService,
    knowledgeItemService,
    learningObjectiveService,
    examProfileService,
    examFocusService,
    questionService,
    workspaceQueryService,
    knowledgeSpaceService,
    searchService,
    async deleteFolderAndCleanup(folderId) {
      const subtreeIds = await folderService.getFolderSubtreeIds(folderId);
      for (const id of subtreeIds) await noteService.clearFolderFromNotes(id);
      return folderService.deleteFolder(folderId);
    },
    async deleteTagAndCleanup(tagId) {
      const tag = await tagRepository.findById(tagId);
      if (tag?.isSystem) throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be deleted');
      await noteService.removeTagFromAllNotes(tagId);
      return tagService.deleteTag(tagId);
    },
    async mergeTags(sourceTagId, targetTagId) {
      const source = await tagRepository.findById(sourceTagId);
      const target = await tagRepository.findById(targetTagId);
      if (!source || !target) throw validationError('TAG_MERGE_TARGET_INVALID', 'Both tags must exist');
      if (source.isSystem) throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be merged');
      await noteService.replaceTagInAllNotes(sourceTagId, targetTagId);
      await tagRepository.delete(sourceTagId);
      return target;
    }
  };
}

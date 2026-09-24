import { createAsyncNoteService } from './application/postgres-async/note-service.js';
import { createAsyncFolderService } from './application/postgres-async/folder-service.js';
import { createAsyncTagService } from './application/postgres-async/tag-service.js';
import { createAsyncTagGroupService } from './application/postgres-async/tag-group-service.js';
import { createAsyncKnowledgeSpaceService } from './application/postgres-async/space-service.js';
import { createAsyncContentAnnotationService } from './application/postgres-async/content-annotation-service.js';
import { createAsyncNoteVersionService } from './application/note-version-service.js';
import { buildNoteVersionPrunePreview } from './application/note-version-prune-preview.js';
import { inspectSpaceDeletion, assertSpaceDeletionAllowed } from './application/space-deletion-preflight.js';
import { inspectSpaceMigration, assertSpaceMigrationAllowed } from './application/space-migration.js';
import { buildDefaultTagGroups } from './domain/default-tag-groups.js';
import { createAsyncKnowledgeItemService } from './application/postgres-async/knowledge-domain-service.js';
import { inspectKnowledgeItemPurge, assertKnowledgeItemPurgeAllowed } from './application/knowledge-item-purge.js';
import { createAsyncSearchService } from './application/postgres-async/search-service.js';
import { createPostgresNoteRepository } from './infrastructure/postgres/note-repository.js';
import { createPostgresFolderRepository } from './infrastructure/postgres/folder-repository.js';
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
import {
  createPostgresAnalysisScopeRepository,
  createPostgresAnnotationExclusionRepository,
  createPostgresAnnotationRevisionRepository
} from './infrastructure/postgres/annotation-support-repositories.js';
import { createAsyncAnnotationScopeService } from './application/postgres-async/annotation-scope-service.js';
import { createPostgresKnowledgeSpaceRepository } from './infrastructure/postgres/knowledge-space-repository.js';
import { createPostgresTagGroupRepository } from './infrastructure/postgres/tag-group-repository.js';
import { createPostgresTagRepository } from './infrastructure/postgres/tag-repository.js';
import { createAsyncLearningObjectiveService } from './application/postgres-async/learning-objective-service.js';
import { createAsyncAssessmentContextService } from './application/postgres-async/assessment-context-service.js';
import { createAsyncQuestionService } from './application/postgres-async/question-service.js';
import { createTrainingAssetLifecycle } from './application/training-asset-lifecycle.js';
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
  annotationExclusionRepository,
  annotationRevisionRepository,
  analysisScopeRepository,
  noteVersionRepository,
  knowledgeItemRepository,
  knowledgeEvidenceRepository,
  learningObjectiveRepository,
  examProfileRepository,
  examFocusRepository,
  questionRepository,
  questionObjectiveRepository,
  questionSourceRepository,
  client = null,
  getPurgeTombstone = null
} = {}) {
  const repositories = {
    noteRepository,
    folderRepository,
    tagRepository,
    tagGroupRepository,
    knowledgeSpaceRepository,
    contentAnnotationRepository,
    annotationExclusionRepository,
    annotationRevisionRepository,
    analysisScopeRepository,
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
    folderRepository,
    knowledgeSpaceRepository,
    tagRepository,
    tagGroupRepository,
    noteRepository,
    noteVersionRepository,
    knowledgeItemRepository,
    knowledgeEvidenceRepository,
    contentAnnotationRepository,
    annotationExclusionRepository,
    annotationRevisionRepository,
    analysisScopeRepository,
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
      getTombstone: getPurgeTombstone,
      runTransaction: (operation) => operation(transaction)
    });
    const transactionLearningObjectiveService = createAsyncLearningObjectiveService({
      repository: transaction.learningObjectiveRepository,
      knowledgeItemRepository: transaction.knowledgeItemRepository,
      getTombstone: getPurgeTombstone,
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
      getTombstone: getPurgeTombstone,
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
      annotationRepository: transaction.contentAnnotationRepository,
      noteVersionService: createAsyncNoteVersionService({ repository: transaction.noteVersionRepository }),
      onNoteContentChanged: async (note, version) => {
        const transactionAnnotationService = buildTransactionAnnotationServices(transaction).annotationService;
        const reconciliation = await transactionAnnotationService.reconcileForNote(note.id, version.contentHash);
        const changed = [];
        for (const annotationId of reconciliation.contentChangedAnnotationIds) {
          const annotation = await transaction.contentAnnotationRepository.findById(annotationId);
          changed.push(...await formalServices.knowledgeItemService.markEvidenceByAnnotationId(annotationId,
            annotation?.anchorStatus === 'missing' ? 'insufficient' : 'stale'));
        }
        await formalServices.questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
        const versions = await transaction.noteVersionRepository.list({ noteId: note.id });
        const directEvidence = [];
        for (const oldVersion of versions.filter((candidate) => candidate.id !== version.id)) {
          directEvidence.push(...await formalServices.knowledgeItemService.markEvidenceByNoteVersionId(oldVersion.id, 'stale', 'noteVersion'));
        }
        await formalServices.questionService.markSourcesStale('knowledgeEvidence', directEvidence.map((record) => record.id));
        await formalServices.questionService.markSourcesStale(
          'noteVersion',
          versions
            .filter((candidate) => candidate.id !== version.id)
            .map((candidate) => candidate.id)
        );
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
        const snapshots = await transaction.analysisScopeRepository.list();
        if (snapshots.some((snapshot) => snapshot.noteVersions?.some((version) => versionIds.has(version.noteVersionId)))) {
          throw conflictError('NOTE_HAS_ANALYSIS_SCOPE', 'NoteVersion is referenced by an analysis scope snapshot and cannot be deleted');
        }
      }
    };
  }
  const runTransaction = client?.$transaction
    ? (operation) => withPostgresErrors(() => client.$transaction(
      async (tx) => operation({
        folderRepository: createPostgresFolderRepository({ db: tx }),
        knowledgeSpaceRepository: createPostgresKnowledgeSpaceRepository({ db: tx }),
        tagRepository: createPostgresTagRepository({ db: tx }),
        tagGroupRepository: createPostgresTagGroupRepository({ db: tx }),
        noteRepository: createPostgresNoteRepository({ db: tx }),
        noteVersionRepository: createPostgresNoteVersionRepository({ db: tx }),
        knowledgeItemRepository: createPostgresKnowledgeItemRepository({ db: tx }),
        knowledgeEvidenceRepository: createPostgresKnowledgeEvidenceRepository({ db: tx }),
        contentAnnotationRepository: createPostgresContentAnnotationRepository({ db: tx }),
        annotationExclusionRepository: createPostgresAnnotationExclusionRepository({ db: tx }),
        annotationRevisionRepository: createPostgresAnnotationRevisionRepository({ db: tx }),
        analysisScopeRepository: createPostgresAnalysisScopeRepository({ db: tx }),
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
  const trainingAssetLifecycle = createTrainingAssetLifecycle({ repositories, runTransaction, getTombstone: getPurgeTombstone });

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
    repository: knowledgeSpaceRepository,
    tagGroupRepository,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      knowledgeSpaceRepository: transaction.knowledgeSpaceRepository,
      tagGroupRepository: transaction.tagGroupRepository
    }))
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
    getTombstone: getPurgeTombstone,
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
  for (const method of ['updateItem', 'confirmItem', 'markNeedsRevision', 'archive', 'restore', 'trash', 'restoreDeleted']) {
    knowledgeItemService[method] = (...args) => runTransaction((transaction) => (
      createTransactionFormalServices(transaction).knowledgeItemService[method](...args)
    ));
  }
  learningObjectiveService = createAsyncLearningObjectiveService({
    repository: learningObjectiveRepository,
    knowledgeItemRepository,
    getTombstone: getPurgeTombstone,
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
    getTombstone: getPurgeTombstone,
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
    getTombstone: getPurgeTombstone,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation({
      questionRepository: transaction.questionRepository,
      questionObjectiveRepository: transaction.questionObjectiveRepository,
      questionSourceRepository: transaction.questionSourceRepository
    }))
  });
  const directAnnotationService = createAsyncContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository,
    noteVersionRepository,
    revisionRepository: annotationRevisionRepository
  });
  const buildTransactionAnnotationServices = (transaction) => {
    const annotationService = createAsyncContentAnnotationService({
      repository: transaction.contentAnnotationRepository,
      noteRepository: transaction.noteRepository,
      noteVersionRepository: transaction.noteVersionRepository,
      revisionRepository: transaction.annotationRevisionRepository,
      onSourceChanged: async (annotation) => {
        const formal = createTransactionFormalServices(transaction);
        const changed = await formal.knowledgeItemService.markEvidenceByAnnotationId(annotation.id, annotation.anchorStatus === 'missing' ? 'insufficient' : 'stale');
        await formal.questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      }
    });
    const scopeService = createAsyncAnnotationScopeService({
      annotationService,
      annotationRepository: transaction.contentAnnotationRepository,
      exclusionRepository: transaction.annotationExclusionRepository,
      analysisScopeRepository: transaction.analysisScopeRepository,
      noteRepository: transaction.noteRepository,
      noteVersionRepository: transaction.noteVersionRepository,
      evidenceRepository: transaction.knowledgeEvidenceRepository,
      knowledgeItemRepository: transaction.knowledgeItemRepository
    });
    return { annotationService, scopeService };
  };
  const annotationMutation = (method) => (...args) => runTransaction((transaction) => (
    buildTransactionAnnotationServices(transaction).annotationService[method](...args)
  ));
  const contentAnnotationService = {
    listAnnotationsByNote: (...args) => directAnnotationService.listAnnotationsByNote(...args),
    getAnnotation: (...args) => directAnnotationService.getAnnotation(...args),
    ...Object.fromEntries([
      'createAnnotation', 'updateAnnotation', 'advanceRevision', 'archiveAnnotation', 'deleteAnnotation',
      'restoreAnnotation', 'updateAnnotationAnchor', 'markAnnotationStale', 'markStaleForNote',
      'reconcileForNote'
    ].map((method) => [method, annotationMutation(method)]))
  };
  const directScopeService = createAsyncAnnotationScopeService({
    annotationService: directAnnotationService,
    annotationRepository: contentAnnotationRepository,
    exclusionRepository: annotationExclusionRepository,
    analysisScopeRepository,
    noteRepository,
    noteVersionRepository,
    evidenceRepository: knowledgeEvidenceRepository,
    knowledgeItemRepository
  });
  const scopeMutation = (method) => (...args) => runTransaction((transaction) => (
    buildTransactionAnnotationServices(transaction).scopeService[method](...args)
  ));
  const annotationScopeService = {
    previewAnnotation: (...args) => directScopeService.previewAnnotation(...args),
    getKnowledgeLinks: (...args) => directScopeService.getKnowledgeLinks(...args),
    previewAnalysisScope: (...args) => directScopeService.previewAnalysisScope(...args),
    getAnalysisScope: (...args) => directScopeService.getAnalysisScope(...args),
    createExclusion: scopeMutation('createExclusion'),
    deleteExclusion: scopeMutation('deleteExclusion'),
    createAnalysisScope: scopeMutation('createAnalysisScope')
  };
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
    annotationRepository: contentAnnotationRepository,
    noteVersionService,
    runTransaction: async (operation) => runTransaction(async (transaction) => operation(buildNoteTransactionContext(transaction))),
    onNoteContentChanged: async (note, version) => {
      const reconciliation = await contentAnnotationService.reconcileForNote(note.id, version?.contentHash ?? note.contentHash);
      for (const annotationId of reconciliation.contentChangedAnnotationIds) {
        await knowledgeItemService.markEvidenceByAnnotationId(annotationId, 'stale');
      }
      return reconciliation;
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
      const snapshots = await analysisScopeRepository.list();
      if (snapshots.some((snapshot) => snapshot.noteVersions?.some((version) => versionIds.has(version.noteVersionId)))) {
        throw conflictError('NOTE_HAS_ANALYSIS_SCOPE', 'NoteVersion is referenced by an analysis scope snapshot and cannot be deleted');
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

  async function inspectKnowledgePurge(id, source = repositories) {
    const [item, evidence, learningObjectives, questionSources, analysisScopes] = await Promise.all([
      source.knowledgeItemRepository.findById(id),
      source.knowledgeEvidenceRepository.list({ knowledgeItemId: id }),
      source.learningObjectiveRepository.list({ includeArchived: true }),
      source.questionSourceRepository.list(),
      source.analysisScopeRepository.list({ includeDeleted: true })
    ]);
    return inspectKnowledgeItemPurge({ item, evidence, learningObjectives, questionSources, analysisScopes });
  }

  async function permanentlyDeleteKnowledgeItem(id, { expectedUpdatedAt } = {}) {
    return runTransaction(async transaction => {
      if (!(await transaction.knowledgeItemRepository.findById(id))) {
        const tombstone = await getPurgeTombstone?.('knowledgeItems', id);
        if (!expectedUpdatedAt || !tombstone || (tombstone.previousUpdatedAt && tombstone.previousUpdatedAt !== expectedUpdatedAt)) {
          throw validationError('KNOWLEDGE_ITEM_NOT_FOUND', '知识点不存在');
        }
        return { status: 'already-purged', asset: { type: 'knowledgeItem', id }, exclusiveRecordsDeleted: { knowledgeEvidence: 0 }, offlineDevices: 'pending-sync', backups: 'retention-managed' };
      }
      const preflight = await inspectKnowledgePurge(id, transaction);
      assertKnowledgeItemPurgeAllowed(preflight, expectedUpdatedAt);
      const removedEvidence = await transaction.knowledgeEvidenceRepository.deleteByKnowledgeItemId(id);
      await transaction.knowledgeItemRepository.delete(id);
      return {
        status: 'subject-purged', asset: preflight.asset,
        exclusiveRecordsDeleted: { knowledgeEvidence: removedEvidence.length },
        offlineDevices: 'pending-sync', backups: 'retention-managed'
      };
    });
  }

  async function previewNoteVersionPrune(noteId) {
    const [note, versions, evidence, questionSources, annotations, exclusions, analysisScopes] = await Promise.all([
      noteRepository.findById(noteId), noteVersionRepository.list({ noteId }),
      knowledgeEvidenceRepository.list({ noteId }), questionSourceRepository.list(),
      contentAnnotationRepository.list({ noteId, includeDeleted: true }),
      annotationExclusionRepository.list({ includeDeleted: true }),
      analysisScopeRepository.list({ includeDeleted: true })
    ]);
    if (!note) throw validationError('NOTE_NOT_FOUND', '笔记不存在');
    return buildNoteVersionPrunePreview({ note, versions, evidence, questionSources, annotations, exclusions, analysisScopes });
  }

  async function inspectEmptySpaceDeletion(id, ownerId = null, source = repositories) {
    const [space, folders, notes, tags, tagGroups, annotations, analysisScopes] = await Promise.all([
      source.knowledgeSpaceRepository.findById(id),
      source.folderRepository.list({ spaceId: id, includeDeleted: true }),
      source.noteRepository.list({ spaceId: id, includeDeleted: true }),
      source.tagRepository.list({ spaceId: id }),
      source.tagGroupRepository.list({ spaceId: id }),
      source.contentAnnotationRepository.list({ spaceId: id, includeDeleted: true }),
      source.analysisScopeRepository.list({ spaceId: id, includeDeleted: true })
    ]);
    if (space && ownerId && space.userId !== ownerId) throw validationError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在');
    return inspectSpaceDeletion({ space, folders, notes, tags, tagGroups, annotations, analysisScopes });
  }

  async function deleteEmptySpace(id, { expectedUpdatedAt } = {}, ownerId = null) {
    return runTransaction(async transaction => {
      const preflight = await inspectEmptySpaceDeletion(id, ownerId, transaction);
      assertSpaceDeletionAllowed(preflight, expectedUpdatedAt);
      for (const groupId of preflight.systemGroupIds) await transaction.tagGroupRepository.delete(groupId);
      await transaction.knowledgeSpaceRepository.delete(id);
      return { status: 'empty-container-deleted', asset: preflight.asset, offlineDevices: 'pending-sync', backups: 'retention-managed' };
    });
  }

  async function loadSpaceAssets(id, source = repositories) {
    const [folders, notes, tags, tagGroups, annotations, analysisScopes] = await Promise.all([
      source.folderRepository.list({ spaceId: id, includeDeleted: true }),
      source.noteRepository.list({ spaceId: id, includeDeleted: true }),
      source.tagRepository.list({ spaceId: id }), source.tagGroupRepository.list({ spaceId: id }),
      source.contentAnnotationRepository.list({ spaceId: id, includeDeleted: true }),
      source.analysisScopeRepository.list({ spaceId: id, includeDeleted: true })
    ]);
    return { folders, notes, tags, tagGroups, annotations, analysisScopes };
  }

  async function previewSpaceMigration(sourceId, targetId, ownerId = null, source = repositories) {
    const [origin, target, sourceAssets, targetAssets, allNotes, allNoteVersions] = await Promise.all([
      source.knowledgeSpaceRepository.findById(sourceId), source.knowledgeSpaceRepository.findById(targetId),
      loadSpaceAssets(sourceId, source), loadSpaceAssets(targetId, source), source.noteRepository.list({ includeDeleted: true }), source.noteVersionRepository.list()
    ]);
    if (ownerId && ((origin && origin.userId !== ownerId) || (target && target.userId !== ownerId))) throw validationError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在');
    return inspectSpaceMigration({ source: origin, target, sourceAssets, targetAssets, allNotes, allNoteVersions });
  }

  async function migrateSpaceAssets(sourceId, { targetSpaceId, expectedPreviewHash } = {}, ownerId = null) {
    return runTransaction(async transaction => {
      const preview = await previewSpaceMigration(sourceId, targetSpaceId, ownerId, transaction);
      assertSpaceMigrationAllowed(preview, expectedPreviewHash);
      const source = await loadSpaceAssets(sourceId, transaction);
      let targetGroups = await transaction.tagGroupRepository.list({ spaceId: targetSpaceId });
      for (const definition of buildDefaultTagGroups(targetSpaceId)) {
        if (!targetGroups.some(group => group.code === definition.code)) await transaction.tagGroupRepository.create(definition);
      }
      targetGroups = await transaction.tagGroupRepository.list({ spaceId: targetSpaceId });
      const groupMap = new Map(source.tagGroups.filter(group => group.isSystem).map(group => [group.id, targetGroups.find(candidate => candidate.code === group.code).id]));
      for (const group of source.tagGroups.filter(group => !group.isSystem)) await transaction.tagGroupRepository.moveToSpace(group.id, targetSpaceId);
      for (const tag of source.tags) await transaction.tagRepository.save({ ...tag, spaceId: targetSpaceId, groupId: groupMap.get(tag.groupId) ?? tag.groupId ?? null });
      for (const folder of source.folders) await transaction.folderRepository.save({ ...folder, spaceId: targetSpaceId });
      for (const note of source.notes) await transaction.noteRepository.save({ ...note, spaceId: targetSpaceId });
      for (const annotation of source.annotations) await transaction.contentAnnotationRepository.save({ ...annotation, spaceId: targetSpaceId });
      for (const scope of source.analysisScopes) await transaction.analysisScopeRepository.moveToSpace(scope.id, targetSpaceId);
      return { status: 'scoped-assets-migrated', sourceSpaceId: sourceId, targetSpaceId, counts: preview.counts, globalKnowledgeAndTraining: 'unchanged', offlineDevices: 'pending-sync', backups: 'retention-managed' };
    });
  }

  return {
    repositories,
    noteService,
    folderService,
    tagService,
    tagGroupService,
    contentAnnotationService,
    annotationScopeService,
    noteVersionService,
    knowledgeItemService,
    learningObjectiveService,
    examProfileService,
    examFocusService,
    questionService,
    trainingAssetLifecycle,
    workspaceQueryService,
    knowledgeSpaceService,
    searchService,
    inspectKnowledgePurge,
    permanentlyDeleteKnowledgeItem,
    previewNoteVersionPrune,
    inspectEmptySpaceDeletion,
    deleteEmptySpace,
    previewSpaceMigration,
    migrateSpaceAssets,
    async deleteFolderAndCleanup(folderId, input = {}) {
      return runTransaction(async transaction => {
        const txFolderService = createAsyncFolderService({ repository: transaction.folderRepository, validateSiblingNameConflict: assertSiblingNameAvailable });
        const txNoteService = createAsyncNoteService({ repository: transaction.noteRepository, annotationRepository: transaction.contentAnnotationRepository, runTransaction: operation => operation(buildNoteTransactionContext(transaction)), validateSiblingNameConflict: assertSiblingNameAvailable });
        const root = await transaction.folderRepository.findById(folderId);
        if (!root || root.deletedAt) throw conflictError('FOLDER_NOT_FOUND', '文件夹不存在');
        if (!['keep', 'with-content'].includes(input.mode)) throw validationError('FOLDER_DELETE_MODE_REQUIRED', '请选择保留并移动内容，或将内容一起移入回收站');
        const subtreeIds = await txFolderService.getFolderSubtreeIds(folderId);
        const destinationId = Object.hasOwn(input, 'destinationId') ? input.destinationId : root.parentId ?? null;
        if (input.mode === 'keep' && destinationId) {
          const destination = await transaction.folderRepository.findById(destinationId);
          if (!destination || destination.deletedAt || destination.spaceId !== root.spaceId || subtreeIds.includes(destinationId)) throw conflictError('FOLDER_DESTINATION_INVALID', '目标文件夹不可用');
        }
        const notes = (await transaction.noteRepository.list({ spaceId: root.spaceId, includeDeleted: true })).filter(note => subtreeIds.includes(note.folderId));
        const packageId = `folder-${folderId}-${Date.now()}`;
        const noteIds = [];
        for (const note of notes.filter(note => !note.deleted)) {
          if (input.mode === 'keep') { await txNoteService.updateNote(note.id, { folderId: destinationId }); noteIds.push(note.id); }
          else {
            const deleted = await txNoteService.deleteNote(note.id);
            await transaction.noteRepository.save({ ...deleted, folderDeletionPackageId: packageId });
            noteIds.push(note.id);
          }
        }
        const deletionPackage = { id: packageId, mode: input.mode, folderIds: subtreeIds, noteIds, destinationId };
        return { folders: await txFolderService.trashFolder(folderId, deletionPackage), deletionPackage };
      });
    },
    async restoreDeletedFolder(folderId) {
      return runTransaction(async transaction => {
        const txFolderService = createAsyncFolderService({ repository: transaction.folderRepository, validateSiblingNameConflict: assertSiblingNameAvailable });
        const txNoteService = createAsyncNoteService({ repository: transaction.noteRepository, annotationRepository: transaction.contentAnnotationRepository, runTransaction: operation => operation(buildNoteTransactionContext(transaction)), validateSiblingNameConflict: assertSiblingNameAvailable });
        const root = await transaction.folderRepository.findById(folderId);
        const deletionPackage = root?.deletionPackage;
        if (!deletionPackage) throw conflictError('FOLDER_NOT_IN_TRASH', '文件夹不在回收站中');
        const folders = await txFolderService.restoreDeletedFolder(folderId);
        for (const noteId of deletionPackage.mode === 'with-content' ? deletionPackage.noteIds : []) {
          const note = await transaction.noteRepository.findById(noteId);
          if (note?.deleted && note.folderDeletionPackageId === deletionPackage.id) await txNoteService.restoreNote(noteId);
        }
        return { folders, deletionPackage };
      });
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

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
import {
  createInMemoryAnalysisScopeRepository,
  createInMemoryAnnotationExclusionRepository,
  createInMemoryAnnotationRevisionRepository
} from './infrastructure/annotation-support-repositories.js';
import { createAnnotationScopeService } from './application/annotation-scope-service.js';
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
import { buildNoteVersionPrunePreview } from './application/note-version-prune-preview.js';
import { inspectSpaceDeletion, assertSpaceDeletionAllowed } from './application/space-deletion-preflight.js';
import { inspectSpaceMigration, assertSpaceMigrationAllowed } from './application/space-migration.js';
import { buildDefaultTagGroups } from './domain/default-tag-groups.js';
import { createKnowledgeItemService } from './application/knowledge-item-service.js';
import { inspectKnowledgeItemPurge, assertKnowledgeItemPurgeAllowed } from './application/knowledge-item-purge.js';
import { createLearningObjectiveService } from './application/learning-objective-service.js';
import { createAssessmentContextService } from './application/assessment-context-service.js';
import { createQuestionService } from './application/question-service.js';
import { createLocalTrainingAssetLifecycle } from './application/training-asset-lifecycle.js';
import { createWorkspaceQueryService } from './application/workspace-query-service.js';
import { bindLocalServiceTransactions } from './application/local-service-transactions.js';
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
  const annotationExclusionRepository = options.annotationExclusionRepository ?? createInMemoryAnnotationExclusionRepository({ records: options.annotationExclusions ?? [] });
  const annotationRevisionRepository = options.annotationRevisionRepository ?? createInMemoryAnnotationRevisionRepository({ records: options.annotationRevisions ?? [] });
  const analysisScopeRepository = options.analysisScopeRepository ?? createInMemoryAnalysisScopeRepository({ records: options.analysisScopeSnapshots ?? [] });
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
    getTombstone: options.getPurgeTombstone,
    onItemInvalidated: (knowledgeItemId) => {
      learningObjectiveService?.invalidateByKnowledgeItemId(knowledgeItemId);
      questionService?.markSourcesStale('knowledgeItem', [knowledgeItemId]);
    },
    runTransaction
  });
  learningObjectiveService = createLearningObjectiveService({
    repository: learningObjectiveRepository,
    knowledgeItemRepository,
    getTombstone: options.getPurgeTombstone,
    onObjectiveInvalidated: (learningObjectiveId) => {
      questionService?.invalidateByObjectiveId(learningObjectiveId);
    },
    runTransaction
  });
  const { profileService: examProfileService, focusService: examFocusService } = createAssessmentContextService({
    examProfileRepository,
    examFocusRepository,
    learningObjectiveRepository,
    getTombstone: options.getPurgeTombstone,
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
    getTombstone: options.getPurgeTombstone,
    runTransaction
  });
  const trainingAssetLifecycle = createLocalTrainingAssetLifecycle({
    repositories: { learningObjectiveRepository, examProfileRepository, examFocusRepository, questionRepository,
      questionObjectiveRepository, questionSourceRepository, knowledgeItemRepository, analysisScopeRepository },
    runTransaction,
    getTombstone: options.getPurgeTombstone
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
    repository: knowledgeSpaceRepository,
    tagGroupRepository,
    runTransaction
  });
  const contentAnnotationService = createContentAnnotationService({
    repository: contentAnnotationRepository,
    noteRepository,
    noteVersionRepository,
    revisionRepository: annotationRevisionRepository,
    onSourceChanged: (annotation) => {
      const changed = knowledgeItemService.markEvidenceByAnnotationId(annotation.id, annotation.anchorStatus === 'missing' ? 'insufficient' : 'stale');
      questionService?.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
    }
  });
  const annotationScopeService = createAnnotationScopeService({
    annotationService: contentAnnotationService,
    annotationRepository: contentAnnotationRepository,
    exclusionRepository: annotationExclusionRepository,
    analysisScopeRepository,
    noteRepository,
    noteVersionRepository,
    evidenceRepository: knowledgeEvidenceRepository,
    knowledgeItemRepository
  });
  const noteService = createNoteService({
    repository: noteRepository,
    annotationRepository: contentAnnotationRepository,
    validateNoteReferences: assertNoteReferences,
    normalizeTagIds,
    noteVersionService,
    runTransaction,
    onNoteContentChanged: (note, version) => {
      const reconciliation = contentAnnotationService.reconcileForNote(note.id, version.contentHash);
      const changed = reconciliation.contentChangedAnnotationIds.flatMap((annotationId) => (
        knowledgeItemService.markEvidenceByAnnotationId(annotationId,
          contentAnnotationRepository.findById(annotationId)?.anchorStatus === 'missing' ? 'insufficient' : 'stale')
      ));
      questionService.markSourcesStale('knowledgeEvidence', changed.map((evidence) => evidence.id));
      const oldVersionIds = noteVersionService.listVersions({ noteId: note.id })
        .filter((candidate) => candidate.id !== version.id)
        .map((candidate) => candidate.id);
      const directEvidence = oldVersionIds.flatMap((id) => knowledgeItemService.markEvidenceByNoteVersionId(id, 'stale', 'noteVersion'));
      questionService.markSourcesStale('knowledgeEvidence', directEvidence.map((record) => record.id));
      questionService.markSourcesStale('noteVersion', oldVersionIds);
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
      if (analysisScopeRepository.list().some((snapshot) => (
        snapshot.noteVersions?.some((version) => versionIds.has(version.noteVersionId))
      ))) {
        throw conflictError('NOTE_HAS_ANALYSIS_SCOPE', 'NoteVersion is referenced by an analysis scope snapshot and cannot be deleted');
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

  function deleteFolderAndCleanup(folderId, input = {}) {
    return runTransaction(() => {
      const subtreeIds = folderService.getFolderSubtreeIds(folderId);
      const root = folderRepository.findById(folderId);
      const mode = input.mode;
      if (!['keep', 'with-content'].includes(mode)) throw validationError('FOLDER_DELETE_MODE_REQUIRED', '请选择保留并移动内容，或将内容一起移入回收站');
      const destinationId = Object.hasOwn(input, 'destinationId') ? input.destinationId : root.parentId ?? null;
      if (mode === 'keep' && destinationId) {
        const destination = folderRepository.findById(destinationId);
        if (!destination || destination.deletedAt || destination.spaceId !== root.spaceId || subtreeIds.includes(destinationId)) throw conflictError('FOLDER_DESTINATION_INVALID', '目标文件夹不可用');
      }
      const notes = noteRepository.list({ spaceId: root.spaceId, includeDeleted: true }).filter(note => subtreeIds.includes(note.folderId));
      const packageId = `folder-${folderId}-${Date.now()}`;
      const noteIds = [];
      for (const note of notes.filter(note => !note.deleted)) {
        if (mode === 'keep') { noteService.updateNote(note.id, { folderId: destinationId }); noteIds.push(note.id); }
        else {
          const deleted = noteService.deleteNote(note.id);
          noteRepository.save({ ...deleted, folderDeletionPackageId: packageId });
          noteIds.push(note.id);
        }
      }
      const deletionPackage = { id: packageId, mode, folderIds: subtreeIds, noteIds, destinationId };
      return { folders: folderService.trashFolder(folderId, deletionPackage), deletionPackage };
    });
  }

  function restoreDeletedFolder(folderId) {
    return runTransaction(() => {
      const root = folderRepository.findById(folderId);
      const deletionPackage = root?.deletionPackage;
      if (!deletionPackage) throw conflictError('FOLDER_NOT_IN_TRASH', '文件夹不在回收站中');
      const folders = folderService.restoreDeletedFolder(folderId);
      for (const noteId of deletionPackage.mode === 'with-content' ? deletionPackage.noteIds : []) {
        const note = noteRepository.findById(noteId);
        if (note?.deleted && note.folderDeletionPackageId === deletionPackage.id) noteService.restoreNote(noteId);
      }
      return { folders, deletionPackage };
    });
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

  function inspectKnowledgePurge(id) {
    const item = knowledgeItemRepository.findById(id);
    return inspectKnowledgeItemPurge({
      item,
      evidence: knowledgeEvidenceRepository.list({ knowledgeItemId: id }),
      learningObjectives: learningObjectiveRepository.list({ includeArchived: true }),
      questionSources: questionSourceRepository.list(),
      analysisScopes: analysisScopeRepository.list({ includeDeleted: true })
    });
  }

  function permanentlyDeleteKnowledgeItem(id, { expectedUpdatedAt } = {}) {
    return runTransaction(() => {
      if (!knowledgeItemRepository.findById(id)) {
        const tombstone = options.getPurgeTombstone?.('knowledgeItems', id);
        if (!expectedUpdatedAt || !tombstone || (tombstone.previousUpdatedAt && tombstone.previousUpdatedAt !== expectedUpdatedAt)) {
          throw validationError('KNOWLEDGE_ITEM_NOT_FOUND', '知识点不存在');
        }
        return { status: 'already-purged', asset: { type: 'knowledgeItem', id }, exclusiveRecordsDeleted: { knowledgeEvidence: 0 }, offlineDevices: 'pending-sync', backups: 'retention-managed' };
      }
      const preflight = inspectKnowledgePurge(id);
      assertKnowledgeItemPurgeAllowed(preflight, expectedUpdatedAt);
      const removedEvidence = knowledgeEvidenceRepository.deleteByKnowledgeItemId(id);
      knowledgeItemRepository.delete(id);
      return {
        status: 'subject-purged', asset: preflight.asset,
        exclusiveRecordsDeleted: { knowledgeEvidence: removedEvidence.length },
        offlineDevices: 'pending-sync', backups: 'retention-managed'
      };
    });
  }

  function previewNoteVersionPrune(noteId) {
    const note = noteRepository.findById(noteId);
    if (!note) throw validationError('NOTE_NOT_FOUND', '笔记不存在');
    return buildNoteVersionPrunePreview({
      note,
      versions: noteVersionRepository.list({ noteId }),
      evidence: knowledgeEvidenceRepository.list({ noteId }),
      questionSources: questionSourceRepository.list(),
      annotations: contentAnnotationRepository.list({ noteId, includeDeleted: true }),
      exclusions: annotationExclusionRepository.list({ includeDeleted: true }),
      analysisScopes: analysisScopeRepository.list({ includeDeleted: true })
    });
  }

  function inspectEmptySpaceDeletion(id, ownerId = null) {
    const space = knowledgeSpaceRepository.findById(id);
    if (space && ownerId && space.userId !== ownerId) throw validationError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在');
    return inspectSpaceDeletion({
      space,
      folders: folderRepository.list({ spaceId: id, includeDeleted: true }),
      notes: noteRepository.list({ spaceId: id, includeDeleted: true }),
      tags: tagRepository.list({ spaceId: id }),
      tagGroups: tagGroupRepository.list({ spaceId: id }),
      annotations: contentAnnotationRepository.list({ spaceId: id, includeDeleted: true }),
      analysisScopes: analysisScopeRepository.list({ spaceId: id, includeDeleted: true })
    });
  }

  function deleteEmptySpace(id, { expectedUpdatedAt } = {}, ownerId = null) {
    return runTransaction(() => {
      const preflight = inspectEmptySpaceDeletion(id, ownerId);
      assertSpaceDeletionAllowed(preflight, expectedUpdatedAt);
      preflight.systemGroupIds.forEach(groupId => tagGroupRepository.delete(groupId));
      knowledgeSpaceRepository.delete(id);
      return { status: 'empty-container-deleted', asset: preflight.asset, offlineDevices: 'pending-sync', backups: 'retention-managed' };
    });
  }

  function spaceAssets(id) {
    return {
      folders: folderRepository.list({ spaceId: id, includeDeleted: true }),
      notes: noteRepository.list({ spaceId: id, includeDeleted: true }),
      tags: tagRepository.list({ spaceId: id }),
      tagGroups: tagGroupRepository.list({ spaceId: id }),
      annotations: contentAnnotationRepository.list({ spaceId: id, includeDeleted: true }),
      analysisScopes: analysisScopeRepository.list({ spaceId: id, includeDeleted: true })
    };
  }

  function previewSpaceMigration(sourceId, targetId, ownerId = null) {
    const source = knowledgeSpaceRepository.findById(sourceId);
    const target = knowledgeSpaceRepository.findById(targetId);
    if (ownerId && ((source && source.userId !== ownerId) || (target && target.userId !== ownerId))) throw validationError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在');
    return inspectSpaceMigration({ source, target, sourceAssets: spaceAssets(sourceId), targetAssets: spaceAssets(targetId), allNotes: noteRepository.list({ includeDeleted: true }), allNoteVersions: noteVersionRepository.list() });
  }

  function migrateSpaceAssets(sourceId, { targetSpaceId, expectedPreviewHash } = {}, ownerId = null) {
    return runTransaction(() => {
      const preview = previewSpaceMigration(sourceId, targetSpaceId, ownerId);
      assertSpaceMigrationAllowed(preview, expectedPreviewHash);
      const source = spaceAssets(sourceId);
      const target = spaceAssets(targetSpaceId);
      for (const definition of buildDefaultTagGroups(targetSpaceId)) {
        if (!target.tagGroups.some(group => group.code === definition.code)) tagGroupRepository.create(definition);
      }
      const targetGroups = tagGroupRepository.list({ spaceId: targetSpaceId });
      const groupMap = new Map(source.tagGroups.filter(group => group.isSystem).map(group => [group.id, targetGroups.find(candidate => candidate.code === group.code).id]));
      for (const group of source.tagGroups.filter(group => !group.isSystem)) tagGroupRepository.save({ ...group, spaceId: targetSpaceId });
      for (const tag of source.tags) tagRepository.save({ ...tag, spaceId: targetSpaceId, groupId: groupMap.get(tag.groupId) ?? tag.groupId ?? null });
      for (const folder of source.folders) folderRepository.save({ ...folder, spaceId: targetSpaceId });
      for (const note of source.notes) noteRepository.save({ ...note, spaceId: targetSpaceId });
      for (const annotation of source.annotations) contentAnnotationRepository.save({ ...annotation, spaceId: targetSpaceId });
      for (const scope of source.analysisScopes) analysisScopeRepository.save({ ...scope, spaceId: targetSpaceId });
      return { status: 'scoped-assets-migrated', sourceSpaceId: sourceId, targetSpaceId, counts: preview.counts, globalKnowledgeAndTraining: 'unchanged', offlineDevices: 'pending-sync', backups: 'retention-managed' };
    });
  }

  // New service operations default to a transaction; only explicitly read-only
  // methods skip the snapshot/commit boundary. Nested writes share one commit.
  for (const [service, reads] of [
    [noteService, ['getNote', 'getLinkedNotes', 'listNotes']],
    [folderService, ['listFolders', 'listFolderTree', 'getFolderSubtreeIds']],
    [tagService, ['listTags']],
    [tagGroupService, ['listTagGroups']],
    [knowledgeSpaceService, ['listKnowledgeSpaces', 'createDefaultKnowledgeSpace']],
    [contentAnnotationService, ['listAnnotationsByNote', 'getAnnotation']],
    [annotationScopeService, ['previewAnnotation', 'getKnowledgeLinks', 'previewAnalysisScope', 'getAnalysisScope']],
    [noteVersionService, ['getVersion', 'listVersions']],
    [knowledgeItemService, ['getItem', 'listItems', 'listEvidence']],
    [learningObjectiveService, ['getObjective', 'listObjectives']],
    [examProfileService, ['get', 'list']],
    [examFocusService, ['get', 'list']],
    [questionService, ['getQuestion', 'listQuestions']]
  ]) {
    bindLocalServiceTransactions(service, runTransaction, reads);
  }

  return {
    repositories: {
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
    },
    noteService,
    folderService,
    tagService,
    tagGroupService,
    contentAnnotationService,
    annotationScopeService,
    knowledgeSpaceService,
    searchService,
    noteVersionService,
    knowledgeItemService,
    learningObjectiveService,
    examProfileService,
    examFocusService,
    questionService,
    trainingAssetLifecycle,
    workspaceQueryService,
    deleteFolderAndCleanup,
    restoreDeletedFolder,
    deleteTagAndCleanup,
    mergeTags,
    inspectKnowledgePurge,
    permanentlyDeleteKnowledgeItem,
    previewNoteVersionPrune,
    inspectEmptySpaceDeletion,
    deleteEmptySpace,
    previewSpaceMigration,
    migrateSpaceAssets
  };
}

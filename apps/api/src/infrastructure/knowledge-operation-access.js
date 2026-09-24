const MUTATION_OPERATIONS = new Set([
  'createNote', 'importMarkdown', 'importMarkdownBatch', 'updateNote', 'deleteNote',
  'deleteNotes', 'restoreNote', 'permanentlyDeleteNote', 'emptyRecycleBin', 'setFavorite',
  'removeTagFromNote', 'assignTagToNote', 'assignTagToNotes', 'setNoteTags',
  'updateTagsForNotes', 'createFolder', 'updateFolder', 'deleteFolder', 'createTag',
  'restoreFolder',
  'updateTag', 'deleteTag', 'reorderTags', 'mergeTags', 'createTagGroup',
  'updateTagGroup', 'deleteTagGroup', 'createAnnotation', 'updateAnnotation', 'deleteAnnotation',
  'restoreAnnotation', 'updateAnnotationAnchor', 'createKnowledgeItem',
  'createAnnotationExclusion', 'deleteAnnotationExclusion', 'createAnalysisScope',
  'trashAnalysisScope', 'restoreDeletedAnalysisScope',
  'updateKnowledgeItem', 'confirmKnowledgeItem', 'markKnowledgeItemNeedsRevision',
  'archiveKnowledgeItem', 'restoreKnowledgeItem', 'trashKnowledgeItem', 'restoreDeletedKnowledgeItem', 'permanentlyDeleteKnowledgeItem', 'createKnowledgeEvidence',
  'retireKnowledgeEvidence', 'readoptKnowledgeEvidence',
  'createLearningObjective', 'updateLearningObjective', 'confirmLearningObjective',
  'requestLearningObjectiveRevision', 'archiveLearningObjective',
  'restoreLearningObjective', 'createExamProfile', 'updateExamProfile',
  'archiveExamProfile', 'restoreExamProfile', 'createExamFocus', 'updateExamFocus',
  'confirmExamFocus', 'archiveExamFocus', 'restoreExamFocus', 'createQuestion',
  'updateQuestion', 'validateQuestion', 'submitQuestionForReview', 'confirmQuestion',
  'archiveQuestion', 'restoreQuestion', 'createDefaultKnowledgeSpace', 'createKnowledgeSpace',
  'trashTrainingAsset', 'restoreDeletedTrainingAsset', 'permanentlyDeleteTrainingAsset',
  'deleteEmptySpace', 'migrateSpaceAssets'
]);

const READ_OPERATIONS = new Set([
  'getNote', 'getLinkedNotes', 'listNotes', 'listFolders', 'listFolderTree', 'listTags',
  'listTagGroups', 'listAnnotations', 'getAnnotation', 'listNoteVersions', 'getNoteVersion', 'previewNoteVersionPrune',
  'previewAnnotation', 'getAnnotationKnowledgeLinks', 'previewAnalysisScope', 'getAnalysisScope',
  'listAnalysisScopes',
  'listKnowledgeItems', 'getKnowledgeItem', 'listKnowledgeEvidence', 'inspectKnowledgePurge',
  'listLearningObjectives', 'getLearningObjective', 'listExamProfiles', 'getExamProfile',
  'listExamFocuses', 'getExamFocus', 'listQuestions', 'getQuestion',
  'inspectTrainingAssetPurge',
  'getKnowledgeOverview', 'getTrainingOverview', 'listWorkspaceKnowledgeItems',
  'listWorkspaceLearningObjectives', 'listWorkspaceQuestions', 'listWorkspaceExamProfiles',
  'listReviewQueue', 'listKnowledgeSpaces', 'inspectEmptySpaceDeletion', 'previewSpaceMigration', 'searchNotes'
]);

export function getKnowledgeOperationAccess(name) {
  if (MUTATION_OPERATIONS.has(name)) return 'mutation';
  if (READ_OPERATIONS.has(name)) return 'read';
  throw new Error(`Knowledge handler "${name}" is missing explicit operation access metadata.`);
}

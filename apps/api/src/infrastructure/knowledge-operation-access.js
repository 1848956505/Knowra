const MUTATION_OPERATIONS = new Set([
  'createNote', 'importMarkdown', 'importMarkdownBatch', 'updateNote', 'deleteNote',
  'deleteNotes', 'restoreNote', 'permanentlyDeleteNote', 'emptyRecycleBin', 'setFavorite',
  'removeTagFromNote', 'assignTagToNote', 'assignTagToNotes', 'setNoteTags',
  'updateTagsForNotes', 'createFolder', 'updateFolder', 'deleteFolder', 'createTag',
  'updateTag', 'deleteTag', 'reorderTags', 'mergeTags', 'createTagGroup',
  'updateTagGroup', 'deleteTagGroup', 'createAnnotation', 'deleteAnnotation',
  'restoreAnnotation', 'updateAnnotationAnchor', 'createKnowledgeItem',
  'updateKnowledgeItem', 'confirmKnowledgeItem', 'markKnowledgeItemNeedsRevision',
  'archiveKnowledgeItem', 'restoreKnowledgeItem', 'createKnowledgeEvidence',
  'createLearningObjective', 'updateLearningObjective', 'confirmLearningObjective',
  'requestLearningObjectiveRevision', 'archiveLearningObjective',
  'restoreLearningObjective', 'createExamProfile', 'updateExamProfile',
  'archiveExamProfile', 'restoreExamProfile', 'createExamFocus', 'updateExamFocus',
  'confirmExamFocus', 'archiveExamFocus', 'restoreExamFocus', 'createQuestion',
  'updateQuestion', 'validateQuestion', 'submitQuestionForReview', 'confirmQuestion',
  'archiveQuestion', 'restoreQuestion', 'createDefaultKnowledgeSpace'
]);

const READ_OPERATIONS = new Set([
  'getNote', 'getLinkedNotes', 'listNotes', 'listFolders', 'listFolderTree', 'listTags',
  'listTagGroups', 'listAnnotations', 'getAnnotation', 'listNoteVersions', 'getNoteVersion',
  'listKnowledgeItems', 'getKnowledgeItem', 'listKnowledgeEvidence',
  'listLearningObjectives', 'getLearningObjective', 'listExamProfiles', 'getExamProfile',
  'listExamFocuses', 'getExamFocus', 'listQuestions', 'getQuestion',
  'getKnowledgeOverview', 'getTrainingOverview', 'listWorkspaceKnowledgeItems',
  'listWorkspaceLearningObjectives', 'listWorkspaceQuestions', 'listWorkspaceExamProfiles',
  'listReviewQueue', 'listKnowledgeSpaces', 'searchNotes'
]);

export function getKnowledgeOperationAccess(name) {
  if (MUTATION_OPERATIONS.has(name)) return 'mutation';
  if (READ_OPERATIONS.has(name)) return 'read';
  throw new Error(`Knowledge handler "${name}" is missing explicit operation access metadata.`);
}

export function createKnowledgeHttpHandlers({
  knowledgeModule,
  noteDeletionCoordinator,
  ownerId = 'demo'
}) {
  const {
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
    deleteFolderAndCleanup,
    deleteTagAndCleanup,
    mergeTags
  } = knowledgeModule;

  return {
    createNote(body) {
      return noteService.createNote(body);
    },
    importMarkdown(body) {
      return noteService.importMarkdown(body);
    },
    importMarkdownBatch(body) {
      return noteService.importMarkdownBatch(body.items ?? []);
    },
    getNote(params, query = {}) {
      return noteService.getNote(params.id, {
        includeDeleted: query.includeDeleted
      });
    },
    getLinkedNotes(params) {
      return noteService.getLinkedNotes(params.id);
    },
    listNotes(query = {}) {
      return noteService.listNotes(query);
    },
    updateNote(params, body) {
      return noteService.updateNote(params.id, body);
    },
    deleteNote(params) {
      return noteService.deleteNote(params.id);
    },
    deleteNotes(body = {}) {
      return noteService.deleteNotes(body.noteIds ?? []);
    },
    restoreNote(params) {
      return noteService.restoreNote(params.id);
    },
    permanentlyDeleteNote(params) {
      return (noteDeletionCoordinator ?? noteService)
        .permanentlyDeleteNote(params.id);
    },
    emptyRecycleBin(query = {}) {
      return (noteDeletionCoordinator ?? noteService)
        .emptyRecycleBin(query.spaceId ?? null);
    },
    setFavorite(params, body = {}) {
      return noteService.setFavorite(params.id, body.favorite ?? true);
    },
    removeTagFromNote(params) {
      return noteService.removeTagFromNote(params.id, params.tagId);
    },
    assignTagToNote(params, body = {}) {
      return noteService.assignTagToNote(params.id, body.tagId);
    },
    assignTagToNotes(body = {}) {
      return noteService.assignTagToNotes(body.noteIds ?? [], body.tagId);
    },
    setNoteTags(params, body) {
      return noteService.setNoteTags(params.id, body.tagIds ?? []);
    },
    createFolder(body) {
      return folderService.createFolder(body);
    },
    updateFolder(params, body) {
      return folderService.updateFolder(params.id, body);
    },
    deleteFolder(params) {
      return deleteFolderAndCleanup(params.id);
    },
    listFolders(query = {}) {
      return folderService.listFolders(query);
    },
    listFolderTree(query = {}) {
      return folderService.listFolderTree(query);
    },
    createTag(body) {
      return tagService.createTag(body);
    },
    updateTag(params, body) {
      return tagService.updateTag(params.id, body);
    },
    deleteTag(params) {
      return deleteTagAndCleanup(params.id);
    },
    listTags(query = {}) {
      return tagService.listTags(query);
    },
    reorderTags(body = {}) { return tagService.reorderTags(body.tagIds ?? []); },
    mergeTags(body = {}) { return mergeTags(body.sourceTagId, body.targetTagId); },
    createTagGroup(body) { return tagGroupService.createTagGroup(body); },
    updateTagGroup(params, body) { return tagGroupService.updateTagGroup(params.id, body); },
    deleteTagGroup(params) { return tagGroupService.deleteTagGroup(params.id); },
    listTagGroups(query = {}) { return tagGroupService.listTagGroups(query); },
    updateTagsForNotes(body = {}) {
      return noteService.updateTagsForNotes(body.noteIds ?? [], body.addTagIds ?? [], body.removeTagIds ?? []);
    },
    createAnnotation(body) { return contentAnnotationService.createAnnotation(body); },
    listAnnotations(query = {}) { return contentAnnotationService.listAnnotationsByNote(query); },
    getAnnotation(params) { return contentAnnotationService.getAnnotation(params.id); },
    deleteAnnotation(params) { return contentAnnotationService.archiveAnnotation(params.id); },
    restoreAnnotation(params) { return contentAnnotationService.restoreAnnotation(params.id); },
    updateAnnotationAnchor(params, body) { return contentAnnotationService.updateAnnotationAnchor(params.id, body); },
    listNoteVersions(params, query = {}) { return noteVersionService.listVersions({ noteId: params.id, ...query }); },
    getNoteVersion(params) { return noteVersionService.getVersion(params.versionId); },
    listKnowledgeItems(query = {}) { return knowledgeItemService.listItems(query); },
    getKnowledgeItem(params) { return knowledgeItemService.getItem(params.id); },
    createKnowledgeItem(body) { return knowledgeItemService.createCandidate(body); },
    updateKnowledgeItem(params, body) { return knowledgeItemService.updateItem(params.id, body); },
    confirmKnowledgeItem(params) { return knowledgeItemService.confirmItem(params.id); },
    markKnowledgeItemNeedsRevision(params) { return knowledgeItemService.markNeedsRevision(params.id); },
    archiveKnowledgeItem(params) { return knowledgeItemService.archive(params.id); },
    restoreKnowledgeItem(params) { return knowledgeItemService.restore(params.id); },
    listKnowledgeEvidence(params) { return knowledgeItemService.listEvidence(params.id); },
    createKnowledgeEvidence(params, body) { return knowledgeItemService.createEvidence({ ...body, knowledgeItemId: params.id }); },
    listLearningObjectives(query = {}) { return learningObjectiveService.listObjectives(query); },
    getLearningObjective(params) { return learningObjectiveService.getObjective(params.id); },
    createLearningObjective(body) { return learningObjectiveService.createCandidate(body); },
    updateLearningObjective(params, body) { return learningObjectiveService.updateObjective(params.id, body); },
    confirmLearningObjective(params) { return learningObjectiveService.confirmObjective(params.id); },
    requestLearningObjectiveRevision(params, body = {}) { return learningObjectiveService.requestRevision(params.id, body.reviewNote); },
    archiveLearningObjective(params) { return learningObjectiveService.archive(params.id); },
    restoreLearningObjective(params) { return learningObjectiveService.restore(params.id); },
    listExamProfiles() { return examProfileService.list(); },
    getExamProfile(params) { return examProfileService.get(params.id); },
    createExamProfile(body) { return examProfileService.create(body); },
    updateExamProfile(params, body) { return examProfileService.update(params.id, body); },
    archiveExamProfile(params) { return examProfileService.archive(params.id); },
    restoreExamProfile(params) { return examProfileService.restore(params.id); },
    listExamFocuses(query = {}) { return examFocusService.list(query); },
    getExamFocus(params) { return examFocusService.get(params.id); },
    createExamFocus(body) { return examFocusService.create(body); },
    updateExamFocus(params, body) { return examFocusService.update(params.id, body); },
    confirmExamFocus(params) { return examFocusService.confirm(params.id); },
    archiveExamFocus(params) { return examFocusService.archive(params.id); },
    restoreExamFocus(params) { return examFocusService.restore(params.id); },
    listQuestions(query = {}) { return questionService.listQuestions(query); },
    getQuestion(params) { return questionService.getQuestion(params.id); },
    createQuestion(body) { return questionService.createQuestion(body); },
    updateQuestion(params, body) { return questionService.updateQuestion(params.id, body); },
    validateQuestion(params) { return questionService.validateQuestion(params.id); },
    submitQuestionForReview(params) { return questionService.submitForReview(params.id); },
    confirmQuestion(params) { return questionService.confirmQuestion(params.id); },
    archiveQuestion(params) { return questionService.archiveQuestion(params.id); },
    restoreQuestion(params) { return questionService.restoreQuestion(params.id); },
    getKnowledgeOverview() { return knowledgeModule.workspaceQueryService.getKnowledgeOverview(); },
    getTrainingOverview() { return knowledgeModule.workspaceQueryService.getTrainingOverview(); },
    listWorkspaceKnowledgeItems(query = {}) { return knowledgeModule.workspaceQueryService.listKnowledgeItems(query); },
    listWorkspaceLearningObjectives(query = {}) { return knowledgeModule.workspaceQueryService.listLearningObjectives(query); },
    listWorkspaceQuestions(query = {}) { return knowledgeModule.workspaceQueryService.listQuestions(query); },
    listWorkspaceExamProfiles(query = {}) { return knowledgeModule.workspaceQueryService.listExamProfiles(query); },
    listReviewQueue(query = {}) { return knowledgeModule.workspaceQueryService.listReviewQueue(query); },
    createDefaultKnowledgeSpace() {
      return knowledgeSpaceService.createDefaultKnowledgeSpace({
        userId: ownerId
      });
    },
    listKnowledgeSpaces(query = {}) {
      return knowledgeSpaceService.listKnowledgeSpaces({
        ...query,
        userId: ownerId
      });
    },
    searchNotes(query) {
      const notes = searchService.searchNotes(query);
      return query.result === 'ids' ? notes.map((note) => note.id) : notes;
    }
  };
}

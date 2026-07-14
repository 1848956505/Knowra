export function createKnowledgeHttpHandlers({ knowledgeModule }) {
  const {
    noteService,
    folderService,
    tagService,
    contentAnnotationService,
    knowledgeSpaceService,
    searchService,
    deleteFolderAndCleanup,
    deleteTagAndCleanup
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
      return noteService.permanentlyDeleteNote(params.id);
    },
    emptyRecycleBin(query = {}) {
      return noteService.emptyRecycleBin(query.spaceId ?? null);
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
    createAnnotation(body) { return contentAnnotationService.createAnnotation(body); },
    listAnnotations(query = {}) { return contentAnnotationService.listAnnotationsByNote(query); },
    getAnnotation(params) { return contentAnnotationService.getAnnotation(params.id); },
    deleteAnnotation(params) { return contentAnnotationService.archiveAnnotation(params.id); },
    restoreAnnotation(params) { return contentAnnotationService.restoreAnnotation(params.id); },
    updateAnnotationAnchor(params, body) { return contentAnnotationService.updateAnnotationAnchor(params.id, body); },
    createDefaultKnowledgeSpace(body) {
      return knowledgeSpaceService.createDefaultKnowledgeSpace(body);
    },
    listKnowledgeSpaces(query = {}) {
      return knowledgeSpaceService.listKnowledgeSpaces(query);
    },
    searchNotes(query) {
      return searchService.searchNotes(query);
    }
  };
}

export function createPostgresKnowledgeHttpHandlers({
  knowledgeModule,
  noteDeletionCoordinator,
  ownerId = 'demo'
}) {
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
    createNote: (body) => noteService.createNote(body),
    importMarkdown: (body) => noteService.importMarkdown(body),
    importMarkdownBatch: (body) => noteService.importMarkdownBatch(body.items ?? []),
    getNote: (params, query = {}) => noteService.getNote(params.id, { includeDeleted: query.includeDeleted }),
    getLinkedNotes: (params) => noteService.getLinkedNotes(params.id),
    listNotes: (query = {}) => noteService.listNotes(query),
    updateNote: (params, body) => noteService.updateNote(params.id, body),
    deleteNote: (params) => noteService.deleteNote(params.id),
    deleteNotes: (body = {}) => noteService.deleteNotes(body.noteIds ?? []),
    restoreNote: (params) => noteService.restoreNote(params.id),
    permanentlyDeleteNote: (params) => (noteDeletionCoordinator ?? noteService).permanentlyDeleteNote(params.id),
    emptyRecycleBin: (query = {}) => (noteDeletionCoordinator ?? noteService).emptyRecycleBin(query.spaceId ?? null),
    setFavorite: (params, body = {}) => noteService.setFavorite(params.id, body.favorite ?? true),
    removeTagFromNote: (params) => noteService.removeTagFromNote(params.id, params.tagId),
    assignTagToNote: (params, body = {}) => noteService.assignTagToNote(params.id, body.tagId),
    assignTagToNotes: (body = {}) => noteService.assignTagToNotes(body.noteIds ?? [], body.tagId),
    setNoteTags: (params, body) => noteService.setNoteTags(params.id, body.tagIds ?? []),
    createFolder: (body) => folderService.createFolder(body),
    updateFolder: (params, body) => folderService.updateFolder(params.id, body),
    deleteFolder: (params) => deleteFolderAndCleanup(params.id),
    listFolders: (query = {}) => folderService.listFolders(query),
    listFolderTree: (query = {}) => folderService.listFolderTree(query),
    createTag: (body) => tagService.createTag(body),
    updateTag: (params, body) => tagService.updateTag(params.id, body),
    deleteTag: (params) => deleteTagAndCleanup(params.id),
    listTags: (query = {}) => tagService.listTags(query),
    createAnnotation: (body) => contentAnnotationService.createAnnotation(body),
    listAnnotations: (query = {}) => contentAnnotationService.listAnnotationsByNote(query),
    getAnnotation: (params) => contentAnnotationService.getAnnotation(params.id),
    deleteAnnotation: (params) => contentAnnotationService.archiveAnnotation(params.id),
    restoreAnnotation: (params) => contentAnnotationService.restoreAnnotation(params.id),
    updateAnnotationAnchor: (params, body) => contentAnnotationService.updateAnnotationAnchor(params.id, body),
    createDefaultKnowledgeSpace: () => knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: ownerId }),
    listKnowledgeSpaces: (query = {}) => knowledgeSpaceService.listKnowledgeSpaces({ ...query, userId: ownerId }),
    async searchNotes(query = {}) {
      const notes = await searchService.searchNotes(query);
      return query.result === 'ids' ? notes.map((note) => note.id) : notes;
    }
  };
}

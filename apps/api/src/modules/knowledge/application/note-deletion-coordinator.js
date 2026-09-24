export function createNoteDeletionCoordinator({
  noteService,
  noteRepository,
  noteVersionRepository,
  contentAnnotationRepository,
  annotationExclusionRepository,
  annotationRevisionRepository,
  attachmentStore,
  runTransaction = (operation) => operation()
}) {
  function removeDependents(noteIds) {
    const annotationIds = typeof contentAnnotationRepository?.list === 'function'
      ? contentAnnotationRepository.list({ includeDeleted: true })
        .filter((annotation) => noteIds.includes(annotation.noteId))
        .map((annotation) => annotation.id)
      : [];
    annotationExclusionRepository?.deleteByAnnotationIds?.(annotationIds);
    annotationRevisionRepository?.deleteByAnnotationIds?.(annotationIds);
    contentAnnotationRepository?.deleteByNoteIds?.(noteIds);
    noteVersionRepository?.deleteByNoteIds?.(noteIds);
    return attachmentStore?.detachAttachmentsForNotes?.(noteIds) ?? [];
  }

  function finishAttachmentCleanup(attachments) {
    return attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];
  }

  function permanentlyDeleteNote(noteId) {
    let detachedAttachments = [];
    const deletedNote = runTransaction(() => {
      const result = noteService.permanentlyDeleteNote(noteId);
      detachedAttachments = removeDependents([noteId]);
      return result;
    });

    const attachmentCleanup = finishAttachmentCleanup(detachedAttachments);
    return attachmentCleanup.length ? { ...deletedNote, attachmentCleanup } : deletedNote;
  }

  function emptyRecycleBin(spaceId = null) {
    const noteIds = noteRepository
      .list({ includeDeleted: true, spaceId })
      .filter((note) => note.deleted)
      .map((note) => note.id);
    let detachedAttachments = [];
    const result = runTransaction(() => {
      const deletion = noteService.emptyRecycleBin(spaceId);
      detachedAttachments = removeDependents(noteIds);
      return deletion;
    });

    const attachmentCleanup = finishAttachmentCleanup(detachedAttachments);
    return attachmentCleanup.length ? { ...result, attachmentCleanup } : result;
  }

  return {
    permanentlyDeleteNote,
    emptyRecycleBin
  };
}

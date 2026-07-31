export function createNoteDeletionCoordinator({
  noteService,
  noteRepository,
  noteVersionRepository,
  contentAnnotationRepository,
  attachmentStore,
  runTransaction = (operation) => operation()
}) {
  function removeDependents(noteIds) {
    contentAnnotationRepository?.deleteByNoteIds?.(noteIds);
    noteVersionRepository?.deleteByNoteIds?.(noteIds);
    return attachmentStore?.detachAttachmentsForNotes?.(noteIds) ?? [];
  }

  function finishAttachmentCleanup(attachments) {
    attachmentStore?.removeDetachedAttachmentFiles?.(attachments);
  }

  function permanentlyDeleteNote(noteId) {
    let detachedAttachments = [];
    const deletedNote = runTransaction(() => {
      const result = noteService.permanentlyDeleteNote(noteId);
      detachedAttachments = removeDependents([noteId]);
      return result;
    });

    finishAttachmentCleanup(detachedAttachments);
    return deletedNote;
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

    finishAttachmentCleanup(detachedAttachments);
    return result;
  }

  return {
    permanentlyDeleteNote,
    emptyRecycleBin
  };
}

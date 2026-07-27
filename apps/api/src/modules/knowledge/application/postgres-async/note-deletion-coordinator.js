export function createAsyncNoteDeletionCoordinator({
  noteService,
  noteRepository,
  attachmentStore,
  runTransaction = (operation) => operation()
}) {
  async function collectAttachments(noteIds) {
    const noteIdSet = new Set(noteIds);
    const attachments = await attachmentStore?.listAttachments?.() ?? [];
    return attachments.filter((attachment) => noteIdSet.has(attachment.noteId));
  }

  async function finishAttachmentCleanup(attachments) {
    await attachmentStore?.removeDetachedAttachmentFiles?.(attachments);
  }

  async function permanentlyDeleteNote(noteId) {
    const detachedAttachments = await collectAttachments([noteId]);
    const deletedNote = await runTransaction(async () => {
      return noteService.permanentlyDeleteNote(noteId);
    });
    await finishAttachmentCleanup(detachedAttachments);
    return deletedNote;
  }

  async function emptyRecycleBin(spaceId = null) {
    const deletedNotes = await noteRepository.list({ includeDeleted: true, spaceId });
    const noteIds = deletedNotes.filter((note) => note.deleted).map((note) => note.id);
    const detachedAttachments = await collectAttachments(noteIds);
    const result = await runTransaction(async () => {
      return noteService.emptyRecycleBin(spaceId);
    });
    await finishAttachmentCleanup(detachedAttachments);
    return result;
  }

  return { permanentlyDeleteNote, emptyRecycleBin };
}

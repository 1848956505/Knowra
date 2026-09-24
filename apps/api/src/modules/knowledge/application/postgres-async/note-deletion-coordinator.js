import { createAppError } from '../../../../errors/app-error.js';

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

  async function assertNoRetainedAttachmentReferences(attachments, noteIds) {
    const noteIdSet = new Set(noteIds);
    for (const attachment of attachments) {
      const preflight = await attachmentStore.inspectAttachmentDeletion(attachment.id);
      const retained = preflight.references.filter((reference) => !(
        ['notes', 'noteVersions', 'contentAnnotations'].includes(reference.collection)
        && noteIdSet.has(reference.noteId ?? reference.id)
      ));
      if (retained.length) {
        throw createAppError('ATTACHMENT_REFERENCED', '保留的资产仍引用此附件，不能删除。', 409);
      }
    }
  }

  async function finishAttachmentCleanup(attachments) {
    return await attachmentStore?.removeDetachedAttachmentFiles?.(attachments) ?? [];
  }

  function assertSameAttachments(queued, current) {
    const expected = new Map(queued.map(item => [item.id, `${item.storagePath}\u0000${item.fileName}`]));
    if (current.length !== expected.size || current.some(item => expected.get(item.id) !== `${item.storagePath}\u0000${item.fileName}`)) {
      throw createAppError('NOTE_DELETE_PREVIEW_STALE', '笔记附件已变化，请重新预检。', 409);
    }
  }

  async function permanentlyDeleteNote(noteId) {
    const queuedAttachments = await collectAttachments([noteId]);
    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);
    let detachedAttachments = [];
    const deletedNote = await runTransaction(async () => {
      detachedAttachments = await collectAttachments([noteId]);
      assertSameAttachments(queuedAttachments, detachedAttachments);
      await assertNoRetainedAttachmentReferences(detachedAttachments, [noteId]);
      return noteService.permanentlyDeleteNote(noteId);
    });
    const cleanup = await finishAttachmentCleanup(detachedAttachments);
    return cleanup.length ? { ...deletedNote, attachmentCleanup: cleanup } : deletedNote;
  }

  async function emptyRecycleBin(spaceId = null) {
    const queuedNotes = await noteRepository.list({ includeDeleted: true, spaceId });
    const queuedNoteIds = queuedNotes.filter(note => note.deleted).map(note => note.id);
    const queuedAttachments = await collectAttachments(queuedNoteIds);
    await attachmentStore?.prepareAttachmentCleanup?.(queuedAttachments);
    let detachedAttachments = [];
    const result = await runTransaction(async () => {
      const deletedNotes = await noteRepository.list({ includeDeleted: true, spaceId });
      const noteIds = deletedNotes.filter((note) => note.deleted).map((note) => note.id);
      if (noteIds.length !== queuedNoteIds.length || noteIds.some(id => !queuedNoteIds.includes(id))) {
        throw createAppError('NOTE_DELETE_PREVIEW_STALE', '回收站内容已变化，请重新预检。', 409);
      }
      detachedAttachments = await collectAttachments(noteIds);
      assertSameAttachments(queuedAttachments, detachedAttachments);
      await assertNoRetainedAttachmentReferences(detachedAttachments, noteIds);
      return noteService.emptyRecycleBin(spaceId);
    });
    const cleanup = await finishAttachmentCleanup(detachedAttachments);
    return cleanup.length ? { ...result, attachmentCleanup: cleanup } : result;
  }

  return { permanentlyDeleteNote, emptyRecycleBin };
}

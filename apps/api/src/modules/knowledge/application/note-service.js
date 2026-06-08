import { Note } from '../domain/note.js';
import { buildCreateNoteDto, buildUpdateNoteDto } from './dto/note.dto.js';
import { createInMemoryNoteRepository } from '../infrastructure/note-repository.js';

export function createNoteService({
  repository = createInMemoryNoteRepository(),
  validateSiblingNameConflict = null
} = {}) {
  function requireNote(noteId, options = {}) {
    const note = repository.findById(noteId);

    if (!note) {
      throw new Error('Note not found');
    }

    if (note.deleted && !options.includeDeleted) {
      throw new Error('Note not found');
    }

    return note;
  }

  function requireNoteIds(noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      throw new Error('noteIds must contain at least one note id');
    }

    return noteIds;
  }

  return {
    createNote(input) {
      const dto = buildCreateNoteDto(input);
      validateSiblingNameConflict?.({
        spaceId: dto.spaceId,
        folderId: dto.folderId ?? null,
        title: dto.title,
        currentNoteId: null
      });
      const note = new Note(dto);
      repository.save(note);
      return note;
    },
    importMarkdown(input) {
      return this.createNote({
        ...input,
        sourceType: input.sourceType ?? 'markdown-import'
      });
    },
    importMarkdownBatch(items = []) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Markdown import batch must contain at least one item');
      }

      return items.map((item) => this.importMarkdown(item));
    },
    getNote(noteId, options = {}) {
      return requireNote(noteId, options);
    },
    getLinkedNotes(noteId) {
      const note = requireNote(noteId, { includeDeleted: true });
      return note.internalLinks
        .map((linkedId) => repository.findById(linkedId))
        .filter((linkedNote) => linkedNote && !linkedNote.deleted);
    },
    updateNote(noteId, updates) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const dto = buildUpdateNoteDto(updates);
      const nextFolderId = Object.prototype.hasOwnProperty.call(dto, 'folderId')
        ? dto.folderId
        : currentNote.folderId;
      validateSiblingNameConflict?.({
        spaceId: dto.spaceId ?? currentNote.spaceId,
        folderId: nextFolderId ?? null,
        title: dto.title ?? currentNote.title,
        currentNoteId: currentNote.id
      });
      const updatedNote = new Note({
        ...currentNote,
        ...dto,
        id: currentNote.id,
        spaceId: dto.spaceId ?? currentNote.spaceId,
        folderId: nextFolderId,
        favorite: dto.favorite ?? currentNote.favorite,
        deleted: currentNote.deleted,
        tagIds: dto.tagIds ?? currentNote.tagIds,
        createdAt: currentNote.createdAt,
        updatedAt: dto.updatedAt ?? new Date().toISOString()
      });

      repository.save(updatedNote);
      return updatedNote;
    },
    deleteNote(noteId) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const deletedNote = new Note({
        ...currentNote,
        deleted: true,
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(deletedNote);
      return deletedNote;
    },
    deleteNotes(noteIds) {
      return requireNoteIds(noteIds).map((noteId) => this.deleteNote(noteId));
    },
    restoreNote(noteId) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const restoredNote = new Note({
        ...currentNote,
        deleted: false,
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(restoredNote);
      return restoredNote;
    },
    setFavorite(noteId, favorite = true) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const updatedNote = new Note({
        ...currentNote,
        favorite: Boolean(favorite),
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(updatedNote);
      return updatedNote;
    },
    assignTagToNote(noteId, tagId) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const updatedNote = new Note({
        ...currentNote,
        tagIds: [...currentNote.tagIds, tagId],
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(updatedNote);
      return updatedNote;
    },
    assignTagToNotes(noteIds, tagId) {
      if (!tagId?.trim()) {
        throw new Error('tagId is required');
      }

      return requireNoteIds(noteIds).map((noteId) => this.assignTagToNote(noteId, tagId));
    },
    removeTagFromNote(noteId, tagId) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const updatedNote = new Note({
        ...currentNote,
        tagIds: currentNote.tagIds.filter((currentTagId) => currentTagId !== tagId),
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(updatedNote);
      return updatedNote;
    },
    clearFolderFromNotes(folderId) {
      const notesToUpdate = repository.list({ includeDeleted: true })
        .filter((note) => note.folderId === folderId);

      return notesToUpdate.map((note) => {
        const updatedNote = new Note({
          ...note,
          folderId: null,
          createdAt: note.createdAt,
          updatedAt: new Date().toISOString()
        });
        repository.save(updatedNote);
        return updatedNote;
      });
    },
    removeTagFromAllNotes(tagId) {
      const notesToUpdate = repository.list({ includeDeleted: true })
        .filter((note) => note.tagIds.includes(tagId));

      return notesToUpdate.map((note) => {
        const updatedNote = new Note({
          ...note,
          tagIds: note.tagIds.filter((currentTagId) => currentTagId !== tagId),
          createdAt: note.createdAt,
          updatedAt: new Date().toISOString()
        });
        repository.save(updatedNote);
        return updatedNote;
      });
    },
    setNoteTags(noteId, tagIds) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      const updatedNote = new Note({
        ...currentNote,
        tagIds,
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      });

      repository.save(updatedNote);
      return updatedNote;
    },
    listNotes(options = {}) {
      return repository.list(options);
    }
  };
}

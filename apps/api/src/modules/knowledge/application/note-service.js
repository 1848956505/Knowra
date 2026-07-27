import { Note } from '../domain/note.js';
import { buildCreateNoteDto, buildUpdateNoteDto } from './dto/note.dto.js';
import { createNoteSummary } from './note-summary.js';
import { createInMemoryNoteRepository } from '../infrastructure/note-repository.js';
import {
  conflictError,
  notFoundError,
  validationError
} from './knowledge-errors.js';
import { createNoteAssociationOperations } from './note-association-operations.js';

export function createNoteService({
  repository = createInMemoryNoteRepository(),
  validateSiblingNameConflict = null,
  validateNoteReferences = null
} = {}) {
  function requireNote(noteId, options = {}) {
    const note = repository.findById(noteId);

    if (!note) {
      throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
    }

    if (note.deleted && !options.includeDeleted) {
      throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
    }

    return note;
  }

  function requireNoteIds(noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      throw validationError(
        'NOTE_IDS_REQUIRED',
        'noteIds must contain at least one note id'
      );
    }

    return noteIds;
  }

  function assertNewNoteId(noteId) {
    if (repository.findById(noteId)) {
      throw conflictError('NOTE_ID_CONFLICT', 'A note with the same id already exists');
    }
  }

  function assertReferences(note) {
    validateNoteReferences?.({
      spaceId: note.spaceId,
      folderId: note.folderId ?? null,
      tagIds: note.tagIds ?? []
    });
  }

  const associationOperations = createNoteAssociationOperations({
    repository,
    requireNote,
    requireNoteIds,
    assertReferences
  });

  return {
    createNote(input) {
      const dto = buildCreateNoteDto(input);
      assertNewNoteId(dto.id);
      assertReferences(dto);
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
        throw validationError(
          'MARKDOWN_IMPORT_ITEMS_REQUIRED',
          'Markdown import batch must contain at least one item'
        );
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
      const nextNote = {
        spaceId: dto.spaceId ?? currentNote.spaceId,
        folderId: nextFolderId,
        tagIds: dto.tagIds ?? currentNote.tagIds
      };
      assertReferences(nextNote);
      validateSiblingNameConflict?.({
        spaceId: nextNote.spaceId,
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
      const validatedIds = requireNoteIds(noteIds);
      validatedIds.forEach((noteId) => requireNote(noteId, { includeDeleted: true }));
      return validatedIds.map((noteId) => this.deleteNote(noteId));
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
    permanentlyDeleteNote(noteId) {
      const currentNote = requireNote(noteId, { includeDeleted: true });
      if (!currentNote.deleted) {
        throw conflictError(
          'NOTE_NOT_IN_RECYCLE_BIN',
          'Note must be in recycle bin before permanent delete'
        );
      }

      const deletedNote = repository.delete(noteId);
      if (!deletedNote) {
        throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
      }

      return deletedNote;
    },
    emptyRecycleBin(spaceId = null) {
      const deletedNotes = repository.deleteWhere((note) => (
        note.deleted && (spaceId ? note.spaceId === spaceId : true)
      ));

      return {
        deletedCount: deletedNotes.length,
        noteIds: deletedNotes.map((note) => note.id)
      };
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
    ...associationOperations,
    listNotes(options = {}) {
      const notes = repository.list(options);
      return options.summaryOnly === true || options.summaryOnly === 'true'
        ? notes.map(createNoteSummary)
        : notes;
    }
  };
}

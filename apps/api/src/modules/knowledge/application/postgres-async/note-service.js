import { Note } from '../../domain/note.js';
import { buildCreateNoteDto, buildUpdateNoteDto } from '../dto/note.dto.js';
import { createNoteSummary } from '../note-summary.js';
import {
  conflictError,
  notFoundError,
  validationError
} from '../knowledge-errors.js';
import { createAsyncNoteAssociationOperations } from './note-association-operations.js';

export function createAsyncNoteService({
  repository,
  validateSiblingNameConflict = null,
  validateNoteReferences = null,
  noteVersionService = null,
  runTransaction = (operation) => operation(),
  onNoteContentChanged = null,
  onNoteDeleted = null,
  onBeforePermanentDelete = null
} = {}) {
  if (!repository) throw new TypeError('Async note service requires a repository');

  async function requireNote(noteId, options = {}) {
    const note = await repository.findById(noteId);
    if (!note || (note.deleted && !options.includeDeleted)) {
      throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
    }
    return note;
  }

  function requireNoteIds(noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      throw validationError('NOTE_IDS_REQUIRED', 'noteIds must contain at least one note id');
    }
    return noteIds;
  }

  async function assertReferences(note) {
    await validateNoteReferences?.({
      spaceId: note.spaceId,
      folderId: note.folderId ?? null,
      tagIds: note.tagIds ?? []
    });
  }

  async function persistNote(note, {
    createVersion = false,
    expectedUpdatedAt = null
  } = {}) {
    return runTransaction(async ({
      noteRepository: transactionNoteRepository = repository,
      noteVersionService: transactionNoteVersionService = noteVersionService,
      onNoteContentChanged: transactionOnNoteContentChanged = onNoteContentChanged
    } = {}) => {
      const saved = await transactionNoteRepository.save(note, {
        expectedUpdatedAt
      });
      if (createVersion && transactionNoteVersionService) {
        const version = await transactionNoteVersionService.ensureForNote(saved);
        await transactionOnNoteContentChanged?.(saved, version);
      }
      return saved;
    });
  }

  async function createNote(input) {
    const dto = buildCreateNoteDto(input);
    if (await repository.findById(dto.id)) {
      throw conflictError('NOTE_ID_CONFLICT', 'A note with the same id already exists');
    }
    await assertReferences(dto);
    await validateSiblingNameConflict?.({
      spaceId: dto.spaceId,
      folderId: dto.folderId ?? null,
      title: dto.title,
      currentNoteId: null
    });
    return persistNote(new Note(dto), { createVersion: true });
  }

  async function updateNote(noteId, updates) {
    const currentNote = await requireNote(noteId, { includeDeleted: true });
    const dto = buildUpdateNoteDto(updates);
    if (
      dto.expectedUpdatedAt
      && dto.expectedUpdatedAt !== new Date(currentNote.updatedAt).toISOString()
    ) {
      throw conflictError(
        'NOTE_UPDATE_CONFLICT',
        'Note has changed since it was loaded'
      );
    }
    const nextFolderId = Object.hasOwn(dto, 'folderId') ? dto.folderId : currentNote.folderId;
    const nextNote = {
      spaceId: dto.spaceId ?? currentNote.spaceId,
      folderId: nextFolderId,
      tagIds: dto.tagIds ?? currentNote.tagIds
    };
    await assertReferences(nextNote);
    await validateSiblingNameConflict?.({
      spaceId: nextNote.spaceId,
      folderId: nextFolderId ?? null,
      title: dto.title ?? currentNote.title,
      currentNoteId: currentNote.id
    });
    return persistNote(new Note({
      ...currentNote,
      ...dto,
      id: currentNote.id,
      spaceId: nextNote.spaceId,
      folderId: nextFolderId,
      favorite: dto.favorite ?? currentNote.favorite,
      deleted: currentNote.deleted,
      tagIds: nextNote.tagIds,
      plainText: dto.rawMarkdown !== undefined ? undefined : currentNote.plainText,
      internalLinks: dto.rawMarkdown !== undefined ? undefined : currentNote.internalLinks,
      contentHash: dto.rawMarkdown !== undefined ? null : currentNote.contentHash,
      createdAt: currentNote.createdAt,
      updatedAt: dto.updatedAt ?? new Date().toISOString()
    }), {
      createVersion: dto.rawMarkdown !== undefined
        && dto.rawMarkdown !== currentNote.rawMarkdown,
      expectedUpdatedAt: currentNote.updatedAt
    });
  }

  async function saveDeletedState(noteId, deleted) {
    const currentNote = await requireNote(noteId, { includeDeleted: true });
    return runTransaction(async ({
      noteRepository: transactionNoteRepository = repository,
      onNoteDeleted: transactionOnNoteDeleted = onNoteDeleted
    } = {}) => {
      const saved = await transactionNoteRepository.save(new Note({
        ...currentNote,
        deleted,
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      }), {
        expectedUpdatedAt: currentNote.updatedAt
      });
      if (deleted) await transactionOnNoteDeleted?.(saved.id);
      return saved;
    });
  }

  const service = {
    createNote,
    async importMarkdown(input) {
      return createNote({ ...input, sourceType: input.sourceType ?? 'markdown-import' });
    },
    async importMarkdownBatch(items = []) {
      if (!Array.isArray(items) || items.length === 0) {
        throw validationError('MARKDOWN_IMPORT_ITEMS_REQUIRED', 'Markdown import batch must contain at least one item');
      }
      return Promise.all(items.map((item) => service.importMarkdown(item)));
    },
    getNote: requireNote,
    async getLinkedNotes(noteId) {
      const note = await requireNote(noteId, { includeDeleted: true });
      const linked = await repository.findByIds(note.internalLinks ?? []);
      const byId = new Map(linked.filter((item) => !item.deleted).map((item) => [item.id, item]));
      return (note.internalLinks ?? []).map((id) => byId.get(id)).filter(Boolean);
    },
    updateNote,
    deleteNote(noteId) { return saveDeletedState(noteId, true); },
    async deleteNotes(noteIds) {
      const validatedIds = requireNoteIds(noteIds);
      await Promise.all(validatedIds.map((noteId) => requireNote(noteId, { includeDeleted: true })));
      return Promise.all(validatedIds.map((noteId) => saveDeletedState(noteId, true)));
    },
    restoreNote(noteId) { return saveDeletedState(noteId, false); },
    async permanentlyDeleteNote(noteId) {
      return runTransaction(async ({
        noteRepository: transactionNoteRepository = repository,
        onBeforePermanentDelete: transactionBeforePermanentDelete = onBeforePermanentDelete
      } = {}) => {
        const currentNote = await transactionNoteRepository.findById(noteId);
        if (!currentNote) {
          throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
        }
        if (!currentNote.deleted) {
          throw conflictError('NOTE_NOT_IN_RECYCLE_BIN', 'Note must be in recycle bin before permanent delete');
        }
        await transactionBeforePermanentDelete?.(currentNote.id);
        const deletedNote = await transactionNoteRepository.delete(noteId);
        if (!deletedNote) throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
        return deletedNote;
      });
    },
    async emptyRecycleBin(spaceId = null) {
      return runTransaction(async ({
        noteRepository: transactionNoteRepository = repository,
        onBeforePermanentDelete: transactionBeforePermanentDelete = onBeforePermanentDelete,
        onNoteDeleted: transactionOnNoteDeleted = onNoteDeleted
      } = {}) => {
        const candidates = (await transactionNoteRepository.list({
          includeDeleted: true,
          spaceId
        })).filter((note) => note.deleted);
        for (const note of candidates) {
          await transactionBeforePermanentDelete?.(note.id);
        }
        const candidateIds = new Set(candidates.map((note) => note.id));
        const deletedNotes = await transactionNoteRepository.deleteWhere((note) => (
          candidateIds.has(note.id)
        ));
        await Promise.all(
          deletedNotes.map((note) => transactionOnNoteDeleted?.(note.id))
        );
        return {
          deletedCount: deletedNotes.length,
          noteIds: deletedNotes.map((note) => note.id)
        };
      });
    },
    async setFavorite(noteId, favorite = true) {
      const currentNote = await requireNote(noteId, { includeDeleted: true });
      return repository.save(new Note({
        ...currentNote,
        favorite: Boolean(favorite),
        createdAt: currentNote.createdAt,
        updatedAt: new Date().toISOString()
      }), {
        expectedUpdatedAt: currentNote.updatedAt
      });
    },
    async listNotes(options = {}) {
      const notes = await repository.list(options);
      return options.summaryOnly === true || options.summaryOnly === 'true'
        ? notes.map(createNoteSummary)
        : notes;
    }
  };

  Object.assign(service, createAsyncNoteAssociationOperations({
    repository,
    requireNote,
    requireNoteIds,
    assertReferences
  }));
  return service;
}

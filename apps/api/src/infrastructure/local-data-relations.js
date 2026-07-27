import { createAppError } from '../errors/app-error.js';

export function validateLocalDataRelations(state) {
  const spaces = indexById(state.spaces);
  const folders = indexById(state.folders);
  const tags = indexById(state.tags);
  const notes = indexById(state.notes);

  validateFolders(state.folders, spaces, folders);
  validateTags(state.tags, spaces);
  validateNotes(state.notes, spaces, folders, tags);
  validateAnnotations(state.contentAnnotations, spaces, notes);
  validateAttachments(state.attachments, notes);
  assertFolderGraphHasNoCycles(state.folders, folders);
  return state;
}

export function normalizeLegacyNoteReferences(state, {
  repairBrokenReferences = false
} = {}) {
  const spaces = indexById(state.spaces);
  const folders = indexById(state.folders);
  const onlySpaceId = state.spaces.length === 1 ? state.spaces[0].id : null;

  for (const note of state.notes) {
    const folderSpaceId = note.folderId
      ? folders.get(note.folderId)?.spaceId
      : null;
    if (!note.spaceId || (
      repairBrokenReferences
      && !spaces.has(note.spaceId)
      && onlySpaceId
    )) {
      note.spaceId = folderSpaceId ?? onlySpaceId;
    }
    if (
      repairBrokenReferences
      && note.folderId
      && !folders.has(note.folderId)
    ) {
      note.folderId = null;
    }
  }
}

function validateFolders(folderItems, spaces, folders) {
  for (const folder of folderItems) {
    assertReference(
      spaces.has(folder.spaceId),
      `Folder ${folder.id} references unknown space: ${folder.spaceId}`
    );
    if (folder.parentId === null || folder.parentId === undefined) {
      continue;
    }

    const parent = folders.get(folder.parentId);
    assertReference(
      Boolean(parent),
      `Folder ${folder.id} references unknown parent: ${folder.parentId}`
    );
    assertReference(
      parent.spaceId === folder.spaceId,
      `Folder ${folder.id} and its parent must belong to the same space`
    );
  }
}

function validateTags(tagItems, spaces) {
  for (const tag of tagItems) {
    assertReference(
      spaces.has(tag.spaceId),
      `Tag ${tag.id} references unknown space: ${tag.spaceId}`
    );
  }
}

function validateNotes(noteItems, spaces, folders, tags) {
  for (const note of noteItems) {
    validateNoteSpace(note, spaces);
    validateNoteFolder(note, folders);
    validateNoteTags(note, tags);
  }
}

function validateNoteSpace(note, spaces) {
  assertReference(
    Boolean(note.spaceId) && spaces.has(note.spaceId),
    `Note ${note.id} references unknown space: ${note.spaceId}`
  );
}

function validateNoteFolder(note, folders) {
  if (note.folderId === null || note.folderId === undefined) {
    return;
  }

  const folder = folders.get(note.folderId);
  assertReference(
    Boolean(folder),
    `Note ${note.id} references unknown folder: ${note.folderId}`
  );
  assertReference(
    note.spaceId === folder.spaceId,
    `Note ${note.id} and its folder must belong to the same space`
  );
}

function validateNoteTags(note, tags) {
  const tagIds = note.tagIds ?? [];
  const uniqueTagIds = new Set(tagIds);
  assertReference(
    uniqueTagIds.size === tagIds.length,
    `Note ${note.id} contains duplicate tag references`
  );

  for (const tagId of tagIds) {
    const tag = tags.get(tagId);
    assertReference(
      Boolean(tag),
      `Note ${note.id} references unknown tag: ${tagId}`
    );
    assertReference(
      note.spaceId === tag.spaceId,
      `Note ${note.id} and tag ${tagId} must belong to the same space`
    );
  }
}

function validateAnnotations(annotationItems, spaces, notes) {
  for (const annotation of annotationItems) {
    const note = notes.get(annotation.noteId);
    assertReference(
      spaces.has(annotation.spaceId),
      `Annotation ${annotation.id} references unknown space: ${annotation.spaceId}`
    );
    assertReference(
      Boolean(note),
      `Annotation ${annotation.id} references unknown note: ${annotation.noteId}`
    );
    assertReference(
      note.spaceId === annotation.spaceId,
      `Annotation ${annotation.id} and its note must belong to the same space`
    );
  }
}

function validateAttachments(attachmentItems, notes) {
  for (const attachment of attachmentItems) {
    assertReference(
      notes.has(attachment.noteId),
      `Attachment ${attachment.id} references unknown note: ${attachment.noteId}`
    );
  }
}

function assertFolderGraphHasNoCycles(folderItems, folders) {
  const visits = new Map();
  for (const folder of folderItems) {
    visitFolder(folder, folders, visits);
  }
}

function visitFolder(folder, folders, visits) {
  const status = visits.get(folder.id);
  if (status === 'visited') {
    return;
  }
  assertReference(
    status !== 'visiting',
    `Folder hierarchy contains a cycle at: ${folder.id}`
  );

  visits.set(folder.id, 'visiting');
  if (folder.parentId !== null && folder.parentId !== undefined) {
    visitFolder(folders.get(folder.parentId), folders, visits);
  }
  visits.set(folder.id, 'visited');
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function assertReference(condition, message) {
  if (condition) {
    return;
  }
  throw createAppError(
    'STORAGE_SNAPSHOT_INVALID',
    message,
    422
  );
}

import crypto from 'node:crypto';

export function toDate(value, fallback = new Date()) {
  if (value instanceof Date) {
    return value;
  }
  const date = new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
}

export function toIso(value, fallback = new Date()) {
  return toDate(value, fallback).toISOString();
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email ?? null,
    passwordHash: row.passwordHash ?? null,
    nickname: row.nickname ?? null,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export function mapSpace(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description ?? '',
    defaultFlag: Boolean(row.defaultFlag),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export function mapFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    parentId: row.parentId ?? null,
    pathCache: row.pathCache ?? '/',
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export function mapTag(row) {
  if (!row) return null;
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    color: row.color ?? 'slate',
    groupId: row.groupId ?? null,
    code: row.code ?? null,
    isSystem: Boolean(row.isSystem),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export function mapNote(row) {
  if (!row) return null;
  const internalLinks = Array.isArray(row.internalLinks)
    ? row.internalLinks
    : [];
  return {
    id: row.id,
    spaceId: row.spaceId,
    folderId: row.folderId ?? null,
    title: row.title,
    rawMarkdown: row.rawMarkdown,
    plainText: row.plainText ?? '',
    internalLinks: [...internalLinks],
    contentHash: row.contentHash ?? null,
    status: row.status,
    sourceType: row.sourceType,
    favorite: Boolean(row.favorite),
    deleted: row.deletedAt !== null && row.deletedAt !== undefined,
    tagIds: (row.noteTags ?? []).map((relation) => relation.tagId),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    noteId: row.noteId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: Number(row.size),
    storagePath: row.storagePath,
    createdAt: toIso(row.createdAt)
  };
}

export function mapAnnotation(row) {
  if (!row) return null;
  return {
    id: row.id,
    spaceId: row.spaceId,
    noteId: row.noteId,
    kind: row.kind,
    sourceMode: row.sourceMode,
    quoteText: row.quoteText,
    headingPath: Array.isArray(row.headingPath) ? [...row.headingPath] : [],
    fromPosition: row.fromPosition,
    toPosition: row.toPosition,
    prefixText: row.prefixText ?? '',
    suffixText: row.suffixText ?? '',
    anchorFingerprint: row.anchorFingerprint,
    noteContentHash: row.noteContentHash,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null
  };
}

export function buildNoteData(note) {
  const rawMarkdown = String(note.rawMarkdown ?? '');
  const contentHash = note.contentHash
    ?? crypto.createHash('sha256').update(rawMarkdown).digest('hex');
  return {
    id: note.id,
    spaceId: note.spaceId,
    folderId: note.folderId ?? null,
    title: note.title,
    rawMarkdown,
    plainText: String(note.plainText ?? ''),
    internalLinks: Array.isArray(note.internalLinks) ? note.internalLinks : [],
    contentHash,
    status: note.status ?? 'draft',
    sourceType: note.sourceType ?? 'manual',
    favorite: Boolean(note.favorite),
    deletedAt: note.deleted ? toDate(note.updatedAt) : null,
    createdAt: toDate(note.createdAt),
    updatedAt: toDate(note.updatedAt)
  };
}

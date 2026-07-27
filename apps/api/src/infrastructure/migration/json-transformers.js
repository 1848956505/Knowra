import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function transformSpace(space, fallbackTimestamp) {
  const createdAt = normalizeTimestamp(space.createdAt ?? fallbackTimestamp, fallbackTimestamp);
  return {
    ...space,
    description: space.description ?? '',
    defaultFlag: space.defaultFlag ?? true,
    createdAt,
    updatedAt: normalizeTimestamp(space.updatedAt ?? createdAt, createdAt)
  };
}

export function transformFolder(folder, fallbackTimestamp) {
  const createdAt = normalizeTimestamp(folder.createdAt ?? fallbackTimestamp, fallbackTimestamp);
  return {
    ...folder,
    parentId: folder.parentId ?? null,
    pathCache: folder.pathCache ?? '/',
    sortOrder: Number(folder.sortOrder ?? 0),
    createdAt,
    updatedAt: normalizeTimestamp(folder.updatedAt ?? createdAt, createdAt)
  };
}

export function transformTag(tag, fallbackTimestamp) {
  const createdAt = normalizeTimestamp(tag.createdAt ?? fallbackTimestamp, fallbackTimestamp);
  return {
    ...tag,
    color: tag.color ?? 'slate',
    groupId: tag.groupId ?? null,
    code: tag.code ?? null,
    isSystem: Boolean(tag.isSystem),
    sortOrder: Number(tag.sortOrder ?? 0),
    createdAt,
    updatedAt: normalizeTimestamp(tag.updatedAt ?? createdAt, createdAt)
  };
}

export function transformNote(note, fallbackTimestamp, reportTools) {
  const createdAt = normalizeTimestamp(note.createdAt ?? fallbackTimestamp, fallbackTimestamp);
  if (!note.createdAt) reportTools.repair('NOTE_CREATED_AT_DEFAULTED', 'Note createdAt was missing; fallback timestamp used', { noteId: note.id });
  if (!note.updatedAt) reportTools.repair('NOTE_UPDATED_AT_DEFAULTED', 'Note updatedAt was missing; createdAt used', { noteId: note.id });
  const internalLinks = Array.isArray(note.internalLinks)
    ? [...new Set(note.internalLinks)]
    : extractInternalLinks(note.rawMarkdown);
  if (!Array.isArray(note.internalLinks)) reportTools.repair('NOTE_INTERNAL_LINKS_DERIVED', 'Note internalLinks was missing; derived from Markdown', { noteId: note.id });
  return {
    ...note,
    folderId: note.folderId ?? null,
    plainText: typeof note.plainText === 'string' ? note.plainText : stripMarkdown(note.rawMarkdown),
    internalLinks,
    contentHash: note.contentHash ?? sha256(note.rawMarkdown),
    status: note.status ?? 'draft',
    sourceType: note.sourceType ?? 'manual',
    favorite: Boolean(note.favorite),
    deletedAt: note.deleted ? normalizeTimestamp(note.updatedAt ?? createdAt, createdAt) : null,
    createdAt,
    updatedAt: normalizeTimestamp(note.updatedAt ?? createdAt, createdAt),
    tagIds: [...new Set(note.tagIds ?? [])]
  };
}

export function transformAnnotation(annotation, fallbackTimestamp, reportTools) {
  const createdAt = normalizeTimestamp(annotation.createdAt ?? fallbackTimestamp, fallbackTimestamp);
  const requiredFields = ['anchorFingerprint', 'noteContentHash', 'idempotencyKey'];
  requiredFields.forEach((field) => {
    if (!String(annotation[field] ?? '').trim()) {
      reportTools.error('ANNOTATION_FIELD_MISSING', `Annotation ${annotation.id} is missing ${field}`, { annotationId: annotation.id, field });
    }
  });
  if (!['important'].includes(annotation.kind ?? 'important')) reportTools.error('ANNOTATION_KIND_INVALID', `Annotation ${annotation.id} kind is invalid`, { annotationId: annotation.id });
  if (!['manual', 'ai'].includes(annotation.sourceMode ?? 'manual')) reportTools.error('ANNOTATION_SOURCE_MODE_INVALID', `Annotation ${annotation.id} sourceMode is invalid`, { annotationId: annotation.id });
  if (!['active', 'stale', 'archived'].includes(annotation.status ?? 'active')) reportTools.error('ANNOTATION_STATUS_INVALID', `Annotation ${annotation.id} status is invalid`, { annotationId: annotation.id });
  const fromPosition = Number(annotation.fromPosition);
  const toPosition = Number(annotation.toPosition);
  if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) || fromPosition < 0 || fromPosition >= toPosition) reportTools.error('ANNOTATION_RANGE_INVALID', `Annotation ${annotation.id} has an invalid range`, { annotationId: annotation.id });
  return {
    ...annotation,
    kind: annotation.kind ?? 'important',
    sourceMode: annotation.sourceMode ?? 'manual',
    headingPath: Array.isArray(annotation.headingPath) ? annotation.headingPath : [],
    fromPosition,
    toPosition,
    prefixText: annotation.prefixText ?? '',
    suffixText: annotation.suffixText ?? '',
    status: annotation.status ?? 'active',
    deletedAt: annotation.deletedAt ? normalizeTimestamp(annotation.deletedAt, createdAt) : null,
    createdAt,
    updatedAt: normalizeTimestamp(annotation.updatedAt ?? createdAt, createdAt)
  };
}

export function transformAttachment(attachment, { storageRootDir, noteIds, allowMissingAttachments, reportTools }) {
  if (!noteIds.has(attachment.noteId)) {
    reportTools.error('ATTACHMENT_NOTE_NOT_FOUND', `Attachment references unknown note: ${attachment.id}`, { attachmentId: attachment.id });
    return null;
  }
  const filePath = resolveAttachmentPath(attachment, storageRootDir);
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  let actualSize = Number(attachment.size ?? 0);
  let contentSha256 = null;
  if (exists) {
    const stats = fs.statSync(filePath);
    actualSize = stats.size;
    contentSha256 = sha256(fs.readFileSync(filePath));
    if (Number(attachment.size) !== stats.size) reportTools.repair('ATTACHMENT_SIZE_REPAIRED', 'Attachment size was aligned to the file on disk', { attachmentId: attachment.id, previousSize: attachment.size, size: stats.size });
  } else {
    const details = { attachmentId: attachment.id, filePath };
    if (allowMissingAttachments) reportTools.warn('ATTACHMENT_FILE_MISSING', 'Attachment metadata will be migrated although its file is missing', details);
    else reportTools.error('ATTACHMENT_FILE_MISSING', 'Attachment file is missing; apply is blocked', details);
  }
  if (!attachment.storagePath) reportTools.error('ATTACHMENT_PATH_MISSING', 'Attachment storagePath is required for migration', { attachmentId: attachment.id });
  reportTools.report.attachmentFiles.push({ attachmentId: attachment.id, filePath, exists, size: actualSize, contentSha256 });
  return { ...attachment, size: actualSize, createdAt: normalizeTimestamp(attachment.createdAt, new Date().toISOString()), filePath, fileExists: exists, contentSha256 };
}

export function checksumPlan(plan) {
  return sha256(JSON.stringify(plan, (_, value) => value === undefined ? null : value));
}

export function validateDatabaseConstraints(plan, reportTools) {
  assertUniqueBy(plan.tags, (tag) => `${tag.spaceId}\u0000${tag.name}`, 'TAG_NAME_CONFLICT', 'Tag names must be unique within a space', reportTools);
  assertUniqueBy(plan.annotations, (annotation) => `${annotation.noteId}\u0000${annotation.idempotencyKey}`, 'ANNOTATION_IDEMPOTENCY_CONFLICT', 'Annotation idempotency keys must be unique within a note', reportTools);
  assertUniqueBy(plan.folders, (folder) => `${folder.spaceId}\u0000${folder.parentId ?? ''}\u0000${folder.name}`, 'FOLDER_NAME_CONFLICT', 'Folder names must be unique among siblings', reportTools);
  assertUniqueBy(plan.notes.filter((note) => !note.deleted), (note) => `${note.spaceId}\u0000${note.folderId ?? ''}\u0000${note.title}`, 'NOTE_NAME_CONFLICT', 'Active note names must be unique within a folder', reportTools);
}

function assertUniqueBy(items, keyOf, code, message, reportTools) {
  const seen = new Set();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) reportTools.error(code, message, { key });
    seen.add(key);
  }
}

function resolveAttachmentPath(attachment, storageRootDir) {
  const storagePath = String(attachment.storagePath ?? '');
  return path.isAbsolute(storagePath) ? storagePath : path.resolve(storageRootDir, storagePath);
}

function normalizeTimestamp(value, fallback) {
  const date = new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
}

function extractInternalLinks(markdown) {
  return [...new Set((String(markdown ?? '').match(/\[\[([^\]]+)\]\]/g) ?? []).map((value) => value.slice(2, -2).trim()).filter(Boolean))];
}

function stripMarkdown(markdown) {
  return String(markdown ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]+)`/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#>*_~-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

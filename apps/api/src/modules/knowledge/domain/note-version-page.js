import { createAppError } from '../../../errors/app-error.js';

export function parseVersionPageQuery({ limit = 20, cursor } = {}) {
  const size = Number(limit);
  if (!Number.isInteger(size) || size < 1 || size > 100) {
    throw createAppError('NOTE_VERSION_PAGE_INVALID', '版本分页数量须为 1 到 100', 400);
  }
  let after = null;
  if (cursor) {
    try {
      after = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
      if (typeof after.id !== 'string' || !after.id || typeof after.createdAt !== 'string' || !Number.isFinite(Date.parse(after.createdAt))) throw new Error();
    } catch {
      throw createAppError('NOTE_VERSION_CURSOR_INVALID', '版本分页游标无效', 400);
    }
  }
  return { limit: size, after };
}

export function versionSummary(version) {
  return { id: version.id, noteId: version.noteId, contentHash: version.contentHash, createdAt: new Date(version.createdAt).toISOString(), createdBy: version.createdBy };
}

export function versionPage(items, { limit, total, currentVersionId }) {
  const selected = items.slice(0, limit).map(versionSummary);
  const last = selected.at(-1);
  return {
    items: selected,
    total,
    currentVersionId,
    nextCursor: items.length > limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null
  };
}

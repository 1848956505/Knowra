import { isRecord } from '../api/response.js';
import type { DocumentDTO } from './types.js';
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).length === allowed.length &&
  allowed.every((key) => Object.hasOwn(value, key));
const string = (value: unknown): value is string => typeof value === 'string';
/** Boundary validation also prevents a malformed page from keeping the editor in an endless fetch loop. */
export function isTaskDocumentPage(
  value: unknown,
  expected: {
    workspaceId: string;
    documentId: string;
    versionId?: string;
    start?: number;
  },
): value is DocumentDTO {
  if (
    !isRecord(value) ||
    !keys(value, [
      'id',
      'workspaceId',
      'title',
      'revision',
      'currentVersionId',
      'version',
      'markdown',
      'start',
      'end',
      'hasMore',
      'attachments',
    ])
  )
    return false;
  if (
    value.id !== expected.documentId ||
    value.workspaceId !== expected.workspaceId ||
    !string(value.title) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !string(value.currentVersionId) ||
    !string(value.markdown) ||
    value.markdown.length > 16384
  )
    return false;
  if (
    !Number.isSafeInteger(value.start) ||
    !Number.isSafeInteger(value.end) ||
    value.start !== (expected.start ?? 0) ||
    Number(value.end) !== Number(value.start) + value.markdown.length ||
    typeof value.hasMore !== 'boolean' ||
    (value.hasMore && Number(value.end) <= Number(value.start))
  )
    return false;
  const version = value.version;
  if (
    !isRecord(version) ||
    !keys(version, ['id', 'ordinal', 'contentHash', 'createdAt', 'actor']) ||
    !string(version.id) ||
    (expected.versionId !== undefined && version.id !== expected.versionId) ||
    !Number.isSafeInteger(version.ordinal) ||
    !string(version.contentHash) ||
    !/^[a-f0-9]{64}$/.test(version.contentHash) ||
    !string(version.createdAt) ||
    !isRecord(version.actor) ||
    !['user', 'mcp'].includes(String(version.actor.kind)) ||
    !string(version.actor.id)
  )
    return false;
  return (
    Array.isArray(value.attachments) &&
    value.attachments.every(
      (a) =>
        isRecord(a) &&
        keys(a, [
          'id',
          'documentId',
          'fileName',
          'mimeType',
          'size',
          'sha256',
          'status',
          'createdAt',
        ]) &&
        string(a.id) &&
        a.documentId === value.id &&
        string(a.fileName) &&
        ['image/png', 'image/jpeg', 'image/webp'].includes(
          String(a.mimeType),
        ) &&
        Number.isSafeInteger(a.size) &&
        Number(a.size) > 0 &&
        string(a.sha256) &&
        /^[a-f0-9]{64}$/.test(a.sha256) &&
        a.status === 'ready' &&
        string(a.createdAt),
    )
  );
}

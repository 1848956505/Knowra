import { createHash } from 'node:crypto';
import { createAppError } from '../../../errors/app-error.js';

/** 保留 scope 原 ID/hash；只解析同 note、同实际内容且所有历史片段一致的当前版本。 */
export function resolveAnalysisScopeNoteVersion(snapshot, binding, noteVersions) {
  const invalid = () => { throw createAppError('ANALYSIS_SCOPE_VERSION_MISMATCH', '历史范围的笔记版本无法安全解析。', 422); };
  const rows = noteVersions instanceof Map ? [...noteVersions.values()] : noteVersions;
  if (!Array.isArray(rows) || !binding?.noteId || !binding.noteVersionId || !/^[a-f0-9]{64}$/.test(binding.contentHash ?? '')) invalid();
  const original = rows.find(version => version.id === binding.noteVersionId);
  if (original && (original.noteId !== binding.noteId || original.contentHash !== binding.contentHash)) invalid();
  const resolved = original ?? rows.find(version => version.noteId === binding.noteId && version.contentHash === binding.contentHash);
  if (!resolved || typeof resolved.content !== 'string'
    || createHash('sha256').update(resolved.content).digest('hex') !== binding.contentHash) invalid();
  for (const segment of [...(snapshot.segments ?? []), ...(snapshot.contextSegments ?? [])]) {
    if (segment.noteVersionId !== binding.noteVersionId) continue;
    if (segment.noteId !== binding.noteId || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
      || segment.start < 0 || segment.end <= segment.start || segment.end > resolved.content.length
      || resolved.content.slice(segment.start, segment.end) !== segment.markdown
      || !segment.markdown.isWellFormed()) invalid();
  }
  return resolved;
}

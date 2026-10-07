import { calculateContentHash } from '../knowledge/domain/note-version.js';

const SNIPPET_CHARS = 1000;
const MAX_LIMIT = 8;
const IMPORTANCE_RANK = Object.freeze({ normal: 1, important: 2, core: 3 });
const ARGUMENT_KEYS = new Set(['noteId', 'minImportance', 'limit', 'offset']);

export const ANNOTATIONS_TOOL = Object.freeze({ name: 'annotations_list',
  description: '列出一篇已授权笔记中用户标记的重点范围（重要度为普通/重点/核心），返回每处重点的位置与原文。noteId 须来自搜索结果或用户明确提供；用 minImportance 只看更重要的重点，数量较多时用 offset 翻页。',
  parameters: { type: 'object', properties: { noteId: { type: 'string' },
    minImportance: { type: 'string', enum: ['normal', 'important', 'core'] },
    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT }, offset: { type: 'integer', minimum: 0 } },
  required: ['noteId'], additionalProperties: false } });

function invalid(message = '重点参数无效。') {
  const error = new Error(message);
  error.code = 'AI_TOOL_ARGUMENTS_INVALID';
  return error;
}
function boundary(text, offset) {
  if (offset <= 0 || offset >= text.length) return true;
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return !(before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF);
}
const rankOf = annotation => IMPORTANCE_RANK[annotation.importance ?? 'normal'];

/**
 * 只读工具：仅返回当前笔记版本上仍然有效的重点。读取权限沿用 notes_read 的运行授权，
 * 实际范围由 access.verifyRead 核对；失效、已归档或锚点待核对的重点只计数不返回内容。
 * 返回片段带来源引用，供后续只允许引用“本轮已读”原文的知识提议校验。
 */
export async function listAnnotatedRanges({ access, repository, grantId, args }) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !ARGUMENT_KEYS.has(key))
    || typeof args.noteId !== 'string' || !args.noteId || args.noteId.length > 128
    || args.minImportance !== undefined && (typeof args.minImportance !== 'string' || !Object.hasOwn(IMPORTANCE_RANK, args.minImportance))
    || args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > MAX_LIMIT)
    || args.offset !== undefined && (!Number.isSafeInteger(args.offset) || args.offset < 0)) {
    throw invalid();
  }
  const { note, version, contentHash } = await access.verifyRead({ grantId, noteId: args.noteId });
  const content = version.content, minRank = IMPORTANCE_RANK[args.minImportance ?? 'normal'];
  const all = await Promise.resolve(repository.list({ noteId: note.id, spaceId: note.spaceId }));
  const current = [], unavailable = [];
  for (const annotation of all) {
    if (annotation.lifecycleStatus !== 'active') continue;
    const usable = annotation.anchorStatus === 'resolved' && annotation.noteContentHash === contentHash
      && Number.isSafeInteger(annotation.fromPosition) && Number.isSafeInteger(annotation.toPosition)
      && annotation.fromPosition >= 0 && annotation.fromPosition < annotation.toPosition && annotation.toPosition <= content.length
      && boundary(content, annotation.fromPosition) && boundary(content, annotation.toPosition);
    (usable ? current : unavailable).push(annotation);
  }
  const matched = current.filter(annotation => rankOf(annotation) >= minRank)
    .sort((a, b) => rankOf(b) - rankOf(a) || a.fromPosition - b.fromPosition || a.id.localeCompare(b.id));
  const offset = args.offset ?? 0, limit = args.limit ?? MAX_LIMIT;
  const page = matched.slice(offset, offset + limit);
  const sourceRefs = [], annotations = [];
  for (const annotation of page) {
    const start = annotation.fromPosition;
    let end = Math.min(annotation.toPosition, start + SNIPPET_CHARS);
    while (end > start && !boundary(content, end)) end--;
    if (end <= start) continue;
    const text = content.slice(start, end);
    sourceRefs.push({ noteId: note.id, noteVersionId: version.id, contentHash, start, end, quoteHash: calculateContentHash(text) });
    annotations.push({ annotationId: annotation.id, importance: annotation.importance ?? 'unrated', kind: annotation.kind,
      scopeType: annotation.scopeType, headingPath: (annotation.headingPath ?? []).slice(0, 6).map(item => String(item).slice(0, 120)),
      start, end, truncated: end < annotation.toPosition, text });
  }
  return { resultJson: { noteId: note.id, title: note.title, noteVersionId: version.id, total: matched.length, offset,
    hasMore: offset + page.length < matched.length, unavailableCount: unavailable.length, annotations }, sourceRefs };
}

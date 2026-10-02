import { notFoundError, validationError } from './knowledge-errors.js';

const QUERY_LIMIT = 200;
const RESULT_LIMIT = 30;
const SNIPPET_LIMIT = 220;

/** 命令面板只接受当前空间的有界查询，不沿用索引页的回收站/分页筛选。 */
export function commandSearchInput(input = {}) {
  if (typeof input.spaceId !== 'string' || !input.spaceId.trim() || input.spaceId.length > QUERY_LIMIT) {
    throw validationError('COMMAND_SEARCH_SPACE_REQUIRED', '请选择有效的当前空间后搜索。');
  }
  if (typeof input.query !== 'string' || input.query.length > QUERY_LIMIT) {
    throw validationError('COMMAND_SEARCH_QUERY_INVALID', '搜索关键字最多 200 字符。');
  }
  const limit = Number(input.limit ?? RESULT_LIMIT);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw validationError('COMMAND_SEARCH_LIMIT_INVALID', '搜索数量必须为正整数。');
  }
  return { query: input.query.trim(), spaceId: input.spaceId.trim(), limit: Math.min(limit, RESULT_LIMIT) };
}

export function assertCommandSearchOwner(space, ownerId) {
  if (!space || !ownerId || space.userId !== ownerId) {
    throw notFoundError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在。');
  }
}

export function commandSearchResults(notes, input) {
  return notes.filter(note => note.spaceId === input.spaceId && !note.deleted).slice(0, input.limit).map(note => ({
    id: note.id,
    title: note.title,
    folderId: note.folderId ?? null,
    snippet: matchingSnippet(note.plainText, input.query)
  }));
}

function matchingSnippet(value, query) {
  const text = String(value ?? '');
  const match = originalMatchRange(text, query);
  // 为最长关键字保留完整命中，再分配两侧上下文；标题命中显示正文开头。
  const matchLength = match ? Math.min(match.end - match.start, SNIPPET_LIMIT - 2) : 0;
  const context = Math.floor((SNIPPET_LIMIT - 2 - matchLength) / 2);
  let start = match ? Math.max(0, match.start - context) : 0;
  let end = Math.min(text.length, start + SNIPPET_LIMIT - 2);
  if (end === text.length) start = Math.max(0, end - (SNIPPET_LIMIT - 2));
  // 不切开 UTF-16 代理对（中文及 emoji 的显示边界）。
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start += 1;
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

function originalMatchRange(text, query) {
  const normalizedQuery = query.toLowerCase();
  const foldedStart = text.toLowerCase().indexOf(normalizedQuery);
  if (foldedStart < 0) return null;
  // İ 等字符的小写会扩长；只遍历到命中结束，使用常量空间映射回原 UTF-16。
  let foldedOffset = 0, originalOffset = 0, start = 0;
  for (const character of text) {
    const foldedLength = character.toLowerCase().length;
    if (foldedOffset <= foldedStart && foldedStart < foldedOffset + foldedLength) start = originalOffset;
    foldedOffset += foldedLength;
    originalOffset += character.length;
    if (foldedOffset >= foldedStart + normalizedQuery.length) return { start, end: originalOffset };
  }
  return null;
}

import { createAuthorizedKeywordSearch } from '../../../api/src/modules/ai/keyword-search.js';
import { listAnnotatedRanges } from '../../../api/src/modules/ai/annotation-read-tool.js';
import { mcpError } from './mcp-error.mjs';

const MAX_READ_UNITS = 1000;
const invalid = message => Object.assign(new Error(message), { code: 'AI_TOOL_ARGUMENTS_INVALID' });
const boundary = (text, position) => position <= 0 || position >= text.length
  || !(text.charCodeAt(position - 1) >= 0xD800 && text.charCodeAt(position - 1) <= 0xDBFF
    && text.charCodeAt(position) >= 0xDC00 && text.charCodeAt(position) <= 0xDFFF);
const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const noteId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

/**
 * 外部客户端的三个只读工具。它们复用内置助手的检索、读取与重点列表实现，
 * 但返回值一律改成带偏移的正文片段，由统一外发出口逐字复核后才离开运行端。
 * getAnnotations 每次调用时读取，资料库恢复后自动使用新的实例。
 */
export function createReadOnlyTools({ getAnnotations }) {
  const searches = new WeakMap();
  const searchFor = access => {
    if (!searches.has(access)) searches.set(access, createAuthorizedKeywordSearch({ access }));
    return searches.get(access);
  };
  return {
    notes_search: {
      description: '在已授权的笔记范围内按关键词检索，返回匹配的原文片段（带笔记 ID 与字符偏移）。没有结果时可换关键词再试。',
      inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 5 } },
        required: ['query'], additionalProperties: false },
      metaKeys: ['inspected', 'truncated'],
      async run({ input, grantId, access }) {
        if (!onlyKeys(input, ['query', 'limit']) || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 300
          || input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 5)) throw invalid('检索参数无效。');
        const found = await searchFor(access).search({ grantId, query: input.query, limit: input.limit ?? 5 });
        return { fragments: found.hits.map(hit => ({ noteId: hit.noteId, title: hit.title, start: hit.ref.start, end: hit.ref.end, text: hit.text })),
          meta: { inspected: found.inspected, truncated: Boolean(found.truncated) } };
      }
    },
    notes_read: {
      description: `读取已授权笔记的一个原文片段，单次最多 ${MAX_READ_UNITS} 个 UTF-16 单位；noteId 须来自检索结果或用户明确提供。用 start/end 翻页。`,
      inputSchema: { type: 'object', properties: { noteId: { type: 'string', maxLength: 128 }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } },
        required: ['noteId'], additionalProperties: false },
      metaKeys: ['length', 'hasMore'],
      async run({ input, grantId, access }) {
        if (!onlyKeys(input, ['noteId', 'start', 'end']) || !noteId(input.noteId)) throw invalid('阅读参数无效。');
        const { note, version } = await access.verifyRead({ grantId, noteId: input.noteId, tool: 'notes_read' });
        const content = version.content, start = input.start ?? 0, requestedEnd = input.end ?? start + MAX_READ_UNITS;
        // 读到末尾（含空笔记从 0 开始）是正常结果：返回空片段，不是参数错误。
        if (start === content.length && requestedEnd > start) return { fragments: [], meta: { length: content.length, hasMore: false } };
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd <= start
          || start > content.length || !boundary(content, start)) throw invalid('阅读范围无效。');
        let end = Math.min(requestedEnd, start + MAX_READ_UNITS, content.length);
        while (!boundary(content, end)) end--;
        if (end <= start) throw invalid('阅读范围无效。');
        return { fragments: [{ noteId: note.id, title: note.title, start, end, text: content.slice(start, end) }],
          meta: { length: content.length, hasMore: end < content.length } };
      }
    },
    annotations_list: {
      description: '列出一篇已授权笔记中用户标记的重点（普通/重点/核心），返回每处重点的原文与位置。数量多时用 offset 翻页，用 minImportance 只看更重要的。',
      inputSchema: { type: 'object', properties: { noteId: { type: 'string', maxLength: 128 }, minImportance: { type: 'string', enum: ['normal', 'important', 'core'] },
        limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0 } }, required: ['noteId'], additionalProperties: false },
      metaKeys: ['total', 'offset', 'hasMore', 'unavailableCount'],
      fragmentAttrs: { importance: { enum: ['normal', 'important', 'core', 'unrated'] }, truncated: { boolean: true }, annotationId: { pattern: '^[A-Za-z0-9_-]{1,64}$' } },
      async run({ input, grantId, access }) {
        const repository = getAnnotations();
        if (!repository) throw mcpError('MCP_TOOL_UNAVAILABLE', '重点服务当前不可用。', { status: 503 });
        const { resultJson } = await listAnnotatedRanges({ access, repository, grantId, args: input });
        return { fragments: resultJson.annotations.map(item => ({ noteId: resultJson.noteId, title: resultJson.title, start: item.start, end: item.end, text: item.text,
          attrs: { importance: item.importance, truncated: item.truncated, annotationId: item.annotationId } })),
        meta: { total: resultJson.total, offset: resultJson.offset, hasMore: resultJson.hasMore, unavailableCount: resultJson.unavailableCount } };
      }
    }
  };
}

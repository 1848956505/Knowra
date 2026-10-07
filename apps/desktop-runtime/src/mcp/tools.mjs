import { createAuthorizedKeywordSearch } from '../../../api/src/modules/ai/keyword-search.js';
import { listAnnotatedRanges } from '../../../api/src/modules/ai/annotation-read-tool.js';
import { calculateContentHash } from '@study-accelerator/content-anchor';
import { KNOWLEDGE_PROPOSE_TOOL, buildKnowledgeProposalPlan } from '../../../api/src/modules/ai/knowledge-propose-tool.js';
import { mcpError } from './mcp-error.mjs';

const MAX_READ_UNITS = 1000;
const invalid = message => Object.assign(new Error(message), { code: 'AI_TOOL_ARGUMENTS_INVALID' });
const boundary = (text, position) => position <= 0 || position >= text.length
  || !(text.charCodeAt(position - 1) >= 0xD800 && text.charCodeAt(position - 1) <= 0xDBFF
    && text.charCodeAt(position) >= 0xDC00 && text.charCodeAt(position) <= 0xDFFF);
const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const noteId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

/**
 * 外部客户端的工具：三个只读工具，加上需要在配对时单独开启的 knowledge_propose。它们复用内置助手的检索、读取与重点列表实现，
 * 但返回值一律改成带偏移的正文片段，由统一外发出口逐字复核后才离开运行端。
 * getAnnotations 每次调用时读取，资料库恢复后自动使用新的实例。
 */
export function createMcpTools({ getAnnotations, getAi = () => null }) {
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
    },
    knowledge_propose: {
      write: true,
      description: '把从用户笔记中提炼出的知识点作为待审核候选提交。只能引用本配对已经通过 notes_read、notes_search 或 annotations_list 读到的原文；每个候选至少一条引文：给出 noteId 与逐字摘自原文的 quote 即可，服务端会在已读原文中定位（quote 须在已读原文里唯一；出现多次时再补充该笔记内的绝对 start/end 偏移）。陈述只能依据所引原文，不添加背景知识；没有可提炼内容时不要调用。提交只是提议，不会成为正式知识，必须由用户在知境里逐条审核；重复提交相同内容或使用相同的 idempotencyKey 会返回同一结果，不会重复创建。',
      inputSchema: { ...KNOWLEDGE_PROPOSE_TOOL.parameters, properties: { ...KNOWLEDGE_PROPOSE_TOOL.parameters.properties,
        idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 } } },
      metaKeys: ['saved', 'candidates', 'reused'],
      async run({ input, grantId, access, pairing, readRanges, guard, quota, signal }) {
        guard(); // 开始就复核一次：已超时、开关已关、配对已撤销都不再往下做。
        const ai = getAi();
        if (!ai?.knowledgeCommit || !ai.accessStore) throw mcpError('MCP_TOOL_UNAVAILABLE', '知识候选保存服务当前不可用。', { status: 503 });
        const key = input.idempotencyKey ?? `auto-${calculateContentHash(JSON.stringify(input.candidates)).slice(0, 32)}`;
        const origin = { pairingId: pairing.pairingId, callId: key };
        const identity = await ai.accessStore.identity();
        const receipt = result => ({ fragments: [], meta: { saved: true, candidates: result.candidates.length, reused: true } });
        // 同一幂等键已提交：按回执返回，不重新校验也不重复创建（响应丢失后重试安全）。
        const existing = await ai.knowledgeCommit.findCommitted({ origin, identity, mode: 'mcp' });
        if (existing) return receipt(existing);
        // 已读记录里可能留有笔记旧版本的片段：只保留仍是当前版本且仍可读的；一个都不剩时按原因报错（变了、或已不可读）。
        const versions = new Map(), current = [];
        let firstFailure = null;
        for (const ref of readRanges()) {
          if (!versions.has(ref.noteId)) versions.set(ref.noteId, await access.verifyRead({ grantId, noteId: ref.noteId }).catch(error => { firstFailure ??= error; return null; }));
          const live = versions.get(ref.noteId);
          if (live && live.version.id === ref.noteVersionId && live.contentHash === ref.contentHash) current.push(ref);
        }
        if (!current.length && readRanges().length) throw firstFailure ?? Object.assign(new Error('已读原文已经变化'), { code: 'AI_PROPOSAL_SOURCE_STALE' });
        const plan = await buildKnowledgeProposalPlan({ access, grantId, args: { candidates: input.candidates }, sourceRefs: current,
          turnId: `mcp-${pairing.pairingId}`, callId: key });
        // 先预留配额（同步检查并扣减，并发不会同时通过），再提交；确定没有提交时归还。
        quota.reserve(plan.candidates.length);
        try { await ai.knowledgeCommit.commit({ plan, origin, identity, grantId, mode: 'mcp', guard }); }
        catch (error) {
          // 提交可能已成功但响应丢失：以回执为准，预留的配额保持（只计一次）。
          const landed = await ai.knowledgeCommit.findCommitted({ origin, identity, mode: 'mcp' }).catch(() => null);
          if (landed) return receipt(landed);
          quota.release(plan.candidates.length);
          throw error;
        }
        return { fragments: [], meta: { saved: true, candidates: plan.candidates.length, reused: false } };
      }
    }
  };
}

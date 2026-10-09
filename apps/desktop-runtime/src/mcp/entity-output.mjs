import { createMcpNavigation } from './navigation.mjs';
import { searchMcpKnowledge } from './knowledge-output.mjs';
import { mcpError } from './mcp-error.mjs';

const invalid = () => { throw mcpError('MCP_RESULT_INVALID', '实体结果不符合授权输出契约。', { status: 500 }); };
const object = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const ids = value => Array.isArray(value) && value.length <= 20 && value.every(id) && new Set(value).size === value.length;
const statuses = ['candidate', 'confirmed', 'needsRevision', 'archived', 'unavailable'];
const types = ['concept', 'fact', 'principle', 'process', 'algorithm', 'formula', 'comparison', 'application'];
function knowledgeItem(item) {
  return object(item, ['knowledgeId', 'title', 'canonicalStatement', 'userExplanation', 'knowledgeType', 'reviewStatus', 'sourceMode', 'updatedAt', 'sources'])
    && id(item.knowledgeId) && ['title', 'canonicalStatement', 'userExplanation', 'updatedAt'].every(field => typeof item[field] === 'string')
    && types.includes(item.knowledgeType) && statuses.slice(0, 4).includes(item.reviewStatus)
    && ['manual', 'annotation', 'selection', 'ai'].includes(item.sourceMode)
    && Array.isArray(item.sources) && item.sources.length <= 160
    && item.sources.every(source => object(source, ['noteId', 'noteVersionId', 'contentHash'])
      && id(source.noteId) && id(source.noteVersionId) && id(source.contentHash));
}

/** 实体专属 DTO 校验。自由文本只由受信授权读取器从当前数据投影，工具 handler 无法把字符串塞进通用 meta。 */
export function validateMcpEntityOutput(tool, data) {
  if (tool === 'notes_list') {
    if (!object(data, ['notes', 'nextCursor', 'hasMore', 'coverage']) || !Array.isArray(data.notes) || data.notes.length > 20
      || !data.notes.every(row => object(row, ['noteId', 'title', 'noteVersionId', 'contentHash'])
        && id(row.noteId) && typeof row.title === 'string' && id(row.noteVersionId) && id(row.contentHash))
      || !(data.nextCursor === null || typeof data.nextCursor === 'string' && data.nextCursor.length <= 2048)
      || typeof data.hasMore !== 'boolean' || data.hasMore !== (data.nextCursor !== null)
      || data.coverage !== 'complete-authorized-snapshot') invalid();
  } else if (tool === 'workspace_describe') {
    if (!object(data, ['scope', 'noteCount', 'capabilities']) || data.scope !== 'authorized-notes'
      || !Number.isSafeInteger(data.noteCount) || data.noteCount < 0
      || !object(data.capabilities, ['noteMetadata', 'noteContent', 'arbitraryPaths', 'officialWrites'])
      || data.capabilities.noteMetadata !== true || data.capabilities.noteContent !== 'authorized-only'
      || data.capabilities.arbitraryPaths !== false || data.capabilities.officialWrites !== false) invalid();
  } else if (tool === 'knowledge_propose') {
    if (!object(data, ['requestId', 'candidateIds', 'saved', 'reused']) || !id(data.requestId) || !ids(data.candidateIds)
      || data.saved !== true || typeof data.reused !== 'boolean') invalid();
  } else if (tool === 'proposals_get') {
    if (!object(data, ['requestId', 'candidateIds', 'candidates']) || !id(data.requestId) || !ids(data.candidateIds)
      || !Array.isArray(data.candidates) || data.candidates.length !== data.candidateIds.length
      || !data.candidates.every((item, i) => object(item, ['candidateId', 'reviewStatus'])
        && item.candidateId === data.candidateIds[i] && statuses.includes(item.reviewStatus))) invalid();
  } else if (tool === 'knowledge_read') {
    if (!knowledgeItem(data)) invalid();
  } else if (tool === 'knowledge_search') {
    if (!object(data, ['items', 'hasMore', 'nextCursor', 'coverage']) || !Array.isArray(data.items) || data.items.length > 10
      || !data.items.every(knowledgeItem) || typeof data.hasMore !== 'boolean'
      || !(data.nextCursor === null || typeof data.nextCursor === 'string' && data.nextCursor.length <= 2048)
      || data.hasMore !== (data.nextCursor !== null) || data.coverage !== 'explicit-knowledge-grant-known-sources-checked') invalid();
  } else invalid();
  return data;
}

/** 与可替换的 tools 表分离：按真实工具名与调用参数读取，绝不信任工具提供的实体标题/正文/ID。 */
export function createMcpEntityOutput({ getAi }) {
  const navigation = createMcpNavigation(), guards = new WeakMap();
  const assertCurrent = data => {
    const guard = guards.get(data);
    if (!guard || getAi() !== guard.ai || guard.ai?.mcpKnowledgeRead !== guard.service) throw mcpError('MCP_ENTITY_UNAVAILABLE', '资料库或授权对象已变化。', { status: 404 });
    try { guard.check(); }
    catch { throw mcpError('MCP_ENTITY_UNAVAILABLE', '对象不存在或不在当前授权范围。', { status: 404 }); }
  };
  const output = async context => {
    const { tool } = context, ai = getAi(), service = ai?.mcpKnowledgeRead;
    if (!service) throw mcpError('MCP_TOOL_UNAVAILABLE', '授权实体服务当前不可用。', { status: 503 });
    let data, check;
    try {
      if (tool === 'notes_list' || tool === 'workspace_describe') {
        check = service.captureNavigationGuard({ grantId: context.grantId });
        data = tool === 'notes_list' ? await navigation.notesList(context) : await navigation.workspaceDescribe(context);
      } else if (tool === 'knowledge_propose') {
        data = await service.proposalReceipt(context);
        check = () => service.assertCurrent(data);
      } else if (tool === 'proposals_get') {
        data = await service.proposalGet({ ...context, requestId: context.input.requestId });
        check = () => service.assertCurrent(data);
      } else if (tool === 'knowledge_read') {
        data = await service.knowledgeRead({ ...context, knowledgeId: context.input.knowledgeId });
        check = () => service.assertCurrent(data);
      } else if (tool === 'knowledge_search') {
        data = await searchMcpKnowledge({ ...context, service, registerGuard: guard => { check = guard; } });
      } else invalid();
    } catch (error) {
      if (error?.code === 'MCP_ENTITY_UNAVAILABLE') throw mcpError('MCP_ENTITY_UNAVAILABLE', '对象不存在或不在当前授权范围。', { status: 404 });
      throw error;
    }
    guards.set(data, { ai, service, check });
    assertCurrent(data);
    return validateMcpEntityOutput(tool, data);
  };
  output.assertCurrent = assertCurrent;
  return output;
}

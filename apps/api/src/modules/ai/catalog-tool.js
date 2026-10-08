/** 目录类只读工具：让模型看到授权范围内的目录结构与笔记标题（元数据，不含正文）。 */
export const FOLDER_LIMIT = 30;
export const NOTE_LIMIT = 20;
export const CATALOG_TOOL_NAMES = Object.freeze(['folders_list', 'notes_list']);
export const MAX_CATALOG_SPECS = 3;

export const FOLDERS_LIST_TOOL = Object.freeze({ name: 'folders_list',
  description: '列出授权范围内的目录及各目录的笔记数。不传 parentId 时返回最上层目录，传入某目录 ID 则返回它的子目录；结果以 catalog 提供。只能看到授权范围内的目录。',
  parameters: { type: 'object', properties: { parentId: { type: 'string', maxLength: 128 },
    limit: { type: 'integer', minimum: 1, maximum: FOLDER_LIMIT }, offset: { type: 'integer', minimum: 0 } },
  additionalProperties: false } });

export const NOTES_LIST_TOOL = Object.freeze({ name: 'notes_list',
  description: '列出授权范围内的笔记标题、ID 和更新时间（不含正文），结果以 catalog 提供。可按 folderId 限定目录（默认只含该目录直接包含的笔记，recursive=true 含子目录），或用 titleQuery 按标题关键词查找；需要正文时再用 notes_read。',
  parameters: { type: 'object', properties: { folderId: { type: 'string', maxLength: 128 },
    titleQuery: { type: 'string', maxLength: 100 }, recursive: { type: 'boolean' },
    limit: { type: 'integer', minimum: 1, maximum: NOTE_LIMIT }, offset: { type: 'integer', minimum: 0 } },
  additionalProperties: false } });

function invalid() {
  const error = new Error('目录工具参数无效。');
  error.code = 'AI_TOOL_ARGUMENTS_INVALID';
  return error;
}
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

/** 工具参数 → 固定形状的规格；既用于执行校验，也用于重建发送给模型的 catalog 和清单记录。 */
export function normalizeCatalogSpec(toolName, args) {
  const allowed = toolName === 'folders_list' ? ['parentId', 'limit', 'offset']
    : toolName === 'notes_list' ? ['folderId', 'titleQuery', 'recursive', 'limit', 'offset'] : null;
  if (!allowed || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !allowed.includes(key))) throw invalid();
  const maxLimit = toolName === 'folders_list' ? FOLDER_LIMIT : NOTE_LIMIT;
  const limit = args.limit ?? maxLimit, offset = args.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit || !Number.isSafeInteger(offset) || offset < 0) throw invalid();
  if (toolName === 'folders_list') {
    if (args.parentId !== undefined && !validId(args.parentId)) throw invalid();
    return { kind: 'folders', parentId: args.parentId ?? null, offset, limit };
  }
  if (args.folderId !== undefined && !validId(args.folderId)) throw invalid();
  if (args.titleQuery !== undefined && (typeof args.titleQuery !== 'string' || !args.titleQuery.trim() || args.titleQuery.length > 100)) throw invalid();
  if (args.recursive !== undefined && typeof args.recursive !== 'boolean') throw invalid();
  return { kind: 'notes', folderId: args.folderId ?? null, titleQuery: args.titleQuery?.trim() ?? null,
    recursive: args.recursive ?? false, offset, limit };
}

/** 只取本回合最近几次成功的目录调用，按参数去重；过多的目录结果会挤占来源预算。 */
export function catalogSpecsFromCalls(calls) {
  const specs = new Map();
  for (const call of calls) {
    if (call.status !== 'succeeded' || !CATALOG_TOOL_NAMES.includes(call.toolName)) continue;
    let spec;
    try { spec = normalizeCatalogSpec(call.toolName, call.argumentsJson); } catch { continue; }
    const key = JSON.stringify(spec);
    specs.delete(key);
    specs.set(key, spec);
  }
  return [...specs.values()].slice(-MAX_CATALOG_SPECS);
}

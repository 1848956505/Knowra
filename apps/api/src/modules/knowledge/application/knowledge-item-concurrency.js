import { conflictError, validationError } from './knowledge-errors.js';

export function assertKnowledgeItemBaseline(item, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('KNOWLEDGE_ITEM_BASELINE_INVALID', '知识操作参数无效。');
  }
  if (input.expectedUpdatedAt === undefined) return;
  if (typeof input.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
    throw validationError('KNOWLEDGE_ITEM_BASELINE_INVALID', '知识版本无效，请重新加载后再操作。');
  }
  if (new Date(input.expectedUpdatedAt).toISOString() !== new Date(item.updatedAt).toISOString()) {
    throw conflictError('KNOWLEDGE_ITEM_UPDATE_CONFLICT', '知识已被其他操作修改，请重新加载并核对后再保存或确认。');
  }
}

/** 确保同一毫秒内连续编辑也会推进并发基线。 */
export function nextKnowledgeItemTimestamp(item) {
  return new Date(Math.max(Date.now(), (Date.parse(item?.updatedAt) || 0) + 1)).toISOString();
}

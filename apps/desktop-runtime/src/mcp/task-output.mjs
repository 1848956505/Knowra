import { createHash } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';

export const TASK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const TASK_IMAGE_MAX_PIXELS = 16_000_000;
export const TASK_DOCUMENT_PAGE_UNITS = 16 * 1024;
const invalid = () => { throw mcpError('MCP_RESULT_INVALID', '任务结果不符合安全输出契约。', { status: 500 }); };
const boundary = (text, i) => i <= 0 || i >= text.length || !(text.charCodeAt(i - 1) >= 0xD800 && text.charCodeAt(i - 1) <= 0xDBFF && text.charCodeAt(i) >= 0xDC00 && text.charCodeAt(i) <= 0xDFFF);
const string = value => typeof value === 'string' ? value : invalid();
const scalar = value => value === null || ['string', 'boolean'].includes(typeof value) || Number.isFinite(value) ? value : invalid();
const array = (value, map) => Array.isArray(value) ? value.map(map) : invalid();
const pick = (value, fields, nested = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const out = {};
  for (const field of fields.split(' ')) if (value[field] !== undefined) out[field] = scalar(value[field]);
  for (const [field, map] of Object.entries(nested)) if (value[field] !== undefined) out[field] = value[field] === null ? null : map(value[field]);
  return out;
};
const actor = value => pick(value, 'kind id');
const ref = value => pick(value, 'documentId versionId');
const attachment = value => pick(value, 'id documentId fileName mimeType size sha256 status createdAt');
const version = value => pick(value, 'id ordinal contentHash createdAt', { actor });
const workspace = value => pick(value, 'id name description archivedAt revision createdAt updatedAt');
const requirement = value => pick(value, 'id ordinal inScope outOfScope createdAt', { description: ref, acceptanceCriteria: v => array(v, string), actor });
const review = value => pick(value, 'id submissionId requirementId decision comment createdAt', { actor });
const submission = value => pick(value, 'id requirementId summary createdAt', { artifacts: v => array(v, ref) });
const attempt = value => pick(value, 'id taskId workspaceId requirementId generation status leaseExpiresAt startedAt finishedAt', {
  actor, progress: v => pick(v, 'message updatedAt'), submission
});
const task = value => pick(value, 'id workspaceId title status revision currentRequirementId activeAttemptId leaseExpiresAt leaseExpired claimable updatedAt createdAt', {
  currentRequirement: requirement, currentAttempt: attempt, latestReview: review,
  currentExecutor: value => pick(value, 'kind id label'), latestProgress: value => pick(value, 'message updatedAt'),
  events: v => pick(v, 'afterSequence nextAfterSequence')
});
const event = value => pick(value, 'sequence type createdAt', { actor,
  data: v => pick(v, 'requirementId attemptId submissionId reviewId generation message decision comment status documentId versionId') });
export const taskDocumentDto = value => pick(value, 'id workspaceId title revision currentVersionId markdown', {
  version, attachments: v => array(v, attachment)
});
function page(value, mapper) {
  return { items: array(value.items, mapper), nextCursor: value.nextCursor === null ? null : string(value.nextCursor) };
}
function documentPage(value, input) {
  const out = taskDocumentDto(value), markdown = string(out.markdown);
  const start = input.start ?? 0, requestedEnd = input.end ?? start + TASK_DOCUMENT_PAGE_UNITS;
  // 领域服务已分页时沿用绝对偏移；纯输出测试也可传完整正文。
  const base = value.start ?? 0, localStart = start - base;
  if (!Number.isSafeInteger(base) || localStart < 0 || localStart > markdown.length || requestedEnd <= start || !boundary(markdown, localStart)
    || value.end !== undefined && value.end !== base + markdown.length) {
    throw mcpError('MCP_REQUEST_INVALID', '文档阅读范围无效。', { status: 422 });
  }
  let localEnd = Math.min(markdown.length, requestedEnd - base, localStart + TASK_DOCUMENT_PAGE_UNITS);
  while (!boundary(markdown, localEnd)) localEnd--;
  return { ...out, markdown: markdown.slice(localStart, localEnd), start, end: base + localEnd,
    hasMore: localEnd < markdown.length || value.hasMore === true };

}

/** 新领域 DTO 白名单；storageKey、内部版本数组、本机路径不进入协议。 */
export function taskTextResult(method, value, input = {}, maxBytes = 131072) {
  let data;
  if (method === 'listWorkspaces') data = page(value, workspace);
  else if (method === 'listDocuments') data = page(value, item => { const dto = taskDocumentDto(item); delete dto.markdown; return dto; });
  else if (method === 'getDocument') data = documentPage(value, input);
  else if (method === 'listTasks') data = page(value, task);
  else if (method === 'getTask') data = task(value);
  else if (method === 'listTaskEvents') data = { items: array(value.items, event), nextAfterSequence: scalar(value.nextAfterSequence) };
  else {
    if (typeof value.reused !== 'boolean') invalid();
    data = { operationId: string(value.operationId), reused: value.reused, data: pick(value.data, '', {
      document: item => { const dto = taskDocumentDto(item); delete dto.markdown; return dto; }, task, attempt
    }) };
  }
  const result = { content: [{ type: 'text', text: JSON.stringify(data) }] };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) throw mcpError('MCP_RESULT_TOO_LARGE', '结果超过文本预算，请缩小范围。', { status: 413 });
  return result;
}

/** bytes 只能来自已校验引用与解码尺寸的领域附件读取器；不抓取 URL、不接受本机路径。 */
export function taskImageResult(value, input) {
  const { bytes, mimeType, width, height } = value;
  if (typeof value.versionContentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.versionContentHash) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > TASK_IMAGE_MAX_BYTES
    || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > TASK_IMAGE_MAX_PIXELS
    || ['workspaceId', 'documentId', 'versionId'].some(key => value[key] !== input[key])
    || value.attachment?.id !== input.attachmentId || value.attachment?.documentId !== input.documentId
    || value.attachment?.status !== 'ready' || value.attachment?.size !== bytes.length || value.attachment?.mimeType !== mimeType
    || createHash('sha256').update(bytes).digest('hex') !== value.attachment?.sha256) invalid();
  return { content: [{ type: 'image', data: bytes.toString('base64'), mimeType }, {
    type: 'text', text: JSON.stringify({ workspaceId: input.workspaceId, documentId: input.documentId,
      versionId: input.versionId, versionContentHash: value.versionContentHash, attachmentId: input.attachmentId, sha256: value.attachment.sha256, width, height, bytes: bytes.length })
  }] };
}

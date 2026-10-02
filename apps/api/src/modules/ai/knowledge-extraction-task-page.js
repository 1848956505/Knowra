import { hashRecord } from './record-contract.js';
import { taskError, taskId } from './knowledge-extraction-task-contract.js';

const invalid = () => { throw taskError('KNOWLEDGE_EXTRACTION_REQUEST_INVALID', '任务分页请求无效。', 422); };

export function extractionPageInput(input, identity, ownerId) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !['spaceId', 'idempotencyKey', 'limit', 'cursor'].includes(key))
    || !taskId(input.spaceId) || (input.idempotencyKey !== undefined && !taskId(input.idempotencyKey))) invalid();
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
  const page = { ownerId, ...identity, spaceId: input.spaceId, idempotencyKey: input.idempotencyKey, limit };
  const binding = hashRecord({ ownerId, ...identity, spaceId: input.spaceId, idempotencyKey: input.idempotencyKey ?? null });
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== 'string' || input.cursor.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) invalid();
    let value;
    try { value = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { invalid(); }
    if (!value || Array.isArray(value) || Object.keys(value).length !== 4 || value.version !== 1 || value.binding !== binding
      || !taskId(value.jobId) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) invalid();
    page.before = { createdAt: value.createdAt, jobId: value.jobId };
  }
  return { page, cursor: row => Buffer.from(JSON.stringify({ version: 1, binding, createdAt: row.createdAt, jobId: row.jobId })).toString('base64url') };
}

/** JSON 全状态已在内存；先筛选截页，再复制，不复制整个 owner 的私有记录。 */
export function extractionPageRows(jobs, taskIds, input) {
  return jobs.filter(job => taskIds.has(job.jobId) && job.ownerId === input.ownerId && job.datasetId === input.datasetId
    && job.datasetEpoch === input.datasetEpoch && job.spaceId === input.spaceId && job.jobKind === 'knowledgeExtraction'
    && (input.idempotencyKey === undefined || job.idempotencyKey === input.idempotencyKey)
    && (!input.before || job.createdAt < input.before.createdAt || job.createdAt === input.before.createdAt && job.jobId < input.before.jobId))
    .sort((a, b) => a.createdAt === b.createdAt ? (a.jobId < b.jobId ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)
    .slice(0, input.limit + 1).map(({ jobId, createdAt }) => ({ jobId, createdAt }));
}

/** 专用参数化查询：数据库只返回一页，不经通用 repository.list 全量读取。 */
export function extractionPageSql(input, postgres = false) {
  const values = [];
  const bind = value => { values.push(value); return postgres ? `$${values.length}` : '?'; };
  const where = [
    `j.owner_id = ${bind(input.ownerId)}`, `j.dataset_id = ${bind(input.datasetId)}`,
    `j.dataset_epoch = ${bind(input.datasetEpoch)}`, `j.space_id = ${bind(input.spaceId)}`,
    "j.job_kind = 'knowledgeExtraction'"
  ];
  if (input.idempotencyKey !== undefined) where.push(`j.idempotency_key = ${bind(input.idempotencyKey)}`);
  if (input.before) where.push(`(j.created_at < ${bind(input.before.createdAt)} OR (j.created_at = ${bind(input.before.createdAt)} AND j.job_id < ${bind(input.before.jobId)}))`);
  const sql = `SELECT j.job_id, j.created_at FROM ai_jobs j
    JOIN ai_knowledge_extraction_tasks t ON t.owner_id = j.owner_id AND t.dataset_id = j.dataset_id AND t.job_id = j.job_id
    WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC, j.job_id DESC LIMIT ${bind(input.limit + 1)}`;
  return { sql, values };
}

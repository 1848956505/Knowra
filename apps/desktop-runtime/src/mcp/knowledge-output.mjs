import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';

const key = randomBytes(32);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
const sign = text => createHmac('sha256', key).update(text).digest('base64url');
const invalid = () => mcpError('MCP_REQUEST_INVALID', '知识检索参数或分页游标无效。', { status: 400 });
const stale = () => mcpError('MCP_CURSOR_STALE', '可读取知识已变化，请从第一页重新检索。', { status: 409 });
const statuses = ['candidate', 'confirmed', 'needsRevision', 'archived', 'all'];
const fold = value => value.normalize('NFKC').toLowerCase();

/** 在服务完成逐实体授权过滤以后才检索；隐藏实体不参与匹配、排序、计数或游标。 */
export async function searchMcpKnowledge({ service, input, grantId, access, pairing, registerGuard = () => {} }) {
  const { query, reviewStatus = 'confirmed', limit = 10, cursor } = input;
  if (typeof query !== 'string' || !query.trim() || query.length > 300 || !statuses.includes(reviewStatus)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 10
    || cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 2048)) throw invalid();
  const binding = sign(JSON.stringify([pairing.pairingId, query, reviewStatus, limit]));
  let previous = null;
  if (cursor !== undefined) {
    const [body, signature, extra] = cursor.split('.');
    if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(body ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(signature ?? '')
      || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))) throw invalid();
    try { previous = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw invalid(); }
    if (!previous || Object.keys(previous).sort().join(',') !== 'after,binding,snapshot'
      || previous.binding !== binding || typeof previous.after !== 'string' || typeof previous.snapshot !== 'string') throw invalid();
  }
  const eligible = await service.knowledgeList({ grantId, access });
  registerGuard(() => service.assertCurrent(eligible));
  const ordered = [...eligible].sort((a, b) => a.knowledgeId < b.knowledgeId ? -1 : a.knowledgeId > b.knowledgeId ? 1 : 0);
  const snapshot = hash(ordered);
  if (previous && previous.snapshot !== snapshot) throw stale();
  const needle = fold(query.trim());
  const matches = ordered.filter(item => (reviewStatus === 'all' || item.reviewStatus === reviewStatus)
    && [item.title, item.canonicalStatement, item.userExplanation].some(text => fold(text).includes(needle)));
  const index = previous ? matches.findIndex(item => item.knowledgeId === previous.after) : -1;
  if (previous && index < 0) throw invalid();
  const items = matches.slice(index + 1, index + 1 + limit);
  const hasMore = index + 1 + items.length < matches.length;
  let nextCursor = null;
  if (hasMore) {
    const body = Buffer.from(JSON.stringify({ after: items.at(-1).knowledgeId, binding, snapshot })).toString('base64url');
    nextCursor = `${body}.${sign(body)}`;
  }
  return { items, hasMore, nextCursor, coverage: 'explicit-knowledge-grant-known-sources-checked' };
}

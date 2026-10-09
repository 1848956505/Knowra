import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchMcpKnowledge } from '../src/mcp/knowledge-output.mjs';

const item = (knowledgeId, reviewStatus = 'confirmed') => ({ knowledgeId, title: '过拟合', canonicalStatement: `归纳后的知识 ${knowledgeId}`,
  userExplanation: '', knowledgeType: 'concept', reviewStatus, sourceMode: 'ai', updatedAt: '2026-01-01T00:00:00Z', sources: [] });
function fixture(rows) {
  const state = { rows };
  const context = { service: { knowledgeList: async () => structuredClone(state.rows) }, pairing: { pairingId: 'pair-a' }, grantId: 'g', access: {} };
  return { state, context, search: (input = {}) => searchMcpKnowledge({ ...context, input: { query: '过拟合', ...input } }) };
}

test('知识检索只匹配服务已授权 DTO，默认正式知识，明确查询可读取候选与归档', async () => {
  const f = fixture([item('1'), item('2', 'candidate'), item('3', 'archived')]);
  assert.deepEqual((await f.search()).items.map(row => row.knowledgeId), ['1']);
  assert.deepEqual((await f.search({ reviewStatus: 'all' })).items.map(row => row.knowledgeId), ['1', '2', '3']);
  assert.equal((await f.search({ reviewStatus: 'candidate' })).items[0].reviewStatus, 'candidate');
  assert.equal((await f.search({ query: '归纳后的知识' })).items.length, 1);
  assert.equal((await f.search({ query: 'hidden unauthorized word' })).items.length, 0);
});

test('知识稳定游标分页无重复，绑定配对/查询/状态/页大小，快照变化失效', async () => {
  const f = fixture(Array.from({ length: 23 }, (_, i) => item(String(i).padStart(2, '0'))));
  const found = [], cursors = [];
  let cursor;
  do {
    const page = await f.search({ limit: 5, ...(cursor ? { cursor } : {}) });
    found.push(...page.items.map(row => row.knowledgeId));
    cursor = page.nextCursor;
    if (cursor) cursors.push(cursor);
  } while (cursor);
  assert.equal(new Set(found).size, 23);
  assert.deepEqual(found, f.state.rows.map(row => row.knowledgeId));
  for (const input of [{ query: '归纳' }, { reviewStatus: 'all' }, { limit: 4 }, { cursor: cursors[0] + 'x' }]) {
    await assert.rejects(f.search({ limit: 5, cursor: cursors[0], ...input }), { code: 'MCP_REQUEST_INVALID' });
  }
  await assert.rejects(searchMcpKnowledge({ ...f.context, pairing: { pairingId: 'other' }, input: { query: '过拟合', limit: 5, cursor: cursors[0] } }), { code: 'MCP_REQUEST_INVALID' });
  f.state.rows[0].canonicalStatement = '正文已经修改';
  await assert.rejects(f.search({ limit: 5, cursor: cursors[0] }), { code: 'MCP_CURSOR_STALE' });
});

test('知识游标不携带正文、查询或配对 ID，空结果明确覆盖边界且无全库数量', async () => {
  const f = fixture([item('a'), item('b')]);
  const page = await f.search({ limit: 1 });
  const decoded = Buffer.from(page.nextCursor.split('.')[0], 'base64url').toString('utf8');
  for (const text of ['过拟合', '归纳后的知识', 'pair-a']) assert(!decoded.includes(text));
  const empty = await f.search({ query: '不存在' });
  assert.deepEqual(empty, { items: [], hasMore: false, nextCursor: null, coverage: 'explicit-knowledge-grant-known-sources-checked' });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMcpEntityOutput } from '../src/mcp/entity-output.mjs';

test('导航与回执实体 DTO 逐字段白名单校验，不接受扩展自由文本或状态注入', () => {
  const cases = [
    ['notes_list', { notes: [{ noteId: 'n', title: '当前授权标题', noteVersionId: 'v', contentHash: 'h' }], nextCursor: null, hasMore: false, coverage: 'complete-authorized-snapshot' }],
    ['workspace_describe', { scope: 'authorized-notes', noteCount: 1, capabilities: { noteMetadata: true, noteContent: 'authorized-only', arbitraryPaths: false, officialWrites: false } }],
    ['knowledge_propose', { requestId: 'r', candidateIds: ['c'], saved: true, reused: false }],
    ['proposals_get', { requestId: 'r', candidateIds: ['c'], candidates: [{ candidateId: 'c', reviewStatus: 'candidate' }] }]
  ];
  for (const [tool, data] of cases) {
    assert.deepEqual(validateMcpEntityOutput(tool, data), data);
    assert.throws(() => validateMcpEntityOutput(tool, { ...data, secret: '不能外发' }), { code: 'MCP_RESULT_INVALID' });
  }
  assert.throws(() => validateMcpEntityOutput('other', {}), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => validateMcpEntityOutput('proposals_get', { requestId: 'r', candidateIds: ['c'], candidates: [{ candidateId: 'other', reviewStatus: 'candidate' }] }), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => validateMcpEntityOutput('proposals_get', { requestId: 'r', candidateIds: ['c'], candidates: [{ candidateId: 'c', reviewStatus: 'secret text' }] }), { code: 'MCP_RESULT_INVALID' });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMcpGate } from '../src/mcp/mcp-gate.mjs';

/** 内存假授权：校验第二篇笔记期间可以把第一篇改成私密，复现“逐篇校验后最终只复核配对”的竞态。 */
function fixture({ onVerify } = {}) {
  const notes = new Map([['a', { id: 'a', title: 'A', content: 'AAAA 正文', private: false }], ['b', { id: 'b', title: 'B', content: 'BBBB 正文', private: false }]]);
  const state = { notes, batchChecks: 0 };
  const access = {
    createRunGrant: async () => ({ grantId: 'g', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    assertSearchGrant: async () => {},
    verifyRead: async ({ noteId }) => {
      const note = notes.get(noteId);
      if (!note || note.private) throw Object.assign(new Error('x'), { code: 'AI_SCOPE_FORBIDDEN' });
      const snapshot = { note: { id: note.id, title: note.title }, version: { id: `${note.id}-v`, content: note.content }, contentHash: `${note.id}-h` };
      await new Promise(resolve => setTimeout(resolve, 5)); // 异步读取
      await onVerify?.(noteId, state);
      return snapshot;
    },
    assertSearchSources: async ({ sourceRefs }) => {
      state.batchChecks += 1;
      for (const ref of sourceRefs) if (notes.get(ref.noteId).private) throw Object.assign(new Error('x'), { code: 'AI_SCOPE_FORBIDDEN' });
    }
  };
  const row = { pairingId: 'p', policyId: 'pol', revokedAt: null, expiresAt: '2999-01-01T00:00:00Z' };
  const pairings = { authenticate: () => row, assertActive: () => {}, dayCalls: () => 0, recordUse: () => {} };
  const audit = { append() {} };
  const gate = createMcpGate({ pairings, getAccess: () => access, flags: () => ({ aiEnabled: true, allowExternal: true }), audit,
    tools: { both: { metaKeys: [], run: async () => ({ fragments: [
      { noteId: 'a', title: 'A', start: 0, end: 4, text: 'AAAA' }, { noteId: 'b', title: 'B', start: 0, end: 4, text: 'BBBB' }] }) } } });
  return { gate, state };
}

test('多来源逐篇校验期间前一篇被改为私密：返回前的批量复核拦截，响应不含任何正文', async () => {
  const { gate, state } = fixture({ onVerify: (noteId, current) => { if (noteId === 'b') current.notes.get('a').private = true; } });
  await assert.rejects(gate.call({ token: 't', tool: 'both' }), error => { assert.equal(error.code, 'MCP_ACCESS_REVOKED'); return true; });
  assert.equal(state.batchChecks, 1);
});

test('没有竞态时多来源正常返回，并做一次批量复核', async () => {
  const { gate, state } = fixture();
  const result = await gate.call({ token: 't', tool: 'both' });
  assert.deepEqual(result.fragments.map(item => item.text), ['AAAA', 'BBBB']);
  assert.equal(state.batchChecks, 1);
});

test('片段附加字段只允许声明过的键与受限取值，不能夹带自由文本', async () => {
  const build = attrs => {
    const gate = createMcpGate({ pairings: { authenticate: () => ({ pairingId: 'p', policyId: 'pol', revokedAt: null, expiresAt: '2999-01-01T00:00:00Z' }), assertActive() {}, dayCalls: () => 0, recordUse() {} },
      getAccess: () => ({ createRunGrant: async () => ({ grantId: 'g', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }), assertSearchGrant: async () => {},
        verifyRead: async () => ({ note: { id: 'a', title: 'A' }, version: { id: 'v', content: 'AAAA 正文' }, contentHash: 'h' }), assertSearchSources: async () => {} }),
      flags: () => ({ aiEnabled: true, allowExternal: true }), audit: { append() {} },
      tools: { t: { fragmentAttrs: { importance: { enum: ['normal', 'core'] }, truncated: { boolean: true }, id: { pattern: '^[a-z0-9-]{1,10}$' } },
        run: async () => ({ fragments: [{ noteId: 'a', title: 'A', start: 0, end: 4, text: 'AAAA', attrs }] }) } } });
    return gate.call({ token: 't', tool: 't' });
  };
  assert.deepEqual((await build({ importance: 'core', truncated: false, id: 'abc-1' })).fragments[0].attrs, { importance: 'core', truncated: false, id: 'abc-1' });
  for (const attrs of [{ importance: '带自由文本的重要度' }, { truncated: 'yes' }, { id: 'AAAA 正文 泄露' }, { undeclared: true }, 'text'])
    await assert.rejects(build(attrs), error => { assert.equal(error.code, 'MCP_RESULT_INVALID'); return true; });
});

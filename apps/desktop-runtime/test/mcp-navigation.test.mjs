import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMcpNavigation } from '../src/mcp/navigation.mjs';

const metadata = (noteId, title = `标题 ${noteId}`) => ({ noteId, title, noteVersionId: `v-${noteId}`, contentHash: `hash-${noteId}` });
const code = expected => error => { assert.equal(error.code, expected); return true; };
const inaccessible = () => { throw new Error('不得读取正文、目录或私密元数据'); };

/** 全库访问、正文和目录属性都设置为陷阱；导航只能使用授权清单及其复核接口。 */
function fixture(rows = [metadata('b'), metadata('a')], hooks = {}) {
  const privateRow = { noteId: 'private', noteVersionId: 'private-version', contentHash: 'private-hash', get title() { return inaccessible(); } };
  const state = { records: new Map([...rows.map(row => [row.noteId, { ...row }]), ['private', privateRow]]),
    authorized: new Set(rows.map(row => row.noteId)), listCalls: 0, verifyCalls: [], batchCalls: [], grantCalls: 0, grantRevoked: false };
  const available = noteId => {
    const row = state.records.get(noteId);
    if (!row || !state.authorized.has(noteId)) throw Object.assign(new Error('来源不可读'), { code: 'AI_SCOPE_FORBIDDEN' });
    return row;
  };
  const access = {
    listAllNotes: inaccessible, listFolders: inaccessible,
    async listAuthorizedNotes({ grantId }) {
      assert.equal(grantId, 'grant');
      state.listCalls++;
      const result = [...state.authorized].filter(id => state.records.has(id)).map(id => {
        const row = available(id);
        return { noteId: row.noteId, title: row.title, noteVersionId: row.noteVersionId, contentHash: row.contentHash,
          get content() { return inaccessible(); }, get folderName() { return inaccessible(); } };
      });
      await hooks.onList?.(state, result);
      return result;
    },
    async verifyRead({ grantId, noteId, tool }) {
      assert.equal(grantId, 'grant'); assert.equal(tool, 'notes_read');
      state.verifyCalls.push(noteId);
      const row = available(noteId);
      const result = { note: { id: row.noteId, title: row.title, get folderName() { return inaccessible(); } },
        version: { id: row.noteVersionId, get content() { return inaccessible(); } }, contentHash: row.contentHash };
      await hooks.onVerify?.(state, noteId);
      return result;
    },
    async assertSearchSources({ grantId, sourceRefs }) {
      assert.equal(grantId, 'grant'); state.batchCalls.push(sourceRefs);
      await hooks.onBatch?.(state);
      for (const source of sourceRefs) {
        const row = available(source.noteId);
        if (source.contentHash !== row.contentHash) throw Object.assign(new Error('来源变化'), { code: 'AI_SOURCE_STALE' });
      }
    },
    async assertSearchGrant({ grantId }) {
      assert.equal(grantId, 'grant'); state.grantCalls++;
      await hooks.onGrant?.(state);
      if (state.grantRevoked) throw Object.assign(new Error('授权失效'), { code: 'AI_GRANT_REVOKED' });
    }
  };
  const context = { grantId: 'grant', access, pairing: { pairingId: 'pairing-a' } };
  const navigation = createMcpNavigation();
  return { state, access, context, list: input => navigation.notesList({ ...context, input }),
    describe: input => navigation.workspaceDescribe({ ...context, input }) };
}

test('授权导航只外发四字段元数据和授权计数，不读取正文、目录或私密标题', async () => {
  const { list, describe, state } = fixture([metadata('b', ''), metadata('a', '授权标题')]);
  assert.deepEqual(await list({}), { notes: [metadata('a', '授权标题'), metadata('b', '')], nextCursor: null,
    hasMore: false, coverage: 'complete-authorized-snapshot' });
  assert.deepEqual(await describe({}), { scope: 'authorized-notes', noteCount: 2,
    capabilities: { noteMetadata: true, noteContent: 'authorized-only', arbitraryPaths: false, officialWrites: false } });
  assert.deepEqual(state.verifyCalls, ['a', 'b', 'a', 'b']);
  assert.equal(state.batchCalls.length, 2); assert.equal(state.grantCalls, 2);
  assert.deepEqual(state.batchCalls[0], [{ noteId: 'a', contentHash: 'hash-a' }, { noteId: 'b', contentHash: 'hash-b' }]);
});

test('完整授权快照按 ID 排序分页，45 条无重复遗漏，独立实例可权威重算游标', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => metadata(`n-${String(i).padStart(3, '0')}`)).reverse();
  const { list, context } = fixture(rows);
  const first = await list({});
  assert.equal(first.notes.length, 20); assert.equal(first.hasMore, true);
  assert.deepEqual(await createMcpNavigation().notesList({ ...context, input: {} }), first);
  const second = await createMcpNavigation().notesList({ ...context, input: { cursor: first.nextCursor } });
  assert.equal(second.notes.length, 20); assert.equal(second.hasMore, true);
  const third = await list({ cursor: second.nextCursor });
  assert.equal(third.notes.length, 5); assert.equal(third.hasMore, false); assert.equal(third.nextCursor, null);
  const ids = [...first.notes, ...second.notes, ...third.notes].map(note => note.noteId);
  assert.deepEqual(ids, rows.map(note => note.noteId).sort());
  assert.equal(new Set(ids).size, 45);
});

test('标题过滤覆盖完整授权快照，大小写与首尾空白不影响匹配', async () => {
  const { list } = fixture([metadata('d', '空白'), metadata('b', 'Beta alpha'), metadata('a', 'ALPHA'), metadata('c', 'Alpha 后缀')]);
  const first = await list({ titleQuery: ' alpha ', limit: 2 });
  assert.deepEqual(first.notes.map(note => note.noteId), ['a', 'b']);
  assert.equal(first.hasMore, true);
  const second = await list({ titleQuery: ' alpha ', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.notes.map(note => note.noteId), ['c']);
  assert.equal(second.hasMore, false);
  const empty = await list({ titleQuery: '不匹配任何授权标题' });
  assert.deepEqual(empty, { notes: [], nextCursor: null, hasMore: false, coverage: 'complete-authorized-snapshot' });
  assert.equal(Object.hasOwn(empty, 'total'), false);
});

test('游标只携带摘要与末项 ID，不携带配对标识、标题、查询词或正文', async () => {
  const { list } = fixture([metadata('a', '秘密查询词第一条'), metadata('b', '秘密查询词第二条')]);
  const result = await list({ titleQuery: '秘密查询词', limit: 1 });
  const payload = JSON.parse(Buffer.from(result.nextCursor.split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['a', 'b', 's', 'v']);
  assert.equal(payload.a, 'a'); assert.equal(payload.v, 1);
  assert.match(payload.b, /^[A-Za-z0-9_-]{43}$/); assert.match(payload.s, /^[A-Za-z0-9_-]{43}$/);
  for (const secret of ['秘密查询词', 'pairing-a', '第一条', '第二条']) assert.equal(JSON.stringify(payload).includes(secret), false);
});

test('游标绑定配对、标题过滤与页大小，跨上下文和签名篡改在读取前拒绝', async () => {
  const { list, context, state } = fixture([metadata('a', '标题一'), metadata('b', '标题二')]);
  const { nextCursor } = await list({ titleQuery: '标题', limit: 1 });
  const before = state.listCalls;
  const invoke = (input, pairing = context.pairing) => createMcpNavigation().notesList({ ...context, input, pairing });
  await assert.rejects(invoke({ titleQuery: '标题', limit: 1, cursor: nextCursor }, { pairingId: 'pairing-b' }), code('MCP_REQUEST_INVALID'));
  await assert.rejects(invoke({ titleQuery: '标题一', limit: 1, cursor: nextCursor }), code('MCP_REQUEST_INVALID'));
  await assert.rejects(invoke({ limit: 1, cursor: nextCursor }), code('MCP_REQUEST_INVALID'));
  await assert.rejects(invoke({ titleQuery: '标题', limit: 2, cursor: nextCursor }), code('MCP_REQUEST_INVALID'));
  const [body, signature] = nextCursor.split('.');
  const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  await assert.rejects(invoke({ titleQuery: '标题', limit: 1, cursor: `${body}.${changedSignature}` }), code('MCP_REQUEST_INVALID'));
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  payload.a = 'b';
  const changedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
  await assert.rejects(invoke({ titleQuery: '标题', limit: 1, cursor: `${changedBody}.${signature}` }), code('MCP_REQUEST_INVALID'));
  assert.equal(state.listCalls, before);
});

test('非法参数与非法游标统一返回 MCP_REQUEST_INVALID，不开始授权读取', async () => {
  const { list, describe, state, context } = fixture();
  for (const input of [null, [], 'text', { limit: 0 }, { limit: 21 }, { limit: 1.5 }, { limit: null }, { limit: '1' },
    { titleQuery: '' }, { titleQuery: ' ' }, { titleQuery: 1 }, { titleQuery: 'x'.repeat(101) },
    { cursor: '' }, { cursor: null }, { cursor: 4 }, { cursor: 'x'.repeat(2049) }, { cursor: 'e30.signature' },
    { cursor: 'a.b.c' }, { offset: 2 }, { folderId: 'private-folder' }, { query: 'title' }]) {
    await assert.rejects(list(input), code('MCP_REQUEST_INVALID'));
  }
  for (const input of [null, [], { extra: true }, { noteCount: 1 }]) await assert.rejects(describe(input), code('MCP_REQUEST_INVALID'));
  await assert.rejects(createMcpNavigation().notesList({ ...context, pairing: {}, input: {} }), code('MCP_REQUEST_INVALID'));
  assert.equal(state.listCalls, 0);
});

test('授权集合、标题、版本和哈希变化使已有游标失效，包括本页之外的非匹配笔记', async () => {
  const changes = [
    state => { state.records.set('d', metadata('d')); state.authorized.add('d'); },
    state => state.records.delete('c'),
    state => state.authorized.delete('c'),
    state => { state.records.get('c').title = '新标题'; },
    state => { state.records.get('c').noteVersionId = 'new-version'; },
    state => { state.records.get('c').contentHash = 'new-hash'; }
  ];
  for (const change of changes) {
    const { list, state } = fixture([metadata('a', '匹配一'), metadata('b', '匹配二'), metadata('c', '不相关')]);
    const { nextCursor } = await list({ titleQuery: '匹配', limit: 1 });
    change(state);
    await assert.rejects(list({ titleQuery: '匹配', limit: 1, cursor: nextCursor }), code('MCP_CURSOR_STALE'));
  }
});

test('授权清单的底层顺序和未授权笔记变化不改变分页结果或泄露计数', async () => {
  const { list, state, describe } = fixture([metadata('a'), metadata('b'), metadata('c')]);
  const first = await list({ limit: 1 });
  state.authorized = new Set(['c', 'b', 'a']);
  state.records.set('unavailable-extra', metadata('unavailable-extra', '未授权标题'));
  const second = await list({ limit: 1, cursor: first.nextCursor });
  assert.deepEqual(second.notes.map(note => note.noteId), ['b']);
  assert.equal((await describe({})).noteCount, 3);
});

test('首次读取过程中标题或版本变化被拦截，第二次清单也检查新增授权笔记', async () => {
  for (const mutation of [state => { state.records.get('a').title = '改过的标题'; },
    state => { state.records.get('a').noteVersionId = 'new-version'; },
    state => { state.records.set('c', metadata('c')); state.authorized.add('c'); }]) {
    const { list } = fixture(undefined, { onVerify(state, noteId) { if (noteId === 'b') mutation(state); } });
    await assert.rejects(list({ limit: 1 }), code('MCP_CURSOR_STALE'));
  }
});

test('逐条复核与批量复核之间改为私密，不能外发已读标题或旧计数', async () => {
  for (const method of ['list', 'describe']) {
    const current = fixture(undefined, { onList(state) { if (state.listCalls === 2) state.authorized.delete('a'); } });
    await assert.rejects(current[method]({}), code('AI_SCOPE_FORBIDDEN'));
    assert.equal(current.state.batchCalls.length, 1);
  }
});

test('空授权或没有筛选命中仍复核授权，撤销后不返回空列表或计数', async () => {
  const empty = fixture([]);
  assert.deepEqual(await empty.list({}), { notes: [], nextCursor: null, hasMore: false, coverage: 'complete-authorized-snapshot' });
  assert.equal((await empty.describe({})).noteCount, 0);
  assert.equal(empty.state.batchCalls.length, 2); assert.equal(empty.state.grantCalls, 2);
  for (const rows of [[], [metadata('a')]]) {
    const { list } = fixture(rows, { onGrant(state) { state.grantRevoked = true; } });
    await assert.rejects(list({ titleQuery: '无匹配' }), code('AI_GRANT_REVOKED'));
  }
});

test('无效或重复的授权元数据不被静默丢弃，以免完整覆盖声明失真', async () => {
  const { context } = fixture();
  for (const rows of [null, [metadata('a'), metadata('a')], [{ ...metadata('a'), title: null }],
    [{ ...metadata('a'), noteVersionId: '' }], [{ ...metadata('a'), contentHash: '' }]]) {
    const access = { ...context.access, listAuthorizedNotes: async () => rows };
    await assert.rejects(createMcpNavigation().notesList({ ...context, access, input: {} }), code('MCP_RESULT_INVALID'));
  }
});

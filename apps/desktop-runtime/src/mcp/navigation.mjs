import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';

const PAGE_LIMIT = 20;
const CURSOR_LIMIT = 2048;
// 只保存进程密钥，不保存分页状态或笔记元数据；独立工具与出口实例可重建同一个结果。
const cursorKey = randomBytes(32);
const plainObject = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const onlyKeys = (value, keys) => plainObject(value) && Object.keys(value).every(key => keys.includes(key));
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
const seal = value => createHmac('sha256', cursorKey).update(value).digest('base64url');
const invalid = () => mcpError('MCP_REQUEST_INVALID', '目录参数或分页游标无效，请重新列出笔记。', { status: 400 });
const stale = () => mcpError('MCP_CURSOR_STALE', '授权笔记清单已变化，请从第一页重新列出笔记。', { status: 409 });
const badResult = () => mcpError('MCP_RESULT_INVALID', '授权笔记清单格式无效。', { status: 500 });
const compareIds = (a, b) => a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0;

function normalizeListInput(input, pairing) {
  if (!onlyKeys(input, ['titleQuery', 'limit', 'cursor']) || !validId(pairing?.pairingId)
    || input.titleQuery !== undefined && (typeof input.titleQuery !== 'string' || !input.titleQuery.trim() || input.titleQuery.length > 100)
    || input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > PAGE_LIMIT)
    || input.cursor !== undefined && (typeof input.cursor !== 'string' || !input.cursor || input.cursor.length > CURSOR_LIMIT)) throw invalid();
  return { titleQuery: input.titleQuery ?? '', limit: input.limit ?? PAGE_LIMIT, cursor: input.cursor };
}

function readCursor(cursor, binding) {
  if (cursor === undefined) return null;
  const [body, signature, extra] = cursor.split('.');
  if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(body ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(signature ?? '')) throw invalid();
  const expected = Buffer.from(seal(`cursor:${body}`));
  if (!timingSafeEqual(Buffer.from(signature), expected)) throw invalid();
  const bytes = Buffer.from(body, 'base64url');
  if (bytes.toString('base64url') !== body) throw invalid();
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch { throw invalid(); }
  if (!onlyKeys(payload, ['v', 's', 'a', 'b']) || Object.keys(payload).length !== 4 || payload.v !== 1
    || !/^[A-Za-z0-9_-]{43}$/.test(payload.s ?? '') || !validId(payload.a) || payload.b !== binding) throw invalid();
  return payload;
}

function writeCursor({ snapshotHash, afterId, binding }) {
  // 游标仅含摘要、上一页末项 ID 和版本；配对身份、标题和筛选词不进入载荷。
  const body = Buffer.from(JSON.stringify({ v: 1, s: snapshotHash, a: afterId, b: binding })).toString('base64url');
  return `${body}.${seal(`cursor:${body}`)}`;
}

function snapshotRows(rows) {
  if (!Array.isArray(rows)) throw badResult();
  const ids = new Set();
  const snapshot = rows.map(row => {
    if (!plainObject(row) || !validId(row.noteId) || typeof row.title !== 'string'
      || !validId(row.noteVersionId) || typeof row.contentHash !== 'string' || !row.contentHash
      || ids.has(row.noteId)) throw badResult();
    ids.add(row.noteId);
    return Object.freeze({ noteId: row.noteId, title: row.title, noteVersionId: row.noteVersionId, contentHash: row.contentHash });
  });
  return Object.freeze(snapshot.sort(compareIds));
}

/** 完整快照只有授权服务可以提供；绝不读取全库目录、正文、私密标题或未授权数量。 */
async function authorizedSnapshot({ access, grantId, cursor }) {
  const notes = snapshotRows(await access.listAuthorizedNotes({ grantId }));
  const snapshotHash = digest(notes);
  if (cursor && cursor.s !== snapshotHash) throw stale();
  for (const item of notes) {
    const { note, version, contentHash } = await access.verifyRead({ grantId, noteId: item.noteId, tool: 'notes_read' });
    if (note?.id !== item.noteId || note.title !== item.title || version?.id !== item.noteVersionId || contentHash !== item.contentHash) throw stale();
  }
  // 覆盖未出现在本页的标题、新增、删除和权限变化；即使没有匹配项也要复核完整授权清单。
  if (digest(snapshotRows(await access.listAuthorizedNotes({ grantId }))) !== snapshotHash) throw stale();
  await access.assertSearchSources({ grantId, sourceRefs: notes.map(({ noteId, contentHash }) => ({ noteId, contentHash })) });
  await access.assertSearchGrant({ grantId });
  return { notes, snapshotHash };
}

export function createMcpNavigation() {
  return {
    async notesList({ input = {}, grantId, access, pairing }) {
      const spec = normalizeListInput(input, pairing);
      // 不绑定短期 grantId：同一配对续签读取授权后仍可继续未变化的快照。
      const binding = seal(`binding:${JSON.stringify([pairing.pairingId, spec.titleQuery, spec.limit])}`);
      const cursor = readCursor(spec.cursor, binding);
      const { notes, snapshotHash } = await authorizedSnapshot({ access, grantId, cursor });
      const query = spec.titleQuery.trim().toLowerCase();
      const matches = notes.filter(note => !query || note.title.toLowerCase().includes(query));
      const previous = cursor ? matches.findIndex(note => note.noteId === cursor.a) : -1;
      if (cursor && previous < 0) throw invalid();
      const page = matches.slice(previous + 1, previous + 1 + spec.limit);
      const hasMore = previous + 1 + page.length < matches.length;
      return { notes: page, nextCursor: hasMore ? writeCursor({ snapshotHash, afterId: page.at(-1).noteId, binding }) : null,
        hasMore, coverage: 'complete-authorized-snapshot' };
    },
    async workspaceDescribe({ input = {}, grantId, access }) {
      if (!onlyKeys(input, [])) throw invalid();
      const { notes } = await authorizedSnapshot({ access, grantId });
      return { scope: 'authorized-notes', noteCount: notes.length,
        capabilities: { noteMetadata: true, noteContent: 'authorized-only', arbitraryPaths: false, officialWrites: false } };
    }
  };
}

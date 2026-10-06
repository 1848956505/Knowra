import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mcpError } from './mcp-error.mjs';

const TOKEN_PATTERN = /^knp1\.([0-9a-f-]{36})\.([0-9a-f]{64})$/;
const DAY_MS = 86_400_000;

export const tokenVerifier = token => createHash('sha256').update(token).digest('hex');
export const parseToken = token => {
  const match = typeof token === 'string' ? TOKEN_PATTERN.exec(token) : null;
  return match ? { pairingId: match[1] } : null;
};
const equalHex = (left, right) => typeof left === 'string' && typeof right === 'string' && left.length === right.length
  && timingSafeEqual(Buffer.from(left), Buffer.from(right));

function writeAtomic(file, content, mode = 0o600) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, content, { mode, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

/**
 * 外部 AI 客户端的配对记录。只保存令牌的哈希（verifier）；原始令牌只写进权限 0600 的配对文件。
 * 记录文件与配对文件都在数据目录的 mcp/ 下（目录 0700），不进入备份，也不参与同步。
 */
export function createPairingStore({ directory, now = () => new Date() } = {}) {
  if (!path.isAbsolute(directory ?? '')) throw new TypeError('配对目录必须是绝对路径。');
  const recordsFile = path.join(directory, 'pairings.json');
  const pairingFiles = path.join(directory, 'pairings');
  fs.mkdirSync(pairingFiles, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700); fs.chmodSync(pairingFiles, 0o700);

  const validRow = row => row && typeof row === 'object' && ['pairingId', 'verifier', 'policyId', 'spaceId'].every(key => typeof row[key] === 'string')
    && Number.isFinite(Date.parse(row.expiresAt)) && Number.isFinite(Date.parse(row.createdAt));
  /**
   * 区分“文件不存在”（首次使用，空列表）与“读取/校验失败”（记录损坏、权限异常、结构无效）。
   * 失败时整个配对能力停用并保留所有原文件：不清扫、不写入（写入会覆盖尚可人工修复的记录）；记录恢复后下次访问自动重新加载。
   */
  let rows = [];
  let loaded = false;
  function tryLoad() {
    try {
      const parsed = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
      if (!Array.isArray(parsed) || !parsed.every(validRow)) return false;
      rows = parsed;
    } catch (error) {
      if (error?.code !== 'ENOENT') return false;
      rows = [];
    }
    return true;
  }
  const ensure = () => {
    if (!loaded) {
      loaded = tryLoad();
      if (loaded) sweep();
    }
    if (!loaded) throw mcpError('MCP_STORE_UNAVAILABLE', '配对记录无法读取，外部客户端配对已暂停；原文件已保留，请修复或备份后重试。', { status: 503 });
  };
  const isExpired = row => Date.parse(row.expiresAt) <= now().getTime();
  /** 已撤销、已过期的配对不应留下原始令牌：删除其配对文件；也清理没有对应记录的孤儿文件。 */
  function sweep() {
    if (!loaded) return;
    const live = new Set(rows.filter(row => !row.revokedAt && !isExpired(row)).map(row => row.pairingId));
    let names = [];
    try { names = fs.readdirSync(pairingFiles); } catch { /* 目录刚创建 */ }
    for (const name of names) {
      const id = name.replace(/\.json$/, '');
      if (!live.has(id)) fs.rmSync(path.join(pairingFiles, name), { force: true });
    }
  }
  try { ensure(); } catch { /* 记录损坏：保持停用，不清扫 */ }
  const save = () => writeAtomic(recordsFile, JSON.stringify(rows));
  const fileFor = id => path.join(pairingFiles, `${id}.json`);
  const publicView = row => ({ pairingId: row.pairingId, label: row.label, spaceId: row.spaceId, scope: row.scope,
    excludedNoteIds: row.excludedNoteIds, createdAt: row.createdAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt,
    egressConfirmedAt: row.egressConfirmedAt, lastUsedAt: row.lastUsedAt, calls: row.calls,
    status: row.revokedAt ? 'revoked' : Date.parse(row.expiresAt) <= now().getTime() ? 'expired' : 'active',
    pairingFile: fileFor(row.pairingId) });

  return {
    pairingFile: fileFor,
    sweep: () => { ensure(); sweep(); },
    list: () => { ensure(); sweep(); return rows.map(publicView); },
    get: id => { ensure(); return rows.find(row => row.pairingId === id) ?? null; },
    create({ label, spaceId, scope, excludedNoteIds, policyId, policyRevision, expiresInDays, socketPath, dataDirectory }) {
      ensure();
      const pairingId = randomUUID();
      const token = `knp1.${pairingId}.${randomBytes(32).toString('hex')}`;
      const createdAt = now().toISOString();
      const row = { pairingId, label, spaceId, scope, excludedNoteIds, policyId, policyRevision,
        verifier: tokenVerifier(token), createdAt, expiresAt: new Date(now().getTime() + expiresInDays * DAY_MS).toISOString(),
        revokedAt: null, egressConfirmedAt: createdAt, lastUsedAt: null, calls: 0, dayKey: null, dayCalls: 0 };
      // 先写配对文件再写记录：中途失败只留下一个无记录、令牌永远不匹配的文件，随后清理。
      writeAtomic(fileFor(pairingId), JSON.stringify({ version: 1, pairingId, token, socketPath, dataDirectory }));
      rows = [...rows, row];
      try { save(); } catch (error) { rows = rows.filter(item => item !== row); fs.rmSync(fileFor(pairingId), { force: true }); throw error; }
      return publicView(row);
    },
    /** 令牌格式、记录存在与哈希匹配；撤销与过期由调用方区分错误码。 */
    authenticate(token) {
      ensure();
      const parsed = parseToken(token);
      const row = parsed && rows.find(item => item.pairingId === parsed.pairingId);
      if (!row || !equalHex(row.verifier, tokenVerifier(token))) throw mcpError('MCP_TOKEN_INVALID', '配对令牌无效。', { status: 401 });
      return row;
    },
    assertActive(row) {
      if (row.revokedAt) throw mcpError('MCP_PAIRING_REVOKED', '配对已撤销。', { status: 401 });
      if (isExpired(row)) { fs.rmSync(fileFor(row.pairingId), { force: true }); throw mcpError('MCP_PAIRING_EXPIRED', '配对已过期，请重新创建。', { status: 401 }); }
    },
    verifierOf: id => { ensure(); return rows.find(row => row.pairingId === id)?.verifier ?? null; },
    /** 计数与最近使用时间；每日计数以 UTC 日期换算。 */
    recordUse(row) {
      ensure();
      const day = now().toISOString().slice(0, 10);
      row.dayCalls = row.dayKey === day ? row.dayCalls + 1 : 1; row.dayKey = day;
      row.calls += 1; row.lastUsedAt = now().toISOString();
      save();
    },
    dayCalls(row) { return row.dayKey === now().toISOString().slice(0, 10) ? row.dayCalls : 0; },
    revoke(id) {
      ensure();
      const row = rows.find(item => item.pairingId === id);
      if (!row) throw mcpError('MCP_PAIRING_NOT_FOUND', '配对不存在。', { status: 404 });
      if (!row.revokedAt) { row.revokedAt = now().toISOString(); save(); }
      fs.rmSync(fileFor(id), { force: true });
      return publicView(row);
    }
  };
}

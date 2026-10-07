import fs from 'node:fs';
import path from 'node:path';

const FIELDS = ['event', 'pairingId', 'tool', 'status', 'code', 'fragments', 'bytes', 'manifest', 'retryAfterSeconds'];

/**
 * 外部调用审计：只收白名单字段（没有正文、标题、令牌、输入参数）。
 * 单文件超过 maxBytes 就轮转为 audit.1.jsonl（只保留一代），所以体量有上限。
 */
export function createAuditLog({ directory, now = () => new Date(), maxBytes = 1024 * 1024 } = {}) {
  const file = path.join(directory, 'audit.jsonl');
  const previous = path.join(directory, 'audit.1.jsonl');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const readLines = target => {
    try { return fs.readFileSync(target, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); }
    catch { return []; }
  };
  return {
    append(entry) {
      const clean = { at: now().toISOString(), ...Object.fromEntries(FIELDS.filter(key => entry[key] !== undefined).map(key => [key, entry[key]])) };
      try {
        if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) fs.renameSync(file, previous);
        fs.appendFileSync(file, `${JSON.stringify(clean)}\n`, { mode: 0o600 });
      } catch { /* 审计写入失败不能让调用方泄露内容，也不阻断已完成的只读调用。 */ }
    },
    recent({ pairingId, limit = 50 } = {}) {
      const rows = [...readLines(previous), ...readLines(file)].filter(row => !pairingId || row.pairingId === pairingId);
      return rows.slice(-Math.min(Math.max(limit, 1), 200)).reverse();
    }
  };
}

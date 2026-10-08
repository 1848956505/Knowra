/** 已确认的 outbox 行只在最近 N 条内保留 before/value 全文，更早的压缩为元数据。 */
export const OUTBOX_FULL_RETENTION = 50;

const compactChange = change => ({
  collection: change.collection, entityId: change.entityId, action: change.action,
  localRevision: change.localRevision, baseRevision: change.baseRevision, compacted: true
});

/**
 * 只改写 state='acknowledged' 且超出保留数的行的 changes 列；行本身、sequence、operation_id、
 * state、dependencies 不变，未确认行完全不碰。边界账本只引用未确认行，故压缩不影响恢复路径。
 * 调用方应已处于事务内（确认状态与压缩同事务提交）。
 */
export function compactAcknowledgedOutbox(db, { keep = OUTBOX_FULL_RETENTION } = {}) {
  if (!Number.isSafeInteger(keep) || keep < 0) throw new TypeError('keep 必须是非负安全整数');
  const cutoff = db.prepare("SELECT sequence FROM sync_outbox WHERE state = 'acknowledged' ORDER BY sequence DESC LIMIT 1 OFFSET ?").get(keep)?.sequence;
  if (cutoff === undefined) return 0;
  const rows = db.prepare("SELECT sequence, changes FROM sync_outbox WHERE state = 'acknowledged' AND sequence <= ?").iterate(cutoff);
  const update = db.prepare("UPDATE sync_outbox SET changes = ? WHERE sequence = ? AND state = 'acknowledged'");
  let count = 0;
  for (const row of rows) {
    let changes;
    try { changes = JSON.parse(row.changes); } catch { continue; }
    if (!Array.isArray(changes) || changes.some(change => !change || typeof change !== 'object' || Array.isArray(change))) continue;
    if (changes.every(change => change.compacted === true && !Object.hasOwn(change, 'before') && !Object.hasOwn(change, 'value'))) continue;
    update.run(JSON.stringify(changes.map(compactChange)), row.sequence);
    count += 1;
  }
  return count;
}

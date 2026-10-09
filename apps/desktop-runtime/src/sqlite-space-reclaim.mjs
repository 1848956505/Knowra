import fs from 'node:fs';

export const RECLAIM_MIN_FREE_BYTES = 128 * 1024 * 1024;
export const RECLAIM_MIN_FREE_RATIO = 0.3;
const DISK_MARGIN_BYTES = 64 * 1024 * 1024;

/**
 * SQLite 删除行后只把页放入空闲链表，文件不会变小；历史清理和已确认队列压缩会留下大量空闲页。
 * 空闲页占比和体积都超过阈值、且磁盘余量足够重写整个文件时才整理；任何失败都保持原库不变并返回原因。
 * 必须在没有未结束事务时调用（VACUUM 不能嵌入事务）。
 */
export function reclaimFreeSpace(db, filePath, { minFreeBytes = RECLAIM_MIN_FREE_BYTES, minFreeRatio = RECLAIM_MIN_FREE_RATIO,
  availableBytes = () => { const stats = fs.statfsSync(filePath); return stats.bavail * stats.bsize; } } = {}) {
  let freeBytes, fileBytes;
  try {
    if (db.isTransaction) return { reclaimed: false, reason: 'in-transaction' };
    const pageSize = db.prepare('PRAGMA page_size').get().page_size;
    const pageCount = db.prepare('PRAGMA page_count').get().page_count;
    freeBytes = db.prepare('PRAGMA freelist_count').get().freelist_count * pageSize;
    fileBytes = pageCount * pageSize;
    if (freeBytes < minFreeBytes || freeBytes < fileBytes * minFreeRatio) return { reclaimed: false, reason: 'below-threshold', freeBytes, fileBytes };
    // 空间查询、整理及结果查询都属于可选维护，失败不能阻止资料库启动。
    if (availableBytes() < fileBytes + DISK_MARGIN_BYTES) return { reclaimed: false, reason: 'low-disk-space', freeBytes, fileBytes };
    db.exec('VACUUM');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { reclaimed: true, freeBytes, fileBytes, afterBytes: db.prepare('PRAGMA page_count').get().page_count * pageSize };
  } catch (error) { return { reclaimed: false, reason: 'failed', error, freeBytes, fileBytes }; }
}

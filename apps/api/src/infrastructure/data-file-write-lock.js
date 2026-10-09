import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../errors/app-error.js';

const busy = () => createAppError('STORAGE_MAINTENANCE_BUSY', '资料库正在备份或清理，请稍后重试；当前修改尚未覆盖原文件。', 503);
const lockPath = file => `${file}.write-lock`;

/** 同步 JSON 写入和离线维护共用互斥锁；崩溃后的锁仅在原进程确定不存在时回收。 */
export function acquireDataFileWriteLock(file) {
  const target = lockPath(file);
  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;
    try { descriptor = fs.openSync(target, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let reclaim;
      try {
        // 两个进程不能同时判死并回收同一个旧锁，否则可能误删对方新取得的锁。
        reclaim = fs.openSync(`${target}.reclaim`, 'wx', 0o600);
        const record = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (!Number.isSafeInteger(record.pid) || record.pid < 1) throw busy();
        try { process.kill(record.pid, 0); throw busy(); }
        catch (failure) {
          if (failure.code !== 'ESRCH') throw busy();
          fs.unlinkSync(target);
        }
      } catch { throw busy(); }
      finally { if (reclaim !== undefined) { fs.closeSync(reclaim); fs.unlinkSync(`${target}.reclaim`); } }
      continue;
    }
    const token = randomUUID();
    try { fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid })); }
    catch (error) { fs.closeSync(descriptor); fs.unlinkSync(target); throw error; }
    fs.closeSync(descriptor);
    return { token, release() {
      if (JSON.parse(fs.readFileSync(target, 'utf8')).token !== token) throw busy();
      fs.unlinkSync(target);
    } };
  }
  throw busy();
}

export function withDataFileWriteLock(file, token, operation) {
  if (token) {
    const current = JSON.parse(fs.readFileSync(lockPath(file), 'utf8'));
    if (current.token !== token || current.pid !== process.pid) throw busy();
    return operation();
  }
  const lock = acquireDataFileWriteLock(file);
  try { return operation(); } finally { lock.release(); }
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function defaultDataDirectory({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Knowra', 'offline');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Knowra', 'offline');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'knowra', 'offline');
}

/** 单个数据目录只允许一个运行服务；多窗口共享该服务。异常退出后按 PID 检查恢复。 */
export function lockDataDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const startupGate = path.join(directory, 'startup.lock');
  try { fs.mkdirSync(startupGate, { mode: 0o700 }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('本地资料库正在启动或上次启动中断，请检查 startup.lock，禁止并发恢复实例锁。');
  }
  try { return acquireRuntimeLock(directory); }
  finally { fs.rmdirSync(startupGate); }
}

function acquireRuntimeLock(directory) {
  const lockPath = path.join(directory, 'runtime.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      return () => {
        try {
          if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).token === token) fs.unlinkSync(lockPath);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {
        throw new Error('本地数据目录锁无法验证，请保留数据并检查 runtime.lock。');
      }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('本地数据目录锁无效，已停止启动。');
      try { process.kill(owner.pid, 0); } catch (probeError) {
        if (probeError.code === 'ESRCH') {
          // 对比原记录，避免删除已被其他启动进程替换的锁。
          if (fs.readFileSync(lockPath, 'utf8') === JSON.stringify(owner)) fs.unlinkSync(lockPath);
          continue;
        }
      }
      throw new Error('此本地数据目录已被使用，请使用已打开的实例。');
    }
  }
  throw new Error('无法取得本地数据目录锁，请重试。');
}

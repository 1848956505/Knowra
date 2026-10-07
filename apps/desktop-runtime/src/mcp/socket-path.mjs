import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_SOCKET_PATH = 100; // macOS 的 sun_path 上限是 104 字节。

/** 数据目录下的 mcp/runtime.sock；路径过长时退到按数据目录哈希确定的 0700 短目录，路径稳定，重启后配对文件仍然有效。 */
export function resolveSocketPath(dataDirectory) {
  const preferred = path.join(dataDirectory, 'mcp', 'runtime.sock');
  if (Buffer.byteLength(preferred) <= MAX_SOCKET_PATH) return preferred;
  const uid = process.getuid?.() ?? 0;
  const digest = createHash('sha256').update(dataDirectory).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `knowra-${uid}-${digest}`, 'm.sock');
}

/** 目录必须归当前用户且不对他人开放；否则宁可不启动 MCP 入口。 */
export function prepareSocketDirectory(socketPath) {
  const directory = path.dirname(socketPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || process.getuid && info.uid !== process.getuid()) {
    throw new Error('MCP 入口目录不属于当前用户，已拒绝启动。');
  }
  fs.chmodSync(directory, 0o700);
  return directory;
}

/** 已持有数据目录锁，同目录里遗留的 socket 一定是上次崩溃残留；非 socket 文件不动并报错。 */
export function removeStaleSocket(socketPath) {
  let info;
  try { info = fs.lstatSync(socketPath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!info.isSocket()) throw new Error('MCP 入口路径被非 socket 文件占用，已拒绝启动。');
  fs.unlinkSync(socketPath);
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isDirectExecution(moduleUrl) {
  const entry = process.argv[1];
  // stdin/eval 可带任意 argv，包括真实模块路径；导入 helper 不应执行 CLI。
  if (!entry || entry === '-' || process.execArgv.some(argument => /^(?:-[ep]|--(?:eval|print)(?:=|$))/.test(argument))) return false;
  let entryPath;
  try {
    if (!fs.statSync(entry).isFile()) return false;
    entryPath = fs.realpathSync(entry);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
  // 文件 CLI 仍按真实文件身份比较，支持 /var 别名及目录/文件符号链接。
  return entryPath === fs.realpathSync(fileURLToPath(moduleUrl));
}

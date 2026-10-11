import fs from 'node:fs';
import path from 'node:path';

/** 影子比对日志：每行一条 JSON，超过上限时轮换为 `.1`。只含 ID 与结论，不含正文。 */
export function createJsonlShadowSink(filePath, { maxBytes = 5 * 1024 * 1024 } = {}) {
  return (entry) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > maxBytes) fs.renameSync(filePath, `${filePath}.1`);
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
    } catch { /* 诊断日志写入失败不影响保存 */ }
  };
}

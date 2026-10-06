import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../../errors/app-error.js';

const DEFAULTS = Object.freeze({ knowledgeProposals: false });
const KEYS = Object.keys(DEFAULTS);

/**
 * AI 功能开关：服务端（或桌面运行端）全局一份，与知识空间无关，与带 API Key 的模型设置分开保存。
 * 默认全部关闭；文件缺失、损坏或字段类型不对一律按关闭处理（fail closed），不会因此开启任何功能。
 * 开关只决定模型“能不能”使用某项能力，不替代读取范围与外发授权。
 */
export function createAiFeatureSettings({ filePath }) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('AI 功能开关需要存储路径。');
  let writing = Promise.resolve();

  function normalize(value) {
    const result = { ...DEFAULTS };
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of KEYS) if (typeof value[key] === 'boolean') result[key] = value[key];
    }
    return result;
  }

  async function get() {
    try { return normalize(JSON.parse(await fs.readFile(filePath, 'utf8'))); }
    catch { return { ...DEFAULTS }; }
  }

  async function set(input) {
    const unknown = input && typeof input === 'object' && !Array.isArray(input) ? Object.keys(input).filter(key => !KEYS.includes(key)) : ['?'];
    if (unknown.length || !KEYS.some(key => typeof input[key] === 'boolean') || KEYS.some(key => key in input && typeof input[key] !== 'boolean')) {
      throw createAppError('AI_FEATURES_INVALID', 'AI 功能开关格式无效。', 422);
    }
    const run = writing.then(async () => {
      const next = { ...(await get()), ...Object.fromEntries(KEYS.filter(key => key in input).map(key => [key, input[key]])) };
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temp = path.join(path.dirname(filePath), `.ai-features-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, filePath);
      } finally { await fs.rm(temp, { force: true }); }
      return next;
    });
    writing = run.catch(() => undefined);
    return run;
  }

  return { get, set };
}

#!/usr/bin/env node
// 给已有的本机运行结果补一步关系提议，不重跑挂靠：概念和条目保持不变，便于对比加关系前后的网络图。
// 只把概念名、说明和条目（标题、陈述）发给 DeepSeek，不发送笔记原文；不写知境数据库。报告不要提交。
//
// 用法（仓库根目录）：
//   node scripts/experiments/concept-linking-r2/run-relations.mjs --result 输出目录/result.json --out 新输出目录 [--key-env 变量名]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveApiKey } from '../knowledge-extraction-ab/run.mjs';
import { relationsReport, runRelations } from './relations.mjs';

export const RELATION_MAX_TOKENS = 6144;

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw Error(`${flag} 缺少参数`); return argv[++i]; };
    if (flag === '--result') args.result = next();
    else if (flag === '--out') args.out = next();
    else if (flag === '--key-env') args.keyEnv = next();
    else throw Error(`未知参数 ${flag}`);
  }
  if (!args.result || !args.out) throw Error('需要 --result 与 --out');
  return args;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  const key = resolveApiKey(env, args.keyEnv);
  if (!key.value) throw Error('没有找到 DeepSeek API key 环境变量，可用 --key-env 指定变量名');
  const result = JSON.parse(await readFile(args.result, 'utf8'));
  if (!Array.isArray(result?.state?.concepts) || !Array.isArray(result?.state?.items)) throw Error('--result 不是 run-local 的 result.json');
  log(`关系提议：${result.state.concepts.length} 个概念…`);
  const relations = await runRelations(result.state, { fetchImpl, apiKey: key.value, maxTokens: RELATION_MAX_TOKENS });
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify({ ...result, relations: { proposals: relations.proposals, errors: relations.errors } }, null, 2));
  await writeFile(path.join(args.out, 'relations.md'), `# 关系提议报告（仅本机，勿提交）\n\n来源：${path.basename(path.dirname(path.resolve(args.result)))}/result.json\n\n${relationsReport(result.state, relations)}`);
  log(`通过 ${relations.proposals.filter(entry => entry.accepted).length} 条；报告：${path.join(args.out, 'relations.md')}`);
  return relations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(`失败：${error.message}`); process.exitCode = 1; });
}

#!/usr/bin/env node
// 对已有的本机运行结果只重跑整理建议，不重跑挂靠：概念和条目保持不变，便于在同一份输入上反复检验拆分等建议。
// 只把概念名、说明和条目（标题、陈述）发给 DeepSeek，不发送笔记原文；不写知境数据库。报告不要提交。
//
// 用法（仓库根目录）：
//   node scripts/experiments/concept-linking-r2/run-review.mjs --result 输出目录/result.json --out 新输出目录 [--repeats 1-3] [--key-env 变量名]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveApiKey } from '../knowledge-extraction-ab/run.mjs';
import { describeSplit } from './core.mjs';
import { runReview } from './run.mjs';

export const REVIEW_MAX_TOKENS = 4096;
const ACTION = { keep: '保留', demote: '降级到', merge: '合并到', rename: '改名为', split: '拆出' };
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function parseArgs(argv) {
  const args = { repeats: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw Error(`${flag} 缺少参数`); return argv[++i]; };
    if (flag === '--result') args.result = next();
    else if (flag === '--out') args.out = next();
    else if (flag === '--key-env') args.keyEnv = next();
    else if (flag === '--repeats') {
      args.repeats = Number(next());
      if (!Number.isSafeInteger(args.repeats) || args.repeats < 1 || args.repeats > 3) throw Error('--repeats 只能是 1 至 3');
    } else throw Error(`未知参数 ${flag}`);
  }
  if (!args.result || !args.out) throw Error('需要 --result 与 --out');
  return args;
}

/** 每个新概念一行，每次重复一列，方便看建议是否稳定。条目多的概念排在前面。 */
export function renderReviewReport(state, reviews, source) {
  const created = state.concepts.filter(concept => concept.origin === 'created');
  const count = id => state.items.filter(item => item.conceptId === id).length;
  const describe = entry => !entry ? '—'
    : `${ACTION[entry.action]}${entry.targetName ? ` ${entry.targetName}` : ''}${entry.newName ? ` ${entry.newName}` : ''}${entry.splitParts ? ` ${describeSplit(entry.splitParts, entry.splitDropped)}` : ''}`;
  const lines = [
    '# 整理建议重跑报告（仅本机，勿提交）', '',
    `> 来源：${source}。挂靠结果原样保留，只重新请求整理建议 ${reviews.length} 次。`, '',
    `| 概念 | 条目数 | ${reviews.map((_, i) => `第 ${i + 1} 次`).join(' | ')} |`, `| --- | --- | ${reviews.map(() => '---').join(' | ')} |`
  ];
  for (const concept of [...created].sort((a, b) => count(b.id) - count(a.id))) {
    const cells = reviews.map(review => cell(describe(review.graded.find(entry => entry.conceptId === concept.id))));
    lines.push(`| ${cell(concept.name)} | ${count(concept.id)} | ${cells.join(' | ')} |`);
  }
  const errors = reviews.flatMap((review, i) => review.errors.map(error => `- 第 ${i + 1} 次：${error}`));
  if (errors.length) lines.push('', '## 失败与被拒', '', ...errors);
  lines.push('', '## 理由（第 1 次）', '', ...reviews[0].graded.map(entry => `- ${entry.name}：${entry.reason}`));
  return `${lines.join('\n')}\n`;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  const key = resolveApiKey(env, args.keyEnv);
  if (!key.value) throw Error('没有找到 DeepSeek API key 环境变量，可用 --key-env 指定变量名');
  const result = JSON.parse(await readFile(args.result, 'utf8'));
  if (!Array.isArray(result?.state?.concepts) || !Array.isArray(result?.state?.items)) throw Error('--result 不是 run-local 的 result.json');
  const reviews = [];
  for (let i = 0; i < args.repeats; i += 1) {
    log(`整理建议第 ${i + 1} 次…`);
    reviews.push(await runReview(result.state, { fetchImpl, apiKey: key.value, maxTokens: REVIEW_MAX_TOKENS }));
  }
  await mkdir(args.out, { recursive: true });
  // 图谱页面读取的是 review.suggestions，这里写入第 1 次的结果；其余几次只出现在报告里。
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify({ ...result, review: { suggestions: reviews[0].suggestions, errors: reviews[0].errors } }, null, 2));
  const source = `${path.basename(path.dirname(path.resolve(args.result)))}/result.json`;
  await writeFile(path.join(args.out, 'review.md'), renderReviewReport(result.state, reviews, source));
  log(`报告：${path.join(args.out, 'review.md')}`);
  return reviews;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(`失败：${error.message}`); process.exitCode = 1; });
}

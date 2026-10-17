#!/usr/bin/env node
// 在用户本机用真实笔记运行 Concept 融合：从空知识库开始逐节处理，候选概念由简单检索给出。
// 只读笔记文件、只调用 DeepSeek；不写知境数据库。不得在 GitHub Actions 或公开仓库中使用，报告不要提交。
//
// 用法（仓库根目录）：
//   node scripts/experiments/concept-linking-r2/run-local.mjs --notes 笔记.md --out 输出目录 [--key-env 变量名]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitBySection } from '../knowledge-extraction-ab/lib.mjs';
import { resolveApiKey } from '../knowledge-extraction-ab/run.mjs';
import { applyResponse, candidatesFor, createState, describeSplit, modelRequest } from './core.mjs';
import { invokeWithRetry, runReview } from './run.mjs';
import { relationsReport, runRelations } from './relations.mjs';
import { RELATION_MAX_TOKENS } from './run-relations.mjs';

const KIND = { definition: '定义', fact: '性质/事实', procedure: '方法/步骤', application: '用法' };
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const normalize = text => String(text).toLowerCase().replace(/[\s\-—_·・（）()【】\[\]“”"'：:，,。.、]/gu, '');

export function parseArgs(argv) {
  const args = { maxTokens: 4096 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw Error(`${flag} 缺少参数`); return argv[++i]; };
    if (flag === '--notes') args.notes = next();
    else if (flag === '--out') args.out = next();
    else if (flag === '--key-env') args.keyEnv = next();
    else throw Error(`未知参数 ${flag}`);
  }
  if (!args.notes || !args.out) throw Error('需要 --notes 与 --out');
  return args;
}

export function renderLocalReport(state, results, review = null, relations = null) {
  const conceptName = id => state.concepts.find(concept => concept.id === id)?.name ?? id;
  const accepted = results.flatMap(result => result.response?.accepted ? result.response.links.filter(link => link.accepted) : []);
  const rejected = results.flatMap(result => result.response?.accepted ? result.response.links.filter(link => !link.accepted) : []);
  const created = state.concepts.filter(concept => concept.origin === 'created');
  const byName = new Map();
  for (const concept of created) byName.set(normalize(concept.name), [...(byName.get(normalize(concept.name)) ?? []), concept]);
  const sameName = [...byName.values()].filter(group => group.length > 1);
  const lines = [
    '# 真实笔记 Concept 融合报告（仅本机，勿提交）', '',
    '> 从空知识库开始，按“章.节”逐篇处理；每篇的候选概念由简单字符检索从已建概念中选出前 8 个。规则只能发现明显问题，请逐条人工核对。', '',
    '## 汇总', '',
    `- 笔记 ${results.length} 篇，调用失败 ${results.filter(result => result.error).length} 篇`,
    `- 知识条目 ${accepted.length} 条，其中复用已有条目 ${accepted.filter(link => link.itemAction === 'reuse').length} 条；被校验拒绝 ${rejected.length} 条`,
    `- 新建概念 ${created.length} 个；挂到已有概念 ${accepted.filter(link => link.conceptAction === 'reuse').length} 次`,
    `- 模型标注疑似重复 ${accepted.filter(link => link.possibleDuplicateOf).length} 次；同名的新建概念 ${sameName.length} 组`,
    `- 概念说明疑似写进了知识内容 ${accepted.filter(link => link.senseAbsorbs).length} 个`, ''
  ];
  if (sameName.length) lines.push('**同名概念：** ' + sameName.map(group => group.map(concept => `${concept.name}（${concept.id}）`).join(' / ')).join('；'), '');
  lines.push('## 概念一览', '', '| 概念 | 说明 | 条目数 | 来源笔记 |', '| --- | --- | --- | --- |');
  for (const concept of created) {
    const items = state.items.filter(item => item.conceptId === concept.id);
    const notes = [...new Set(items.flatMap(item => item.sources.map(source => source.noteId)))];
    lines.push(`| ${cell(concept.name)} | ${cell(concept.sense)} | ${items.length} | ${notes.join('、')} |`);
  }
  if (review) {
    const ACTION = { keep: '保留', demote: '降级到', merge: '合并到', rename: '改名为', split: '拆出' };
    lines.push('', '## 整理建议（按三条标准，只供你决定，未自动执行）', '');
    for (const error of review.errors) lines.push(`- 失败：${error}`);
    lines.push('| 新概念 | 条目数 | 建议 | 理由 |', '| --- | --- | --- | --- |');
    for (const entry of review.graded) {
      const count = state.items.filter(item => item.conceptId === entry.conceptId).length;
      lines.push(`| ${cell(entry.name)} | ${count} | ${ACTION[entry.action]}${entry.targetName ? ` ${cell(entry.targetName)}` : ''}${entry.newName ? ` ${cell(entry.newName)}` : ''}${entry.splitParts ? ` ${cell(describeSplit(entry.splitParts, entry.splitDropped))}` : ''} | ${cell(entry.reason)} |`);
    }
  }
  if (relations) lines.push('', relationsReport(state, relations));
  lines.push('', '## 逐篇明细', '');
  for (const result of results) {
    lines.push(`### ${result.noteId}`, '');
    lines.push(`候选概念：${result.candidates.length ? result.candidates.map(concept => concept.name).join('、') : '（知识库为空）'}`, '');
    if (result.error) { lines.push(`调用失败：${result.error}`, ''); continue; }
    lines.push('| 条目 | 类型 | 概念 | 条目动作 | 标记 | 原文 |', '| --- | --- | --- | --- | --- | --- |');
    for (const link of result.response.links) {
      if (!link.accepted) { lines.push(`| （被拒） | | | | ${cell(link.errors.join('；'))} | ${cell(link.quote)} |`); continue; }
      const marks = [
        link.possibleDuplicateOf ? `疑似与「${conceptName(link.possibleDuplicateOf)}」重复` : '',
        link.senseAbsorbs ? `说明含内容：${link.sense}` : ''
      ].filter(Boolean).join('；') || '—';
      lines.push(`| ${cell(link.title)} | ${KIND[link.kind] ?? link.kind} | ${cell(link.conceptName)}（${link.conceptAction === 'reuse' ? '已有' : '新建'}） | ${link.itemAction === 'reuse' ? `复用 ${link.itemId}` : '新建'} | ${cell(marks)} | ${cell(link.quote)} |`);
    }
    if (result.response.remarks) lines.push('', `模型自述：${result.response.remarks}`);
    lines.push('');
  }
  lines.push('## 人工核对时重点看', '',
    '1. 有没有挂错概念，尤其是名字相近、含义不同的（例如数学的梯度和 x.grad）；',
    '2. 同一个东西有没有被建成两个概念；',
    '3. 笔记里写错的地方，陈述有没有被模型悄悄改对；',
    '4. API 用法和概念本身的知识，是否被合理地放在一起或分开；',
    '5. 复用的条目，是否真的是同一条陈述。');
  return `${lines.join('\n')}\n`;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  const key = resolveApiKey(env, args.keyEnv);
  if (!key.value) throw Error('没有找到 DeepSeek API key 环境变量，可用 --key-env 指定变量名');
  const base = path.basename(args.notes).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}]+/gu, '') || 'note';
  const notes = splitBySection(await readFile(args.notes, 'utf8'), base).map((note, index) => ({ id: `L${String(index + 1).padStart(2, '0')}`, source: note.name, markdown: note.markdown }));
  const state = createState({ empty: true });
  const results = [];
  for (const note of notes) {
    const candidates = candidatesFor(state, note).concepts;
    try {
      const { parsed, usage } = await invokeWithRetry(fetchImpl, key.value, modelRequest(state, note), args.maxTokens);
      const response = applyResponse(state, note, parsed);
      results.push({ noteId: `${note.id} ${note.source}`, candidates, response, usage, error: response.accepted ? null : response.error });
    } catch {
      results.push({ noteId: `${note.id} ${note.source}`, candidates, error: '模型调用或 JSON 解析失败（详情隐藏）' });
    }
    const last = results.at(-1);
    log(`${last.noteId}：${last.error ?? `${last.response.links.filter(link => link.accepted).length} 条`}`);
  }
  log('整理建议…');
  const review = await runReview(state, { fetchImpl, apiKey: key.value, maxTokens: args.maxTokens });
  log('关系提议…');
  const relations = await runRelations(state, { fetchImpl, apiKey: key.value, maxTokens: RELATION_MAX_TOKENS });
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'report.md'), renderLocalReport(state, results, review, relations));
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify({ state, results, review: { suggestions: review.suggestions, errors: review.errors }, relations: { proposals: relations.proposals, errors: relations.errors } }, null, 2));
  log(`报告：${path.join(args.out, 'report.md')}`);
  return { state, results, review, relations };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(`失败：${error.message}`); process.exitCode = 1; });
}

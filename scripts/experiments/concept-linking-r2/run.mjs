#!/usr/bin/env node
// 第二轮 Concept 融合实验：固定公开合成笔记，重复运行；不读取真实笔记，不写正式知识库。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTES, REPEATS } from './scenario.mjs';
import { SYSTEM_PROMPT, applyResponse, createState, gradeRun, markdownReport, modelRequest } from './core.mjs';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

export function parseArgs(argv) {
  const args = { out: 'storage/experiments/concept-linking-r2', dryRun: false, maxTokens: 2048, repeats: REPEATS };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--out') { if (i + 1 >= argv.length) throw Error('--out 缺少路径'); args.out = argv[++i]; }
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--repeats') {
      const value = Number(argv[++i]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 3) throw Error('--repeats 只能是 1 至 3');
      args.repeats = value;
    } else throw Error(`不支持的参数（样本必须固定）：${flag}`);
  }
  return args;
}

export async function invokeDeepSeek(fetchImpl, apiKey, payload, maxTokens) {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat', temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(payload) }]
    })
  });
  // 不记录供应商响应正文，避免任何意外内容进入公开日志。
  if (!response.ok) throw Error(`DeepSeek HTTP ${response.status}`);
  const body = await response.json();
  const choice = body?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw Error('DeepSeek 响应未完整结束');
  return { parsed: JSON.parse(choice.message.content), usage: body.usage };
}

export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  if (!args.dryRun && !env.DEEPSEEK_API_KEY) throw Error('缺少 DEEPSEEK_API_KEY 环境变量');
  const runs = [];
  for (let repeat = 0; repeat < args.repeats; repeat += 1) {
    const state = createState();
    const results = [];
    for (const note of NOTES) {
      const request = modelRequest(state, note);
      if (args.dryRun) { results.push({ noteId: note.id, request, error: 'dry-run' }); continue; }
      try {
        const { parsed, usage } = await invokeDeepSeek(fetchImpl, env.DEEPSEEK_API_KEY, request, args.maxTokens);
        const response = applyResponse(state, note, parsed);
        results.push({ noteId: note.id, raw: parsed, response, usage, error: response.accepted ? null : response.error });
      } catch {
        results.push({ noteId: note.id, error: '模型调用或 JSON 解析失败（详情隐藏）' });
      }
    }
    const grade = gradeRun(results);
    runs.push({ results, grade, created: state.concepts.filter(concept => concept.origin === 'created') });
    log(`第 ${repeat + 1} 次：正确 ${grade.correct}/${grade.expectedTotal}，污染 ${grade.contamination}，挂错 ${grade.wrong}，重复新建 ${grade.duplicate}，缺失 ${grade.missing}`);
  }
  const report = markdownReport(runs, { model: 'deepseek-chat', temperature: 0 });
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'report.md'), report);
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify({ mode: args.dryRun ? 'dry-run' : 'synthetic-real-model', model: 'deepseek-chat', temperature: 0, runs }, null, 2));
  return { runs, report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`实验无法启动：${error.message.startsWith('缺少') || error.message.startsWith('--') || error.message.startsWith('不支持') ? error.message : '参数或环境错误'}`);
    process.exitCode = 1;
  });
}

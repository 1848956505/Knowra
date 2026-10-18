#!/usr/bin/env node
// 独立的概念身份实验：使用公开合成内容和 GitHub Secret；不读取真实资料，不写正式知识库。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_CONCEPTS, SYNTHETIC_NOTES } from './scenario.mjs';
import { SYSTEM_PROMPT, createState, modelRequest, applyProposal, evaluate, markdownReport } from './core.mjs';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

export function parseArgs(argv) {
  const args = { out: 'storage/experiments/concept-linking', dryRun: false, maxTokens: 1536 };
  for (let i = 0; i < argv.length; i++) {
    const opt = argv[i];
    if (opt === '--out') {
      if (i + 1 >= argv.length) throw Error('--out 缺少路径');
      args.out = argv[++i];
    } else if (opt === '--max-tokens') {
      const raw = argv[++i];
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 256 || value > 2048) {
        throw Error('--max-tokens 必须为 256 至 2048 的整数');
      }
      args.maxTokens = value;
    } else if (opt === '--dry-run') args.dryRun = true;
    else throw Error('不支持额外参数（研究样本必须固定）: ' + opt);
  }
  return args;
}

function stripProviderError(status) {
  return 'DeepSeek HTTP ' + status + '（供应商响应正文已省略）';
}

export async function invokeDeepSeek(fetchImpl, apiKey, payload, maxTokens) {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'deepseek-chat', temperature: 0, max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  });
  // 不记录服务商响应的正文，避免密钥或用户不可控字段通过报错进入 Actions 日志。
  if (!response.ok) throw Error(stripProviderError(response.status));
  const body = await response.json();
  const choice = body?.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw Error('DeepSeek 响应未完整结束');
  if (typeof choice.message?.content !== 'string') throw Error('DeepSeek 返回空响应');
  return { proposal: JSON.parse(choice.message.content), usage: body.usage };
}

/** 可注入假的 fetch 进行无费用的端到端测试；真实执行固定为公开合成数据。 */
export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const args = parseArgs(argv);
  if (!args.dryRun && !env.DEEPSEEK_API_KEY) throw Error('缺少 DEEPSEEK_API_KEY 环境变量');
  const state = createState();
  const events = [];
  const runs = [];
  for (const note of SYNTHETIC_NOTES) {
    const payload = modelRequest(state, note);
    if (args.dryRun) {
      runs.push({ noteId: note.id, modelOk: false, skipped: true, request: payload });
      events.push({ noteId: note.id, accepted: false, errors: ['dry-run 未发起模型调用'] });
      continue;
    }
    try {
      const { proposal, usage } = await invokeDeepSeek(fetchImpl, env.DEEPSEEK_API_KEY, payload, args.maxTokens);
      const event = applyProposal(state, note, proposal);
      events.push(event);
      runs.push({ noteId: note.id, modelOk: true, proposal, event, usage });
      log(note.id + '：' + (event.accepted
        ? event.conceptName + ' / ' + event.conceptAction + ' / ' + event.itemAction
        : '格式校验拒绝'));
    } catch (error) {
      const reason = '模型调用或 JSON 解析失败（详情隐藏）';
      events.push({ noteId: note.id, accepted: false, errors: [reason] });
      runs.push({ noteId: note.id, modelOk: false, errorCategory: reason });
      log(note.id + '：模型调用失败，未写入模拟图谱');
    }
  }
  const evaluation = evaluate(events, state);
  const report = markdownReport(evaluation, runs);
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'report.md'), report);
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify({
    mode: args.dryRun ? 'dry-run' : 'synthetic-real-model',
    model: 'deepseek-chat', temperature: 0, maxTokens: args.maxTokens,
    source: 'repository-public-synthetic-notes',
    initialConcepts: INITIAL_CONCEPTS, runs, evaluation
  }, null, 2));
  log('候选图：' + evaluation.graph.concepts.length + ' 个 Concept，'
    + evaluation.graph.items.length + ' 条 KnowledgeItem');
  log('Concept 身份正确：' + evaluation.conceptPass + '/' + evaluation.total
    + '；知识条目动作正确：' + evaluation.itemPass + '/' + evaluation.total);
  return { runs, events, evaluation, report, state };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => {
    // 绝不打印环境变量的原文；启动异常仅打印固化类别。
    console.error('Concept 实验无法启动：' + (error.message.startsWith('缺少') ? error.message : '参数或环境错误'));
    process.exitCode = 1;
  });
}

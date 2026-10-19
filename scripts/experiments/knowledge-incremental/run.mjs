#!/usr/bin/env node
// 默认只导出固定合成请求；付费调用必须经独立授权后显式启用。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderInvoker, readBudgetUsage } from './provider.mjs';
import { CASES, confirmedSnapshot } from './cases.mjs';
import { diagnosePair, evaluate, fingerprint, preparePair, stageResponse, SYSTEM_PROMPT } from './core.mjs';

export const MAX_CALLS = 20;
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

async function createOnce(file, value) {
  try { await writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx' }); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}

export function renderReport(result) {
  const rows = result.rows;
  return [
    '# 增量知识归属成对对照', '',
    `- 执行类型：${result.mode}；offline-plan 未调用模型，fixture-contract 仅测试协议，不代表真实模型效果。`,
    '- 输入及预期均由 agent 编写的公开合成材料；未经用户真实笔记验收。',
    '- 原版 R2 挂靠提示词逐字复用，不调用整理建议，不自动修改已确认快照。',
    '- 原版协议没有原生待定动作；本轮不能宣称四类行为全部通过。',
    '- hypotheticalDiff 仅为研究模拟，不是已批准写入；committedDiff 应始终为空。',
    ...(result.providerBudget ? [`- 整晚共享预算：上限 ${result.providerBudget.limit} 次；已预留 ${result.providerBudget.reservedCalls} 次（含失败/中断）。`] : []),
    `- 运行条目 ${rows.length}；取得输出 ${rows.filter(x => x.staged).length}；未取得输出 ${rows.filter(x => !x.staged).length}。`,
    '', '| 样本 | 现有检索候选数 | Oracle 候选数 | 初步归因 |', '| --- | --- | --- | --- |',
    ...CASES.map(sample => {
      const pair = rows.filter(row => row.caseId === sample.id);
      const count = arm => pair.find(x => x.arm === arm)?.request.candidateConcepts.length ?? '—';
      return `| ${sample.id} | ${count('retrieval')} | ${count('oracle')} | ${diagnosePair(pair)} |`;
    }), '',
    '## 解释边界', '',
    'Oracle 是人工标注目标的理想召回干预，不是改进后的检索算法。候选数和排序可能变化，单对差异不能证明唯一因果。',
    'routingPass 检查归属/动作，evidenceCoveragePass 检查完整合成句引用；contractPass 仅为规则通过，所有正文仍需人工语义复核。单样本多输出不重复累计。',
    '中断后已经预留的请求不重发；同一预算目录可续跑。不得换目录、删预留或并行另开预算规避授权上限。',
    '完整候选、原始输出、拒绝原因、语义预期及状态差异见 result.json。', ''
  ].join('\n');
}

export async function runTrial({ out, invoke, mode = 'offline-plan' }) {
  if (!['offline-plan', 'fixture-contract', 'live-model'].includes(mode)) throw Error('invalid-mode');
  if ((mode === 'offline-plan') !== (invoke === undefined)) throw Error('mode-adapter-mismatch');
  const snapshot = confirmedSnapshot();
  const plan = { schemaVersion: 1, snapshot, samples: CASES, systemPrompt: SYSTEM_PROMPT, maxCalls: MAX_CALLS };
  const planHash = fingerprint(plan);
  await mkdir(out, { recursive: true });
  // 同一目录不能从离线变付费，或切换样本/提示词后误用旧检查点。
  const implementationFiles = ['./run.mjs', './core.mjs', './cases.mjs', './provider.mjs', '../concept-linking-r2/core.mjs'];
  const implementationHash = fingerprint(await Promise.all(implementationFiles.map(file => readFile(new URL(file, import.meta.url), 'utf8'))));
  const metadata = { planHash, implementationHash, mode, maxCalls: MAX_CALLS };
  const manifestFile = path.join(out, 'manifest.json');
  if (!await createOnce(manifestFile, metadata)) {
    if (JSON.stringify(await readJson(manifestFile)) !== JSON.stringify(metadata)) throw Error('checkpoint-mismatch');
  }
  const rows = [];
  let slot = 0;
  for (const sample of CASES) {
    // 交替臂顺序以减少固定先后顺序影响；每臂均用相同快照。
    const pair = preparePair(snapshot, sample);
    if (Number(sample.id.slice(1)) % 2 === 0) pair.reverse();
    for (const prepared of pair) {
      slot += 1;
      const row = { caseId: sample.id, ...prepared, expected: sample.expected, status: 'not-run', staged: null, evaluation: null };
      if (invoke) {
        if (slot > MAX_CALLS) throw Error('budget-exhausted');
        const stem = path.join(out, `call-${String(slot).padStart(2, '0')}`);
        // 在调用前落盘独占预留。失败/超时/中断都占用预算，不自动重试。
        const reserved = await createOnce(`${stem}.reserved.json`, { planHash, slot, caseId: sample.id, arm: prepared.arm });
        if (!reserved) {
          try { rows.push(await readJson(`${stem}.result.json`)); continue; }
          catch (error) {
            if (error.code !== 'ENOENT') throw error;
            row.status = 'interrupted-or-in-progress-not-retried';
          }
        } else {
          try {
            const response = await invoke({ systemPrompt: SYSTEM_PROMPT, request: structuredClone(prepared.request) });
            if (response?.kind === 'provider-result') row.provider = response;
            if (response?.kind === 'provider-result' && response.status !== 'complete') {
              row.status = response.status;
            } else {
              row.staged = stageResponse(snapshot, prepared, response?.kind === 'provider-result' ? response.parsed : response);
              row.evaluation = evaluate(sample, prepared, row.staged);
              row.status = 'response-received';
            }
          } catch {
            // 不把供应商错误字符串写入报告，避免泄漏凭据；明确无模型结论。
            row.status = 'invocation-or-response-failed';
          }
          await writeFile(`${stem}.result.json`, JSON.stringify(row, null, 2));
        }
      }
      rows.push(row);
    }
  }
  const result = { mode, planHash, promptHash: fingerprint(SYSTEM_PROMPT), systemPrompt: SYSTEM_PROMPT, snapshot, rows };
  await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(path.join(out, 'report.md'), renderReport(result));
  return result;
}

export async function main(argv, { env = process.env, fetchImpl = fetch } = {}) {
  const args = { out: 'storage/experiments/knowledge-incremental/offline-plan', live: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--live-model') args.live = true;
    else if (['--out', '--budget-dir'].includes(flag) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[flag === '--out' ? 'out' : 'budgetDir'] = argv[++i];
    } else throw Error('invalid-arguments');
  }
  if (!args.live) {
    if (args.budgetDir) throw Error('budget-requires-live-mode');
    return runTrial({ out: args.out });
  }
  if (!args.budgetDir) throw Error('live-mode-requires-fixed-budget');
  // 只有显式付费模式到达这里才读取指定密钥；不枚举环境、不自动查找其它密钥。
  const invoke = createProviderInvoker({ apiKey: env.DEEPSEEK_API_KEY, budgetDir: args.budgetDir, fetchImpl });
  const result = await runTrial({ out: args.out, mode: 'live-model', invoke });
  result.providerBudget = await readBudgetUsage(args.budgetDir);
  await writeFile(path.join(args.out, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(path.join(args.out, 'report.md'), renderReport(result));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(() => { console.error('实验参数或检查点无效'); process.exitCode = 1; });
}

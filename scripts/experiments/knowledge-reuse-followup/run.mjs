#!/usr/bin/env node
// 固定公开合成样本，内存模拟。用途是研究复用已确认条目与候选审核状态分离。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startState, modelInput, applyProposal, SYSTEM_PROMPT } from '../knowledge-hardcases/core.mjs';
import { CASES } from './cases.mjs';

const API = 'https://api.deepseek.com/chat/completions';
const SYSTEM_PROMPT_FOLLOWUP = [
  SYSTEM_PROMPT,
  '',
  '【重要：旧知识状态与本轮提议状态必须分开】',
  'existingItems 中 confirmed 指旧条目已确认，不代表本次笔记的候选也已确认。',
  '无论 itemAction 为 new 还是 reuse，本次 item.reviewStatus 只能是 candidate 或 disputed；即使复用旧的 confirmed 条目，也必须填写 candidate，旧条目的 confirmed 状态不会被改变。',
  '选择 itemAction=reuse 时，conceptIds 必须与 existingItemId 对应旧条目的 conceptIds 完全相同（顺序不限），不可追加原来没有的概念关联；额外涉及的概念可以在 reason 说明，但不会自动更新旧条目。',
  '若一段笔记与已确认条目冲突，应新建 disputed 候选并明确冲突 ID；不得把错误笔记当作已确认条目的支持性来源。',
  '【重要：AI 修正建议与用户原话必须分开】',
  'source.kind=note 时，item.statement 只表达本次 note 所声称的知识，不把模型自己的纠错、正确 API 写法或外部解释拼接进去。',
  '若原笔记存在错误，可以在 reason 中说明并指出正确写法；item.quote 必须保持原文逐字，item.statement 不可替换原话或混入外部纠正。',
  'source.kind=ai 时，可以主动提供无笔记知识，item.sourceMode=ai、item.quote=null、item.reviewStatus=candidate；不得假装是用户笔记来源。',
  '仍然输出原来的 JSON 契约；不要增加字段，不用 Markdown 代码块。'
].join('\n');

export function parseArgs(argv) {
  const opts = { out: 'storage/experiments/knowledge-reuse-followup', maxTokens: 1600, dryRun: false };
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg==='--out') {
      if (!argv[i+1]) throw Error('missing --out');
      opts.out=argv[++i];
    } else if (arg==='--max-tokens') {
      const v=Number(argv[++i]);
      if (!Number.isSafeInteger(v) || v<256 || v>2048) throw Error('--max-tokens invalid');
      opts.maxTokens=v;
    } else if (arg==='--dry-run') opts.dryRun=true;
    else throw Error('仅允许固定合成样本，不能输入其它参数：'+arg);
  }
  return opts;
}

export function requestPayload(testCase) {
  // 每条使用独立初始化目录，避免此前失败条目污染后续样本。
  return modelInput(startState(),testCase);
}

export async function invoke(fetchImpl, key, payload, maxTokens) {
  const r=await fetchImpl(API,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+key},
    body:JSON.stringify({
      model:'deepseek-chat',temperature:0,max_tokens:maxTokens,response_format:{type:'json_object'},
      messages:[{role:'system',content:SYSTEM_PROMPT_FOLLOWUP},
        {role:'user',content:JSON.stringify(payload)}]
    }),
    signal:AbortSignal.timeout(60000)
  });
  if (!r.ok) throw Error('provider-http-'+r.status);
  const json=await r.json();
  const choice=json?.choices?.[0];
  if (choice?.finish_reason!=='stop'||typeof choice?.message?.content!=='string')throw Error('model-incomplete');
  return { proposal:JSON.parse(choice.message.content), usage:json.usage??null };
}

const sameSet=(x,y)=>Array.isArray(x)&&Array.isArray(y)
  &&x.length===y.length&&new Set(x).size===x.length&&x.every(v=>y.includes(v));
const isSubset=(xs,ys)=>Array.isArray(xs)&&xs.every(x=>ys.includes(x));

export function evaluate(testCase, proposal, event, beforeState, afterState) {
  const e=testCase.expected;
  const accepted=event?.accepted===true;
  const conceptsOk=accepted&&(e.conceptIds
    ?sameSet(event.conceptIds,e.conceptIds)
    :isSubset(e.requiredConceptIds,event.conceptIds)
      &&isSubset(event.conceptIds,e.allowedConceptIds));
  const actionOk=accepted && event.itemAction===e.itemAction
    &&(e.itemAction!=='reuse'||event.itemId===e.existingItemId);
  const reviewOk=accepted&&event.reviewStatus===e.reviewStatus;
  const conflictsOk=accepted&&sameSet(event.conflictsWithItemIds,e.conflicts);
  const provenanceOk=accepted&&event.sourceMode===e.sourceMode
    &&(e.sourceMode==='ai'
      ?event.quote===null
      :typeof event.quote==='string'&&testCase.source.markdown.includes(event.quote));
  const originalClaimOk=accepted&&(!e.needsOriginalClaim
    ||event.storedStatement.includes(e.needsOriginalClaim));
  const noOutsideCorrection=accepted&&(!e.forbiddenStatement
    ||!event.storedStatement.includes(e.forbiddenStatement));
  const oldItem=beforeState.items.find(i=>i.id===e.existingItemId);
  const current=afterState.items.find(i=>i.id===e.existingItemId);
  const oldItemUnchanged=e.itemAction!=='reuse'||(accepted&&oldItem&&current
    &&oldItem.statement===current.statement
    &&oldItem.reviewStatus===current.reviewStatus
    &&sameSet(oldItem.conceptIds,current.conceptIds)
    &&current.sources.length===oldItem.sources.length+(testCase.source.kind==='note'?1:0));
  const passed=conceptsOk&&actionOk&&reviewOk&&conflictsOk&&provenanceOk
    &&originalClaimOk&&noOutsideCorrection&&oldItemUnchanged;
  return {
    caseId:testCase.id, title:testCase.title, accepted, conceptsOk, actionOk, reviewOk,
    conflictsOk, provenanceOk, originalClaimOk, noOutsideCorrection, oldItemUnchanged,
    passed, conceptIds:event?.conceptIds??[],
    itemId:event?.itemId??null, itemAction:event?.itemAction??null,
    status:event?.reviewStatus??null, sourceMode:event?.sourceMode??null,
    statement:event?.storedStatement??null,quote:event?.quote??null,
    reason:event?.reason??event?.errors?.join('；')??'—',
    providerNote:proposal?.reason??null
  };
}

export function buildReport(rows,runs) {
  const v=key=>rows.filter(x=>x[key]).length;
  const reused=rows.filter(x=>CASES.find(c=>c.id===x.caseId)?.expected.itemAction==='reuse');
  const correctionCases=rows.filter(x=>CASES.find(c=>c.id===x.caseId)?.expected.forbiddenStatement);
  const usage=runs.reduce((s,r)=>({input:s.input+(r.usage?.prompt_tokens??0),
    output:s.output+(r.usage?.completion_tokens??0)}),{input:0,output:0});
  return [
    '# 知境：已确认知识复用、审核状态与 AI 来源隔离实验',
    '',
    '> 仅公开合成数据；研究用内存模拟，没有读取或写入正式知境知识库。',
    '> 本轮提示词针对上一轮 H02/H04 失败的协议歧义作**通用**澄清，包含两条未见过的同义样本。不能把成功率当作真实知识库准确率。',
    '',
    '## 汇总',
    '',
    '- 真实模型响应：'+runs.filter(x=>x.modelOk).length+'/'+runs.length,
    '- 结构及全部测试条件通过：'+v('passed')+'/'+rows.length,
    '- Concept ID 关联通过：'+v('conceptsOk')+'/'+rows.length,
    '- KnowledgeItem 新建/复用：'+v('actionOk')+'/'+rows.length,
    '- 新候选审核状态：'+v('reviewOk')+'/'+rows.length,
    '- 冲突对象：'+v('conflictsOk')+'/'+rows.length,
    '- 来源模式与 quote：'+v('provenanceOk')+'/'+rows.length,
    '- 复用场景旧确认条目原陈述、概念及状态不被改写：'+reused.filter(x=>x.oldItemUnchanged).length+'/'+reused.length,
    '- 特定 API 错误笔记的原话未被悄悄校正：'+correctionCases.filter(x=>x.noOutsideCorrection).length+'/'+correctionCases.length,
    '- Tokens（输入/输出）：'+usage.input+'/'+usage.output,
    '',
    '| 案例 | 关联 Concept | Item 动作 | 状态 | 来源 | 旧条目不被覆盖 | 总体 |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(r=>'| '+r.caseId+' | '+(r.conceptIds.join('、')||'—')
      +' | '+(r.actionOk?'✓':'×')+' | '+(r.reviewOk?'✓':'×')
      +' | '+(r.provenanceOk?'✓':'×')+' | '+(r.oldItemUnchanged?'✓':'×')
      +' | '+(r.passed?'✓':'×')+' |'),
    '',
    '## 具体模型候选（仅公开合成资料）',
    '',
    ...rows.flatMap(r=>[
      '### '+r.caseId+' '+r.title,'',
      '- KnowledgeItem：'+(r.itemId??'未接纳')+'；动作 '+(r.itemAction??'—')+'；候选状态 '+(r.status??'—'),
      '- Concept IDs：'+(r.conceptIds.join('、')||'—'),
      '- 笔记原话 quote：'+(r.quote??'null（无笔记来源）'),
      '- 正文 statement：'+(r.statement??'未接纳'),
      '- 模型理由：'+r.reason,
      '- 检验结论：'+(r.passed?'符合本次预设':'需要进一步核查')+'；原话/AI纠错隔离 '+(r.noOutsideCorrection?'通过':'未通过'),
      ''
    ]),
    '## 重要限制','',
    '本报告检测的 statement 与 quote 的关系只包括指定可观察错误（如 API 名称），不能证明所有输出都符合原文语义；模型可以写出错误但格式合格的事实。',
    '旧条目 confirmed 只是实验初始目录的状态，不能由于本轮模型重述就悄悄更改。AI 来源为空指笔记引用为空，仍需要保留 AI 生成身份和 candidate 状态。',
    '此结果不等于正式 Concept/schema 已经实现，不直接驱动生产代码或未经审核的自动合并。',''
  ].join('\n');
}

export async function main(argv,{env=process.env,fetchImpl=fetch,log=console.log}={}) {
  const args=parseArgs(argv);
  if (!args.dryRun&&!env.DEEPSEEK_API_KEY)throw Error('missing-DEEPSEEK_API_KEY');
  const runs=[],rows=[];
  for(const testCase of CASES) {
    const state=startState();
    const payload=requestPayload(testCase);
    if(args.dryRun){
      const event={accepted:false,errors:['dry-run，未调用模型']};
      const row=evaluate(testCase,null,event,state,state);
      rows.push(row);
      runs.push({caseId:testCase.id,modelOk:false,skipped:true,payload});
      continue;
    }
    try {
      const {proposal,usage}=await invoke(fetchImpl,env.DEEPSEEK_API_KEY,payload,args.maxTokens);
      const beforeState=structuredClone(state);
      const event=applyProposal(state,testCase,proposal);
      const row=evaluate(testCase,proposal,event,beforeState,state);
      rows.push(row);
      runs.push({caseId:testCase.id,modelOk:true,usage,proposal,event});
      log(testCase.id+'：'+(row.passed?'本轮校验通过':'存在质量或结构问题'));
    }catch(_error){
      const event={accepted:false,errors:['调用或解析失败']};
      rows.push(evaluate(testCase,null,event,state,state));
      runs.push({caseId:testCase.id,modelOk:false,errorCategory:'模型请求或响应无效'});
      log(testCase.id+'：调用或解析失败，具体提供商消息不公开');
    }
  }
  const report=buildReport(rows,runs);
  await mkdir(args.out,{recursive:true});
  await writeFile(path.join(args.out,'report.md'),report);
  await writeFile(path.join(args.out,'result.json'),JSON.stringify({
    purpose:'public-synthetic-knowledge-reuse-provenance',model:'deepseek-chat',
    temperature:0,maxTokens:args.maxTokens,runs,rows
  },null,2));
  return {runs,rows,report};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main(process.argv.slice(2)).catch(()=>{console.error('实验输入或环境无效；未打印敏感值');process.exitCode=1});
}

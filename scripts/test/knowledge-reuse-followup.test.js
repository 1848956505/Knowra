import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startState, modelInput, applyProposal } from '../experiments/knowledge-hardcases/core.mjs';
import { CASES } from '../experiments/knowledge-reuse-followup/cases.mjs';
import { parseArgs, requestPayload, evaluate, main } from '../experiments/knowledge-reuse-followup/run.mjs';

const byId=id=>CASES.find(x=>x.id===id);
const noteQuote=x=>x.source.kind==='note'?x.source.markdown:null;
const proposalOf=caseData=>{
  const e=caseData.expected;
  const itemId=e.existingItemId;
  const state=startState();
  const old=state.items.find(x=>x.id===itemId);
  const quote=noteQuote(caseData);
  const conceptIds=e.conceptIds??e.requiredConceptIds;
  return {
    requestId:'hardcase-'+caseData.id,
    conceptIds:[...conceptIds],
    itemAction:e.itemAction,
    existingItemId:itemId??null,
    item:{
      title:old?.title??caseData.title,kind:old?.kind??(caseData.id==='H05'?'formula':caseData.id==='H10'?'application':'fact'),
      statement:old?.statement??(quote??'若 A 是 m×n、B 是 n×p，则 C=AB 的第 i 行第 j 列为两者对应元素乘积之和。'),
      quote,sourceMode:e.sourceMode,reviewStatus:e.reviewStatus
    },
    conflictsWithItemIds:[...e.conflicts],
    reason:caseData.id==='H10'?'原文 require_grad_ 疑似错误；正确拼写是 requires_grad_（此批注不进入原话）':'依据语义复用或新增'
  };
};

test('不向 DeepSeek 泄露人工预期，也不允许选择私有笔记',()=>{
  for(const c of CASES){
    const input=requestPayload(c);
    assert.equal(JSON.stringify(input).includes('"expected"'),false);
    assert.equal(JSON.stringify(input).includes('"baselineId"'),false);
    assert.equal(input.requestId,'hardcase-'+c.id);
  }
  assert.equal(parseArgs(['--dry-run']).dryRun,true);
  assert.equal(parseArgs([]).maxTokens,1600);
  for(const args of [['--notes','/private.md'],['--model','test'],['--max-tokens','99999'],['--max-tokens','bad'],['--out']]){
    assert.throws(()=>parseArgs(args));
  }
});

test('历史失败的 H02/H04：复用确认条目时本次候选应是 candidate，旧条目不变',()=>{
  for(const id of ['H02','H04']){
    const c=byId(id),state=startState(), p=proposalOf(c);
    const previous={...p,item:{...p.item,reviewStatus:'confirmed'}};
    assert.equal(applyProposal(state,c,previous).accepted,false);
    if(id==='H04'){
      const extra={...p,conceptIds:['C_MATMUL','C_MATRIX']};
      assert.equal(applyProposal(state,c,extra).accepted,false);
    }
    const before=structuredClone(state);
    const event=applyProposal(state,c,p);
    const row=evaluate(c,p,event,before,state);
    assert.equal(row.passed,true,id+': '+JSON.stringify(row));
    const existing=state.items.find(x=>x.id===c.expected.existingItemId);
    assert.equal(existing.reviewStatus,'confirmed');
    assert.equal(existing.statement,before.items.find(x=>x.id===existing.id).statement);
    assert.deepEqual(existing.conceptIds,before.items.find(x=>x.id===existing.id).conceptIds);
    assert.deepEqual(existing.sources.map(x=>x.noteId),[id]);
  }
});

test('冲突笔记不覆盖确认条目，AI 修正写在 reason 而不是原文 statement',()=>{
  for(const id of ['H03','H10']){
    const c=byId(id),state=startState(),before=structuredClone(state),p=proposalOf(c);
    const event=applyProposal(state,c,p);
    assert.equal(event.accepted,true);
    const result=evaluate(c,p,event,before,state);
    assert.equal(result.passed,true);
    assert.equal(event.reviewStatus,'disputed');
    assert.ok(event.conflictsWithItemIds.length);
  }
  const c=byId('H10'),state=startState(),good=proposalOf(c);
  assert.equal(good.item.statement.includes('x.requires_grad_(True)'),false);
  assert.equal(good.reason.includes('requires_grad_'),true);
  const bad={...good,item:{...good.item,statement:good.item.statement+'；正确命令是 x.requires_grad_(True)'}};
  const before=structuredClone(state);
  const event=applyProposal(state,c,bad);
  assert.equal(event.accepted,true); // 结构合法，但独立评估必须发现来源混写
  assert.equal(evaluate(c,bad,event,before,state).noOutsideCorrection,false);
});

test('无笔记 AI 补充允许 quote=null，但来源必须标记 ai 且为 candidate',()=>{
  const c=byId('H05'),state=startState(),p=proposalOf(c);
  assert.equal(p.item.quote,null);
  const event=applyProposal(state,c,p);
  assert.equal(event.accepted,true);
  assert.equal(event.sourceMode,'ai');
  assert.equal(state.items.at(-1).sources.length,0);
  assert.equal(evaluate(c,p,event,startState(),state).passed,true);
  const invalid={...p,item:{...p.item,sourceMode:'note'}};
  assert.equal(applyProposal(startState(),c,invalid).accepted,false);
});

test('未见过的复述应重用原有 KnowledgeItem，不因为笔记措辞不同而改原文',()=>{
  for(const id of ['U01','U02']){
    const c=byId(id),state=startState(),p=proposalOf(c),before=structuredClone(state);
    const event=applyProposal(state,c,p);
    assert.equal(event.accepted,true);
    assert.equal(evaluate(c,p,event,before,state).passed,true);
    assert.equal(event.itemId,c.expected.existingItemId);
  }
});

test('七次假模型端到端，报告清楚区分旧条目状态与本轮候选',async()=>{
  const runRequests=[];
  const mockFetch=async(_url,init)=>{
    const body=JSON.parse(init.body),payload=JSON.parse(body.messages[1].content);
    runRequests.push({payload,body});
    const c=byId(payload.source?.noteId??payload.requestId.replace('hardcase-',''));
    assert.ok(c);
    assert.ok(!JSON.stringify(payload).includes('"expected"'));
    const p=proposalOf(c);
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(p)}}],
      usage:{prompt_tokens:120,completion_tokens:75}}),{status:200});
  };
  const out=path.join(await mkdtemp(path.join(os.tmpdir(),'knowra-reuse-')),'out');
  const result=await main(['--out',out,'--max-tokens','1024'],{
    env:{DEEPSEEK_API_KEY:'synthetic-not-real-key'},
    fetchImpl:mockFetch,log:()=>{}
  });
  assert.equal(runRequests.length,7);
  assert.equal(result.rows.filter(x=>x.passed).length,7);
  assert.equal(result.rows.filter(x=>x.reviewOk).length,7);
  assert.equal(result.rows.find(x=>x.caseId==='H10').noOutsideCorrection,true);
  const report=await readFile(path.join(out,'report.md'),'utf8');
  assert.match(report,/结构及全部测试条件通过：7\/7/);
  const raw=await readFile(path.join(out,'result.json'),'utf8');
  assert.equal(raw.includes('synthetic-not-real-key'),false);
});

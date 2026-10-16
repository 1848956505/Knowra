import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp,readFile } from 'node:fs/promises';
import { SCENARIOS } from '../experiments/knowledge-hardcases/scenarios.mjs';
import { startState, modelInput, validateProposal, applyProposal, evaluate } from '../experiments/knowledge-hardcases/core.mjs';
import { main,parseArgs } from '../experiments/knowledge-hardcases/run.mjs';

function mockProposal(state,t){
  const goal=t.expected;
  const noteSource=t.source.kind==='note';
  const quote=noteSource?t.source.markdown:null;
  const message={
    requestId:'hardcase-'+t.id,
    conceptIds:[...goal.conceptIds],
    itemAction:goal.itemAction,
    existingItemId:goal.itemAction==='reuse'?goal.reuseId:null,
    item:{
      title:t.title,
      kind:goal.kindOneOf[0],
      statement:noteSource?t.source.markdown:'若 A 是 m×n、B 是 n×p，则乘积 C 的元素 C_ij = sum_k A_ik B_kj。',
      quote,
      sourceMode:goal.sourceMode,
      reviewStatus:goal.status
    },
    conflictsWithItemIds:[...goal.conflicts],
    reason:'根据当前合成来源及已有概念身份判断'
  };
  return message;
}

test('模型收到的 JSON 不包含 expected 标准答案，也不能更改文件输入',()=>{
  const state=startState();
  for(const c of SCENARIOS){
    const input=modelInput(state,c);
    assert.equal(JSON.stringify(input).includes('expected'),false);
    assert.equal(JSON.stringify(input).includes('kindOneOf'),false);
    assert.equal(input.requestId,'hardcase-'+c.id);
    assert.ok(input.existingConcepts.every(x=>typeof x.id==='string'));
  }
  const ai=modelInput(state,SCENARIOS.find(c=>c.id==='H05'));
  assert.equal(ai.source.kind,'ai');
  assert.equal(Object.hasOwn(ai.source,'markdown'),false);
  assert.equal(Object.hasOwn(ai.source,'noteId'),false);
  assert.deepEqual(parseArgs([]),{out:'storage/experiments/knowledge-hardcases',maxTokens:1800,dryRun:false});
  for(const flags of [['--notes','private.md'],['--model','bad'],['--max-tokens','5000'],
    ['--max-tokens','oops'],['--max-tokens'],['--out']]){
    assert.throws(()=>parseArgs(flags));
  }
});

test('多概念命题可链接三个 Concept，而不是用标题取代 ID',()=>{
  const state=startState();
  const c=SCENARIOS[0],m=mockProposal(state,c);
  const event=applyProposal(state,c,m);
  assert.equal(event.accepted,true);
  assert.deepEqual(event.conceptIds,['C_MATRIX','C_VECTOR','C_MATMUL']);
  const item=state.items.find(i=>i.id===event.itemId);
  assert.deepEqual(item.conceptIds,event.conceptIds);
  assert.equal(item.sources.length,1);
});

test('重复来源复用确认条目，但不改确认内容或确认状态',()=>{
  const state=startState();
  const c=SCENARIOS[1],previous=state.items.find(i=>i.id==='K_CHAIN');
  const original=previous.statement;
  const event=applyProposal(state,c,mockProposal(state,c));
  assert.equal(event.accepted,true);
  assert.equal(event.itemId,'K_CHAIN');
  assert.equal(previous.statement,original);
  assert.equal(previous.reviewStatus,'confirmed');
  assert.deepEqual(previous.sources.map(x=>x.noteId),['H02']);
});

test('错误笔记作为 disputed 候选保留，与已确认命题建立冲突引用',()=>{
  const state=startState(),c=SCENARIOS[2];
  const event=applyProposal(state,c,mockProposal(state,c));
  assert.equal(event.accepted,true);
  assert.equal(event.reviewStatus,'disputed');
  assert.deepEqual(event.conflictsWithItemIds,['K_NONCOMM']);
  const original=state.items.find(i=>i.id==='K_NONCOMM');
  assert.equal(original.reviewStatus,'confirmed');
  const bad=state.items.find(i=>i.id===event.itemId);
  assert.equal(bad.reviewStatus,'disputed');
  assert.match(bad.statement,/AB=BA/);
  assert.equal(bad.sourceMode,'note');
});

test('没有笔记引用的 AI 补充仍有来源类型和待审核状态',()=>{
  const state=startState(),c=SCENARIOS[4];
  const proposal=mockProposal(state,c);
  assert.equal(proposal.item.quote,null);
  const event=applyProposal(state,c,proposal);
  assert.equal(event.accepted,true);
  const item=state.items.find(i=>i.id===event.itemId);
  assert.equal(item.sourceMode,'ai');
  assert.equal(item.reviewStatus,'candidate');
  assert.deepEqual(item.sources,[]);
  assert.equal(event.quote,null);
  const missingAiTag={...proposal,item:{...proposal.item,sourceMode:'note'}};
  assert.ok(validateProposal(missingAiTag,startState(),c).length>0);
});

test('无效 Concept、伪造 conflict ID、错误 quote 和伪造来源均 fail closed',()=>{
  const c=SCENARIOS[2],cases=[
    p=>({...p,conceptIds:['C_FAKE']}),
    p=>({...p,conflictsWithItemIds:null}),
    p=>({...p,conflictsWithItemIds:['K_FAKE']}),
    p=>({...p,item:{...p.item,reviewStatus:'candidate'}}),
    p=>({...p,item:{...p.item,quote:'不存在的引文'}}),
    p=>({...p,item:{...p.item,sourceMode:'ai',quote:null}}),
    p=>({...p,itemAction:'reuse',existingItemId:'K_NONCOMM'})
  ];
  for(const mutate of cases){
    const state=startState(),baseline=JSON.stringify(state);
    const attempt=applyProposal(state,c,mutate(mockProposal(state,c)));
    assert.equal(attempt.accepted,false);
    assert.equal(JSON.stringify(state),baseline);
  }
});

test('定义允许独立概念：矩阵加法的定义与 fact 可以是不同分类，不重复创建 Concept',()=>{
  const c=SCENARIOS.find(x=>x.id==='H08');
  const state=startState();
  const p=mockProposal(state,c);
  p.item.kind='definition';
  const e=applyProposal(state,c,p);
  assert.equal(e.accepted,true);
  assert.deepEqual(e.conceptIds,['C_ADD']);
  assert.equal(state.concepts.filter(x=>x.id==='C_ADD').length,1);
  const evaluated=evaluate([e],state);
  assert.equal(evaluated.rows.find(x=>x.caseId==='H08').kindOk,true);
});

test('错误归属 ID 即使 JSON 结构合法，也应在结果中扣分',()=>{
  const state=startState(),c=SCENARIOS[0],p=mockProposal(state,c);
  p.conceptIds=['C_MATRIX'];
  const e=applyProposal(state,c,p);
  assert.equal(e.accepted,true);
  const result=evaluate([e],state);
  const row=result.rows.find(x=>x.caseId==='H01');
  assert.equal(row.conceptOk,false);
  assert.equal(row.provenanceOk,true);
});

test('评分允许预先明确的合理辅助概念，但会记录与最小集合并非完全一致',()=>{
  const state=startState(),c=SCENARIOS.find(c=>c.id==='H07'),p=mockProposal(state,c);
  p.conceptIds=['C_TENSOR_RANK','C_TENSOR'];
  const event=applyProposal(state,c,p);
  assert.equal(event.accepted,true);
  const row=evaluate([event],state).rows.find(x=>x.caseId==='H07');
  assert.equal(row.conceptOk,true);
  assert.equal(row.conceptExactOk,false);
  const invalidState=startState(),bad=mockProposal(invalidState,c);
  bad.conceptIds=['C_TENSOR_RANK','C_MATRIX_RANK'];
  const wrong=applyProposal(invalidState,c,bad);
  assert.equal(wrong.accepted,true);
  assert.equal(evaluate([wrong],invalidState).rows.find(x=>x.caseId==='H07').conceptOk,false);
});

test('假模型端到端处理全部10个场景；评分与来源区分可重复',async()=>{
  const prompts=[];
  const mockFetch=async(_url,init)=>{
    const request=JSON.parse(JSON.parse(init.body).messages[1].content);
    prompts.push(request);
    assert.equal(JSON.parse(init.body).max_tokens,1024);
    const scenario=SCENARIOS.find(c=>request.requestId==='hardcase-'+c.id);
    const proposal=mockProposal({},scenario);
    return new Response(JSON.stringify({
      choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}],
      usage:{prompt_tokens:100,completion_tokens:50}
    }));
  };
  const output=path.join(await mkdtemp(path.join(os.tmpdir(),'knowra-hard-')),'out');
  const result=await main(['--out',output,'--max-tokens','1024'],{
    env:{DEEPSEEK_API_KEY:'SYNTHETIC_ONLY_TEST_VALUE'},
    fetchImpl:mockFetch,log:()=>{}
  });
  assert.equal(prompts.length,SCENARIOS.length);
  assert.equal(result.evaluation.scores.valid,10);
  assert.equal(result.evaluation.scores.conceptsExact,10);
  for(const metric of ['concepts','action','conflicts','reviewStatus','provenance','kind'])
    assert.equal(result.evaluation.scores[metric],10);
  const report=await readFile(path.join(output,'report.md'),'utf8');
  assert.match(report,/必需 Concept ID 均出现、无无关额外节点：10\/10/);
  assert.equal(report.includes('SYNTHETIC_ONLY_TEST_VALUE'),false);
  const raw=await readFile(path.join(output,'result.json'),'utf8');
  assert.equal(raw.includes('SYNTHETIC_ONLY_TEST_VALUE'),false);
  assert.equal(raw.includes('kindOneOf'),false);
  assert.equal(result.evaluation.graph.items.find(i=>i.id==='K_NONCOMM').sourceNoteIds.includes('H04'),true);
  assert.equal(result.evaluation.graph.items.filter(i=>i.sourceMode==='ai').length,1);
  assert.equal(result.evaluation.graph.items.find(i=>i.sourceMode==='ai').sourceCount,0);
  assert.ok(prompts.every(p=>!Object.hasOwn(p,'expected')));
});

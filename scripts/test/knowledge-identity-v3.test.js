import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CONCEPTS, CASES } from '../experiments/knowledge-identity-v3/cases.mjs';
import { startState, modelInput, validateResponse, applyResponse, evaluate } from '../experiments/knowledge-identity-v3/core.mjs';
import { main, parseArgs } from '../experiments/knowledge-identity-v3/run.mjs';

function newEntry(s,quote,conceptIds,reviewStatus='candidate',conflictsWithItemIds=[],kind='fact') {
  return {action:'new',title:'合成知识条目',kind,statement:s,conceptIds,quote,
    reviewStatus,conflictsWithItemIds,reason:'对公开合成来源做保守分类'};
}
function mockResponse(c) {
  const quotes=c.source.kind==='note'?c.source.markdown.split('\n'):[];
  if(c.id==='V01')return {requestId:'identity-v3-V01',newConcept:null,entries:[
    {action:'reuse',existingItemId:'K_DIM',quote:quotes[0],reason:'与已确认的维度匹配条件同义'}]};
  if(c.id==='V02')return {requestId:'identity-v3-V02',newConcept:null,entries:[
    newEntry(quotes[0],quotes[0],['C_MATMUL']),
    newEntry(quotes[1],quotes[1],['C_MATMUL'],'disputed',['K_NONCOMM']),
    newEntry(quotes[2],quotes[2],['C_AUTODIFF'],'disputed',['K_API'],'application')
  ]};
  if(c.id==='V03')return {requestId:'identity-v3-V03',newConcept:null,entries:[
    newEntry('若 A 是 m×n、B 是 n×p，则 (AB)ij 等于 A 第 i 行与 B 第 j 列的对应乘积之和。',
      null,['C_MATMUL'],'candidate',[],'formula')
  ]};
  if(c.id==='V04')return {requestId:'identity-v3-V04',
    newConcept:{name:'矩阵乘法',sense:'矩阵与矩阵的乘积运算',possibleDuplicateOf:['C_MATMUL']},
    entries:[newEntry(quotes[0],quotes[0],['@new'])]};
  if(c.id==='V05')return {requestId:'identity-v3-V05',newConcept:null,entries:[
    newEntry(quotes[0],quotes[0],['C_ADD'],'candidate',[],'definition')
  ]};
  throw Error('未知案例');
}

test('合成测试期望仅存于离线 CASES，不进入发送给模型的任何 JSON',()=>{
  const s=startState();
  for(const c of CASES){
    const input=modelInput(s,c);
    assert.equal(JSON.stringify(input).includes('"gold"'),false);
    assert.equal(JSON.stringify(input).includes('actionPattern'),false);
    assert.equal(input.requestId,'identity-v3-'+c.id);
  }
  const v4=modelInput(s,CASES[3]);
  assert.equal(v4.existingConcepts.some(x=>x.id==='C_MATMUL'),false);
  assert.deepEqual(v4.duplicateHints.map(x=>x.id),['C_MATMUL']);
  assert.deepEqual(CONCEPTS.map(x=>x.id).includes('C_MATMUL'),true);
});

test('复用 confirmed 的 KnowledgeItem 只追加来源，不允许模型重设状态或陈述',()=>{
  const s=startState(),c=CASES[0],orig=s.items.find(x=>x.id==='K_DIM');
  const before=JSON.stringify(orig);
  const e=applyResponse(s,c,mockResponse(c));
  assert.equal(e.accepted,true);
  assert.equal(e.applied[0].action,'reuse');
  assert.equal(e.applied[0].reviewStatus,'confirmed');
  assert.equal(orig.reviewStatus,'confirmed');
  assert.equal(orig.statement,JSON.parse(before).statement);
  assert.deepEqual(orig.sources.map(x=>x.noteId),['V01']);
  const bad={...mockResponse(c),entries:[{...mockResponse(c).entries[0],reviewStatus:'candidate'}]};
  assert.ok(validateResponse(bad,modelInput(s,c)).length>0);
});

test('一份合成笔记拆成三条：两条错误候选保留原话并链接正确冲突对象',()=>{
  const s=startState(),c=CASES[1],e=applyResponse(s,c,mockResponse(c));
  assert.equal(e.accepted,true);
  assert.equal(e.applied.length,3);
  assert.deepEqual(e.applied.map(x=>x.reviewStatus),['candidate','disputed','disputed']);
  assert.deepEqual(e.applied.map(x=>x.conflictsWithItemIds),[[],['K_NONCOMM'],['K_API']]);
  assert.match(e.applied[1].statement,/AB=BA/);
  assert.match(e.applied[2].statement,/require_grad_/);
  assert.equal(s.items.find(x=>x.id==='K_NONCOMM').reviewStatus,'confirmed');
  assert.equal(s.items.find(x=>x.id==='K_API').reviewStatus,'confirmed');
  const dup={...mockResponse(c),entries:[mockResponse(c).entries[0],mockResponse(c).entries[0]]};
  assert.match(validateResponse(dup,modelInput(s,c)).join(';'),/重复|重叠/);
});

test('没有原始笔记时 AI 可以提公式，但 quote 必须 null、来源必须明确为 ai、状态 candidate',()=>{
  const s=startState(),c=CASES[2],response=mockResponse(c);
  const event=applyResponse(s,c,response);
  assert.equal(event.accepted,true);
  const created=s.items.find(x=>x.id===event.applied[0].id);
  assert.equal(created.reviewStatus,'candidate');
  assert.equal(created.sourceMode,'ai');
  assert.deepEqual(created.sources,[]);
  assert.equal(event.applied[0].quote,null);
  for(const mutate of [
    x=>({...x,item:'bad'}),
    x=>({...x,quote:'模型伪造的原文'}),
    x=>({...x,reviewStatus:'confirmed'}),
    x=>({...x,reviewStatus:'disputed',conflictsWithItemIds:['K_API']})
  ]){
    const fresh=startState();
    const bad={...response,entries:[mutate(response.entries[0])]};
    const baseline=JSON.stringify(fresh);
    assert.equal(applyResponse(fresh,c,bad).accepted,false);
    assert.equal(JSON.stringify(fresh),baseline);
  }
});

test('检索漏召回时支持疑似重复提示，但不能静默挂到隐藏的原概念 ID',()=>{
  const s=startState(),c=CASES[3],r=mockResponse(c);
  const event=applyResponse(s,c,r);
  assert.equal(event.accepted,true);
  assert.equal(event.newConceptId,'C_CAND_1');
  assert.deepEqual(s.candidateConcepts[0].possibleDuplicateOf,['C_MATMUL']);
  assert.equal(s.candidateConcepts[0].reviewStatus,'candidate');
  assert.equal(event.applied[0].conceptIds.includes('C_CAND_1'),true);
  assert.equal(event.applied[0].conceptIds.includes('C_MATMUL'),false);
  const bad={...r,newConcept:null,entries:[{...r.entries[0],conceptIds:['C_MATMUL']}]};
  assert.equal(applyResponse(startState(),c,bad).accepted,false);
});

test('定义和独立概念兼容，并拒绝恶意或损坏的 JSON 结构',()=>{
  const c=CASES[4],s=startState(),r=mockResponse(c);
  const e=applyResponse(s,c,r);
  assert.equal(e.accepted,true);
  assert.deepEqual(e.applied[0].conceptIds,['C_ADD']);
  assert.equal(s.concepts.filter(x=>x.id==='C_ADD').length,1);
  const malformed=[
    {...r,entries:[{...r.entries[0],conflictsWithItemIds:null}]},
    {...r,entries:[{...r.entries[0],conceptIds:null}]},
    {...r,entries:[{...r.entries[0],quote:null}]},
    {...r,newConcept:{name:'张量',sense:'数学对象',possibleDuplicateOf:[]}},
    {...r,entries:[{...r.entries[0],reviewStatus:'confirmed'}]}
  ];
  for(const bad of malformed) {
    const fresh=startState(),baseline=JSON.stringify(fresh);
    assert.ok(validateResponse(bad,modelInput(fresh,c)).length>0);
    assert.equal(applyResponse(fresh,c,bad).accepted,false);
    assert.equal(JSON.stringify(fresh),baseline);
  }
});

test('命令参数不允许私有文件和其它模型，限制最大输出 token',()=>{
  assert.equal(parseArgs([]).maxTokens,2400);
  assert.equal(parseArgs(['--max-tokens','1024']).maxTokens,1024);
  for(const args of [
    ['--notes','/private/test.md'],['--model','fake'],['--max-tokens','999999'],
    ['--max-tokens','nan'],['--max-tokens'],['--out']
  ]) assert.throws(()=>parseArgs(args));
});

test('使用假 DeepSeek 的无费端到端回归：五个阶段都产生正确内存结果',async()=>{
  const seen=[];
  const mockFetch=async(_url,opts)=>{
    const body=JSON.parse(opts.body);
    assert.equal(body.model,'deepseek-chat');
    assert.equal(body.max_tokens,1024);
    assert.equal(body.temperature,0);
    const req=JSON.parse(body.messages[1].content);
    seen.push(req);
    const c=CASES.find(x=>req.requestId==='identity-v3-'+x.id);
    const response=mockResponse(c);
    return new Response(JSON.stringify({
      choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}],
      usage:{prompt_tokens:135,completion_tokens:90}
    }));
  };
  const dir=await mkdtemp(path.join(os.tmpdir(),'knowra-identity-v3-'));
  const out=path.join(dir,'out');
  const r=await main(['--out',out,'--max-tokens','1024'],{
    env:{DEEPSEEK_API_KEY:'SYNTHETIC_FAKE_TEST_KEY_NEVER_PRINT'},fetchImpl:mockFetch,log:()=>{}
  });
  assert.equal(seen.length,5);
  assert.equal(r.evaluation.accepted,5);
  assert.equal(r.evaluation.passed,5);
  assert.equal(r.state.candidateConcepts.length,1);
  assert.equal(r.state.items.find(x=>x.id==='K_DIM').reviewStatus,'confirmed');
  assert.equal(r.state.items.find(x=>x.id==='K_DIM').sources.length,1);
  const ai=r.state.items.filter(x=>x.sourceMode==='ai');
  assert.equal(ai.length,1);
  assert.deepEqual(ai[0].sources,[]);
  const report=await readFile(path.join(out,'report.md'),'utf8');
  const raw=await readFile(path.join(out,'result.json'),'utf8');
  assert.match(report,/五个预设测试目标达成：5\/5/);
  assert.equal((report+raw).includes('SYNTHETIC_FAKE_TEST_KEY_NEVER_PRINT'),false);
  assert.equal(raw.includes('"gold"'),false);
  assert.equal(seen.some(x=>x.duplicateHints?.some(y=>y.id==='C_MATMUL') && x.existingConcepts.some(z=>z.id==='C_MATMUL')),false);
});

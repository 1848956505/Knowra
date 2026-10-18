#!/usr/bin/env node
// 固定公开合成数据；真实 DeepSeek key 只从环境变量读取，不输出、不写入 Git。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';
import { PROMPT, startState, modelInput, applyResponse, evaluate, reportMarkdown } from './core.mjs';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

export function parseArgs(argv) {
  const a = { out: 'storage/experiments/knowledge-identity-v3', dryRun:false, maxTokens:2400 };
  for(let i=0;i<argv.length;i++) {
    if(argv[i] === '--out') {
      if(!argv[i+1]) throw Error('缺少输出目录');
      a.out=argv[++i];
    } else if(argv[i] === '--max-tokens') {
      const n=Number(argv[++i]);
      if(!Number.isSafeInteger(n) || n<256 || n>3072) throw Error('maxTokens 需在 256 到 3072 之间');
      a.maxTokens=n;
    } else if(argv[i] === '--dry-run') a.dryRun=true;
    else throw Error('未知参数：仅允许 --out、--max-tokens、--dry-run');
  }
  return a;
}

export async function callModel(fetchImpl,apiKey,payload,maxTokens) {
  const r=await fetchImpl(DEEPSEEK_ENDPOINT, {
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
    body:JSON.stringify({
      model:'deepseek-chat',temperature:0,max_tokens:maxTokens,
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:PROMPT},
        {role:'user',content:JSON.stringify(payload)}
      ]
    }),
    signal:AbortSignal.timeout(60000)
  });
  if(!r.ok) throw Error('PROVIDER_HTTP_'+r.status); // 永不打印供应商错误正文
  const data=await r.json();
  const choice=data?.choices?.[0];
  if(choice?.finish_reason!=='stop' || typeof choice.message?.content!=='string')
    throw Error('PROVIDER_INCOMPLETE');
  return {proposal:JSON.parse(choice.message.content),usage:data.usage};
}

export async function main(argv,{env=process.env,fetchImpl=fetch,log=console.log}={}) {
  const a=parseArgs(argv);
  if(!a.dryRun&&!env.DEEPSEEK_API_KEY) throw Error('DEEPSEEK_API_KEY 缺失');
  const state=startState(),runs=[],events=[];
  for(const c of CASES) {
    const input=modelInput(state,c);
    if(a.dryRun) {
      runs.push({caseId:c.id,modelOk:false,dryRun:true,input});
      events.push({caseId:c.id,accepted:false,errors:['未调用模型']});
      continue;
    }
    try {
      const {proposal,usage}=await callModel(fetchImpl,env.DEEPSEEK_API_KEY,input,a.maxTokens);
      const event=applyResponse(state,c,proposal);
      runs.push({caseId:c.id,modelOk:true,proposal,event,usage});
      events.push(event);
      log(c.id+': '+(event.accepted?'模拟校验通过':'模拟校验拒绝')
        +'，知识条目 '+(event.applied?.length??0));
    } catch(_error) {
      const errorCategory='模型请求、返回或 JSON 解析失败；细节已隐藏';
      runs.push({caseId:c.id,modelOk:false,errorCategory});
      events.push({caseId:c.id,accepted:false,errors:[errorCategory]});
      log(c.id+': 模型调用未完成；未更新候选图');
    }
  }
  const evaluation=evaluate(events,state);
  const report=reportMarkdown(evaluation,runs)
    + '\n- 模型输入/输出 tokens：'
    + runs.reduce((x,r)=>x+(r.usage?.prompt_tokens??0),0)+' / '
    + runs.reduce((x,r)=>x+(r.usage?.completion_tokens??0),0)+'\n';
  await mkdir(a.out,{recursive:true});
  await writeFile(path.join(a.out,'report.md'),report);
  await writeFile(path.join(a.out,'result.json'),JSON.stringify({
    mode:a.dryRun?'dry-run':'public-synthetic-real-model',
    model:'deepseek-chat',temperature:0,maxTokens:a.maxTokens,
    source:'repository-public-synthetic',runs,evaluation
  },null,2));
  log('DeepSeek 完整响应 '+runs.filter(x=>x.modelOk).length+'/'+runs.length
    +'；结构通过 '+evaluation.accepted+'/'+evaluation.total
    +'；预设目标达到 '+evaluation.passed+'/'+evaluation.total);
  return {state,runs,events,evaluation,report};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(_error=>{
    // 参数错误、外发超时等均不打印 API Key、供应商响应正文。
    console.error('实验无法正常启动（详情已隐藏）');
    process.exitCode=1;
  });
}

#!/usr/bin/env node
// 只用固定公开合成资料的知识模型压力测试。不读正式资料库、无持久化知识写入。
import path from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';
import { SYSTEM_PROMPT,startState,modelInput,applyProposal,evaluate,reportMarkdown } from './core.mjs';

const ENDPOINT='https://api.deepseek.com/chat/completions';

export function parseArgs(argv) {
  const args={out:'storage/experiments/knowledge-hardcases',maxTokens:1800,dryRun:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--out'){
      if(!argv[i+1])throw Error('--out 缺少文件夹');
      args.out=argv[++i];
    }else if(arg==='--max-tokens'){
      const value=Number(argv[++i]);
      if(!Number.isSafeInteger(value)||value<256||value>2048)throw Error('max-tokens 参数无效');
      args.maxTokens=value;
    }else if(arg==='--dry-run')args.dryRun=true;
    else throw Error('不支持本次实验之外的输入选项');
  }
  return args;
}

export async function invokeDeepSeek(fetchImpl,key,request,maxTokens) {
  const res=await fetchImpl(ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+key},
    body:JSON.stringify({
      model:'deepseek-chat',temperature:0,max_tokens:maxTokens,response_format:{type:'json_object'},
      messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(request)}]
    }),
    signal:AbortSignal.timeout(55000)
  });
  // 供应商的响应错误正文不会输出到日志，防止意外泄露。
  if(!res.ok)throw Error('provider-http-'+res.status);
  const data=await res.json();
  const msg=data?.choices?.[0];
  if(msg?.finish_reason!=='stop'||typeof msg?.message?.content!=='string')
    throw Error('provider-incomplete');
  return {proposal:JSON.parse(msg.message.content),usage:data.usage};
}

/** 10 个固定合成场景；真实服务请求最多 10 次、无重试、无数据库写入。 */
export async function main(argv,{env=process.env,fetchImpl=fetch,log=console.log}={}) {
  const args=parseArgs(argv);
  if(!args.dryRun&&!env.DEEPSEEK_API_KEY)throw Error('未配置 DEEPSEEK_API_KEY');
  const state=startState(),events=[],runs=[];
  for(const testCase of SCENARIOS){
    if(args.dryRun){
      const payload=modelInput(state,testCase);
      runs.push({caseId:testCase.id,modelOk:false,skipped:true,input:payload});
      events.push({caseId:testCase.id,accepted:false,errors:['dry-run 不发送模型请求']});
      continue;
    }
    const payload=modelInput(state,testCase);
    try{
      const {proposal,usage}=await invokeDeepSeek(fetchImpl,env.DEEPSEEK_API_KEY,payload,args.maxTokens);
      const event=applyProposal(state,testCase,proposal);
      events.push(event);
      runs.push({caseId:testCase.id,modelOk:true,usage,proposal,event});
      log(testCase.id+'：模型响应有效；内存候选'+(event.accepted?'已加入':'格式未通过'));
    }catch(_error){
      const reason='模型调用、JSON 或超时失败；未保留供应商原始错误正文';
      runs.push({caseId:testCase.id,modelOk:false,errorCategory:reason});
      events.push({caseId:testCase.id,accepted:false,errors:[reason]});
      log(testCase.id+'：模型调用失败（详情省略）');
    }
  }
  const result=evaluate(events,state);
  const report=reportMarkdown(result,runs);
  await mkdir(args.out,{recursive:true});
  await writeFile(path.join(args.out,'report.md'),report);
  await writeFile(path.join(args.out,'result.json'),JSON.stringify({
    mode:args.dryRun?'dry-run':'public-synthetic-real-model',
    model:'deepseek-chat',temperature:0,maxTokens:args.maxTokens,
    scenarios:SCENARIOS.map(c=>({id:c.id,title:c.title,sourceKind:c.source.kind})),
    runs,evaluation:result
  },null,2));
  log('完成模型请求：'+runs.filter(r=>r.modelOk).length+'/'+runs.length);
  log('Concept 集合匹配：'+result.scores.concepts+'/'+result.total
    +'，冲突处理：'+result.scores.conflicts+'/'+result.total
    +'，来源：'+result.scores.provenance+'/'+result.total);
  return {runs,events,state,evaluation:result,report};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(_error=>{
    console.error('实验未启动：参数或凭据条件不足，详情已省略');
    process.exitCode=1;
  });
}

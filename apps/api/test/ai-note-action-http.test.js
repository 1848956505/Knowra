import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersistentAppContext } from '../src/app.factory.js';
import { createServer } from '../src/server.js';
export const aiNoteActionHttpTests=[{name:'P2 HTTP 写入需要受信指令/精确确认，重启查询保留回执',async run(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'knowra-p2-http-'));let server;
  async function start(){const app=createPersistentAppContext({storageRootDir:root,ownerId:'test'});server=createServer({appContext:app,logger:{warn(){},error(){}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {app,origin:`http://127.0.0.1:${server.address().port}`};}
  const close=()=>new Promise(resolve=>server.close(resolve));
  try{let {app,origin}=await start();const space=app.http.knowledge.createDefaultKnowledgeSpace();
    const post=async(url,data,guard='1')=>{const response=await fetch(`${origin}/api/ai/actions${url}`,{method:'POST',headers:{'Content-Type':'application/json','X-Knowra-AI-Action':guard},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
    const input={spaceId:space.id,requestId:'http-synthetic',toolName:'notes_create',arguments:{title:'HTTP 合成',rawMarkdown:'正文'}};
    assert.equal((await post('',input,'0')).status,403);assert.equal((await post('',{...input,operationId:'fake'})).status,422);
    const planned=await post('',input);assert.equal(planned.status,200);const row=planned.body.data;assert.equal(app.dataStore.state.notes.length,0);
    assert.equal((await post(`/${row.actionId}/apply`,{})).status,403);assert.equal((await post(`/${row.actionId}/approve`,{planHash:'fake'})).status,409);
    assert.equal((await post(`/${row.actionId}/approve`,{planHash:row.plan.planHash})).status,200);const applied=await post(`/${row.actionId}/apply`,{});assert.equal(applied.body.data.status,'applied');
    assert.deepEqual((await post(`/${row.actionId}/apply`,{})).body.data.receipt,applied.body.data.receipt);await close();({app,origin}=await start());
    const persisted=(await(await fetch(`${origin}/api/ai/actions/${row.actionId}`)).json()).data;assert.equal(persisted.status,'applied');assert.deepEqual(persisted.receipt,applied.body.data.receipt);assert.equal(app.dataStore.state.notes.length,1);
  }finally{if(server?.listening)await close();fs.rmSync(root,{recursive:true,force:true});}
}}];

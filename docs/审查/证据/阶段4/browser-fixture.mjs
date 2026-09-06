import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
export async function withBrowser(fn,{restartAfterSpace=true}={}){const f=await fixture();let vite,browser;try{
 const space=(await f.request('/api/knowledge/spaces/default','POST',{})).data;
 if(restartAfterSpace)await f.restart();
 await f.request('/api/knowledge/notes','POST',{id:'browser-note',title:'阶段四浏览器笔记',spaceId:space.id,rawMarkdown:'初始浏览器正文'});
 const root=fileURLToPath(new URL('../../../../',import.meta.url));
 vite=await createServer({configFile:false,root:path.join(root,'apps/web-v4'),cacheDir:path.join(f.dir,'vite-cache'),plugins:[react()],resolve:{alias:{'@study-accelerator/web-core':path.join(root,'packages/web-core/src/index.ts')}},server:{host:'127.0.0.1',port:0,proxy:{'/api':f.origin},fs:{allow:[root]}},logLevel:'error'});await vite.listen();
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fn({f,space,page,context,browser,errors,origin:`http://127.0.0.1:${vite.httpServer.address().port}`});
 }finally{await browser?.close();await vite?.close();await f.close();}}

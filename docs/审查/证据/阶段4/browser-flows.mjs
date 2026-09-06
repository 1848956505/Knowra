import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {withBrowser} from './browser-fixture.mjs';
const results=[];const out='docs/审查/证据/阶段4/';
await withBrowser(async({page,origin,f,space,browser,errors})=>{
 const read=async id=>(await f.request('/api/knowledge/notes/'+id)).data;
 const source=()=>page.getByRole('textbox',{name:'Markdown 源码编辑器',exact:true});
 async function showSource(){if(!await source().isVisible()){await page.getByRole('button',{name:'视图',exact:true}).click();await page.getByRole('menuitem',{name:'显示源码编辑器',exact:true}).click();}await source().waitFor();}
 async function step(id,title,fn){if(process.env.REVIEW_CASES&&!process.env.REVIEW_CASES.split(',').includes(id))return;try{await fn();}catch(e){results.push({id,title,outcome:'failure',error:e.message});await page.screenshot({path:out+id+'-failure.png'}).catch(()=>{});throw e;}}
 if(process.env.REVIEW_CASES==='B03'){await f.request('/api/knowledge/notes/browser-note','PATCH',{title:'UI创建的审查笔记',rawMarkdown:'另一客户端已保存的正文'});await page.goto(origin+'/#/materials/notes/browser-note');await page.getByText('另一客户端已保存的正文',{exact:true}).waitFor();}
 const apiOnly=url=>url.pathname.startsWith('/api/');
 try{
 await step('B01','UI创建→源码编辑→自动保存→浏览器重载',async()=>{
  await page.goto(origin+'/#/materials/notes/browser-note');await page.getByText('初始浏览器正文',{exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'新建笔记',exact:true}).last().click();
  const dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});await dialog.getByRole('textbox',{name:'笔记名称'}).fill('UI创建的审查笔记');await dialog.getByRole('button',{name:'创建',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/browser-note$/);await showSource();await source().fill('UI自动保存中文 😀\n\n第二段内容');
  const id=decodeURIComponent(new URL(page.url()).hash.split('/').at(-1));
  await expect.poll(async()=> (await read(id))?.rawMarkdown).toBe('UI自动保存中文 😀\n\n第二段内容');
  await page.reload();await showSource();await expect(source()).toHaveValue('UI自动保存中文 😀\n\n第二段内容');
  await page.screenshot({path:out+'B01-保存后重载.png'});
  results.push({id:'B01',outcome:'pass',noteId:id,persistedAndReloaded:true});
 });
 await step('B02','实际409→冲突导出→资料导航→返回草稿丢失',async()=>{
  const id=decodeURIComponent(new URL(page.url()).hash.split('/').at(-1));
  await f.request('/api/knowledge/notes/'+id,'PATCH',{rawMarkdown:'另一客户端已保存的正文'});
  await source().fill('本地尚未合并的冲突草稿');
  await page.getByRole('button',{name:'导出本地草稿',exact:true}).waitFor();
  await page.screenshot({path:out+'B02-离开前冲突.png'});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出本地草稿',exact:true}).click();const download=await downloadPromise;const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk;assert.equal(text,'本地尚未合并的冲突草稿');
  await page.getByRole('button',{name:'资料',exact:true}).click();await expect(page).toHaveURL(/#\/materials$/);
  await page.goBack();await showSource();await expect(source()).not.toHaveValue('本地尚未合并的冲突草稿');
  const actual=await source().inputValue();assert.equal((await read(id)).rawMarkdown,'另一客户端已保存的正文');
  await page.screenshot({path:out+'B02-返回后草稿丢失.png'});
  results.push({id:'B02',outcome:'defect-reproduced',finding:'S3-02',exportContainedLocalDraft:true,returnedEditorContent:actual,serverContentUnchanged:true});
 });
 await step('B03','导航缓存→断网重载→标签管理',async()=>{
  await page.reload();await showSource();await expect(source()).toHaveValue('另一客户端已保存的正文');
  await page.getByRole('button',{name:'资料',exact:true}).click();
  await page.getByText('UI创建的审查笔记',{exact:true}).dblclick();await showSource();
  const groups=(await f.request('/api/knowledge/tag-groups')).data;
  const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('study-accelerator.backend-workspace-cache')));
  assert.ok(groups.length>0);assert.equal(cached.tagGroups.length,0);
  await page.route(apiOnly,route=>route.abort('failed'));
  await page.reload();await expect(page.getByText(/缓存只读/).first()).toBeVisible();
  await page.evaluate(()=>{location.hash='/materials/tags';});await page.getByRole('heading',{name:'标签管理',exact:true}).waitFor();
  await expect(page.getByText('没有符合条件的标签。',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'新建分组',exact:true})).toHaveCount(0);
  await page.screenshot({path:out+'B03-断网分组缓存.png'});
  results.push({id:'B03',outcome:'defect-reproduced',finding:'S3-03',serverGroups:groups.length,cachedGroups:0,offlineWriteActionsHidden:true});
  await page.unroute(apiOnly);
 });
 }finally{
  fs.writeFileSync(out+'浏览器流程结果.json',JSON.stringify({browser:browser.version(),viewport:{width:1440,height:1000},transport:'Vite same-origin proxy to isolated real API',results,pageErrors:errors},null,2)+'\n');
 }
});

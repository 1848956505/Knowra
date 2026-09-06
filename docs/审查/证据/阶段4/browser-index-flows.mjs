import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {withBrowser} from './browser-fixture.mjs';
const out='docs/审查/证据/阶段4/';const results=[];
await withBrowser(async({page,origin,f,space,browser,errors})=>{
 const K='/api/knowledge';
 const create=async(id,title,extras={})=>{const r=await f.request(K+'/notes','POST',{id,title,spaceId:space.id,rawMarkdown:'检索正文',...extras});assert.equal(r.status,201);};
 await f.request(K+'/tags','POST',{id:'filter',spaceId:space.id,name:'审查筛选标签',groupId:`tag-group-${space.id}-ordinary`});
 await create('filtered','检索样本A',{tagIds:['filter']});await create('unfiltered','检索样本B');
 async function step(id,fn){if(process.env.REVIEW_CASES&&!process.env.REVIEW_CASES.split(',').includes(id))return;try{await fn();}catch(e){results.push({id,outcome:'failure',error:e.message});await page.screenshot({path:out+id+'-failure.png'}).catch(()=>{});}}
 await step('B04',async()=>{
  await page.goto(origin+'/#/materials?tags=filter&match=all');
  const content=page.getByTestId('notes-index-scroll');await expect(content.getByText('检索样本A',{exact:true})).toBeVisible();await expect(content.getByText('检索样本B',{exact:true})).toHaveCount(0);
  await page.screenshot({path:out+'B04-标签筛选正常.png'});
  await page.getByRole('searchbox',{name:'搜索笔记索引'}).fill('检索');
  await expect(content.getByText('检索样本B',{exact:true})).toBeVisible();
  await page.screenshot({path:out+'B04-搜索后混入未标记笔记.png'});
  results.push({id:'B04',outcome:'defect-reproduced',finding:'S4-01',filterBeforeSearch:['检索样本A'],afterSearch:['检索样本A','检索样本B']});
 });
 await step('B05',async()=>{
  for(let i=0;i<9;i++)await create('page-'+i,'分页笔记'+i);
  await page.goto(origin+'/#/materials');await page.reload();
  await page.getByRole('button',{name:'列表视图',exact:true}).click();await page.getByRole('button',{name:'每页 5 条',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);await page.getByRole('button',{name:'第 3 页',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('searchbox',{name:'搜索笔记索引'}).fill('不存在的检索词');await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('searchbox',{name:'搜索笔记索引'}).fill('');await page.getByRole('button',{name:'图标视图',exact:true}).click();await expect(page.locator('[data-art-kind="document"]')).toHaveCount(12);
  await page.screenshot({path:out+'B05-图标视图.png'});
  results.push({id:'B05',outcome:'pass',totalNotes:12,listPageSizes:[5,2],emptySearchRows:0,gridNotes:12});
 });
 await step('B06',async()=>{
  await page.goto(origin+'/#/materials/notes/browser-note');await page.getByText('初始浏览器正文',{exact:true}).waitFor();
  await page.getByRole('button',{name:'文件',exact:true}).click();await page.getByRole('menuitem',{name:'删除',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'删除笔记？',exact:true});await dialog.getByRole('button',{name:'删除',exact:true}).click();await expect(dialog).toBeHidden();
  await page.getByRole('button',{name:/^回收站/}).click();await page.getByRole('button',{name:'阶段四浏览器笔记的回收站操作',exact:true}).click();await page.getByRole('menuitem',{name:'恢复笔记',exact:true}).click();
  await expect.poll(async()=> (await f.request(K+'/notes/browser-note')).status).toBe(200);
  await expect(page.getByTestId('notes-index-scroll').getByText('阶段四浏览器笔记',{exact:true})).toHaveCount(0);
  await f.request(K+'/notes/browser-note','DELETE');await page.reload();
  await page.getByRole('button',{name:'阶段四浏览器笔记的回收站操作',exact:true}).click();await page.getByRole('menuitem',{name:'彻底删除',exact:true}).click();
  const permanent=page.getByRole('dialog',{name:'彻底删除这篇笔记？'});await permanent.getByRole('button',{name:'彻底删除',exact:true}).click();await expect(permanent).toBeHidden();
  await expect.poll(async()=> (await f.request(K+'/notes/browser-note?includeDeleted=true')).status).toBe(404);
  await page.screenshot({path:out+'B06-回收站清理后.png'});
  results.push({id:'B06',outcome:'pass',softDelete:true,restore:true,permanentDelete:true});
 });
 await step('B07',async()=>{
  await create('image-note','图片上传审查');await page.goto(origin+'/#/materials/notes/image-note');await page.reload();await page.getByText('检索正文',{exact:true}).waitFor();
  await page.getByLabel('选择要插入的图片',{exact:true}).setInputFiles({name:'review.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hkAAAAASUVORK5CYII=','base64')});
  await expect.poll(async()=> (await f.request(K+'/notes/image-note')).data.rawMarkdown).toContain('/api/storage/attachments/');
  const attachments=(await f.request('/api/storage/attachments?noteId=image-note')).data;assert.equal(attachments.length,1);
  await page.reload();await expect(page.locator('img[src*="/api/storage/attachments/"]')).toHaveCount(1);
  await expect.poll(async()=>page.locator('img[src*="/api/storage/attachments/"]').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:out+'B07-图片上传重载.png'});
  results.push({id:'B07',outcome:'pass',attachmentReady:attachments[0].status,markdownReferencesAttachment:true,imageDecodedAfterReload:true});
 });
 fs.writeFileSync(out+'浏览器索引附件结果.json',JSON.stringify({browser:browser.version(),results,pageErrors:errors},null,2)+'\n');
});
if(results.some(x=>x.outcome==='failure'))process.exitCode=1;

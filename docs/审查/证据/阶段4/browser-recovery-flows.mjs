import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {withBrowser} from './browser-fixture.mjs';
const out='docs/审查/证据/阶段4/';const results=[];
await withBrowser(async({page,origin,f,browser,errors})=>{
 try{
  await page.goto(origin+'/#/materials/notes/browser-note');await page.getByText('初始浏览器正文',{exact:true}).waitFor({timeout:30000});
  assert.equal((await f.request('/api/knowledge/tag-groups')).data.length,0);
  await page.getByRole('button',{name:'新建标签',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'新建标签',exact:true});await dialog.getByRole('textbox',{name:'标签名称',exact:true}).fill('首次使用的标签');await expect(dialog.getByRole('button',{name:'创建标签',exact:true})).toBeDisabled();
  await page.screenshot({path:out+'B08-新空间不能快速创建标签.png'});
  results.push({id:'B08',outcome:'defect-reproduced',finding:'S4-02',nameFilled:true,createTagDisabled:true,systemGroups:0});
 }catch(e){results.push({id:'B08',outcome:'failure',error:e.message});await page.screenshot({path:out+'B08-failure.png'});}
 fs.writeFileSync(out+'浏览器首次使用结果.json',JSON.stringify({browser:browser.version(),results,pageErrors:errors},null,2)+'\n');
},{restartAfterSpace:false});
await withBrowser(async({page,origin,browser,errors})=>{
 const steps=[];let mutations=0;try{
  await page.goto(origin+'/#/materials');await page.getByRole('button',{name:'列表视图',exact:true}).waitFor({timeout:30000});
  const apiOnly=url=>url.pathname.startsWith('/api/');
  await page.route(apiOnly,route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))mutations++;return route.abort('failed');});
  for(const badCache of [false,true]){
   await page.evaluate(bad=>{localStorage.clear();if(bad)localStorage.setItem('study-accelerator.backend-workspace-cache','{broken json');},badCache);
   await page.reload();await expect(page.getByText('本地恢复',{exact:true})).toBeVisible();
   await page.evaluate(()=>{location.hash='/materials/tags';});await page.getByRole('heading',{name:'标签管理',exact:true}).waitFor();await expect(page.getByRole('button',{name:'新建分组',exact:true})).toHaveCount(0);
   steps.push({cache:badCache?'malformed':'absent',mode:'local-recovery',writeActionsHidden:true});
  }
  assert.equal(mutations,0);await page.screenshot({path:out+'B09-恢复模式只读.png'});results.push({id:'B09',outcome:'pass',steps,apiMutationRequests:mutations});
 }catch(e){results.push({id:'B09',outcome:'failure',error:e.message});await page.screenshot({path:out+'B09-failure.png'});}
 fs.writeFileSync(out+'浏览器恢复模式结果.json',JSON.stringify({browser:browser.version(),results:results.filter(x=>x.id==='B09'),pageErrors:errors},null,2)+'\n');
});
if(results.some(x=>x.outcome==='failure'))process.exitCode=1;

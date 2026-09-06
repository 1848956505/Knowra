import fs from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {withBrowser} from './browser-fixture.mjs';
const out='docs/审查/证据/阶段4/';
await withBrowser(async({page,origin,f,browser,errors})=>{const results=[];try{
 await page.goto(origin+'/#/materials/notes/browser-note');await page.getByText('初始浏览器正文',{exact:true}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'文件',exact:true}).click();await page.getByRole('menuitem',{name:'导入 Markdown',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导入 Markdown',exact:true});
 await dialog.getByLabel('拖放 Markdown 文件到这里',{exact:true}).setInputFiles([{name:'valid.md',mimeType:'text/markdown',buffer:Buffer.from('# 第一篇合法文稿\n\n已写入内容')},{name:'invalid.md',mimeType:'text/markdown',buffer:Buffer.from('# 第二篇被拒绝文稿\n\n![图片](http://example.invalid/review.png)')}]);
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge/notes/import-markdown-batch');await dialog.getByRole('button',{name:'导入 2 篇',exact:true}).click();const r=await response;assert.equal(r.status(),422);await expect(dialog.getByRole('alert')).toBeVisible();
 const notes=(await f.request('/api/knowledge/notes')).data;assert.equal(notes.filter(n=>n.title==='第一篇合法文稿').length,1);assert.equal(notes.filter(n=>n.title==='第二篇被拒绝文稿').length,0);
 const error=await dialog.getByRole('alert').innerText();await page.screenshot({path:out+'B10-导入失败但首篇已落盘.png'});
 await f.restart();const persisted=(await f.request('/api/knowledge/notes')).data;assert.equal(persisted.filter(n=>n.title==='第一篇合法文稿').length,1);
 results.push({id:'B10',outcome:'defect-reproduced',finding:'S4-03',responseStatus:r.status(),dialogRemainsOpen:true,displayedError:error,firstFilePersisted:true,secondFileAbsent:true,firstFileSurvivesRestart:true});
 }catch(e){results.push({id:'B10',outcome:'failure',error:e.message});await page.screenshot({path:out+'B10-failure.png'});process.exitCode=1;}finally{fs.writeFileSync(out+'浏览器批量导入结果.json',JSON.stringify({browser:browser.version(),results,pageErrors:errors},null,2)+'\n');}});

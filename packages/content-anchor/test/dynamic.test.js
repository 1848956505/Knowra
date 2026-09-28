import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMarkdown, anchorForBlock, anchorForSection, anchorFromProjectedRange, followAnchorChanges, sourceEdit, verifiedSourceEdits, calculateContentHash, updateStructure } from '../src/index.js';
const follow = (before, after, anchor) => followAnchorChanges(before, after, anchor, [sourceEdit(before, after)]);
test('章节前插入、正文改写和结束标题改名保持章节身份', () => {
  const before = '## A\n\n旧内容\n\n## B\n\n尾部';
  const anchor = anchorForSection(projectMarkdown(before), 0);
  for (const after of ['前言\n\n' + before, before.replace('旧内容', '更新的内容'), before.replace('## B', '## 新标题')]) {
    const outcome = follow(before, after, anchor);
    assert.equal(outcome.status, 'resolved');
    assert.match(outcome.anchor.quoteText, /^A/);
    assert.doesNotMatch(outcome.anchor.quoteText, /尾部/);
  }
  assert.equal(follow(before, before.replace('## B', '### B'), anchor).reason, 'boundaryChanged');
});
test('选区内部跟随、两端不吸附、删除后输入不复活', () => {
  const before = '前重要文字后';
  const anchor = anchorFromProjectedRange(projectMarkdown(before), 1, 5);
  for (const [after, expected] of [['前重新增要文字后','重新增要文字'], ['前新增重要文字后','重要文字'], ['前重要文字新增后','重要文字'], ['前新结论后','新结论']]) {
    assert.equal(follow(before, after, anchor).anchor.quoteText, expected);
  }
  const deleted = '前后';
  assert.equal(followAnchorChanges(before, before, anchor, [sourceEdit(before, deleted), sourceEdit(deleted, before)]).status, 'missing');
});
test('块内改写、拆分和合并不吸附未标记内容', () => {
  const before = '首段\n\n重要文字\n\n尾段';
  const anchor = anchorForBlock(projectMarkdown(before), 1);
  assert.equal(follow(before, before.replace('重要文字','全新内容'), anchor).anchor.scopeType, 'blocks');
  const split = follow(before, before.replace('重要文字','重要\n\n文字'), anchor);
  assert.equal(split.anchor.scopeType, 'blocks');
  assert.equal(split.anchor.quoteText, '重要\n文字');
  const merged = follow(before, before.replace('重要文字\n\n尾段','重要文字尾段'), anchor);
  assert.equal(merged.anchor.scopeType, 'selection');
  assert.equal(merged.anchor.quoteText, '重要文字');
});
test('映射必须重放为目标正文，伪造目标拒绝', () => {
  const before = 'abc', after = 'aXbc';
  const mapping = {formatVersion:1,operationId:'op',baseContentHash:calculateContentHash(before),targetContentHash:calculateContentHash(after),edits:[sourceEdit(before,after)]};
  assert.equal(verifiedSourceEdits(before,after,mapping).length,1);
  assert.equal(verifiedSourceEdits(before,'forged',mapping),null);
});
test('结构定位数据继承原节点身份，复制节点使用新身份', () => {
  const before = '# A\n\n内容';
  const initial = updateStructure('',before);
  const after = '前言\n\n'+before;
  const updated = updateStructure(before,after,initial,[sourceEdit(before,after)]);
  assert.equal(updated.nodes.find(n=>n.type==='heading').id,initial.nodes.find(n=>n.type==='heading').id);
  const copied = updateStructure(before,before+'\n\n'+before,initial,[sourceEdit(before,before+'\n\n'+before)]);
  assert.equal(new Set(copied.nodes.map(n=>n.id)).size,copied.nodes.length);
});
test('同笔记一次性剪切凭据跟随移动，复制与手工重输不继承', () => {
  const before = '重要文字\n\n其他内容';
  const cut = '其他内容';
  const after = '其他内容\n\n重要文字';
  const anchor = anchorForBlock(projectMarkdown(before), 0);
  const edits = [{...sourceEdit(before,cut),moveId:'move',moveKind:'cut'}, {...sourceEdit(cut,after),moveId:'move',moveKind:'paste'}];
  const moved = followAnchorChanges(before,after,anchor,edits);
  assert.equal(moved.status,'resolved'); assert.equal(moved.anchor.quoteText,'重要文字');
  assert.equal(moved.anchor.sourceStart,after.indexOf('重要文字'));
  assert.equal(followAnchorChanges(before,after,anchor,edits.map(({moveId,moveKind,...edit})=>edit)).status,'missing');
});
test('显式撤销恢复删除前的范围，普通同文输入不恢复', () => {
  const before = '前重要文字后', deleted = '前后';
  const anchor = anchorFromProjectedRange(projectMarkdown(before),1,5);
  const edits = [sourceEdit(before,deleted),{...sourceEdit(deleted,before),history:true}];
  assert.equal(followAnchorChanges(before,before,anchor,edits).status,'resolved');
});
test('明确保留空块时身份继续存在，重新输入继承整块', () => {
  const before = '重要内容', blank = '', after = '重写内容';
  const anchor = anchorForBlock(projectMarkdown(before),0);
  const cleared = followAnchorChanges(before,blank,anchor,[{...sourceEdit(before,blank),preserveEmptyBlock:true}]);
  assert.equal(cleared.status,'resolved');assert.equal(cleared.anchor.quoteText,'');assert.equal(cleared.anchor.tracking.empty,true);
  const typed = followAnchorChanges(blank,after,cleared.anchor,[sourceEdit(blank,after)]);
  assert.equal(typed.status,'resolved');assert.equal(typed.anchor.quoteText,after);
});
test('编辑与序列化末尾换行分别映射，不能吞掉后半段选区', async () => {
  const {sourceEdits,applySourceEdit}=await import('../src/index.js');
  const before='# A\n\n重要文字\n\n# B\n\n尾段',after='# A\n\n重新增要文字\n\n# B\n\n尾段\n';
  const p=projectMarkdown(before),i=p.text.indexOf('重要文字');
  const edits=sourceEdits(before,after);
  assert.equal(edits.reduce(applySourceEdit,before),after);
  assert.equal(followAnchorChanges(before,after,anchorFromProjectedRange(p,i,i+4),edits).anchor.quoteText,'重新增要文字');
});
test('当前标题升降级产生可确认候选；重复来源删除拒绝猜测',()=>{
 const before='# A\n\n内容\n\n# B\n\n其他';
 const anchor=anchorForSection(projectMarkdown(before),0);
 const outcome=follow(before,before.replace('# A','## A'),anchor);
 assert.equal(outcome.status,'needsReview');assert.equal(outcome.reason,'boundaryChanged');assert.ok(outcome.anchor);
 const duplicate='相同内容\n\n相同内容';
 const d=anchorForBlock(projectMarkdown(duplicate),0);
 assert.equal(followAnchorChanges(duplicate,'相同内容',d).status,'needsReview');
});
test('中文、emoji、行内格式、列表子树、引用、代码、公式和表格保持块范围', () => {
  for (const before of ['中文😀**重点**和[链接](https://example.com)', '- 重点\n  - 子项', '> 重点\n> 引用', '```js\n重点\n```', '$$\n重点\n$$', '| 名称 |\n| --- |\n| 重点 |']) {
    const anchor = anchorForBlock(projectMarkdown(before), 0);
    const outcome = follow(before, before.replace('重点', '新重点'), anchor);
    assert.equal(outcome.status, 'resolved');
    assert.equal(outcome.anchor.scopeType, 'blocks');
    assert.equal(outcome.anchor.quoteText, anchor.quoteText.replace('重点', '新重点'));
  }
});

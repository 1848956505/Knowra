import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorForBlock, anchorForListItem, anchorForSection, anchorFromProjectedRange, bindingFromAnchor, bindingFromEditor, bindingSourceRange,
  calculateContentHash, identityFromEditorState, parseIdentityBlocks, projectMarkdown, validBinding
} from '../src/index.js';

const markdown = '# 标题\n\n前文 **加粗重点** 后文\n\n* 甲\n  * 乙\n\n| 名称 | 说明 |\n| - | - |\n| 卷积 | 提取 `局部` 特征 |\n\n## 二\n\n尾段\n';
const ids = parseIdentityBlocks(markdown).map((block, index) => `${block.type}-${index}`);
const identity = identityFromEditorState(markdown, {
  formatVersion: 2, targetContentHash: calculateContentHash(markdown),
  blocks: parseIdentityBlocks(markdown).map((block, index) => ({ id: ids[index], type: block.type, empty: false })), annotations: []
});
const projection = projectMarkdown(markdown);
const resolved = (scopeType, anchor) => ({ scopeType, anchorStatus: 'resolved', anchor });
const projectedRange = (text) => { const start = projection.text.indexOf(text); return [start, start + text.length]; };

test('选区：跨加粗的选区换算为块内偏移，并能换回原源码范围', () => {
  const anchor = anchorFromProjectedRange(projection, ...projectedRange('文 加粗'));
  const binding = bindingFromAnchor(markdown, identity, resolved('selection', anchor));
  assert.equal(binding.start.blockId, ids[1]);
  assert.deepEqual([binding.start.offset, binding.end.offset], [1, 5]);
  assert.equal(validBinding(markdown, identity, binding), true);
  assert.deepEqual(bindingSourceRange(markdown, identity, binding), { sourceStart: anchor.sourceStart, sourceEnd: anchor.sourceEnd });
});

test('选区：表格单元格内的选区带上 [行, 列]，以表格为块', () => {
  const anchor = anchorFromProjectedRange(projection, ...projectedRange('取 局'));
  const binding = bindingFromAnchor(markdown, identity, resolved('selection', anchor));
  const tableId = ids[parseIdentityBlocks(markdown).findIndex(block => block.type === 'table')];
  assert.deepEqual(binding.start, { blockId: tableId, offset: 1, cell: [1, 1] });
  assert.deepEqual(bindingSourceRange(markdown, identity, binding), { sourceStart: anchor.sourceStart, sourceEnd: anchor.sourceEnd });
});

test('块、章节、列表：绑定到对应块 ID，类型不符时无效', () => {
  const blocks = parseIdentityBlocks(markdown);
  const section = bindingFromAnchor(markdown, identity, resolved('section', anchorForSection(projection, 1)));
  assert.equal(section.rootBlockId, ids[blocks.findIndex(block => block.type === 'heading' && markdown.slice(block.sourceStart, block.sourceEnd) === '## 二')]);
  const list = bindingFromAnchor(markdown, identity, resolved('list', anchorForListItem(projection, projection.listItems[1].path)));
  assert.equal(list.rootBlockId, ids[blocks.findIndex((block, index) => block.type === 'listItem' && index > blocks.findIndex(item => item.type === 'listItem'))]);
  const paragraphIndex = projection.blocks.findIndex(block => block.type === 'paragraph');
  const blocksBinding = bindingFromAnchor(markdown, identity, resolved('blocks', anchorForBlock(projection, paragraphIndex)));
  assert.deepEqual([blocksBinding.startBlockId, blocksBinding.endBlockId], [ids[1], ids[1]]);
  assert.equal(validBinding(markdown, identity, { ...section, rootBlockId: ids[1] }), false);
});

test('未定位、身份表无效或偏移越界时不产生可用绑定', () => {
  const anchor = anchorFromProjectedRange(projection, ...projectedRange('加粗'));
  assert.equal(bindingFromAnchor(markdown, identity, { scopeType: 'selection', anchorStatus: 'needsReview', anchor }), null);
  assert.equal(bindingFromAnchor(markdown + 'x', identity, resolved('selection', anchor)), null);
  const binding = bindingFromAnchor(markdown, identity, resolved('selection', anchor));
  assert.equal(validBinding(markdown, identity, { ...binding, end: { ...binding.end, offset: 999 } }), false);
  assert.equal(validBinding(markdown, identity, { ...binding, start: { ...binding.start, blockId: 'missing' } }), false);
});

test('编辑器上报的绑定与当前正文一致时采用，否则拒绝', () => {
  const reported = { id: 'a', scopeType: 'selection', present: true, start: { blockId: ids[1], offset: 3 }, end: { blockId: ids[1], offset: 7 } };
  const binding = bindingFromEditor(markdown, identity, reported);
  assert.equal(binding.contentHash, calculateContentHash(markdown));
  assert.equal(markdown.slice(...Object.values(bindingSourceRange(markdown, identity, binding))), '加粗重点');
  assert.equal(bindingFromEditor(markdown, identity, { ...reported, end: { blockId: ids[1], offset: 3 } }), null);
  assert.equal(bindingFromEditor(markdown, identity, { ...reported, present: false }), null);
  assert.equal(bindingFromEditor(markdown, identity, { id: 'b', scopeType: 'section', present: true, rootBlockId: ids[0] }).rootBlockId, ids[0]);
});

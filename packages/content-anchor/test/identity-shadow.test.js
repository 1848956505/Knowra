import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptIdentityIds, alignIdentityBlocks, calculateContentHash, compareIdentityShadow, identityFromEditorState, identityQuoteHash, parseIdentityBlocks, validIdentityEditorState, validIdentityTable } from '../src/index.js';

const markdown = '# 标题\n\n第一段重点内容\n\n<br />\n\n* 甲\n  * 乙\n\n$$\nx^2\n$$\n\n## 二\n\n尾段\n';
const editorBlocks = [
  { id: 'h1', type: 'heading', empty: false },
  { id: 'p1', type: 'paragraph', empty: false },
  { id: 'empty', type: 'paragraph', empty: true },
  { id: 'li1', type: 'listItem', empty: false },
  { id: 'p-li1', type: 'paragraph', empty: false },
  { id: 'li2', type: 'listItem', empty: false },
  { id: 'p-li2', type: 'paragraph', empty: false },
  { id: 'm1', type: 'math', empty: false },
  { id: 'h2', type: 'heading', empty: false },
  { id: 'p2', type: 'paragraph', empty: false },
  { id: 'trailing', type: 'paragraph', empty: true }
];
const state = (annotations) => ({ formatVersion: 2, targetContentHash: calculateContentHash(markdown), blocks: editorBlocks, annotations });
const offset = (text) => markdown.indexOf(text);
const resolved = (id, scopeType, start, end, extra = {}) => ({
  id, scopeType, lifecycleStatus: 'active', anchorStatus: 'resolved', anchor: { sourceStart: start, sourceEnd: end }, ...extra
});

test('块解析与编辑器使用相同的公式规则，表格内部不展开', () => {
  const types = parseIdentityBlocks('$$\na\n$$\n\n| a |\n| - |\n| 1 |\n').map(block => block.type);
  assert.deepEqual(types, ['math', 'table']);
});

test('对齐：<br /> 对应空段落，无对应空段落跳过，类型不一致时报告位置', () => {
  const blocks = parseIdentityBlocks(markdown);
  const result = alignIdentityBlocks(blocks, editorBlocks);
  assert.equal(result.aligned, true);
  assert.equal(result.pairs.get(2), 2);
  assert.equal(result.pairs.has(10), false);
  const broken = alignIdentityBlocks(blocks, [{ id: 'x', type: 'code', empty: false }]);
  assert.deepEqual(broken, { aligned: false, editorIndex: 0, markdownIndex: 0, editorType: 'code', markdownType: 'heading' });
});

test('两边一致时没有分歧：选区、块、章节、列表', () => {
  const start = offset('重点'), end = start + 2;
  const result = compareIdentityShadow({
    markdown,
    editorState: state([
      { id: 's', scopeType: 'selection', present: true, startBlockId: 'p1', endBlockId: 'p1', quoteHash: identityQuoteHash('重点') },
      { id: 'b', scopeType: 'blocks', present: true, startBlockId: 'p1', endBlockId: 'p1' },
      { id: 'sec', scopeType: 'section', present: true, rootBlockId: 'h2' },
      { id: 'l', scopeType: 'list', present: true, rootBlockId: 'li1' }
    ]),
    annotations: [
      resolved('s', 'selection', start, end, { quoteText: '重点' }),
      resolved('b', 'blocks', offset('第一段'), offset('第一段') + 7),
      resolved('sec', 'section', offset('二'), markdown.length),
      resolved('l', 'list', offset('甲'), offset('乙') + 1)
    ]
  });
  assert.deepEqual(result, { status: 'compared', compared: 4, divergences: [] });
});

test('记录各类分歧，且不包含正文', () => {
  const result = compareIdentityShadow({
    markdown,
    editorState: state([
      { id: 'lost', scopeType: 'selection', present: true, startBlockId: 'p1', endBlockId: 'p1', quoteHash: identityQuoteHash('重点') },
      { id: 'gone', scopeType: 'selection', present: false },
      { id: 'moved', scopeType: 'section', present: true, rootBlockId: 'h1' },
      { id: 'quote', scopeType: 'selection', present: true, startBlockId: 'p1', endBlockId: 'p1', quoteHash: identityQuoteHash('第一') },
      { id: 'review', scopeType: 'list', present: true, rootBlockId: 'li1' },
      { id: 'archived', scopeType: 'selection', present: true, startBlockId: 'p1', endBlockId: 'p1' }
    ]),
    annotations: [
      { id: 'lost', scopeType: 'selection', lifecycleStatus: 'active', anchorStatus: 'missing', anchorReason: 'sourceDeleted' },
      resolved('gone', 'selection', offset('重点'), offset('重点') + 2),
      resolved('moved', 'section', offset('二'), markdown.length),
      resolved('quote', 'selection', offset('重点'), offset('重点') + 2, { quoteText: '重点' }),
      { id: 'review', scopeType: 'list', lifecycleStatus: 'active', anchorStatus: 'needsReview', anchorReason: 'boundaryChanged' },
      { ...resolved('archived', 'selection', 0, 1), lifecycleStatus: 'deleted' }
    ]
  });
  assert.equal(result.compared, 5);
  assert.deepEqual(result.divergences.map(item => [item.annotationId, item.kind]), [
    ['lost', 'trackedLost'], ['gone', 'identityLost'], ['moved', 'blockMismatch'], ['quote', 'quoteMismatch'], ['review', 'oldNeedsReview']
  ]);
  assert.equal(JSON.stringify(result).includes('重点'), false);
});

test('摘录哈希忽略空白与原子占位符差异', () => {
  assert.equal(identityQuoteHash('甲 乙\n丙\uFFFC'), identityQuoteHash('甲乙丙'));
  assert.notEqual(identityQuoteHash('甲乙'), identityQuoteHash('甲丙'));
});

test('状态不合法、正文不一致或无法对齐时整体跳过', () => {
  assert.equal(compareIdentityShadow({ markdown, editorState: { formatVersion: 1 }, annotations: [] }).status, 'invalidState');
  assert.equal(compareIdentityShadow({ markdown: markdown + 'x', editorState: state([]), annotations: [] }).status, 'stateMismatch');
  const misaligned = { ...state([]), blocks: [{ id: 'x', type: 'code', empty: false }] };
  assert.equal(compareIdentityShadow({ markdown, editorState: misaligned, annotations: [] }).status, 'alignFailed');
  assert.equal(validIdentityEditorState({ ...state([]), blocks: [{ id: 'x'.repeat(200), type: 'paragraph', empty: false }] }), false);
  assert.equal(validIdentityEditorState({ ...state([{ id: 'a', scopeType: 'other', present: true }]) }), false);
  assert.equal(validIdentityEditorState({ ...state([{ id: 'a', scopeType: 'selection', present: true, quoteHash: 'x'.repeat(200) }]) }), false);
});

test('身份表：由编辑器快照生成，按 Markdown 块顺序记录 ID，跳过无对应的空段落', () => {
  const identity = identityFromEditorState(markdown, state([]));
  assert.equal(identity.contentHash, calculateContentHash(markdown));
  assert.deepEqual(identity.blocks.map(block => block.id), ['h1', 'p1', 'empty', 'li1', 'p-li1', 'li2', 'p-li2', 'm1', 'h2', 'p2']);
  assert.deepEqual(identity.blocks.map(block => block.type), parseIdentityBlocks(markdown).map(block => block.type));
  assert.equal(validIdentityTable(markdown, identity), true);
});

test('身份表：正文不一致、无法对齐或 ID 重复时不生成；内容或类型被篡改时视为无效', () => {
  assert.equal(identityFromEditorState(markdown + 'x', state([])), null);
  assert.equal(identityFromEditorState(markdown, { ...state([]), blocks: editorBlocks.slice(1) }), null);
  assert.equal(identityFromEditorState(markdown, { ...state([]), blocks: editorBlocks.map(block => ({ ...block, id: 'same' })) }), null);
  const identity = identityFromEditorState(markdown, state([]));
  assert.equal(validIdentityTable(markdown + 'x', identity), false);
  assert.equal(validIdentityTable(markdown, { ...identity, blocks: identity.blocks.slice(1) }), false);
  assert.equal(validIdentityTable(markdown, { ...identity, blocks: identity.blocks.map((block, index) => index === 0 ? { ...block, type: 'paragraph' } : block) }), false);
  assert.equal(validIdentityTable(markdown, { ...identity, blocks: identity.blocks.map(block => ({ ...block, id: 'same' })) }), false);
  assert.equal(validIdentityTable(markdown, null), false);
});

test('身份表：重新加载时把 ID 交回编辑器块；新编辑器的空段落仍可跳过', () => {
  const identity = identityFromEditorState(markdown, state([]));
  const reloaded = editorBlocks.map(block => ({ ...block, id: `new-${block.id}` }));
  const adopted = adoptIdentityIds(markdown, identity, reloaded);
  assert.deepEqual([...adopted.entries()], [[0, 'h1'], [1, 'p1'], [2, 'empty'], [3, 'li1'], [4, 'p-li1'], [5, 'li2'], [6, 'p-li2'], [7, 'm1'], [8, 'h2'], [9, 'p2']]);
  assert.equal(adoptIdentityIds(markdown + 'x', identity, reloaded), null);
  assert.equal(adoptIdentityIds(markdown, identity, reloaded.slice(2)), null);
});

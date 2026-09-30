import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMarkdown, anchorForListItem, resolveAnchor, listTracking, updateStructure,
  followListAnchorChanges, sourceEdits, sourceEdit } from '../src/index.js';

function fixture(before, path = '0.0') {
  const projection = projectMarkdown(before);
  const structure = updateStructure('', before);
  const anchor = anchorForListItem(projection, path);
  anchor.tracking = listTracking(projection, anchor, structure);
  return { anchor, structure, follow: (after, edits = sourceEdits(before, after)) =>
    followListAnchorChanges(before, after, anchor, edits, { before: structure }) };
}

test('列表项锚点覆盖完整混合子树，不包含相邻项或截断子项标题', () => {
  const raw = '1. 父 **中文😀**\n\n   续接段落\n\n   - 子 `code`\n     - 孙项\n\n   ## 项内标题\n\n   > 引用\n\n2. 相邻';
  const p = projectMarkdown(raw);
  assert.deepEqual(p.listItems.map(item => item.depth), [0, 1, 2, 0]);
  const a = anchorForListItem(p, '0.0');
  assert.equal(a.list.childCount, 2);
  assert.match(a.quoteText, /孙项/); assert.match(a.quoteText, /项内标题/);
  assert.doesNotMatch(a.quoteText, /相邻/);
  assert.equal(resolveAnchor(raw, a).status, 'resolved');
  assert.equal(resolveAnchor(raw, { ...a, sourceEnd: raw.length }).status, 'needsReview');
  assert.throws(() => anchorForListItem(projectMarkdown('- [ ] 任务'), '0.0'));
  assert.throws(() => anchorForListItem(projectMarkdown('- '), '0.0'));
});

test('列表根末尾/开头新增文字、添加新子项和删除子项自动跟随', () => {
  const before = '- 父项\n  - 子项\n- 相邻';
  const f = fixture(before);
  for (const after of [before.replace('父项', '父项补充'), before.replace('父项','新增父项'),
    before.replace('子项','子项\n  - 新子项'), before.replace('  - 子项\n','')]) {
    const outcome = f.follow(after);
    assert.equal(outcome.status, 'resolved', JSON.stringify(outcome));
    assert.doesNotMatch(outcome.quoteText, /相邻/);
    assert.equal(outcome.anchor.tracking.rootId, f.anchor.tracking.rootId);
  }
});

test('添加同级项、编号和列表类型变更不换绑重复项', () => {
  const f = fixture('1. 重复\n2. 重复', '0.1');
  for (const after of ['1. 新项\n2. 重复\n3. 重复', '7. 重复\n8. 重复', '- 重复\n- 重复']) {
    const outcome = f.follow(after);
    assert.equal(outcome.status, 'resolved', JSON.stringify(outcome));
    assert.equal(outcome.anchor.tracking.rootId, f.anchor.tracking.rootId);
    assert.equal(outcome.anchor.structurePath, after.includes('新项') ? '0.2' : '0.1');
  }
});

test('已有同级项归入、根缩进与子项移出生成完整新子树候选', () => {
  const f = fixture('- 父项\n- 相邻');
  const absorbed = f.follow('- 父项\n  - 相邻');
  assert.equal(absorbed.status, 'needsReview'); assert.match(absorbed.quoteText, /相邻/);
  const root = fixture('- 父项\n- 相邻', '0.1').follow('- 父项\n  - 相邻');
  assert.equal(root.status, 'needsReview'); assert.equal(root.anchor.list.depth, 1);
  const out = fixture('- 父项\n  - 子项\n- 相邻').follow('- 父项\n- 子项\n- 相邻');
  assert.equal(out.status, 'needsReview'); assert.equal(out.quoteText, '父项');
});

test('删除根不标记下一项，同文重输不复活；退出列表待确认', () => {
  const before = '- 父项\n- 相邻';
  const f = fixture(before);
  assert.equal(f.follow('- 相邻').status, 'missing');
  const removed = '- 相邻';
  assert.equal(f.follow(before, [sourceEdit(before, removed), sourceEdit(removed, before)]).status, 'missing');
  assert.equal(f.follow('父项\n\n- 相邻').status, 'needsReview');
});

test('空根项保留结构、重新输入跟随；复制不继承', () => {
  const f = fixture('- 父项');
  const empty = f.follow('- ');
  assert.equal(empty.status, 'resolved'); assert.equal(empty.anchor.tracking.empty, true);
  assert.equal(resolveAnchor('- ', empty.anchor).status, 'resolved');
  const after = '- 新内容';
  const updated = followListAnchorChanges('- ', after, empty.anchor, sourceEdits('- ', after),
    { before: updateStructure('- 父项', '- ', f.structure, sourceEdits('- 父项', '- ')) });
  assert.equal(updated.status, 'resolved'); assert.equal(updated.quoteText, '新内容');
  const copied = f.follow('- 父项\n- 父项');
  assert.equal(copied.status, 'resolved'); assert.equal(copied.anchor.structurePath, '0.0');
});

test('列表待确认状态在继续编辑期间保持', () => {
  const f = fixture('- 父项\n- 相邻');
  const before = '- 父项\n  - 相邻';
  const proposal = f.follow(before);
  const anchor = { ...f.anchor, pending: { anchor: proposal.anchor, reason: 'boundaryChanged' } };
  const structure = updateStructure('- 父项\n- 相邻', before, f.structure, sourceEdits('- 父项\n- 相邻', before));
  const result = followListAnchorChanges(before, before.replace('父项','父项补充'), anchor,
    sourceEdits(before,before.replace('父项','父项补充')), { before: structure });
  assert.equal(result.status,'needsReview'); assert.match(result.quoteText,/补充/);
});

test('完整子树凭一次性剪切粘贴日志移动，同文副本不继承身份', () => {
  const before = '- 父项\n  - 子项\n- 相邻', f = fixture(before);
  const after = '- 相邻\n- 父项\n  - 子项';
  const edits = [{ from: 0, to: 12, text: '', moveKind: 'cut', moveId: 'one-shot' },
    { from: 4, to: 4, text: '\n- 父项\n  - 子项', moveKind: 'paste', moveId: 'one-shot' }];
  const moved = f.follow(after, edits);
  assert.equal(moved.status, 'resolved'); assert.equal(moved.anchor.tracking.rootId, f.anchor.tracking.rootId);
  assert.equal(moved.anchor.structurePath, '0.1');
  const structure = updateStructure(before, after, f.structure, edits);
  assert.equal(structure.cuts.length, 0);
  const repeated = after + '\n- 父项\n  - 子项';
  const copied = followListAnchorChanges(after, repeated, moved.anchor,
    [{ from: after.length, to: after.length, text: '\n- 父项\n  - 子项', moveKind: 'paste', moveId: 'one-shot' }], { before: structure });
  assert.equal(copied.anchor.structurePath, '0.1');
  const repeatedStructure = updateStructure(after, repeated, structure, sourceEdits(after, repeated));
  assert.notEqual(repeatedStructure.nodes.find(node => node.path === '0.2').id, f.anchor.tracking.rootId);
});

test('JSONB 对象键顺序不影响校验；拆分丢失原成员时保持列表范围待确认', () => {
  const f = fixture('- 父项\n  - 子项\n- 相邻');
  const reordered = { ...f.anchor, segments: f.anchor.segments.map(({ start, end, path }) => ({ end, path, start })) };
  assert.equal(resolveAnchor('- 父项\n  - 子项\n- 相邻', reordered).status, 'resolved');
  const split = f.follow('- 父\n- 项\n  - 子项\n- 相邻');
  assert.equal(split.status, 'needsReview'); assert.equal(split.anchor.scopeType, 'list');
});

test('列表完整子树包含链接、代码、表格、引用和图片原子位置', () => {
  const raw = '- 父 [链接](https://example.test)😀\n\n  续段\n\n  | A | B |\n  | --- | --- |\n  | 值 | 表格 |\n\n  > 引用\n\n  ```js\n  const x = 1\n  ```\n\n  ![图片](attachment:fixture)\n\n  - 子项\n- 相邻';
  const anchor = anchorForListItem(projectMarkdown(raw), '0.0');
  assert.match(anchor.quoteText, /链接/); assert.match(anchor.quoteText, /表格/);
  assert.match(anchor.quoteText, /const x = 1/); assert.match(anchor.quoteText, /\uFFFC/);
  assert.doesNotMatch(anchor.quoteText, /相邻/);
  assert.equal(resolveAnchor(raw, anchor).status, 'resolved');
});

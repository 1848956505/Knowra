import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anchorForSection,
  anchorFromProjectedRange,
  followSectionAnchor,
  projectMarkdown,
  relocateAnchor,
  resolveAnchor
} from '../src/index.js';

test('复杂 Markdown 的可见选区往返到版本化源区间', () => {
  const markdown = '# 标题\n\n这是 **重要** 的 [中文链接](https://example.com)，含 emoji 😀。\n\n- 列表 `code`\n- 第二项\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 值 | \*转义\* |';
  const projection = projectMarkdown(markdown);
  const start = projection.text.indexOf('重要');
  const end = projection.text.indexOf('emoji') + 'emoji 😀'.length;
  const anchor = anchorFromProjectedRange(projection, start, end);

  assert.equal(anchor.quoteText, '重要 的 中文链接，含 emoji 😀');
  assert.ok(anchor.segments.length >= 3);
  assert.equal(resolveAnchor(markdown, anchor).status, 'resolved');
});

test('标题范围包含下级标题，到下一同级标题前结束', () => {
  const markdown = '# H1\n\n## A\n正文\n\n### A.1\n更多\n\n## B\n不属于 A';
  const projection = projectMarkdown(markdown);
  const section = anchorForSection(projection, 1);
  assert.match(section.quoteText, /A[\s\S]*A\.1[\s\S]*更多/);
  assert.doesNotMatch(section.quoteText, /不属于 A/);
  assert.equal(resolveAnchor(markdown, section).status, 'resolved');
});

test('标题范围自动纳入本节新段落，但结束边界变化需要确认', () => {
  const original = '## A\n\n旧段落\n\n## B\n\n不属于 A';
  const anchor = anchorForSection(projectMarkdown(original), 0);
  const appended = followSectionAnchor('## A\n\n旧段落\n\n新段落\n\n## B\n\n不属于 A', anchor);
  assert.equal(appended.status, 'resolved');
  assert.match(appended.anchor.quoteText, /新段落/);
  assert.doesNotMatch(appended.anchor.quoteText, /不属于 A/);

  const changedBoundary = followSectionAnchor('## A\n\n旧段落\n\n# B\n\n不属于 A', anchor);
  assert.equal(changedBoundary.status, 'needsReview');
  assert.equal(changedBoundary.reason, 'boundaryChanged');
});

test('重复文本不能任取首个匹配', () => {
  const original = '## A\n因此\n\n## B\n因此';
  const projection = projectMarkdown(original);
  const start = projection.text.lastIndexOf('因此');
  const anchor = anchorFromProjectedRange(projection, start, start + 2);
  const changed = '前言\n\n## X\n因此\n\n## Y\n因此';
  const result = relocateAnchor(changed, { ...anchor, prefixText: '', suffixText: '' });
  assert.equal(result.status, 'needsReview');
  assert.equal(result.reason, 'ambiguousMatch');
  assert.equal(result.candidates.length, 2);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIdentityBlocks } from '../src/index.js';

test('块源码详情是可选兼容扩展，默认身份投影不带正文与容器边界', () => {
  const markdown = '> ## 标题\n>\n> ```\n> \n> xy\n> ```\n\n外部';
  const original = parseIdentityBlocks(markdown);
  const detailed = parseIdentityBlocks(markdown, { includeContent: true });
  assert.deepEqual(
    detailed.map(({ value: _value, level: _level, containerEnd: _containerEnd, ...block }) => block),
    original
  );
  const heading = detailed.find(block => block.type === 'heading');
  const quote = detailed.find(block => block.type === 'blockquote');
  assert.equal(heading.level, 2);
  assert.equal(heading.containerEnd, quote.sourceEnd);
  assert.equal(detailed.find(block => block.type === 'code').value, '\nxy');
});

test('源码详情与编辑器共用公式语法，公式内 Setext 文字不是标题', () => {
  const blocks = parseIdentityBlocks('## 标题\n\n$$\nx\n=\ny\n$$', { includeContent: true });
  assert.deepEqual(
    blocks.map(block => block.type),
    ['heading', 'math']
  );
  assert.equal(blocks[1].value, 'x\n=\ny');
});

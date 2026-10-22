import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectMarkdown } from '../src/index.js';

const project = markdown => projectMarkdown(markdown, { includeMath: true });

test('可选公式投影完整保留公式字面内容，不生成伪标题或代码块', () => {
  const markdown = '## 真标题\n\n$$\nx\n=\n# literal\n```\n$$\n\n末段';
  const projection = project(markdown);
  assert.equal(projection.text, '真标题\nx\n=\n# literal\n```\n末段');
  assert.deepEqual(
    projection.headings.map(item => item.title),
    ['真标题']
  );
  for (const unit of projection.units.filter(
    item => item.path === projection.blocks.find(block => block.type === 'math').path
  )) {
    assert.equal(markdown.slice(unit.sourceStart, unit.sourceEnd), unit.text);
  }
});

test('可选公式投影仍解析整篇引用定义，代码源码偏移跳过引用容器前缀', () => {
  const markdown =
    'A **bold** [link][ref] $x=y$ &amp;.\n\n> ```\n> \n> > code\n> \n> ```\n\n[ref]: https://example.com';
  const projection = project(markdown);
  assert.equal(projection.text, 'A bold link x=y &.\n\n> code\n');
  const code = projection.blocks.find(block => block.type === 'code');
  for (const unit of projection.units.filter(item => item.path === code.path))
    assert.equal(markdown.slice(unit.sourceStart, unit.sourceEnd), unit.text);
});

test('可选公式投影遵守编辑器单美元守卫，不吞掉金额与无效公式定界符', () => {
  const markdown = '金额 $5 and $10，文字 $ x $，紧接数字 $x$10，正常 $x=y$。';
  assert.equal(project(markdown).text, '金额 $5 and $10，文字 $ x $，紧接数字 $x$10，正常 x=y。');
});

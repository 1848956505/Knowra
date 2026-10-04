import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteLinkUrl, extractNoteLinks, parseNoteLinkUrl, resolveNoteLinkOccurrence } from '../src/index.js';

const url = createNoteLinkUrl('目标/笔记', 'occ-first');
test('整篇目标 ID 与引用位置身份独立，重开保留显示文字及每个同源位置', () => {
  const second = createNoteLinkUrl('目标/笔记', 'occ-second');
  const markdown = `前段 [原名字](${url}) 后文。\n\n另一处 [原名字](${second}) 末尾。`;
  const parsed = extractNoteLinks(markdown);
  assert.deepEqual(parsed.targetIds, ['目标/笔记']);
  assert.equal(parsed.occurrences.length, 2);
  assert.deepEqual(parsed.occurrences.map(item => item.label), ['原名字', '原名字']);
  assert.match(parsed.occurrences[1].context, /另一处/);
  assert.equal(resolveNoteLinkOccurrence('新增段落。\n\n' + markdown, parsed.occurrences[1]).occurrenceId, 'occ-second');
  assert.deepEqual(parseNoteLinkUrl(url), { targetNoteId: '目标/笔记', occurrenceId: 'occ-first' });
});
test('代码、图片、HTML、外链和标题文字不产生引用；历史 ID 保留', () => {
  const parsed = extractNoteLinks(`\`[代码](${url})\`\n\n~~~md\n[代码](${url})\n[[code-id]]\n~~~\n\n![图](${url})\n\n[外链](https://example.test) [[legacy-id]]\n\n目标/笔记`);
  assert.deepEqual(parsed.targetIds, ['legacy-id']);
  assert.equal(parsed.occurrences.length, 0);
});
test('位置移除、重复 ID、目标改变均不任意按相同文字定位', () => {
  const markdown = `[相同](${url})\n\n[相同](${url})`;
  const locator = parseNoteLinkUrl(url);
  assert.equal(resolveNoteLinkOccurrence(markdown, locator), null);
  assert.equal(resolveNoteLinkOccurrence('相同', locator), null);
  assert.equal(resolveNoteLinkOccurrence(`[相同](${createNoteLinkUrl('other', 'occ-first')})`, locator), null);
  assert.equal(parseNoteLinkUrl('knowra://note/%0A#ref=occ-first'), null);
  assert.equal(parseNoteLinkUrl('knowra://note/%E0%A4#ref=occ-first'), null);
});
test('格式化文字和引用式 Markdown 仍按真实 AST 链接位置提取', () => {
  const parsed = extractNoteLinks(`[**粗体**与原名][n]\n\n[n]: ${url}\n`);
  assert.equal(parsed.occurrences[0].label, '粗体与原名');
  assert.equal(parsed.occurrences[0].sourceStart, 0);
  assert.equal(parsed.occurrences[0].sourceEnd, 14);
});
test('同段上下文只显示可见文字，不带相邻链接协议或位置ID', () => {
  const result = extractNoteLinks(`[甲](${url}) 前文 [乙](${createNoteLinkUrl('另一目标', 'occ-second')}) 后文`);
  assert.match(result.occurrences[1].context, /甲.*前文.*乙.*后文/);
  assert.ok(!result.occurrences.some(item => /knowra:|occ-first|occ-second/.test(item.context)));
});

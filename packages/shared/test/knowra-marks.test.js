import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatKnowraMarker,
  insertKnowraMarks,
  knowraCheck,
  parseKnowraMarks,
  sameKnowraText,
  stripKnowraMarks,
  stripKnowraMarksMapped
} from '../src/knowra-marks.js';

const ids = marks => marks.map(mark => mark.id);

for (const [name, wrap] of [
  ['四空格缩进代码', text => `    ${text}\n`],
  ['引用内围栏代码', text => `> \`\`\`html\n> ${text}\n> \`\`\`\n`],
  ['跨行 backtick code span', text => `前文 \`\`开头\n${text}\n结束\`\` 后文\n`],
  ['行内公式', text => `公式 $\\text{${text}}$`]
]) test(`${name}：字面标记不派生、不剥除，删除标签属于正文变化`, () => {
  const literal = '<mark data-k="a">literal</mark> <!--k b s=blocks--><!--k- c-->';
  const source = wrap(literal);
  assert.deepEqual(parseKnowraMarks(source), { format: 1, inline: [], blocks: [], problems: [] });
  assert.equal(stripKnowraMarks(source), source);
  assert.equal(sameKnowraText(source, wrap('literal')), false);
});

test('跨行 code span：行内默认、snap 和块级插入均不能把真实标记写成字面文字', () => {
  const source = '前 `开头\nliteral\n结尾` 后';
  const from = source.indexOf('literal');
  for (const snap of [false, true]) {
    assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from, to: from + 7 }], snap }), /protected|one text line/);
    assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: from + 1, to: from + 2 }], snap }), /protected|one text line/);
    const rejected = [];
    assert.equal(insertKnowraMarks(source, { inline: [{ id: 'a', from, to: from + 7 }], snap, onInvalid: item => rejected.push(item.id) }), source);
    assert.deepEqual(rejected, ['a']);
  }
  for (const line of [0, 1]) assert.throws(() => insertKnowraMarks(source, { blocks: [{ id: 'b', line, attrs: { s: 'blocks' } }] }), /protected/);
  const valid = insertKnowraMarks(source, { blocks: [{ id: 'b', line: 2, attrs: { s: 'blocks' } }] });
  assert.equal(parseKnowraMarks(valid).blocks.length, 1);
  assert.equal(stripKnowraMarks(valid), source);
});

test('跨行 code span 与公式块各自封闭：内部定界符不能屏蔽后续真实标记', () => {
  for (const prefix of ['前 `开头\nx $$\n结束` 后\n', '$$\n`字面\n$$\n']) {
    const source = `${prefix}<mark data-k="real">正文</mark>\n结尾\``;
    assert.deepEqual(ids(parseKnowraMarks(source).inline), ['real']);
    assert.equal(stripKnowraMarks(source), `${prefix}正文\n结尾\``);
  }
});

test('公式内容中的围栏样式文字不会吞掉公式后的真实重点', () => {
  for (const literal of ['~~~x', '```js', '`字面']) {
    const prefix = `$$\n${literal}\n<mark data-k="fake">字面</mark>\n$$\n\n`;
    const source = `${prefix}<mark data-k="real">正文</mark>`;
    assert.deepEqual(ids(parseKnowraMarks(source).inline), ['real']);
    assert.equal(stripKnowraMarks(source), `${prefix}正文`);
    assert.equal(sameKnowraText(source, `${prefix}正文`), true);
  }
});

test('行内公式只允许整体标记，single-dollar guard 退回的金额/文本仍可局部标记', () => {
  const source = '公式 $x+y$';
  const from = source.indexOf('x');
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from, to: from + 1 }] }), /protected/);
  const marked = insertKnowraMarks(source, { inline: [{ id: 'a', from, to: from + 1 }], snap: true });
  assert.equal(marked, '公式 <mark data-k="a">$x+y$</mark>');
  assert.equal(stripKnowraMarks(marked), source);
  for (const plain of ['$ x$', '$x $', '$x$2', '$5 和 $6']) {
    const start = plain.search(/[x5]/);
    const markedPlain = insertKnowraMarks(plain, { inline: [{ id: 'b', from: start, to: start + 1 }] });
    assert.deepEqual(ids(parseKnowraMarks(markedPlain).inline), ['b']);
    assert.equal(stripKnowraMarks(markedPlain), plain);
  }
});

test('行内重点：解析属性、角色与源码区间，去除后逐字还原', () => {
  const markdown = '勾股定理指出 <mark data-k="a1b2" data-t="key cloze" data-l="core">两边平方和</mark>。';
  const { inline, blocks, problems } = parseKnowraMarks(markdown);
  assert.deepEqual(problems, []);
  assert.deepEqual(blocks, []);
  assert.equal(inline.length, 1);
  assert.deepEqual(inline[0].attrs, { k: 'a1b2', t: 'key cloze', l: 'core' });
  assert.deepEqual(inline[0].roles, ['key', 'cloze']);
  assert.equal(markdown.slice(inline[0].contentStart, inline[0].contentEnd), '两边平方和');
  assert.equal(stripKnowraMarks(markdown), '勾股定理指出 两边平方和。');
});

test('重叠范围切段嵌套：每个 <mark> 只带一个 ID，HTML 不交叉', () => {
  const source = 'abcdefghijklmnop';
  const marked = insertKnowraMarks(source, { inline: [{ id: 'a', from: 0, to: 10 }, { id: 'b', from: 5, to: 15 }] });
  assert.equal(marked, '<mark data-k="a">abcde<mark data-k="b">fghij</mark></mark><mark data-k="b">klmno</mark>p');
  assert.deepEqual(ids(parseKnowraMarks(marked).inline), ['a', 'b', 'b']);
  assert.equal(stripKnowraMarks(marked), source);
});

test('普通 <mark>、==高亮== 与用户注释不是 Knowra 标记', () => {
  const markdown = '<mark>普通</mark> ==高亮== <!--k 备注--> <!-- 说明 <mark data-k="x">不算</mark> --> <mark data-k="ok"><mark>内层</mark></mark>';
  const { inline, blocks, problems } = parseKnowraMarks(markdown);
  assert.deepEqual(ids(inline), ['ok']);
  assert.deepEqual(blocks, []);
  assert.deepEqual(problems, []);
  assert.equal(stripKnowraMarks(markdown), '<mark>普通</mark> ==高亮== <!--k 备注--> <!-- 说明 <mark data-k="x">不算</mark> --> <mark>内层</mark>');
});

test('代码块、公式块、行内代码与跨行注释中的文字是字面内容', () => {
  const markdown = [
    '```html',
    '<mark data-k="code">字面</mark> <!--k c1 s=section-->',
    '```',
    '$$',
    '<mark data-k="math">x</mark>',
    '$$',
    '`<mark data-k="span">x</mark>` 行内代码',
    '<!-- 多行注释开始',
    '<mark data-k="cmt">x</mark>',
    '结束 -->'
  ].join('\n');
  const parsed = parseKnowraMarks(markdown);
  assert.deepEqual(parsed.inline, []);
  assert.deepEqual(parsed.blocks, []);
  assert.equal(stripKnowraMarks(markdown), markdown);
});

test('未闭合或跨行的标记记为问题，并原样保留', () => {
  const markdown = '<mark data-k="open">没有闭合\n下一行</mark>';
  const parsed = parseKnowraMarks(markdown);
  assert.deepEqual(parsed.inline, []);
  assert.deepEqual(parsed.problems.map(item => [item.reason, item.id]), [['unclosedMark', 'open']]);
  assert.equal(stripKnowraMarks(markdown), markdown);
});

test('块级标记写在首行末尾，避开硬换行、结尾空白与标题闭合符号', () => {
  const source = ['## 牛顿第二定律 ##', '', '- 动量守恒\\', '  续行', '', '一段正文  ', '第二行'].join('\n');
  const marked = insertKnowraMarks(source, { blocks: [
    { id: 'c3d4', line: 0, attrs: { s: 'section', l: 'core' } },
    { id: 'e5f6', line: 2, attrs: { s: 'list' } },
    { id: 'g7h8', line: 5, attrs: { s: 'blocks' } },
    { id: 'x1', line: 0, exclude: true }
  ] });
  assert.equal(marked, [
    '## 牛顿第二定律 <!--k c3d4 s=section l=core--><!--k- x1--> ##',
    '',
    '- 动量守恒 <!--k e5f6 s=list-->\\',
    '  续行',
    '',
    '一段正文 <!--k g7h8 s=blocks-->  ',
    '第二行'
  ].join('\n'));
  const { blocks, problems } = parseKnowraMarks(marked);
  assert.deepEqual(problems, []);
  assert.deepEqual(blocks.map(item => [item.id, item.placement, item.targetLine, item.exclude]), [
    ['c3d4', 'lineEnd', 0, false], ['x1', 'lineEnd', 0, true], ['e5f6', 'lineEnd', 2, false], ['g7h8', 'lineEnd', 5, false]
  ]);
  assert.deepEqual(blocks[0].attrs, { s: 'section', l: 'core' });
  assert.equal(stripKnowraMarks(marked), source);
});

test('代码块、公式块、表格、HTML 块和分隔线的标记写在前一行', () => {
  const source = ['问题', '', '```js', 'x = 1', '```', '', '$$', 'a', '$$', '', '| a |', '| - |', '', '<div>x</div>', '', '---'].join('\n');
  const marked = insertKnowraMarks(source, { blocks: [2, 6, 10, 13, 15].map((line, index) => ({ id: `b${index}`, line, attrs: { s: 'blocks' } })) });
  const { blocks, problems } = parseKnowraMarks(marked);
  assert.deepEqual(problems, []);
  assert.ok(blocks.every(item => item.placement === 'lineBefore'));
  const lines = marked.split('\n');
  assert.deepEqual(blocks.map(item => lines[item.targetLine]), ['```js', '$$', '| a |', '<div>x</div>', '---']);
  assert.equal(stripKnowraMarks(marked), source);
});

test('代码块内范围：r 与 h 定位，代码在编辑器外被改后视为未落位', () => {
  const source = ['1、如何创建全 0 张量？', '', '- 列表里的代码', '  ```python', '  z = torch.zeros_like(y)', '  w = 2', '  ```'].join('\n');
  const marked = insertKnowraMarks(source, {
    inline: [{ id: 'q1', from: 0, to: source.indexOf('？') + 1, attrs: { t: 'key' } }],
    blocks: [{ id: 'q1', line: 3, attrs: { t: 'key' }, code: { from: 4, to: 23 } }]
  });
  const parsed = parseKnowraMarks(marked);
  assert.deepEqual(parsed.problems, []);
  const [code] = parsed.blocks;
  assert.equal(code.placement, 'lineBefore');
  assert.deepEqual(code.code, { from: 4, to: 23, text: 'torch.zeros_like(y)', resolved: true });
  assert.equal(code.attrs.h, knowraCheck('torch.zeros_like(y)'));
  assert.ok(marked.includes('  <!--k q1 t=key s=code r=4-23 h='));
  assert.equal(stripKnowraMarks(marked), source);

  const edited = marked.replace('zeros_like', 'ones_like');
  const stale = parseKnowraMarks(edited);
  assert.deepEqual(stale.problems.map(item => item.reason), ['codeCheckMismatch']);
  assert.equal(stale.blocks[0].code.resolved, false);
  assert.equal(stripKnowraMarks(edited), source.replace('zeros_like', 'ones_like'));

  const orphan = parseKnowraMarks('<!--k z s=code r=0-1 h=0-->\n正文');
  assert.deepEqual(orphan.problems.map(item => item.reason), ['codeTargetMissing']);
});

test('不认识的角色和属性原样保留，属性值做编码', () => {
  const markdown = `<mark data-k="n1" data-t="key future" data-h="提示 &quot;引号&quot;" data-zz="1">x</mark> ${formatKnowraMarker('n2', { s: 'blocks', h: '空 格=等号', zz: '新' })}`;
  const { inline, blocks, problems } = parseKnowraMarks(markdown);
  assert.deepEqual(problems, []);
  assert.deepEqual(inline[0].attrs, { k: 'n1', t: 'key future', h: '提示 "引号"', zz: '1' });
  assert.deepEqual(inline[0].roles, ['key', 'future']);
  assert.deepEqual(blocks[0].attrs, { s: 'blocks', h: '空 格=等号', zz: '新' });
  assert.equal(stripKnowraMarks(markdown), 'x');
});

test('非法块级标记计为问题，不会被去除', () => {
  const markdown = '段落 <!--k bad!id s=blocks--> <!--k ok s=blocks broken-->';
  const parsed = parseKnowraMarks(markdown);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(parsed.problems.map(item => item.reason), ['invalidMarker', 'invalidMarker']);
  assert.equal(stripKnowraMarks(markdown), markdown);
});

test('插入时拒绝跨行、拆开受保护语法或在已有标记上叠加', () => {
  const source = '**粗体** `code` &amp; [链接](u)\n下一行';
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: 0, to: source.length }] }), /one text line/);
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: 1, to: 4 }] }), /protected/);
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: 8, to: 10 }] }), /protected/);
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: 15, to: 17 }] }), /protected/);
  assert.equal(stripKnowraMarks(insertKnowraMarks(source, { inline: [{ id: 'a', from: 2, to: 4 }] })), source);
  assert.throws(() => insertKnowraMarks('<mark data-k="x">a</mark>', { inline: [] }), /already contains/);
  assert.throws(() => insertKnowraMarks('a', { blocks: [{ id: 'a', line: 0 }] }), /at least one attribute/);
});

test('随机文档：插入后去除总能逐字还原，解析能找回全部 ID', () => {
  let seed = 20261018;
  const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const pick = list => list[Math.floor(random() * list.length)];
  const words = ['重点', 'alpha', '张量', '`x<y`', '**粗**', '$a^2$', '&lt;', '\\*', '==亮==', '<mark>旧</mark>', '<!-- 注 -->', '链接[a](b)'];
  const blockKinds = [
    () => `## ${pick(words)} ${pick(words)}`,
    () => `- ${pick(words)} ${pick(words)}`,
    () => `${pick(words)}${pick(words)} ${pick(words)}`,
    () => `\`\`\`\n${pick(words)}\n<mark data-k="no">x</mark>\n\`\`\``,
    () => '| a | b |\n| - | - |',
    () => '---'
  ];
  for (let round = 0; round < 300; round += 1) {
    const source = Array.from({ length: 2 + Math.floor(random() * 6) }, () => pick(blockKinds)()).join('\n\n');
    const lines = source.split('\n');
    const starts = [];
    lines.reduce((offset, line) => { starts.push(offset); return offset + line.length + 1; }, 0);
    const inline = [];
    const blocks = [];
    let counter = 0;
    let fenced = false;
    lines.forEach((line, index) => {
      if (line === '```') { fenced = !fenced; return; }
      if (fenced || !line.trim() || /^\|/.test(line) || line === '---') return;
      if (random() < 0.5) blocks.push({ id: `b${counter += 1}`, line: index, attrs: { s: 'blocks', l: pick(['core', '']) } });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const from = starts[index] + Math.floor(random() * line.length);
        const to = from + 1 + Math.floor(random() * (starts[index] + line.length - from));
        const candidate = { id: `i${counter += 1}`, from, to: Math.min(to, starts[index] + line.length), attrs: { t: pick(['key', 'cloze', 'key cloze']) } };
        try { insertKnowraMarks(source, { inline: [candidate] }); inline.push(candidate); } catch { /* 边界落在受保护语法里，换一个 */ }
      }
    });
    const marked = insertKnowraMarks(source, { inline, blocks });
    assert.equal(stripKnowraMarks(marked), source, `第 ${round} 轮还原失败\n${marked}`);
    const parsed = parseKnowraMarks(marked);
    assert.deepEqual(parsed.problems, [], `第 ${round} 轮出现问题\n${marked}`);
    assert.deepEqual(new Set(ids(parsed.inline)), new Set(inline.map(item => item.id)));
    assert.deepEqual(new Set(ids(parsed.blocks)), new Set(blocks.map(item => item.id)));
  }
});

test('去除时返回偏移换算：标记内部的偏移归到标记起点', () => {
  const markdown = '甲<mark data-k="a">乙</mark>丙 <!--k b s=blocks-->';
  const { markdown: clean, toClean } = stripKnowraMarksMapped(markdown);
  assert.equal(clean, '甲乙丙');
  assert.equal(toClean(markdown.indexOf('乙')), 1);
  assert.equal(toClean(markdown.indexOf('丙')), 2);
  assert.equal(toClean(markdown.indexOf('data-k')), 1);
  assert.equal(toClean(markdown.length), 3);
});

test('snap：边界落在转义、行内代码或实体中间时向外吸附', () => {
  const source = '需要1 \\* 1卷积，`zeros_like` 和 &amp;';
  const star = source.indexOf('*');
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: star, to: star + 3 }] }), /protected/);
  const marked = insertKnowraMarks(source, { snap: true, inline: [
    { id: 'a', from: star, to: star + 3 },
    { id: 'b', from: source.indexOf('zeros'), to: source.indexOf('_like') },
    { id: 'c', from: source.indexOf('amp'), to: source.length }
  ] });
  assert.equal(marked, '需要1 <mark data-k="a">\\* 1</mark>卷积，<mark data-k="b">`zeros_like`</mark> 和 <mark data-k="c">&amp;</mark>');
  assert.equal(stripKnowraMarks(marked), source);
});

test('onInvalid：跳过不合法的单条标记并报告，其余照常插入', () => {
  const skipped = [];
  const marked = insertKnowraMarks('甲乙\n丙', {
    inline: [{ id: 'ok', from: 0, to: 1 }, { id: 'bad', from: 0, to: 4 }],
    blocks: [{ id: 'blk', line: 9, attrs: { s: 'blocks' } }],
    onInvalid: (item, message) => skipped.push([item.id, message])
  });
  assert.equal(marked, '<mark data-k="ok">甲</mark>乙\n丙');
  assert.deepEqual(skipped.map(([id]) => id), ['bad', 'blk']);
});

test('只有反斜杠加 ASCII 标点才是转义：\\eta 中间可以作为边界', () => {
  const source = '(\\eta) 与 \\*';
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'a', from: 2, to: 5 }] }), /literal backslash/);
  const snapped = insertKnowraMarks(source, { snap: true, inline: [{ id: 'a', from: 2, to: 5 }, { id: 'b', from: 0, to: 2 }] });
  assert.equal(snapped, '<mark data-k="b">(</mark><mark data-k="a">\\eta</mark>) 与 \\*');
  assert.deepEqual(parseKnowraMarks(snapped).problems, []);
  assert.equal(insertKnowraMarks(source, { snap: true, inline: [{ id: 'c', from: 1, to: 2 }] }), '(<mark data-k="c">\\e</mark>ta) 与 \\*');
  assert.equal(stripKnowraMarks(snapped), source);
  assert.throws(() => insertKnowraMarks(source, { inline: [{ id: 'b', from: source.length - 1, to: source.length }] }), /protected/);
});

test('sameKnowraText：只差标记视为相同正文', () => {
  assert.equal(sameKnowraText('甲乙', '<mark data-k="a">甲</mark>乙'), true);
  assert.equal(sameKnowraText('## 标题', '## 标题 <!--k s1 s=section-->'), true);
  assert.equal(sameKnowraText('甲乙', '甲乙丙'), false);
  assert.equal(sameKnowraText('<mark>普通</mark>', '普通'), false);
  assert.equal(sameKnowraText(null, ''), false);
});

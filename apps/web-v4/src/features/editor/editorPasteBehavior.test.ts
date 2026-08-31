import { Fragment, Schema, Slice } from '@milkdown/kit/prose/model';
import { describe, expect, it } from 'vitest';
import {
  findUnsupportedPasteSources,
  looksLikeMarkdown,
  removeSpuriousEmptyCodeBlocks,
  shouldPreferPlainMarkdown,
  stripPastedInlineStyles
} from './editorPasteBehavior';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    code_block: { content: 'text*', group: 'block', code: true },
    text: { group: 'inline' }
  }
});

describe('editorPasteBehavior', () => {
  it('recognizes Markdown blocks and respects VS Code clipboard metadata', () => {
    expect(looksLikeMarkdown('## 标题\n\n- 列表')).toBe(true);
    expect(looksLikeMarkdown('普通句子')).toBe(false);
    expect(shouldPreferPlainMarkdown({ text: '# 标题', html: '<h1>标题</h1>', vscodeData: '' })).toBe(true);
    expect(shouldPreferPlainMarkdown({ text: '# 标题', html: '', vscodeData: '{"mode":"markdown"}' })).toBe(false);
  });

  it('removes foreign inline presentation while preserving semantic markup', () => {
    expect(stripPastedInlineStyles('<p style="color:red"><strong style="font-size:30px">重点</strong></p>'))
      .toBe('<p><strong>重点</strong></p>');
  });

  it('removes only a spurious empty code block before a populated code block', () => {
    const slice = new Slice(Fragment.fromArray([
      schema.nodes.code_block.create(),
      schema.nodes.code_block.create(null, schema.text('const value = 1')),
      schema.nodes.paragraph.create(null, schema.text('正文'))
    ]), 0, 0);
    const repaired = removeSpuriousEmptyCodeBlocks(slice);
    expect(repaired.content.childCount).toBe(2);
    expect(repaired.content.firstChild?.textContent).toBe('const value = 1');
  });

  it('detects insecure image sources without blocking ordinary links', () => {
    expect(findUnsupportedPasteSources('<img src="http://unsafe.test/a.png">', '![b](http://unsafe.test/b.png)'))
      .toEqual(['http://unsafe.test/a.png', 'http://unsafe.test/b.png']);
    expect(findUnsupportedPasteSources('<img src=http://unsafe.test/unquoted.png>', ''))
      .toEqual(['http://unsafe.test/unquoted.png']);
    expect(findUnsupportedPasteSources('', '[site](http://example.test)')).toEqual([]);
  });
});

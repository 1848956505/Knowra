import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { parseKnowraMarks } from '@study-accelerator/shared/knowra-marks';
import type { Annotation } from '@study-accelerator/web-core';
import {
  createInlineAnnotation, excludeBlockFromInlineAnnotation, inlineAnnotationRanges, reanchorInlineAnnotation, removeInlineAnnotation,
  restoreInlineAnnotation, selectInlineAnnotation, setInlineAnnotationRows, updateInlineAnnotation
} from './editorInlineAnnotations';
import { createKnowraTestEditor } from './annotationInlineMigration.testing';

const destroyers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const destroy of destroyers.splice(0)) await destroy(); });
async function open(markdown: string) {
  const editor = await createKnowraTestEditor(markdown);
  destroyers.push(editor.destroy);
  return editor;
}
const textPos = (view: EditorView, needle: string) => {
  let found = -1;
  view.state.doc.descendants((node, position) => {
    if (found < 0 && node.isText && node.text!.includes(needle)) found = position + node.text!.indexOf(needle);
  });
  return found;
};
const select = (view: EditorView, needle: string, length = needle.length) => {
  const from = textPos(view, needle);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + length)));
};
const row = (markId: string, id = `annotation-k-${markId}`) => ({ id, schemaVersion: 3, lifecycleStatus: 'active', anchor: { format: 'knowra-inline', markId } }) as unknown as Annotation;

const NOTE = '## 第一章\n\n勾股定理指出两边平方和等于斜边平方。\n\n- 动量守恒\n- 能量守恒\n\n### 子节\n\n子节正文\n\n## 第二章\n\n尾段\n';

describe('内联重点：编辑器操作只改正文标记', () => {
  it('四种范围的新建都写成正确的正文标记，重要程度写入属性', async () => {
    const { view, serialize } = await open(NOTE);
    select(view, '两边平方和');
    const sel = createInlineAnnotation(view, 'selection', 'core');
    select(view, '动量', 0);
    const list = createInlineAnnotation(view, 'list');
    select(view, '第一章', 0);
    const section = createInlineAnnotation(view, 'section', 'important');
    select(view, '尾段', 0);
    const block = createInlineAnnotation(view, 'blocks');
    const parsed = parseKnowraMarks(serialize(view.state.doc));
    expect(parsed.problems).toEqual([]);
    expect(parsed.inline.find(item => item.id === sel)?.attrs).toMatchObject({ t: 'key', l: 'core' });
    expect(parsed.blocks.find(item => item.id === list)?.attrs.s).toBe('list');
    expect(parsed.blocks.find(item => item.id === section)?.attrs).toMatchObject({ s: 'section', l: 'important' });
    expect(parsed.blocks.find(item => item.id === block)?.attrs.s).toBe('blocks');
    const ranges = inlineAnnotationRanges(view.state.doc).byId;
    expect(view.state.doc.textBetween(ranges[section][0].from, ranges[section].at(-1)!.to)).toContain('子节正文');
    expect(view.state.doc.textBetween(ranges[section][0].from, ranges[section].at(-1)!.to)).not.toContain('第二章');
  });

  it('没有选中文字、不在章节或普通列表项内时给出与旧入口一致的提示', async () => {
    const { view } = await open('正文\n\n- [ ] 任务');
    select(view, '正文', 0);
    expect(() => createInlineAnnotation(view, 'selection')).toThrow('请先在正文中选中要标记的内容');
    expect(() => createInlineAnnotation(view, 'section')).toThrow('请先将光标放在标题章节内');
    select(view, '任务', 0);
    expect(() => createInlineAnnotation(view, 'list')).toThrow('请先将光标放在非空的普通列表项内');
  });

  it('取消后可以撤销；正文变了就拒绝撤销', async () => {
    const { view, serialize } = await open(NOTE);
    select(view, '两边平方和');
    const markId = createInlineAnnotation(view, 'selection');
    const marked = serialize(view.state.doc);
    const snapshot = removeInlineAnnotation(view, markId);
    expect(parseKnowraMarks(serialize(view.state.doc)).inline).toEqual([]);
    restoreInlineAnnotation(view, snapshot);
    expect(serialize(view.state.doc)).toBe(marked);
    const again = removeInlineAnnotation(view, markId);
    view.dispatch(view.state.tr.insertText('改', textPos(view, '两边')));
    expect(() => restoreInlineAnnotation(view, again)).toThrow('正文已经变化');
  });

  it('改类型和重要程度：所有片段与块属性一起改；重新选择保留 ID 与属性', async () => {
    const { view, serialize } = await open(NOTE);
    select(view, '两边平方和');
    const markId = createInlineAnnotation(view, 'selection', 'important');
    updateInlineAnnotation(view, markId, { kind: 'pitfall', importance: 'core' });
    expect(parseKnowraMarks(serialize(view.state.doc)).inline[0].attrs).toMatchObject({ c: 'pitfall', l: 'core' });
    select(view, '斜边平方');
    reanchorInlineAnnotation(view, markId, 'selection');
    const [moved] = parseKnowraMarks(serialize(view.state.doc)).inline;
    expect(moved).toMatchObject({ id: markId, attrs: { c: 'pitfall', l: 'core' } });
    expect(view.state.doc.textBetween(inlineAnnotationRanges(view.state.doc).byId[markId][0].from, inlineAnnotationRanges(view.state.doc).byId[markId][0].to)).toBe('斜边平方');
  });

  it('排除当前块：只能排除章节范围内的块，排除后显示范围不含该块', async () => {
    const { view, serialize } = await open(NOTE);
    select(view, '第一章', 0);
    const markId = createInlineAnnotation(view, 'section');
    select(view, '尾段', 0);
    expect(() => excludeBlockFromInlineAnnotation(view, markId)).toThrow('当前内容块不在这条重点范围内');
    select(view, '子节正文', 0);
    excludeBlockFromInlineAnnotation(view, markId);
    expect(parseKnowraMarks(serialize(view.state.doc)).blocks.some(item => item.id === markId && item.exclude)).toBe(true);
    const text = inlineAnnotationRanges(view.state.doc).byId[markId].map(range => view.state.doc.textBetween(range.from, range.to)).join('|');
    expect(text).not.toContain('子节正文');
  });

  it('显示：装饰带 v3 行 ID 与重要程度，可被点击选中；定位选中第一段', async () => {
    const { view } = await open(NOTE);
    select(view, '两边平方和');
    const markId = createInlineAnnotation(view, 'selection', 'core');
    setInlineAnnotationRows(view, [row(markId)], null);
    const element = view.dom.querySelector<HTMLElement>('[data-annotation-ids]')!;
    expect(element.className).toContain('editor-annotation');
    expect(element.dataset.importance).toBe('core');
    expect(JSON.parse(element.dataset.annotationIds!)).toEqual([`annotation-k-${markId}`]);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(selectInlineAnnotation(view, markId)).toBe(true);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('两边平方和');
  });
});

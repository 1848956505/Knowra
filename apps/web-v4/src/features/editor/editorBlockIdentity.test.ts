import { afterEach, describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { getHTML, getMarkdown } from '@milkdown/kit/utils';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { joinBackward, splitBlock } from '@milkdown/kit/prose/commands';
import { splitListItem } from '@milkdown/kit/prose/schema-list';
import { undo } from '@milkdown/kit/prose/history';
import type { Annotation } from '@study-accelerator/web-core';
import { createCodeBlockBehavior } from './editorCodeBlock';
import { commonmarkPreset } from './editorHardbreakMarks';
import { mathBlockSchema } from './editorMathBlock';
import { mathInlineSchema } from './editorMathInline';
import { mathInlineGuardRemark, mathRemark } from './editorMathMarkdown';
import { annotationPluginKey, createAnnotationHighlightBehavior, getAnnotationSelection, setEditorAnnotations } from './editorAnnotations';
import {
  ANNOTATION_MARK, IDENTITY_META, annotationMarkSchema, annotationSerializerGuard, configureBlockIdentitySchema,
  createBlockIdentityBehavior, stripIdentityFromHtml, withoutIdentity
} from './editorBlockIdentity';
import { annotationShadowBehavior, buildIdentityEditorState, captureIdentitySnapshot, getAnnotationShadowReport, annotationShadowKey } from './annotationShadow';
import { compareIdentityShadow } from '@study-accelerator/content-anchor';

const globals = globalThis as Record<string, unknown>;
globals.ClipboardEvent ??= class extends Event {
  clipboardData: DataTransfer | null;
  constructor(type: string, init?: { clipboardData?: DataTransfer }) { super(type); this.clipboardData = init?.clipboardData ?? null; }
};

interface TestEditor { editor: Editor; view: EditorView; markdown: () => string; destroy: () => Promise<void> }
const editors: TestEditor[] = [];
afterEach(async () => { for (const editor of editors.splice(0)) await editor.destroy(); });

async function createEditor(markdown: string, options: { onChange?: (markdown: string) => void } = {}): Promise<TestEditor> {
  const root = document.createElement('div');
  document.body.append(root);
  const editor = await Editor.make()
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, markdown); })
    .use(commonmarkPreset).use(createCodeBlockBehavior(() => {})).use(gfm)
    .use(mathRemark).use(mathInlineGuardRemark).use(mathBlockSchema).use(mathInlineSchema)
    .use(clipboard)
    .use(createAnnotationHighlightBehavior(() => {}, options.onChange))
    .use(annotationMarkSchema)
    .use(createBlockIdentityBehavior(state => new Set(annotationPluginKey.getState(state)?.annotations.map(item => item.id) ?? [])))
    .use(annotationShadowBehavior)
    .use(annotationSerializerGuard)
    .use(history)
    .config(configureBlockIdentitySchema)
    .create();
  const view = editor.ctx.get(editorViewCtx);
  view.dispatch(view.state.tr.setMeta(IDENTITY_META, true).setMeta('addToHistory', false));
  const result: TestEditor = {
    editor, view,
    markdown: () => editor.action(getMarkdown()),
    destroy: async () => { await editor.destroy(); root.remove(); }
  };
  editors.push(result);
  return result;
}

const blockIds = (doc: ProseNode, type?: string) => {
  const ids: string[] = [];
  doc.descendants(node => { if (node.attrs.blockId && (!type || node.type.name === type)) ids.push(node.attrs.blockId); });
  return ids;
};
const marksIn = (doc: ProseNode, from: number, to: number) => {
  const ids = new Set<string>();
  doc.nodesBetween(from, to, node => { node.marks.forEach(mark => { if (mark.type.name === ANNOTATION_MARK) ids.add(mark.attrs.id); }); });
  return [...ids];
};
const addMark = (e: TestEditor, from: number, to: number, id: string) => {
  e.view.dispatch(e.view.state.tr.addMark(from, to, e.view.state.schema.marks[ANNOTATION_MARK].create({ id }))
    .setMeta(IDENTITY_META, true).setMeta('addToHistory', false));
};
const cursor = (e: TestEditor, position: number) => e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, position)));
const child = (doc: ProseNode, index: number) => {
  let from = 0;
  for (let i = 0; i < index; i++) from += doc.child(i).nodeSize;
  return { from, to: from + doc.child(index).nodeSize, start: from + 1, end: from + doc.child(index).nodeSize - 1 };
};
const clipboardHtml = (e: TestEditor, from: number, to: number) => e.view.serializeForClipboard(e.view.state.doc.slice(from, to)).dom.innerHTML;

describe('块身份', () => {
  it('加载后所有块都有唯一 ID，Markdown 不变', async () => {
    const markdown = '# 标题\n\n段落 **加粗**\n\n* 甲\n  * 乙\n\n```js\ncode\n```\n\n$$\nx^2\n$$\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> 引用\n\n***\n';
    const e = await createEditor(markdown);
    const types: string[] = [];
    e.view.state.doc.descendants(node => { if (node.attrs.blockId) types.push(node.type.name); });
    expect(types).toEqual(expect.arrayContaining(['heading', 'paragraph', 'list_item', 'code_block', 'math_block', 'table', 'blockquote', 'hr']));
    const ids = blockIds(e.view.state.doc);
    expect(new Set(ids).size).toBe(ids.length);
    expect(e.markdown()).toBe(markdown);
  });

  it('拆分段落时前半保留 ID，合并时保留前一段 ID', async () => {
    const e = await createEditor('甲乙丙丁\n');
    const [original] = blockIds(e.view.state.doc, 'paragraph');
    cursor(e, 3);
    splitBlock(e.view.state, e.view.dispatch);
    const split = blockIds(e.view.state.doc, 'paragraph');
    expect(split[0]).toBe(original);
    expect(split[1]).not.toBe(original);
    cursor(e, child(e.view.state.doc, 1).start);
    joinBackward(e.view.state, e.view.dispatch);
    expect(blockIds(e.view.state.doc, 'paragraph')).toEqual([original]);
  });

  it('拆分列表项时前半保留 ID', async () => {
    const e = await createEditor('* 甲乙\n* 丙\n');
    const before = blockIds(e.view.state.doc, 'list_item');
    let position = 0;
    e.view.state.doc.descendants((node, pos) => { if (!position && node.isText && node.text?.startsWith('甲乙')) position = pos + 1; });
    cursor(e, position);
    splitListItem(e.view.state.schema.nodes.list_item)(e.view.state, e.view.dispatch);
    const after = blockIds(e.view.state.doc, 'list_item');
    expect(after).toHaveLength(3);
    expect([after[0], after[2]]).toEqual(before);
  });

  it('删除后撤销恢复块 ID 与重点 mark', async () => {
    const e = await createEditor('甲\n\n乙丙\n\n丁\n');
    const ids = blockIds(e.view.state.doc, 'paragraph');
    const second = child(e.view.state.doc, 1);
    addMark(e, second.start, second.end, 'a1');
    e.view.dispatch(e.view.state.tr.delete(second.from, second.to));
    undo(e.view.state, e.view.dispatch);
    expect(blockIds(e.view.state.doc, 'paragraph')).toEqual(ids);
    const restored = child(e.view.state.doc, 1);
    expect(marksIn(e.view.state.doc, restored.start, restored.end)).toEqual(['a1']);
  });

  it('复制粘贴：副本获得新 ID 并剥离重点 mark', async () => {
    const e = await createEditor('甲乙\n\n丙\n');
    setEditorAnnotations(e.editor, [{ id: 'a1' } as Annotation], null);
    const ids = blockIds(e.view.state.doc, 'paragraph');
    const first = child(e.view.state.doc, 0);
    addMark(e, first.start, first.end, 'a1');
    cursor(e, e.view.state.doc.content.size - 1);
    e.view.pasteHTML(clipboardHtml(e, first.from, first.to));
    const after = blockIds(e.view.state.doc, 'paragraph');
    expect(after[0]).toBe(ids[0]);
    expect(new Set(after).size).toBe(3);
    const pastedIndex = after.findIndex(id => !ids.includes(id));
    const pasted = child(e.view.state.doc, pastedIndex);
    expect(e.view.state.doc.child(pastedIndex).textContent).toBe('甲乙');
    expect(marksIn(e.view.state.doc, pasted.start, pasted.end)).toEqual([]);
    expect(marksIn(e.view.state.doc, first.start, first.end)).toEqual(['a1']);
  });

  it('剪切后粘贴：保留块 ID 与本笔记的重点 mark', async () => {
    const e = await createEditor('甲乙\n\n丙\n\n丁\n');
    setEditorAnnotations(e.editor, [{ id: 'a1' } as Annotation], null);
    const ids = blockIds(e.view.state.doc, 'paragraph');
    const first = child(e.view.state.doc, 0);
    addMark(e, first.start, first.end, 'a1');
    const html = clipboardHtml(e, first.from, first.to);
    e.view.dispatch(e.view.state.tr.delete(first.from, first.to).setMeta('uiEvent', 'cut'));
    cursor(e, e.view.state.doc.content.size - 1);
    e.view.pasteHTML(html);
    const after = blockIds(e.view.state.doc, 'paragraph');
    expect([...after].sort()).toEqual([...ids].sort());
    const moved = child(e.view.state.doc, after.indexOf(ids[0]));
    expect(marksIn(e.view.state.doc, moved.start, moved.end)).toEqual(['a1']);
  });

  it('从其他笔记粘贴：剥离不属于本笔记的重点 mark', async () => {
    const source = await createEditor('外部\n');
    const range = child(source.view.state.doc, 0);
    addMark(source, range.start, range.end, 'foreign');
    const target = await createEditor('本笔记\n');
    setEditorAnnotations(target.editor, [{ id: 'local' } as Annotation], null);
    cursor(target, target.view.state.doc.content.size - 1);
    target.view.pasteHTML(clipboardHtml(source, range.from, range.to));
    expect(marksIn(target.view.state.doc, 0, target.view.state.doc.content.size)).toEqual([]);
  });

  it('拖拽移动（同一事务插入并删除原位置）保留块 ID 与 mark', async () => {
    const e = await createEditor('甲乙\n\n丙\n\n丁\n');
    setEditorAnnotations(e.editor, [{ id: 'a1' } as Annotation], null);
    const ids = blockIds(e.view.state.doc, 'paragraph');
    const first = child(e.view.state.doc, 0);
    addMark(e, first.start, first.end, 'a1');
    const slice = e.view.state.doc.slice(first.from, first.to);
    e.view.dispatch(e.view.state.tr.insert(e.view.state.doc.content.size, slice.content).delete(first.from, first.to).setMeta('uiEvent', 'drop'));
    expect(blockIds(e.view.state.doc, 'paragraph')).toEqual([ids[1], ids[2], ids[0]]);
    const moved = child(e.view.state.doc, 2);
    expect(marksIn(e.view.state.doc, moved.start, moved.end)).toEqual(['a1']);
  });
});

describe('重点 mark', () => {
  it('重点内部输入继承 mark，边界处输入不扩展', async () => {
    const e = await createEditor('甲乙丙丁\n');
    addMark(e, 2, 4, 'a1');
    e.view.dispatch(e.view.state.tr.insertText('X', 3));
    expect(marksIn(e.view.state.doc, 3, 4)).toEqual(['a1']);
    e.view.dispatch(e.view.state.tr.insertText('Y', 5).setStoredMarks([]));
    expect(e.view.state.doc.textContent).toBe('甲乙X丙Y丁');
    expect(marksIn(e.view.state.doc, 5, 6)).toEqual([]);
  });

  it('所有序列化入口都不输出重点 mark：代码块、行内代码与软换行保持原样', async () => {
    const markdown = '前文 `"hello".upper()` 后文\n第二行\n\n```py\nX = x.reshape(3,4)\nprint(X)\n```\n';
    const e = await createEditor(markdown);
    const before = e.markdown();
    const code = child(e.view.state.doc, 1);
    addMark(e, 3, 9, 'inline');
    addMark(e, code.start + 2, code.start + 8, 'code');
    expect(e.markdown()).toBe(before);
    expect(e.editor.ctx.get(serializerCtx)(e.view.state.doc)).toBe(before);
    expect(stripIdentityFromHtml(e.editor.action(getHTML()))).not.toMatch(/data-block-id|data-knowra-annotation/);
  });

  it('跨软换行加重点不改写 Markdown', async () => {
    const e = await createEditor('第一行\n第二行\n');
    const before = e.markdown();
    addMark(e, 1, child(e.view.state.doc, 0).end, 'a1');
    expect(e.markdown()).toBe(before);
  });

  it('整段代码重点：末尾增行后继续覆盖整个代码块；部分代码重点不扩展', async () => {
    const e = await createEditor('```js\nconst a = 1;\n```\n\n```js\nlet b;\n```\n');
    const whole = child(e.view.state.doc, 0);
    addMark(e, whole.start, whole.end, 'whole');
    const partial = child(e.view.state.doc, 1);
    addMark(e, partial.start, partial.start + 3, 'partial');
    e.view.dispatch(e.view.state.tr.insertText('\nconst c = 2;', whole.end));
    const grown = child(e.view.state.doc, 0);
    expect(e.view.state.doc.child(0).textContent).toBe('const a = 1;\nconst c = 2;');
    expect(marksIn(e.view.state.doc, grown.end - 1, grown.end)).toEqual(['whole']);
    const after = child(e.view.state.doc, 1);
    e.view.dispatch(e.view.state.tr.insertText('X', after.end));
    expect(marksIn(e.view.state.doc, after.end, after.end + 1)).toEqual([]);
  });

  it('与重新解析的 Markdown 比较正文时忽略块 ID 与重点 mark', async () => {
    const markdown = '第一处文字\n\n第二处文字\n';
    const e = await createEditor(markdown);
    addMark(e, 1, 6, 'a1');
    const parsed = e.editor.ctx.get(parserCtx)(markdown) as ProseNode;
    expect(e.view.state.doc.eq(parsed)).toBe(false);
    expect(withoutIdentity(e.view.state.doc).eq(parsed)).toBe(true);
    expect(withoutIdentity(e.view.state.doc).eq(e.editor.ctx.get(parserCtx)('第一处文字\n\n第三处文字\n') as ProseNode)).toBe(false);
  });

  it('只改身份的事务不触发正文变更回调', async () => {
    const changes: string[] = [];
    const e = await createEditor('甲乙\n', { onChange: markdown => changes.push(markdown) });
    addMark(e, 1, 3, 'a1');
    e.view.dispatch(e.view.state.tr.setNodeAttribute(0, 'blockId', 'manual').setMeta(IDENTITY_META, true));
    expect(changes).toEqual([]);
    e.view.dispatch(e.view.state.tr.insertText('丙', 3));
    expect(changes).toEqual(['甲乙丙\n']);
  });
});

describe('影子比对', () => {
  async function annotate(markdown: string, scopeType: Annotation['scopeType'], select: (e: TestEditor) => void) {
    const e = await createEditor(markdown);
    select(e);
    const selection = getAnnotationSelection(e.editor, e.markdown(), scopeType)!;
    expect(selection).not.toBeNull();
    const annotation = { id: `${scopeType}-1`, scopeType, anchor: selection.anchor, quoteText: selection.quoteText, anchorStatus: 'resolved', lifecycleStatus: 'active' } as Annotation;
    setEditorAnnotations(e.editor, [annotation], null);
    return { e, annotation };
  }
  const tracked = (e: TestEditor, id: string) => annotationPluginKey.getState(e.view.state)!.ranges.get(id)!;

  it('选区重点：建立 mark 绑定，普通输入与撤销后两边一致', async () => {
    const { e, annotation } = await annotate('前文重点内容后文\n\n下一段\n', 'selection', editor => {
      editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 3, 7)));
    });
    const report = getAnnotationShadowReport(e.view.state);
    expect(report.bindings.get(annotation.id)).toEqual({ scopeType: 'selection' });
    expect(marksIn(e.view.state.doc, 3, 7)).toEqual([annotation.id]);
    e.view.dispatch(e.view.state.tr.insertText('新增', 1));
    e.view.dispatch(e.view.state.tr.insertText('中', 7));
    undo(e.view.state, e.view.dispatch);
    expect(tracked(e, annotation.id).missing).toBeFalsy();
    expect(getAnnotationShadowReport(e.view.state).divergences).toEqual([]);
  });

  it('块、章节、列表重点：绑定根块 ID，编辑后两边范围一致', async () => {
    const cases = [
      ['blocks', '甲\n\n乙丙\n\n丁\n', (e: TestEditor) => cursor(e, child(e.view.state.doc, 1).start + 1)],
      ['section', '## 一\n\n正文\n\n## 二\n\n其他\n', (e: TestEditor) => cursor(e, 1)],
      ['list', '* 甲\n  * 乙\n* 丙\n', (e: TestEditor) => cursor(e, 3)]
    ] as const;
    for (const [scopeType, markdown, select] of cases) {
      const { e, annotation } = await annotate(markdown, scopeType, select);
      const binding = getAnnotationShadowReport(e.view.state).bindings.get(annotation.id);
      expect(binding?.scopeType).toBe(scopeType);
      e.view.dispatch(e.view.state.tr.insert(0, e.view.state.schema.nodes.paragraph.create(null, e.view.state.schema.text('前置'))));
      const range = tracked(e, annotation.id);
      e.view.dispatch(e.view.state.tr.insertText('改', range.from + 1));
      expect(getAnnotationShadowReport(e.view.state).divergences, scopeType).toEqual([]);
    }
  });

  it('身份快照与服务端解析对齐，并在复杂文档上与旧链路结论一致', async () => {
    const markdown = '# 标题\n\n前文重点内容后文\n\n<br />\n\n* 甲\n  * 乙\n\n$$\nx^2\n$$\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\ncode\n```\n\n> 引用\n\n***\n\n## 二\n\n尾段\n';
    const e = await createEditor(markdown);
    const serialized = e.markdown();
    const annotations: Annotation[] = [];
    const select = (scopeType: Annotation['scopeType'], from: number, to = from) => {
      e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, from, to)));
      const selection = getAnnotationSelection(e.editor, serialized, scopeType)!;
      expect(selection, scopeType).not.toBeNull();
      annotations.push({ id: `${scopeType}-${annotations.length}`, scopeType, anchor: selection.anchor, quoteText: selection.quoteText,
        fromPosition: selection.fromPosition, toPosition: selection.toPosition, anchorStatus: 'resolved', lifecycleStatus: 'active' } as Annotation);
    };
    let paragraph = 0, heading2 = 0, listItem = 0;
    e.view.state.doc.descendants((node, pos) => {
      if (!paragraph && node.type.name === 'paragraph' && node.textContent.startsWith('前文')) paragraph = pos;
      if (node.type.name === 'heading' && node.textContent === '二') heading2 = pos;
      if (!listItem && node.type.name === 'list_item') listItem = pos;
    });
    select('selection', paragraph + 3, paragraph + 7);
    select('blocks', paragraph + 2);
    select('section', heading2 + 1);
    select('list', listItem + 2);
    setEditorAnnotations(e.editor, annotations, null);
    const bindings = annotationShadowKey.getState(e.view.state)!.bindings;
    expect(bindings.size).toBe(4);
    const state = buildIdentityEditorState(e.view.state.doc, bindings, serialized);
    expect(state.blocks.some(block => block.type === 'math')).toBe(true);
    expect(state.blocks.some(block => block.empty)).toBe(true);
    const result = compareIdentityShadow({ markdown: serialized, editorState: state, annotations: annotations as never });
    expect(result).toEqual({ status: 'compared', compared: 4, divergences: [] });
    expect(captureIdentitySnapshot(e.view.state, serialized)?.build()).toEqual(state);
  });

  it('拖拽移动选区重点：现有推算丢失、身份仍在时记录为 trackedLost', async () => {
    const { e, annotation } = await annotate('重点段落\n\n其他\n', 'selection', editor => {
      editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 1, 5)));
    });
    const first = child(e.view.state.doc, 0);
    const slice = e.view.state.doc.slice(first.from, first.to);
    e.view.dispatch(e.view.state.tr.insert(e.view.state.doc.content.size, slice.content).delete(first.from, first.to).setMeta('uiEvent', 'drop'));
    const divergence = getAnnotationShadowReport(e.view.state).divergences.at(-1);
    if (tracked(e, annotation.id).missing) expect(divergence).toMatchObject({ annotationId: annotation.id, kind: 'trackedLost' });
    else expect(divergence).toBeUndefined();
    expect(marksIn(e.view.state.doc, 0, e.view.state.doc.content.size)).toEqual([annotation.id]);
  });
});

import { it, expect } from 'vitest';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { getAnnotationSelection, resolveAnnotationRange } from './editorAnnotations';
import type { Annotation } from '@study-accelerator/web-core';
import { TextSelection } from '@milkdown/kit/prose/state';

const long = '### 合成流程\n\n总述\n\n' + Array.from({ length: 7 }, (_, i) =>
  '### 步骤' + i + '\n\n**说明**' + '说明'.repeat(70)
    + '\n\nX∈Rn×4\n\n> 引用\n\n* 甲\n* 乙\n\n```\n甲\n\n乙\n```\n\n***\n\n结论\n\n').join('');
const cases = [
  ['Markdown分隔空白', '### 标题\n\n\n\n正文\n\n\n', false],
  ['编辑器首尾空段', '### 标题\n\n<br />\n\n正文\n\n<br />', false],
  ['同级长流程', long, true],
  ['二级父标题长流程', '## 合成父标题\n\n' + long, false],
  ['纯长度对照', '## 长度对照\n\n' + '合成段落内容。'.repeat(1500), false],
  ['复杂结构短章节', '## 复杂结构\n\n正文\n\n* 一\n* 二\n\n> 引用\n\n***\n\n尾部', false]
] as const;

it.each(cases)('%s：创建和重开依标题身份定位，保留同级边界', async (_label, markdown, hasPeerBoundary) => {
  const root = document.createElement('div'); document.body.append(root);
  const editor = await Editor.make().config(ctx => {
    ctx.set(rootCtx, root); ctx.set(defaultValueCtx, markdown);
  }).use(commonmark).use(gfm).create();
  try {
    const view = editor.ctx.get(editorViewCtx);
    const serialized = editor.ctx.get(serializerCtx)(view.state.doc);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    const selected = getAnnotationSelection(editor, serialized, 'section');
    expect(selected).not.toBeNull();
    expect(resolveAnnotationRange(view.state.doc, selected! as Annotation)).toEqual({
      from: 1, to: hasPeerBoundary ? view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize : view.state.doc.content.size
    });
    if (hasPeerBoundary) expect(selected!.quoteText).toBe('合成流程\n总述');
    if (_label === '二级父标题长流程') expect(selected!.quoteText).toContain('步骤6');
    expect(getAnnotationSelection(editor, serialized.replace(/标题|合成流程|合成父标题|长度对照|复杂结构/, '不同标题'), 'section')).toBeNull();
  } finally { await editor.destroy(); root.remove(); }
});

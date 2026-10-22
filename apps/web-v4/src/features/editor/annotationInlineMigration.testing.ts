import { Editor, defaultValueCtx, editorViewCtx, parserCtx, remarkStringifyOptionsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { commonmarkPreset } from './editorHardbreakMarks';
import { noteLinkSchema } from './editorNoteLinks';
import { createCodeBlockBehavior } from './editorCodeBlock';
import { mathBlockSchema, mathBlockSerializerGuard } from './editorMathBlock';
import { mathInlineSchema } from './editorMathInline';
import { mathInlineGuardRemark, mathRemark } from './editorMathMarkdown';
import { highlightRemark, highlightSchema } from './editorHighlight';
import { internalLinkRemark, internalLinkSchema } from './editorInternalLink';
import { configureImageSize } from './editorImageBehavior';
import { annotationMarkSchema, annotationSerializerGuard, configureBlockIdentitySchema } from './editorBlockIdentity';
import { createKnowraMarksCodec, knowraMarkSchema, type KnowraMarkProblem } from './editorKnowraMarks';
import type { MigrationCodec } from './annotationInlineMigration';

/**
 * 测试与试运行用：与 MilkdownNoteEditor 相同的 schema、remark 与序列化包装（只取影响文档结构和 Markdown 的部分），
 * 包装成迁移计算需要的 MigrationCodec。只在 jsdom 等有 DOM 的环境里使用。
 */
export async function createMigrationCodec(): Promise<MigrationCodec & { destroy(): Promise<void> }> {
  const globals = globalThis as Record<string, unknown>;
  globals.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  const problems: KnowraMarkProblem[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  const editor = await Editor.make().config(ctx => {
    configureImageSize(ctx);
    ctx.set(rootCtx, root);
    ctx.set(defaultValueCtx, '');
    ctx.update(remarkStringifyOptionsCtx, options => {
      type MarkdownHandler = NonNullable<typeof options.handlers>['text'];
      const delimited = (open: string, close = open): MarkdownHandler => (node, _parent, state, info) => {
        const exit = state.enter('emphasis');
        const tracker = state.createTracker(info);
        let value = tracker.move(open);
        value += tracker.move(state.containerPhrasing(node, { before: value, after: close, ...tracker.current() }));
        value += tracker.move(close);
        exit();
        return value;
      };
      return { ...options, handlers: { ...options.handlers, highlight: delimited('=='), internalLink: delimited('[[', ']]') } };
    });
  }).use(commonmarkPreset).use(noteLinkSchema).use(createCodeBlockBehavior(() => {})).use(gfm)
    .use(mathRemark).use(mathInlineGuardRemark).use(mathBlockSchema).use(mathBlockSerializerGuard).use(mathInlineSchema)
    .use(highlightRemark).use(highlightSchema).use(internalLinkRemark).use(internalLinkSchema)
    .use(annotationMarkSchema).use(annotationSerializerGuard)
    .use(knowraMarkSchema).use(createKnowraMarksCodec(problem => problems.push(problem)))
    .config(configureBlockIdentitySchema)
    .create();
  void editor.ctx.get(editorViewCtx);
  return {
    parse: (markdown: string) => editor.ctx.get(parserCtx)(markdown) as ProseNode,
    serialize: (doc: ProseNode) => editor.ctx.get(serializerCtx)(doc),
    takeProblems: () => problems.splice(0),
    destroy: async () => { await editor.destroy(); root.remove(); }
  };
}

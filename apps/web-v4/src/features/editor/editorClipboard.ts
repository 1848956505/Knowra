import { type Editor, editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { Slice } from '@milkdown/kit/prose/model';
import { AllSelection } from '@milkdown/kit/prose/state';
import { readClipboardText, runDocumentCommand, writeClipboardText } from '../../browser/clipboard';
import type { EditorClipboardAction, EditorEditResult } from './editorCommands';

export async function runEditorClipboardAction(editor: Editor, action: EditorClipboardAction): Promise<EditorEditResult> {
  const view = editor.ctx.get(editorViewCtx);
  view.focus();

  if (action === 'select-all') {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    return { ok: true };
  }

  if (action === 'paste') return pasteClipboardText(editor);
  const { from, to } = view.state.selection;
  const selectedText = view.state.doc.textBetween(from, to, '\n\n');
  if (!selectedText) return { ok: false, reason: 'empty-selection' };
  if (await writeClipboardText(selectedText)) {
    if (action === 'cut') view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
    return { ok: true };
  }
  return runDocumentCommand(action) ? { ok: true } : { ok: false, reason: 'clipboard-denied' };
}

async function pasteClipboardText(editor: Editor): Promise<EditorEditResult> {
  const clipboard = await readClipboardText();
  if (!clipboard.ok) {
    return runDocumentCommand('paste') ? { ok: true } : { ok: false, reason: 'clipboard-denied' };
  }
  if (!clipboard.text) return { ok: false, reason: 'clipboard-empty' };
  const slice = parseMarkdownSlice(editor, clipboard.text);
  if (!slice) return { ok: false, reason: 'unsupported' };
  const view = editor.ctx.get(editorViewCtx);
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  view.focus();
  return { ok: true };
}

function parseMarkdownSlice(editor: Editor, markdown: string): Slice | null {
  const parsed = editor.ctx.get(parserCtx)(markdown);
  if (!parsed || typeof parsed === 'string') return null;
  let content = parsed.content;
  while (content.firstChild?.type.name === 'paragraph' && !content.firstChild.textContent.trim()) {
    content = content.cut(content.firstChild.nodeSize);
  }
  while (content.lastChild?.type.name === 'paragraph' && !content.lastChild.textContent.trim()) {
    content = content.cut(0, content.size - content.lastChild.nodeSize);
  }
  return new Slice(content, 0, 0);
}

import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core';
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand
} from '@milkdown/kit/preset/commonmark';
import { gfm, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { callCommand, getHTML, getMarkdown } from '@milkdown/kit/utils';
import { runHeadingCommand, runListCommand, runParagraphCommand } from './editorBlockCommands';
import type { EditorCommand, EditorCommandTarget } from './editorCommands';
import { runEditorClipboardAction } from './editorClipboard';
import {
  clearFindHighlights,
  findAndSelect,
  findHighlightBehavior,
  replaceAllMatches,
  replaceCurrentMatch
} from './editorFind';
import { resolveEditorShortcutCommand } from './editorShortcuts';
import { taskListClickBehavior, turnIntoTaskListCommand } from './editorTaskList';
import styles from './MilkdownNoteEditor.module.css';

export interface MilkdownNoteEditorProps {
  noteId: string;
  markdown: string;
  readOnly: boolean;
  onChange(markdown: string): void;
}

export const MilkdownNoteEditor = forwardRef<EditorCommandTarget, MilkdownNoteEditorProps>(
  function MilkdownNoteEditor({ noteId, markdown, readOnly, onChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const onChangeRef = useRef(onChange);
    const markdownRef = useRef(markdown);
    onChangeRef.current = onChange;
    markdownRef.current = markdown;

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor || readOnly) return;
      const command = resolveEditorShortcutCommand(event);
      if (!command) return;
      if (commandResolvers[command](editor)) event.preventDefault();
    };

    useImperativeHandle(ref, () => ({
      run(command) {
        const editor = editorRef.current;
        if (!editor || readOnly) return false;
        const resolver = commandResolvers[command];
        return resolver ? resolver(editor) : false;
      },
      async runEdit(action) {
        const editor = editorRef.current;
        if (!editor || readOnly && (action === 'cut' || action === 'paste')) {
          return { ok: false, reason: 'unsupported' };
        }
        return runEditorClipboardAction(editor, action);
      },
      find(query, currentIndex, direction) {
        const editor = editorRef.current;
        return editor ? findAndSelect(editor, query, currentIndex, direction) : { found: false, count: 0, index: -1 };
      },
      replaceCurrent(query, replacement, currentIndex) {
        const editor = editorRef.current;
        if (!editor || readOnly) return { found: false, count: 0, index: -1, replaced: 0 };
        return replaceCurrentMatch(editor, query, replacement, currentIndex);
      },
      replaceAll(query, replacement) {
        const editor = editorRef.current;
        if (!editor || readOnly) return { found: false, count: 0, index: -1, replaced: 0 };
        return replaceAllMatches(editor, query, replacement);
      },
      clearFind() {
        const editor = editorRef.current;
        if (editor) clearFindHighlights(editor);
      },
      focus() {
        hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
      },
      getMarkdown() {
        return editorRef.current?.action(getMarkdown()) ?? markdownRef.current;
      },
      getHtml() {
        return editorRef.current?.action(getHTML()) ?? '';
      }
    }), [readOnly]);

    useEffect(() => {
      const root = hostRef.current;
      if (!root) return;
      let cancelled = false;
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, markdownRef.current);
          ctx.set(editorViewOptionsCtx, {
            editable: () => !readOnly,
            attributes: {
              'aria-label': '笔记正文',
              'aria-multiline': 'true',
              'aria-keyshortcuts': 'Control+0 Control+1 Control+2 Control+3 Control+4 Control+Shift+X Meta+0 Meta+1 Meta+2 Meta+3 Meta+4 Meta+Shift+X',
              spellcheck: 'true'
            }
          });
          ctx.get(listenerCtx).markdownUpdated((_ctx, nextMarkdown) => {
            if (nextMarkdown === markdownRef.current) return;
            markdownRef.current = nextMarkdown;
            onChangeRef.current(nextMarkdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(clipboard)
        .use(findHighlightBehavior)
        .use(turnIntoTaskListCommand)
        .use(taskListClickBehavior)
        .use(history)
        .use(listener);
      void editor.create().then(() => {
        if (cancelled) return void editor.destroy();
        editorRef.current = editor;
      });
      return () => {
        cancelled = true;
        editorRef.current = null;
        void editor.destroy();
      };
    }, [noteId, readOnly]);

    return (
      <div
        ref={hostRef}
        className={styles.milkdownEditor}
        data-readonly={readOnly || undefined}
        onKeyDownCapture={handleKeyDown}
      />
    );
  }
);

const commandResolvers: Record<EditorCommand, (editor: Editor) => boolean> = {
  'heading-1': (editor) => runHeadingCommand(editor, 1),
  'heading-2': (editor) => runHeadingCommand(editor, 2),
  'heading-3': (editor) => runHeadingCommand(editor, 3),
  'heading-4': (editor) => runHeadingCommand(editor, 4),
  paragraph: runParagraphCommand,
  bold: (editor) => Boolean(editor.action(callCommand(toggleStrongCommand.key))),
  italic: (editor) => Boolean(editor.action(callCommand(toggleEmphasisCommand.key))),
  'inline-code': (editor) => Boolean(editor.action(callCommand(toggleInlineCodeCommand.key))),
  'bullet-list': (editor) => runListCommand(editor, 'bullet_list'),
  'ordered-list': (editor) => runListCommand(editor, 'ordered_list'),
  'task-list': (editor) => Boolean(editor.action(callCommand(turnIntoTaskListCommand.key))),
  blockquote: (editor) => Boolean(editor.action(callCommand(wrapInBlockquoteCommand.key))),
  'code-block': (editor) => Boolean(editor.action(callCommand(createCodeBlockCommand.key, ''))),
  'horizontal-rule': (editor) => Boolean(editor.action(callCommand(insertHrCommand.key))),
  table: (editor) => Boolean(editor.action(callCommand(insertTableCommand.key, { row: 3, col: 3 }))),
  undo: (editor) => Boolean(editor.action(callCommand(undoCommand.key))),
  redo: (editor) => Boolean(editor.action(callCommand(redoCommand.key)))
};

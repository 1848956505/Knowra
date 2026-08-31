import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import { defaultValueCtx, Editor, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx } from '@milkdown/kit/core';
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
import { gfm, insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { callCommand, getHTML, getMarkdown, replaceAll as replaceAllMarkdown } from '@milkdown/kit/utils';
import {
  insertParagraphNearSelection,
  runDeleteSelectionCommand,
  runHeadingCommand,
  runIndentCommand,
  runListCommand,
  runOutdentCommand,
  runParagraphCommand
} from './editorBlockCommands';
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
import { highlightRemark, highlightSchema, toggleHighlightCommand } from './editorHighlight';
import {
  insertInternalLinkCommand,
  internalLinkRemark,
  internalLinkSchema
} from './editorInternalLink';
import { taskListClickBehavior, turnIntoTaskListCommand } from './editorTaskList';
import styles from './MilkdownNoteEditor.module.css';

export interface MilkdownNoteEditorProps {
  noteId: string;
  markdown: string;
  readOnly: boolean;
  allowExternalSync?: boolean;
  onChange(markdown: string): void;
}

export const MilkdownNoteEditor = forwardRef<EditorCommandTarget, MilkdownNoteEditorProps>(
  function MilkdownNoteEditor({ noteId, markdown, readOnly, allowExternalSync = true, onChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const onChangeRef = useRef(onChange);
    const incomingMarkdownRef = useRef(markdown);
    const editorMarkdownRef = useRef(markdown);
    const readyRef = useRef(false);
    onChangeRef.current = onChange;
    incomingMarkdownRef.current = markdown;

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor || readOnly) return;
      const command = resolveEditorShortcutCommand(event);
      if (!command) return;
      if (command === 'indent' || command === 'outdent') {
        event.preventDefault();
        commandResolvers[command](editor);
        return;
      }
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
      setMarkdown(nextMarkdown) {
        const editor = editorRef.current;
        if (!editor || nextMarkdown === editorMarkdownRef.current) return;
        editorMarkdownRef.current = nextMarkdown;
        editor.action(replaceAllMarkdown(nextMarkdown, true));
      },
      focus() {
        hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
      },
      getMarkdown() {
        return editorRef.current?.action(getMarkdown()) ?? editorMarkdownRef.current;
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
          ctx.set(defaultValueCtx, incomingMarkdownRef.current);
          ctx.set(editorViewOptionsCtx, {
            editable: () => !readOnly,
            attributes: {
              'aria-label': '笔记正文',
              'aria-multiline': 'true',
              'aria-keyshortcuts': 'Tab Shift+Tab Control+0 Control+1 Control+2 Control+3 Control+4 Control+B Control+E Control+Shift+H Control+Shift+X Meta+0 Meta+1 Meta+2 Meta+3 Meta+4 Meta+B Meta+E Meta+Shift+H Meta+Shift+X',
              spellcheck: 'true'
            }
          });
          ctx.update(remarkStringifyOptionsCtx, (options) => {
            type MarkdownHandler = NonNullable<typeof options.handlers>['text'];
            const delimited = (open: string, close = open): MarkdownHandler => (
              node, _parent, state, info
            ) => {
              const exit = state.enter('emphasis');
              const tracker = state.createTracker(info);
              let value = tracker.move(open);
              value += tracker.move(state.containerPhrasing(node, {
                before: value,
                after: close,
                ...tracker.current()
              }));
              value += tracker.move(close);
              exit();
              return value;
            };
            return {
              ...options,
              handlers: {
                ...options.handlers,
                highlight: delimited('=='),
                internalLink: delimited('[[', ']]')
              }
            };
          });
          ctx.get(listenerCtx).markdownUpdated((_ctx, nextMarkdown) => {
            if (nextMarkdown === editorMarkdownRef.current) return;
            editorMarkdownRef.current = nextMarkdown;
            if (!readyRef.current) return;
            onChangeRef.current(nextMarkdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(highlightRemark)
        .use(highlightSchema)
        .use(toggleHighlightCommand)
        .use(internalLinkRemark)
        .use(internalLinkSchema)
        .use(insertInternalLinkCommand)
        .use(clipboard)
        .use(findHighlightBehavior)
        .use(turnIntoTaskListCommand)
        .use(taskListClickBehavior)
        .use(history)
        .use(listener);
      void editor.create().then(() => {
        if (cancelled) return void editor.destroy();
        editorRef.current = editor;
        const incomingMarkdown = incomingMarkdownRef.current;
        const currentMarkdown = editor.action(getMarkdown());
        editorMarkdownRef.current = currentMarkdown;
        if (incomingMarkdown !== currentMarkdown) {
          editorMarkdownRef.current = incomingMarkdown;
          editor.action(replaceAllMarkdown(incomingMarkdown, true));
        }
        readyRef.current = true;
      });
      return () => {
        cancelled = true;
        readyRef.current = false;
        editorRef.current = null;
        void editor.destroy();
      };
    }, [noteId, readOnly]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !readyRef.current || !allowExternalSync) return;
      if (markdown === editorMarkdownRef.current) return;
      editorMarkdownRef.current = markdown;
      editor.action(replaceAllMarkdown(markdown, true));
    }, [allowExternalSync, markdown]);

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
  strikethrough: (editor) => Boolean(editor.action(callCommand(toggleStrikethroughCommand.key))),
  'inline-code': (editor) => Boolean(editor.action(callCommand(toggleInlineCodeCommand.key))),
  highlight: (editor) => Boolean(editor.action(callCommand(toggleHighlightCommand.key))),
  'internal-link': (editor) => Boolean(editor.action(callCommand(insertInternalLinkCommand.key))),
  'bullet-list': (editor) => runListCommand(editor, 'bullet_list'),
  'ordered-list': (editor) => runListCommand(editor, 'ordered_list'),
  'task-list': (editor) => Boolean(editor.action(callCommand(turnIntoTaskListCommand.key))),
  blockquote: (editor) => Boolean(editor.action(callCommand(wrapInBlockquoteCommand.key))),
  'code-block': (editor) => Boolean(editor.action(callCommand(createCodeBlockCommand.key, ''))),
  'horizontal-rule': (editor) => Boolean(editor.action(callCommand(insertHrCommand.key))),
  table: (editor) => Boolean(editor.action(callCommand(insertTableCommand.key, { row: 3, col: 3 }))),
  'delete-selection': runDeleteSelectionCommand,
  indent: runIndentCommand,
  outdent: runOutdentCommand,
  'paragraph-above': (editor) => insertParagraphNearSelection(editor, 'above'),
  'paragraph-below': (editor) => insertParagraphNearSelection(editor, 'below'),
  undo: (editor) => Boolean(editor.action(callCommand(undoCommand.key))),
  redo: (editor) => Boolean(editor.action(callCommand(redoCommand.key)))
};

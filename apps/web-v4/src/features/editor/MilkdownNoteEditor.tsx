import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx
} from '@milkdown/kit/core';
import {
  history,
  historyProviderConfig,
  redoCommand,
  undoCommand
} from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { closeHistory } from '@milkdown/kit/prose/history';
import { Slice } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
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
  runParagraphCommand,
  isSelectionInsideTable,
  runTableNavigationCommand
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
import { editorInputBehavior } from './editorInputBehavior';
import { createEditorPasteBehavior } from './editorPasteBehavior';
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
  onStatus?(message: string): void;
}

export const MilkdownNoteEditor = forwardRef<EditorCommandTarget, MilkdownNoteEditorProps>(
  function MilkdownNoteEditor({ noteId, markdown, readOnly, allowExternalSync = true, onChange, onStatus }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const onChangeRef = useRef(onChange);
    const onStatusRef = useRef(onStatus);
    const incomingMarkdownRef = useRef(markdown);
    const editorMarkdownRef = useRef(markdown);
    const emittedMarkdownRef = useRef(markdown);
    const readyRef = useRef(false);
    const readOnlyRef = useRef(readOnly);
    const composingRef = useRef(false);
    const compositionFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
    onChangeRef.current = onChange;
    onStatusRef.current = onStatus;
    incomingMarkdownRef.current = markdown;
    readOnlyRef.current = readOnly;

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor || readOnlyRef.current) return;
      const command = resolveEditorShortcutCommand(event);
      if (!command) return;
      if (command === 'indent' || command === 'outdent') {
        if (isSelectionInsideTable(editor)) {
          runTableNavigationCommand(editor, command === 'indent' ? 'next' : 'previous');
          event.preventDefault();
          return;
        }
        commandResolvers[command](editor);
        event.preventDefault();
        return;
      }
      if (commandResolvers[command](editor)) event.preventDefault();
    };

    const handleCompositionStart = () => {
      if (compositionFlushTimerRef.current) clearTimeout(compositionFlushTimerRef.current);
      compositionFlushTimerRef.current = null;
      composingRef.current = true;
    };

    const handleCompositionEnd = () => {
      if (compositionFlushTimerRef.current) clearTimeout(compositionFlushTimerRef.current);
      compositionFlushTimerRef.current = setTimeout(() => {
        compositionFlushTimerRef.current = null;
        composingRef.current = false;
        const editor = editorRef.current;
        if (!editor || !readyRef.current) return;
        const nextMarkdown = editor.action(getMarkdown());
        editorMarkdownRef.current = nextMarkdown;
        if (nextMarkdown === emittedMarkdownRef.current) return;
        emittedMarkdownRef.current = nextMarkdown;
        onChangeRef.current(nextMarkdown);
      }, 0);
    };

    useImperativeHandle(ref, () => ({
      run(command) {
        const editor = editorRef.current;
        if (!editor || readOnlyRef.current) return false;
        restoreRememberedSelection(editor, lastSelectionRef.current);
        const resolver = commandResolvers[command];
        return resolver ? resolver(editor) : false;
      },
      async runEdit(action) {
        const editor = editorRef.current;
        if (!editor || readOnlyRef.current && (action === 'cut' || action === 'paste')) {
          return { ok: false, reason: 'unsupported' };
        }
        restoreRememberedSelection(editor, lastSelectionRef.current);
        return runEditorClipboardAction(editor, action);
      },
      find(query, currentIndex, direction) {
        const editor = editorRef.current;
        return editor ? findAndSelect(editor, query, currentIndex, direction) : { found: false, count: 0, index: -1 };
      },
      replaceCurrent(query, replacement, currentIndex) {
        const editor = editorRef.current;
        if (!editor || readOnlyRef.current) return { found: false, count: 0, index: -1, replaced: 0 };
        return replaceCurrentMatch(editor, query, replacement, currentIndex);
      },
      replaceAll(query, replacement) {
        const editor = editorRef.current;
        if (!editor || readOnlyRef.current) return { found: false, count: 0, index: -1, replaced: 0 };
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
        emittedMarkdownRef.current = nextMarkdown;
        editor.action(replaceAllMarkdown(nextMarkdown, true));
      },
      replaceMarkdown(nextMarkdown) {
        const editor = editorRef.current;
        if (!editor || readOnlyRef.current || nextMarkdown === editorMarkdownRef.current) return false;
        const parsed = editor.ctx.get(parserCtx)(nextMarkdown);
        if (!parsed || typeof parsed === 'string') return false;
        const view = editor.ctx.get(editorViewCtx);
        view.dispatch(closeHistory(view.state.tr.replace(
          0,
          view.state.doc.content.size,
          new Slice(parsed.content, 0, 0)
        )).scrollIntoView());
        return true;
      },
      focus() {
        const editor = editorRef.current;
        if (editor) restoreRememberedSelection(editor, lastSelectionRef.current);
        else hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
      },
      getMarkdown() {
        return editorRef.current?.action(getMarkdown()) ?? editorMarkdownRef.current;
      },
      getHtml() {
        return editorRef.current?.action(getHTML()) ?? '';
      }
    }), []);

    useEffect(() => {
      const root = hostRef.current;
      if (!root) return;
      let cancelled = false;
      readyRef.current = false;
      composingRef.current = false;
      editorMarkdownRef.current = incomingMarkdownRef.current;
      emittedMarkdownRef.current = incomingMarkdownRef.current;
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, incomingMarkdownRef.current);
          ctx.set(historyProviderConfig.key, { depth: 500, newGroupDelay: 750 });
          ctx.set(editorViewOptionsCtx, {
            editable: () => !readOnlyRef.current,
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
            if (!readyRef.current || composingRef.current) return;
            emittedMarkdownRef.current = nextMarkdown;
            onChangeRef.current(nextMarkdown);
          });
          ctx.get(listenerCtx).selectionUpdated((_ctx, selection) => {
            lastSelectionRef.current = { from: selection.from, to: selection.to };
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
        .use(createEditorPasteBehavior((message) => onStatusRef.current?.(message)))
        .use(clipboard)
        .use(findHighlightBehavior)
        .use(turnIntoTaskListCommand)
        .use(taskListClickBehavior)
        .use(editorInputBehavior)
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
        const selection = editor.ctx.get(editorViewCtx).state.selection;
        lastSelectionRef.current = { from: selection.from, to: selection.to };
      });
      return () => {
        cancelled = true;
        readyRef.current = false;
        editorRef.current = null;
        lastSelectionRef.current = null;
        composingRef.current = false;
        if (compositionFlushTimerRef.current) clearTimeout(compositionFlushTimerRef.current);
        compositionFlushTimerRef.current = null;
        void editor.destroy();
      };
    }, [noteId]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !readyRef.current) return;
      editor.ctx.get(editorViewCtx).setProps({ editable: () => !readOnly });
    }, [readOnly]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !readyRef.current || !allowExternalSync || composingRef.current) return;
      if (markdown === editorMarkdownRef.current) return;
      editorMarkdownRef.current = markdown;
      emittedMarkdownRef.current = markdown;
      editor.action(replaceAllMarkdown(markdown, true));
    }, [allowExternalSync, markdown]);

    return (
      <div
        ref={hostRef}
        className={styles.milkdownEditor}
        data-readonly={readOnly || undefined}
        onKeyDownCapture={handleKeyDown}
        onCompositionStartCapture={handleCompositionStart}
        onCompositionEndCapture={handleCompositionEnd}
      />
    );
  }
);

function restoreRememberedSelection(
  editor: Editor,
  remembered: { from: number; to: number } | null
): void {
  const view = editor.ctx.get(editorViewCtx);
  if (!remembered) {
    view.focus();
    return;
  }
  const docSize = view.state.doc.content.size;
  const from = view.state.doc.resolve(Math.max(0, Math.min(remembered.from, docSize)));
  const to = view.state.doc.resolve(Math.max(0, Math.min(remembered.to, docSize)));
  const selection = TextSelection.between(from, to);
  if (!selection.eq(view.state.selection)) {
    view.dispatch(view.state.tr.setSelection(selection));
  }
  view.focus();
}

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

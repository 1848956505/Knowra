import type { EditorCommand } from './editorCommands';

export interface EditorShortcutInput {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

const shortcutLabels: Partial<Record<EditorCommand, string>> = {
  paragraph: 'Ctrl+0',
  'heading-1': 'Ctrl+1',
  'heading-2': 'Ctrl+2',
  'heading-3': 'Ctrl+3',
  'heading-4': 'Ctrl+4',
  'bullet-list': 'Ctrl+Shift+}',
  'ordered-list': 'Ctrl+Shift+{',
  'task-list': 'Ctrl+Shift+X',
  bold: 'Ctrl+B',
  'inline-code': 'Ctrl+E',
  highlight: 'Ctrl+Shift+H'
};

export function getEditorShortcutLabel(command: EditorCommand): string | undefined {
  return shortcutLabels[command];
}

export function resolveEditorShortcutCommand(input: EditorShortcutInput): EditorCommand | null {
  if (input.isComposing || input.keyCode === 229) {
    return null;
  }

  if (input.key === 'Tab' && !input.ctrlKey && !input.metaKey && !input.altKey) {
    return input.shiftKey ? 'outdent' : 'indent';
  }

  if (input.altKey || (!input.ctrlKey && !input.metaKey)) return null;

  if (!input.shiftKey) {
    const headingCommands: Record<string, EditorCommand> = {
      '0': 'paragraph',
      '1': 'heading-1',
      '2': 'heading-2',
      '3': 'heading-3',
      '4': 'heading-4'
    };
    const formattingCommands: Record<string, EditorCommand> = {
      b: 'bold',
      e: 'inline-code'
    };
    return headingCommands[input.key] ?? formattingCommands[input.key.toLowerCase()] ?? null;
  }

  if (input.key.toLowerCase() === 'x') return 'task-list';
  if (input.key.toLowerCase() === 'h' || input.code === 'KeyH') return 'highlight';
  if (input.code === 'BracketLeft' || input.key === '{') return 'ordered-list';
  if (input.code === 'BracketRight' || input.key === '}') return 'bullet-list';
  return null;
}

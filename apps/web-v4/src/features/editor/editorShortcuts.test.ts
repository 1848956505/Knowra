import { describe, expect, it } from 'vitest';
import { getParagraphShortcutLabel, resolveEditorShortcutCommand } from './editorShortcuts';

const baseShortcut = {
  key: '',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false
};

describe('editorShortcuts', () => {
  it.each([
    ['0', 'paragraph'],
    ['1', 'heading-1'],
    ['2', 'heading-2'],
    ['3', 'heading-3'],
    ['4', 'heading-4']
  ] as const)('maps Ctrl+%s to %s', (key, command) => {
    expect(resolveEditorShortcutCommand({ ...baseShortcut, key })).toBe(command);
  });

  it('supports cross-platform list shortcuts', () => {
    expect(resolveEditorShortcutCommand({
      ...baseShortcut, key: '{', code: 'BracketLeft', shiftKey: true
    })).toBe('ordered-list');
    expect(resolveEditorShortcutCommand({
      ...baseShortcut, key: '}', code: 'BracketRight', ctrlKey: false, metaKey: true, shiftKey: true
    })).toBe('bullet-list');
    expect(resolveEditorShortcutCommand({
      ...baseShortcut, key: 'X', shiftKey: true
    })).toBe('task-list');
  });

  it('does not intercept composition or unrelated modifier combinations', () => {
    expect(resolveEditorShortcutCommand({ ...baseShortcut, key: '1', isComposing: true })).toBeNull();
    expect(resolveEditorShortcutCommand({ ...baseShortcut, key: '1', altKey: true })).toBeNull();
    expect(resolveEditorShortcutCommand({ ...baseShortcut, key: '8' })).toBeNull();
  });

  it('exposes the reference shortcut labels used by the menu', () => {
    expect(getParagraphShortcutLabel('paragraph')).toBe('Ctrl+0');
    expect(getParagraphShortcutLabel('task-list')).toBe('Ctrl+Shift+X');
    expect(getParagraphShortcutLabel('blockquote')).toBeUndefined();
  });
});

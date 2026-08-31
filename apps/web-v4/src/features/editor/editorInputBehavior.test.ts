import { describe, expect, it } from 'vitest';
import { resolveEditorBoundaryAction, type EditorBoundaryInput } from './editorInputBehavior';

const baseInput: EditorBoundaryInput = {
  key: 'Enter',
  selectionEmpty: true,
  parentEmpty: true,
  parentOffset: 0,
  ancestors: ['paragraph', 'list_item', 'bullet_list']
};

describe('editorInputBehavior', () => {
  it.each(['Enter', 'Backspace'])('exits an empty structured block with %s', (key) => {
    expect(resolveEditorBoundaryAction({ ...baseInput, key })).toBe('lift-empty-structured-block');
    expect(resolveEditorBoundaryAction({
      ...baseInput,
      key,
      ancestors: ['paragraph', 'blockquote']
    })).toBe('lift-empty-structured-block');
  });

  it('keeps normal paragraphs and non-empty blocks on the native ProseMirror path', () => {
    expect(resolveEditorBoundaryAction({ ...baseInput, ancestors: ['paragraph'] })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, parentEmpty: false })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, selectionEmpty: false })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, parentOffset: 1 })).toBeNull();
  });

  it('never mutates editor state while an IME composition is active', () => {
    expect(resolveEditorBoundaryAction({ ...baseInput, isComposing: true })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, keyCode: 229 })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, viewComposing: true })).toBeNull();
  });

  it('does not override modified Enter or Backspace shortcuts', () => {
    expect(resolveEditorBoundaryAction({ ...baseInput, shiftKey: true })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, ctrlKey: true })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, metaKey: true })).toBeNull();
    expect(resolveEditorBoundaryAction({ ...baseInput, altKey: true })).toBeNull();
  });
});

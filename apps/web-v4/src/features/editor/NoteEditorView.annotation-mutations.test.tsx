import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditorView, type NoteEditorViewProps } from './NoteEditorView';
import { getEffectiveEditorViewState, initialEditorViewState } from './editorViewState';
import type { Annotation } from '@study-accelerator/web-core';

const state = vi.hoisted(() => ({ markdown: '保存后的正文', selection: { anchor: { segments: [] }, quoteText: '正文', headingPath: [], fromPosition: 1, toPosition: 3, prefixText: '', suffixText: '', scopeType: 'blocks' }, inspector: {} as Record<string, Function> }));
vi.mock('./MilkdownNoteEditor', async () => {
  const React = await import('react');
  return { MilkdownNoteEditor: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ getMarkdown: () => state.markdown, getAnnotationSelection: () => state.selection, setAnnotations: () => {}, clearFind: () => {}, focus: () => {} }), []);
    return <div data-testid="mutation-editor" />;
  }) };
});
vi.mock('./EditorInspector', () => ({ EditorInspector: (props: Record<string, Function>) => { state.inspector = props; return null; } }));
const annotation = { id: 'annotation-1', noteId: 'note-1', scopeType: 'blocks', revision: 1, lifecycleStatus: 'active' } as Annotation;
function fixture() {
  state.markdown = '保存后的正文'; state.selection = { ...state.selection, quoteText: '正文' };
  let revision = 1;
  const props = {
    note: { id: 'note-1', title: '标注并发', spaceId: 'space-1', rawMarkdown: '旧正文', contentLoaded: true, updatedAt: 'v1', tagIds: [], internalLinks: [], deleted: false },
    foldersById: {}, notes: [], tags: [], openNotes: [], inspectorOpen: true, canWrite: true,
    view: { ...getEffectiveEditorViewState(initialEditorViewState), contentMode: 'edit' },
    ...Object.fromEntries(['onOpenNote', 'onCloseNote', 'onCloseOtherNotes', 'onReorderNotes', 'onCopyTabPath', 'onCreateNote', 'onCreateFolder', 'onImportMarkdown', 'onRenameNote', 'onSaveAs', 'onDeleteNote', 'onSetTags', 'onGetVersion', 'onOrganizeNote', 'onUploadAttachment', 'onRenameAttachment', 'onDeleteAttachment', 'onCreateAnnotation', 'onDeleteAnnotation', 'onFileStatus', 'onViewAction', 'onToggleFavorite', 'onToggleInspector'].map(key => [key, vi.fn()])),
    onListVersions: vi.fn().mockResolvedValue([]), onListAttachments: vi.fn().mockResolvedValue([]), onGetLinkedNotes: vi.fn().mockResolvedValue([]),
    onListAnnotations: vi.fn(async () => [{ ...annotation, revision }]),
    onSaveMarkdown: vi.fn(async () => { revision += 1; return { updatedAt: 'v2', rawMarkdown: state.markdown }; }),
    onUpdateAnnotationAnchor: vi.fn(async (_id, input) => { if (input.expectedRevision !== revision) throw new Error('409 stale revision'); return { ...annotation, revision: revision + 1 }; }),
    onCreateAnnotationExclusion: vi.fn(async (_id, input) => { if (input.expectedRevision !== revision) throw new Error('409 stale revision'); return { annotation: { ...annotation, revision: revision + 1 } }; })
  } as unknown as NoteEditorViewProps;
  return props;
}
describe('标注变更等待真实 autosave 后的上下文与 revision', () => {
  it.each(['onReanchorAnnotation', 'onCreateAnnotationExclusion'])('%s 使用保存后的 revision', async action => {
    const props = fixture(); render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
    await act(async () => { await state.inspector[action](annotation); });
    const mutate = action === 'onReanchorAnnotation' ? props.onUpdateAnnotationAnchor : props.onCreateAnnotationExclusion;
    expect(props.onSaveMarkdown).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(annotation.id, expect.objectContaining({ expectedRevision: 2 }));
  });
  it.each(['note', 'readonly', 'selection', 'document'])('保存期间 %s 改变则取消标注写入', async change => {
    const props = fixture(); let finish!: () => void;
    vi.mocked(props.onSaveMarkdown).mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...props.note!, updatedAt: 'v2' }); }));
    const { rerender } = render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
    let pending!: Promise<void>;
    act(() => { pending = state.inspector.onReanchorAnnotation(annotation); });
    await waitFor(() => expect(props.onSaveMarkdown).toHaveBeenCalledOnce());
    if (change === 'note') rerender(<NoteEditorView {...props} note={{ ...props.note!, id: 'note-2' }} />);
    if (change === 'readonly') rerender(<NoteEditorView {...props} canWrite={false} />);
    if (change === 'selection') state.selection = { ...state.selection, quoteText: '另一选区' };
    if (change === 'document') state.markdown = '继续输入';
    await act(async () => { finish(); await expect(pending).rejects.toThrow(); });
    expect(props.onUpdateAnnotationAnchor).not.toHaveBeenCalled();
  });
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditorView, type NoteEditorViewProps } from './NoteEditorView';
import { getEffectiveEditorViewState, initialEditorViewState } from './editorViewState';
import { ApiRequestError, type Annotation } from '@study-accelerator/web-core';
import { StrictMode } from 'react';
import { anchorForListItem, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';

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
  state.markdown = '保存后的正文'; state.selection = { anchor: { segments: [] }, quoteText: '正文', headingPath: [], fromPosition: 1, toPosition: 3, prefixText: '', suffixText: '', scopeType: 'blocks' };
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
  it('StrictMode 重放挂载后仍可正常写入最新修订', async () => {
    const props = fixture(); render(<StrictMode><NoteEditorView {...props} /></StrictMode>); await screen.findByTestId('mutation-editor');
    await act(async () => { await state.inspector.onReanchorAnnotation(annotation); });
    expect(props.onUpdateAnnotationAnchor).toHaveBeenCalledWith(annotation.id, expect.objectContaining({ expectedRevision: 2 }));
  });
  it('保存失败不能进入标注写入', async () => {
    const props = fixture(); vi.mocked(props.onSaveMarkdown).mockRejectedValue(new Error('保存失败'));
    render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
    await act(async () => { await expect(state.inspector.onReanchorAnnotation(annotation)).rejects.toThrow('保存失败'); });
    expect(props.onUpdateAnnotationAnchor).not.toHaveBeenCalled();
  });
  it('标注刷新期间导航到其他笔记也取消提交', async () => {
    const props = fixture(); const { rerender } = render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
    let finish!: (items: Annotation[]) => void;
    vi.mocked(props.onListAnnotations).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>; act(() => { pending = state.inspector.onReanchorAnnotation(annotation); });
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    const refresh = finish;
    rerender(<NoteEditorView {...props} note={{ ...props.note!, id: 'note-2' }} />);
    await act(async () => { refresh([{ ...annotation, revision: 2 }]); await expect(pending).rejects.toThrow(); });
    expect(props.onUpdateAnnotationAnchor).not.toHaveBeenCalled();
  });
  it('保存后发现标注已删除则取消提交', async () => {
    const props = fixture(); render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
    vi.mocked(props.onListAnnotations).mockResolvedValue([{ ...annotation, lifecycleStatus: 'deleted' }]);
    await act(async () => { await expect(state.inspector.onReanchorAnnotation(annotation)).rejects.toThrow('标注状态'); });
    expect(props.onUpdateAnnotationAnchor).not.toHaveBeenCalled();
  });
});


describe('新建章节重点的异步上下文', () => {
  it.each(['note', 'readonly', 'selection', 'document', 'unmount'])('保存等待期间 %s 变化时不提交旧章节', async change => {
    const props = fixture();
    vi.mocked(props.onCreateAnnotation).mockResolvedValue({ ...annotation, scopeType: 'section' });
    let finish!: () => void;
    vi.mocked(props.onSaveMarkdown).mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...props.note!, updatedAt: 'v2', rawMarkdown: '保存后的正文' }); }));
    const { rerender, unmount } = render(<NoteEditorView {...props} />);
    await screen.findByTestId('mutation-editor');
    let pending!: Promise<void>;
    act(() => { pending = state.inspector.onCreateAnnotation('section'); });
    await waitFor(() => expect(props.onSaveMarkdown).toHaveBeenCalledOnce());
    if (change === 'note') rerender(<NoteEditorView {...props} note={{ ...props.note!, id: 'note-2' }} />);
    if (change === 'readonly') rerender(<NoteEditorView {...props} canWrite={false} />);
    if (change === 'selection') state.selection = { ...state.selection, quoteText: '另一章节' };
    if (change === 'document') state.markdown = '继续输入';
    if (change === 'unmount') unmount();
    await act(async () => { finish(); await expect(pending).rejects.toThrow('已变化'); });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });
});


it('正常新建章节重点保留输入及幂等重试，不将失败当作成功', async () => {
  const props = fixture();
  vi.mocked(props.onCreateAnnotation).mockRejectedValueOnce(new Error('响应丢失')).mockResolvedValueOnce({ ...annotation, scopeType: 'section' });
  render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  await act(async () => { await expect(state.inspector.onCreateAnnotation('section')).rejects.toThrow('响应丢失'); });
  await act(async () => { await state.inspector.onCreateAnnotation('section'); });
  const calls = vi.mocked(props.onCreateAnnotation).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey);
  expect(props.onFileStatus).toHaveBeenCalledOnce();
  expect(props.onFileStatus).toHaveBeenCalledWith('已标为重点');
});

it('新建章节重点提交后切换笔记，迟到成功回执不污染新笔记', async () => {
  const props = fixture();
  vi.mocked(props.onListAnnotations).mockResolvedValue([]);
  let finish!: (item: Annotation) => void;
  vi.mocked(props.onCreateAnnotation).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { rerender } = render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  let pending!: Promise<void>; act(() => { pending = state.inspector.onCreateAnnotation('section'); });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  rerender(<NoteEditorView {...props} note={{ ...props.note!, id: 'note-2' }} />);
  await act(async () => { finish({ ...annotation, scopeType: 'section' }); await pending; });
  expect(state.inspector.annotations).toEqual([]);
  expect(props.onFileStatus).not.toHaveBeenCalledWith('已标为重点');
});

function selectList(markdown: string, item = 0) {
  state.markdown = markdown;
  const projection = projectMarkdown(markdown);
  const anchor = anchorForListItem(projection, projection.listItems[item].path);
  state.selection = { anchor, quoteText: anchor.quoteText, headingPath: [], fromPosition: anchor.sourceStart,
    toPosition: anchor.sourceEnd, prefixText: anchor.prefixText, suffixText: anchor.suffixText, scopeType: 'list' } as unknown as typeof state.selection;
}
it.each(['continue', 'sibling', 'structure', 'outside'])('慢保存期间列表 %s：只接纳同一项内的继续输入', async change => {
  const props = fixture();
  selectList('- 父项\n  - 子项未保存\n- 相邻', 1);
  vi.mocked(props.onCreateAnnotation).mockResolvedValue({ ...annotation, scopeType: 'list' });
  let finish!: () => void;
  vi.mocked(props.onSaveMarkdown).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ...props.note!, updatedAt: 'v2' }); }));
  render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  let pending!: Promise<void>;
  act(() => { pending = state.inspector.onCreateAnnotation('list'); });
  await waitFor(() => expect(props.onSaveMarkdown).toHaveBeenCalledOnce());
  const latest = change === 'structure' ? '- 父项\n  - 子项未保存\n    - 新子项\n- 相邻'
    : change === 'outside' ? '- 父项外部变化\n  - 子项未保存\n- 相邻' : '- 父项\n  - 子项未保存继续输入\n- 相邻';
  selectList(latest, change === 'sibling' ? 2 : 1);
  await act(async () => { finish(); if (change === 'continue') await pending; else await expect(pending).rejects.toThrow('已变化'); });
  if (change === 'continue') {
    expect(vi.mocked(props.onSaveMarkdown).mock.calls.at(-1)?.[1]).toBe(latest);
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({ quoteText: '子项未保存继续输入', noteContentHash: calculateContentHash(latest) }));
  } else expect(props.onCreateAnnotation).not.toHaveBeenCalled();
});
it('同项持续输入最多保存三轮，不循环提交或重复标注，取消后仍可重试', async () => {
  const props = fixture(); let source = '- 父项\n  - 子项\n- 相邻'; selectList(source, 1);
  vi.mocked(props.onCreateAnnotation).mockResolvedValue({ ...annotation, scopeType: 'list' });
  vi.mocked(props.onSaveMarkdown).mockImplementation(async () => {
    source = source.replace('子项', '子项继续'); selectList(source, 1);
    return { ...props.note!, updatedAt: crypto.randomUUID() };
  });
  render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  await act(async () => { await expect(state.inspector.onCreateAnnotation('list')).rejects.toThrow('已变化'); });
  expect(props.onSaveMarkdown).toHaveBeenCalledTimes(3);
  expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  vi.mocked(props.onSaveMarkdown).mockResolvedValue({ ...props.note!, updatedAt: 'v4' });
  await act(async () => { await state.inspector.onCreateAnnotation('list'); });
  expect(props.onCreateAnnotation).toHaveBeenCalledOnce();
});

it.each(['note', 'readonly'])('同项继续输入后第二轮保存期间 %s 变化，迟到保存回执不提交；重复触发只执行一次', async change => {
  const props = fixture(); selectList('- 父项\n  - 子项\n- 相邻', 1);
  let finish!: () => void;
  vi.mocked(props.onSaveMarkdown)
    .mockImplementationOnce(async () => { selectList('- 父项\n  - 子项继续\n- 相邻', 1); return { ...props.note!, updatedAt: 'v2' }; })
    .mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ...props.note!, updatedAt: 'v3' }); }));
  const { rerender } = render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  let pending!: Promise<void>;
  act(() => { pending = state.inspector.onCreateAnnotation('list'); });
  await waitFor(() => expect(props.onSaveMarkdown).toHaveBeenCalledTimes(2));
  await act(async () => { await state.inspector.onCreateAnnotation('list'); });
  expect(props.onSaveMarkdown).toHaveBeenCalledTimes(2);
  rerender(<NoteEditorView {...props} {...(change === 'note' ? { note: { ...props.note!, id: 'note-2' } } : { canWrite: false })} />);
  await act(async () => { finish(); await expect(pending).rejects.toThrow('已变化'); });
  expect(props.onCreateAnnotation).not.toHaveBeenCalled();
});

it('响应丢失重试与慢保存续输入组合始终恢复原 payload/key，不重复创建', async () => {
  const props = fixture(); const source = '- 父项\n  - 子项\n- 相邻'; selectList(source, 1);
  vi.mocked(props.onCreateAnnotation).mockRejectedValueOnce(new Error('响应丢失')).mockResolvedValueOnce({ ...annotation, scopeType: 'list', quoteText: '子项继续' });
  render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  await act(async () => { await expect(state.inspector.onCreateAnnotation('list')).rejects.toThrow('响应丢失'); });
  let finish!: () => void;
  vi.mocked(props.onSaveMarkdown).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ...props.note!, updatedAt: 'v2' }); }));
  selectList(source.replace('子项', '子项先'), 1);
  let pending!: Promise<void>; act(() => { pending = state.inspector.onCreateAnnotation('list'); });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  selectList(source.replace('子项', '子项先继续'), 1);
  await act(async () => { finish(); await pending; });
  const calls = vi.mocked(props.onCreateAnnotation).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1][0]).toEqual(calls[0][0]);
  expect(state.inspector.annotations).toHaveLength(1);
});
it('未落库的旧请求经明确内容冲突确认后，下一次显式创建才生成最新 payload/key', async () => {
  const props = fixture(); const source = '- 父项\n  - 子项\n- 相邻'; selectList(source, 1);
  vi.mocked(props.onCreateAnnotation).mockRejectedValueOnce(new Error('连接失败'))
    .mockRejectedValueOnce(new ApiRequestError('正文已变化', { status: 409, code: 'ANNOTATION_CONTENT_CONFLICT' }))
    .mockResolvedValueOnce({ ...annotation, scopeType: 'list' });
  render(<NoteEditorView {...props} />); await screen.findByTestId('mutation-editor');
  await act(async () => { await expect(state.inspector.onCreateAnnotation('list')).rejects.toThrow('连接失败'); });
  selectList(source.replace('子项', '子项继续'), 1);
  await act(async () => { await expect(state.inspector.onCreateAnnotation('list')).rejects.toThrow('正文已变化'); });
  expect(props.onCreateAnnotation).toHaveBeenCalledTimes(2);
  await act(async () => { await state.inspector.onCreateAnnotation('list'); });
  const calls = vi.mocked(props.onCreateAnnotation).mock.calls;
  expect(calls[1][0]).toEqual(calls[0][0]);
  expect(calls[2][0].idempotencyKey).not.toBe(calls[0][0].idempotencyKey);
  expect(calls[2][0].quoteText).toBe('子项继续');
});

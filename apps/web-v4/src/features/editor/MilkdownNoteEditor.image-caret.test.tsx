import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MilkdownNoteEditor } from './MilkdownNoteEditor';
import type { EditorCommandTarget } from './editorCommands';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('End 同步收起整段选区，随后立即离焦插图仍保留正文', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const markdown = '原始内容 离线新增中文正文';
  const ref = createRef<EditorCommandTarget>();
  const onReady = vi.fn();
  const rendered = render(
    <>
      <MilkdownNoteEditor
        ref={ref}
        noteId="image-caret"
        markdown={markdown}
        readOnly={false}
        onChange={vi.fn()}
        onReady={onReady}
      />
      <button>插入图片</button>
    </>
  );
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  const editor = rendered.container.querySelector<HTMLElement>('.ProseMirror')!;
  const text = editor.querySelector('p')!.firstChild!;
  const selection = window.getSelection()!;
  act(() => {
    editor.focus();
    selection.setBaseAndExtent(text, 0, text, markdown.length);
    fireEvent(document, new Event('selectionchange'));
  });
  expect(ref.current!.getAnnotationSelection()?.quoteText).toBe(markdown);

  act(() => {
    // 模拟原生右方向键已收起 DOM 选区，但 selectionchange 尚未交给编辑器。
    // End 的应用层处理必须同步更新 ProseMirror 及其记忆选区，不能等下一帧。
    selection.collapse(text, markdown.length);
    fireEvent.keyDown(editor, { key: 'End', code: 'End', keyCode: 35 });
    rendered.getByRole('button', { name: '插入图片' }).focus();
    fireEvent(document, new Event('selectionchange'));
    expect(ref.current!.insertImage('/api/storage/attachments/caret/content', '离线图片.png')).toBe(true);
  });
  expect(editor.textContent).toBe(markdown);
  expect(ref.current!.getMarkdown()).toContain(markdown);
  expect(ref.current!.getMarkdown()).toContain('/api/storage/attachments/caret/content');
  expect(editor.querySelector('img')!.previousSibling?.textContent).toBe(markdown);
});

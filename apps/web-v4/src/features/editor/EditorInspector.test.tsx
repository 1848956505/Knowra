import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorInspector } from './EditorInspector';

const root = { id: 'folder-root', name: '研究', parentId: null, children: [] };
const folder = { id: 'folder-ai', name: 'AI', parentId: 'folder-root', children: [] };
const note = {
  id: 'note-a',
  title: 'Transformer 注意力机制复盘',
  folderId: folder.id,
  tagIds: ['tag-study', 'tag-ai'],
  internalLinks: ['note-b'],
  rawMarkdown: '# 核心原理\n正文内容\n## 计算步骤',
  contentLoaded: true,
  favorite: false,
  deleted: false,
  status: 'draft',
  sourceType: 'manual',
  createdAt: '2026-08-12T13:14:00.000Z',
  updatedAt: '2026-08-31T02:32:00.000Z'
};
const related = { ...note, id: 'note-b', title: '向量相似度入门', internalLinks: [] };
const backlink = { ...note, id: 'note-c', title: '知识库召回策略', internalLinks: ['note-a'] };

describe('EditorInspector', () => {
  it('renders the information tab from live note data and opens related notes', async () => {
    const user = userEvent.setup();
    const onOpenNote = vi.fn();
    renderInspector({ onOpenNote });

    expect(screen.getByRole('tablist', { name: '检查器视图' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '信息' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Transformer 注意力机制复盘')).toBeInTheDocument();
    expect(screen.getByText('研究 / AI')).toBeInTheDocument();
    expect(screen.getByText('待整理')).toBeInTheDocument();
    expect(screen.getByText('学习')).toBeInTheDocument();
    expect(screen.getAllByText('AI')).toHaveLength(2);

    await user.click(screen.getByRole('link', { name: '向量相似度入门' }));
    expect(onOpenNote).toHaveBeenCalledWith('note-b');
  });

  it('supports keyboard-aware tabs and derived outline/link panels', async () => {
    const user = userEvent.setup();
    const onNavigateHeading = vi.fn();
    renderInspector({ onNavigateHeading });

    await user.click(screen.getByRole('tab', { name: '大纲' }));
    await user.click(screen.getByRole('button', { name: /02计算步骤/ }));
    expect(onNavigateHeading).toHaveBeenCalledWith(
      expect.objectContaining({ level: 2, text: '计算步骤' }),
      1
    );

    await user.click(screen.getByRole('tab', { name: '链接' }));
    expect(screen.getByRole('link', { name: '知识库召回策略' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '向量相似度入门' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AI' }));
    expect(screen.getByText('AI 检查尚未接入')).toBeInTheDocument();
  });
});

function renderInspector(overrides: Partial<Parameters<typeof EditorInspector>[0]> = {}) {
  return render(<EditorInspector
    note={note}
    folder={folder}
    foldersById={{ [root.id]: root, [folder.id]: folder }}
    notes={[note, related, backlink]}
    tags={[{ id: 'tag-study', name: '学习' }, { id: 'tag-ai', name: 'AI' }]}
    markdown={note.rawMarkdown}
    open
    onClose={vi.fn()}
    onOpenNote={vi.fn()}
    onNavigateHeading={vi.fn()}
    {...overrides}
  />);
}

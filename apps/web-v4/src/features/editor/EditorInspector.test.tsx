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
    expect(screen.queryByText('DOCUMENT OUTLINE')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '本页大纲' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '跳转到「计算步骤」，H2' }));
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

  it('edits assigned tags through an explicit save dialog', async () => {
    const user = userEvent.setup();
    const onSetTags = vi.fn().mockResolvedValue(undefined);
    renderInspector({ onSetTags });

    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑笔记标签' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除标签 AI' }));
    await user.click(screen.getByRole('button', { name: '保存到笔记' }));
    expect(onSetTags).toHaveBeenCalledWith(['tag-study']);
  });

  it('loads version history on demand and previews the selected snapshot', async () => {
    const user = userEvent.setup();
    const versions = [
      { id: 'version-2', noteId: note.id, content: '# 第二版', contentHash: 'b'.repeat(64), createdAt: '2026-08-31T02:32:00.000Z', createdBy: 'user' },
      { id: 'version-1', noteId: note.id, content: '# 第一版', contentHash: 'a'.repeat(64), createdAt: '2026-08-30T02:32:00.000Z', createdBy: 'user' }
    ];
    const onListVersions = vi.fn().mockResolvedValue(versions);
    const onGetVersion = vi.fn(async (_noteId: string, versionId: string) => (
      versions.find((version) => version.id === versionId) ?? versions[0]
    ));
    renderInspector({ onListVersions, onGetVersion });

    await user.click(screen.getByRole('tab', { name: '版本' }));
    expect(await screen.findByText('最新版本')).toBeInTheDocument();
    expect(onListVersions).toHaveBeenCalledWith(note.id);
    expect(await screen.findByText('# 第二版')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /历史版本 1/ }));
    expect(await screen.findByText('# 第一版')).toBeInTheDocument();
    expect(onGetVersion).toHaveBeenLastCalledWith(note.id, 'version-1');
  });

  it('organizes the note location and status through one explicit save', async () => {
    const user = userEvent.setup();
    const onOrganizeNote = vi.fn().mockResolvedValue(undefined);
    renderInspector({ onOrganizeNote });

    await user.click(screen.getByRole('button', { name: '整理' }));
    expect(screen.getByRole('dialog', { name: '整理笔记' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /笔记状态/ }));
    await user.click(screen.getByRole('option', { name: '进行中' }));
    await user.click(screen.getByRole('button', { name: '保存整理结果' }));
    expect(onOrganizeNote).toHaveBeenCalledWith({ folderId: folder.id, status: 'active' });
  });

  it('lists, locates and archives backend content annotations', async () => {
    const user = userEvent.setup();
    const annotation = {
      id: 'annotation-1', spaceId: 'space-1', noteId: note.id, noteVersionId: null,
      kind: 'important', sourceMode: 'manual', quoteText: '正文内的重要结论', headingPath: ['核心原理'],
      fromPosition: 1, toPosition: 8, prefixText: '', suffixText: '', anchorFingerprint: 'fingerprint',
      noteContentHash: 'hash', idempotencyKey: 'request-1', status: 'active'
    };
    const onSelectAnnotation = vi.fn();
    const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
    renderInspector({ annotations: [annotation], onSelectAnnotation, onDeleteAnnotation });

    await user.click(screen.getByRole('tab', { name: '标注' }));
    expect(screen.getByText('正文内的重要结论')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '定位' }));
    expect(onSelectAnnotation).toHaveBeenCalledWith('annotation-1');
    await user.click(screen.getByRole('button', { name: '归档' }));
    expect(onDeleteAnnotation).toHaveBeenCalledWith('annotation-1');
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
    canWrite
    canInsertAttachment
    onClose={vi.fn()}
    onOpenNote={vi.fn()}
    onNavigateHeading={vi.fn()}
    onSetTags={vi.fn().mockResolvedValue(undefined)}
    onListVersions={vi.fn().mockResolvedValue([])}
    onGetVersion={vi.fn()}
    {...overrides}
    attachments={overrides.attachments ?? []}
    attachmentsLoading={overrides.attachmentsLoading ?? false}
    linkedNotes={overrides.linkedNotes ?? [related]}
    linkedNotesLoading={overrides.linkedNotesLoading ?? false}
    annotations={overrides.annotations ?? []}
    annotationsLoading={overrides.annotationsLoading ?? false}
    focusedAnnotationId={overrides.focusedAnnotationId ?? null}
    onOrganizeNote={overrides.onOrganizeNote ?? vi.fn().mockResolvedValue(undefined)}
    onUploadAttachment={overrides.onUploadAttachment ?? vi.fn()}
    onInsertAttachment={overrides.onInsertAttachment ?? vi.fn().mockResolvedValue(undefined)}
    onRenameAttachment={overrides.onRenameAttachment ?? vi.fn()}
    onDeleteAttachment={overrides.onDeleteAttachment ?? vi.fn()}
    onCreateAnnotation={overrides.onCreateAnnotation ?? vi.fn().mockResolvedValue(undefined)}
    onSelectAnnotation={overrides.onSelectAnnotation ?? vi.fn()}
    onDeleteAnnotation={overrides.onDeleteAnnotation ?? vi.fn().mockResolvedValue(undefined)}
    onRestoreAnnotation={overrides.onRestoreAnnotation ?? vi.fn().mockResolvedValue(undefined)}
    onReanchorAnnotation={overrides.onReanchorAnnotation ?? vi.fn().mockResolvedValue(undefined)}
  />);
}

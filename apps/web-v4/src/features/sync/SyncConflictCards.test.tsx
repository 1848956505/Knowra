import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictCard, EntityConflictCard } from './SyncConflictCards';
import { entityPresence, fieldValue, sameField, type Conflict, type EntityConflict } from './syncConflictModel';

const note = (rawMarkdown: string, title = '同步笔记') => ({ title, rawMarkdown, deleted: false });
const conflict: Conflict = { noteId: 'note', kind: 'edit', base: note('基线正文'), local: note('本机正文'), remote: note('云端正文', '云端改名'), remoteRevision: 3, datasetEpoch: 'epoch' };

describe('同步冲突对比', () => {
  it('知识关联冲突展示中文审核字段且不提供仅合并正文的操作', () => {
    const knowledge = { title: '注意力', canonicalStatement: '根据相关程度加权', reviewStatus: 'candidate', knowledgeType: 'principle' };
    const group: EntityConflict = { id: 'knowledge-conflict', changedEpoch: false, reasons: [], items: [
      { collection: 'knowledgeItems', id: 'knowledge', base: knowledge, local: { ...knowledge, reviewStatus: 'confirmed' }, remote: { ...knowledge, canonicalStatement: '另一份说明' } },
      { collection: 'notes', id: 'note', base: note('原文'), local: note('本机'), remote: note('云端') }
    ] };
    render(<EntityConflictCard conflict={group} disabled={false} onResolve={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '注意力 · 关联资料需要核对' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /审核状态/ })).toHaveTextContent('已确认');
    expect(screen.getByRole('row', { name: /核心陈述/ })).toHaveTextContent('另一份说明');
    expect(screen.queryByRole('button', { name: '手动合并' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保留为两篇' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '采用本地' })).toBeEnabled();
  });
  it('正文派生文本不重复占用字段表，笔记和标注元数据使用中文名称与取值', () => {
    const local = { ...note('本机正文'), plainText: '重复的纯文本', sourceType: 'markdown-import', status: 'active', favorite: true, internalLinks: ['目标笔记'], charCount: 4 };
    render(<ConflictCard conflict={{ ...conflict, local }} disabled={false} onResolve={vi.fn()} />);
    expect(screen.queryByText(/plainText|重复的纯文本/)).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /来源类型/ })).toHaveTextContent('Markdown 导入');
    expect(screen.getByRole('row', { name: /^状态 / })).toHaveTextContent('进行中');
    expect(screen.getByRole('row', { name: /收藏状态/ })).toHaveTextContent('已收藏');
    expect(screen.getByRole('row', { name: /内部链接/ })).toHaveTextContent('目标笔记');
    expect(screen.getByRole('row', { name: /字符数/ })).toHaveTextContent('4');
    expect(fieldValue({ scopeType: 'section', lifecycleStatus: 'archived', sourceMode: 'manual', anchorStatus: 'needsReview', quoteText: 'active', originSnapshot: { scopeType: 'selection' } }, 'anchor', [])).toBe('标注范围：标题范围；标记状态：已取消；创建方式：手动；定位状态：需要复核；引用原文：active；原始内容快照：标注范围：选中文字');
    expect(fieldValue('future-state', 'status', [])).toBe('future-state');
  });

  it('切换双方和基线对比，同时显示中文标题字段变化', async () => {
    const { container } = render(<ConflictCard conflict={conflict} disabled={false} onResolve={vi.fn()} />);
    const row = screen.getByRole('row', { name: /标题/ });
    expect(row).toHaveTextContent('同步笔记');
    expect(row).toHaveTextContent('已变化云端改名');
    expect(container.querySelector('[data-diff="removed"]')).toHaveTextContent('本机正文');
    expect(container.querySelector('[data-diff="added"]')).toHaveTextContent('云端正文');
    await userEvent.selectOptions(screen.getByLabelText('正文比较'), 'local');
    expect(container.querySelector('[data-diff="removed"]')).toHaveTextContent('基线正文');
    expect(container.querySelector('[data-diff="added"]')).toHaveTextContent('本机正文');
    await userEvent.selectOptions(screen.getByLabelText('正文比较'), 'remote');
    expect(container.querySelector('[data-diff="added"]')).toHaveTextContent('云端正文');
  });

  it('区分无基线的不存在、永久删除、回收站与空正文', () => {
    expect(entityPresence(null, null)).toContain('无法判定');
    expect(entityPresence(null, note(''))).toBe('已永久删除');
    expect(entityPresence({ deleted: true }, null)).toBe('已移入回收站');
    expect(entityPresence(note(''), null)).toBe('存在');
    render(<ConflictCard conflict={{ ...conflict, base: null, local: note(''), remote: null }} disabled={false} onResolve={vi.fn()} />);
    expect(screen.getByRole('row', { name: /对象状态/ })).toHaveTextContent('不存在（无共同基线，无法判定是否曾删除）');
    expect(screen.getByRole('option', { name: '共同基线 → 本机' })).toBeDisabled();
  });

  it('保留四种解决方式的请求语义，忙碌时禁用操作', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ConflictCard conflict={conflict} disabled={false} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: '采用云端' }));
    await userEvent.click(screen.getByRole('button', { name: '采用本地' }));
    await userEvent.click(screen.getByRole('button', { name: '保留为两篇' }));
    await userEvent.click(screen.getByRole('button', { name: '手动合并' }));
    await userEvent.clear(screen.getByLabelText('合并后的正文'));
    await userEvent.type(screen.getByLabelText('合并后的正文'), '合并的段落');
    await userEvent.click(screen.getByRole('button', { name: '保存合并结果' }));
    expect(onResolve.mock.calls).toEqual([['remote'], ['local'], ['copy'], ['manual', '合并的段落']]);
    rerender(<ConflictCard conflict={conflict} disabled onResolve={onResolve} />);
    expect(screen.getByRole('button', { name: '采用本地' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存合并结果' })).toBeDisabled();
  });

  it('关联字段解析对象名称，区分空值与未设置，并展示历史版本实体', async () => {
    const item = { collection: 'notes', id: 'note', base: { ...note('原文'), folderId: 'folder', tagIds: [], description: null }, local: { ...note('本机'), folderId: null, tagIds: ['tag'] }, remote: { ...note('云端'), folderId: 'folder', tagIds: [], description: null } };
    const group: EntityConflict = { id: 'group', changedEpoch: true, reasons: [{ collection: 'notes', id: 'note' }], items: [item,
      { collection: 'folders', id: 'folder', base: null, local: { name: '研究目录' }, remote: null },
      { collection: 'tags', id: 'tag', base: null, local: { name: '重点' }, remote: null },
      { collection: 'noteVersions', id: 'version', base: null, local: { rawMarkdown: '旧正文' }, remote: null }
    ] };
    render(<EntityConflictCard conflict={group} disabled={false} onResolve={vi.fn()} />);
    expect(screen.getByRole('row', { name: /所属目录/ })).toHaveTextContent('研究目录（folder）');
    expect(screen.getByRole('row', { name: /^标签 / })).toHaveTextContent('重点（tag）');
    const description = screen.getByRole('row', { name: /说明/ });
    expect(description).toHaveTextContent('空值');
    expect(description).toHaveTextContent('未设置');
    expect(screen.getByText(/云端资料库已恢复或重建/)).toBeInTheDocument();
    const versionSummary = screen.getByText(/历史版本：version/);
    await userEvent.click(versionSummary);
    expect(within(versionSummary.closest('details')!).getByText('旧正文')).toBeInTheDocument();
  });

  it('对象字段顺序不同不会误报差异，多笔记关联冲突不允许合并正文', () => {
    expect(sameField({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    const group: EntityConflict = { id: 'group', changedEpoch: false, reasons: [], items: ['a', 'b'].map(id => ({ collection: 'notes', id, base: null, local: note(id), remote: null })) };
    render(<EntityConflictCard conflict={group} disabled={false} onResolve={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '手动合并' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保留为两篇' })).not.toBeInTheDocument();
  });
});

import type { Folder, Note, Tag } from '@study-accelerator/web-core';
import { buildLibraryTreeItems, getLibraryCounts, paginateResources, selectLibraryResources } from './libraryModel';
import type { LibraryFilters } from './libraryTypes';

const filters: LibraryFilters = { type: 'all', status: 'all', time: 'updated-desc' };

describe('library index model', () => {
  const folders = [
    folder('folder-a', '产品设计', null, '2026-08-16T10:00:00.000Z'),
    folder('folder-b', '评审', 'folder-a', '2026-08-15T10:00:00.000Z')
  ];
  const notes = [
    note('note-root', '根目录笔记', null, 'draft', '2026-08-17T10:00:00.000Z'),
    note('note-a', '设计复盘', 'folder-a', 'published', '2026-08-16T12:00:00.000Z', true),
    note('note-b', '会议记录', 'folder-b', 'active', '2026-08-15T12:00:00.000Z'),
    note('note-deleted', '已删除资料', null, 'draft', '2026-08-14T12:00:00.000Z', false, true)
  ];
  const tags: Tag[] = [{ id: 'tag-design', name: '设计' }];

  it('builds the navigation tree with scope counts and nested folders', () => {
    const nestedFolders = [
      { ...folders[0], children: [{ ...folders[1], children: [] }] }
    ];
    const tree = buildLibraryTreeItems(nestedFolders, notes);

    expect(tree.map((item) => item.label)).toEqual(['全部笔记', '最近编辑', '收藏', '未整理', '产品设计', '回收站']);
    expect(tree[0].count).toBe(3);
    expect(tree[2].count).toBe(1);
    expect(tree[4].children?.[0].label).toBe('评审');
    expect(tree[4].children?.[0].count).toBe(1);
  });

  it('selects root folders and root notes for the all scope', () => {
    const resources = selectLibraryResources({
      folders,
      notes,
      tags,
      scope: 'all',
      selectedFolderId: null,
      tab: 'all',
      filters,
      keyword: '',
      sort: 'updated-desc'
    });

    expect(resources.map((resource) => resource.id)).toEqual([
      'note:note-root',
      'note:note-a',
      'folder:folder-a',
      'note:note-b'
    ]);
  });

  it('limits folder scope to direct children and supports local search/status filters', () => {
    const resources = selectLibraryResources({
      folders,
      notes,
      tags,
      scope: 'folder',
      selectedFolderId: 'folder-a',
      tab: 'all',
      filters: { ...filters, status: 'published' },
      keyword: '设计',
      sort: 'updated-desc'
    });

    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('note:note-a');
  });

  it('keeps recent, favorites and recycle scopes separate from active notes', () => {
    const recent = selectLibraryResources({ folders, notes, tags, scope: 'recent', selectedFolderId: null, tab: 'recent', filters, keyword: '', sort: 'updated-desc' });
    const favorites = selectLibraryResources({ folders, notes, tags, scope: 'favorites', selectedFolderId: null, tab: 'favorites', filters, keyword: '', sort: 'updated-desc' });
    const recycle = selectLibraryResources({ folders, notes, tags, scope: 'recycle', selectedFolderId: null, tab: 'recycle', filters, keyword: '', sort: 'updated-desc' });

    expect(recent.every((resource) => resource.kind === 'note' && !resource.note.deleted)).toBe(true);
    expect(favorites.map((resource) => resource.id)).toEqual(['note:note-a']);
    expect(recycle.map((resource) => resource.id)).toEqual(['note:note-deleted']);
  });

  it('paginates with frozen page sizes and clamps invalid pages', () => {
    const resources = Array.from({ length: 11 }, (_, index) => ({
      kind: 'note' as const,
      id: `note:${index}`,
      note: note(`note-${index}`, `资料 ${index}`, null, 'draft', `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`)
    }));
    const page = paginateResources(resources, 9, 5);

    expect(page.page).toBe(3);
    expect(page.totalPages).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.pageSize).toBe(5);
  });

  it('reports active, favorite and recycle counts from the source notes', () => {
    expect(getLibraryCounts(notes)).toEqual({ all: 3, recent: 3, favorites: 1, recycle: 1 });
  });
});

function folder(id: string, name: string, parentId: string | null, updatedAt: string): Folder {
  return { id, name, parentId, updatedAt, createdAt: updatedAt, children: [] };
}

function note(
  id: string,
  title: string,
  folderId: string | null,
  status: string,
  updatedAt: string,
  favorite = false,
  deleted = false
): Note {
  return {
    id,
    title,
    folderId,
    status,
    updatedAt,
    createdAt: updatedAt,
    spaceId: 'space-1',
    tagIds: favorite ? ['tag-design'] : [],
    internalLinks: [],
    rawMarkdown: `# ${title}`,
    contentLoaded: false,
    favorite,
    deleted
  };
}

import { describe, expect, it, vi } from 'vitest';
import { createApiClient, createWorkspaceApi } from '../src/index.js';

describe('framework-neutral API clients', () => {
  it('preserves the response envelope and friendly API errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: '笔记不存在' } })
    });
    const client = createApiClient({ fetchImpl });
    await expect(client.requestJson('/missing')).rejects.toThrow('笔记不存在');
  });

  it('loads the three workspace resources without UI dependencies', async () => {
    const requestJson = vi.fn(async (url: string) => {
      if (url.includes('folders/tree')) return { data: [{ id: 'folder-1', name: 'Folder' }] };
      if (url.includes('/notes')) return { data: [{ id: 'note-1', title: 'Note' }] };
      return { data: [{ id: 'tag-1', name: 'Tag' }] };
    });
    const resources = await createWorkspaceApi({ requestJson }).loadWorkspaceResources('space-1');
    expect(resources.folderTree[0]?.id).toBe('folder-1');
    expect(resources.notes[0]?.id).toBe('note-1');
    expect(resources.tags[0]?.id).toBe('tag-1');
  });

  it('creates notes and folders with the legacy knowledge API contract', async () => {
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'note-1', title: 'Created note' } })
      .mockResolvedValueOnce({ data: { id: 'folder-1', name: 'Created folder' } });
    const api = createWorkspaceApi({ requestJson });
    const noteInput = { rawMarkdown: '# Created note', spaceId: 'space/1' };
    const folderInput = { name: 'Created folder', spaceId: 'space/1' };

    await expect(api.createNote(noteInput)).resolves.toMatchObject({ id: 'note-1' });
    await expect(api.createFolder(folderInput)).resolves.toMatchObject({ id: 'folder-1' });

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes', {
      method: 'POST',
      body: JSON.stringify(noteInput)
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/folders', {
      method: 'POST',
      body: JSON.stringify(folderInput)
    });
  });

  it('uses the single and batch Markdown import contracts', async () => {
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'import-1', title: 'One' } })
      .mockResolvedValueOnce({ data: [{ id: 'import-2' }, { id: 'import-3' }] });
    const api = createWorkspaceApi({ requestJson });
    const one = [{ title: 'One', rawMarkdown: '# One' }];
    const many = [
      { title: 'Two', rawMarkdown: '# Two' },
      { title: 'Three', rawMarkdown: '# Three' }
    ];

    await expect(api.importMarkdownNotes(one)).resolves.toHaveLength(1);
    await expect(api.importMarkdownNotes(many)).resolves.toHaveLength(2);
    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/import-markdown', {
      method: 'POST', body: JSON.stringify(one[0])
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/notes/import-markdown-batch', {
      method: 'POST', body: JSON.stringify({ items: many })
    });
  });

  it('loads a note detail before editing its markdown body', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { id: 'note/1', title: 'Detail', rawMarkdown: '# Detail' }
    });

    await expect(createWorkspaceApi({ requestJson }).getNote('note/1')).resolves.toMatchObject({
      id: 'note/1',
      rawMarkdown: '# Detail'
    });
    expect(requestJson).toHaveBeenCalledWith('/api/knowledge/notes/note%2F1');
  });

  it('updates and deletes tree entries with encoded legacy routes', async () => {
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'note/1' } })
      .mockResolvedValueOnce({ data: { id: 'note/1' } })
      .mockResolvedValueOnce({ data: { id: 'note/1' } })
      .mockResolvedValueOnce({ data: { id: 'folder/1' } })
      .mockResolvedValueOnce({ data: [{ id: 'folder/1' }] });
    const api = createWorkspaceApi({ requestJson });

    await api.updateNote('note/1', { title: '新名称' });
    await api.setNoteFavorite('note/1', false);
    await api.deleteNote('note/1');
    await api.updateFolder('folder/1', { name: '新目录', parentId: null });
    await api.deleteFolder('folder/1');

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/note%2F1', {
      method: 'PATCH', body: JSON.stringify({ title: '新名称' })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/notes/note%2F1/favorite', {
      method: 'POST', body: JSON.stringify({ favorite: false })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3, '/api/knowledge/notes/note%2F1', { method: 'DELETE' });
    expect(requestJson).toHaveBeenNthCalledWith(4, '/api/knowledge/folders/folder%2F1', {
      method: 'PATCH', body: JSON.stringify({ name: '新目录', parentId: null })
    });
    expect(requestJson).toHaveBeenNthCalledWith(5, '/api/knowledge/folders/folder%2F1', { method: 'DELETE' });
  });

  it('empties a space recycle bin using an encoded query parameter', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: { deleted: 2 } });
    const result = await createWorkspaceApi({ requestJson }).emptyRecycleBin('space/1');

    expect(result).toEqual({ deleted: 2 });
    expect(requestJson).toHaveBeenCalledWith(
      '/api/knowledge/notes/recycle-bin?spaceId=space%2F1',
      { method: 'DELETE' }
    );
  });
});

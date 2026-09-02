import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient, createWorkspaceApi } from '../src/index.js';

describe('framework-neutral API clients', () => {
  it('preserves the response envelope and friendly API errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: '笔记不存在' } })
    });
    const client = createApiClient({ fetchImpl });
    const request = client.requestJson('/missing');
    await expect(request).rejects.toThrow('笔记不存在');
    await expect(request).rejects.toMatchObject<ApiRequestError>({ status: 404, code: null });
  });

  it('preserves the backend conflict code and status for recovery flows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: 'NOTE_UPDATE_CONFLICT', message: 'Note has changed since it was loaded' }
      })
    });
    const client = createApiClient({ fetchImpl });

    await expect(client.requestJson('/notes/note-1')).rejects.toMatchObject<ApiRequestError>({
      status: 409,
      code: 'NOTE_UPDATE_CONFLICT'
    });
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

  it('forwards expectedUpdatedAt when updating note content', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: { id: 'note-1' } });
    const api = createWorkspaceApi({ requestJson });

    await api.updateNote('note-1', {
      rawMarkdown: '# 新正文',
      expectedUpdatedAt: '2026-08-31T01:00:00.000Z'
    });

    expect(requestJson).toHaveBeenCalledWith('/api/knowledge/notes/note-1', {
      method: 'PATCH',
      body: JSON.stringify({
        rawMarkdown: '# 新正文',
        expectedUpdatedAt: '2026-08-31T01:00:00.000Z'
      })
    });
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

  it('connects recycle-bin recovery, note tags and version history contracts', async () => {
    const version = {
      id: 'version/1',
      noteId: 'note/1',
      content: '# 快照',
      contentHash: 'a'.repeat(64),
      createdAt: '2026-09-01T10:00:00.000Z',
      createdBy: 'user'
    };
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'note/1' } })
      .mockResolvedValueOnce({ data: { id: 'note/1' } })
      .mockResolvedValueOnce({ data: { id: 'note/1', tagIds: ['tag/1'] } })
      .mockResolvedValueOnce({ data: [version] })
      .mockResolvedValueOnce({ data: version });
    const api = createWorkspaceApi({ requestJson });

    await api.restoreNote('note/1');
    await api.permanentlyDeleteNote('note/1');
    await api.setNoteTags('note/1', ['tag/1']);
    await expect(api.listNoteVersions('note/1')).resolves.toHaveLength(1);
    await expect(api.getNoteVersion('note/1', 'version/1')).resolves.toMatchObject({ id: 'version/1' });

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/note%2F1/restore', { method: 'POST' });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/notes/note%2F1/permanent', { method: 'DELETE' });
    expect(requestJson).toHaveBeenNthCalledWith(3, '/api/knowledge/notes/note%2F1/tags', {
      method: 'PUT', body: JSON.stringify({ tagIds: ['tag/1'] })
    });
    expect(requestJson).toHaveBeenNthCalledWith(4, '/api/knowledge/notes/note%2F1/versions');
    expect(requestJson).toHaveBeenNthCalledWith(5, '/api/knowledge/notes/note%2F1/versions/version%2F1');
  });

  it('connects note organization and attachment management contracts', async () => {
    const attachment = {
      id: 'attachment/1', noteId: 'note/1', fileName: 'diagram.png',
      mimeType: 'image/png', size: 128, status: 'ready'
    };
    const uploadInput = {
      noteId: 'note/1', fileName: 'diagram.png', mimeType: 'image/png', contentBase64: 'aW1hZ2U='
    };
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'note/1', folderId: 'folder/2', status: 'active' } })
      .mockResolvedValueOnce({ data: [attachment] })
      .mockResolvedValueOnce({ data: attachment })
      .mockResolvedValueOnce({ data: { ...attachment, fileName: 'renamed.png' } })
      .mockResolvedValueOnce({ data: attachment });
    const api = createWorkspaceApi({ requestJson });

    await api.updateNote('note/1', { folderId: 'folder/2', status: 'active' });
    await expect(api.listNoteAttachments('note/1')).resolves.toEqual([attachment]);
    await expect(api.uploadNoteAttachment(uploadInput)).resolves.toMatchObject({ id: 'attachment/1' });
    await api.renameNoteAttachment('attachment/1', 'renamed.png');
    await api.deleteNoteAttachment('attachment/1');

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/note%2F1', {
      method: 'PATCH', body: JSON.stringify({ folderId: 'folder/2', status: 'active' })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/storage/attachments?noteId=note%2F1');
    expect(requestJson).toHaveBeenNthCalledWith(3, '/api/storage/attachments', {
      method: 'POST', body: JSON.stringify(uploadInput)
    });
    expect(requestJson).toHaveBeenNthCalledWith(4, '/api/storage/attachments/attachment%2F1', {
      method: 'PATCH', body: JSON.stringify({ fileName: 'renamed.png' })
    });
    expect(requestJson).toHaveBeenNthCalledWith(5, '/api/storage/attachments/attachment%2F1', { method: 'DELETE' });
  });

  it('connects batch note actions and paged server-side filtering', async () => {
    const notes = Array.from({ length: 31 }, (_, index) => ({ id: `note-${index + 1}`, title: `Note ${index + 1}` }));
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: notes.slice(0, 2) })
      .mockResolvedValueOnce({ data: notes.slice(0, 2) })
      .mockResolvedValueOnce({ data: notes });
    const api = createWorkspaceApi({ requestJson });

    await api.deleteNotes(['note-1', 'note-2']);
    await api.assignTagToNotes(['note-1', 'note-2'], 'tag/1');
    await expect(api.queryNotes({
      query: '注意力', spaceId: 'space/1', folderId: 'folder/1', favoriteOnly: true,
      sortBy: 'updatedAt', order: 'desc', offset: 30, limit: 30
    })).resolves.toEqual({ items: notes.slice(0, 30), hasNext: true });

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/batch/delete', {
      method: 'POST', body: JSON.stringify({ noteIds: ['note-1', 'note-2'] })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/notes/batch/tags', {
      method: 'POST', body: JSON.stringify({ noteIds: ['note-1', 'note-2'], tagId: 'tag/1' })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3,
      '/api/knowledge/search/notes?query=%E6%B3%A8%E6%84%8F%E5%8A%9B&spaceId=space%2F1&folderId=folder%2F1&favoriteOnly=true&sortBy=updatedAt&order=desc&offset=30&limit=31'
    );
  });

  it('connects linked-note and content-annotation contracts', async () => {
    const annotation = { id: 'annotation/1', noteId: 'note/1', quoteText: '重要内容' };
    const createInput = {
      spaceId: 'space/1', noteId: 'note/1', quoteText: '重要内容', headingPath: ['结论'],
      fromPosition: 1, toPosition: 5, prefixText: '', suffixText: '', anchorFingerprint: 'fingerprint',
      noteContentHash: 'hash', idempotencyKey: 'request-1', kind: 'important' as const, sourceMode: 'manual' as const
    };
    const anchorInput = {
      quoteText: '新位置', headingPath: ['结论'], fromPosition: 6, toPosition: 9,
      prefixText: '', suffixText: '', anchorFingerprint: 'next-fingerprint', noteContentHash: 'next-hash'
    };
    const requestJson = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 'note-2' }] })
      .mockResolvedValueOnce({ data: [annotation] })
      .mockResolvedValueOnce({ data: annotation })
      .mockResolvedValueOnce({ data: annotation })
      .mockResolvedValueOnce({ data: annotation })
      .mockResolvedValueOnce({ data: annotation });
    const api = createWorkspaceApi({ requestJson });

    await api.getLinkedNotes('note/1');
    await api.listAnnotations('note/1', 'space/1');
    await api.createAnnotation(createInput);
    await api.deleteAnnotation('annotation/1');
    await api.restoreAnnotation('annotation/1');
    await api.updateAnnotationAnchor('annotation/1', anchorInput);

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/knowledge/notes/note%2F1/links');
    expect(requestJson).toHaveBeenNthCalledWith(2, '/api/knowledge/annotations?noteId=note%2F1&spaceId=space%2F1&includeDeleted=true');
    expect(requestJson).toHaveBeenNthCalledWith(3, '/api/knowledge/annotations', { method: 'POST', body: JSON.stringify(createInput) });
    expect(requestJson).toHaveBeenNthCalledWith(4, '/api/knowledge/annotations/annotation%2F1', { method: 'DELETE' });
    expect(requestJson).toHaveBeenNthCalledWith(5, '/api/knowledge/annotations/annotation%2F1/restore', { method: 'POST' });
    expect(requestJson).toHaveBeenNthCalledWith(6, '/api/knowledge/annotations/annotation%2F1/anchor', { method: 'PATCH', body: JSON.stringify(anchorInput) });
  });
});

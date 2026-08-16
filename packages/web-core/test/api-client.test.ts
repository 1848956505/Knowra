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
});

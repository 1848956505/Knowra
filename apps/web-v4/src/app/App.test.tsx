import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyWorkspaceSnapshot, type WorkspaceApi } from '@study-accelerator/web-core';
import { App } from './App';
import { AppProviders } from './AppProviders';
import { createAppStore } from '../store/createAppStore';

describe('V4 workspace bootstrap', () => {
  it('deduplicates workspace loading under React Strict Mode', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(
      <StrictMode>
        <AppProviders store={store}>
          <App />
        </AppProviders>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('知识库已连接'));
    expect(screen.getByText('资料 1 条')).toBeInTheDocument();
    expect(api.listKnowledgeSpaces).toHaveBeenCalledTimes(1);
    expect(api.loadWorkspaceResources).toHaveBeenCalledTimes(1);
  });

  it('shows local recovery and retries after a failed load', async () => {
    const api = createWorkspaceApiStub();
    vi.mocked(api.listKnowledgeSpaces)
      .mockRejectedValueOnce(new Error('网络不可用'))
      .mockResolvedValueOnce([{ id: 'space-1', name: 'Main' }]);
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);

    expect(await screen.findByRole('alert')).toHaveTextContent('网络不可用');
    expect(screen.getByText('数据模式：local')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('知识库已连接'));
    expect(api.listKnowledgeSpaces).toHaveBeenCalledTimes(2);
  });
});

function createWorkspaceApiStub(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-1', name: 'Main' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-1', name: 'Main' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({
      folderTree: [{ id: 'folder-1', name: 'Folder', parentId: null, children: [] }],
      notes: [{
        id: 'note-1',
        title: 'Note',
        folderId: 'folder-1',
        tagIds: [],
        internalLinks: [],
        rawMarkdown: '',
        contentLoaded: false,
        favorite: false,
        deleted: false
      }],
      tags: []
    }),
    searchNoteIds: vi.fn().mockResolvedValue([])
  };
}

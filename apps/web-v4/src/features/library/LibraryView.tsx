import type { Note } from '@study-accelerator/web-core';
import { Button, EmptyState, LoadingState, Tabs } from '../../components/ui';
import { FolderIcon, PlusIcon, RefreshIcon } from '../../shell/icons';
import { useAppStore } from '../../store/AppStoreProvider';
import { LibraryDialogs } from './LibraryDialogs';
import { LibraryInspector } from './LibraryInspector';
import { LibraryPagination } from './LibraryPagination';
import { LibraryResourceList } from './LibraryResourceList';
import { LibrarySidebar } from './LibrarySidebar';
import { LibraryToolbar } from './LibraryToolbar';
import { LIBRARY_TABS, type LibraryTimeSort } from './libraryTypes';
import { useLibraryActions } from './useLibraryActions';
import { useLibraryIndex } from './useLibraryIndex';
import styles from './Library.module.css';

export interface LibraryViewProps {
  onRetry(): void;
  onOpenNote?(note: Note): void;
}

export function LibraryView({ onRetry, onOpenNote }: LibraryViewProps) {
  const index = useLibraryIndex();
  const loadState = useAppStore((state) => state.workspaceLoadState);
  const workspaceError = useAppStore((state) => state.workspaceError);
  const actions = useLibraryActions({ index, onOpenNote });

  if (loadState === 'loading' && index.serverData.notes.length === 0) {
    return <div className={styles.libraryState}><LoadingState label="正在加载资料目录…" /></div>;
  }
  if (loadState === 'error' && index.serverData.notes.length === 0) {
    return (
      <div className={styles.libraryState}>
        <EmptyState
          title="资料目录加载失败"
          description={workspaceError ?? '请检查资料服务后重试。'}
          primaryAction={<Button variant="primary" onClick={onRetry}><RefreshIcon size={14} />重试</Button>}
        />
      </div>
    );
  }

  const isRecycle = index.scope === 'recycle' || index.tab === 'recycle';
  const selectedFolderName = index.navigation.selectedFolderId
    ? index.serverData.foldersById[index.navigation.selectedFolderId]?.name
    : null;

  return (
    <div className={styles.libraryView}>
      <header className={styles.libraryHeader}>
        <div>
          <p className={styles.breadcrumb}>笔记库 <span aria-hidden="true">/</span> {selectedFolderName ?? index.title}</p>
          <h1>{index.title}</h1>
          <p className={styles.librarySubtitle}>资料目录与索引 <span aria-hidden="true">·</span> {index.pageData.totalItems} 条结果</p>
        </div>
        <div className={styles.libraryHeaderActions}>
          <Button variant="ghost" onClick={() => actions.onInspectorCollapsedChange((value) => !value)} aria-label={actions.inspectorCollapsed ? '展开资料详情' : '收起资料详情'}>
            <FolderIcon size={15} />
            {actions.inspectorCollapsed ? '显示详情' : '隐藏详情'}
          </Button>
          <Button variant="accent" onClick={actions.openNoteDialog} isDisabled={!actions.canWrite}>
            <PlusIcon size={15} />
            新建笔记
          </Button>
        </div>
      </header>
      {actions.actionError ? <div className={styles.actionError} role="alert">{actions.actionError}</div> : null}
      <div className={styles.libraryLayout}>
        <LibrarySidebar
          foldersById={index.serverData.foldersById}
          items={index.treeItems}
          selectedKey={index.selectedTreeKey}
          selectedFolderId={index.navigation.selectedFolderId}
          onSelect={index.selectTreeItem}
          onCreateFolder={actions.openFolderDialog}
          onRenameFolder={actions.handleRenameFolder}
          onDeleteFolder={(folderId) => {
            const folder = index.serverData.foldersById[folderId];
            if (folder) actions.onConfirmActionChange({ kind: 'delete-folder', resource: { kind: 'folder', id: `folder:${folder.id}`, folder } });
          }}
          onMoveFolder={actions.handleMoveFolder}
          onError={actions.onActionError}
        />
        <main className={styles.libraryMain} aria-labelledby="library-index-title">
          <div className={styles.indexToolbarHeader}>
            <div>
              <span className={styles.eyebrow}>INDEX / {index.viewMode.toUpperCase()}</span>
              <h2 id="library-index-title">{index.title}</h2>
            </div>
            <span className={styles.resultSummary}>第 {index.pageData.page} / {index.pageData.totalPages} 页 · 共 {index.pageData.totalItems} 条</span>
          </div>
          <Tabs
            items={LIBRARY_TABS.map((item) => ({ id: item.id, label: item.label, badge: index.counts[item.id] }))}
            aria-label="资料范围"
            selectedKey={index.scope === 'folder' || index.scope === 'unfiled' ? 'all' : index.tab}
            onSelectionChange={(key) => index.selectTab(String(key) as typeof index.tab)}
          >
            {() => null}
          </Tabs>
          <LibraryToolbar
            filters={index.filters}
            keyword={index.keyword}
            sort={index.sort}
            viewMode={index.viewMode}
            onKeywordChange={index.setKeyword}
            onTypeChange={(value) => index.setFilters({ type: value })}
            onStatusChange={(value) => index.setFilters({ status: value })}
            onTimeChange={(value: LibraryTimeSort) => {
              index.setFilters({ time: value });
              index.setSort(value);
            }}
            onSortChange={index.setSort}
            onViewModeChange={index.setViewMode}
            onReset={index.resetFilters}
          />
          <LibraryResourceList
            items={index.pageData.items}
            selectedId={index.selectedResourceId}
            viewMode={index.viewMode}
            foldersById={index.serverData.foldersById}
            tags={index.serverData.tags}
            isRecycle={isRecycle}
            onSelect={index.selectResource}
            onOpen={actions.handleOpen}
            onToggleFavorite={actions.handleToggleFavorite}
            onDelete={actions.handleDelete}
            onRestore={actions.handleRestore}
            onPermanentDelete={actions.handlePermanentDelete}
          />
          <LibraryPagination
            page={index.pageData.page}
            totalPages={index.pageData.totalPages}
            pageSize={index.pageData.pageSize}
            totalItems={index.pageData.totalItems}
            onPage={index.setPage}
            onPageSize={index.setPageSize}
          />
        </main>
        <LibraryInspector
          resource={index.selectedResource}
          foldersById={index.serverData.foldersById}
          notes={index.serverData.notes}
          tags={index.serverData.tags}
          isRecycle={isRecycle}
          collapsed={actions.inspectorCollapsed}
          onToggleCollapsed={() => actions.onInspectorCollapsedChange((value) => !value)}
          onOpen={actions.handleOpen}
          onToggleFavorite={actions.handleToggleFavorite}
          onDelete={actions.handleDelete}
          onRestore={actions.handleRestore}
          onPermanentDelete={actions.handlePermanentDelete}
          onSetTags={actions.handleSetTags}
          onError={actions.onActionError}
        />
      </div>
      <LibraryDialogs
        folderOpen={actions.folderDialogOpen}
        folderParentId={actions.folderParentId}
        noteOpen={actions.noteDialogOpen}
        folders={Object.values(index.serverData.foldersById)}
        confirmAction={actions.confirmAction}
        pending={actions.pending}
        onFolderOpenChange={actions.onFolderDialogChange}
        onNoteOpenChange={actions.onNoteDialogChange}
        onConfirmOpenChange={(open) => {
          if (!open) actions.onConfirmActionChange(null);
        }}
        onCreateFolder={actions.handleCreateFolder}
        onCreateNote={actions.handleCreateNote}
        onConfirm={actions.handleConfirm}
      />
    </div>
  );
}

import type { Folder, Note, Tag } from '@study-accelerator/web-core';
import { Badge, Button, EmptyState, GridList, IconButton, Menu, MenuItem, MenuPopover, MenuTrigger, type GridListColumn } from '../../components/ui';
import { ArrowUpRightIcon, FolderIcon, MoreIcon, NoteIcon, RefreshIcon, StarIcon, TrashIcon } from '../../shell/icons';
import { getLocationLabel, getSourceTypeLabel, getStatusLabel, getTimeLabel } from './libraryModel';
import type { LibraryResource, LibraryViewMode } from './libraryTypes';
import styles from './Library.module.css';

interface LibraryResourceListProps {
  items: LibraryResource[];
  selectedId: string | null;
  viewMode: LibraryViewMode;
  foldersById: Record<string, Folder>;
  tags: Tag[];
  isRecycle: boolean;
  onSelect(resource: LibraryResource): void;
  onOpen(resource: LibraryResource): void;
  onToggleFavorite(note: Note): void;
  onDelete(resource: LibraryResource): void;
  onRestore(note: Note): void;
  onPermanentDelete(note: Note): void;
}

export function LibraryResourceList({
  items,
  selectedId,
  viewMode,
  foldersById,
  tags,
  isRecycle,
  onSelect,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete
}: LibraryResourceListProps) {
  if (viewMode === 'grid') {
    return (
      <div className={styles.resourceGrid} role="list" aria-label="资料网格">
        {items.length === 0 ? <ResourceEmpty /> : items.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            selected={resource.id === selectedId}
            foldersById={foldersById}
            isRecycle={isRecycle}
            onSelect={onSelect}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
            onRestore={onRestore}
            onPermanentDelete={onPermanentDelete}
          />
        ))}
      </div>
    );
  }

  const columns: GridListColumn<LibraryResource>[] = [
    {
      id: 'name',
      title: true,
      template: 'minmax(220px, 2fr)',
      cell: (resource) => <ResourceName resource={resource} />
    },
    {
      id: 'status',
      template: '0.7fr',
      cell: (resource) => <ResourceStatus resource={resource} isRecycle={isRecycle} />
    },
    {
      id: 'location',
      template: '0.9fr',
      cell: (resource) => (
        <span className={styles.resourceLocation}>
          {resource.kind === 'folder' ? '资料库' : getLocationLabel(resource.note, foldersById)}
        </span>
      )
    },
    {
      id: 'updated',
      template: '0.9fr',
      cell: (resource) => (
        <time className={styles.resourceTime} dateTime={resource.kind === 'folder' ? resource.folder.updatedAt : resource.note.updatedAt}>
          {getTimeLabel(resource.kind === 'folder' ? resource.folder.updatedAt : resource.note.updatedAt)}
        </time>
      )
    },
    {
      id: 'actions',
      template: '48px',
      align: 'right',
      cell: (resource) => (
        <ResourceActions
          resource={resource}
          isRecycle={isRecycle}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDelete}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      )
    }
  ];

  return (
    <GridList
      ariaLabel="资料列表"
      items={items}
      columns={columns}
      getKey={(resource) => resource.id}
      getTextValue={(resource) => `${getResourceTitle(resource)} ${resource.kind === 'folder' ? '文件夹' : getSourceTypeLabel(resource.note.sourceType)}`}
      selectedKeys={selectedId ? new Set([selectedId]) : new Set()}
      onSelectionChange={(keys) => {
        if (keys === 'all') return;
        const key = [...keys][0];
        const resource = items.find((candidate) => candidate.id === String(key));
        if (resource) onSelect(resource);
      }}
      onItemAction={(key) => {
        const resource = items.find((candidate) => candidate.id === String(key));
        if (resource) onOpen(resource);
      }}
      emptyState={<ResourceEmpty />}
      className={styles.resourceList}
    />
  );
}

function ResourceCard({
  resource,
  selected,
  foldersById,
  isRecycle,
  onSelect,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete
}: {
  resource: LibraryResource;
  selected: boolean;
  foldersById: Record<string, Folder>;
  isRecycle: boolean;
  onSelect(resource: LibraryResource): void;
  onOpen(resource: LibraryResource): void;
  onToggleFavorite(note: Note): void;
  onDelete(resource: LibraryResource): void;
  onRestore(note: Note): void;
  onPermanentDelete(note: Note): void;
}) {
  return (
    <div className={styles.resourceCardWrap} role="listitem">
      <Button
        variant={selected ? 'default' : 'ghost'}
        className={styles.resourceCard}
        aria-pressed={selected}
        onClick={() => onSelect(resource)}
        aria-label={`${resource.kind === 'folder' ? '文件夹' : '文稿'} ${getResourceTitle(resource)}`}
      >
        <span className={styles.cardIcon} aria-hidden="true">
          {resource.kind === 'folder' ? <FolderIcon size={23} /> : <NoteIcon size={23} />}
        </span>
        <span className={styles.cardCopy}>
          <strong>{getResourceTitle(resource)}</strong>
          <span>{resource.kind === 'folder' ? '文件夹' : getLocationLabel(resource.note, foldersById)}</span>
        </span>
        {resource.kind === 'note' && resource.note.favorite ? <StarIcon size={14} /> : null}
      </Button>
      <span className={styles.cardOpen}>
        <IconButton variant="ghost" aria-label={`打开 ${getResourceTitle(resource)}`} onClick={() => onOpen(resource)}>
          <ArrowUpRightIcon size={14} />
        </IconButton>
      </span>
      <ResourceActions
        resource={resource}
        isRecycle={isRecycle}
        onOpen={onOpen}
        onToggleFavorite={onToggleFavorite}
        onDelete={onDelete}
        onRestore={onRestore}
        onPermanentDelete={onPermanentDelete}
      />
    </div>
  );
}

function ResourceName({ resource }: { resource: LibraryResource }) {
  return (
    <span className={styles.resourceName}>
      <span className={styles.resourceIcon} aria-hidden="true">
        {resource.kind === 'folder' ? <FolderIcon size={17} /> : <NoteIcon size={17} />}
      </span>
      <span className={styles.resourceNameCopy}>
        <strong title={getResourceTitle(resource)}>{getResourceTitle(resource)}</strong>
        {resource.kind === 'note' ? <small>{getSourceTypeLabel(resource.note.sourceType)}</small> : <small>目录</small>}
      </span>
    </span>
  );
}

function ResourceStatus({ resource, isRecycle }: { resource: LibraryResource; isRecycle: boolean }) {
  if (resource.kind === 'folder') return <Badge tone="neutral">文件夹</Badge>;
  return <Badge tone={isRecycle ? 'danger' : getStatusTone(resource.note.status)}>{isRecycle ? '已删除' : getStatusLabel(resource.note.status)}</Badge>;
}

function ResourceActions({
  resource,
  isRecycle,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete
}: {
  resource: LibraryResource;
  isRecycle: boolean;
  onOpen(resource: LibraryResource): void;
  onToggleFavorite(note: Note): void;
  onDelete(resource: LibraryResource): void;
  onRestore(note: Note): void;
  onPermanentDelete(note: Note): void;
}) {
  return (
    <span className={styles.resourceActions} onClick={(event) => event.stopPropagation()}>
      <MenuTrigger>
        <IconButton variant="ghost" aria-label={`${getResourceTitle(resource)}更多操作`}>
          <MoreIcon size={15} />
        </IconButton>
        <MenuPopover>
          <Menu ariaLabel={`${getResourceTitle(resource)}操作`} onAction={(key) => {
            if (key === 'open') onOpen(resource);
            if (resource.kind === 'note' && key === 'favorite') onToggleFavorite(resource.note);
            if (resource.kind === 'note' && key === 'restore') onRestore(resource.note);
            if (resource.kind === 'note' && key === 'permanent') onPermanentDelete(resource.note);
            if (key === 'delete') onDelete(resource);
          }}>
            <MenuItem id="open" icon={<ArrowUpRightIcon size={13} />}>打开</MenuItem>
            {resource.kind === 'note' && !isRecycle ? (
              <MenuItem id="favorite" icon={<StarIcon size={13} />}>
                {resource.note.favorite ? '取消收藏' : '加入收藏'}
              </MenuItem>
            ) : null}
            {resource.kind === 'note' && isRecycle ? (
              <MenuItem id="restore" icon={<RefreshGlyph />}>恢复</MenuItem>
            ) : null}
            {resource.kind === 'note' && isRecycle ? (
              <MenuItem id="permanent" icon={<TrashIcon size={13} />} isDanger>永久删除</MenuItem>
            ) : (
              <MenuItem id="delete" icon={<TrashIcon size={13} />} isDanger>
                {resource.kind === 'folder' ? '删除目录' : '移入回收站'}
              </MenuItem>
            )}
          </Menu>
        </MenuPopover>
      </MenuTrigger>
    </span>
  );
}

function RefreshGlyph() {
  return <RefreshIcon size={13} />;
}

function ResourceEmpty() {
  return (
    <EmptyState
      title="没有匹配的资料"
      description="调整目录、筛选或局部搜索后再试。"
    />
  );
}

function getResourceTitle(resource: LibraryResource): string {
  return resource.kind === 'folder' ? resource.folder.name : resource.note.title || '无标题';
}

function getStatusTone(status: unknown): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  if (status === 'published') return 'success';
  if (status === 'archived') return 'neutral';
  if (status === 'active') return 'accent';
  return 'warning';
}

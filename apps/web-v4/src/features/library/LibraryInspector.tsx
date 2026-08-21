import type { Folder, Note, Tag } from '@study-accelerator/web-core';
import { Button, IconButton, Menu, MenuItem, MenuPopover, MenuTrigger, TagGroup } from '../../components/ui';
import { ArrowUpRightIcon, AttachmentIcon, LinkIcon, NoteIcon, OutlineIcon, PanelIcon, RefreshIcon, StarIcon, TrashIcon } from '../../shell/icons';
import { getLocationLabel, getSourceTypeLabel, getStatusLabel } from './libraryModel';
import type { LibraryResource } from './libraryTypes';
import styles from './Library.module.css';

interface LibraryInspectorProps {
  resource: LibraryResource | null;
  foldersById: Record<string, Folder>;
  notes: Note[];
  tags: Tag[];
  isRecycle: boolean;
  collapsed: boolean;
  onToggleCollapsed(): void;
  onOpen(resource: LibraryResource): void;
  onToggleFavorite(note: Note): void;
  onDelete(resource: LibraryResource): void;
  onRestore(note: Note): void;
  onPermanentDelete(note: Note): void;
  onSetTags(noteId: string, tagIds: string[]): Promise<void>;
  onError(message: string): void;
}
export function LibraryInspector({
  resource,
  foldersById,
  notes,
  tags,
  isRecycle,
  collapsed,
  onToggleCollapsed,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete,
  onSetTags,
  onError
}: LibraryInspectorProps) {
  if (collapsed) {
    return (
      <aside className={styles.inspectorCollapsed} aria-label="资料详情">
        <IconButton variant="ghost" aria-label="展开资料详情" onClick={onToggleCollapsed}>
          <PanelIcon size={17} />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside className={styles.inspector} aria-label="资料详情">
      <div className={styles.inspectorHeader}>
        <div>
          <span className={styles.eyebrow}>QUICK LOOK</span>
          <h2>资料预览</h2>
        </div>
        <IconButton variant="ghost" aria-label="收起资料详情" onClick={onToggleCollapsed}>
          <PanelIcon size={16} />
        </IconButton>
      </div>
      {resource ? (
        resource.kind === 'folder' ? (
          <FolderInspector resource={resource} notes={notes} onOpen={onOpen} onDelete={onDelete} />
        ) : (
          <NoteInspector
            resource={resource}
            foldersById={foldersById}
            notes={notes}
            tags={tags}
            isRecycle={isRecycle}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
            onRestore={onRestore}
            onPermanentDelete={onPermanentDelete}
            onSetTags={onSetTags}
            onError={onError}
          />
        )
      ) : (
        <div className={styles.inspectorEmpty}>
          <NoteIcon size={22} />
          <p>选择一项资料查看详情。</p>
        </div>
      )}
    </aside>
  );
}

function FolderInspector({
  resource,
  notes,
  onOpen,
  onDelete
}: {
  resource: Extract<LibraryResource, { kind: 'folder' }>;
  notes: Note[];
  onOpen(resource: LibraryResource): void;
  onDelete(resource: LibraryResource): void;
}) {
  const noteCount = notes.filter((note) => !note.deleted && note.folderId === resource.folder.id).length;
  return (
    <div className={styles.inspectorBody}>
      <div className={styles.inspectorResourceTitle}>
        <span className={styles.inspectorIcon}><span className={styles.folderMark} /></span>
        <div>
          <h3>{resource.folder.name}</h3>
          <p>目录</p>
        </div>
      </div>
      <InspectorSection title="目录信息">
        <InfoRow label="资料数量" value={`${noteCount} 条`} />
        <InfoRow label="路径" value={resource.folder.pathCache ?? '/'} />
        <InfoRow label="创建时间" value={formatDate(resource.folder.createdAt)} />
      </InspectorSection>
      <div className={styles.inspectorActions}>
        <Button variant="primary" onClick={() => onOpen(resource)}>
          <ArrowUpRightIcon size={14} />
          打开目录
        </Button>
        <Button variant="danger" onClick={() => onDelete(resource)}>
          <TrashIcon size={14} />
          删除目录
        </Button>
      </div>
    </div>
  );
}

function NoteInspector({
  resource,
  foldersById,
  notes,
  tags,
  isRecycle,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete,
  onSetTags,
  onError
}: {
  resource: Extract<LibraryResource, { kind: 'note' }>;
  foldersById: Record<string, Folder>;
  notes: Note[];
  tags: Tag[];
  isRecycle: boolean;
  onOpen(resource: LibraryResource): void;
  onToggleFavorite(note: Note): void;
  onDelete(resource: LibraryResource): void;
  onRestore(note: Note): void;
  onPermanentDelete(note: Note): void;
  onSetTags(noteId: string, tagIds: string[]): Promise<void>;
  onError(message: string): void;
}) {
  const note = resource.note;
  const currentTags = note.tagIds
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is Tag => Boolean(tag && tag.name))
    .map((tag) => ({ id: tag.id, label: tag.name!, tone: 'accent' as const }));
  const outline = getOutline(note);
  const linkedNotes = note.internalLinks
    .map((id) => notes.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Note => Boolean(candidate && !candidate.deleted));
  const attachmentCount = getAttachmentCount(note);

  async function removeTags(keys: Set<React.Key>) {
    const removed = new Set([...keys].map(String));
    try {
      await onSetTags(note.id, note.tagIds.filter((tagId) => !removed.has(tagId)));
    } catch (error) {
      onError(error instanceof Error ? error.message : '移除标签失败。');
    }
  }

  return (
    <div className={styles.inspectorBody}>
      <div className={styles.inspectorResourceTitle}>
        <span className={styles.inspectorIcon}><NoteIcon size={20} /></span>
        <div>
          <h3 title={note.title}>{note.title}</h3>
          <p>{getSourceTypeLabel(note.sourceType)}</p>
        </div>
      </div>
      <div className={styles.inspectorActions}>
        {!isRecycle ? (
          <Button variant="primary" onClick={() => onOpen(resource)}>
            <ArrowUpRightIcon size={14} />
            打开资料
          </Button>
        ) : (
          <Button variant="primary" onClick={() => onRestore(note)}>
            <RefreshIcon size={14} />
            恢复资料
          </Button>
        )}
        <IconButton
          variant={note.favorite ? 'accent' : 'ghost'}
          aria-label={note.favorite ? '取消收藏' : '加入收藏'}
          onClick={() => onToggleFavorite(note)}
          isDisabled={isRecycle}
        >
          <StarIcon size={15} />
        </IconButton>
      </div>
      <InspectorSection title="资料信息">
        <InfoRow label="状态" value={isRecycle ? '已删除' : getStatusLabel(note.status)} />
        <InfoRow label="位置" value={getLocationLabel(note, foldersById)} />
        <InfoRow label="最近更新" value={formatDate(note.updatedAt)} />
        <InfoRow label="阅读时长" value={`${getReadingMinutes(note)} 分钟`} />
      </InspectorSection>
      <InspectorSection title="标签" trailing={<AddTagMenu note={note} tags={tags} onSetTags={onSetTags} onError={onError} />}>
        {currentTags.length > 0 ? (
          <TagGroup label="当前标签" items={currentTags} visibleLabel={false} onRemove={removeTags} />
        ) : <p className={styles.inspectorMuted}>暂无标签</p>}
      </InspectorSection>
      <InspectorSection title="关联资料" trailing={<span className={styles.sectionCount}>{linkedNotes.length}</span>}>
        {linkedNotes.length > 0 ? (
          <ul className={styles.inspectorList}>
            {linkedNotes.map((linked) => <li key={linked.id}><LinkIcon size={13} /><span>{linked.title}</span></li>)}
          </ul>
        ) : <p className={styles.inspectorMuted}>暂无双向链接</p>}
      </InspectorSection>
      <InspectorSection title="大纲" trailing={<span className={styles.sectionCount}>{outline.length}</span>}>
        {outline.length > 0 ? (
          <ol className={styles.outlineList}>
            {outline.slice(0, 8).map((item, index) => <li key={`${item.title}-${index}`} data-level={item.level}>{item.title}</li>)}
          </ol>
        ) : <p className={styles.inspectorMuted}><OutlineIcon size={13} /> 暂无标题大纲</p>}
      </InspectorSection>
      <InspectorSection title="附件" trailing={<span className={styles.sectionCount}>{attachmentCount}</span>}>
        <p className={styles.inspectorMuted}><AttachmentIcon size={13} /> {attachmentCount ? '附件将在编辑器中打开' : '暂无附件'}</p>
      </InspectorSection>
      <div className={styles.inspectorDangerZone}>
        {isRecycle ? (
          <Button variant="danger" onClick={() => onPermanentDelete(note)}>
            <TrashIcon size={14} />
            永久删除
          </Button>
        ) : (
          <Button variant="danger" onClick={() => onDelete(resource)}>
            <TrashIcon size={14} />
            移入回收站
          </Button>
        )}
      </div>
    </div>
  );
}

function AddTagMenu({
  note,
  tags,
  onSetTags,
  onError
}: {
  note: Note;
  tags: Tag[];
  onSetTags(noteId: string, tagIds: string[]): Promise<void>;
  onError(message: string): void;
}) {
  const available = tags.filter((tag) => tag.name && !note.tagIds.includes(tag.id));
  if (available.length === 0) return null;
  return (
    <MenuTrigger>
      <Button variant="ghost" className={styles.inlineAction}>添加</Button>
      <MenuPopover>
        <Menu ariaLabel="添加标签" onAction={(key) => {
          void onSetTags(note.id, [...note.tagIds, String(key)]).catch((error) => onError(error instanceof Error ? error.message : '添加标签失败。'));
        }}>
          {available.map((tag) => <MenuItem key={tag.id} id={tag.id}>{tag.name}</MenuItem>)}
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}

function InspectorSection({ title, trailing, children }: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorSectionHeader}><h4>{title}</h4>{trailing}</div>
      <div className={styles.inspectorSectionBody}>{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className={styles.infoRow}><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function getOutline(note: Note): Array<{ level: number; title: string }> {
  const fromSummary = note['outline'];
  if (Array.isArray(fromSummary)) {
    return fromSummary.filter((item): item is { level: number; title: string } => (
      Boolean(item && typeof item === 'object' && 'title' in item)
    ));
  }
  return String(note.rawMarkdown ?? '').split('\n').flatMap((line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    return match ? [{ level: match[1].length, title: match[2].trim() }] : [];
  });
}

function getAttachmentCount(note: Note): number {
  const markdownMatches = String(note.rawMarkdown ?? '').match(/!\[[^\]]*\]\([^)]*\)/g) ?? [];
  const attachments = note['attachments'];
  return Array.isArray(attachments) ? Math.max(markdownMatches.length, attachments.length) : markdownMatches.length;
}

function getReadingMinutes(note: Note): number {
  const count = Number(note['characterCount']);
  if (Number.isFinite(count) && count > 0) return Math.max(1, Math.ceil(count / 360));
  return Math.max(1, Math.ceil(String(note.rawMarkdown ?? '').replace(/\s/g, '').length / 360));
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

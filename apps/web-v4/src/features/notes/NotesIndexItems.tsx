import type { Folder, Note } from '@study-accelerator/web-core';
import { Checkbox } from '../../components/ui';
import type { SidebarTreeAction } from './SidebarFolderTree';
import { countFolderNotes, formatUpdatedAt } from './notesIndexModel';
import { folderLocation, displayNoteStatus } from './notesIndexNavigation';
import { itemKey, statusClassName, documentToneClass, type IndexItem } from './notesIndexPresentation';
import { IndexItemActions, RecycleNoteActions, openIndexItemMenu } from './IndexItemActions';
import styles from './NotesIndexItems.module.css';

export function NotesTable({ items, selectedNoteId, onSelectFolder, onSelectNote, foldersById, isRecycleView, recyclePendingId, onRestore, onRequestPermanentDelete, selectionMode, selectedNoteIds, onToggleSelection, canWrite, onItemAction }: {
  items: IndexItem[];
  selectedNoteId: string | null;
  onSelectFolder(id: string): void;
  onSelectNote(id: string): void;
  foldersById: Record<string, Folder>;
  isRecycleView: boolean;
  recyclePendingId: string | null;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
  selectionMode: boolean;
  selectedNoteIds: Set<string>;
  onToggleSelection(noteId: string, selected: boolean): void;
  canWrite: boolean;
  onItemAction(action: SidebarTreeAction): void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-selection-mode={selectionMode || undefined}>
        <thead><tr>{selectionMode ? <th scope="col" className={styles.selectionColumn}><span className={styles.srOnly}>选择</span></th> : null}<th scope="col" className={styles.nameColumn}>名称</th><th scope="col" className={styles.statusColumn}>状态</th><th scope="col" className={styles.locationColumn}>位置</th><th scope="col" className={styles.updatedColumn}>最近更新</th><th scope="col" className={styles.actionColumn}><span className={styles.srOnly}>操作</span></th></tr></thead>
        <tbody>{items.map((item) => {
          const isFolder = item.kind === 'folder';
          const id = isFolder ? item.folder.id : item.note.id;
          const name = isFolder ? item.folder.name : item.note.title;
          const updatedAt = isFolder ? item.folder.updatedAt : item.note.updatedAt;
          const location = folderLocation(isFolder ? item.folder.parentId : item.note.folderId, foldersById);
          const status = isFolder ? '文件夹' : (item.note.deleted ? '回收站' : displayNoteStatus(item.note.status));
          return (
            <tr
              key={itemKey(item)}
              data-kind={item.kind}
              data-selected={!isFolder && (selectedNoteId === id || selectedNoteIds.has(id)) ? true : undefined}
              onContextMenu={openIndexItemMenu}
            >
              {selectionMode ? <td className={styles.selectionCell}>{!isFolder ? (
                <Checkbox
                  aria-label={`选择${name || '未命名笔记'}`}
                  isSelected={selectedNoteIds.has(id)}
                  onChange={(selected) => onToggleSelection(id, selected)}
                />
              ) : null}</td> : null}
              <td className={styles.nameData}>
                <button type="button" className={styles.nameCell} disabled={isRecycleView && !isFolder} onClick={() => {
                  if (!isFolder && selectionMode) onToggleSelection(id, !selectedNoteIds.has(id));
                  else if (isFolder) onSelectFolder(id);
                  else onSelectNote(id);
                }}>
                  <span className={`${styles.miniFile} ${isFolder ? styles.miniFolder : documentToneClass(status)}`} data-art-kind={isFolder ? 'folder' : 'document'} aria-hidden="true"><span className={styles.fileLines} /></span>
                  <strong title={name || '未命名笔记'}>{name || '未命名笔记'}</strong>
                </button>
              </td>
              <td className={styles.statusData}><span className={`${styles.status} ${statusClassName(status)}`}><span className={styles.statusDot} />{status}</span></td>
              <td className={styles.locationData} title={location}>{location}</td>
              <td className={styles.updatedData}>{formatUpdatedAt(updatedAt)}</td>
              <td className={`${styles.more} ${styles.actionData}`}>{!isFolder && isRecycleView ? (
                <RecycleNoteActions
                  note={item.note}
                  pending={recyclePendingId === item.note.id}
                  onRestore={onRestore}
                  onRequestPermanentDelete={onRequestPermanentDelete}
                />
              ) : (
                <IndexItemActions item={item} canWrite={canWrite} onAction={onItemAction} />
              )}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
export function IndexTile({ item, notes, selectedNoteId, onSelectFolder, onSelectNote, isRecycleView, recyclePendingId, onRestore, onRequestPermanentDelete, selectionMode, selected, onToggleSelection, canWrite, onItemAction }: {
  item: IndexItem; notes: Note[]; selectedNoteId: string | null;
  onSelectFolder(id: string): void; onSelectNote(id: string): void;
  isRecycleView: boolean;
  recyclePendingId: string | null;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection(noteId: string, selected: boolean): void;
  canWrite: boolean;
  onItemAction(action: SidebarTreeAction): void;
}) {
  const isFolder = item.kind === 'folder';
  const entity = isFolder ? item.folder : item.note;
  const count = isFolder ? countFolderNotes(item.folder, notes) : 0;
  const status = isFolder ? '文件夹' : displayNoteStatus(item.note.status);
  return (
    <div className={styles.tileShell} onContextMenu={openIndexItemMenu}>
      {!isFolder && selectionMode ? <span className={styles.tileSelection}>
        <Checkbox aria-label={`选择${item.note.title || '未命名笔记'}`} isSelected={selected} onChange={(next) => onToggleSelection(item.note.id, next)} />
      </span> : null}
      <button
        type="button"
        className={styles.tile}
        disabled={isRecycleView && !isFolder}
        data-selected={!isFolder && (selectedNoteId === entity.id || selected) ? true : undefined}
        onClick={() => {
          if (!isFolder && selectionMode) onToggleSelection(entity.id, !selected);
          else if (isFolder) onSelectFolder(entity.id);
          else onSelectNote(entity.id);
        }}
      >
      <span className={styles.tileArt}>
        {isFolder ? (
          <span className={styles.folderArt} data-art-kind="folder" data-count={String(count).padStart(2, '0')} aria-hidden="true" />
        ) : (
          <span className={`${styles.documentArt} ${documentToneClass(status)}`} data-art-kind="document" aria-hidden="true" />
        )}
      </span>
      <span className={styles.tileCopy}>
        <strong title={isFolder ? item.folder.name : item.note.title || '未命名笔记'}>{isFolder ? item.folder.name : item.note.title || '未命名笔记'}</strong>
        <small>{isFolder ? `${count} 项` : formatUpdatedAt(entity.updatedAt)}</small>
      </span>
      </button>
      {!isFolder && isRecycleView ? (
        <span className={styles.tileActions}>
          <RecycleNoteActions
            note={item.note}
            pending={recyclePendingId === item.note.id}
            onRestore={onRestore}
            onRequestPermanentDelete={onRequestPermanentDelete}
          />
        </span>
      ) : (
        <span className={styles.tileActions}>
          <IndexItemActions item={item} canWrite={canWrite} onAction={onItemAction} />
        </span>
      )}
    </div>
  );
}

import { useId, type CSSProperties } from 'react';
import type { Tag } from '@study-accelerator/web-core';
import type { IndexItem } from './notesIndexPresentation';
import { notePreview } from './NotesIndexItemMeta';
import styles from './NotesIndexArt.module.css';

/** Decorative paper marks describe no invented content type and expose no extra controls. */
export function NotesIndexArt({ item, tags = [], cover = false, decoration = true }: {
  item: IndexItem; tags?: Tag[]; cover?: boolean; decoration?: boolean;
}) {
  const gradientId = `ni-folder-${useId()}`;
  const folder = item.kind === 'folder';
  const text = folder ? '' : notePreview(item.note);
  const color = folder ? 'folder' : tags[0]?.color || 'neutral';
  const lengths = text ? text.match(/.{1,28}/g)?.slice(0, 5).map(line => 12 + line.length) || [] : [34, 28, 38, 25];
  return <span className={`${styles.art} ${cover ? styles.cover : ''}`} data-color={color}
    data-decoration={decoration} data-art-kind={folder ? 'folder' : 'document'} aria-hidden="true">
    {folder ? <svg className={styles.folder} width="88" height="72" viewBox="0 0 96 76" fill="none">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" className={styles.folderStart} /><stop offset="100%" className={styles.folderEnd} />
      </linearGradient></defs>
      <path className={styles.folderBack} d="M5 17a5 5 0 0 1 5-5h25l8 8h42a6 6 0 0 1 6 6v40H5Z" />
      {decoration ? <path data-folder-paper className={styles.folderPaper} d="M13 25h68v35H13z" /> : null}
      <path className={styles.folderFront} fill={`url(#${gradientId})`} d="M6 30h84l-5 37a5 5 0 0 1-5 4H13a5 5 0 0 1-5-4Z" />
      <path className={styles.folderEdge} d="M9 32h78" />
    </svg> : <svg className={styles.document} width="54" height="76" viewBox="0 0 58 80" fill="none">
      <path className={styles.paper} d="M5 1h30l18 18v57a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3Z" />
      <path className={styles.fold} d="M35 1v14a4 4 0 0 0 4 4h14Z" />
      <rect className={styles.paperTitle} x="10" y="27" width="24" height="4" rx="2" />
      {lengths.map((length, index) => <rect key={index} className={styles.paperLine} x="10" y={37 + index * 7} width={Math.min(35, length)} height="3" rx="1.5" />)}
    </svg>}
    {cover && !folder ? <span className={styles.sheet}>
      <span className={styles.sheetTitle} />
      {lengths.map((length, index) => <span key={index} className={styles.sheetLine} style={{ '--line-width': `${length * 2}%` } as CSSProperties} />)}
    </span> : null}
  </span>;
}

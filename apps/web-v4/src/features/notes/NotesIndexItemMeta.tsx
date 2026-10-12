import type { Note, Tag } from '@study-accelerator/web-core';
import { StarIcon } from '../../components/icons/knowra';
import { TagChip } from '../tags';
import { statusClassName } from './notesIndexPresentation';
import styles from './NotesIndexItems.module.css';

/** A bounded, plain-text preview. Never interpret user-authored HTML or Markdown here. */
export function notePreview(note: Note): string {
  const source = typeof note.summary === 'string' && note.summary.trim()
    ? note.summary : note.plainText || note.rawMarkdown || '';
  return source.slice(0, 4000)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?)/gm, '')
    .replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function itemTags(note: Note, tags: Tag[]): Tag[] {
  const ids = new Set(note.tagIds);
  return tags.filter(tag => ids.has(tag.id));
}

export function ItemTags({ tags, dots = false, limit = 2 }: { tags: Tag[]; dots?: boolean; limit?: number }) {
  if (!tags.length) return null;
  return <span className={styles.tags} data-dots={dots || undefined} title={tags.map(tag => tag.name || '未命名标签').join('、')}>
    {tags.slice(0, dots ? 4 : limit).map(tag => <TagChip key={tag.id} tag={tag} className={styles.tagChip} />)}
    {!dots && tags.length > limit ? <span className={styles.tagMore}>+{tags.length - limit}</span> : null}
  </span>;
}

export function ItemStatus({ status, compact = false }: { status: string; compact?: boolean }) {
  return <span className={`${styles.status} ${statusClassName(status)}`} title={status}>
    <svg className={styles.statusGlyph} width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      {/完成/.test(status) ? <path d="m5 8 2 2 4-4" /> : /草稿|待整理|文稿/.test(status) ? null : <path d="M8 4.5V8l2 1.5" />}
    </svg>
    <span className={compact ? styles.srOnly : undefined}>{status}</span>
  </span>;
}

export function ItemFavorite({ decoration = true }: { decoration?: boolean }) {
  return <span className={styles.favorite} data-decoration={decoration} title="已收藏" aria-label="已收藏"><StarIcon size={13} /></span>;
}

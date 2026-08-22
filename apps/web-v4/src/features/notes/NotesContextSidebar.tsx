import { useState, type ReactNode } from 'react';
import {
  ClockIcon,
  FolderIcon,
  MoreHorizontalIcon,
  NoteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TagIcon
} from '../../shell/icons';
import styles from './NotesContextSidebar.module.css';

interface NavEntry {
  label: string;
  count?: string;
  Icon: typeof NoteIcon;
  current?: boolean;
}

const QUICK_ENTRIES: readonly NavEntry[] = [
  { label: '全部笔记', count: '22', Icon: NoteIcon, current: true },
  { label: '最近编辑', count: '6', Icon: ClockIcon },
  { label: '收藏', count: '3', Icon: TagIcon },
  { label: '未整理', count: '8', Icon: RefreshIcon }
];

const FOLDERS = [
  { label: '产品设计', count: '4' },
  { label: '学习', count: '4' },
  { label: '灵感', count: '3' }
] as const;

export function NotesContextSidebar() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const folders = normalizedQuery
    ? FOLDERS.filter((entry) => entry.label.toLocaleLowerCase().includes(normalizedQuery))
    : FOLDERS;

  return (
    <div className={styles.sidebarContent}>
      <header className={styles.header}>
        <span className={styles.title}>笔记</span>
        <button className={styles.moreButton} type="button" aria-label="笔记更多操作" title="更多操作">
          <MoreHorizontalIcon size={20} />
        </button>
        <button className={styles.createButton} type="button" aria-label="新建笔记" title="新建笔记 · Ctrl/⌘ N">
          <PlusIcon size={20} />
        </button>
      </header>

      <label className={styles.search}>
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、正文或标签…"
          aria-label="搜索笔记目录"
        />
      </label>

      <SidebarSection title="快速入口">
        {QUICK_ENTRIES.map((entry) => (
          <button
            key={entry.label}
            className={styles.navRow}
            type="button"
            aria-current={entry.current ? 'page' : undefined}
          >
            <entry.Icon size={16} />
            <span>{entry.label}</span>
            <small>{entry.count}</small>
          </button>
        ))}
      </SidebarSection>

      <SidebarSection title="文件夹">
        {folders.map((folder) => (
          <button key={folder.label} className={styles.folderRow} type="button">
            <FolderIcon size={16} />
            <span>{folder.label}</span>
            <small>{folder.count}</small>
          </button>
        ))}
        {folders.length === 0 ? <p className={styles.empty}>没有匹配的文件夹</p> : null}
      </SidebarSection>

      <SidebarSection title="标签">
        <div className={styles.tags} aria-label="常用标签">
          <span className={styles.tagBlue}>学习</span>
          <span className={styles.tagPurple}>设计</span>
          <span className={styles.tagGreen}>AI</span>
          <span className={styles.tagOrange}>待整理</span>
        </div>
      </SidebarSection>

      <button className={styles.recycle} type="button">
        <RefreshIcon size={16} />
        <span>回收站</span>
      </button>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`sidebar-${title}`}>
      <h2 id={`sidebar-${title}`} className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

import { useState } from 'react';
import {
  ArrowUpRightIcon,
  FolderIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon
} from '../../shell/icons';
import { PathTrail } from '../../shell/PathTrail';
import { pathForSurface, type PathSegment } from '../../shell/path';
import styles from './NotesIndexView.module.css';

interface NoteRow {
  name: string;
  status: string;
  location: string;
  updated: string;
  folder?: boolean;
}

const ROWS: readonly NoteRow[] = [
  { name: '产品设计', status: '文件夹', location: '笔记库', updated: '今天 16:42', folder: true },
  { name: 'Q3 产品规划草案', status: '草稿', location: '产品设计', updated: '今天 14:06' },
  { name: 'Transformer 注意力机制复盘', status: '进行中', location: '产品设计', updated: '今天 17:20' },
  { name: '前端重构设计评审', status: '已完成', location: '产品设计', updated: '昨天 18:32' },
  { name: '学习', status: '文件夹', location: '笔记库', updated: '昨天 21:08', folder: true },
  { name: '向量相似度入门', status: '已完成', location: '学习', updated: '8月14日' }
];

export function NotesIndexView({ path }: { path: PathSegment[] }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const visibleRows = ROWS.filter((row) => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const currentSegment = path.find((segment) => segment.current) ?? path.at(-1);
  if (!currentSegment) return null;
  const parentPath = pathForSurface(path, 'notes-index')
    .filter((segment) => segment.id !== currentSegment.id);

  return (
    <article className={styles.page} aria-labelledby="notes-index-title">
      <header className={styles.header} data-header-density="compact">
        <nav className={styles.breadcrumb} aria-label="当前位置">
          <span className={styles.marker} data-testid="notes-index-marker" data-shadow-owner="marker" data-shadow-token="--shadow-badge" aria-hidden="true" />
          <PathTrail path={parentPath} variant="top" currentId={null} />
          <span className={styles.breadcrumbSeparator} aria-hidden="true"> / </span>
          <h1 id="notes-index-title" data-title-density="compact" aria-current="page">{currentSegment.label}</h1>
          <span className={styles.summary}>
            <strong>{visibleRows.length}</strong> 项
            <span aria-hidden="true">·</span>
            <span>{view === 'list' ? '列表视图' : '网格视图'} · 按最近更新排序</span>
          </span>
        </nav>
        <div className={styles.actions} aria-label="笔记操作">
          <button type="button" className={styles.button}>
            <ArrowUpRightIcon size={16} />
            <span>导入</span>
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`}>
            <PlusIcon size={17} />
            <span>新建笔记</span>
          </button>
        </div>
      </header>

      <div className={styles.toolbar} data-toolbar-surface="layout-only" data-toolbar-list-gap="12px" role="toolbar" aria-label="笔记索引工具栏">
        <label className={styles.search} data-shadow-owner="search" data-shadow-token="--shadow-input-rest">
          <SearchIcon size={17} />
          <input
            data-input-control="true"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、位置或状态…"
            aria-label="搜索笔记索引"
          />
        </label>
        <div className={styles.filterGroup} data-control-group="segmented" data-shadow-owner="filter-group" data-shadow-token="--shadow-badge" role="group" aria-label="类型筛选">
          <button type="button" className={`${styles.filter} ${styles.selected}`} aria-pressed="true">全部</button>
          <button type="button" className={styles.filter} aria-pressed="false">文件夹</button>
          <button type="button" className={styles.filter} aria-pressed="false">文稿</button>
        </div>
        <button type="button" className={styles.sort} data-shadow-owner="sort" data-shadow-token="--shadow-badge">↕ 最近更新</button>
        <div className={styles.viewToggle} data-shadow-owner="view-group" data-shadow-token="--shadow-badge" role="group" aria-label="视图切换">
          <button type="button" className={view === 'list' ? styles.viewActive : ''} aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')}><NoteIcon size={16} /></button>
          <button type="button" className={view === 'grid' ? styles.viewActive : ''} aria-label="网格视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><FolderIcon size={16} /></button>
        </div>
      </div>

      {view === 'list' ? (
        <NotesTable rows={visibleRows} />
      ) : (
        <div className={styles.grid} aria-label="笔记网格视图">
          {visibleRows.map((row) => <NoteTile key={row.name} row={row} />)}
        </div>
      )}
    </article>
  );
}

function NotesTable({ rows }: { rows: readonly NoteRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr><th scope="col">名称</th><th scope="col">状态</th><th scope="col">位置</th><th scope="col">最近更新</th><th scope="col"><span className={styles.srOnly}>操作</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td><span className={styles.nameCell}>{row.folder ? <FolderIcon size={20} /> : <NoteIcon size={20} />}<strong>{row.name}</strong></span></td>
              <td><span className={styles.status}><span className={styles.statusDot} />{row.status}</span></td>
              <td>{row.location}</td><td>{row.updated}</td><td className={styles.more}>···</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteTile({ row }: { row: NoteRow }) {
  return <button type="button" className={styles.tile}><span className={styles.tileIcon}>{row.folder ? <FolderIcon size={24} /> : <NoteIcon size={22} />}</span><strong>{row.name}</strong><small>{row.status} · {row.updated}</small></button>;
}

import { PathTrail } from '../../shell/PathTrail';
import type { PathSegment } from '../../shell/path';
import { UploadIcon, ChevronRightIcon, PlusIcon } from '../../shell/icons';
import { useLocation } from '../../app/router';
import styles from './NotesIndexView.module.css';

export function NotesIndexHeader({ path, canWrite, isRecycleView, selectionMode, onToggleSelection, onImport, onCreate }: {
  path: PathSegment[]; canWrite: boolean; isRecycleView: boolean; selectionMode: boolean;
  onToggleSelection(): void; onImport(): void; onCreate(): void;
}) {
  const history = useLocation();
  return <header className={styles.header}>
    <div className={styles.indexBadge}><span aria-hidden="true" />笔记索引 <small>INDEX</small></div>
    <div className={styles.history} role="group" aria-label="浏览历史">
      <button type="button" aria-label="后退" disabled={!history.canGoBack} onClick={history.back}><span className={styles.backArrow}><ChevronRightIcon size={16} /></span></button>
      <button type="button" aria-label="前进" disabled={!history.canGoForward} onClick={history.forward}><ChevronRightIcon size={16} /></button>
    </div>
    <nav className={styles.breadcrumb} aria-label="当前位置" title={path.map(segment => segment.label).join(' / ')}>
      <span className={styles.marker} aria-hidden="true" />
      <PathTrail path={path} variant="top" />
    </nav>
    <div className={styles.actions} aria-label="笔记操作">
      <button type="button" className={styles.button} disabled={!canWrite || isRecycleView} aria-pressed={selectionMode} onClick={onToggleSelection}>批量管理</button>
      <button type="button" className={styles.button} disabled={!canWrite || isRecycleView} onClick={onImport}><UploadIcon size={16} />导入</button>
      <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!canWrite || isRecycleView} onClick={onCreate}><PlusIcon size={17} />新建笔记</button>
    </div>
  </header>;
}

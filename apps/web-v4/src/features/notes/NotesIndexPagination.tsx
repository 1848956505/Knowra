import styles from './NotesIndexView.module.css';
import { Button } from '../../components/ui';
import { WorkspacePanelFooter } from '../../components/workspace/WorkspacePanel';

const PAGE_SIZES = [5, 10, 20, 50];
const PAGE_NEIGHBORS = 1;

export function NotesIndexPagination({ page, pageCount, total, pageSize, loading, hasMore, onLoadMore, onPageChange, onPageSizeChange }: {
  page: number; pageCount: number; total: number; pageSize: number; loading: boolean;
  hasMore: boolean; onLoadMore(): void;
  onPageChange(page: number): void; onPageSizeChange(size: number): void;
}) {
  const pages = Array.from(new Set([0, pageCount - 1, page - PAGE_NEIGHBORS, page, page + PAGE_NEIGHBORS]))
    .filter(value => value >= 0 && value < pageCount).sort((a, b) => a - b);
  return <WorkspacePanelFooter className={styles.pagination}>
    <div className={styles.pageNavigation}>
      <span aria-live="polite">第 {page + 1} / {pageCount} 页 · {hasMore ? `已载入 ${total} 条` : `共 ${total} 条`}</span>
      <nav aria-label="笔记分页">
        {pages.map((value, index) => <span className={styles.pageEntry} key={value}>
          {index > 0 && value - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
          <Button size="workspace" aria-label={`第 ${value + 1} 页`} aria-current={page === value ? 'page' : undefined}
            isDisabled={loading} onPress={() => onPageChange(value)}>{value + 1}</Button>
        </span>)}
      </nav>
      {hasMore ? <Button size="workspace" isDisabled={loading} onPress={onLoadMore}>
        {loading ? '正在加载…' : '加载更多'}
      </Button> : null}
    </div>
    <div className={styles.pageSizes} role="group" aria-label="每页条数">
      <span>每页</span>
      {PAGE_SIZES.map(size => <Button size="workspace" key={size} aria-label={`每页 ${size} 条`} aria-pressed={pageSize === size}
        onPress={() => onPageSizeChange(size)}>{size}</Button>)}
      <span>条</span>
    </div>
  </WorkspacePanelFooter>;
}

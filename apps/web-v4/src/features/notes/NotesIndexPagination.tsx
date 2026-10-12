import styles from './NotesIndexView.module.css';
import { Button, Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui';
import { ChevronDownIcon, ChevronRightIcon } from '../../components/icons/knowra';
import { WorkspacePanelFooter } from '../../components/workspace/WorkspacePanel';
import { notesIndexAppearanceProps } from './NotesIndexAppearance';
import { useNotesIndexAppearance } from './notesIndexAppearance';

const PAGE_SIZES = [5, 10, 20, 50];
export function NotesIndexPagination({ page, pageCount, total, pageSize, loading, hasMore, onLoadMore, onPageChange, onPageSizeChange }: {
  page: number; pageCount: number; total: number; pageSize: number; loading: boolean; hasMore: boolean;
  onLoadMore(): void; onPageChange(page: number): void; onPageSizeChange(size: number): void;
}) {
  const theme = notesIndexAppearanceProps(useNotesIndexAppearance());
  const pages = Array.from(new Set([0, pageCount - 1, page - 1, page, page + 1])).filter(value => value >= 0 && value < pageCount).sort((a, b) => a - b);
  return <WorkspacePanelFooter className={styles.pagination}>
    <span className={styles.pageCount} aria-live="polite">第 {page + 1} / {pageCount} 页 · {hasMore ? `已载入 ${total} 条` : `共 ${total} 条`}</span>
    <div className={styles.pageNavigation}>
      <nav aria-label="笔记分页">
        <Button size="mini" variant="ghost" iconOnly aria-label="上一页" isDisabled={loading || page === 0} onPress={() => onPageChange(page - 1)}><span className={styles.previous}><ChevronRightIcon size={12} /></span></Button>
        {pages.map((value, index) => <span className={styles.pageEntry} key={value}>
          {index > 0 && value - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
          <Button size="mini" variant="ghost" aria-label={`第 ${value + 1} 页`} aria-current={page === value ? 'page' : undefined} isDisabled={loading} onPress={() => onPageChange(value)}>{value + 1}</Button>
        </span>)}
        <Button size="mini" variant="ghost" iconOnly aria-label="下一页" isDisabled={loading || page + 1 >= pageCount} onPress={() => onPageChange(page + 1)}><ChevronRightIcon size={12} /></Button>
      </nav>
      <MenuTrigger><Button size="mini" variant="ghost" aria-label="每页条数">每页 {pageSize} 条<ChevronDownIcon size={11} /></Button>
        <MenuPopover {...theme}><Menu ariaLabel="每页条数" selectionMode="single" selectedKeys={[String(pageSize)]} onAction={key => onPageSizeChange(Number(key))}>
          {PAGE_SIZES.map(size => <MenuItem id={String(size)} key={size}>每页 {size} 条</MenuItem>)}
        </Menu></MenuPopover>
      </MenuTrigger>
      {hasMore ? <Button size="mini" isDisabled={loading} onPress={onLoadMore}>{loading ? '正在加载…' : '加载更多'}</Button> : null}
    </div>
    <span className={styles.keyboardHint}><kbd>/</kbd> 搜索 <kbd>Tab</kbd> 移动 <kbd>Enter</kbd> 打开</span>
  </WorkspacePanelFooter>;
}

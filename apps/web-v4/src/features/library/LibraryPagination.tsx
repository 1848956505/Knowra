import { Button } from '../../components/ui';
import styles from './Library.module.css';

export interface LibraryPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
}

export function LibraryPagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPage,
  onPageSize
}: LibraryPaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <footer className={styles.pagination} aria-label="资料分页">
      <span>第 {page} / {totalPages} 页 · 共 {totalItems} 条</span>
      <div className={styles.pageButtons}>
        {pages.slice(0, 7).map((pageNumber) => (
          <Button
            key={pageNumber}
            variant={pageNumber === page ? 'default' : 'ghost'}
            className={styles.pageButton}
            aria-current={pageNumber === page ? 'page' : undefined}
            onClick={() => onPage(pageNumber)}
          >
            {pageNumber}
          </Button>
        ))}
      </div>
      <div className={styles.pageSize} aria-label="每页资料数量">
        <span>每页</span>
        {[5, 10, 20, 50].map((size) => (
          <Button
            key={size}
            variant={size === pageSize ? 'default' : 'ghost'}
            className={styles.pageSizeButton}
            onClick={() => onPageSize(size)}
          >
            {size}
          </Button>
        ))}
      </div>
    </footer>
  );
}

// V4-04 LoadingState
//
// 1. 视觉：行内进度条或方点脉冲，1.4s 周期（来自 §6 Loading 状态契约）。
// 2. 默认 `aria-busy="true"` 但不阻塞输入（不遮挡 click）。
// 3. prefers-reduced-motion 时冻结动画。

import { forwardRef, type ReactNode } from 'react';
import { cx } from '../classnames';
import styles from './Status.module.css';

export interface LoadingStateProps {
  label?: string;
  /** 进度条样式（行内 4px）或方点脉冲。 */
  variant?: 'bar' | 'dots';
  className?: string;
  children?: ReactNode;
}

export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(function LoadingState(
  { label = '加载中…', variant = 'bar', className, children },
  ref
) {
  return (
    <div
      ref={ref}
      className={cx(styles.loading, className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {variant === 'bar' ? (
        <div className={styles.loadingBar} aria-hidden="true" />
      ) : (
        <div className={styles.loadingDots} aria-hidden="true">
          <div className={styles.loadingDot} />
          <div className={styles.loadingDot} />
          <div className={styles.loadingDot} />
        </div>
      )}
      {children ? <span>{children}</span> : <span>{label}</span>}
    </div>
  );
});

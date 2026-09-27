import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { CloseIcon } from '../../icons/knowra';
import styles from './SearchBox.module.css';

export type SearchBoxSize = 'toolbar' | 'sidebar' | 'command' | 'field';

interface SearchSurfaceProps {
  children: ReactNode;
  icon?: ReactNode;
  size?: SearchBoxSize;
  shortcut?: string;
  onClear?: () => void;
  clearLabel?: string;
  clearText?: string;
  disabled?: boolean;
  invalid?: boolean;
  surfaceProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'> & { 'data-shadow-owner'?: string; 'data-shadow-token'?: string };
}

/** 搜索控件的唯一视觉外壳；业务页面不再维护搜索框 CSS。 */
export function SearchSurface({ children, icon, size = 'field', shortcut, onClear, clearLabel = '清除搜索', clearText, disabled, invalid, surfaceProps }: SearchSurfaceProps) {
  const { onClick, ...restSurfaceProps } = surfaceProps ?? {};
  return <div className={styles.shell} data-size={size} data-disabled={disabled || undefined} data-invalid={invalid || undefined} data-input-shadow-owner="true" {...restSurfaceProps}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && !(event.target as Element).closest('button')) event.currentTarget.querySelector('input')?.focus();
    }}>
    {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
    {children}
    {shortcut ? <kbd className={styles.shortcut} aria-hidden="true">{shortcut}</kbd> : null}
    {onClear ? <button className={clearText ? styles.clearText : styles.clearIcon} type="button" aria-label={clearLabel} onClick={onClear} data-testid="search-clear">
      {clearText ?? <CloseIcon size={12} />}
    </button> : null}
  </div>;
}

export interface SearchBoxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children' | 'className' | 'size' | 'aria-label'> {
  label: string;
  icon?: ReactNode;
  size?: SearchBoxSize;
  shortcut?: string;
  onClear?: () => void;
  clearLabel?: string;
  clearText?: string;
  surfaceProps?: SearchSurfaceProps['surfaceProps'];
}

/** 原生输入行为留给调用方，样式和可选附件由组件库统一提供。 */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox({ label, icon, size = 'toolbar', shortcut, onClear, clearLabel, clearText, surfaceProps, type = 'search', disabled, ...inputProps }, ref) {
  return <SearchSurface icon={icon} size={size} shortcut={shortcut} onClear={onClear} clearLabel={clearLabel} clearText={clearText} disabled={disabled} surfaceProps={surfaceProps}>
    <input {...inputProps} ref={ref} type={type} disabled={disabled} aria-label={label} className={styles.input} data-input-control="true" />
  </SearchSurface>;
});

export { styles as searchBoxStyles };

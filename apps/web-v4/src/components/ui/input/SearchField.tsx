// V4-04 SearchField
//
// 印格 demo 的 search 行为契约：去抖 200ms、空值不触发、aria-busy。
// 实际去抖由调用方实现（业务放在 store 侧的 selector effect），本组件只负责
// 视觉与 ARIA，并暴露 value / onChange / onSubmit / onClear。
//
// 实现：受控 / 非受控双形态。内部 useState 维护输入值，避免 RAC SearchField
// 在空值时仍挂 slot="clear" 按钮。清除按钮按当前 value.length > 0 条件渲染；
// 清空时焦点回到 input。

import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Input as RAInput,
  Label,
  SearchField as RASearchField,
  type InputProps as RAInputProps,
  type SearchFieldProps as RASearchFieldProps
} from 'react-aria-components';
import { cx } from '../classnames';
import styles from './Input.module.css';

export interface SearchFieldProps
  extends Omit<RASearchFieldProps, 'className' | 'children' | 'value' | 'defaultValue' | 'onChange'> {
  label: string;
  placeholder?: string;
  className?: string;
  icon?: ReactNode;
  /** 当输入值非空时显示清除按钮；onClear 由调用方负责清空 value。 */
  onClear?: () => void;
  description?: string;
  errorMessage?: string;
  type?: 'search' | 'text';
  /** 受控 value；与 defaultValue 同时省略时为非受控。 */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export const SearchField = forwardRef<HTMLDivElement, SearchFieldProps>(function SearchField(
  {
    label,
    placeholder,
    className,
    icon,
    onClear,
    description,
    errorMessage,
    type = 'search',
    value: controlledValue,
    defaultValue = '',
    onChange,
    ...rest
  },
  ref
) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string>(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 受控/非受控同步：外部 value 改变时同步到内部（仅在非受控时有意义）
  useEffect(() => {
    if (!isControlled) return;
    setInternalValue(controlledValue ?? '');
  }, [controlledValue, isControlled]);

  const currentValue = isControlled ? controlledValue ?? '' : internalValue;
  const hasValue = currentValue.length > 0;

  const handleChange = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  const handleClear = useCallback(() => {
    handleChange('');
    onClear?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [handleChange, onClear]);

  return (
    <RASearchField
      ref={ref}
      aria-label={label}
      className={cx(styles.field, className)}
      value={currentValue}
      onChange={handleChange as RASearchFieldProps['onChange']}
      {...rest}
    >
      <Label className={styles.label}>{label}</Label>
      <div className={styles.searchShell} data-input-shadow-owner="true">
        {icon ? <span className={styles.searchIcon}>{icon}</span> : null}
        <RAInput
          ref={inputRef}
          type={type}
          placeholder={placeholder}
          className={styles.input as RAInputProps['className']}
          data-input-control="true"
        />
        {hasValue ? (
          <button
            type="button"
            className={styles.searchClear}
            aria-label="清除搜索"
            onClick={handleClear}
            data-testid="search-clear"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        ) : null}
      </div>
      {description ? <div className={styles.description}>{description}</div> : null}
      {errorMessage ? <div className={styles.error} role="alert">{errorMessage}</div> : null}
    </RASearchField>
  );
});

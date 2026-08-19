// V4-04 Select
//
// 使用 React Aria 的 ListBox + Popover 作为下拉内容；触发器复用按钮视觉。
// 业务代码只能通过本封装使用 select，不得直接 import react-aria-components 的 Select。

import { forwardRef, type ReactNode } from 'react';
import {
  Button as RAButton,
  Label,
  ListBox as RAListBox,
  ListBoxItem as RAItem,
  Popover as RAPopover,
  Select as RASelect,
  SelectValue as RASelectValue,
  Text,
  type SelectProps as RASelectProps,
  type Key
} from 'react-aria-components';
import { cx } from '../classnames';
import overlayStyles from '../overlay/Overlay.module.css';
import collectionStyles from '../collection/Collection.module.css';
import styles from './Input.module.css';

export interface SelectOption {
  id: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

export interface SelectProps<T extends Key = string>
  extends Omit<RASelectProps<T>, 'className' | 'children'> {
  label: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  options: SelectOption[];
  className?: string;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
  {
    label,
    description,
    errorMessage,
    placeholder = '请选择',
    isRequired,
    isInvalid,
    isDisabled,
    options,
    className,
    ...rest
  },
  ref
) {
  return (
    <RASelect
      ref={ref}
      isRequired={isRequired}
      isInvalid={isInvalid}
      isDisabled={isDisabled}
      className={cx(styles.field, className)}
      {...rest}
    >
      <Label className={styles.label}>
        {label}
        {isRequired ? <span className={styles.required} aria-hidden="true">*</span> : null}
      </Label>
      {description ? (
        <Text slot="description" className={styles.description}>{description}</Text>
      ) : null}
      <RAButton className={styles.selectTrigger}>
        <RASelectValue className={styles.selectValue}>
          {({ selectedText, isPlaceholder }) => (
            <span data-placeholder={isPlaceholder || undefined}>{selectedText ?? placeholder}</span>
          )}
        </RASelectValue>
        <svg className={styles.selectChevron} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </RAButton>
      <RAPopover className={overlayStyles.popover} offset={4} placement="bottom start">
        {asRAListBox(options)}
      </RAPopover>
      {errorMessage ? <div className={styles.error} role="alert">{errorMessage}</div> : null}
    </RASelect>
  );
});

function asRAListBox(options: SelectOption[]) {
  return (
    <RAListBox className={collectionStyles.listbox} items={options}>
      {(item) => (
        <RAItem id={item.id} textValue={item.label} isDisabled={item.isDisabled}>
          {item.label}
        </RAItem>
      )}
    </RAListBox>
  );
}

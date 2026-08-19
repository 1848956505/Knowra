// V4-04 TagGroup
//
// 1. 用于资料标签、筛选 chip；
// 2. 视觉：22px 高、ink-accent 软填、ink-accent 边框、ink 文字；hover 翻转；
// 3. 行为（箭头切换、Backspace/Delete 删除、空格选中）由 React Aria 提供。

import { forwardRef, type ReactNode } from 'react';
import {
  Tag as RATag,
  TagGroup as RATagGroup,
  TagList as RATagList,
  type TagGroupProps as RATagGroupProps,
  type TagListProps as RATagListProps,
  type TagProps as RATagProps
} from 'react-aria-components';
import { cx } from '../classnames';
import styles from './Collection.module.css';

export interface TagItem {
  id: string;
  label: string;
  isDisabled?: boolean;
}

export interface TagGroupProps extends Omit<RATagGroupProps, 'className' | 'children'> {
  label: string;
  items: TagItem[];
  ariaLabel?: string;
  className?: string;
  /** 渲染额外的可移除按钮；返回 true 时显示移除按钮（默认仅 allowsRemoving 时显示）。 */
  renderRemove?: (item: TagItem) => ReactNode;
}

export const TagGroup = forwardRef<HTMLDivElement, TagGroupProps>(function TagGroup(
  { label, items, ariaLabel, className, renderRemove, ...rest },
  ref
) {
  return (
    <RATagGroup ref={ref} aria-label={ariaLabel ?? label} className={cx(styles.tagList, className)} {...rest}>
      <RATagList items={items} className={styles.tagList}>
        {(item) => (
          <RATag
            id={item.id}
            textValue={item.label}
            isDisabled={item.isDisabled}
            className={styles.tag}
          >
            {item.label}
            {renderRemove ? renderRemove(item) : null}
          </RATag>
        )}
      </RATagList>
    </RATagGroup>
  );
});

export const Tag = forwardRef<HTMLDivElement, RATagProps>(function Tag(props, ref) {
  return <RATag ref={ref} {...props} />;
});

export const TagList = forwardRef<HTMLDivElement, Omit<RATagListProps<TagItem>, 'children' | 'items'> & { items: TagItem[] }>(
  function TagList({ items, ...rest }, ref) {
    return <RATagList ref={ref} items={items} {...rest} />;
  }
);

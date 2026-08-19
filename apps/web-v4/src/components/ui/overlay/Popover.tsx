// V4-04 Popover
//
// 与 Menu 视觉一致；为非菜单用途（例如 Quick Look 预览、工具说明）提供通用浮层。
// 业务代码不得直接使用 react-aria-components 的 Popover。

import { forwardRef, type ReactNode } from 'react';
import {
  DialogTrigger as RADialogTrigger,
  Popover as RAPopover,
  type PopoverProps as RAPopoverProps,
  type DialogTriggerProps as RADialogTriggerProps
} from 'react-aria-components';
import { cx } from '../classnames';
import styles from './Overlay.module.css';

export interface PopoverProps extends Omit<RAPopoverProps, 'className' | 'children'> {
  children: ReactNode;
  className?: string;
}

export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  { children, className, ...rest },
  ref
) {
  return (
    <RAPopover ref={ref} className={cx(styles.popover, className)} {...rest}>
      {children}
    </RAPopover>
  );
});

export type PopoverTriggerProps = Omit<RADialogTriggerProps, 'children'> & {
  children: [ReactNode, ReactNode];
};

export function PopoverTrigger({ children, ...rest }: PopoverTriggerProps) {
  return <RADialogTrigger {...rest}>{children}</RADialogTrigger>;
}

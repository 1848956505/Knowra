import { forwardRef, type ReactNode } from 'react';
import { Button as RAButton, type ButtonProps as RAButtonProps } from 'react-aria-components';

export interface PressableButtonProps extends Omit<RAButtonProps, 'className' | 'children'> {
  children: ReactNode;
  className?: string;
}

/**
 * 仅提供 React Aria 的按压与焦点契约，不附加任何视觉样式。
 * 适用于目录树、列表行等由业务 CSS Module 完整定义外观的按钮。
 */
export const PressableButton = forwardRef<HTMLButtonElement, PressableButtonProps>(
  function PressableButton({ children, type, ...rest }, ref) {
    return (
      <RAButton ref={ref} type={type ?? 'button'} {...rest}>
        {children}
      </RAButton>
    );
  }
);

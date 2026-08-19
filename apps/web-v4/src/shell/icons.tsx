// V4-05 图标集
//
// 印格风格 1.8px 描边、square 端点、20x20 viewBox。
// 业务代码不允许直接 import `react-aria-components` 的图标，
// 也不允许 import 第三方图标库——统一从本文件导出。

import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'> {
  size?: number;
  /** 装饰性图标默认 aria-hidden；显式 true 则作为语义图标。 */
  decorative?: boolean;
  title?: string;
}

function base({ size = 20, decorative = true, title, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 20 20' as const,
    fill: 'none' as const,
    stroke: 'currentColor' as const,
    strokeWidth: 1.8,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': decorative ? true : undefined,
    role: decorative ? undefined : 'img',
    'aria-label': decorative ? undefined : title,
    focusable: false,
    ...rest
  };
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 2h7l4 4v12H5z" />
      <path d="M12 2v4h4" />
      <path d="M7.5 10h5M7.5 13h5M7.5 7h2" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 4.5C3 3.7 3.7 3 4.5 3H17v13H4.5A1.5 1.5 0 0 0 3 17.5z" />
      <path d="M3 4.5V17.5" />
      <path d="M6 6.5h7M6 9.5h7M6 12.5h4" />
    </svg>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 3h10v14H5z" />
      <path d="M7.5 7.5h5v1.5c0 1-.5 1.5-1.5 2s-1.5 1-1.5 1.5" />
      <circle cx="10" cy="14" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="14" height="14" />
      <path d="M6 10l3 3 5-6" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10" cy="7" r="3" />
      <path d="M3 17c1.2-3 4-4.5 7-4.5s5.8 1.5 7 4.5" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 9l7-6 7 6v8H3z" />
      <path d="M8 17v-5h4v5" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l4 4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M10 3v14M3 10h14" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 14V9a5 5 0 0 1 10 0v5l1 2H4z" />
      <path d="M8.5 17a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6L15 15M5 15l1.4-1.4M13.6 6.4L15 5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M16 7l-4 0a5 5 0 1 0 1.5 5" />
      <path d="M16 3v4h-4" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l2 2h5.5A1.5 1.5 0 0 1 17 8.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 3h7l7 7-7 7-7-7z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SidebarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="4" width="14" height="12" />
      <path d="M7 4v12" />
    </svg>
  );
}

export function PanelIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="4" width="14" height="12" />
      <path d="M14 4v12" />
    </svg>
  );
}

export function FocusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 6V3h3M17 6V3h-3M3 14v3h3M17 14v3h-3" />
      <rect x="7" y="7" width="6" height="6" />
    </svg>
  );
}

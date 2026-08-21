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

/** 印格冻结 demo 使用的 24x24 导航坐标系。 */
function demoBase(props: IconProps) {
  return {
    ...base(props),
    viewBox: '0 0 24 24' as const
  };
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5zM4 5.5v16M8 6h8" />
    </svg>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 4h16v14H9l-5 3z" />
      <path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-1 .7-1.7 1.1-1.7 2.2M12 16h.01" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.7 2.7L16.5 9" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21a7 7 0 0 1 14 0" />
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
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M12 4v16M4 12h16" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="4.5" width="14" height="12" />
      <path d="M6 3v3M14 3v3M3 8h14" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5zM10 20h4" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...demoBase(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
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

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 15L15 5M8 5h7v7" />
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

export function NodesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="5" cy="5" r="1.8" />
      <circle cx="15" cy="5" r="1.8" />
      <circle cx="10" cy="15" r="1.8" />
      <path d="M6.5 6.2l2.3 6.1M13.5 6.2l-2.3 6.1M6.8 5h6.4" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
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

// 2x2 网格：用于“组件库 / Component Showcase”入口。
export function ComponentLibraryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="6" height="6" />
      <rect x="11" y="3" width="6" height="6" />
      <rect x="3" y="11" width="6" height="6" />
      <rect x="11" y="11" width="6" height="6" />
    </svg>
  );
}

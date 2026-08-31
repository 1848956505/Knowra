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

/** 仅包含折线的展开尖括号，用于树形导航；展开态由调用方旋转。 */
export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 5l10 10M15 5 5 15" />
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

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8.2 12.8 6.8 14.2a3.4 3.4 0 0 1-4.8-4.8l2.8-2.8a3.4 3.4 0 0 1 4.8 0" />
      <path d="m11.8 7.2 1.4-1.4A3.4 3.4 0 0 1 18 10.6l-2.8 2.8a3.4 3.4 0 0 1-4.8 0M7 10h6" />
    </svg>
  );
}

export function PaperclipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="m7.2 10.8 5.7-5.7a2.8 2.8 0 0 1 4 4l-7.1 7.1a4.2 4.2 0 0 1-6-6l7-7" />
      <path d="m6.5 11.5 6-6" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M10 2.5c.5 3.3 2.2 5 5.5 5.5-3.3.5-5 2.2-5.5 5.5C9.5 10.2 7.8 8.5 4.5 8 7.8 7.5 9.5 5.8 10 2.5Z" />
      <path d="M16 13.5c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z" />
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

export function StarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="m10 2.8 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8l5-.7z" />
    </svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="m7 5-4 5 4 5M13 5l4 5-4 5M11.5 3 8.5 17" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="10" r=".7" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="15" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 6h5v5H5v3M11 6h5v5h-4v3" />
    </svg>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="14" height="14" />
      <path d="M3 8h14M8 3v14" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="14" height="14" />
      <circle cx="7" cy="7" r="1.5" />
      <path d="m4 15 4-4 2.5 2.5 2-2L16 15" />
    </svg>
  );
}

export function MoreVerticalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="10" cy="4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none" />
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

// 三个横排圆点：用于"更多操作 / 上下文菜单 / ghost icon"入口。
// 印格风：fill 圆点而非 stroke，避开 strokeWidth:1.8 视觉重量，与左轨 rail 图标
// 视觉重量保持一致。
export function MoreHorizontalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="5" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="5" cy="15" r="2.2" />
      <circle cx="15" cy="15" r="2.2" />
      <path d="m6.8 13.6 7.7-9.1M13.2 13.6 5.5 4.5M9 10l2-2" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="6" y="6" width="10" height="11" />
      <path d="M13 6V3H3v11h3" />
    </svg>
  );
}

export function PasteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M7 5H4v12h12V5h-3" />
      <rect x="7" y="3" width="6" height="4" />
      <path d="M7 11h6M7 14h4" />
    </svg>
  );
}

export function DeleteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 6h12M7 6V3h6v3M6 6l1 11h6l1-11M9 9v5M11 9v5" />
    </svg>
  );
}

export function BoldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M6 3v14h5a3.5 3.5 0 0 0 0-7H6h4.5a3.5 3.5 0 0 0 0-7z" />
    </svg>
  );
}

export function ItalicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M9 3h7M4 17h7M13 3 7 17" />
    </svg>
  );
}

export function HighlightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="m5 12 7-8 4 4-8 7H5zM4 17h12" />
      <path d="m11 5 4 4" />
    </svg>
  );
}

export function StrikethroughIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M6 7c0-2 1.5-3.5 4-3.5S14 5 14 7M6 13c0 2 1.5 3.5 4 3.5s4-1.5 4-3.5M3 10h14" />
    </svg>
  );
}

export function OrderedListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 5h9M8 10h9M8 15h9M3 4h1v3M3 10h2l-2 3h2M3 15h2v2H3" />
    </svg>
  );
}

export function TaskListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="4" height="4" />
      <rect x="3" y="9" width="4" height="4" />
      <rect x="3" y="15" width="4" height="2" />
      <path d="m4 11 1 1 2-3M10 5h7M10 11h7M10 16h7" />
    </svg>
  );
}

export function IndentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 5h9M8 10h9M8 15h9M3 7l3 3-3 3" />
    </svg>
  );
}

export function OutdentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 5h9M8 10h9M8 15h9M6 7l-3 3 3 3" />
    </svg>
  );
}

export function HorizontalRuleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 10h14" />
      <path d="M6 6h8M6 14h8" opacity=".35" />
    </svg>
  );
}

export function ParagraphAddIcon({ position = 'below', ...props }: IconProps & { position?: 'above' | 'below' }) {
  const plusY = position === 'above' ? 4 : 16;
  return (
    <svg {...base(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 8h10M5 11h10M5 14h7" />
      <path d={`M3 ${plusY}h4M5 ${plusY - 2}v4`} />
    </svg>
  );
}

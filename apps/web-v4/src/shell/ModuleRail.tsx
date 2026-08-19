// V4-05 ModuleRail
//
// 印格 64px 桌面轨道：顶部品牌 + 中段工作域 + 底部工具组。
// 选中态仅图标变蓝（不引入竖条/阴影/背景），符合 V4-00.5 §4 视觉签名。
// 工作域切换：setActiveWorkDomain；品牌按钮回主页。

import { forwardRef, type ReactNode } from 'react';
import {
  BookIcon,
  CheckIcon,
  HomeIcon,
  NoteIcon,
  QuestionIcon,
  SettingsIcon,
  UserIcon,
  type IconProps
} from './icons';
import type { WorkDomain } from '../store/types';
import { cx } from '../components/ui/classnames';
import styles from './ModuleRail.module.css';

export interface RailItem {
  id: WorkDomain;
  label: string;
  description: string;
  Icon: (props: IconProps) => ReactNode;
  available: boolean;
}

export const PRIMARY_DOMAINS: readonly RailItem[] = [
  {
    id: 'materials',
    label: '资料',
    description: 'Markdown 笔记的采集、编辑与整理。',
    Icon: NoteIcon,
    available: true
  },
  {
    id: 'knowledge',
    label: '知识',
    description: '知识单元与学习目标管理。',
    Icon: BookIcon,
    available: false
  },
  {
    id: 'training',
    label: '试题',
    description: '题目库与考试场景。',
    Icon: QuestionIcon,
    available: false
  },
  {
    id: 'learning',
    label: '执行',
    description: '待办、打卡与习惯追踪。',
    Icon: CheckIcon,
    available: false
  }
] as const;

export const UTILITY_ITEMS: readonly RailItem[] = [
  {
    id: 'profile',
    label: '我的',
    description: '工作区与个人设置。',
    Icon: UserIcon,
    available: false
  }
] as const;

export interface ModuleRailProps {
  activeDomain: WorkDomain;
  onSelect(domain: WorkDomain): void;
  onReturnHome(): void;
  onOpenSettings?(): void;
}

export const ModuleRail = forwardRef<HTMLElement, ModuleRailProps>(function ModuleRail(
  { activeDomain, onSelect, onReturnHome, onOpenSettings },
  ref
) {
  return (
    <nav
      ref={ref}
      className={styles.rail}
      aria-label="工作域导航"
    >
      <button
        type="button"
        className={styles.brand}
        aria-label="返回主页"
        onClick={onReturnHome}
      >
        <span className={styles.brandBefore} aria-hidden="true" />
        <span className={styles.brandAfter} aria-hidden="true" />
        <span className={styles.brandGlyph} aria-hidden="true">知</span>
      </button>

      <div className={cx(styles.railGroup, styles.railGroupPrimary)} role="group" aria-label="主要工作域">
        {PRIMARY_DOMAINS.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={item.id === activeDomain}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>

      <div className={cx(styles.railGroup, styles.railGroupUtility)} role="group" aria-label="工具">
        {UTILITY_ITEMS.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={item.id === activeDomain}
            onClick={() => onSelect(item.id)}
          />
        ))}
        <button
          type="button"
          className={styles.railItem}
          onClick={onOpenSettings}
          aria-label={onOpenSettings ? '设置' : '设置（尚未上线）'}
          title={onOpenSettings ? '设置' : '设置：尚未上线'}
          disabled={!onOpenSettings}
        >
          <span className={styles.railIcon}>
            <SettingsIcon size={20} />
          </span>
        </button>
      </div>
    </nav>
  );
});

interface RailButtonProps {
  item: RailItem;
  isActive: boolean;
  onClick(): void;
}

function RailButton({ item, isActive, onClick }: RailButtonProps) {
  const { Icon, label, description, id, available } = item;
  const ariaCurrent = isActive ? 'page' : undefined;
  if (!available) {
    return (
      <button
        type="button"
        className={styles.railItem}
        aria-label={`${label}（${available ? '可用' : '尚未上线'}）`}
        aria-disabled="true"
        disabled
        title={`${label}：${description}`}
      >
        <span className={styles.railIcon}>
          <Icon size={20} />
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={styles.railItem}
      aria-label={label}
      aria-current={ariaCurrent}
      data-module={id}
      onClick={onClick}
      title={`${label}：${description}`}
    >
      <span className={styles.railIcon}>
        <Icon size={20} />
      </span>
    </button>
  );
}

/** 主页入口在 TopBar 也使用，这里只导出图标本身。 */
export const HomeGlyphIcon = HomeIcon;

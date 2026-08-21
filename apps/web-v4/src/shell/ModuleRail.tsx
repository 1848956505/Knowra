// V4-05 ModuleRail
//
// 印格 64px 桌面轨道：顶部品牌 + 中段工作域 + 底部工具组。
// 选中态仅图标变蓝（不引入竖条/阴影/背景），符合 V4-00.5 §4 视觉签名。
// 工作域切换：setActiveWorkDomain；品牌按钮回主页。

import { forwardRef, type ReactNode } from 'react';
import {
  BookIcon,
  BellIcon,
  CheckIcon,
  ComponentLibraryIcon,
  HomeIcon,
  NoteIcon,
  PlusIcon,
  QuestionIcon,
  SearchIcon,
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
  activeDomain: WorkDomain | null;
  onSelect(domain: WorkDomain): void;
  onReturnHome(): void;
  onOpenSearch?(): void;
  onOpenCreate?(): void;
  onOpenNotifications?(): void;
  onOpenSettings?(): void;
  /** 打开组件展台（/showcase）。组件库是开发工具，不属于 WorkDomain。 */
  onOpenShowcase?(): void;
  /** 当前是否在 /showcase 路由——只有为 true 时组件库按钮才显示选中态。 */
  isShowcaseActive?: boolean;
}

export const ModuleRail = forwardRef<HTMLElement, ModuleRailProps>(function ModuleRail(
  {
    activeDomain,
    onSelect,
    onReturnHome,
    onOpenSearch,
    onOpenCreate,
    onOpenNotifications,
    onOpenSettings,
    onOpenShowcase,
    isShowcaseActive
  },
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
        aria-label="知境工作区"
        title="知境工作区"
        onClick={onReturnHome}
      >
        <span className={styles.brandGlyph} aria-hidden="true">知</span>
      </button>

      <div className={cx(styles.railGroup, styles.railGroupGlobal)} role="group" aria-label="全局操作">
        <RailActionButton
          label="全局搜索"
          title="搜索资料 / 标签 / 跳转 · Ctrl K"
          Icon={SearchIcon}
          onClick={onOpenSearch}
        />
        <RailActionButton
          label="新建笔记"
          title="新建笔记 · Ctrl N"
          Icon={PlusIcon}
          onClick={onOpenCreate}
        />
      </div>

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
        <RailActionButton
          label="通知"
          title="通知：尚未上线"
          Icon={BellIcon}
          onClick={onOpenNotifications}
        />
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
        {onOpenShowcase ? (
          <button
            type="button"
            className={styles.railItem}
            onClick={onOpenShowcase}
            aria-label="组件库"
            aria-current={isShowcaseActive ? 'page' : undefined}
            data-module="component-library"
            title="组件库：V4-04 公共组件展台"
          >
            <span className={styles.railIcon}>
              <ComponentLibraryIcon size={20} />
            </span>
          </button>
        ) : null}
        {UTILITY_ITEMS.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={item.id === activeDomain}
            onClick={() => onSelect(item.id)}
          />
        ))}
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

interface RailActionButtonProps {
  label: string;
  title: string;
  Icon: (props: IconProps) => ReactNode;
  onClick?: () => void;
}

function RailActionButton({ label, title, Icon, onClick }: RailActionButtonProps) {
  return (
    <button
      type="button"
      className={styles.railItem}
      onClick={onClick}
      aria-label={onClick ? label : `${label}（尚未上线）`}
      title={title}
      disabled={!onClick}
    >
      <span className={styles.railIcon}>
        <Icon size={20} />
      </span>
    </button>
  );
}

/** 主页入口在 TopBar 也使用，这里只导出图标本身。 */
export const HomeGlyphIcon = HomeIcon;

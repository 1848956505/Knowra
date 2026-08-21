// V4-05 MobileTabs
//
// ≤767px 时替代左侧 ModuleRail：底部 Tab 行（4 个工作域 + 我的 + 全局搜索）。
// 选中态顶部 4px 蓝条 + 蓝字 + 白底。

import { forwardRef } from 'react';
import { PRIMARY_DOMAINS, UTILITY_ITEMS, type RailItem } from './ModuleRail';
import { SearchIcon } from './icons';
import type { WorkDomain } from '../store/types';
import styles from './MobileTabs.module.css';

export interface MobileTabsProps {
  activeDomain: WorkDomain | null;
  onSelect(domain: WorkDomain): void;
  onOpenSearch?(): void;
}

const ALL_ITEMS: readonly RailItem[] = [...PRIMARY_DOMAINS, ...UTILITY_ITEMS];

export const MobileTabs = forwardRef<HTMLElement, MobileTabsProps>(function MobileTabs(
  { activeDomain, onSelect, onOpenSearch },
  ref
) {
  return (
    <nav ref={ref} className={styles.mobileTabs} aria-label="移动端模块导航">
      {ALL_ITEMS.map((item) => {
        if (!item.available) {
          return (
            <button
              key={item.id}
              type="button"
              className={styles.mobileTab}
              disabled
              aria-label={`${item.label}：${item.description}`}
            >
              <span className={styles.mobileIcon}>
                <item.Icon size={19} />
              </span>
              <span className={styles.mobileLabel}>{item.label}</span>
            </button>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={styles.mobileTab}
            aria-current={item.id === activeDomain ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.mobileIcon}>
              <item.Icon size={19} />
            </span>
            <span className={styles.mobileLabel}>{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.mobileTab}
        aria-label="打开全局搜索"
        onClick={onOpenSearch}
        disabled={!onOpenSearch}
      >
        <span className={styles.mobileIcon}>
          <SearchIcon size={19} />
        </span>
        <span className={styles.mobileLabel}>搜索</span>
      </button>
    </nav>
  );
});

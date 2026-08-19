// V4-05 SearchCommand
//
// 全局搜索 + 跳转面板（Cmd/Ctrl+K 触发）。
// 1. 视觉：印格 Dialog 风格，1px 墨边 + 硬阴影 + 暖纸底；命令式键盘导航。
// 2. 数据源：当前工作区的资料标题 + 标签；为空时显示跳转提示。
// 3. 键盘：↑↓ 移动高亮、Enter 跳转、Esc 关闭、focus 由 Dialog 焦点陷阱接管。

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog, DialogBody } from '../components/ui/overlay/Dialog';
import { EmptyState, LoadingState } from '../components/ui/status';
import { cx } from '../components/ui/classnames';
import { SearchIcon } from './icons';
import styles from './SearchCommand.module.css';

export interface SearchHit {
  id: string;
  primary: string;
  secondary?: string;
  hint?: string;
  group: '资料' | '标签' | '动作';
  onSelect(): void;
}

export interface SearchCommandProps {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  hits: SearchHit[];
  isLoading?: boolean;
  /** 输入框 placeholder。 */
  placeholder?: string;
}

export function SearchCommand({
  isOpen,
  onOpenChange,
  hits,
  isLoading,
  placeholder = '搜索资料、标签、动作…'
}: SearchCommandProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次打开清空 query 并聚焦。
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return hits;
    const needle = query.trim().toLowerCase();
    return hits.filter((hit) => {
      const haystack = `${hit.primary} ${hit.secondary ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [hits, query]);

  // 当过滤结果变化时，保证 activeIndex 不越界。
  useEffect(() => {
    if (activeIndex > filtered.length - 1) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered, activeIndex]);

  const closeSearch = () => onOpenChange(false);

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((idx) => (idx + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((idx) => (idx - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = filtered[activeIndex];
      if (hit) {
        hit.onSelect();
        closeSearch();
      }
    }
  }

  const activeHit = filtered[activeIndex];

  return (
    <Dialog
      title="全局搜索"
      description="使用 ⌘ K / Ctrl K 随时唤起。"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
    >
      <DialogBody>
        <div className={styles.commandPanel}>
          <div className={styles.inputRow}>
            <SearchIcon size={18} />
            <input
              ref={inputRef}
              type="text"
              name="global-search"
              autoComplete="off"
              className={styles.input}
              value={query}
              placeholder={placeholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKey}
              aria-label="搜索关键字"
              aria-controls="search-command-results"
              aria-activedescendant={activeHit ? `search-hit-${activeHit.id}` : undefined}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
            />
            {query ? (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  setQuery('');
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                aria-label="清除搜索关键字"
              >
                清除
              </button>
            ) : null}
          </div>
          <div
            id="search-command-results"
            className={styles.hitList}
            aria-busy={isLoading ? 'true' : undefined}
          >
            {isLoading ? (
              <LoadingState label="正在搜索…" />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={query ? `没有匹配「${query.trim()}」的结果` : '没有可跳转的目标'}
                description={query ? '试试更换关键词，或新建一份资料。' : '连接资料服务后可搜索资料标题与标签。'}
              />
            ) : (
              <SearchResults
                hits={filtered}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                onSelect={(hit) => {
                  hit.onSelect();
                  closeSearch();
                }}
              />
            )}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}

interface SearchResultsProps {
  hits: SearchHit[];
  activeIndex: number;
  onActiveChange(index: number): void;
  onSelect(hit: SearchHit): void;
}

function SearchResults({ hits, activeIndex, onActiveChange, onSelect }: SearchResultsProps) {
  return (
    <ul className={styles.resultList} role="listbox">
      {hits.map((hit, index) => {
        const isActive = index === activeIndex;
        return (
          <li
            key={hit.id}
            id={`search-hit-${hit.id}`}
            role="option"
            aria-selected={isActive}
            className={cx(styles.hit, isActive && styles.hitActive)}
            onMouseEnter={() => onActiveChange(index)}
            onClick={() => onSelect(hit)}
          >
            <span className={styles.hitGroup}>{hit.group}</span>
            <span className={styles.hitBody}>
              <span className={styles.hitPrimary}>{hit.primary}</span>
              {hit.secondary ? <span className={styles.hitSecondary}>{hit.secondary}</span> : null}
            </span>
            {hit.hint ? <span className={styles.hitHint}>{hit.hint}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

import { Button, Menu, MenuItem, MenuPopover, MenuTrigger, SearchField } from '../../components/ui';
import { FilterIcon, GridIcon, ListIcon, SearchIcon, SortIcon } from '../../shell/icons';
import {
  LIBRARY_FILTER_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  type LibraryFilters,
  type LibraryNameSort,
  type LibraryTimeSort,
  type LibraryTypeFilter,
  type LibraryViewMode
} from './libraryTypes';
import styles from './Library.module.css';

interface LibraryToolbarProps {
  filters: LibraryFilters;
  keyword: string;
  sort: LibraryTimeSort | LibraryNameSort;
  viewMode: LibraryViewMode;
  onKeywordChange(value: string): void;
  onTypeChange(value: LibraryTypeFilter): void;
  onStatusChange(value: LibraryFilters['status']): void;
  onTimeChange(value: LibraryTimeSort): void;
  onSortChange(value: LibraryTimeSort | LibraryNameSort): void;
  onViewModeChange(value: LibraryViewMode): void;
  onReset(): void;
}

export function LibraryToolbar({
  filters,
  keyword,
  sort,
  viewMode,
  onKeywordChange,
  onTypeChange,
  onStatusChange,
  onTimeChange,
  onSortChange,
  onViewModeChange,
  onReset
}: LibraryToolbarProps) {
  const hasFilters = Boolean(keyword || filters.type !== 'all' || filters.status !== 'all' || sort !== 'updated-desc');
  return (
    <div className={styles.toolbar} aria-label="资料索引工具栏">
      <SearchField
        label="在当前笔记中搜索"
        placeholder="搜索标题、位置或状态…"
        value={keyword}
        onChange={onKeywordChange}
        icon={<SearchIcon size={17} />}
        className={styles.toolbarSearch}
      />
      <div className={styles.filterRow} role="group" aria-label="资料筛选">
        <FilterMenu
          label="类型"
          value={getLabel(LIBRARY_FILTER_OPTIONS.type, filters.type)}
          options={LIBRARY_FILTER_OPTIONS.type}
          active={filters.type !== 'all'}
          onChange={(value) => onTypeChange(value as LibraryTypeFilter)}
        />
        <FilterMenu
          label="状态"
          value={getLabel(LIBRARY_FILTER_OPTIONS.status, filters.status)}
          options={LIBRARY_FILTER_OPTIONS.status}
          active={filters.status !== 'all'}
          onChange={(value) => onStatusChange(value as LibraryFilters['status'])}
        />
        <FilterMenu
          label="时间"
          value={getLabel(LIBRARY_FILTER_OPTIONS.time, filters.time)}
          options={LIBRARY_FILTER_OPTIONS.time}
          active={filters.time !== 'updated-desc'}
          onChange={(value) => onTimeChange(value as LibraryTimeSort)}
        />
        <MenuTrigger>
          <Button
            className={styles.filterButton}
            aria-label="选择排序方式"
            aria-haspopup="menu"
          >
            <SortIcon size={14} />
            <span>{getLabel(LIBRARY_SORT_OPTIONS, sort)}</span>
          </Button>
          <MenuPopover>
            <Menu ariaLabel="排序方式" onAction={(key) => onSortChange(String(key) as LibraryTimeSort | LibraryNameSort)}>
              {LIBRARY_SORT_OPTIONS.map((option) => (
                <MenuItem key={option.id} id={option.id}>
                  {option.label}{option.id === sort ? ' · 当前' : ''}
                </MenuItem>
              ))}
            </Menu>
          </MenuPopover>
        </MenuTrigger>
        {hasFilters ? (
          <Button variant="ghost" className={styles.resetButton} onClick={onReset}>
            清除筛选
          </Button>
        ) : null}
        <span className={styles.viewToggle} role="group" aria-label="视图模式">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            className={styles.viewButton}
            aria-pressed={viewMode === 'list'}
            aria-label="列表视图"
            onClick={() => onViewModeChange('list')}
          >
            <ListIcon size={14} />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            className={styles.viewButton}
            aria-pressed={viewMode === 'grid'}
            aria-label="网格视图"
            onClick={() => onViewModeChange('grid')}
          >
            <GridIcon size={14} />
          </Button>
        </span>
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  value,
  options,
  active,
  onChange
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  active: boolean;
  onChange(value: string): void;
}) {
  return (
    <MenuTrigger>
      <Button
        className={styles.filterButton}
        data-active={active || undefined}
        aria-label={`${label}筛选：${value}`}
        aria-haspopup="menu"
      >
        <FilterIcon size={13} />
        <span>{label}：{value}</span>
      </Button>
      <MenuPopover>
        <Menu ariaLabel={`${label}筛选`} onAction={(key) => onChange(String(key))}>
          {options.map((option) => (
            <MenuItem key={option.id} id={option.id}>
              {option.label}{option.label === value ? ' · 当前' : ''}
            </MenuItem>
          ))}
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}

function getLabel(options: ReadonlyArray<{ id: string; label: string }>, id: string): string {
  return options.find((option) => option.id === id)?.label ?? options[0]?.label ?? '';
}

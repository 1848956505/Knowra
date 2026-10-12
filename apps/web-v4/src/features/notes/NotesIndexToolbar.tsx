import { Button, SearchBox, SegmentedButton, SegmentedControl, Tooltip, TooltipTrigger,
  Popover, PopoverDialog, PopoverTrigger, Checkbox, Menu, MenuItem, MenuTrigger, MenuPopover, Select } from '../../components/ui';
import { ComponentLibraryIcon, ListIcon, SearchIcon, FilterIcon, PanelIcon, SortArrowsIcon, TagIcon, SettingsIcon } from '../../components/icons/knowra';
import { WorkspacePanelToolbar } from '../../components/workspace/WorkspacePanel';
import { SORT_LABELS, GROUP_LABELS, type GroupMode, type SortMode, type IndexDisplayProperties } from './notesIndexPresentation';
import { FILTER_LABELS, NOTE_STATUS_LABELS, type UpdatedWithin } from './notesIndexFilters';
import { notesIndexAppearanceProps } from './NotesIndexAppearance';
import { useNotesIndexAppearance } from './notesIndexAppearanceModel';
import type { NotesIndexController } from './useNotesIndexController';
import styles from './NotesIndexView.module.css';

export function NotesIndexToolbar({ c }: { c: NotesIndexController }) {
  const theme = notesIndexAppearanceProps(useNotesIndexAppearance());
  const { counts } = c.data;
  return <WorkspacePanelToolbar className={styles.toolbar} role="toolbar" aria-label="笔记索引工具栏">
    <SegmentedControl aria-label="类型筛选" data-control-group="segmented">
      {(['all', 'folder', 'note'] as const).map((type, index) => <SegmentedButton key={type}
        aria-label={['全部', '文件夹', '笔记'][index]} aria-pressed={c.typeFilter === type} count={counts[type]}
        onPress={() => c.setTypeFilter(type)}>{['全部', '文件夹', '笔记'][index]}</SegmentedButton>)}
    </SegmentedControl>
    <span className={styles.toolbarSpacer} />
    <div className={styles.searchSlot}><SearchBox label="搜索笔记索引" icon={<SearchIcon size={15} />} ref={c.searchRef}
      name="notes-index-search" autoComplete="off" value={c.notesIndex.query}
      onChange={event => c.store.setNotesQuery(event.target.value)} placeholder="在当前索引中搜索…" shortcut="/"
      onClear={c.notesIndex.query ? () => c.store.setNotesQuery('') : undefined}
      surfaceProps={{ 'data-shadow-owner': 'search', 'data-shadow-token': '--shadow-search-rest' }} /></div>
    <PopoverTrigger><Button variant="ghost" size="workspace" iconOnly aria-label="筛选"
      aria-pressed={c.filters.statuses.length > 0 || Boolean(c.filters.updatedWithin)}><FilterIcon size={16} /></Button>
      <Popover placement="bottom end" {...theme}><PopoverDialog aria-label="筛选已加载笔记"><div className={styles.options}>
        <p className={styles.optionHint}>状态与时间筛选仅作用于已加载笔记。</p>
        <fieldset><legend>状态</legend>{Object.entries(NOTE_STATUS_LABELS).map(([value, label]) => <Checkbox key={value}
          isSelected={c.filters.statuses.includes(value)} onChange={selected => c.setFilters(current => ({ ...current,
            statuses: selected ? [...current.statuses, value] : current.statuses.filter(status => status !== value) }))}>{label}</Checkbox>)}</fieldset>
        <Select label="更新时间" selectedKey={c.filters.updatedWithin ?? 'all'} onSelectionChange={key => c.setFilters(current => ({ ...current, updatedWithin: key === 'all' ? null : key as UpdatedWithin }))}
          options={[{ id: 'all', label: '不限时间' }, ...Object.entries(FILTER_LABELS).map(([id, label]) => ({ id, label }))]} />
        <Button variant="ghost" size="compact" onPress={() => c.setFilters({ statuses: [], updatedWithin: null })}>清除状态与时间筛选</Button>
      </div></PopoverDialog></Popover>
    </PopoverTrigger>
    <TooltipTrigger><Button variant="ghost" size="workspace" iconOnly aria-label={c.tagFiltersOpen ? '收起标签筛选' : '展开标签筛选'}
      aria-expanded={c.tagFiltersOpen} aria-controls="notes-index-tag-filters" onPress={() => c.setTagFiltersOpen(value => !value)}><TagIcon size={16} /></Button><Tooltip>标签筛选</Tooltip></TooltipTrigger>
    <PopoverTrigger><Button variant="ghost" size="workspace" iconOnly aria-label="显示选项（分组、属性、图标大小）"><SettingsIcon size={16} /></Button>
      <Popover placement="bottom end" {...theme}><PopoverDialog aria-label="索引显示选项"><div className={styles.options}>
        <Select label="分组" selectedKey={c.group} onSelectionChange={key => { c.setGroup(key as GroupMode); c.setCollapsed(new Set()); }}
          options={Object.entries(GROUP_LABELS).map(([id, label]) => ({ id, label }))} />
        <fieldset><legend>显示属性</legend>{Object.entries({ summary: '摘要', tags: '标签', status: '状态', location: '位置', updated: '更新时间' }).map(([key, label]) => <Checkbox key={key}
          isSelected={c.properties[key as keyof IndexDisplayProperties]} onChange={value => c.setProperties(current => ({ ...current, [key]: value }))}>{label}</Checkbox>)}</fieldset>
        <Select label="图标大小" selectedKey={c.iconSize} onSelectionChange={key => c.setIconSize(key as 's' | 'm' | 'l')}
          options={[{ id: 's', label: '小' }, { id: 'm', label: '中' }, { id: 'l', label: '大' }]} />
      </div></PopoverDialog></Popover>
    </PopoverTrigger>
    <MenuTrigger><Button variant="ghost" size="workspace" iconOnly aria-label={`排序：${SORT_LABELS[c.sort]}`}><SortArrowsIcon size={16} /></Button>
      <MenuPopover {...theme}><Menu ariaLabel="索引排序" selectionMode="single" selectedKeys={[c.sort]} onAction={key => c.setSort(key as SortMode)}>
        {Object.entries(SORT_LABELS).map(([key, label]) => <MenuItem id={key} key={key}>{label}</MenuItem>)}
      </Menu></MenuPopover>
    </MenuTrigger>
    <span className={styles.separator} />
    <Button variant="ghost" size="workspace" iconOnly aria-label="预览栏" aria-pressed={c.peekOpen}
      onPress={() => c.setPeekOpen(value => !value)}><PanelIcon size={16} /></Button>
    <SegmentedControl aria-label="视图切换">
      <SegmentedButton iconOnly aria-label="列表视图" aria-pressed={c.view === 'list'} onPress={() => c.setView('list')}><ListIcon size={15} /></SegmentedButton>
      <SegmentedButton iconOnly aria-label="图标视图" aria-pressed={c.view === 'grid'} onPress={() => c.setView('grid')}><ComponentLibraryIcon size={15} /></SegmentedButton>
      <SegmentedButton iconOnly aria-label="卡片视图" aria-pressed={c.view === 'card'} onPress={() => c.setView('card')}><CardViewIcon /></SegmentedButton>
    </SegmentedControl>
  </WorkspacePanelToolbar>;
}
function CardViewIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1.8" y="2.2" width="6" height="13" rx="1.8" /><rect x="10.2" y="2.2" width="6" height="13" rx="1.8" /><path d="M2 8h5.5M10.5 8h5.5" /></svg>;
}

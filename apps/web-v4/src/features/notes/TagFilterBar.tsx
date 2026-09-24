import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Tag, TagGroup } from '@study-accelerator/web-core';
import { Button, Popover, PopoverDialog, PopoverTrigger, SearchBox, SegmentedButton, SegmentedControl } from '../../components/ui';
import { ChevronDownIcon, SearchIcon } from '../../shell/icons';
import { TagChip } from '../tags';
import styles from './TagFilterBar.module.css';

const CHIP_GAP = 8;
const MORE_WIDTH = 120;

export function fitTagChips(widths: number[], availableWidth: number): number {
  const totalWidth = widths.reduce((total, width) => total + width, 0) + Math.max(0, widths.length - 1) * CHIP_GAP;
  if (totalWidth <= availableWidth) return widths.length;
  const limit = Math.max(0, availableWidth - MORE_WIDTH - CHIP_GAP);
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = used + (count > 0 ? CHIP_GAP : 0) + width;
    if (next > limit) break;
    used = next;
    count++;
  }
  return count;
}

export function TagFilterBar({ tags, groups, selectedIds, match, onToggleTag, onMatchChange, onManage }: {
  tags: Tag[];
  groups: TagGroup[];
  selectedIds: string[];
  match: 'all' | 'any';
  onToggleTag(id: string): void;
  onMatchChange(match: 'all' | 'any'): void;
  onManage(): void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const orderedTags = useMemo(() => [
    ...tags.filter((tag) => selectedSet.has(tag.id)),
    ...tags.filter((tag) => !selectedSet.has(tag.id))
  ], [selectedSet, tags]);
  const visibleTags = orderedTags.slice(0, visibleCount ?? orderedTags.length);
  const hiddenTags = orderedTags.slice(visibleTags.length);
  const hiddenSelectedCount = hiddenTags.filter((tag) => selectedSet.has(tag.id)).length;
  const search = query.trim().toLocaleLowerCase('zh-CN');
  const matchingTags = tags.filter((tag) => (tag.name ?? '未命名标签').toLocaleLowerCase('zh-CN').includes(search));
  const selectedMatches = matchingTags.filter((tag) => selectedSet.has(tag.id));
  const unselectedMatches = matchingTags.filter((tag) => !selectedSet.has(tag.id));
  const sortedGroups = [...groups].sort((left, right) => left.sortOrder - right.sortOrder);
  const sections = [
    ...sortedGroups.map((group) => ({ id: group.id, name: group.name, tags: unselectedMatches.filter((tag) => tag.groupId === group.id) })),
    { id: 'ungrouped', name: sortedGroups.length ? '未分组' : '全部标签', tags: unselectedMatches.filter((tag) => !sortedGroups.some((group) => group.id === tag.groupId)) }
  ].filter((section) => section.tags.length > 0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure) return;
    let active = true;
    function update() {
      if (!active || !viewport || !measure) return;
      const widths = Array.from(measure.children, (chip) => chip.getBoundingClientRect().width);
      const hasMore = Boolean(viewport.parentElement?.querySelector('[data-tag-more]'));
      const width = viewport.clientWidth + (hasMore ? MORE_WIDTH + CHIP_GAP : 0);
      if (width <= 0 || widths.some((value) => value <= 0)) {
        setVisibleCount(null);
        return;
      }
      const next = fitTagChips(widths, width);
      setVisibleCount((current) => current === next ? current : next);
    }
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    window.addEventListener('resize', update);
    void document.fonts?.ready.then(update);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [orderedTags]);

  return <div id="notes-index-tag-filters" className={styles.bar} role="group" aria-label="标签筛选条件">
    <span className={styles.label}>标签</span>
    <div className={styles.chipArea}>
      <div className={styles.chipViewport} ref={viewportRef} data-tag-viewport aria-label="常用与已选标签">
        {visibleTags.map((tag) => <TagChip key={tag.id} tag={tag} selected={selectedSet.has(tag.id)} aria-pressed={selectedSet.has(tag.id)} onClick={() => onToggleTag(tag.id)} />)}
        {tags.length === 0 ? <span className={styles.empty}>暂无标签</span> : null}
      </div>
      {hiddenTags.length > 0 ? <PopoverTrigger isOpen={moreOpen} onOpenChange={(open) => { setMoreOpen(open); if (!open) setQuery(''); }}>
        <Button size="compact" className={styles.more} data-tag-more aria-label={`更多标签，隐藏 ${hiddenTags.length} 个${hiddenSelectedCount ? `，其中已选 ${hiddenSelectedCount} 个` : ''}`} aria-expanded={moreOpen}>
          更多 {hiddenTags.length}{hiddenSelectedCount > 0 ? <span className={styles.hiddenSelected} aria-hidden="true">选{hiddenSelectedCount}</span> : null}<ChevronDownIcon size={12} />
        </Button>
        <Popover placement="bottom start" offset={8} className={styles.popover}>
          <PopoverDialog aria-label="全部标签" className={styles.popoverContent}>
            <div className={styles.popoverHeader}><strong>全部标签</strong><span>{tags.length} 个</span></div>
            <SearchBox label="搜索全部标签" icon={<SearchIcon size={15} />} size="field" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签…" />
            <div className={styles.popoverList}>
              {selectedMatches.length > 0 ? <section aria-label="已选标签" className={styles.popoverSection}><h3>已选标签</h3><div className={styles.popoverChips}>{selectedMatches.map((tag) => <TagChip key={tag.id} tag={tag} selected aria-pressed="true" onClick={() => onToggleTag(tag.id)} />)}</div></section> : null}
              {sections.map((section) => <section key={section.id} aria-label={section.name} className={styles.popoverSection}><h3>{section.name}</h3><div className={styles.popoverChips}>{section.tags.map((tag) => <TagChip key={tag.id} tag={tag} aria-pressed="false" onClick={() => onToggleTag(tag.id)} />)}</div></section>)}
              {matchingTags.length === 0 ? <p className={styles.noResults}>没有符合条件的标签</p> : null}
            </div>
          </PopoverDialog>
        </Popover>
      </PopoverTrigger> : null}
    </div>
    <div className={styles.actions}>
      {selectedIds.length > 1 ? <SegmentedControl aria-label="多标签匹配方式">
        <SegmentedButton aria-pressed={match === 'all'} onPress={() => onMatchChange('all')}>满足全部</SegmentedButton>
        <SegmentedButton aria-pressed={match === 'any'} onPress={() => onMatchChange('any')}>满足任一</SegmentedButton>
      </SegmentedControl> : null}
      <Button size="compact" className={styles.manage} onPress={onManage}>管理标签</Button>
    </div>
    <div className={styles.measure} ref={measureRef} data-tag-measure aria-hidden="true">{orderedTags.map((tag) => <TagChip key={tag.id} tag={tag} selected={selectedSet.has(tag.id)} />)}</div>
  </div>;
}

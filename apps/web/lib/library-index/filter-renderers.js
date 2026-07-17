import {
  getLibraryFilterLabel,
  getLibraryFilterOptions,
  getLibraryTabCounts,
  resolveLibraryFilters
} from './model.js';

const FILTER_LABELS = {
  type: '类型',
  status: '状态',
  time: '时间'
};

export function renderLibraryIndexTabs({ state }) {
  const counts = getLibraryTabCounts(state.allNotes);
  const tabs = [
    ['all', '全部条目'],
    ['recent', '最近'],
    ['favorites', '已收藏'],
    ['recycle', '回收站']
  ];

  return tabs.map(([key, label]) => `
    <button type="button" data-index-tab="${key}" data-active="${String(state.libraryIndex.tab === key)}">
      ${label}<b>${counts[key]}</b>
    </button>
  `).join('');
}

export function renderLibraryIndexFilters({ state }) {
  const filters = resolveLibraryFilters(state.libraryIndex.filters);
  return Object.keys(FILTER_LABELS)
    .map((kind) => renderFilterControl({
      kind,
      value: filters[kind],
      isOpen: state.libraryIndex.filterMenu === kind
    }))
    .join('');
}

function renderFilterControl({ kind, value, isOpen }) {
  const label = FILTER_LABELS[kind];
  const options = getLibraryFilterOptions(kind);
  const valueLabel = getLibraryFilterLabel(kind, value);
  return `
    <div class="index-filter-shell" data-index-filter-shell="${kind}">
      <button
        type="button"
        class="index-filter-trigger"
        data-index-filter="${kind}"
        aria-expanded="${String(isOpen)}"
        aria-haspopup="menu"
      >
        <span>${label}</span><b>${valueLabel}</b>
        <svg class="index-filter-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6.25 8 10l4-3.75"></path>
        </svg>
      </button>
      ${isOpen ? `
        <div class="index-filter-menu" role="menu" aria-label="${label}筛选">
          ${options.map((option) => `
            <button
              type="button"
              role="menuitemradio"
              aria-checked="${String(option.value === value)}"
              data-index-filter-option
              data-filter-kind="${kind}"
              data-filter-value="${option.value}"
            >${option.label}</button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

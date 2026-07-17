export const SECONDARY_SECTION_ITEMS = [
  { key: 'favorites', label: '收藏' },
  { key: 'recent', label: '最近' },
  { key: 'recycle', label: '回收站' }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

export function renderSectionMenuItems({
  items = SECONDARY_SECTION_ITEMS,
  sections = {}
} = {}) {
  return items
    .map((item) => `
      <button
        type="button"
        class="library-context-item library-check-item"
        data-section-toggle="${escapeAttribute(item.key)}"
        data-active="${String(Boolean(sections[item.key]))}"
        aria-pressed="${String(Boolean(sections[item.key]))}"
      >
        <span class="library-checkmark">${sections[item.key] ? '✓' : ''}</span>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `)
    .join('');
}

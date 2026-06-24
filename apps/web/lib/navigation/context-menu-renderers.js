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

export function renderContextMenuItems(items = []) {
  return items
    .map((item) => {
      if (!item) {
        return '';
      }

      if (item.type === 'divider') {
        return '<div class="library-context-divider" aria-hidden="true"></div>';
      }

      if (!item.action) {
        return '';
      }

      return `
        <button type="button" class="library-context-item" data-context-action="${escapeAttribute(item.action)}">
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    })
    .join('');
}

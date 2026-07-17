export function renderModuleRail(items) {
  return items
    .map((item) => {
      const label = getRailLabel(item.key);

      return `
        <button
          type="button"
          class="rail-item"
          data-module-key="${escapeAttribute(item.key)}"
          data-active="${Boolean(item.active)}"
          aria-label="${escapeAttribute(label)}"
          title="${escapeAttribute(label)}"
        >
          <span class="rail-item-icon" aria-hidden="true">${renderRailIcon(item.key)}</span>
          <span class="rail-item-label">${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join('');
}

export function getRailLabel(key) {
  switch (key) {
    case 'knowledge':
      return '知识库';
    case 'paper':
      return '题库';
    case 'ai':
      return 'AI 工作台';
    case 'task':
      return '任务';
    case 'review':
      return '复盘';
    case 'settings':
      return '设置';
    default:
      return key;
  }
}

export function renderRailIcon(key) {
  switch (key) {
    case 'knowledge':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M4.5 5.5h6a3 3 0 0 1 3 3v10h-6a3 3 0 0 0-3 3z"></path>
          <path d="M19.5 5.5h-6a3 3 0 0 0-3 3v10h6a3 3 0 0 1 3 3z"></path>
        </svg>
      `;
    case 'paper':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5h7l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"></path>
          <path d="M14 4.5v4h4"></path>
          <path d="M8.5 12h7"></path>
          <path d="M8.5 15.5h7"></path>
        </svg>
      `;
    case 'ai':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 3.5l1.8 4.2L18 9.5l-4.2 1.8L12 15.5l-1.8-4.2L6 9.5l4.2-1.8z"></path>
          <path d="M18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"></path>
          <path d="M6 15.5l1 2.2 2.2 1-2.2 1-1 2.3-1-2.3-2.2-1 2.2-1z"></path>
        </svg>
      `;
    case 'task':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M9 6.5h10"></path>
          <path d="M9 12h10"></path>
          <path d="M9 17.5h10"></path>
          <path d="M5.5 6.5h.01"></path>
          <path d="M5.5 12h.01"></path>
          <path d="M5.5 17.5h.01"></path>
        </svg>
      `;
    case 'review':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 5.5v13"></path>
          <path d="M5.5 12h13"></path>
          <path d="M7.5 7.5l9 9"></path>
          <path d="M16.5 7.5l-9 9"></path>
        </svg>
      `;
    case 'settings':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"></path>
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6H9.6l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.6h4.8l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.07-.33.1-.67.1-1z"></path>
        </svg>
      `;
    default:
      return '';
  }
}

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

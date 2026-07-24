import { escapeHtml, escapeAttribute } from '../../src/app/formatting.js';

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
  const iconAssets = {
    knowledge: '/styles/icons/phosphor-books-duotone.svg',
    paper: '/styles/icons/phosphor-exam-duotone.svg',
    ai: '/styles/icons/phosphor-atom-duotone.svg',
    task: '/styles/icons/phosphor-list-checks-duotone.svg',
    review: '/styles/icons/phosphor-arrows-clockwise-duotone.svg'
  };
  const src = iconAssets[key];
  return src ? `<img src="${src}" alt="" />` : '';
}

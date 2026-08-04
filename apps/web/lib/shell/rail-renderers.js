import { escapeHtml, escapeAttribute } from '../../src/app/formatting.js';
import { renderIcon } from '../icons/icon-map.js';

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
    case 'materials':
      return '资料';
    case 'knowledge':
      return '知识';
    case 'training':
      return '训练';
    case 'learning':
      return '学习档案';
    // 保留旧入口的显示兼容，避免缓存或旧快照中的模块键渲染为空。
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
  const iconNames = {
    materials: 'moduleMaterials',
    knowledge: 'moduleKnowledge',
    training: 'moduleTraining',
    learning: 'moduleLearning',
    paper: 'modulePaper',
    ai: 'moduleAi',
    task: 'moduleTask',
    review: 'moduleReview'
  };
  return iconNames[key] ? renderIcon(iconNames[key]) : '';
}

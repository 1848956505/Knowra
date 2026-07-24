import { escapeHtml } from '../../src/app/formatting.js';
import { getNoteStats } from '../sidebar/stats.js';

export function renderStatusIndicators({
  statusMessage,
  saveState = 'idle'
}) {
  const saveLabel = {
    dirty: '等待保存',
    saving: '正在保存',
    saved: '已自动保存',
    error: '保存失败'
  }[saveState] ?? '保存当前资料';

  return `
      <button type="button" class="status-action status-save" data-save-now data-state="${saveState}">
        <i aria-hidden="true"></i>${saveLabel}
      </button>
      <span class="status-inline status-message">${escapeHtml(statusMessage)}</span>
    `;
}

export function renderStatusMeta({ dataMode, markdown = '', view = {} }) {
  const stats = getStatusDocumentStats(markdown);
  const modeLabel = dataMode === 'api' ? '云端已连接' : '本地优先';

  return `
      <span class="status-inline">字数 ${stats.characters}</span>
      <span class="status-inline">行数 ${stats.lines}</span>
      <span class="status-inline">链接 ${stats.links}</span>
      <button type="button" class="status-action" data-status-action="toggle-source-editor" data-active="${String(Boolean(view.showSourceEditor))}">源码</button>
      <button type="button" class="status-action" data-status-action="toggle-right-sidebar" data-active="${String(Boolean(view.showRightSidebar))}">边注</button>
      <button
        type="button"
        class="status-action"
        data-status-action="toggle-focus"
        data-active="${String(view.mode === 'focus')}"
        aria-label="${view.mode === 'focus' ? '退出专注模式' : '进入专注模式'}"
      >专注</button>
      <span class="status-inline">UTF-8</span>
      <span class="status-inline">${escapeHtml(modeLabel)}</span>
    `;
}

export function getStatusDocumentStats(markdown = '') {
  const value = String(markdown);
  return {
    characters: getNoteStats(value).characterCount,
    lines: value ? value.split(/\r?\n/).length : 0,
    links: (value.match(/\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]/g) ?? []).length
  };
}

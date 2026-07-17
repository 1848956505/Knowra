import { getNoteStats } from '../sidebar/stats.js';

export function renderStatusIndicators({
  statusMessage,
  visibleNoteCount,
  folderCount,
  currentTitle = '',
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
      <span class="status-inline status-current" title="${escapeHtml(currentTitle)}">${escapeHtml(currentTitle || '未打开资料')}</span>
      <span class="status-inline">笔记 ${visibleNoteCount}</span>
      <span class="status-inline">目录 ${folderCount}</span>
      <span class="status-inline status-message">${escapeHtml(statusMessage)}</span>
    `;
}

export function renderStatusMeta({ dataMode, markdown = '', view = {} }) {
  const stats = getStatusDocumentStats(markdown);
  const modeLabel = dataMode === 'api' ? '云端已连接' : '本地优先';

  return `
      <span class="status-inline">字数 ${stats.characters}</span>
      <span class="status-inline">行数 ${stats.lines}</span>
      <span class="status-inline">大纲 ${stats.headings}</span>
      <span class="status-inline">链接 ${stats.links}</span>
      <button type="button" class="status-action" data-status-action="toggle-source-editor" data-active="${String(Boolean(view.showSourceEditor))}">源码</button>
      <button type="button" class="status-action" data-status-action="toggle-right-sidebar" data-active="${String(Boolean(view.showRightSidebar))}">边注</button>
      <span class="status-inline">UTF-8</span>
      <span class="status-inline">${escapeHtml(modeLabel)}</span>
    `;
}

export function getStatusDocumentStats(markdown = '') {
  const value = String(markdown);
  return {
    characters: getNoteStats(value).characterCount,
    lines: value ? value.split(/\r?\n/).length : 0,
    headings: value.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line.trim())).length,
    links: (value.match(/\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]/g) ?? []).length
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

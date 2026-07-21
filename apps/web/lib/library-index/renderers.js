import { buildFolderPath } from '../navigation/selection.js';
import { getEstimatedReadingMinutes, getSourceTypeLabel, getStatusLabel } from './model.js';
import { renderLibraryPagination } from './pagination-renderers.js';

export function renderLibraryIndexScope({ notes, state }) {
  const folderName = state.selectedFolderId ? state.foldersById[state.selectedFolderId]?.name : null;
  const scope = folderName || ({ all: '全部资料', recent: '最近资料', favorites: '收藏资料', recycle: '回收站' }[state.libraryIndex.tab] ?? '全部资料');
  const folderCount = Object.keys(state.foldersById).length;
  const latest = notes[0]?.updatedAt ? formatCompactDate(notes[0].updatedAt) : '暂无记录';
  return `
    <span>当前范围　SCOPE</span>
    <strong>${escapeHtml(scope)}</strong>
    <div><b>资料 ${notes.length}</b><b>文件夹 ${folderCount}</b><b>最近更新 ${escapeHtml(latest)}</b></div>
  `;
}

export function renderLibraryIndexContent({ notes, pagination, state }) {
  if (!notes.length) {
    return `
      <section class="entry-list">
        <div class="empty-state">
          <strong>没有找到匹配条目</strong>
          <span>可以清除搜索、切换资料范围或返回全部资料。</span>
          <button type="button" data-index-clear>清除筛选</button>
        </div>
      </section>
      <footer class="pagination"><span>当前 0 条</span></footer>
    `;
  }

  const selectedId = state.libraryIndex.selectedNoteId;
  return `
    <section class="entry-list" aria-label="资料条目">
      ${notes.map((note, index) => renderIndexEntry({
        note,
        index: pagination.startIndex + index,
        selected: note.id === selectedId,
        state
      })).join('')}
    </section>
    ${renderLibraryPagination(pagination)}
  `;
}

export function renderLibraryIndexInspector({ note, state }) {
  if (!state.libraryIndex.inspectorOpen) {
    return '<button type="button" class="reopen-panel" data-index-inspector-open>详情</button>';
  }

  if (!note) {
    return `
      <button type="button" class="panel-close" data-index-inspector-close aria-label="收起详情">›</button>
      <header class="inspector-heading inspector-heading-empty"><strong class="inspector-heading-title">未选择资料</strong></header>
      <div class="inspector-empty"><strong>未选择资料</strong><span>请从列表中选择一条资料。</span></div>
    `;
  }

  const tags = resolveNoteTags(note, state.tags);
  const folderPath = buildFolderPath({ folderId: note.folderId, foldersById: state.foldersById }) || '未分类';
  const linkedNotes = (note.internalLinks ?? [])
    .map((noteId) => state.allNotes.find((item) => item.id === noteId))
    .filter(Boolean);
  const outline = extractOutline(note.rawMarkdown ?? '');
  const attachments = note.id === state.selectedNoteId ? state.attachments : [];

  return `
    <button type="button" class="panel-close" data-index-inspector-close aria-label="收起详情">›</button>
    <header class="inspector-heading">
      <strong class="inspector-heading-title" title="${escapeAttribute(note.title)}">${escapeHtml(note.title)}</strong>
      <button type="button" class="inspector-open-button" data-index-open="${escapeAttribute(note.id)}" aria-label="打开资料：${escapeAttribute(note.title)}" title="打开资料">
        <svg class="inspector-open-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9 3h4v4M13 3 7 9"></path>
          <path d="M11 8.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3.5"></path>
        </svg>
      </button>
    </header>
    ${renderFixedSection({ icon: 'file', title: '资料信息', content: `
      <dl class="inspector-record">
        <div><dt>标题</dt><dd>${escapeHtml(note.title)}</dd></div>
        <div><dt>类型</dt><dd>Markdown 文档</dd></div>
        <div><dt>状态</dt><dd><span class="status ${note.deleted ? 'status-deleted' : 'status-active'}"><i></i>${note.deleted ? '已删除' : getStatusLabel(note.status)}</span></dd></div>
        <div><dt>所在位置</dt><dd>${escapeHtml(folderPath)}</dd></div>
        <div><dt>字数</dt><dd>${countCharacters(note.rawMarkdown)}</dd></div>
        <div><dt>最后编辑</dt><dd>${escapeHtml(formatCompactDate(note.updatedAt))}</dd></div>
        <div><dt>收藏</dt><dd>${note.favorite ? '已收藏' : '未收藏'}</dd></div>
      </dl>
    ` })}
    ${renderFixedSection({ icon: 'tag', title: '标签', content: `
      <div class="inspector-tag-wrap tag-row">${renderTagList(tags)}</div>
    ` })}
    <div class="summary-groups">
      ${renderDisclosure({ icon: 'link', title: '关联笔记', count: linkedNotes.length, content: linkedNotes.length
        ? `<ol class="relations">${linkedNotes.map((item) => `<li><a data-index-open="${escapeAttribute(item.id)}">${escapeHtml(shortId(item.id))}</a>${escapeHtml(item.title)}</li>`).join('')}</ol>`
        : '<span class="aside-empty-inline">暂无关联笔记</span>' })}
      ${renderDisclosure({ icon: 'list', title: '内容大纲', count: outline.length, content: outline.length
        ? `<ol class="outline preview-outline">${outline.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ol>`
        : '<span class="aside-empty-inline">当前资料还没有标题</span>' })}
      ${renderDisclosure({ icon: 'paperclip', title: '附件', count: attachments.length, content: attachments.length
        ? attachments.map((item) => `<button type="button" class="resource-row" data-attachment-open="${escapeAttribute(item.id)}"><span>${escapeHtml(item.fileName)}</span><small>${escapeHtml(item.mimeType ?? '')}</small></button>`).join('')
        : '<span class="aside-empty-inline">打开资料后可管理附件</span>' })}
    </div>
  `;
}

export function renderEditorDocumentHead({ note, state }) {
  if (!note) {
    return '<div class="document-head-empty">选择一条资料开始编辑</div>';
  }
  const tags = resolveNoteTags(note, state.tags);
  const folderPath = buildFolderPath({ folderId: note.folderId, foldersById: state.foldersById }) || '未分类';
  const displayId = getDisplayNoteId(note, state);
  return `
    <section class="document-head">
      <div class="document-meta-row">
        <div class="document-location"><span class="breadcrumb">资料库　/　${escapeHtml(folderPath)}　/　${displayId}</span><span class="status status-active"><i></i>${getStatusLabel(note.status)}</span></div>
        <div class="document-dates"><span>创建　${escapeHtml(formatCompactDate(note.createdAt))}</span><span>编辑　${escapeHtml(formatCompactDate(note.updatedAt))}</span></div>
      </div>
      <div class="document-title-row">
        <b class="document-id">${displayId}</b>
        <div class="document-title">
          <input
            type="text"
            class="document-title-input"
            data-document-title-input
            value="${escapeAttribute(state.draftTitle || note.title)}"
            aria-label="资料标题"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="tag-row">${renderTagList(tags)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderIndexEntry({ note, index, selected, state }) {
  const tags = resolveNoteTags(note, state.tags);
  const id = String(index + 1).padStart(3, '0');
  const readingMinutes = getEstimatedReadingMinutes(note);
  return `
    <article class="index-entry" data-index-note-select="${escapeAttribute(note.id)}" data-selected="${String(selected)}" tabindex="0" title="双击打开资料">
      <b class="entry-id">${id}</b>
      <div class="entry-copy">
        <div class="entry-heading"><h2>${escapeHtml(note.title)}</h2><span class="status ${note.deleted ? 'status-deleted' : 'status-active'}"><i></i>${note.deleted ? '已删除' : getStatusLabel(note.status)}</span></div>
        <p>${escapeHtml(summarizeNote(note))}</p>
        <div class="tag-row">${renderTagList(tags)}</div>
      </div>
      <div class="entry-meta"><span>${escapeHtml(formatCompactDate(note.updatedAt))}</span><span>${escapeHtml(getSourceTypeLabel(note.sourceType))}</span></div>
      <span class="entry-reading" aria-label="预计阅读 ${readingMinutes} 分钟"><b>${readingMinutes}</b><small>MIN</small></span>
      <button type="button" class="entry-action" ${note.deleted ? `data-index-restore="${escapeAttribute(note.id)}"` : `data-index-open="${escapeAttribute(note.id)}"`}>${note.deleted ? '恢复' : '打开'}</button>
    </article>
  `;
}

function renderFixedSection({ icon, title, content }) {
  return `<section class="inspector-fixed-section"><header>${renderSectionIcon(icon)}<h3>${title}</h3></header>${content}</section>`;
}

function renderDisclosure({ icon, title, count, content }) {
  return `<details class="inspector-disclosure"><summary><span>${renderSectionIcon(icon)}<b>${title}</b></span><span><small>${count}</small><b aria-hidden="true">⌄</b></span></summary><div class="disclosure-body">${content}</div></details>`;
}

export function renderSectionIcon(kind) {
  const paths = {
    file: '<path d="M4 2.5h5l3 3v8H4z"></path><path d="M9 2.5v3h3M6 9h4M6 11h4"></path>',
    tag: '<path d="M3 3h5l5 5-5 5-5-5z"></path><circle cx="6" cy="6" r="1"></circle>',
    link: '<path d="M6.5 9.5 9.5 6.5M5.5 11.5l-1 1a2 2 0 0 1-3-3l2-2a2 2 0 0 1 3 0M10.5 4.5l1-1a2 2 0 1 1 3 3l-2 2a2 2 0 0 1-3 0"></path>',
    list: '<path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path>',
    paperclip: '<path d="m6 8 4-4a2 2 0 1 1 3 3l-6 6a3 3 0 0 1-4-4l6-6"></path>'
  };
  return `<svg class="section-icon" viewBox="0 0 16 16" aria-hidden="true">${paths[kind] ?? paths.file}</svg>`;
}

function resolveNoteTags(note, tags) {
  return (note.tagIds ?? []).map((tagId) => tags.find((tag) => tag.id === tagId)).filter(Boolean);
}

function renderTagList(tags) {
  if (!tags.length) return '<span class="tag-empty">暂无标签</span>';
  return tags.map((tag) => `<span>${escapeHtml(tag.name)}</span>`).join('');
}

function summarizeNote(note) {
  const raw = String(note.summary ?? note.rawMarkdown ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.slice(0, 132) || '这条资料还没有正文摘要。';
}

function extractOutline(markdown) {
  return String(markdown).split('\n').flatMap((line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    return match ? [{ level: match[1].length, title: match[2].trim() }] : [];
  });
}

function countCharacters(markdown = '') {
  return String(markdown).replace(/\s/g, '').length;
}

function shortId(value) {
  const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');
  return (normalized.slice(-3) || '001').toUpperCase();
}

function getDisplayNoteId(note, state) {
  const orderedNotes = state.allNotes
    .filter((item) => !item.deleted)
    .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime());
  const index = orderedNotes.findIndex((item) => item.id === note.id);
  return String(Math.max(0, index) + 1).padStart(3, '0');
}

function formatCompactDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
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
  return escapeHtml(value).replace(/`/g, '&#96;');
}

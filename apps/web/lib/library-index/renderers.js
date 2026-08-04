import {
  escapeAttribute,
  escapeHtml,
  formatCompactDate
} from '../../src/app/formatting.js';
import { buildFolderPath } from '../navigation/selection.js';
import { resolveNoteTags, renderTagList } from '../tags/inline-renderers.js';
import { getEstimatedReadingMinutes, getSourceTypeLabel, getStatusLabel } from './model.js';
import { renderLibraryPagination } from './pagination-renderers.js';
import { renderIcon } from '../icons/icon-map.js';

export function renderLibraryIndexScope({ notes, state }) {
  const folderName = state.selectedFolderId ? state.foldersById[state.selectedFolderId]?.name : null;
  const scope = folderName || ({
    all: '全部资料',
    recent: '最近资料',
    favorites: '收藏资料',
    recycle: '回收站'
  }[state.libraryIndex.tab] ?? '全部资料');
  const folderCount = Object.keys(state.foldersById).length;
  const latest = notes[0]?.updatedAt ? formatCompactDate(notes[0].updatedAt) : '暂无记录';
  return `
    <span>浏览范围</span>
    <strong title="${escapeAttribute(scope)}">${escapeHtml(scope)}</strong>
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
      ${notes.map((note) => renderIndexEntry({
        note,
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
      <button type="button" class="panel-close" data-index-inspector-close aria-label="收起详情">
        ${renderIcon('navigationChevron', { className: 'panel-close-icon' })}
      </button>
      <header class="inspector-heading inspector-heading-empty"><strong class="inspector-heading-title">未选择资料</strong></header>
      <div class="inspector-empty"><strong>未选择资料</strong><span>请从列表中选择一条资料。</span></div>
    `;
  }

  const tags = resolveNoteTags(note, state.tags);
  const folderPath = buildFolderPath({ folderId: note.folderId, foldersById: state.foldersById }) || '未分类';
  const linkedNotes = (note.internalLinks ?? [])
    .map((noteId) => state.allNotes.find((item) => item.id === noteId))
    .filter(Boolean);
  const outline = Array.isArray(note.outline)
    ? note.outline
    : extractOutline(note.rawMarkdown ?? '');
  const attachments = note.id === state.selectedNoteId ? state.attachments : [];

  return `
    <button type="button" class="panel-close" data-index-inspector-close aria-label="收起详情">
      ${renderIcon('navigationChevron', { className: 'panel-close-icon' })}
    </button>
    <header class="inspector-heading">
      <div class="inspector-heading-copy">
        ${renderIcon('libraryIndex', { className: 'inspector-heading-icon' })}
        <span class="inspector-heading-text">
          <small>资料预览</small>
          <strong class="inspector-heading-title" title="${escapeAttribute(note.title)}">${escapeHtml(note.title)}</strong>
        </span>
      </div>
      <button type="button" class="inspector-open-button" data-index-open="${escapeAttribute(note.id)}" aria-label="打开资料：${escapeAttribute(note.title)}" title="打开资料">
        ${renderIcon('inspectorOpen', { className: 'inspector-open-icon' })}
        <span>打开</span>
      </button>
    </header>
    ${renderFixedSection({ icon: 'file', title: '资料信息', content: `
      <dl class="inspector-record">
        <div><dt>类型</dt><dd>Markdown 文档</dd></div>
        <div><dt>状态</dt><dd><span class="status ${note.deleted ? 'status-deleted' : 'status-active'}"><i></i>${note.deleted ? '已删除' : getStatusLabel(note.status)}</span></dd></div>
        <div><dt>所在位置</dt><dd>${escapeHtml(folderPath)}</dd></div>
        <div><dt>字数</dt><dd>${resolveCharacterCount(note)}</dd></div>
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

function renderIndexEntry({ note, selected, state }) {
  const tags = resolveNoteTags(note, state.tags);
  const readingMinutes = getEstimatedReadingMinutes(note);
  return `
    <article class="index-entry" data-index-note-select="${escapeAttribute(note.id)}" data-selected="${String(selected)}" tabindex="0" title="双击打开资料">
      ${renderArchiveMark()}
      <div class="entry-copy">
        <div class="entry-heading"><h2>${escapeHtml(note.title)}</h2><span class="status ${note.deleted ? 'status-deleted' : 'status-active'}"><i></i>${note.deleted ? '已删除' : getStatusLabel(note.status)}</span></div>
        <p>${escapeHtml(summarizeNote(note))}</p>
        <div class="tag-row">${renderTagList(tags)}</div>
      </div>
      <div class="entry-meta"><span>${escapeHtml(formatCompactDate(note.updatedAt))}</span><span>${escapeHtml(getSourceTypeLabel(note.sourceType))}</span></div>
      <span class="entry-reading" aria-label="预计阅读 ${readingMinutes} 分钟"><b>${readingMinutes}</b><small>MIN</small></span>
      <button
        type="button"
        class="entry-action"
        ${note.deleted ? `data-index-restore="${escapeAttribute(note.id)}"` : `data-index-open="${escapeAttribute(note.id)}"`}
        aria-label="${note.deleted ? `恢复资料：${escapeAttribute(note.title)}` : `打开资料：${escapeAttribute(note.title)}`}"
      >
        ${note.deleted
          ? '<span>恢复</span>'
          : `<span>打开</span>${renderIcon('inspectorOpen', { className: 'entry-action-icon' })}`}
      </button>
    </article>
  `;
}

function renderArchiveMark() {
  return `
    <div class="entry-archive" role="img" aria-label="书籍封面">
      ${renderIcon('archive', { className: 'entry-book-cover' })}
    </div>
  `;
}

function renderFixedSection({ icon, title, content }) {
  return `<section class="inspector-fixed-section"><header>${renderSectionIcon(icon)}<h3>${title}</h3></header>${content}</section>`;
}

function renderDisclosure({ icon, title, count, content }) {
  return `<details class="inspector-disclosure"><summary><span>${renderSectionIcon(icon)}<b>${title}</b></span><span><small>${count}</small>${renderIcon('disclosureChevron', { className: 'disclosure-chevron' })}</span></summary><div class="disclosure-body">${content}</div></details>`;
}

export function renderSectionIcon(kind) {
  const iconNames = {
    file: 'sectionFile',
    tag: 'sectionTag',
    link: 'sectionLink',
    list: 'sectionList',
    paperclip: 'sectionAttachment'
  };
  return renderIcon(iconNames[kind] ?? iconNames.file, { className: 'section-icon' });
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

function resolveCharacterCount(note) {
  return Number.isFinite(Number(note?.characterCount))
    ? Number(note.characterCount)
    : countCharacters(note?.rawMarkdown);
}

function shortId(value) {
  const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');
  return (normalized.slice(-3) || '001').toUpperCase();
}

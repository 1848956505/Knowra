import { decorateAttachmentsForDisplay } from './attachments.js';
import {
  renderAsideEmptyInline,
  renderAssignedTagPills,
  renderAttachments,
  renderAvailableTagPills,
  renderLinkedNotes
} from './renderers.js';
import { getNoteStats } from './stats.js';
import { escapeHtml, escapeAttribute } from '../../src/app/formatting.js';

export function renderInfoTab({
  note,
  markdown = '',
  folderPath = '',
  tags = [],
  tagComposer = { draft: '', isExpanded: false },
  linkedNotes = [],
  attachments = [],
  attachmentRenaming = null,
  formatDate = (value) => value ?? ''
}) {
  const stats = getNoteStats(markdown || note.rawMarkdown || '');
  const decoratedAttachments = decorateAttachmentsForDisplay(attachments, markdown || note.rawMarkdown || '');

  return `
    <section class="aside-panel-stack">
      <section class="aside-card note-info-card">
        <div class="aside-card-header">
          <span>笔记信息</span>
        </div>
        <div class="info-grid">
          <div class="info-row"><span>标题</span><strong>${escapeHtml(note.title)}</strong></div>
          <div class="info-row"><span>路径</span><strong>${escapeHtml(folderPath)}</strong></div>
          <div class="info-row"><span>字数</span><strong>${stats.characterCount}</strong></div>
          <div class="info-row"><span>更新时间</span><strong>${formatDate(note.updatedAt)}</strong></div>
          <div class="info-row"><span>创建时间</span><strong>${formatDate(note.createdAt)}</strong></div>
          <div class="info-row"><span>收藏状态</span><strong>${note.favorite ? '已收藏' : '未收藏'}</strong></div>
        </div>
      </section>
      <section class="aside-card">
        <div class="aside-card-header">
          <span>标签</span>
          <strong>${(note.tagIds ?? []).length}</strong>
        </div>
        ${renderNoteTagComposer({ note, tags, tagComposer })}
      </section>
      <section class="aside-card">
        <div class="aside-card-header">
          <span>关联笔记</span>
          <strong>${linkedNotes.length}</strong>
        </div>
        <div class="linked-list">
          ${linkedNotes.length ? renderLinkedNotes(linkedNotes) : renderAsideEmptyInline('暂无关联笔记')}
        </div>
      </section>
      <section class="aside-card">
        <div class="aside-card-header">
          <span>附件</span>
          <strong>${decoratedAttachments.length}</strong>
        </div>
        <div class="resource-list">
          ${decoratedAttachments.length ? renderAttachments(decoratedAttachments, attachmentRenaming) : renderAsideEmptyInline('暂无附件')}
        </div>
      </section>
    </section>
  `;
}

export function renderNoteTagComposer({ note, tags = [], tagComposer = { draft: '', isExpanded: false } }) {
  const noteTagIds = note.tagIds ?? [];
  const assignedTags = noteTagIds
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter(Boolean);
  const availableTags = tags.filter((tag) => !noteTagIds.includes(tag.id));
  const draft = tagComposer.draft.trim();
  const draftLowerCase = draft.toLowerCase();
  const matchingTags = draftLowerCase
    ? availableTags.filter((tag) => tag.name.toLowerCase().includes(draftLowerCase))
    : availableTags.slice(0, 8);
  const existingExactTag = tags.find((tag) => tag.name.trim().toLowerCase() === draftLowerCase);
  const canCreateTag = Boolean(draft) && !existingExactTag;

  return `
    <div class="note-tag-composer">
      <div class="note-tag-toolbar">
        <div class="pill-row">
          ${assignedTags.length ? renderAssignedTagPills(assignedTags) : '<span class="note-tag-empty">暂无标签</span>'}
        </div>
        <button type="button" class="subtle-button note-tag-toggle" data-note-tag-toggle>
          ${tagComposer.isExpanded ? '收起' : '添加标签'}
        </button>
      </div>
      ${tagComposer.isExpanded ? `
        <div class="note-tag-composer-body">
          <label class="note-tag-input-shell">
            <input
              type="text"
              value="${escapeAttribute(tagComposer.draft)}"
              data-note-tag-input
              placeholder="输入标签名，回车可创建并绑定"
              autocomplete="off"
              spellcheck="false"
            />
            ${canCreateTag ? '<button type="button" class="subtle-button note-tag-create" data-note-tag-create>创建</button>' : ''}
          </label>
          ${matchingTags.length ? `
            <div class="pill-row note-tag-suggestions">
              ${renderAvailableTagPills(matchingTags)}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

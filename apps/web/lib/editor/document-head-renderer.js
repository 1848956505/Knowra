import {
  escapeAttribute,
  escapeHtml,
  formatCompactDate
} from '../../src/app/formatting.js';
import { buildNotePath } from '../navigation/selection.js';
import { resolveNoteTags, renderTagList } from '../tags/inline-renderers.js';
import { getStatusLabel } from '../library-index/model.js';

export function renderEditorDocumentHead({ note, state }) {
  if (!note) {
    return '<div class="document-head-empty">选择一条资料开始编辑</div>';
  }

  const tags = resolveNoteTags(note, state.tags);
  const breadcrumb = buildNotePath({
    note: {
      ...note,
      title: state.draftTitle || note.title
    },
    foldersById: state.foldersById
  })
    .split(' / ')
    .map((segment) => escapeHtml(segment))
    .join('　/　');

  return `
    <section class="document-head">
      <div class="document-meta-row">
        <div class="document-location"><span class="breadcrumb">${breadcrumb}</span><span class="status status-active"><i></i>${getStatusLabel(note.status)}</span></div>
        <div class="document-dates"><span>创建　${escapeHtml(formatCompactDate(note.createdAt))}</span><span>编辑　${escapeHtml(formatCompactDate(note.updatedAt))}</span></div>
      </div>
      <div class="document-title-row">
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

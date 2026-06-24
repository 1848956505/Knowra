import { renderAsideEmptyInline } from './renderers.js';

export function renderOutlineTab({ headings = [] } = {}) {
  return `
    <section class="aside-panel-stack">
      <section class="aside-card">
        <div class="aside-card-header">
          <span>正文大纲</span>
          <strong>${headings.length}</strong>
        </div>
        <div class="outline-list">
          ${headings.length
            ? headings
                .map(
                  (heading) => `
                    <button type="button" class="outline-item" data-outline-id="${escapeAttribute(heading.id)}" data-outline-index="${heading.index}" data-level="${heading.level}">
                      <span>${escapeHtml(heading.title)}</span>
                    </button>
                  `
                )
                .join('')
            : renderAsideEmptyInline('当前笔记还没有标题')}
        </div>
      </section>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

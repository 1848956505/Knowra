import {
  escapeAttribute,
  escapeHtml,
  normalizeKnowledgePointQuery
} from './panel-utils.js';

function renderTagPills(tagIds = [], tagMap) {
  const tags = tagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean);
  if (!tags.length) {
    return '<span class="knowledge-point-muted">暂无标签</span>';
  }
  return tags
    .map((tag) => `<span class="pill">${escapeHtml(tag.name)}</span>`)
    .join('');
}

export function renderKnowledgePointFilterBar({ tagGroups, filters }) {
  const selectedTagIds = new Set(filters.tagIds ?? []);
  return `
    <section class="knowledge-point-filter" data-open="${String(Boolean(filters.isOpen))}">
      <label class="knowledge-point-search">
        <span>搜索</span>
        <input
          type="text"
          value="${escapeAttribute(filters.query ?? '')}"
          placeholder="标题、注释、原文"
          data-knowledge-point-filter-input
        />
      </label>
      <div class="knowledge-point-filter-groups">
        ${tagGroups
          .map((group) => `
            <section class="knowledge-point-filter-group">
              <div class="knowledge-point-filter-title">${escapeHtml(group.name)}</div>
              <div class="pill-row">
                ${(group.tags ?? []).length
                  ? group.tags.map((tag) => `
                    <button
                      type="button"
                      class="pill pill-button"
                      data-active="${String(selectedTagIds.has(tag.id))}"
                      data-knowledge-point-filter-tag="${escapeAttribute(tag.id)}"
                    >${escapeHtml(tag.name)}</button>
                  `).join('')
                  : '<span class="knowledge-point-muted">暂无可选标签</span>'}
              </div>
            </section>
          `)
          .join('')}
      </div>
    </section>
  `;
}

export function renderKnowledgePointAttachPanel({ note, availablePoints = [], attachComposer = {} }) {
  if (!attachComposer.isOpen) {
    return '';
  }

  const query = normalizeKnowledgePointQuery(attachComposer.query);
  const candidates = availablePoints
    .filter((point) => !(point.noteIds ?? []).includes(note.id))
    .filter((point) => {
      if (!query) {
        return true;
      }
      return [
        point.title,
        point.comment,
        ...(point.sources ?? []).map((source) => source.sourceText)
      ].join(' ').toLowerCase().includes(query);
    });

  return `
    <section class="knowledge-point-attach-panel">
      <label class="knowledge-point-search">
        <span>加入已有知识点</span>
        <input
          type="text"
          value="${escapeAttribute(attachComposer.query ?? '')}"
          placeholder="搜索已有知识点"
          data-knowledge-point-attach-query
        />
      </label>
      <div class="knowledge-point-attach-list">
        ${candidates.length
          ? candidates.map((point) => `
            <button
              type="button"
              class="knowledge-point-attach-item"
              data-knowledge-point-attach-existing="${escapeAttribute(point.id)}"
            >
              <strong>${escapeHtml(point.title)}</strong>
              <span>${escapeHtml(point.comment || (point.sources?.[0]?.sourceText ?? ''))}</span>
            </button>
          `).join('')
          : '<div class="aside-empty-inline">没有可加入的已有知识点</div>'}
      </div>
    </section>
  `;
}

function renderEditTags(point, tagGroups) {
  const selectedTagIds = new Set(point.tagIds ?? []);
  const knownTagIds = new Set(tagGroups.flatMap((group) => (group.tags ?? []).map((tag) => tag.id)));
  const hiddenUnknownTags = (point.tagIds ?? [])
    .filter((tagId) => !knownTagIds.has(tagId))
    .map((tagId) => `<input type="hidden" name="tagIds" value="${escapeAttribute(tagId)}" />`)
    .join('');

  return `
    <div class="knowledge-point-edit-tags">
      <span>标签</span>
      ${hiddenUnknownTags}
      ${tagGroups.map((group) => {
        const inputType = group.selectionMode === 'single' ? 'radio' : 'checkbox';
        const groupName = group.selectionMode === 'single' ? `tag-group-${group.id}` : 'tagIds';
        return `
          <fieldset class="knowledge-point-edit-tag-group">
            <legend>${escapeHtml(group.name)}</legend>
            <div class="pill-row">
              ${(group.tags ?? []).map((tag) => `
                <label class="pill knowledge-point-edit-tag">
                  <input
                    type="${inputType}"
                    name="${escapeAttribute(groupName)}"
                    value="${escapeAttribute(tag.id)}"
                    ${selectedTagIds.has(tag.id) ? 'checked' : ''}
                    data-knowledge-point-edit-tag-input
                  />
                  ${escapeHtml(tag.name)}
                </label>
              `).join('') || '<span class="knowledge-point-muted">暂无可选标签</span>'}
            </div>
          </fieldset>
        `;
      }).join('')}
    </div>
  `;
}

function renderEditForm(point, editing, tagGroups) {
  return `
    <form class="knowledge-point-edit-form" data-knowledge-point-edit-form="${escapeAttribute(point.id)}">
      <label>
        <span>标题</span>
        <input name="title" value="${escapeAttribute(editing.title ?? point.title)}" required />
      </label>
      <label>
        <span>注释</span>
        <textarea name="comment">${escapeHtml(editing.comment ?? point.comment ?? '')}</textarea>
      </label>
      ${renderEditTags(point, tagGroups)}
      <div class="knowledge-point-actions">
        <button type="submit" class="subtle-button">保存</button>
        <button type="button" class="subtle-button" data-knowledge-point-edit-cancel="${escapeAttribute(point.id)}">取消</button>
      </div>
    </form>
  `;
}

function renderSources(point, note) {
  return `
    <section class="knowledge-point-sources">
      <div class="knowledge-point-card-subtitle">原文片段</div>
      ${(point.sources ?? []).map((source, index) => `
        <div class="knowledge-point-source-row">
          <button
            type="button"
            class="knowledge-point-source"
            data-source-id="${escapeAttribute(source.id)}"
            data-knowledge-point-source-jump="${escapeAttribute(source.id)}"
            data-knowledge-point-id="${escapeAttribute(point.id)}"
          >
            <span>${index + 1}. ${escapeHtml(source.sourceText)}</span>
          </button>
          ${source.noteId === note.id ? `
            <button
              type="button"
              class="subtle-button"
              data-knowledge-point-source-remove="${escapeAttribute(source.id)}"
            >从当前笔记移除</button>
          ` : ''}
        </div>
      `).join('')}
    </section>
  `;
}

export function renderKnowledgePointCard({ note, point, tagMap, tagGroups, isExpanded, editing }) {
  const comment = String(point.comment ?? '').trim();
  return `
    <article class="knowledge-point-card" data-knowledge-point-id="${escapeAttribute(point.id)}" data-expanded="${String(isExpanded)}">
      <header class="knowledge-point-card-header">
        <button type="button" class="knowledge-point-title" data-knowledge-point-toggle="${escapeAttribute(point.id)}">
          ${escapeHtml(point.title)}
        </button>
        <div class="knowledge-point-card-actions">
          <button type="button" class="subtle-button" data-knowledge-point-edit="${escapeAttribute(point.id)}">编辑</button>
          <button type="button" class="subtle-button" data-knowledge-point-delete="${escapeAttribute(point.id)}">删除知识点</button>
        </div>
      </header>
      <div class="pill-row">${renderTagPills(point.tagIds, tagMap)}</div>
      <p class="knowledge-point-comment">${comment ? escapeHtml(comment) : '暂无注释'}</p>
      <div class="knowledge-point-card-meta">原文 ${(point.sources ?? []).length} 段</div>
      ${editing?.id === point.id ? renderEditForm(point, editing, tagGroups) : ''}
      ${isExpanded ? renderSources(point, note) : ''}
    </article>
  `;
}

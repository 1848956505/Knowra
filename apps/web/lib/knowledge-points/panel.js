import { filterKnowledgePoints } from './filtering.js';
import {
  renderKnowledgePointAttachPanel,
  renderKnowledgePointCard,
  renderKnowledgePointFilterBar
} from './panel-renderers.js';
import { buildKnowledgePointTagMap } from './panel-utils.js';

export { filterKnowledgePoints } from './filtering.js';

export function renderKnowledgePointPanel({
  note,
  points = [],
  tagGroups = [],
  availablePoints = [],
  filters = {},
  attachComposer = {},
  expandedIds = {},
  editing = null
} = {}) {
  if (!note) {
    return `
      <section class="aside-panel-empty">
        <strong>未打开笔记</strong>
        <span>请先在左侧选择一个文件。</span>
      </section>
    `;
  }

  const tagMap = buildKnowledgePointTagMap(tagGroups);
  const filteredPoints = filterKnowledgePoints(points, filters);

  return `
    <section class="aside-panel-stack knowledge-point-panel">
      <section class="aside-card">
        <div class="aside-card-header">
          <span>知识点</span>
          <strong>${filteredPoints.length}/${points.length}</strong>
        </div>
        <div class="knowledge-point-toolbar">
          <button type="button" class="subtle-button" data-knowledge-point-filter-toggle>
            ${filters.isOpen ? '收起筛选' : '筛选'}
          </button>
          <button type="button" class="subtle-button" data-knowledge-point-filter-clear>清除</button>
          <button type="button" class="subtle-button" data-knowledge-point-attach-toggle>加入已有</button>
        </div>
        ${filters.isOpen ? renderKnowledgePointFilterBar({ tagGroups, filters }) : ''}
        ${renderKnowledgePointAttachPanel({ note, availablePoints, attachComposer })}
        <div class="knowledge-point-list">
          ${filteredPoints.length
            ? filteredPoints
              .map((point) => renderKnowledgePointCard({
                note,
                point,
                tagMap,
                tagGroups,
                isExpanded: Boolean(expandedIds[point.id]),
                editing
              }))
              .join('')
            : '<div class="aside-empty-inline">没有匹配的知识点</div>'}
        </div>
      </section>
    </section>
  `;
}

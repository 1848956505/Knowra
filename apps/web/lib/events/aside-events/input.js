import { closestFromEventTarget } from '../../dom/event-target.js';

// aside-events/input.js
// 侧栏内 input 监听器（asideContent.input），1 个监听器同步 4 类输入：
//   - data-knowledge-point-filter-input  知识点过滤关键词
//   - data-knowledge-point-edit-form     知识点编辑表单（title/comment）
//   - data-knowledge-point-attach-query  挂载 composer 搜索
//   - data-note-tag-input                标签 composer 草稿
// 前两个走 renderSidebar 立即刷新，编辑表单用 FormData 局部覆盖
// state.knowledgePointEditing。

export function bindAsideContentInputEvents({ state, elements, deps }) {
  const { getCurrentNote, renderSidebar, updateAttachmentRenameDraft } = deps;

  elements.asideContent?.addEventListener('input', (event) => {
    const knowledgePointFilterInput = closestFromEventTarget(event.target, '[data-knowledge-point-filter-input]');
    if (knowledgePointFilterInput) {
      state.knowledgePointFilters = {
        ...state.knowledgePointFilters,
        query: knowledgePointFilterInput.value,
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEditForm = closestFromEventTarget(event.target, '[data-knowledge-point-edit-form]');
    if (knowledgePointEditForm && state.knowledgePointEditing) {
      const formData = new FormData(knowledgePointEditForm);
      state.knowledgePointEditing = {
        ...state.knowledgePointEditing,
        title: String(formData.get('title') ?? ''),
        comment: String(formData.get('comment') ?? '')
      };
      return;
    }

    const knowledgePointAttachQuery = closestFromEventTarget(event.target, '[data-knowledge-point-attach-query]');
    if (knowledgePointAttachQuery) {
      state.knowledgePointAttachComposer = {
        ...state.knowledgePointAttachComposer,
        query: knowledgePointAttachQuery.value,
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const input = closestFromEventTarget(event.target, '[data-note-tag-input]');
    if (input) {
      state.noteTagComposer.draft = input.value;
      return;
    }

    const attachmentRenameInput = closestFromEventTarget(event.target, '[data-attachment-rename-input]');
    if (attachmentRenameInput) {
      updateAttachmentRenameDraft?.(attachmentRenameInput.value);
    }
  });
}

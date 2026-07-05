import { closestFromEventTarget } from '../../dom/event-target.js';

// aside-events/click.js
// 侧栏内容（elements.asideContent）click 监听器。1 个监听器覆盖 15 个
// [data-*] 按钮分支，按原 bindEvents() 顺序逐个 closest + 早退：
//   1.  data-linked-id                       跳转链接笔记
//   2.  data-attachment-name                 选中附件（仅 flashStatus）
//   3.  data-note-tag-add                    展开 composer 并添加标签
//   4.  data-note-tag-remove                 移除标签
//   5.  data-note-tag-toggle                 切换 composer 折叠态
//   6.  data-note-tag-create                 按 composer draft 创建标签
//   7.  data-knowledge-point-filter-toggle   切换过滤面板
//   8.  data-knowledge-point-filter-clear    重置过滤状态
//   9.  data-knowledge-point-filter-tag      切换 tagIds 中某 tag
//   10. data-knowledge-point-toggle          展开/折叠知识点
//   11. data-knowledge-point-edit            进入编辑态
//   12. data-knowledge-point-edit-cancel     取消编辑
//   13. data-knowledge-point-attach-toggle   切换挂载 composer
//   14. data-knowledge-point-attach-existing 挂载到已有知识点
//   15. data-knowledge-point-source-remove   解除挂载源
//   16. data-knowledge-point-delete          删除知识点
//   17. data-knowledge-point-source-jump     跳转到源笔记
//   18. data-outline-id                      大纲跳转
// （实际为 18 个分支，最后一个无 dataset.outlineId 早退）
//
// 派发一律走 deps 中的命令函数；state 字段就地变更。

export function bindAsideContentClickEvents({ state, elements, deps }) {
  const {
    getCurrentNote,
    selectNote,
    flashStatus,
    addTagToCurrentNote,
    removeTagFromCurrentNote,
    createTagAndAssignToCurrentNote,
    attachSelectionToExistingKnowledgePoint,
    removeKnowledgePointSourceFromCurrentNote,
    deleteKnowledgePointFromLibrary,
    selectKnowledgePointSource,
    findOutlineHeadingTarget,
    renderSidebar
  } = deps;

  elements.asideContent?.addEventListener('click', (event) => {
    const linkedButton = closestFromEventTarget(event.target, '[data-linked-id]');
    if (linkedButton?.dataset.linkedId) {
      void selectNote(linkedButton.dataset.linkedId, { syncFolder: true });
      return;
    }

    const attachmentButton = closestFromEventTarget(event.target, '[data-attachment-name]');
    if (attachmentButton?.dataset.attachmentName) {
      flashStatus(`已选中附件：${attachmentButton.dataset.attachmentName}`);
      return;
    }

    const noteTagAddButton = closestFromEventTarget(event.target, '[data-note-tag-add]');
    if (noteTagAddButton?.dataset.noteTagAdd) {
      state.noteTagComposer.isExpanded = true;
      void addTagToCurrentNote(noteTagAddButton.dataset.noteTagAdd);
      return;
    }

    const noteTagRemoveButton = closestFromEventTarget(event.target, '[data-note-tag-remove]');
    if (noteTagRemoveButton?.dataset.noteTagRemove) {
      void removeTagFromCurrentNote(noteTagRemoveButton.dataset.noteTagRemove);
      return;
    }

    const noteTagToggleButton = closestFromEventTarget(event.target, '[data-note-tag-toggle]');
    if (noteTagToggleButton) {
      state.noteTagComposer.isExpanded = !state.noteTagComposer.isExpanded;
      renderSidebar(getCurrentNote());
      return;
    }

    const noteTagCreateButton = closestFromEventTarget(event.target, '[data-note-tag-create]');
    if (noteTagCreateButton) {
      void createTagAndAssignToCurrentNote(state.noteTagComposer.draft);
      return;
    }

    const knowledgePointFilterToggle = closestFromEventTarget(event.target, '[data-knowledge-point-filter-toggle]');
    if (knowledgePointFilterToggle) {
      state.knowledgePointFilters.isOpen = !state.knowledgePointFilters.isOpen;
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointFilterClear = closestFromEventTarget(event.target, '[data-knowledge-point-filter-clear]');
    if (knowledgePointFilterClear) {
      state.knowledgePointFilters = { query: '', tagIds: [], isOpen: false };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointFilterTag = closestFromEventTarget(event.target, '[data-knowledge-point-filter-tag]');
    if (knowledgePointFilterTag?.dataset.knowledgePointFilterTag) {
      const tagId = knowledgePointFilterTag.dataset.knowledgePointFilterTag;
      const selectedTagIds = new Set(state.knowledgePointFilters.tagIds ?? []);
      if (selectedTagIds.has(tagId)) {
        selectedTagIds.delete(tagId);
      } else {
        selectedTagIds.add(tagId);
      }
      state.knowledgePointFilters = {
        ...state.knowledgePointFilters,
        tagIds: [...selectedTagIds],
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointToggle = closestFromEventTarget(event.target, '[data-knowledge-point-toggle]');
    if (knowledgePointToggle?.dataset.knowledgePointToggle) {
      const pointId = knowledgePointToggle.dataset.knowledgePointToggle;
      state.expandedKnowledgePointIds = {
        ...state.expandedKnowledgePointIds,
        [pointId]: !state.expandedKnowledgePointIds[pointId]
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEdit = closestFromEventTarget(event.target, '[data-knowledge-point-edit]');
    if (knowledgePointEdit?.dataset.knowledgePointEdit) {
      const point = state.knowledgePoints.find((item) => item.id === knowledgePointEdit.dataset.knowledgePointEdit);
      if (!point) {
        return;
      }
      state.knowledgePointEditing = {
        id: point.id,
        title: point.title,
        comment: point.comment ?? ''
      };
      state.expandedKnowledgePointIds = {
        ...state.expandedKnowledgePointIds,
        [point.id]: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEditCancel = closestFromEventTarget(event.target, '[data-knowledge-point-edit-cancel]');
    if (knowledgePointEditCancel) {
      state.knowledgePointEditing = null;
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointAttachToggle = closestFromEventTarget(event.target, '[data-knowledge-point-attach-toggle]');
    if (knowledgePointAttachToggle) {
      state.knowledgePointAttachComposer = {
        ...state.knowledgePointAttachComposer,
        isOpen: !state.knowledgePointAttachComposer.isOpen
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointAttachExisting = closestFromEventTarget(event.target, '[data-knowledge-point-attach-existing]');
    if (knowledgePointAttachExisting?.dataset.knowledgePointAttachExisting) {
      void attachSelectionToExistingKnowledgePoint(knowledgePointAttachExisting.dataset.knowledgePointAttachExisting);
      return;
    }

    const knowledgePointSourceRemove = closestFromEventTarget(event.target, '[data-knowledge-point-source-remove]');
    if (knowledgePointSourceRemove?.dataset.knowledgePointSourceRemove) {
      void removeKnowledgePointSourceFromCurrentNote(knowledgePointSourceRemove.dataset.knowledgePointSourceRemove);
      return;
    }

    const knowledgePointDelete = closestFromEventTarget(event.target, '[data-knowledge-point-delete]');
    if (knowledgePointDelete?.dataset.knowledgePointDelete) {
      void deleteKnowledgePointFromLibrary(knowledgePointDelete.dataset.knowledgePointDelete);
      return;
    }

    const knowledgePointSourceJump = closestFromEventTarget(event.target, '[data-knowledge-point-source-jump]');
    if (knowledgePointSourceJump?.dataset.knowledgePointSourceJump) {
      void selectKnowledgePointSource(knowledgePointSourceJump.dataset.knowledgePointSourceJump);
      return;
    }

    const outlineButton = closestFromEventTarget(event.target, '[data-outline-id]');
    if (!outlineButton?.dataset.outlineId) {
      return;
    }

    const outlineIndex = Number.parseInt(outlineButton.dataset.outlineIndex ?? '', 10);
    const targetHeading = findOutlineHeadingTarget(
      outlineButton.dataset.outlineId,
      Number.isNaN(outlineIndex) ? -1 : outlineIndex
    );
    if (!targetHeading) {
      flashStatus('当前标题尚未出现在预览区');
      return;
    }

    targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

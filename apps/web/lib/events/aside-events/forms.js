import { isComposingEvent } from '../../dom/composition.js';
import { closestFromEventTarget } from '../../dom/event-target.js';

// aside-events/forms.js
// 侧栏内表单监听器，2 个监听器：
//   - asideContent.submit 派发 [data-knowledge-point-edit-form] 的提交
//   - asideContent.keydown 在 [data-note-tag-input] 上回车提交标签
// 两者均调用 deps 中的命令函数，event.preventDefault() 保留以避免页面
// 跳转或默认回车行为。

export function bindAsideContentFormEvents({ state, elements, deps }) {
  const { updateCurrentKnowledgePoint, createTagAndAssignToCurrentNote } = deps;

  elements.asideContent?.addEventListener('submit', (event) => {
    const knowledgePointEditForm = closestFromEventTarget(event.target, '[data-knowledge-point-edit-form]');
    if (!knowledgePointEditForm?.dataset.knowledgePointEditForm) {
      return;
    }

    event.preventDefault();
    void updateCurrentKnowledgePoint(knowledgePointEditForm.dataset.knowledgePointEditForm, knowledgePointEditForm);
  });

  elements.asideContent?.addEventListener('keydown', (event) => {
    const input = closestFromEventTarget(event.target, '[data-note-tag-input]');
    if (!input || event.key !== 'Enter' || isComposingEvent(event)) {
      return;
    }

    event.preventDefault();
    void createTagAndAssignToCurrentNote(input.value);
  });
}

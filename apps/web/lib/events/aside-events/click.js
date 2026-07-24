import { closestFromEventTarget } from '../../dom/event-target.js';

export function bindAsideContentClickEvents({ state, elements, deps }) {
  elements.asideContent?.addEventListener('click', (event) => {
    if (closestFromEventTarget(event.target, '[data-note-tag-toggle]')) {
      state.noteTagComposer.isExpanded = !state.noteTagComposer.isExpanded;
      if (!state.noteTagComposer.isExpanded) state.noteTagComposer.draft = '';
      deps.renderSidebar(deps.getCurrentNote());
      return;
    }
    const outlineToggle = closestFromEventTarget(event.target, '[data-outline-toggle-id]');
    if (outlineToggle?.dataset.outlineToggleId) {
      deps.toggleOutlineHeading?.(
        outlineToggle.dataset.outlineNoteId ?? '',
        outlineToggle.dataset.outlineToggleId
      );
      return;
    }
    const outlineItem = closestFromEventTarget(event.target, '[data-outline-id]');
    if (outlineItem?.dataset.outlineId) {
      const outlineIndex = Number.parseInt(outlineItem.dataset.outlineIndex ?? '', 10);
      deps.jumpToOutlineHeading?.(
        outlineItem.dataset.outlineId,
        Number.isInteger(outlineIndex) ? outlineIndex : -1
      );
      return;
    }
    const addTag = closestFromEventTarget(event.target, '[data-note-tag-add]');
    if (addTag?.dataset.noteTagAdd) {
      return void deps.addTagToCurrentNote(addTag.dataset.noteTagAdd)
        .then(() => deps.renderSidebar(deps.getCurrentNote()));
    }
    const removeTag = closestFromEventTarget(event.target, '[data-note-tag-remove]');
    if (removeTag?.dataset.noteTagRemove) {
      return void deps.removeTagFromCurrentNote(removeTag.dataset.noteTagRemove)
        .then(() => deps.renderSidebar(deps.getCurrentNote()));
    }
    if (closestFromEventTarget(event.target, '[data-note-tag-create]')) {
      return void deps.createTagAndAssignToCurrentNote(state.noteTagComposer.draft);
    }
    const annotationJump = closestFromEventTarget(event.target, '[data-annotation-jump]');
    if (annotationJump?.dataset.annotationJump) return void deps.selectAnnotation(annotationJump.dataset.annotationJump);
    const annotationDelete = closestFromEventTarget(event.target, '[data-annotation-delete]');
    if (annotationDelete?.dataset.annotationDelete) return void deps.deleteAnnotation(annotationDelete.dataset.annotationDelete);
    const linked = closestFromEventTarget(event.target, '[data-linked-id]');
    if (linked?.dataset.linkedId) return void deps.selectNote(linked.dataset.linkedId, { syncFolder: true });
    const attachment = closestFromEventTarget(event.target, '[data-attachment-open]');
    if (attachment?.dataset.attachmentOpen) void deps.openAttachment?.(attachment.dataset.attachmentOpen);
  });
}

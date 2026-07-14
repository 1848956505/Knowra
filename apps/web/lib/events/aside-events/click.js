import { closestFromEventTarget } from '../../dom/event-target.js';

export function bindAsideContentClickEvents({ elements, deps }) {
  elements.asideContent?.addEventListener('click', (event) => {
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

import { closestFromEventTarget } from '../../dom/event-target.js';
import { isComposingEvent } from '../../dom/composition.js';

export function bindAsideContentInputEvents({ elements, deps }) {
  elements.asideContent?.addEventListener('input', (event) => {
    const tagDraft = closestFromEventTarget(event.target, '[data-note-tag-input]');
    if (!tagDraft || isComposingEvent(event)) {
      return;
    }

    deps.updateNoteTagDraft?.(tagDraft.value);
  });
}

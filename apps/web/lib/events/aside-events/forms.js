import { closestFromEventTarget } from '../../dom/event-target.js';
import { isComposingEvent } from '../../dom/composition.js';

export function bindAsideContentFormEvents({ state, elements, deps }) {
  elements.asideContent?.addEventListener('keydown', (event) => {
    const tagInput = closestFromEventTarget(event.target, '[data-note-tag-input]');
    if (!tagInput || event.key !== 'Enter' || isComposingEvent(event)) return;
    event.preventDefault();
    void deps.createTagAndAssignToCurrentNote(state.noteTagComposer.draft);
  });
}

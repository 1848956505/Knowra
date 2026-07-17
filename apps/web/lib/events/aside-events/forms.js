import { closestFromEventTarget } from '../../dom/event-target.js';

export function bindAsideContentFormEvents({ state, elements, deps }) {
  elements.asideContent?.addEventListener('keydown', (event) => {
    const tagInput = closestFromEventTarget(event.target, '[data-note-tag-input]');
    if (!tagInput || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    void deps.createTagAndAssignToCurrentNote(state.noteTagComposer.draft);
  });
}

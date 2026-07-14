import { closestFromEventTarget } from '../../dom/event-target.js';
export function bindAsideContentInputEvents({ elements, deps }) {
  elements.asideContent?.addEventListener('input', (event) => {
    const tagDraft = closestFromEventTarget(event.target, '[data-note-tag-draft]');
    if (tagDraft) deps.updateNoteTagDraft?.(tagDraft.value);
  });
}

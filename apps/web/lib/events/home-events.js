import { closestFromEventTarget } from '../dom/event-target.js';

export function bindHomeEvents({ elements, deps }) {
  elements.homeWorkspaceView?.addEventListener('click', (event) => {
    const action = closestFromEventTarget(event.target, '[data-home-action]');
    if (action?.dataset.homeAction === 'open-library') {
      event.preventDefault();
      void deps.returnToLibraryIndex({ global: true });
      return;
    }

    const note = closestFromEventTarget(event.target, '[data-home-note-open]');
    if (note?.dataset.homeNoteOpen) {
      event.preventDefault();
      void deps.selectNote(note.dataset.homeNoteOpen, { syncFolder: true, ensureTab: true });
    }
  });
}

export function resolveClickTarget(target) {
  const navSection = target?.closest?.('[data-nav-section]');
  if (navSection?.dataset.navSection) {
    return { type: 'toggle-section', sectionKey: navSection.dataset.navSection };
  }

  const folderToggle = target?.closest?.('[data-folder-toggle]');
  if (folderToggle?.dataset.folderToggle) {
    return { type: 'toggle-folder', folderId: folderToggle.dataset.folderToggle };
  }

  const folderButton = target?.closest?.('[data-folder-id]');
  if (folderButton?.dataset.folderId) {
    return { type: 'select-folder', folderId: folderButton.dataset.folderId };
  }

  const noteButton = target?.closest?.('[data-note-id]');
  if (noteButton?.dataset.noteId) {
    return { type: 'select-note', noteId: noteButton.dataset.noteId };
  }

  return null;
}

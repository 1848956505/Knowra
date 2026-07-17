const DIRTY_SAVE_STATES = new Set(['pending', 'saving', 'error']);

export function renderEmptyNoteTabs() {
  return `
      <div class="note-tabs-empty">
        <span class="note-tabs-empty-label">暂无打开的资料</span>
      </div>
    `;
}

export function renderNoteTabs({
  notes,
  selectedNoteId,
  saveState,
  tabDragState,
  foldersById,
  buildNoteTabPath
}) {
  const dragState = tabDragState ?? {};

  return notes
    .map((note) => {
      const isActive = note.id === selectedNoteId;
      const isDirty = isActive && DIRTY_SAVE_STATES.has(saveState);
      const isDragging = dragState.activeId === note.id;
      const isDropTarget = dragState.overId === note.id;

      return `
        <button
          type="button"
          class="note-tab"
          data-tab-note-id="${escapeAttribute(note.id)}"
          data-active="${isActive}"
          data-dirty="${isDirty}"
          data-dragging="${isDragging}"
          data-drop-target="${isDropTarget}"
          title="${escapeAttribute(buildNoteTabPath(note, foldersById))}"
          draggable="true"
        >
          <span class="note-tab-label">${escapeHtml(note.title)}</span>
          <span class="note-tab-dirty">${isDirty ? '●' : ''}</span>
          <span class="note-tab-close" data-tab-close="${escapeAttribute(note.id)}" aria-label="关闭标签页" title="关闭标签页">×</span>
        </button>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

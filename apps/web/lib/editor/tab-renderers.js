import { escapeHtml, escapeAttribute } from '../../src/app/formatting.js';
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

export function renderTabOverflowToggle({ count, open }) {
  if (!count) {
    return '';
  }

  return `
    <button
      type="button"
      class="note-tab-overflow-toggle"
      data-tab-overflow-toggle
      data-open="${String(open)}"
      aria-expanded="${String(open)}"
      aria-controls="note-tab-overflow-menu"
      aria-label="显示其余 ${count} 个标签页"
      title="其余 ${count} 个标签页"
    ><span aria-hidden="true">•••</span><small>${count}</small></button>
  `;
}

export function renderTabOverflowMenu({ notes, selectedNoteId, foldersById, buildNoteTabPath }) {
  return notes.map((note) => `
    <button
      type="button"
      class="note-tab-overflow-item"
      data-tab-overflow-note-id="${escapeAttribute(note.id)}"
      data-active="${String(note.id === selectedNoteId)}"
      title="${escapeAttribute(buildNoteTabPath(note, foldersById))}"
    >
      <span>${escapeHtml(note.title)}</span>
      <small>${note.id === selectedNoteId ? '当前' : '打开'}</small>
    </button>
  `).join('');
}

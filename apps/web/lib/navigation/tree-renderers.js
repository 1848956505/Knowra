import { escapeHtml, escapeAttribute } from '../../src/app/formatting.js';

export function renderFolderIcon(open) {
  return open
    ? `
        <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon">
          <path d="M1.5 5.5h5l1.2 1.3H14v5.7a1 1 0 0 1-1 1H3a1.5 1.5 0 0 1-1.5-1.5z"></path>
          <path d="M1.5 5V4a1 1 0 0 1 1-1h3l1.1 1.2H13A1 1 0 0 1 14 5v1.3"></path>
        </svg>
      `
    : `
        <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon">
          <path d="M2 4h3.4l1.1 1.2H13A1 1 0 0 1 14 6v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"></path>
          <path d="M2 6h12"></path>
        </svg>
      `;
}

export function renderNoteIcon(iconKind = 'markdown') {
  if (iconKind === 'pdf') {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-pdf">
        <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
        <path d="M9 2.5v3h3"></path>
        <path d="M4.8 10.5h6.4"></path>
        <path d="M5.2 12.2h5.6"></path>
      </svg>
    `;
  }

  if (iconKind === 'resource') {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-resource">
        <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
        <path d="M9 2.5v3h3"></path>
        <path d="M5.1 9.9 7 8.5l1.4 1.2 2-2"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-markdown">
      <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
      <path d="M9 2.5v3h3"></path>
      <path d="M5.1 11.8V9.1l1.2 1.5 1.2-1.5v2.7"></path>
      <path d="M8.9 11.8V9.1l2.1 2.7V9.1"></path>
    </svg>
  `;
}

export function renderNavigationSection({ key, label, count, children, open, isDropTarget = false }) {
  const isMaterials = key === 'materials';
  const isRecycle = key === 'recycle';

  return `
    <div class="library-node-group library-section-group">
      <button
        type="button"
        class="library-node library-section-node"
        data-nav-section="${escapeAttribute(key)}"
        data-open="${open}"
        data-level="0"
        data-drop-target="${isDropTarget}"
        ${isMaterials ? 'data-materials-section="true"' : ''}
        ${isRecycle ? 'data-recycle-section="true"' : ''}
      >
        <span class="library-node-leading">
          <svg viewBox="0 0 16 16" aria-hidden="true" class="library-chevron" data-open="${open}">
            <path d="M5 3.5 10 8l-5 4.5"></path>
          </svg>
        </span>
        <span class="library-node-label library-section-label">${escapeHtml(label)}</span>
        <span class="library-section-meta">${escapeHtml(count)}</span>
      </button>
      ${open ? `<div class="library-node-children">${children}</div>` : ''}
    </div>
  `;
}

export function renderNoteNode({
  note,
  level,
  selected = false,
  isDragging = false,
  iconKind = 'markdown'
}) {
  return `
    <button
      type="button"
      class="library-node library-note-node"
      data-note-id="${escapeAttribute(note.id)}"
      data-level="${level}"
      data-selected="${selected}"
      data-drag-kind="note"
      data-drag-id="${escapeAttribute(note.id)}"
      data-dragging="${isDragging}"
      title="${escapeAttribute(note.title)}"
      draggable="true"
    >
      <span class="library-node-leading">
        <span class="library-node-spacer"></span>
        ${renderNoteIcon(iconKind)}
      </span>
      <span class="library-node-label">${escapeHtml(note.title)}</span>
    </button>
  `;
}

export function renderRecycleNoteNode({ note, level, iconKind = 'markdown' }) {
  return `
    <div class="library-node-group">
      <button
        type="button"
        class="library-node library-note-node library-note-node-recycle"
        data-recycle-note-id="${escapeAttribute(note.id)}"
        data-level="${level}"
        title="${escapeAttribute(note.title)}"
      >
        <span class="library-node-leading">
          <span class="library-node-spacer"></span>
          ${renderNoteIcon(iconKind)}
        </span>
        <span class="library-node-label">${escapeHtml(note.title)}</span>
      </button>
    </div>
  `;
}

export function renderInlineEditorRow({ level, mode, value }) {
  const placeholder = mode.includes('folder') ? '输入目录名称' : '输入文件名称';

  return `
    <div class="library-inline-editor" style="--tree-level:${level}">
      <form class="library-inline-form" data-inline-editor-form>
        <span class="library-inline-icon" aria-hidden="true">
          ${mode.includes('folder') ? renderFolderIcon(true) : renderNoteIcon('markdown')}
        </span>
        <input
          type="text"
          class="library-inline-input"
          data-inline-editor-input
          value="${escapeAttribute(value)}"
          placeholder="${placeholder}"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="library-inline-actions">
          <button type="submit" class="library-inline-action library-inline-action-primary">保存</button>
          <button type="button" class="library-inline-action" data-editor-cancel>取消</button>
        </div>
      </form>
    </div>
  `;
}

export function renderDeleteIntentRow({ level, kind, targetId, name }) {
  return `
    <div class="library-inline-confirm" style="--tree-level:${level}">
      <div class="library-inline-confirm-body">
        <span class="library-inline-confirm-text">删除“${escapeHtml(name)}”后将立即生效</span>
        <div class="library-inline-actions">
          <button type="button" class="library-inline-action library-inline-action-danger" data-delete-confirm="${escapeAttribute(kind)}" data-target-id="${escapeAttribute(targetId)}">删除</button>
          <button type="button" class="library-inline-action" data-delete-cancel>取消</button>
        </div>
      </div>
    </div>
  `;
}

export function renderEmptyTreeItem(label) {
  return `
    <div class="library-node library-static-node library-empty-node" data-level="1">
      <span class="library-node-leading">
        <span class="library-node-spacer"></span>
      </span>
      <span class="library-node-label">${escapeHtml(label)}</span>
    </div>
  `;
}

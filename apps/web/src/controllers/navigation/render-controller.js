import {
  renderDeleteIntentRow as renderDeleteIntentRowMarkup,
  renderEmptyTreeItem,
  renderFolderIcon,
  renderInlineEditorRow as renderInlineEditorRowMarkup,
  renderNavigationSection,
  renderNoteNode as renderNoteNodeMarkup,
  renderRecycleNoteNode as renderRecycleNoteNodeMarkup
} from '../../../lib/navigation/tree-renderers.js';
import { getDirectNotesForFolder as selectDirectNotesForFolder } from '../../../lib/navigation/visibility.js';
import { getContextMenuItems as getNavigationContextMenuItems } from '../../../lib/navigation/context-menu.js';
import { renderContextMenuItems } from '../../../lib/navigation/context-menu-renderers.js';
import {
  SECONDARY_SECTION_ITEMS,
  renderSectionMenuItems
} from '../../../lib/navigation/section-menu-renderers.js';
import { resolveNoteVisualType } from '../../../lib/tree-workspace.js';

export function createNavigationRenderController(deps, getController) {
  const {
    state,
    elements,
    getActiveNotes,
    getRecycleNotes,
    noteMatchesSelectedTags,
    matchesSearch,
    matchesFolderSearch,
    escapeHtml
  } = deps;

function renderFolders() {
  if (!elements.folderTree) {
    return;
  }

  const activeNotes = getActiveNotes();
  const filteredActiveNotes = activeNotes.filter((note) => noteMatchesSelectedTags(note));
  const recycleNotes = getRecycleNotes();
  const topFolders = state.folderTree.filter((folder) => matchesFolderSearch(folder));
  const favoriteNotes = filteredActiveNotes.filter((note) => note.favorite && matchesSearch(note.title));
  const recentNotes = [...filteredActiveNotes]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .filter((note) => matchesSearch(note.title))
    .slice(0, 5);

  const sections = [
    renderNavSection({
      key: 'materials',
      label: '资料',
      count: topFolders.length,
      children: renderMaterialsTree(topFolders)
    })
  ];

  if (state.secondarySections.favorites) {
    sections.push(
      renderNavSection({
        key: 'favorites',
        label: '收藏',
        count: favoriteNotes.length,
        children: favoriteNotes.length
          ? favoriteNotes.map((note) => renderNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无收藏')
      })
    );
  }

  if (state.secondarySections.recent) {
    sections.push(
      renderNavSection({
        key: 'recent',
        label: '最近',
        count: recentNotes.length,
        children: recentNotes.length
          ? recentNotes.map((note) => renderNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无最近笔记')
      })
    );
  }

  if (state.secondarySections.recycle) {
    sections.push(
      renderNavSection({
        key: 'recycle',
        label: '回收站',
        count: recycleNotes.length,
        children: recycleNotes.length
          ? recycleNotes.map((note) => renderRecycleNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无回收站文件')
      })
    );
  }

  elements.folderTree.innerHTML = sections.join('');
  renderHeaderToggle();
  renderContextMenu();
  renderSectionMenu();
  getController().focusInlineEditor();
}

function renderNavSection({ key, label, count, children }) {
  const open = state.navSections[key] ?? false;
  return renderNavigationSection({
    key,
    label,
    count,
    children,
    open,
    isDropTarget: key === 'materials' && getController().isRootDropActive()
  });
}

function renderMaterialsTree(topFolders) {
  const parts = [];
  const rootNotes = getDirectNotesForFolder(null).filter((note) => matchesSearch(note.title) && noteMatchesSelectedTags(note));

  if (isCreateEditorForParent(null)) {
    parts.push(renderInlineEditorRow(1, state.treeEditor.mode, state.treeEditor.value));
  }

  if (topFolders.length === 0 && rootNotes.length === 0) {
    parts.push(renderEmptyItem(state.dataMode === 'loading' ? '正在加载资料...' : '暂无目录'));
  } else {
    parts.push(...topFolders.map((folder) => renderFolderNode(folder, 1)));
    parts.push(...rootNotes.map((note) => renderNoteNode(note, 1)));
  }

  return parts.join('');
}

function renderFolderNode(folder, level) {
  const childFolders = (folder.children ?? []).filter((childFolder) => matchesFolderSearch(childFolder));
  const childNotes = getDirectNotesForFolder(folder.id).filter((note) => matchesSearch(note.title) && noteMatchesSelectedTags(note));
  const hasChildren = childFolders.length > 0 || childNotes.length > 0 || isCreateEditorForParent(folder.id);
  const isOpen = state.openFolders[folder.id] ?? true;
  const selected = folder.id === state.selectedFolderId;
  const isRenaming = state.treeEditor?.mode === 'rename-folder' && state.treeEditor.targetId === folder.id;
  const isDeleting = state.deleteIntent?.kind === 'folder' && state.deleteIntent.targetId === folder.id;
  const isDragging = state.dragState.activeKind === 'folder' && state.dragState.activeId === folder.id;
  const isDropTarget = state.dragState.overKind === 'folder' && state.dragState.overId === folder.id;

  const rowMarkup = isRenaming
    ? renderInlineEditorRow(level, 'rename-folder', state.treeEditor.value)
    : `
      <button
        type="button"
        class="library-node library-folder-node"
        data-folder-id="${folder.id}"
        data-level="${level}"
        data-selected="${selected}"
        data-drag-kind="folder"
        data-drag-id="${folder.id}"
        data-dragging="${isDragging}"
        data-drop-target="${isDropTarget}"
        title="${escapeHtml(folder.name)}"
        draggable="true"
      >
        <span class="library-node-leading">
          <span class="library-chevron-hitbox" data-folder-toggle="${folder.id}">
            ${hasChildren
              ? `
                <svg viewBox="0 0 16 16" aria-hidden="true" class="library-chevron" data-open="${isOpen}">
                  <path d="M5 3.5 10 8l-5 4.5"></path>
                </svg>
              `
              : '<span class="library-node-spacer"></span>'}
          </span>
          ${renderFolderIcon(isOpen)}
        </span>
        <span class="library-node-label">${escapeHtml(folder.name)}</span>
      </button>
    `;

  const childrenMarkup = [];

  if (isOpen) {
    if (isCreateEditorForParent(folder.id)) {
      childrenMarkup.push(renderInlineEditorRow(level + 1, state.treeEditor.mode, state.treeEditor.value));
    }

    childrenMarkup.push(...childFolders.map((childFolder) => renderFolderNode(childFolder, level + 1)));
    childrenMarkup.push(...childNotes.map((note) => renderNoteNode(note, level + 1)));
  }

  if (isDeleting) {
    childrenMarkup.unshift(renderDeleteIntentRow(level + 1, 'folder', folder.id, folder.name));
  }

  return `
    <div class="library-node-group">
      ${rowMarkup}
      ${isOpen || isDeleting ? `<div class="library-node-children">${childrenMarkup.join('')}</div>` : ''}
    </div>
  `;
}

function renderNoteNode(note, level) {
  const selected = note.id === state.selectedNoteId;
  const isRenaming = state.treeEditor?.mode === 'rename-note' && state.treeEditor.targetId === note.id;
  const isDeleting = state.deleteIntent?.kind === 'note' && state.deleteIntent.targetId === note.id;
  const isDragging = state.dragState.activeKind === 'note' && state.dragState.activeId === note.id;
  const iconKind = resolveNoteVisualType(note);

  const rowMarkup = isRenaming
    ? renderInlineEditorRow(level, 'rename-note', state.treeEditor.value)
    : renderNoteNodeMarkup({ note, level, selected, isDragging, iconKind });

  if (!isDeleting) {
    return rowMarkup;
  }

  return `
    <div class="library-node-group">
      ${rowMarkup}
      <div class="library-node-children">
        ${renderDeleteIntentRow(level + 1, 'note', note.id, note.title)}
      </div>
    </div>
  `;
}

function renderRecycleNoteNode(note, level) {
  return renderRecycleNoteNodeMarkup({
    note,
    level,
    iconKind: resolveNoteVisualType(note)
  });
}

function renderInlineEditorRow(level, mode, value) {
  return renderInlineEditorRowMarkup({ level, mode, value });
}

function renderDeleteIntentRow(level, kind, targetId, name) {
  return renderDeleteIntentRowMarkup({ level, kind, targetId, name });
}

function renderEmptyItem(label) {
  return renderEmptyTreeItem(label);
}

function renderHeaderToggle() {
  if (!elements.secondaryNavToggle) {
    return;
  }

  elements.secondaryNavToggle.dataset.open = String(state.sectionMenuOpen);
}

function renderContextMenu() {
  if (!elements.contextMenu) {
    return;
  }

  if (!state.contextMenu.open) {
    elements.contextMenu.hidden = true;
    elements.contextMenu.innerHTML = '';
    return;
  }

  const items = getContextMenuItems();
  if (items.length === 0) {
    elements.contextMenu.hidden = true;
    elements.contextMenu.innerHTML = '';
    return;
  }

  elements.contextMenu.hidden = false;
  elements.contextMenu.style.left = `${state.contextMenu.x}px`;
  elements.contextMenu.style.top = `${state.contextMenu.y}px`;
  elements.contextMenu.innerHTML = renderContextMenuItems(items);
}

function getContextMenuItems() {
  return getNavigationContextMenuItems({
    targetKind: state.contextMenu.targetKind,
    targetId: state.contextMenu.targetId,
    notes: state.allNotes,
    recycleNotes: getRecycleNotes()
  });
}

function renderSectionMenu() {
  if (!elements.sectionMenu || !elements.secondaryNavToggle) {
    return;
  }

  if (!state.sectionMenuOpen) {
    elements.sectionMenu.hidden = true;
    elements.sectionMenu.innerHTML = '';
    return;
  }

  const rect = elements.secondaryNavToggle.getBoundingClientRect();
  elements.sectionMenu.hidden = false;
  elements.sectionMenu.style.left = `${Math.max(8, rect.right - 188)}px`;
  elements.sectionMenu.style.top = `${rect.bottom + 6}px`;
  elements.sectionMenu.innerHTML = renderSectionMenuItems({
    items: SECONDARY_SECTION_ITEMS,
    sections: state.secondarySections
  });
}

function getDirectNotesForFolder(folderId) {
  return selectDirectNotesForFolder(state.allNotes, folderId);
}

function isCreateEditorForParent(parentId) {
  return Boolean(
    state.treeEditor
    && (state.treeEditor.mode === 'create-folder' || state.treeEditor.mode === 'create-note')
    && state.treeEditor.parentId === parentId
  );
}

  return {
    renderFolders,
    renderNavSection,
    renderMaterialsTree,
    renderFolderNode,
    renderNoteNode,
    renderRecycleNoteNode,
    renderInlineEditorRow,
    renderDeleteIntentRow,
    renderEmptyItem,
    renderHeaderToggle,
    renderContextMenu,
    getContextMenuItems,
    renderSectionMenu,
    getDirectNotesForFolder,
    isCreateEditorForParent
  };
}

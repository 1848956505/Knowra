import { getContextMenuItems as getNavigationContextMenuItems } from '../../../../lib/navigation/context-menu.js';
import { renderContextMenuItems } from '../../../../lib/navigation/context-menu-renderers.js';
import {
  SECONDARY_SECTION_ITEMS,
  renderSectionMenuItems
} from '../../../../lib/navigation/section-menu-renderers.js';

export function createNavigationMenuRenderController(deps) {
  const {
    state,
    elements,
    getRecycleNotes
  } = deps;

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
      recycleNotes: getRecycleNotes(),
      attachments: state.attachments,
      markdown: state.draftMarkdown
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

  return {
    renderHeaderToggle,
    renderContextMenu,
    getContextMenuItems,
    renderSectionMenu
  };
}

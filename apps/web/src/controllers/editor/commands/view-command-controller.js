export function createEditorViewCommandController(deps, getController, menuState) {
  const {
    state,
    getCurrentNote,
    renderAll,
    flashStatus
  } = deps;

  async function handleViewMenuAction(action) {
    menuState.closeEditorMenuBar();

    switch (action) {
      case 'mode-read':
        state.view.mode = 'read';
        state.view.showSourceEditor = false;
        renderAll();
        return;
      case 'mode-edit':
        state.view.mode = 'edit';
        state.view.showSourceEditor = false;
        renderAll();
        return;
      case 'mode-focus':
        state.view.mode = 'focus';
        state.view.showSourceEditor = false;
        renderAll();
        return;
      case 'toggle-left-sidebar':
        state.view.showLeftSidebar = !state.view.showLeftSidebar;
        renderAll();
        return;
      case 'toggle-right-sidebar':
        state.view.showRightSidebar = !state.view.showRightSidebar;
        renderAll();
        return;
      case 'toggle-source-editor':
        if (!getCurrentNote()) {
          flashStatus('请先选择一篇笔记');
          return;
        }
        state.view.mode = 'edit';
        state.view.showSourceEditor = !state.view.showSourceEditor;
        renderAll();
        return;
      default:
        return;
    }
  }

  return {
    handleViewMenuAction
  };
}

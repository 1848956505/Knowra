import assert from 'node:assert/strict';
import {
  EDITOR_MENU_ITEMS,
  FORMAT_MENU_ITEMS,
  PARAGRAPH_MENU_ITEMS,
  renderEditorMenuBarMarkup,
  renderFileMenu
} from '../lib/editor/menu-renderers.js';

const shortcutLabel = (action) => {
  switch (action) {
    case 'save':
      return 'Ctrl+S';
    case 'code':
      return 'Ctrl+E';
    default:
      return '';
  }
};
const note = {
  id: 'note-1',
  title: '<Note>',
  favorite: false,
  deleted: false
};

const fileMenuBar = renderEditorMenuBarMarkup({
  note,
  effectiveView: {
    mode: 'edit',
    showLeftSidebar: true,
    showRightSidebar: false,
    showSourceEditor: false
  },
  openMenu: 'file',
  getShortcutLabel: shortcutLabel
});

assert.match(fileMenuBar, /data-editor-menu-toggle="file"[\s\S]*data-open="true"/);
assert.match(fileMenuBar, /data-file-menu-action="save"[\s\S]*Ctrl\+S/);
assert.match(fileMenuBar, /data-file-menu-action="delete-note"/);

const viewMenuBar = renderEditorMenuBarMarkup({
  note,
  effectiveView: {
    mode: 'edit',
    showLeftSidebar: true,
    showRightSidebar: false,
    showSourceEditor: false
  },
  openMenu: 'view',
  getShortcutLabel: shortcutLabel
});

assert.match(viewMenuBar, /data-view-menu-action="toggle-right-sidebar"[\s\S]*显示右侧辅助区/);

assert.match(
  renderFileMenu({ note: { ...note, deleted: true }, getShortcutLabel: shortcutLabel }),
  /data-file-menu-action="restore-note"/,
  'deleted notes should render a restore action'
);

assert.match(
  renderFileMenu({ note: null, getShortcutLabel: shortcutLabel }),
  /data-file-menu-action="save" disabled/,
  'file actions requiring a note should be disabled without a current note'
);

assert.ok(EDITOR_MENU_ITEMS.some((item) => item.key === 'find'));
assert.ok(PARAGRAPH_MENU_ITEMS.some((item) => item.key === 'heading-6'));
assert.ok(FORMAT_MENU_ITEMS.some((item) => item.key === 'highlight'));
assert.match(
  fileMenuBar,
  /data-format-quick-action="code"/,
  'editor menu bar should expose an inline-code quick action button'
);
assert.match(
  fileMenuBar,
  /data-format-quick-action="codeblock"/,
  'editor menu bar should expose a code-block quick action button'
);
assert.match(
  fileMenuBar,
  /data-format-quick-action="code"[\s\S]*Ctrl\+E/,
  'inline-code quick action should surface its keyboard shortcut label'
);

console.log('ok - editor menu renderers build menus and states');

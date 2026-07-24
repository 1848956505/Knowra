import assert from 'node:assert/strict';
import {
  EDIT_MENU_ITEMS,
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

assert.ok(EDIT_MENU_ITEMS.some((item) => item.key === 'find'));
assert.ok(PARAGRAPH_MENU_ITEMS.some((item) => item.key === 'heading-4'));
assert.ok(!PARAGRAPH_MENU_ITEMS.some((item) => item.key === 'heading-5'));
assert.ok(!PARAGRAPH_MENU_ITEMS.some((item) => item.key === 'heading-6'));
assert.ok(FORMAT_MENU_ITEMS.some((item) => item.key === 'highlight'));
assert.doesNotMatch(fileMenuBar, /data-format-quick-action/, 'editor menu bar should not render the removed quick action buttons');
assert.ok(
  FORMAT_MENU_ITEMS.some((item) => item.key === 'code' && item.label === '行内代码'),
  'format menu should keep inline code in the top format dropdown'
);
assert.ok(
  PARAGRAPH_MENU_ITEMS.some((item) => item.key === 'codeblock' && item.label === '代码块'),
  'paragraph menu should keep code blocks in the block-level dropdown'
);

console.log('ok - editor menu renderers build menus and states');

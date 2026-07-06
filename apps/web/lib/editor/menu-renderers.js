export const EDIT_MENU_ITEMS = [
  { key: 'undo', label: '撤销' },
  { key: 'redo', label: '重做' },
  { key: 'separator' },
  { key: 'cut', label: '剪切' },
  { key: 'copy', label: '复制' },
  { key: 'paste', label: '粘贴' },
  { key: 'separator' },
  { key: 'find', label: '查找' },
  { key: 'replace', label: '替换' },
  { key: 'select-all', label: '全选' }
];

export const EDITOR_MENU_ITEMS = EDIT_MENU_ITEMS;

export const PARAGRAPH_MENU_ITEMS = [
  { key: 'paragraph', label: '正文' },
  { key: 'heading-1', label: 'H1' },
  { key: 'heading-2', label: 'H2' },
  { key: 'heading-3', label: 'H3' },
  { key: 'heading-4', label: 'H4' },
  { key: 'heading-5', label: 'H5' },
  { key: 'heading-6', label: 'H6' },
  { key: 'separator' },
  { key: 'bullet', label: '无序列表' },
  { key: 'ordered', label: '有序列表' },
  { key: 'task-list', label: '任务列表' },
  { key: 'separator' },
  { key: 'quote', label: '引用块' },
  { key: 'codeblock', label: '代码块' },
  { key: 'hr', label: '分割线' },
  { key: 'table', label: '表格' }
];

export const FORMAT_MENU_ITEMS = [
  { key: 'image', label: '图片' },
  { key: 'internal-link', label: '内部链接' },
  { key: 'separator' },
  { key: 'bold', label: '加粗' },
  { key: 'italic', label: '斜体' },
  { key: 'strikethrough', label: '删除线' },
  { key: 'code', label: '行内代码' },
  { key: 'highlight', label: '高亮' }
];

const FORMAT_QUICK_ACTIONS = [
  { key: 'code', label: '琛屽唴浠ｇ爜' },
  { key: 'codeblock', label: '浠ｇ爜鍧?' }
];

export function renderEditorMenuBarMarkup({
  note,
  effectiveView,
  openMenu,
  getShortcutLabel = () => ''
}) {
  const fileMenuOpen = openMenu === 'file';
  const paragraphMenuOpen = openMenu === 'paragraph';
  const editMenuOpen = openMenu === 'edit';
  const formatMenuOpen = openMenu === 'format';
  const viewMenuOpen = openMenu === 'view';

  return `
    <div class="editor-menu-shell">
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="file"
          data-open="${fileMenuOpen}"
        >
          文件
        </button>
        ${fileMenuOpen ? renderFileMenu({ note, getShortcutLabel }) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="paragraph"
          data-open="${paragraphMenuOpen}"
        >
          段落
        </button>
        ${paragraphMenuOpen ? renderParagraphMenu({ note, getShortcutLabel }) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="edit"
          data-open="${editMenuOpen}"
        >
          编辑
        </button>
        ${editMenuOpen ? renderEditMenu({ note, getShortcutLabel }) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="format"
          data-open="${formatMenuOpen}"
        >
          格式
        </button>
        ${formatMenuOpen ? renderFormatMenu({ note, getShortcutLabel }) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="view"
          data-open="${viewMenuOpen}"
        >
          视图
        </button>
        ${viewMenuOpen ? renderViewMenu({ note, effectiveView }) : ''}
      </div>
      <div class="editor-menu-spacer" aria-hidden="true"></div>
      <div class="editor-format-quick-actions" role="toolbar" aria-label="编辑器快捷功能">
        ${renderFormatQuickActions({ note, getShortcutLabel })}
      </div>
    </div>
  `;
}

export function renderEditMenu({ note, getShortcutLabel = () => '' } = {}) {
  return renderActionMenu({
    menuKey: 'edit',
    items: EDIT_MENU_ITEMS,
    actionAttr: 'data-edit-menu-action',
    note,
    getShortcutLabel
  });
}

export function renderParagraphMenu({ note, getShortcutLabel = () => '' } = {}) {
  return renderActionMenu({
    menuKey: 'paragraph',
    items: PARAGRAPH_MENU_ITEMS,
    actionAttr: 'data-paragraph-menu-action',
    note,
    getShortcutLabel
  });
}

export function renderFormatMenu({ note, getShortcutLabel = () => '' } = {}) {
  return renderActionMenu({
    menuKey: 'format',
    items: FORMAT_MENU_ITEMS,
    actionAttr: 'data-format-menu-action',
    note,
    getShortcutLabel
  });
}

export function renderViewMenu({ note, effectiveView }) {
  const hasEditableNote = Boolean(note && !note.deleted);

  return `
    <div class="editor-menu-popover" data-editor-menu="view">
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-read" data-active="${effectiveView.mode === 'read'}">阅读模式</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-edit" data-active="${effectiveView.mode === 'edit'}">编辑模式</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-focus" data-active="${effectiveView.mode === 'focus'}">专注模式</button>
      <div class="editor-menu-divider" aria-hidden="true"></div>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-left-sidebar" data-active="${effectiveView.showLeftSidebar}">${effectiveView.showLeftSidebar ? '隐藏左侧目录区' : '显示左侧目录区'}</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-right-sidebar" data-active="${effectiveView.showRightSidebar}">${effectiveView.showRightSidebar ? '隐藏右侧辅助区' : '显示右侧辅助区'}</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-source-editor" data-active="${effectiveView.showSourceEditor}" ${hasEditableNote ? '' : 'disabled'}>${effectiveView.showSourceEditor ? '隐藏源码编辑器' : '显示源码编辑器'}</button>
    </div>
  `;
}

export function renderFileMenu({ note, getShortcutLabel = () => '' } = {}) {
  const hasEditableNote = Boolean(note && !note.deleted);
  const isDeletedNote = Boolean(note?.deleted);

  return `
    <div class="editor-menu-popover" data-editor-menu="file">
      <button type="button" class="editor-menu-item" data-file-menu-action="new-note">新建笔记</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="new-folder">新建文件夹</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="import-markdown">导入 Markdown</button>
      <div class="editor-menu-divider" aria-hidden="true"></div>
      ${renderEditorMenuItem({ actionAttr: 'data-file-menu-action', actionKey: 'save', disabled: !hasEditableNote, label: '保存', getShortcutLabel })}
      ${renderEditorMenuItem({ actionAttr: 'data-file-menu-action', actionKey: 'save-as', disabled: !hasEditableNote, label: '另存为', getShortcutLabel })}
      ${renderEditorMenuItem({ actionAttr: 'data-file-menu-action', actionKey: 'rename', disabled: !hasEditableNote, label: '重命名', getShortcutLabel })}
      ${isDeletedNote
        ? '<button type="button" class="editor-menu-item" data-file-menu-action="restore-note">恢复笔记</button>'
        : hasEditableNote
          ? `
            <button type="button" class="editor-menu-item" data-file-menu-action="favorite-note">${note.favorite ? '取消收藏' : '收藏笔记'}</button>
            <button type="button" class="editor-menu-item" data-file-menu-action="delete-note">删除</button>
          `
          : ''}
      <div class="editor-menu-divider" aria-hidden="true"></div>
      ${renderEditorMenuItem({ actionAttr: 'data-file-menu-action', actionKey: 'export-markdown', disabled: !hasEditableNote, label: '导出 Markdown', getShortcutLabel })}
      ${renderEditorMenuItem({ actionAttr: 'data-file-menu-action', actionKey: 'export-pdf', disabled: !hasEditableNote, label: '导出', getShortcutLabel })}
    </div>
  `;
}

function renderActionMenu({ menuKey, items, actionAttr, note, getShortcutLabel }) {
  const hasNote = Boolean(note);

  return `
    <div class="editor-menu-popover" data-editor-menu="${menuKey}">
      ${items
        .map((item) => {
          if (item.key === 'separator') {
            return '<div class="editor-menu-divider" aria-hidden="true"></div>';
          }

          return renderEditorMenuItem({
            actionAttr,
            actionKey: item.key,
            disabled: !hasNote,
            label: item.label,
            getShortcutLabel
          });
        })
        .join('')}
    </div>
  `;
}

function renderEditorMenuItem({
  actionAttr,
  actionKey,
  disabled = false,
  label,
  getShortcutLabel = () => ''
}) {
  const shortcut = getShortcutLabel(actionKey);
  return `
    <button type="button" class="editor-menu-item" ${actionAttr}="${actionKey}" ${disabled ? 'disabled' : ''}>
      <span class="editor-menu-item-label">${escapeHtml(label)}</span>
      ${shortcut ? `<span class="editor-menu-shortcut">${escapeHtml(shortcut)}</span>` : ''}
    </button>
  `;
}

function renderFormatQuickActions({ note, getShortcutLabel = () => '' }) {
  const disabled = !note;

  return FORMAT_QUICK_ACTIONS.map((item) => {
    const shortcut = getShortcutLabel(item.key);
    return `
      <button
        type="button"
        class="editor-format-quick-button"
        data-format-quick-action="${item.key}"
        title="${escapeHtml(item.label)}${shortcut ? ` (${shortcut})` : ''}"
        aria-label="${escapeHtml(item.label)}"
        ${disabled ? 'disabled' : ''}
      >
        <span class="editor-format-quick-label">${escapeHtml(item.label)}</span>
        ${shortcut ? `<span class="editor-format-quick-shortcut">${escapeHtml(shortcut)}</span>` : ''}
      </button>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

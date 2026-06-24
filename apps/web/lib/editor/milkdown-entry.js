import '@milkdown/prose/view/style/prosemirror.css';

import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, schemaCtx } from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { getNodeFromSchema } from '@milkdown/prose';
import { lift, liftEmptyBlock, splitBlock, toggleMark } from '@milkdown/prose/commands';
import { Slice } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import {
  commonmark,
  createCodeBlockCommand,
  liftListItemCommand,
  setBlockTypeCommand,
  sinkListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
  insertHrCommand
} from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
  selectColCommand,
  selectRowCommand,
  setAlignCommand
} from '@milkdown/preset-gfm';
import { tableBlock, tableBlockConfig } from '@milkdown/components/table-block';
import { imageBlockConfig, defaultImageBlockConfig } from '@milkdown/components/image-block';
import { $command, $markSchema, $prose, $remark, callCommand, getMarkdown, replaceAll } from '@milkdown/utils';
import { enhancedImageBlockComponent } from './enhanced-image-block.js';
import {
  resolveBackspaceBehavior,
  resolveBlockCommandBehavior,
  resolveEnterBehavior,
  resolveIndentBehavior,
  shouldKeepTrailingBlank
} from './enter-behavior.js';
import { resolveMatchNavigationIndex } from './find-navigation.js';
import { removeSpuriousEmptyCodeBlocks, shouldPreferPlainMarkdown } from './markdown-paste.js';

const insertLinkCommand = $command('InsertLink', (ctx) => () => (state, dispatch) => {
  const { selection } = state;
  const { $from, $to, empty } = selection;

  const linkText = empty ? 'link' : state.doc.textBetween($from.pos, $to.pos);
  const markdown = `[${linkText}](https://)`;

  const tr = empty
    ? state.tr.insertText(markdown, $from.pos)
    : state.tr.replaceWith($from.pos, $to.pos, state.schema.text(markdown));

  const urlStart = empty ? $from.pos + linkText.length + 3 : $from.pos + linkText.length + 3;
  const urlEnd = urlStart + 7;
  tr.setSelection(TextSelection.create(tr.doc, urlStart, urlEnd));
  dispatch(tr.scrollIntoView());
  return true;
});

const insertImageBlockCommand = $command('InsertImage', (ctx) => () => (state, dispatch) => {
  const schema = ctx.get(schemaCtx);
  const imageBlockNodeType = getNodeFromSchema('image-block', schema);

  if (!imageBlockNodeType) {
    return false;
  }

  const node = imageBlockNodeType.create({
    src: '',
    caption: '',
    ratio: 1
  });

  const tr = state.tr.replaceSelectionWith(node, false);
  dispatch(tr.scrollIntoView());
  return true;
});
const insertInternalLinkCommand = $command('InsertInternalLink', (ctx) => () => (state, dispatch) => {
  const { selection } = state;
  const { $from, $to, empty } = selection;

  const linkText = empty ? '内部链接' : state.doc.textBetween($from.pos, $to.pos);
  const markdown = `[[${linkText}]]`;

  const tr = empty
    ? state.tr.insertText(markdown, $from.pos)
    : state.tr.replaceWith($from.pos, $to.pos, state.schema.text(markdown));

  const linkStart = $from.pos + 2;
  const linkEnd = linkStart + linkText.length;
  tr.setSelection(TextSelection.create(tr.doc, linkStart, linkEnd));
  dispatch(tr.scrollIntoView());
  return true;
});
const turnIntoTaskListCommand = $command('TurnIntoTaskList', (ctx) => () => (state, dispatch) => {
  const schema = ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  const listItemNodeType = getNodeFromSchema('list_item', schema);
  const bulletListNodeType = getNodeFromSchema('bullet_list', schema);

  if (!paragraphNodeType || !listItemNodeType || !bulletListNodeType) {
    return false;
  }

  const { $from, $to } = state.selection;
  const from = $from.start($from.depth);
  const to = $to.end($to.depth);

  const paragraphContent = state.doc.slice(from, to).content;
  const taskListItem = listItemNodeType.create(
    { checked: false },
    [paragraphNodeType.create(null, paragraphContent)]
  );
  const bulletList = bulletListNodeType.create(null, [taskListItem]);
  const tr = state.tr.replaceRangeWith(from, to, bulletList);
  dispatch(tr.scrollIntoView());
  return true;
});

function normalizeTableDimension(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(20, Math.max(1, parsed));
}

function renderTableButton(renderType) {
  switch (renderType) {
    case 'add_row':
    case 'add_col':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10"></path><path d="M3 8h10"></path></svg>';
    case 'add_row_before':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.8v4.6"></path><path d="M5.7 5.1h4.6"></path><path d="M3 10.8h10"></path><path d="M3 13h10"></path></svg>';
    case 'add_row_after':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8.6v4.6"></path><path d="M5.7 10.9h4.6"></path><path d="M3 3h10"></path><path d="M3 5.2h10"></path></svg>';
    case 'add_col_before':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 8h4.6"></path><path d="M5.1 5.7v4.6"></path><path d="M10.8 3v10"></path><path d="M13 3v10"></path></svg>';
    case 'add_col_after':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 8h4.6"></path><path d="M10.9 5.7v4.6"></path><path d="M3 3v10"></path><path d="M5.2 3v10"></path></svg>';
    case 'delete_row':
    case 'delete_col':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 5.5h5.6"></path><path d="M6 5.5V4.6h4v.9"></path><path d="M6.3 6.5l.3 4.5h2.8l.3-4.5"></path></svg>';
    case 'align_col_left':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10"></path><path d="M3 8h7"></path><path d="M3 12h9"></path></svg>';
    case 'align_col_center':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10"></path><path d="M4.5 8h7"></path><path d="M3.5 12h9"></path></svg>';
    case 'align_col_right':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10"></path><path d="M6 8h7"></path><path d="M4 12h9"></path></svg>';
    case 'col_drag_handle':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11"></path><path d="M2.5 8h11"></path><path d="M2.5 11.5h11"></path></svg>';
    case 'row_drag_handle':
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11"></path><path d="M8 2.5v11"></path><path d="M11.5 2.5v11"></path></svg>';
    default:
      return '';
  }
}

function createTableHandleActionButton({ action, icon, label, onActivate }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tablePinnedAction = action;
  if (action === 'table-delete-row' || action === 'table-delete-col') {
    button.dataset.tablePinnedDanger = 'true';
  }
  button.innerHTML = renderTableButton(icon);
  button.setAttribute('title', label);
  button.setAttribute('aria-label', label);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
      return;
    }
    void onActivate?.();
  });
  return button;
}

function ensureTablePinnedButtons(group, descriptors, onActivate) {
  if (!(group instanceof HTMLElement)) {
    return;
  }

  descriptors
    .slice()
    .reverse()
    .forEach((descriptor) => {
      const selector = `[data-table-pinned-action="${descriptor.action}"]`;
      if (group.querySelector(selector)) {
        return;
      }

      const button = createTableHandleActionButton({
        ...descriptor,
        onActivate: () => onActivate?.(descriptor)
      });
      group.prepend(button);
    });
}

function syncTableHandleLabels(root, host = null) {
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const setButtonLabel = (button, label) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.setAttribute('title', label);
    button.setAttribute('aria-label', label);
  };

  const hideBuiltinDeleteButton = (button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.dataset.tableBuiltinDelete = 'true';
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    button.style.display = 'none';
  };

  root.querySelectorAll('.milkdown-table-block').forEach((tableBlockRoot) => {
    const colHandle = tableBlockRoot.querySelector('[data-role="col-drag-handle"]');
    if (colHandle instanceof HTMLElement) {
      colHandle.setAttribute('title', '选中整列');
      colHandle.setAttribute('aria-label', '选中整列');
      const buttonGroup = colHandle.querySelector('.button-group');
      ensureTablePinnedButtons(
        buttonGroup,
        [
          { action: 'table-add-col-before', icon: 'add_col_before', label: '左侧插列', kind: 'col' },
          { action: 'table-add-col-after', icon: 'add_col_after', label: '右侧插列', kind: 'col' },
          { action: 'table-delete-col', icon: 'delete_col', label: '删除列', kind: 'col' }
        ],
        ({ action, kind }) => host?.tableHandleController?.runPinnedAction(kind, action)
      );
      const builtinButtons = Array.from(colHandle.querySelectorAll('.button-group button:not([data-table-pinned-action])'));
      setButtonLabel(builtinButtons[0], '左对齐');
      setButtonLabel(builtinButtons[1], '居中对齐');
      setButtonLabel(builtinButtons[2], '右对齐');
      setButtonLabel(builtinButtons[3], '删除列');
      hideBuiltinDeleteButton(builtinButtons[3]);
    }

    const rowHandle = tableBlockRoot.querySelector('[data-role="row-drag-handle"]');
    if (rowHandle instanceof HTMLElement) {
      rowHandle.setAttribute('title', '选中整行');
      rowHandle.setAttribute('aria-label', '选中整行');
      const buttonGroup = rowHandle.querySelector('.button-group');
      ensureTablePinnedButtons(
        buttonGroup,
        [
          { action: 'table-add-row-before', icon: 'add_row_before', label: '上方插行', kind: 'row' },
          { action: 'table-add-row-after', icon: 'add_row_after', label: '下方插行', kind: 'row' },
          { action: 'table-delete-row', icon: 'delete_row', label: '删除行', kind: 'row' }
        ],
        ({ action, kind }) => host?.tableHandleController?.runPinnedAction(kind, action)
      );
      const deleteButton = rowHandle.querySelector('.button-group button:not([data-table-pinned-action])');
      setButtonLabel(deleteButton, '删除行');
      hideBuiltinDeleteButton(deleteButton);
    }

    const xLineHandle = tableBlockRoot.querySelector('[data-role="x-line-drag-handle"]');
    if (xLineHandle instanceof HTMLElement) {
      xLineHandle.dataset.show = 'false';
    }

    const yLineHandle = tableBlockRoot.querySelector('[data-role="y-line-drag-handle"]');
    if (yLineHandle instanceof HTMLElement) {
      yLineHandle.dataset.show = 'false';
    }
  });
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function setPinnedActionDisabled(button, disabled) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.disabled = disabled;
  button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

function resolveTableMatchAtPos(doc, pos) {
  if (!doc || typeof pos !== 'number') {
    return null;
  }

  const maxPos = Math.max(0, doc.content.size);
  const safePos = Math.min(Math.max(0, pos), maxPos);
  return findAncestorOfType(doc.resolve(safePos), ['table']);
}

function ensureTableHasHeaderRowAtPos(editor, tablePos) {
  if (!editor || typeof tablePos !== 'number') {
    return false;
  }

  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const tableMatch = resolveTableMatchAtPos(view.state.doc, tablePos);
  if (!tableMatch?.node?.childCount) {
    return false;
  }

  const firstRow = tableMatch.node.firstChild;
  const headerRowType = schema.nodes.table_header_row;
  const headerCellType = schema.nodes.table_header;
  if (!firstRow || firstRow.type.name !== 'table_row' || !headerRowType || !headerCellType) {
    return false;
  }

  const headerCells = [];
  firstRow.forEach((cell) => {
    if (cell.type === headerCellType) {
      headerCells.push(cell);
      return;
    }

    headerCells.push(headerCellType.create(cell.attrs, cell.content, cell.marks));
  });

  const replacement = headerRowType.create(firstRow.attrs, headerCells, firstRow.marks);
  const firstRowPos = tableMatch.pos + 1;
  view.dispatch(view.state.tr.replaceWith(firstRowPos, firstRowPos + firstRow.nodeSize, replacement));
  return true;
}

class TableHandleController {
  constructor(host) {
    this.host = host;
    this.root = host.root;
    this.pinnedCell = null;
    this.openMenuKind = null;
    this.hoverMenuKind = null;
    this.syncFrame = 0;
    this.menuRecoveryTimer = 0;
    this.menuRecoveryKind = null;
    this.menuRecoveryAttempt = 0;
  }

  attach() {
    this.root.addEventListener('click', this.handleRootClick, true);
    this.root.addEventListener('pointerover', this.handleRootPointerOver, true);
    this.root.addEventListener('pointerout', this.handleRootPointerOut, true);
    this.root.addEventListener('mouseup', this.queueSelectionSync, true);
    this.root.addEventListener('keyup', this.queueSelectionSync, true);
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.addEventListener('selectionchange', this.handleSelectionChange, true);
    window.addEventListener('resize', this.queueSyncPinnedHandles);
    this.root.addEventListener('scroll', this.queueSyncPinnedHandles, true);
  }

  destroy() {
    this.clearPinnedTable();
    this.clearPinnedMenuRecovery();
    if (this.syncFrame) {
      window.cancelAnimationFrame(this.syncFrame);
      this.syncFrame = 0;
    }
    this.root.removeEventListener('click', this.handleRootClick, true);
    this.root.removeEventListener('pointerover', this.handleRootPointerOver, true);
    this.root.removeEventListener('pointerout', this.handleRootPointerOut, true);
    this.root.removeEventListener('mouseup', this.queueSelectionSync, true);
    this.root.removeEventListener('keyup', this.queueSelectionSync, true);
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.removeEventListener('selectionchange', this.handleSelectionChange, true);
    window.removeEventListener('resize', this.queueSyncPinnedHandles);
    this.root.removeEventListener('scroll', this.queueSyncPinnedHandles, true);
  }

  handleRootClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    if (target.closest('.milkdown-table-block .button-group button')) {
      return;
    }

    if (target.closest('.milkdown-table-block [data-role="row-drag-handle"], .milkdown-table-block [data-role="col-drag-handle"]')) {
      return;
    }

    const cell = target.closest('.milkdown-table-block table.children td, .milkdown-table-block table.children th');
    if (cell instanceof HTMLElement) {
      this.pinCell(cell);
      return;
    }

    if (!target.closest('.milkdown-table-block')) {
      this.clearPinnedTable();
    }
  };

  handleDocumentPointerDown = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    if (target.closest('.milkdown-table-block .button-group button')) {
      return;
    }

    const rowHandle = target.closest('.milkdown-table-block [data-role="row-drag-handle"]');
    if (rowHandle instanceof HTMLElement && rowHandle.closest('.milkdown-table-block')?.dataset.pinned === 'true') {
      event.preventDefault();
      event.stopPropagation();
      void this.togglePinnedMenu('row');
      return;
    }

    const colHandle = target.closest('.milkdown-table-block [data-role="col-drag-handle"]');
    if (colHandle instanceof HTMLElement && colHandle.closest('.milkdown-table-block')?.dataset.pinned === 'true') {
      event.preventDefault();
      event.stopPropagation();
      void this.togglePinnedMenu('col');
      return;
    }

    if (!this.root.contains(target)) {
      this.clearPinnedTable();
      return;
    }

    if (!target.closest('.milkdown-table-block')) {
      this.clearPinnedTable();
    }
  };

  handleSelectionChange = () => {
    this.queueSelectionSync();
  };

  getPinnedMenuKindFromTarget(target) {
    if (!(target instanceof Element) || !this.pinnedCell?.tableBlock) {
      return null;
    }

    const handle = target.closest('.milkdown-table-block [data-role="row-drag-handle"], .milkdown-table-block [data-role="col-drag-handle"]');
    if (!(handle instanceof HTMLElement) || handle.closest('.milkdown-table-block') !== this.pinnedCell.tableBlock) {
      return null;
    }

    return handle.dataset.role === 'row-drag-handle' ? 'row' : 'col';
  }

  handleRootPointerOver = (event) => {
    const kind = this.getPinnedMenuKindFromTarget(event.target);
    if (kind === this.hoverMenuKind) {
      return;
    }

    this.hoverMenuKind = kind;
    this.applyPinnedMenuState();
  };

  handleRootPointerOut = (event) => {
    const currentKind = this.getPinnedMenuKindFromTarget(event.target);
    if (!currentKind) {
      return;
    }

    const nextKind = this.getPinnedMenuKindFromTarget(event.relatedTarget);
    if (nextKind === currentKind) {
      return;
    }

    this.hoverMenuKind = nextKind;
    this.applyPinnedMenuState();
  };

  clearPinnedMenuRecovery() {
    if (this.menuRecoveryTimer) {
      window.clearTimeout(this.menuRecoveryTimer);
      this.menuRecoveryTimer = 0;
    }
    this.menuRecoveryKind = null;
    this.menuRecoveryAttempt = 0;
  }

  schedulePinnedMenuRecovery(kind = this.openMenuKind, attempt = 0) {
    this.clearPinnedMenuRecovery();
    if (!this.pinnedCell || !kind || this.openMenuKind !== kind) {
      return;
    }

    this.menuRecoveryKind = kind;
    this.menuRecoveryAttempt = attempt;
    const delay = attempt === 0 ? 120 : 80;
    this.menuRecoveryTimer = window.setTimeout(() => {
      this.menuRecoveryTimer = 0;
      if (!this.pinnedCell || this.openMenuKind !== kind) {
        this.clearPinnedMenuRecovery();
        return;
      }

      this.syncPinnedHandles();
      this.applyPinnedMenuState();

      const buttonGroup = this.pinnedCell.tableBlock?.querySelector(
        kind === 'row'
          ? '[data-role="row-drag-handle"] .button-group'
          : '[data-role="col-drag-handle"] .button-group'
      );
      const isVisible = buttonGroup instanceof HTMLElement
        && buttonGroup.dataset.show === 'true'
        && window.getComputedStyle(buttonGroup).pointerEvents !== 'none';

      if (isVisible || attempt >= 5) {
        this.clearPinnedMenuRecovery();
        return;
      }

      this.schedulePinnedMenuRecovery(kind, attempt + 1);
    }, delay);
  }

  queueSyncPinnedHandles = () => {
    if (!this.pinnedCell || this.syncFrame) {
      return;
    }

    this.syncFrame = window.requestAnimationFrame(() => {
      this.syncFrame = 0;
      this.syncPinnedHandles();
    });
  };

  queueSelectionSync = () => {
    if (this.syncFrame) {
      return;
    }

    this.syncFrame = window.requestAnimationFrame(() => {
      this.syncFrame = 0;
      this.syncPinnedHandleFromSelection();
    });
  };

  findCellFromCurrentSelection() {
    const selection = window.getSelection?.();
    const anchorNode = selection?.anchorNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const directCell = anchorElement?.closest?.('.milkdown-table-block table.children td, .milkdown-table-block table.children th');
    if (directCell instanceof HTMLElement && this.root.contains(directCell)) {
      return directCell;
    }

    const selectedCell = this.root.querySelector('.milkdown-table-block table.children td.selectedCell, .milkdown-table-block table.children th.selectedCell');
    if (selectedCell instanceof HTMLElement) {
      return selectedCell;
    }

    return null;
  }

  syncPinnedHandleFromSelection() {
    const cell = this.findCellFromCurrentSelection();
    if (cell instanceof HTMLElement) {
      this.pinCell(cell);
      return;
    }

    if (this.openMenuKind && this.pinnedCell) {
      this.syncPinnedHandles();
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof Element && activeElement.closest('.milkdown-table-block [data-role="row-drag-handle"], .milkdown-table-block [data-role="col-drag-handle"], .milkdown-table-block .button-group')) {
      return;
    }

    if (this.pinnedCell) {
      this.clearPinnedTable();
    }
  }

  clearPinnedTable() {
    this.clearPinnedMenuRecovery();
    if (this.pinnedCell?.tableBlock instanceof HTMLElement) {
      const { tableBlock } = this.pinnedCell;
      tableBlock.dataset.pinned = 'false';
      delete tableBlock.dataset.pinnedMenuVisible;
      tableBlock.querySelectorAll('[data-role="row-drag-handle"], [data-role="col-drag-handle"]').forEach((handle) => {
        if (handle instanceof HTMLElement) {
          handle.dataset.show = 'false';
          const buttonGroup = handle.querySelector('.button-group');
          if (buttonGroup instanceof HTMLElement) {
            buttonGroup.dataset.show = 'false';
          }
        }
      });
    }

    this.pinnedCell = null;
    this.openMenuKind = null;
    this.hoverMenuKind = null;
  }

  updatePinnedActionAvailability() {
    if (!this.pinnedCell?.tableBlock || !(this.pinnedCell.table instanceof HTMLTableElement)) {
      return;
    }

    const rowCount = this.pinnedCell.table.rows.length;
    const rowIndex = this.pinnedCell.rowIndex;
    const rowGroup = this.pinnedCell.tableBlock.querySelector('[data-role="row-drag-handle"] .button-group');
    if (rowGroup instanceof HTMLElement) {
      const addRowBeforeButton = rowGroup.querySelector('[data-table-pinned-action="table-add-row-before"]');
      const deleteRowButton = rowGroup.querySelector('[data-table-pinned-action="table-delete-row"]');
      setPinnedActionDisabled(addRowBeforeButton, rowIndex === 0);
      setPinnedActionDisabled(deleteRowButton, rowIndex === 0 || (rowCount === 2 && rowIndex === 1));
    }
  }

  pinCell(cell) {
    if (!(cell instanceof HTMLElement) || !this.host.editor) {
      return;
    }

    const tableBlock = cell.closest('.milkdown-table-block');
    const table = cell.closest('table.children');
    const row = cell.closest('tr');
    if (!(tableBlock instanceof HTMLElement) || !(table instanceof HTMLTableElement) || !(row instanceof HTMLTableRowElement)) {
      return;
    }

    const rows = Array.from(table.rows);
    const rowIndex = rows.indexOf(row);
    const colIndex = Array.from(row.cells).indexOf(cell);
    if (rowIndex < 0 || colIndex < 0) {
      return;
    }

    if (
      this.pinnedCell?.tableBlock === tableBlock &&
      this.pinnedCell?.rowIndex === rowIndex &&
      this.pinnedCell?.colIndex === colIndex
    ) {
      this.syncPinnedHandles();
      return;
    }

    const view = this.host.editor.ctx.get(editorViewCtx);
    const cellPos = view.posAtDOM(cell, 0);
    if (typeof cellPos !== 'number') {
      return;
    }

    const tableMatch = findAncestorOfType(view.state.doc.resolve(cellPos), ['table']);
    if (!tableMatch) {
      return;
    }

    this.root.querySelectorAll('.milkdown-table-block[data-pinned="true"]').forEach((node) => {
      if (node instanceof HTMLElement) {
        node.dataset.pinned = 'false';
      }
    });

    this.pinnedCell = {
      tableBlock,
      table,
      rowIndex,
      colIndex,
      tablePos: tableMatch.pos + 1
    };
    tableBlock.dataset.pinned = 'true';
    this.syncPinnedHandles();
  }

  applyPinnedMenuState() {
    if (!this.pinnedCell?.tableBlock) {
      return;
    }

    const visibleKind = this.openMenuKind ?? this.hoverMenuKind ?? null;
    const rowGroup = this.pinnedCell.tableBlock.querySelector('[data-role="row-drag-handle"] .button-group');
    const colGroup = this.pinnedCell.tableBlock.querySelector('[data-role="col-drag-handle"] .button-group');

    if (visibleKind) {
      this.pinnedCell.tableBlock.dataset.pinnedMenuVisible = visibleKind;
    } else {
      delete this.pinnedCell.tableBlock.dataset.pinnedMenuVisible;
    }

    if (rowGroup instanceof HTMLElement) {
      rowGroup.dataset.show = visibleKind === 'row' ? 'true' : 'false';
    }
    if (colGroup instanceof HTMLElement) {
      colGroup.dataset.show = visibleKind === 'col' ? 'true' : 'false';
    }
  }

  tryRebindPinnedCell() {
    const reboundCell = this.findCellFromCurrentSelection();
    if (!(reboundCell instanceof HTMLElement)) {
      return false;
    }

    this.pinCell(reboundCell);
    return true;
  }

  syncPinnedHandles() {
    if (!this.pinnedCell) {
      return;
    }

    const { tableBlock, table } = this.pinnedCell;
    if (!(tableBlock instanceof HTMLElement) || !(table instanceof HTMLTableElement) || !tableBlock.isConnected || !table.isConnected) {
      if (this.tryRebindPinnedCell()) {
        return;
      }
      this.clearPinnedTable();
      return;
    }

    const rows = Array.from(table.rows);
    if (!rows.length) {
      if (this.tryRebindPinnedCell()) {
        return;
      }
      this.clearPinnedTable();
      return;
    }

    this.pinnedCell.rowIndex = Math.min(this.pinnedCell.rowIndex, rows.length - 1);
    const row = rows[this.pinnedCell.rowIndex];
    const cells = Array.from(row.cells);
    if (!cells.length) {
      this.clearPinnedTable();
      return;
    }

    this.pinnedCell.colIndex = Math.min(this.pinnedCell.colIndex, cells.length - 1);
    const cell = cells[this.pinnedCell.colIndex];
    const colHeaderCell = rows[0]?.cells?.[this.pinnedCell.colIndex] ?? cell;

    const rowHandle = tableBlock.querySelector('[data-role="row-drag-handle"]');
    const colHandle = tableBlock.querySelector('[data-role="col-drag-handle"]');
    const xLineHandle = tableBlock.querySelector('[data-role="x-line-drag-handle"]');
    const yLineHandle = tableBlock.querySelector('[data-role="y-line-drag-handle"]');

    if (!(rowHandle instanceof HTMLElement) || !(colHandle instanceof HTMLElement)) {
      if (this.tryRebindPinnedCell()) {
        return;
      }
      this.clearPinnedTable();
      return;
    }

    syncTableHandleLabels(this.root, this.host);

    const blockRect = tableBlock.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const rowCellRect = cell.getBoundingClientRect();
    const colCellRect = colHeaderCell.getBoundingClientRect();

    rowHandle.dataset.show = 'true';
    colHandle.dataset.show = 'true';
    if (xLineHandle instanceof HTMLElement) {
      xLineHandle.dataset.show = 'false';
    }
    if (yLineHandle instanceof HTMLElement) {
      yLineHandle.dataset.show = 'false';
    }

    const rowWidth = rowHandle.getBoundingClientRect().width || 28;
    const rowHeight = rowHandle.getBoundingClientRect().height || 28;
    const colWidth = colHandle.getBoundingClientRect().width || 28;
    const colHeight = colHandle.getBoundingClientRect().height || 28;

    rowHandle.style.left = `${Math.round(tableRect.left - blockRect.left - rowWidth / 2 - 8)}px`;
    rowHandle.style.top = `${Math.round(rowCellRect.top - blockRect.top + rowCellRect.height / 2 - rowHeight / 2)}px`;
    colHandle.style.left = `${Math.round(colCellRect.left - blockRect.left + colCellRect.width / 2 - colWidth / 2)}px`;
    colHandle.style.top = `${Math.round(tableRect.top - blockRect.top - colHeight / 2 - 8)}px`;
    this.updatePinnedActionAvailability();
    this.applyPinnedMenuState();
  }

  async selectPinnedLine(kind) {
    if (!this.pinnedCell || !this.host.editor) {
      return false;
    }

    const commandKey = kind === 'row' ? selectRowCommand.key : selectColCommand.key;
    const index = kind === 'row' ? this.pinnedCell.rowIndex : this.pinnedCell.colIndex;
    return this.host.editor.action(callCommand(commandKey, {
      pos: this.pinnedCell.tablePos,
      index
    }));
  }

  async togglePinnedMenu(kind) {
    if (!this.pinnedCell) {
      return;
    }

    this.openMenuKind = this.openMenuKind === kind ? null : kind;
    this.applyPinnedMenuState();
    if (!this.openMenuKind) {
      this.clearPinnedMenuRecovery();
      return;
    }
    await this.selectPinnedLine(kind);
    this.syncPinnedHandles();
    window.requestAnimationFrame(() => {
      this.applyPinnedMenuState();
    });
    this.schedulePinnedMenuRecovery(kind);
  }

  async runPinnedAction(kind, action) {
    if (!this.pinnedCell) {
      return false;
    }

    const pinnedSnapshot = {
      tablePos: this.pinnedCell.tablePos,
      rowIndex: this.pinnedCell.rowIndex,
      colIndex: this.pinnedCell.colIndex
    };
    await this.selectPinnedLine(kind);
    if (action === 'table-delete-row' || action === 'table-delete-col') {
      await waitForNextFrame();
    }
    const result = await this.host.run(action);
    if (result && (action === 'table-delete-row' || action === 'table-delete-col')) {
      this.host.repairTableAfterDelete(pinnedSnapshot);
    }
    this.queueSyncPinnedHandles();
    return result;
  }
}

const highlightRemark = $remark('highlight', () => () => (tree) => {
  const visit = (node) => {
    if (node.type === 'text' && typeof node.value === 'string' && /==[^=\n]+?==/.test(node.value)) {
      const out = [];
      const re = /==([^=\n]+?)==/g;
      let last = 0;
      let m;
      while ((m = re.exec(node.value)) !== null) {
        if (m.index > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
        out.push({ type: 'highlight', children: [{ type: 'text', value: m[1] }] });
        last = m.index + m[0].length;
      }
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      return out;
    }
    if (Array.isArray(node.children)) {
      node.children = node.children.flatMap(visit);
    }
    return [node];
  };
  tree.children = tree.children.flatMap(visit);
});

const highlightSchema = $markSchema('highlight', () => ({
  parseDOM: [{ tag: 'mark' }],
  toDOM: () => ['mark', 0],
  parseMarkdown: {
    match: (node) => node.type === 'highlight',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark, node) => {
      state.addNode('text', undefined, '==');
      state.addNode('text', undefined, node.text || '');
      state.addNode('text', undefined, '==');
    }
  }
}));

const toggleHighlightCommand = $command('ToggleHighlight', (ctx) => () => {
  return toggleMark(highlightSchema.type(ctx));
});

const commandResolvers = {
  'paragraph': () => ({ key: turnIntoTextCommand.key }),
  'heading-1': () => ({ key: wrapInHeadingCommand.key, payload: 1 }),
  'heading-2': () => ({ key: wrapInHeadingCommand.key, payload: 2 }),
  'heading-3': () => ({ key: wrapInHeadingCommand.key, payload: 3 }),
  'heading-4': () => ({ key: wrapInHeadingCommand.key, payload: 4 }),
  'heading-5': () => ({ key: wrapInHeadingCommand.key, payload: 5 }),
  'heading-6': () => ({ key: wrapInHeadingCommand.key, payload: 6 }),
  bold: () => ({ key: toggleStrongCommand.key }),
  italic: () => ({ key: toggleEmphasisCommand.key }),
  quote: () => ({ key: wrapInBlockquoteCommand.key }),
  bullet: () => ({ key: wrapInBulletListCommand.key }),
  ordered: () => ({ key: wrapInOrderedListCommand.key }),
  code: () => ({ key: toggleInlineCodeCommand.key }),
  codeblock: () => ({ key: createCodeBlockCommand.key, payload: '' }),
  hr: () => ({ key: insertHrCommand.key }),
  'task-list': () => ({ key: turnIntoTaskListCommand.key }),
  strikethrough: () => ({ key: toggleStrikethroughCommand.key }),
  highlight: () => ({ key: toggleHighlightCommand.key }),
  link: () => ({ key: insertLinkCommand.key }),
  image: () => ({ key: insertImageBlockCommand.key }),
  'internal-link': () => ({ key: insertInternalLinkCommand.key }),
  table: (options = {}) => ({
    key: insertTableCommand.key,
    payload: {
      row: normalizeTableDimension(options.row ?? options.rows ?? 3, 3),
      col: normalizeTableDimension(options.col ?? options.cols ?? 3, 3)
    }
  }),
  'table-add-row-before': () => ({ key: addRowBeforeCommand.key }),
  'table-add-row-after': () => ({ key: addRowAfterCommand.key }),
  'table-add-col-before': () => ({ key: addColBeforeCommand.key }),
  'table-add-col-after': () => ({ key: addColAfterCommand.key }),
  'table-delete-row': () => ({ key: deleteSelectedCellsCommand.key }),
  'table-delete-col': () => ({ key: deleteSelectedCellsCommand.key }),
  'table-delete-selection': () => ({ key: deleteSelectedCellsCommand.key }),
  'table-align-left': () => ({ key: setAlignCommand.key, payload: 'left' }),
  'table-align-center': () => ({ key: setAlignCommand.key, payload: 'center' }),
  'table-align-right': () => ({ key: setAlignCommand.key, payload: 'right' }),
  undo: () => ({ key: undoCommand.key }),
  redo: () => ({ key: redoCommand.key })
};
const findHighlightPluginKey = new PluginKey('STUDY_FIND_HIGHLIGHTS');
const knowledgePointHighlightPluginKey = new PluginKey('STUDY_KNOWLEDGE_POINT_HIGHLIGHTS');

function findAncestorOfType($pos, typeNames) {
  const names = typeNames instanceof Set ? typeNames : new Set(typeNames);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (names.has(node.type.name)) {
      return {
        depth,
        node,
        pos: $pos.before(depth)
      };
    }
  }

  return null;
}

function isSelectionInsideSingleTextblock(state, typeName, attrs = null) {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent || $from.parent.type.name !== typeName) {
    return false;
  }

  if (!attrs) {
    return true;
  }

  return Object.entries(attrs).every(([key, value]) => $from.parent.attrs?.[key] === value);
}

function toggleParagraph(editor, schema) {
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!paragraphNodeType) {
    return false;
  }

  return executeCallCommand(editor, setBlockTypeCommand.key, {
    nodeType: paragraphNodeType,
    attrs: null
  });
}

function setHeadingLevel(editor, schema, level) {
  const headingNodeType = getNodeFromSchema('heading', schema);
  if (!headingNodeType) {
    return false;
  }

  return executeCallCommand(editor, setBlockTypeCommand.key, {
    nodeType: headingNodeType,
    attrs: { level }
  });
}

function executeCallCommand(editor, key, payload) {
  return editor.action(callCommand(key, payload));
}

async function handleHeadingShortcut(editor, level) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);

  if (isSelectionInsideSingleTextblock(view.state, 'heading', { level })) {
    return toggleParagraph(editor, schema);
  }

  return setHeadingLevel(editor, schema, level);
}

async function handleParagraphShortcut(editor) {
  const schema = editor.ctx.get(schemaCtx);
  return toggleParagraph(editor, schema);
}

async function handleListShortcut(editor, commandKey) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const targetTypeName = commandKey === 'ordered' ? 'ordered_list' : 'bullet_list';
  const otherTypeName = commandKey === 'ordered' ? 'bullet_list' : 'ordered_list';
  const targetNodeType = getNodeFromSchema(targetTypeName, schema);
  const listAncestor = findAncestorOfType(view.state.selection.$from, new Set(['bullet_list', 'ordered_list']));

  if (!targetNodeType) {
    return false;
  }

  if (listAncestor?.node.type.name === targetTypeName) {
    return executeCallCommand(editor, liftListItemCommand.key);
  }

  if (listAncestor?.node.type.name === otherTypeName) {
    const attrs = targetTypeName === 'ordered_list'
      ? { order: 1, spread: listAncestor.node.attrs?.spread ?? false }
      : { spread: listAncestor.node.attrs?.spread ?? false };
    const tr = view.state.tr.setNodeMarkup(listAncestor.pos, targetNodeType, attrs);
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  const wrapCommand = commandKey === 'ordered' ? wrapInOrderedListCommand.key : wrapInBulletListCommand.key;
  return executeCallCommand(editor, wrapCommand);
}

async function handleIndentShortcut(editor) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const { $from } = view.state.selection;

  const tableAncestor = findAncestorOfType($from, new Set(['table', 'table_cell', 'table_header']));
  const listItemAncestor = findAncestorOfType($from, new Set(['list_item']));
  const blockquoteAncestor = findAncestorOfType($from, new Set(['blockquote']));
  const behavior = resolveIndentBehavior({
    direction: 'in',
    inTable: Boolean(tableAncestor),
    inListItem: Boolean(listItemAncestor),
    inBlockquote: Boolean(blockquoteAncestor),
    parentType: $from.parent.type.name
  });

  if (behavior === 'table-navigation') {
    return false;
  }

  if (behavior === 'insert-code-indent') {
    return insertTextIndent(view);
  }

  if (behavior === 'sink-list-item') {
    const listItemNode = listItemAncestor.node;
    const parent = $from.parent;
    const isContinuation = parent.type.name === 'paragraph'
      && listItemNode.firstChild !== parent
      && listItemNode.childCount > 1;

    if (isContinuation) {
      return indentContinuationParagraph(editor, view, schema, $from, listItemAncestor);
    }

    return executeCallCommand(editor, sinkListItemCommand.key);
  }

  if (behavior === 'deepen-blockquote') {
    return executeCallCommand(editor, wrapInBlockquoteCommand.key);
  }

  if (behavior === 'indent-textblock') {
    return insertTextIndent(view);
  }

  return false;
}

function insertTextIndent(view) {
  const { state } = view;
  const tr = state.tr.insertText('    ', state.selection.from, state.selection.to);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function removeTextIndent(view) {
  const { state } = view;
  const { $from } = state.selection;
  const text = $from.parent.textContent;
  const lineStartOffset = text.lastIndexOf('\n', Math.max(0, $from.parentOffset - 1)) + 1;
  const removable = text.slice(lineStartOffset, lineStartOffset + 4).match(/^( {1,4}|\t)/)?.[0] ?? '';

  if (!removable) {
    return false;
  }

  const lineStartPos = $from.start() + lineStartOffset;
  const tr = state.tr.delete(lineStartPos, lineStartPos + removable.length);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/**
 * Tab 在续写段落上 → 将其转为嵌套列表项
 *
 * 转换前：                      转换后：
 * - Item 1                     - Item 1
 *   continuation (cursor)        - continuation (cursor)
 */
function indentContinuationParagraph(editor, view, schema, $from, listItemAncestor) {
  const bulletListNodeType = getNodeFromSchema('bullet_list', schema);
  const listItemNodeType = getNodeFromSchema('list_item', schema);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!bulletListNodeType || !listItemNodeType || !paragraphNodeType) {
    return false;
  }

  const listItemNode = listItemAncestor.node;
  const listItemPos = listItemAncestor.pos;

  // 找出续写段落在 list_item 中的索引
  let childIndex = -1;
  listItemNode.forEach((child, offset, index) => {
    if (child === $from.parent) childIndex = index;
  });
  if (childIndex <= 0) return false;

  // 找到续写段落之后是否已有嵌套列表（紧跟在续写段落后的 bullet_list/ordered_list）
  let existingNestedList = null;
  let existingNestedIndex = -1;
  listItemNode.forEach((child, offset, index) => {
    if (index > childIndex && (child.type.name === 'bullet_list' || child.type.name === 'ordered_list')) {
      if (!existingNestedList) {
        existingNestedList = child;
        existingNestedIndex = index;
      }
    }
  });

  // 重建 list_item 的子节点
  const newChildren = [];
  let cursorTarget = -1;

  listItemNode.forEach((child, offset, index) => {
    if (index < childIndex) {
      // 续写段落之前的内容：保留
      newChildren.push(child);
    } else if (index === childIndex) {
      // 续写段落：转为嵌套列表项
      const newContParagraph = paragraphNodeType.create(null, child.content);
      const newContItem = listItemNodeType.create({}, [newContParagraph]);

      if (existingNestedList) {
        // 已有嵌套列表 → 将新列表项追加到其中
        const extendedChildren = [];
        existingNestedList.forEach((nestedChild) => extendedChildren.push(nestedChild));
        extendedChildren.push(newContItem);
        const extendedList = existingNestedList.type.create(existingNestedList.attrs, extendedChildren);
        newChildren.push(extendedList);
        cursorTarget = newChildren.length - 1;
      } else {
        // 无嵌套列表 → 创建新的
        const newBulletList = bulletListNodeType.create(null, [newContItem]);
        newChildren.push(newBulletList);
        cursorTarget = newChildren.length - 1;
      }
    } else if (index !== existingNestedIndex) {
      // 续写段落之后的其他内容（不包括已被替换的嵌套列表）
      newChildren.push(child);
    }
  });

  // 重建整个 list_item 并替换
  const newListItem = listItemNodeType.create(listItemNode.attrs, newChildren);
  const listItemEnd = listItemPos + listItemNode.nodeSize;

  let tr = view.state.tr.replaceRangeWith(listItemPos, listItemEnd, newListItem);

  // 计算光标位置
  // cursorTarget 指向新添加的嵌套列表，其中第一个 list_item 是目标位置
  let accumulated = listItemPos + 1;
  for (let i = 0; i < cursorTarget; i++) {
    accumulated += newListItem.child(i).nodeSize;
  }
  // cursorTarget 是一个嵌套列表，进入其第一个子项
  const nestedList = newListItem.child(cursorTarget);
  accumulated += 1; // 进入嵌套列表

  tr = tr.setSelection(TextSelection.create(tr.doc, accumulated)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}

async function handleOutdentShortcut(editor) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const { $from } = view.state.selection;

  const tableAncestor = findAncestorOfType($from, new Set(['table', 'table_cell', 'table_header']));
  const listItemAncestor = findAncestorOfType($from, new Set(['list_item']));
  const blockquoteAncestor = findAncestorOfType($from, new Set(['blockquote']));
  const behavior = resolveIndentBehavior({
    direction: 'out',
    inTable: Boolean(tableAncestor),
    inListItem: Boolean(listItemAncestor),
    inBlockquote: Boolean(blockquoteAncestor),
    parentType: $from.parent.type.name
  });

  if (behavior === 'table-navigation') {
    return false;
  }

  if (behavior === 'remove-code-indent') {
    return removeTextIndent(view);
  }

  if (behavior === 'lift-list-item') {
    const listItemNode = listItemAncestor.node;
    const parent = $from.parent;
    const isContinuation = parent.type.name === 'paragraph'
      && listItemNode.firstChild !== parent
      && listItemNode.childCount > 1;

    if (isContinuation) {
      return outdentContinuationParagraph(editor, view, schema, $from, listItemAncestor);
    }

    return executeCallCommand(editor, liftListItemCommand.key);
  }

  if (behavior === 'lift-block') {
    return lift(view.state, (tr) => {
      view.dispatch(tr.scrollIntoView());
    });
  }

  if (behavior === 'outdent-textblock') {
    return removeTextIndent(view);
  }

  return false;
}

/**
 * Shift+Tab 在续写段落上 → 从当前 list_item 分割为独立列表项
 *
 * 转换前：                      转换后：
 * - Item 1                     - Item 1
 *   continuation (cursor)      - continuation (cursor)
 */
function outdentContinuationParagraph(editor, view, schema, $from, listItemAncestor) {
  const listItemNodeType = getNodeFromSchema('list_item', schema);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!listItemNodeType || !paragraphNodeType) return false;

  const listItemNode = listItemAncestor.node;
  const listItemPos = listItemAncestor.pos;

  // 找到续写段落在 list_item 中的索引
  let childIndex = -1;
  listItemNode.forEach((child, offset, index) => {
    if (child === $from.parent) childIndex = index;
  });
  if (childIndex <= 0) return false;

  // 找到父级 bullet_list/ordered_list
  const parentList = findAncestorOfType($from, new Set(['bullet_list', 'ordered_list']));
  if (!parentList) return false;

  // 重建父列表的子节点列表，在当前位置分割续写段落
  const parentListChildren = [];
  let cursorTarget = -1;

  parentList.node.forEach((child) => {
    if (child === listItemNode) {
      // 当前 list_item：只保留续写段落之前的子节点
      const keptChildren = [];
      child.forEach((grandchild, offset, index) => {
        if (index < childIndex) {
          keptChildren.push(grandchild);
        }
      });
      parentListChildren.push(listItemNodeType.create(child.attrs, keptChildren));

      // 创建新列表项，包含续写段落
      const contContent = [paragraphNodeType.create(null, $from.parent.content)];
      parentListChildren.push(listItemNodeType.create({}, contContent));

      cursorTarget = parentListChildren.length - 1;
    } else {
      parentListChildren.push(child);
    }
  });

  // 重建整个父列表并替换
  const newParentList = parentList.node.type.create(parentList.node.attrs, parentListChildren);
  const parentListEnd = parentList.pos + parentList.node.nodeSize;

  let tr = view.state.tr.replaceRangeWith(parentList.pos, parentListEnd, newParentList);

  // 计算光标在新建列表项中的位置
  let cursorPos = parentList.pos + 1;
  for (let i = 0; i < cursorTarget; i++) {
    cursorPos += newParentList.child(i).nodeSize;
  }
  cursorPos += 1; // 进入新列表项内部

  tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}

async function insertBlockBelowSelection(editor, commandKey, options = {}) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  const resolve = commandResolvers[commandKey];

  if (!paragraphNodeType || !resolve) {
    return false;
  }

  if (!insertParagraphBelowSelection(view, paragraphNodeType)) {
    return false;
  }

  const { key, payload } = resolve(options);
  const result = await editor.action(callCommand(key, payload));
  syncTableHandleLabels(editor.ctx.get(rootCtx), null);
  view.focus();
  return result;
}

function insertParagraphBelowSelection(view, paragraphNodeType) {
  if (!paragraphNodeType) {
    return false;
  }

  const { state } = view;
  const { $from } = state.selection;
  const tableAncestor = findAncestorOfType($from, new Set(['table']));
  let blockDepth = tableAncestor?.depth ?? $from.depth;

  while (blockDepth > 0 && !tableAncestor && !$from.node(blockDepth).isTextblock) {
    blockDepth -= 1;
  }

  if (blockDepth <= 0) {
    return false;
  }

  const insertPos = $from.after(blockDepth);
  const tr = state.tr.insert(insertPos, paragraphNodeType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

async function insertParagraphNearSelection(editor, direction) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!paragraphNodeType) {
    return false;
  }

  const { $from } = view.state.selection;
  let textblockDepth = $from.depth;
  while (textblockDepth > 0 && !$from.node(textblockDepth).isTextblock) {
    textblockDepth -= 1;
  }

  if (textblockDepth <= 0) {
    return false;
  }

  const insertPos = direction === 'above'
    ? $from.before(textblockDepth)
    : $from.after(textblockDepth);
  const tr = view.state.tr.insert(insertPos, paragraphNodeType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function normalizeMarkdown(markdown) {
  return typeof markdown === 'string' ? markdown : '';
}

function parseMarkdownSlice(ctx, markdown) {
  const text = normalizeMarkdown(markdown);
  if (!text) {
    return null;
  }

  const parser = ctx.get(parserCtx);
  const parsed = parser(text);
  if (!parsed || typeof parsed === 'string') {
    return null;
  }

  let content = parsed.content;
  while (content.size > 0) {
    const first = content.firstChild;
    if (first && first.type.name === 'paragraph' && first.textContent.trim() === '') {
      content = content.cut(first.nodeSize);
    } else {
      break;
    }
  }
  while (content.size > 0) {
    const last = content.lastChild;
    if (last && last.type.name === 'paragraph' && last.textContent.trim() === '') {
      content = content.cut(0, content.size - last.nodeSize);
    } else {
      break;
    }
  }

  return new Slice(content, 0, 0);
}

const markdownPasteBehavior = $prose((ctx) => new Plugin({
  key: new PluginKey('STUDY_MARKDOWN_PASTE_BEHAVIOR'),
  props: {
    handlePaste(view, event, preProcessedSlice) {
      const clipboardData = event.clipboardData;
      if (!clipboardData || view.state.selection.$from.parent.type.spec.code) {
        return false;
      }

      const html = clipboardData.getData('text/html');
      if (html) {
        const cleanedSlice = removeSpuriousEmptyCodeBlocks(preProcessedSlice);
        if (cleanedSlice !== preProcessedSlice) {
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelection(cleanedSlice).scrollIntoView());
          return true;
        }
        return false;
      }

      const text = clipboardData.getData('text/plain');
      const vscodeData = clipboardData.getData('vscode-editor-data');
      if (!shouldPreferPlainMarkdown({ text, vscodeData })) {
        return false;
      }

      const slice = parseMarkdownSlice(ctx, text);
      if (!slice) {
        return false;
      }

      event.preventDefault();
      view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
      return true;
    }
  }
}));

function getLastTextblockInfo(doc) {
  let lastBlock = null;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      lastBlock = { node, pos };
    }
  });
  return lastBlock;
}

function getTrailingBlankCount(doc) {
  const textblocks = [];
  doc.descendants((node) => {
    if (node.isTextblock) {
      textblocks.push(node);
    }
  });

  let count = 0;
  for (let index = textblocks.length - 1; index >= 0; index -= 1) {
    const node = textblocks[index];
    if (node.type.name !== 'paragraph' || node.textContent.trim().length > 0) {
      break;
    }
    count += 1;
  }

  return count;
}

function getStructuredContext($from) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const typeName = $from.node(depth).type.name;
    if (typeName === 'code_block' || typeName === 'list_item' || typeName === 'blockquote') {
      return { type: typeName, depth };
    }
  }

  return null;
}

function getCurrentLineText(textContent, parentOffset) {
  const nextBreak = textContent.indexOf('\n', parentOffset);
  const lineEnd = nextBreak === -1 ? textContent.length : nextBreak;
  const previousBreak = textContent.lastIndexOf('\n', Math.max(0, parentOffset - 1));
  const lineStart = previousBreak === -1 ? 0 : previousBreak + 1;
  return textContent.slice(lineStart, lineEnd);
}

function exitCodeBlock(view, paragraphNodeType, depth) {
  if (!paragraphNodeType) {
    return false;
  }

  const { state } = view;
  const insertPos = state.selection.$from.after(depth);
  const tr = state.tr.insert(insertPos, paragraphNodeType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));

  view.dispatch(tr.scrollIntoView());
  return true;
}

function exitTableWithParagraph(view, paragraphNodeType, depth) {
  if (!paragraphNodeType || typeof depth !== 'number') {
    return false;
  }

  const { state } = view;
  const insertPos = state.selection.$from.after(depth);
  const tr = state.tr.insert(insertPos, paragraphNodeType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function handleTrailingBlankEnter(view, paragraphNodeType) {
  if (!paragraphNodeType) {
    return false;
  }

  let nextTransaction = null;
  const didSplit = splitBlock(view.state, (tr) => {
    nextTransaction = tr;
  });

  if (!didSplit || !nextTransaction) {
    return false;
  }

  const selectionPos = nextTransaction.selection.from;
  const insertPos = nextTransaction.selection.$from.after(nextTransaction.selection.$from.depth);
  nextTransaction.insert(insertPos, paragraphNodeType.create());
  nextTransaction.setSelection(TextSelection.create(nextTransaction.doc, selectionPos));
  view.dispatch(nextTransaction.scrollIntoView());
  return true;
}

function handleStructuredBackspace(view) {
  const { state } = view;
  if (!state.selection.empty || !state.selection.$from.parent.isTextblock) {
    return false;
  }

  const { $from } = state.selection;
  const structuredContext = getStructuredContext($from);
  const parentType = structuredContext?.type ?? $from.parent.type.name;
  const parentIsBlank = structuredContext?.type === 'code_block'
    ? getCurrentLineText($from.parent.textContent, $from.parentOffset).trim().length === 0
    : $from.parent.textContent.trim().length === 0;
  const behavior = resolveBackspaceBehavior({
    parentType,
    parentIsBlank,
    atLineStart: $from.parentOffset === 0
  });

  if (behavior !== 'exit-structured-block') {
    return false;
  }

  return liftEmptyBlock(state, (tr) => {
    view.dispatch(tr.scrollIntoView());
  });
}

const enhancedEnterBehavior = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);

  return new Plugin({
    key: new PluginKey('STUDY_ENHANCED_ENTER_BEHAVIOR'),
    props: {
      handleKeyDown(view, event) {
        if (
          event.key === 'Backspace'
          && !event.shiftKey
          && !event.altKey
          && !event.metaKey
          && !event.ctrlKey
        ) {
          const handled = handleStructuredBackspace(view);
          if (handled) {
            event.preventDefault();
          }
          return handled;
        }

        if (
          event.key !== 'Enter'
          || event.shiftKey
          || event.altKey
          || event.metaKey
          || event.ctrlKey
        ) {
          return false;
        }

        const { state } = view;
        if (!state.selection.empty || !state.selection.$from.parent.isTextblock) {
          return false;
        }

        const { $from } = state.selection;
        const tableAncestor = findAncestorOfType($from, new Set(['table']));
        if (tableAncestor) {
          event.preventDefault();
          return exitTableWithParagraph(view, paragraphNodeType, tableAncestor.depth);
        }

        const structuredContext = getStructuredContext($from);
        const parentType = structuredContext?.type ?? $from.parent.type.name;
        const parentIsBlank = structuredContext?.type === 'code_block'
          ? getCurrentLineText($from.parent.textContent, $from.parentOffset).trim().length === 0
          : $from.parent.textContent.trim().length === 0;
        const behavior = resolveEnterBehavior({ parentType, parentIsBlank });

        if (behavior === 'exit-structured-block') {
          if (structuredContext?.type === 'code_block') {
            event.preventDefault();
            return exitCodeBlock(view, paragraphNodeType, structuredContext.depth);
          }

          const lifted = liftEmptyBlock(state, (tr) => {
            view.dispatch(tr.scrollIntoView());
          });
          if (lifted) {
            event.preventDefault();
          }
          return lifted;
        }

        const lastTextblock = getLastTextblockInfo(state.doc);
        const currentBlockPos = $from.before($from.depth);
        const shouldAppendTrailingBlank = shouldKeepTrailingBlank({
          docIsEmpty: state.doc.textContent.trim().length === 0,
          atDocEnd: (
            $from.parentOffset === $from.parent.content.size
            && lastTextblock?.pos === currentBlockPos
          ),
          currentBlockIsBlank: $from.parent.textContent.trim().length === 0,
          trailingBlankCount: getTrailingBlankCount(state.doc),
          parentType: $from.parent.type.name
        });

        if (!shouldAppendTrailingBlank) {
          return false;
        }

        event.preventDefault();
        return handleTrailingBlankEnter(view, paragraphNodeType);
      }
    }
  });
});

const findHighlightBehavior = $prose(() => new Plugin({
  key: findHighlightPluginKey,
  state: {
    init: () => ({
      query: '',
      activeIndex: -1,
      decorations: DecorationSet.empty
    }),
    apply(transaction, pluginState) {
      const meta = transaction.getMeta(findHighlightPluginKey);
      const query = typeof meta?.query === 'string' ? meta.query : pluginState.query;
      const activeIndex = typeof meta?.activeIndex === 'number' ? meta.activeIndex : pluginState.activeIndex;

      if (!meta && !transaction.docChanged) {
        return pluginState;
      }

      return {
        query,
        activeIndex,
        decorations: buildFindDecorations(transaction.doc, query, activeIndex)
      };
    }
  },
  props: {
    decorations(state) {
      return findHighlightPluginKey.getState(state)?.decorations ?? null;
    }
  }
}));

const knowledgePointHighlightBehavior = $prose(() => new Plugin({
  key: knowledgePointHighlightPluginKey,
  state: {
    init: () => ({
      sources: [],
      activeSourceId: null,
      decorations: DecorationSet.empty
    }),
    apply(transaction, pluginState) {
      const meta = transaction.getMeta(knowledgePointHighlightPluginKey);
      const sources = Array.isArray(meta?.sources)
        ? normalizeKnowledgePointSources(meta.sources)
        : pluginState.sources;
      const activeSourceId = Object.hasOwn(meta ?? {}, 'activeSourceId')
        ? meta.activeSourceId
        : pluginState.activeSourceId;

      if (!meta && !transaction.docChanged) {
        return pluginState;
      }

      return {
        sources,
        activeSourceId,
        decorations: buildKnowledgePointDecorations(transaction.doc, sources, activeSourceId)
      };
    }
  },
  props: {
    decorations(state) {
      return knowledgePointHighlightPluginKey.getState(state)?.decorations ?? null;
    },
    handleDOMEvents: {
      click(view, event) {
        const target = event.target instanceof Element ? event.target : null;
        const marker = target?.closest?.('[data-knowledge-point-source-id]');
        if (!marker) {
          return false;
        }

        event.preventDefault();
        view.dom.dispatchEvent(new CustomEvent('knowledge-point-marker-click', {
          bubbles: true,
          detail: {
            sourceId: marker.dataset.knowledgePointSourceId,
            knowledgePointId: marker.dataset.knowledgePointId
          }
        }));
        return true;
      }
    }
  }
}));

const taskListClickBehavior = $prose(() => new Plugin({
  key: new PluginKey('STUDY_TASK_LIST_CLICK'),
  props: {
    handleDOMEvents: {
      mousedown(view, event) {
        if (!(event.target instanceof HTMLElement)) return false;

        const li = event.target.closest('li[data-item-type="task"]');
        if (!li) return false;

        // 检查点击位置是否在复选框区域（左侧 padding 范围内）
        const liRect = li.getBoundingClientRect();
        const clickX = event.clientX - liRect.left;
        const checkboxZone = parseFloat(getComputedStyle(li).paddingLeft) || (1.8 * 16);
        if (clickX < 0 || clickX > checkboxZone) {
          return false; // 点击在文本区域，不拦截
        }

        // 阻止文本选择（包括双击快速点击时）
        event.preventDefault();

        // 执行切换
        const domPos = view.posAtDOM(li, 0);
        if (typeof domPos !== 'number') return true;

        const resolvedPos = view.state.doc.resolve(domPos);
        let depth = Math.min(resolvedPos.depth, 20);
        while (depth > 0 && resolvedPos.node(depth).type.name !== 'list_item') {
          depth -= 1;
        }
        if (depth <= 0) return true;

        const listItemNode = resolvedPos.node(depth);
        const currentChecked = listItemNode.attrs.checked;
        const newChecked = currentChecked === true ? false : true;

        view.dispatch(view.state.tr.setNodeMarkup(
          resolvedPos.before(depth), undefined,
          { ...listItemNode.attrs, checked: newChecked }
        ));
        return true; // 阻止 ProseMirror 进一步处理
      }
    }
  }
}));

export class MilkdownHost {
  constructor({ root, markdown = '', onChange, noteId = null } = {}) {
    if (!(root instanceof HTMLElement)) {
      throw new Error('MilkdownHost requires a valid root element.');
    }

    this.root = root;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.noteId = typeof noteId === 'string' && noteId.trim() ? noteId.trim() : null;
    this.editor = null;
    this.imageLayoutObserver = null;
    this.imageLayoutRefreshFrame = 0;
    this.imageLayoutLastWidth = 0;
    this.tableHandleController = null;
    this.ready = this.mount(normalizeMarkdown(markdown));
  }

  async mount(markdown) {
    const host = this;

    this.editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.root);
        ctx.set(defaultValueCtx, markdown);
        ctx.set(imageBlockConfig.key, {
          ...defaultImageBlockConfig,
          uploadButton: '上传',
          uploadPlaceholderText: '或粘贴图片链接',
          confirmButton: `
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.2 6.4 11l6.1-6.2"></path>
            </svg>
          `,
          onUpload: async (file) => host.uploadAttachmentImage(file)
        });
        ctx.set(tableBlockConfig.key, {
          renderButton: renderTableButton
        });
        ctx.get(listenerCtx).markdownUpdated((listenerCtxValue, nextMarkdown) => {
          host.onChange?.(nextMarkdown, listenerCtxValue);
        });
      })
      .use(commonmark)
      .use(listener)
      .use(history)
      .use(markdownPasteBehavior)
      .use(clipboard)
      .use(gfm)
      .use(insertLinkCommand)
      .use(insertImageBlockCommand)
      .use(insertInternalLinkCommand)
      .use(turnIntoTaskListCommand)
      .use(enhancedImageBlockComponent)
      .use(tableBlock)
      .use(enhancedEnterBehavior)
      .use(findHighlightBehavior)
      .use(knowledgePointHighlightBehavior)
      .use(taskListClickBehavior)
      .use(highlightRemark)
      .use(highlightSchema);

    await this.editor.create();
    this.root.dataset.editorReady = 'true';
    this.attachImageLayoutObserver();
    this.attachTableHandleController();
    syncTableHandleLabels(this.root, this);
    this.scheduleImageLayoutRefresh();
    return this;
  }

  async setMarkdown(markdown) {
    await this.ready;
    this.editor.action(replaceAll(normalizeMarkdown(markdown), true));
    syncTableHandleLabels(this.root, this);
    this.tableHandleController?.queueSyncPinnedHandles();
  }

  async getMarkdown() {
    await this.ready;
    return this.editor.action(getMarkdown());
  }

  async run(commandKey, options = {}) {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    if (resolveBlockCommandBehavior(commandKey) === 'insert-below-current-block') {
      return insertBlockBelowSelection(this.editor, commandKey, options);
    }

    if (commandKey === 'paragraph-above') {
      return insertParagraphNearSelection(this.editor, 'above');
    }
    if (commandKey === 'paragraph-below') {
      return insertParagraphNearSelection(this.editor, 'below');
    }
    if (commandKey === 'indent') {
      return handleIndentShortcut(this.editor);
    }
    if (commandKey === 'outdent') {
      return handleOutdentShortcut(this.editor);
    }
    if (commandKey === 'paragraph') {
      return handleParagraphShortcut(this.editor);
    }
    if (commandKey.startsWith('heading-')) {
      const level = Number(commandKey.split('-')[1]);
      if (Number.isInteger(level) && level >= 1 && level <= 6) {
        return handleHeadingShortcut(this.editor, level);
      }
    }
    if (commandKey === 'bullet' || commandKey === 'ordered') {
      return handleListShortcut(this.editor, commandKey);
    }

    const resolve = commandResolvers[commandKey];
    if (!resolve) {
      return false;
    }

    const { key, payload } = resolve(options);
    const result = await this.editor.action(callCommand(key, payload));
    syncTableHandleLabels(this.root, this);
    this.tableHandleController?.queueSyncPinnedHandles();
    view.focus();
    return result;
  }

  async focus() {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.focus();
  }

  async getSelectionSnapshot({ contextChars = 80 } = {}) {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    const { selection, doc } = view.state;
    if (selection.empty) {
      return null;
    }

    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const sourceText = doc.textBetween(from, to, '\n', '\n').replace(/\s+/g, ' ').trim();
    if (!sourceText) {
      return null;
    }

    const contextBefore = doc
      .textBetween(Math.max(0, from - contextChars), from, '\n', '\n')
      .replace(/\s+/g, ' ')
      .slice(-contextChars);
    const contextAfter = doc
      .textBetween(to, Math.min(doc.content.size, to + contextChars), '\n', '\n')
      .replace(/\s+/g, ' ')
      .slice(0, contextChars);

    return {
      sourceText,
      startOffset: from,
      endOffset: to,
      contextBefore,
      contextAfter,
      anchor: {
        type: 'prosemirror-text-range',
        from,
        to
      }
    };
  }

  repairTableAfterDelete(pinnedSnapshot) {
    if (!this.editor || !pinnedSnapshot) {
      return false;
    }

    const repaired = ensureTableHasHeaderRowAtPos(this.editor, pinnedSnapshot.tablePos);
    if (repaired) {
      syncTableHandleLabels(this.root, this);
      this.tableHandleController?.queueSyncPinnedHandles();
    }
    return repaired;
  }

  attachTableHandleController() {
    this.tableHandleController = new TableHandleController(this);
    this.tableHandleController.attach();
  }

  attachImageLayoutObserver() {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.disconnectImageLayoutObserver();
    const observedWidth = Math.round(this.root.getBoundingClientRect().width);
    this.imageLayoutLastWidth = observedWidth > 0 ? observedWidth : 0;

    this.imageLayoutObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const width = Math.round(entry.contentRect.width);
      if (width <= 0 || width === this.imageLayoutLastWidth) {
        return;
      }

      this.imageLayoutLastWidth = width;
      this.scheduleImageLayoutRefresh();
    });

    this.imageLayoutObserver.observe(this.root);
  }

  disconnectImageLayoutObserver() {
    if (this.imageLayoutRefreshFrame) {
      window.cancelAnimationFrame(this.imageLayoutRefreshFrame);
      this.imageLayoutRefreshFrame = 0;
    }

    if (this.imageLayoutObserver) {
      this.imageLayoutObserver.disconnect();
      this.imageLayoutObserver = null;
    }
  }

  scheduleImageLayoutRefresh() {
    if (this.imageLayoutRefreshFrame) {
      return;
    }

    this.imageLayoutRefreshFrame = window.requestAnimationFrame(() => {
      this.imageLayoutRefreshFrame = 0;
      this.refreshImageBlockLayouts();
    });
  }

  refreshImageBlockLayouts() {
    syncTableHandleLabels(this.root, this);
    const images = this.root.querySelectorAll('.milkdown-image-block img[src]');
    images.forEach((image) => {
      if (!(image instanceof HTMLImageElement)) {
        return;
      }

      if (!image.complete || image.naturalWidth <= 0) {
        return;
      }

      image.dispatchEvent(new Event('load'));
    });
    this.tableHandleController?.queueSyncPinnedHandles();
  }

  async uploadAttachmentImage(file) {
    if (!(file instanceof File)) {
      throw new Error('Image upload requires a file');
    }
    if (!this.noteId) {
      throw new Error('Please select a note before uploading images');
    }

    const contentBase64 = await fileToBase64(file);
    const response = await fetch('/api/storage/attachments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        noteId: this.noteId,
        fileName: file.name || 'image.png',
        mimeType: file.type || 'image/png',
        contentBase64
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '上传图片失败');
    }

    const attachmentId = payload?.data?.id;
    if (!attachmentId) {
      throw new Error('上传图片失败：未返回附件 ID');
    }

    return `/api/storage/attachments/${encodeURIComponent(attachmentId)}/content`;
  }

  async pasteMarkdown(markdown) {
    await this.ready;

    const text = normalizeMarkdown(markdown);
    if (!text) {
      return false;
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const slice = parseMarkdownSlice(this.editor.ctx, text);
    if (!slice) {
      return false;
    }

    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    view.focus();
    return true;
  }

  async selectTextRange({ startNode, startOffset, endNode, endOffset } = {}) {
    await this.ready;

    if (!startNode || !endNode) {
      return false;
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const from = view.posAtDOM(startNode, startOffset ?? 0);
    const to = view.posAtDOM(endNode, endOffset ?? 0);

    if (typeof from !== 'number' || typeof to !== 'number') {
      return false;
    }

    const selection = TextSelection.create(view.state.doc, Math.min(from, to), Math.max(from, to));
    const transaction = view.state.tr.setSelection(selection).scrollIntoView();
    view.dispatch(transaction);
    view.focus();
    return true;
  }

  async findAndSelectNext(query, previousMatchIndex = -1) {
    return this.findAndSelect(query, previousMatchIndex, 'next');
  }

  async findAndSelectPrevious(query, previousMatchIndex = -1) {
    return this.findAndSelect(query, previousMatchIndex, 'previous');
  }

  async findAndSelect(query, previousMatchIndex = -1, direction = 'next') {
    await this.ready;

    const needle = typeof query === 'string' ? query.trim() : '';
    if (!needle) {
      await this.clearSearchHighlights();
      return { found: false, count: 0, index: -1 };
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const matches = collectDocumentTextMatches(view.state.doc, needle);
    if (!matches.length) {
      view.dispatch(
        view.state.tr
          .setMeta(findHighlightPluginKey, { query: needle, activeIndex: -1 })
          .setMeta('addToHistory', false)
      );
      return { found: false, count: 0, index: -1 };
    }

    const index = resolveMatchNavigationIndex({
      currentIndex: previousMatchIndex,
      matchCount: matches.length,
      direction
    });
    const match = matches[index];
    const selection = TextSelection.create(view.state.doc, match.from, match.to);
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(findHighlightPluginKey, { query: needle, activeIndex: index })
        .setMeta('addToHistory', false)
        .scrollIntoView()
    );
    view.focus();

    return {
      found: true,
      count: matches.length,
      index
    };
  }

  async setKnowledgePointSources(sources = []) {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.dispatch(
      view.state.tr
        .setMeta(knowledgePointHighlightPluginKey, {
          sources: normalizeKnowledgePointSources(sources),
          activeSourceId: null
        })
        .setMeta('addToHistory', false)
    );
  }

  async selectKnowledgePointSource(sourceId) {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    const pluginState = knowledgePointHighlightPluginKey.getState(view.state);
    const source = pluginState?.sources?.find((item) => item.id === sourceId);
    if (!source) {
      return false;
    }

    const range = resolveKnowledgePointSourceRange(view.state.doc, source);
    if (!range) {
      return false;
    }

    const selection = TextSelection.create(view.state.doc, range.from, range.to);
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(knowledgePointHighlightPluginKey, {
          sources: pluginState.sources,
          activeSourceId: sourceId
        })
        .setMeta('addToHistory', false)
        .scrollIntoView()
    );
    view.focus();
    return true;
  }

  async clearSearchHighlights() {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.dispatch(
      view.state.tr
        .setMeta(findHighlightPluginKey, { query: '', activeIndex: -1 })
        .setMeta('addToHistory', false)
    );
  }

  async destroy() {
    if (!this.editor) {
      return;
    }

    await this.ready;
    this.disconnectImageLayoutObserver();
    this.tableHandleController?.destroy();
    this.tableHandleController = null;
    await this.editor.destroy();
    this.root.dataset.editorReady = 'false';
    this.editor = null;
  }
}

export function createMilkdownHost(options) {
  return new MilkdownHost(options);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read image file'));
        return;
      }

      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function collectDocumentTextMatches(doc, needle) {
  const matches = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    let startIndex = node.text.indexOf(needle);
    while (startIndex !== -1) {
      const from = pos + startIndex;
      const to = from + needle.length;
      matches.push({ from, to });
      startIndex = node.text.indexOf(needle, startIndex + Math.max(1, needle.length));
    }
  });

  return matches;
}

function buildFindDecorations(doc, query, activeIndex) {
  const needle = typeof query === 'string' ? query.trim() : '';
  if (!needle) {
    return DecorationSet.empty;
  }

  const matches = collectDocumentTextMatches(doc, needle);
  if (!matches.length) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(
    doc,
    matches.map((match, index) => Decoration.inline(match.from, match.to, {
      class: index === activeIndex
        ? 'editor-find-match editor-find-match-active'
        : 'editor-find-match'
    }))
  );
}

function normalizeKnowledgePointSources(sources = []) {
  return sources
    .filter((source) => source?.id && source?.sourceText)
    .map((source) => ({
      id: source.id,
      knowledgePointId: source.knowledgePointId ?? '',
      sourceText: String(source.sourceText ?? '').replace(/\s+/g, ' ').trim(),
      anchor: source.anchor ?? null,
      startOffset: Number.isInteger(source.startOffset) ? source.startOffset : null,
      endOffset: Number.isInteger(source.endOffset) ? source.endOffset : null
    }));
}

function rangeMatchesSource(doc, range, sourceText) {
  if (!range || range.from >= range.to) {
    return false;
  }

  const text = doc.textBetween(range.from, range.to, '\n', '\n').replace(/\s+/g, ' ').trim();
  return text === sourceText;
}

function resolveKnowledgePointSourceRange(doc, source) {
  const anchoredRange = Number.isInteger(source.anchor?.from) && Number.isInteger(source.anchor?.to)
    ? { from: source.anchor.from, to: source.anchor.to }
    : null;
  if (rangeMatchesSource(doc, anchoredRange, source.sourceText)) {
    return anchoredRange;
  }

  const offsetRange = Number.isInteger(source.startOffset) && Number.isInteger(source.endOffset)
    ? { from: source.startOffset, to: source.endOffset }
    : null;
  if (rangeMatchesSource(doc, offsetRange, source.sourceText)) {
    return offsetRange;
  }

  return collectDocumentTextMatches(doc, source.sourceText)[0] ?? null;
}

function buildKnowledgePointDecorations(doc, sources, activeSourceId) {
  const decorations = sources
    .map((source) => {
      const range = resolveKnowledgePointSourceRange(doc, source);
      if (!range) {
        return null;
      }

      return Decoration.inline(range.from, range.to, {
        class: source.id === activeSourceId
          ? 'knowledge-point-marker knowledge-point-marker-active'
          : 'knowledge-point-marker',
        'data-knowledge-point-source-id': source.id,
        'data-knowledge-point-id': source.knowledgePointId,
        title: '知识点原文片段'
      });
    })
    .filter(Boolean);

  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

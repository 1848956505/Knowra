import { Fragment, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { CellSelection, selectedRect } from '@milkdown/kit/prose/tables';
import { Button, Menu, MenuItem, MenuSection, MenuSeparator, PointMenu } from '../../components/ui';
import { getTableControlsState, tableControlCommand, type TableAction, type TableControlsState } from './editorTableModel';
import styles from './EditorTableControls.module.css';
import { TABLE_CONTEXT_EVENT } from './editorTableBehavior';

interface TableItem { action: TableAction; label: string; menuLabel: string; danger?: boolean }

// 工具栏直接露出高频操作（无需先展开菜单）；右键菜单提供完整操作。
const groups: TableItem[][] = [
  [
    { action: 'row-before', label: '↑ 插行', menuLabel: '在上方插入行' }, { action: 'row-after', label: '↓ 插行', menuLabel: '在下方插入行' },
    { action: 'column-before', label: '← 插列', menuLabel: '在左侧插入列' }, { action: 'column-after', label: '→ 插列', menuLabel: '在右侧插入列' }
  ],
  [
    { action: 'align-left', label: '左', menuLabel: '当前列左对齐' }, { action: 'align-center', label: '中', menuLabel: '当前列居中' },
    { action: 'align-right', label: '右', menuLabel: '当前列右对齐' }
  ],
  [
    { action: 'delete-row', label: '删行', menuLabel: '删除当前行', danger: true }, { action: 'delete-column', label: '删列', menuLabel: '删除当前列', danger: true },
    { action: 'delete-table', label: '删表', menuLabel: '删除整个表格', danger: true }
  ]
];
const selectItems: TableItem[] = [
  { action: 'select-row', label: '', menuLabel: '选择当前行' }, { action: 'select-column', label: '', menuLabel: '选择当前列' },
  { action: 'select-table', label: '', menuLabel: '选择整个表格' }
];
const menuGroups: TableItem[][] = [groups[0], selectItems, groups[1], groups[2]];

function isDisabled(action: TableAction, controls: TableControlsState) {
  return action === 'row-before' && controls.row === 0 || action === 'delete-row' && !controls.canDeleteRow || action === 'delete-column' && !controls.canDeleteColumn;
}

function editableView(getView: () => EditorView | null) {
  const view = getView();
  return view && !view.isDestroyed && view.editable ? view : null;
}

export function EditorTableControls({ hostRef, getView }: { hostRef: RefObject<HTMLDivElement | null>; getView(): EditorView | null }) {
  const [controls, setControls] = useState<(TableControlsState & { x: number; y: number }) | null>(null);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const menuOpenedAt = useRef(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const view = editableView(getView);
      const state = view ? getTableControlsState(view.state) : null;
      if (!view || !state) { setControls(null); return; }
      const { tableStart } = selectedRect(view.state);
      const table = view.nodeDOM(tableStart - 1);
      if (!(table instanceof Element)) { setControls(null); return; }
      const rect = table.getBoundingClientRect();
      const scrollRoot = view.dom.closest('[data-editor-scroll-root]');
      const stage = scrollRoot?.getBoundingClientRect();
      const formatToolbar = scrollRoot?.querySelector('[aria-label="笔记格式工具栏"]')?.getBoundingClientRect();
      if (rect.bottom < (stage?.top ?? 0) || rect.top > (stage?.bottom ?? window.innerHeight)) { setControls(null); return; }
      const top = Math.max(stage?.top ?? 0, formatToolbar?.bottom ?? 0) + 8;
      const next = { ...state, x: Math.max(8, Math.min(rect.left, window.innerWidth - 520)), y: Math.max(top, Math.min(rect.top - 40, window.innerHeight - 44)) };
      setControls(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    // 表格内右键：先把光标移到被点击的单元格（已在多选范围内则保持），再弹出操作菜单。
    // 在宿主上原生监听并阻止冒泡，使通用编辑器右键菜单不会同时出现。
    const onContextMenu = (event: MouseEvent) => {
      const view = editableView(getView);
      const target = event.target;
      if (!view || !(target instanceof Element) || !target.closest('td, th') || !view.dom.contains(target)) return;
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!hit) return;
      const { selection } = view.state;
      let inSelection = false;
      if (selection instanceof CellSelection) {
        const $hit = view.state.doc.resolve(hit.pos);
        selection.forEachCell((_, pos) => {
          for (let depth = $hit.depth; depth > 0; depth--) if ($hit.before(depth) === pos) inSelection = true;
        });
      }
      if (!inSelection) {
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))).setMeta('addToHistory', false));
        if (!getTableControlsState(view.state)) return;
      }
      event.preventDefault();
      event.stopPropagation();
      update();
      menuOpenedAt.current = Date.now();
      setMenuPoint({ x: event.clientX, y: event.clientY });
    };
    // selectionchange 跟随鼠标、键盘和 CellSelection；菜单操作后也主动刷新。
    document.addEventListener('selectionchange', update);
    host.addEventListener(TABLE_CONTEXT_EVENT, update);
    host.addEventListener('keyup', update);
    host.addEventListener('pointerup', update);
    host.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      document.removeEventListener('selectionchange', update);
      host.removeEventListener(TABLE_CONTEXT_EVENT, update);
      host.removeEventListener('keyup', update);
      host.removeEventListener('pointerup', update);
      host.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hostRef, getView]);

  const run = useCallback((action: TableAction) => {
    const view = editableView(getView);
    if (!view) return;
    tableControlCommand(action)(view.state, view.dispatch);
    const next = getTableControlsState(view.state);
    setControls(previous => previous && next ? { ...next, x: previous.x, y: previous.y } : null);
    view.focus();
  }, [getView]);

  if (!controls) return null;
  return <>
    {/* 按下时阻止默认行为，避免工具栏抢走正文焦点和选区。 */}
    <div className={styles.toolbar} style={{ left: controls.x, top: controls.y }} data-pdf-exclude="true" data-table-controls="true" role="toolbar" aria-label="表格操作工具栏"
      onMouseDown={event => event.preventDefault()}>
      <span className={styles.count}>{controls.rows} 行 · {controls.columns} 列</span>
      {groups.map((group, index) => <div key={index} className={styles.group} role="group">
        {group.map(({ action, label, menuLabel, danger }) => <Button key={action} size="mini" variant={danger ? 'danger' : 'ghost'} aria-label={menuLabel}
          isDisabled={isDisabled(action, controls)} onPress={() => run(action)}>{label}</Button>)}
      </div>)}
    </div>
    <PointMenu point={menuPoint} onOpenChange={open => { if (!open) setMenuPoint(null); }}>
      <Menu ariaLabel="表格右键菜单" // 菜单可能恰好弹在光标下方，右键松开产生的点击不能触发（尤其是删除）操作。
      onAction={key => { if (Date.now() - menuOpenedAt.current < 300) return; setMenuPoint(null); run(String(key) as TableAction); }}>
        {menuGroups.map((group, index) => <Fragment key={index}>
          {index ? <MenuSeparator /> : null}
          <MenuSection>
            {group.map(({ action, menuLabel, danger }) => <MenuItem key={action} id={action} isDisabled={isDisabled(action, controls)} isDanger={danger}>{menuLabel}</MenuItem>)}
          </MenuSection>
        </Fragment>)}
      </Menu>
    </PointMenu>
  </>;
}
